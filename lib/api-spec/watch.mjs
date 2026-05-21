/**
 * watch.mjs — watches openapi.yaml and re-runs orval on every change.
 * Uses Node.js built-in fs.watch (no extra dependencies).
 *
 * Usage: node lib/api-spec/watch.mjs
 */

import { watch } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEC_FILE = path.join(__dirname, "openapi.yaml");
const ORVAL_CONFIG = path.join(__dirname, "orval.config.ts");

const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED    = "\x1b[31m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";
const NC     = "\x1b[0m";

let running = false;
let queued  = false;
let debounceTimer = null;

function timestamp() {
  return new Date().toLocaleTimeString("id-ID", { hour12: false });
}

function runCodegen() {
  if (running) {
    queued = true;
    console.log(`${DIM}[${timestamp()}] codegen already running — queued next run${NC}`);
    return;
  }

  running = true;
  console.log(`\n${CYAN}[${timestamp()}] openapi.yaml changed — running orval...${NC}`);

  const proc = spawn(
    "pnpm",
    ["exec", "orval", "--config", ORVAL_CONFIG],
    { cwd: __dirname, stdio: "inherit" }
  );

  proc.on("close", (code) => {
    running = false;
    if (code === 0) {
      console.log(`${GREEN}[${timestamp()}] ✔ codegen complete — frontend HMR will pick up changes${NC}`);
    } else {
      console.log(`${RED}[${timestamp()}] ✘ codegen failed (exit ${code}) — fix openapi.yaml and save again${NC}`);
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

// Debounce: editors often emit multiple events per save
function scheduleCodegen() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runCodegen, 300);
}

console.log(`${CYAN}API Spec Watcher${NC}`);
console.log(`${DIM}Watching: ${SPEC_FILE}${NC}`);
console.log(`${DIM}Press Ctrl+C to stop${NC}\n`);

// Run once on startup so the client is always in sync
runCodegen();

// Watch the file
watch(SPEC_FILE, { persistent: true }, (eventType) => {
  if (eventType === "change") {
    scheduleCodegen();
  }
});

// Also watch the directory in case editors replace the file (rename event)
watch(__dirname, { persistent: true }, (eventType, filename) => {
  if (filename === "openapi.yaml") {
    scheduleCodegen();
  }
});

console.log(`${YELLOW}[${timestamp()}] watcher started${NC}`);
