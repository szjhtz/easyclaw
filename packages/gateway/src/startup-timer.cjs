/**
 * Startup timing preload script.
 *
 * Injected via NODE_OPTIONS="--require .../startup-timer.cjs" by the launcher.
 * Logs timestamps for key startup phases so we can see where time is spent.
 *
 * Output goes to stderr so it doesn't interfere with stdout protocol messages.
 */
"use strict";

const t0 = performance.now();
let requireCount = 0;
let requireTotalMs = 0;
let compileCount = 0;
let compileTotalMs = 0;
let readSyncCount = 0;
let readSyncTotalMs = 0;

function logPhase(label) {
  const elapsed = (performance.now() - t0).toFixed(0);
  process.stderr.write(`[startup-timer] +${elapsed}ms ${label}\n`);
}

logPhase("preload executing");

// ── Hook CJS Module._load to time slow requires ──
const Module = require("module");
const origLoad = Module._load;

Module._load = function timedLoad(request, parent, isMain) {
  requireCount++;
  const start = performance.now();
  const result = origLoad.call(this, request, parent, isMain);
  const dur = performance.now() - start;
  requireTotalMs += dur;
  if (dur > 100) {
    const shortReq =
      request.length > 60 ? "..." + request.slice(-57) : request;
    logPhase(`require("${shortReq}") took ${dur.toFixed(0)}ms`);
  }
  return result;
};

// ── Hook Module._compile to track jiti's code compilation ──
const origCompile = Module.prototype._compile;
Module.prototype._compile = function timedCompile(content, filename) {
  compileCount++;
  const start = performance.now();
  const result = origCompile.call(this, content, filename);
  const dur = performance.now() - start;
  compileTotalMs += dur;
  if (dur > 200) {
    const shortName =
      filename.length > 60 ? "..." + filename.slice(-57) : filename;
    const sizeKB = (content.length / 1024).toFixed(0);
    logPhase(
      `compile("${shortName}") took ${dur.toFixed(0)}ms (${sizeKB}KB)`,
    );
  }
  return result;
};

// ── Hook fs.readFileSync to track jiti's file reads ──
const fs = require("fs");
const origReadFileSync = fs.readFileSync;
fs.readFileSync = function timedReadFileSync(path, options) {
  readSyncCount++;
  const start = performance.now();
  const result = origReadFileSync.call(this, path, options);
  const dur = performance.now() - start;
  readSyncTotalMs += dur;
  if (dur > 50) {
    const p = String(path);
    const shortPath = p.length > 60 ? "..." + p.slice(-57) : p;
    const sizeKB =
      Buffer.isBuffer(result) || typeof result === "string"
        ? (result.length / 1024).toFixed(0)
        : "?";
    logPhase(`readFileSync("${shortPath}") took ${dur.toFixed(0)}ms (${sizeKB}KB)`);
  }
  return result;
};

// Log when the event loop starts processing (= all top-level ESM code done).
setImmediate(() => {
  logPhase(
    `event loop started (${requireCount} requires/${requireTotalMs.toFixed(0)}ms, ${compileCount} compiles/${compileTotalMs.toFixed(0)}ms, ${readSyncCount} reads/${readSyncTotalMs.toFixed(0)}ms)`,
  );

  // Log periodic heartbeats with cumulative stats
  let heartbeat = 0;
  let prevCompiles = compileCount;
  let prevReads = readSyncCount;
  const iv = setInterval(() => {
    heartbeat++;
    const newCompiles = compileCount - prevCompiles;
    const newReads = readSyncCount - prevReads;
    logPhase(
      `heartbeat #${heartbeat} (compiles: +${newCompiles}=${compileCount}, reads: +${newReads}=${readSyncCount})`,
    );
    prevCompiles = compileCount;
    prevReads = readSyncCount;
    if (heartbeat >= 60) clearInterval(iv);
  }, 1000);
  if (iv.unref) iv.unref();
});

// Log when the gateway starts listening (detect via stdout write)
const origStdoutWrite = process.stdout.write;
process.stdout.write = function (chunk, ...args) {
  const str = typeof chunk === "string" ? chunk : chunk.toString();
  if (str.includes("listening on")) {
    logPhase(
      `gateway listening (READY) — totals: ${compileCount} compiles/${compileTotalMs.toFixed(0)}ms, ${readSyncCount} reads/${readSyncTotalMs.toFixed(0)}ms`,
    );
  }
  return origStdoutWrite.call(this, chunk, ...args);
};

// Log at process exit for total lifetime
process.on("exit", () => {
  logPhase("process exiting");
});
