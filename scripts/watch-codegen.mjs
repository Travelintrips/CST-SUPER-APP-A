import { watch } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const openapiFile = path.join(root, "lib", "api-spec", "openapi.yaml");

let debounceTimer = null;
let running = false;

function runCodegen() {
  if (running) return;
  running = true;

  console.log(`\n[codegen] openapi.yaml changed — running orval...`);
  const t0 = Date.now();

  const proc = spawn(
    "pnpm",
    ["--filter", "@workspace/api-spec", "run", "codegen"],
    { cwd: root, stdio: "inherit" }
  );

  proc.on("exit", (code) => {
    running = false;
    if (code === 0) {
      console.log(`[codegen] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — hooks & zod schemas updated`);
    } else {
      console.error(`[codegen] Failed (exit ${code})`);
    }
  });
}

watch(openapiFile, (eventType) => {
  if (eventType !== "change") return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runCodegen, 400);
});

console.log(`[codegen] Watching ${path.relative(root, openapiFile)}`);
console.log(`[codegen] Edit openapi.yaml → hooks & zod schemas auto-regenerate`);
