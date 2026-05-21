/**
 * watch.mjs — watches openapi.yaml and re-runs orval on change.
 * Smart debounce: skips codegen if file content (SHA-256) hasn't changed,
 * so editor auto-saves without real edits never trigger a rebuild.
 *
 * Usage: node lib/api-spec/watch.mjs
 */

import { watch, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEC_FILE  = path.join(__dirname, "openapi.yaml");
const ORVAL_CONFIG = path.join(__dirname, "orval.config.ts");

const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED    = "\x1b[31m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";
const NC     = "\x1b[0m";

// ── Hash helpers ─────────────────────────────────────────────────────────────

function hashFile(filePath) {
  try {
    return createHash("sha256").update(readFileSync(filePath)).digest("hex");
  } catch {
    return null;
  }
}

// Track last hash that successfully triggered codegen
let lastHash = null;

// ── Codegen runner ───────────────────────────────────────────────────────────

let running = false;
let queued  = false;
let debounceTimer = null;

function timestamp() {
  return new Date().toLocaleTimeString("id-ID", { hour12: false });
}

function runCodegen(force = false) {
  // Semantic check: skip if content identical to last successful run
  const currentHash = hashFile(SPEC_FILE);
  if (!force && currentHash !== null && currentHash === lastHash) {
    console.log(`${DIM}[${timestamp()}] openapi.yaml saved but content unchanged — skip${NC}`);
    return;
  }

  if (running) {
    queued = true;
    console.log(`${DIM}[${timestamp()}] codegen already running — queued next run${NC}`);
    return;
  }

  const hashShort = currentHash ? currentHash.slice(0, 8) : "unknown";
  running = true;
  console.log(`\n${CYAN}[${timestamp()}] content changed (${hashShort}…) — running orval...${NC}`);

  const proc = spawn(
    "pnpm",
    ["exec", "orval", "--config", ORVAL_CONFIG],
    { cwd: __dirname, stdio: "inherit" }
  );

  proc.on("close", (code) => {
    running = false;
    if (code === 0) {
      lastHash = currentHash; // only advance hash on success
      console.log(`${GREEN}[${timestamp()}] ✔ codegen complete — frontend HMR will pick up changes${NC}`);
    } else {
      console.log(`${RED}[${timestamp()}] ✘ codegen failed (exit ${code}) — fix openapi.yaml and save again${NC}`);
      // Don't update lastHash so next save retries even if content is same
    }

    if (queued) {
      queued = false;
      runCodegen();
    }
  });

  proc.on("error", (err) => {
    running = false;
    console.error(`${RED}[${timestamp()}] failed to spawn orval: ${err.message}${NC}`);
  });
}

// ── Debounce: editors fire multiple fs events per save ────────────────────────

function scheduleCodegen() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => runCodegen(false), 300);
}

// ── Startup ───────────────────────────────────────────────────────────────────

console.log(`${CYAN}API Spec Watcher${NC}`);
console.log(`${DIM}Watching: ${SPEC_FILE}${NC}`);
console.log(`${DIM}Strategy: SHA-256 hash check (skips auto-saves without real changes)${NC}`);
console.log(`${DIM}Press Ctrl+C to stop${NC}\n`);

// Run once on startup unconditionally so client is always in sync
runCodegen(true);

// Watch the file itself
watch(SPEC_FILE, { persistent: true }, (eventType) => {
  if (eventType === "change") scheduleCodegen();
});

// Also watch the directory for editors that replace files via rename
watch(__dirname, { persistent: true }, (eventType, filename) => {
  if (filename === "openapi.yaml") scheduleCodegen();
});

console.log(`${YELLOW}[${timestamp()}] watcher started${NC}`);
