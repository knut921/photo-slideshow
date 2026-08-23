#!/usr/bin/env node
// Watches a folder (default ~/Downloads) for Takeout .zip files landing in
// it, and as soon as each one finishes downloading (size stops changing),
// automatically imports it into public/photos/ (--append) and deletes it
// (--delete-source) to free up space for the next download.
//
// You still have to click "下載" yourself in the browser (see README) — this
// just takes care of everything after that, so you can click through all the
// parts back-to-back without waiting for each one to process.
//
// Usage:
//   node scripts/watch-and-import.js [watch-dir] [--pattern=takeout]
//
// Runs until you stop it (Ctrl+C, or however it was launched).

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

const args = process.argv.slice(2);
const watchDir = args.find((a) => !a.startsWith("--")) || path.join(require("os").homedir(), "Downloads");
const patternArg = args.find((a) => a.startsWith("--pattern="));
const pattern = new RegExp(patternArg ? patternArg.split("=")[1] : "takeout", "i");

const POLL_MS = 3000;
const STABLE_CHECKS = 2; // how many consecutive polls a file's size must be unchanged

const seen = new Set(); // absolute paths already handled (success or failure) this run
const sizeHistory = new Map(); // absolute path -> { size, stableCount }

function importScript() {
  return path.join(__dirname, "import-takeout-photos.js");
}

function runImport(zipPath) {
  return new Promise((resolve) => {
    console.log(`\n>>> 偵測到新檔案，開始匯入: ${zipPath}`);
    const child = spawn(process.execPath, [importScript(), zipPath, "--append", "--delete-source"], {
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      console.log(`>>> 匯入結束（exit code ${code}）\n`);
      resolve();
    });
  });
}

async function tick() {
  let entries;
  try {
    entries = await fsp.readdir(watchDir, { withFileTypes: true });
  } catch (e) {
    console.error(`讀取 ${watchDir} 失敗: ${e.message}`);
    return;
  }

  const candidates = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".zip") && pattern.test(e.name))
    .map((e) => path.join(watchDir, e.name));

  for (const filePath of candidates) {
    if (seen.has(filePath)) continue;

    let size;
    try {
      size = (await fsp.stat(filePath)).size;
    } catch {
      continue; // disappeared between readdir and stat
    }

    const prev = sizeHistory.get(filePath);
    if (prev && prev.size === size) {
      const stableCount = prev.stableCount + 1;
      sizeHistory.set(filePath, { size, stableCount });
      if (stableCount >= STABLE_CHECKS) {
        seen.add(filePath);
        sizeHistory.delete(filePath);
        await runImport(filePath);
      }
    } else {
      sizeHistory.set(filePath, { size, stableCount: 0 });
    }
  }
}

console.log(`監看資料夾: ${watchDir}`);
console.log(`檔名比對規則: /${pattern.source}/i`);
console.log(`每次偵測到新的、下載完成的 zip 就會自動匯入 + 刪除。按 Ctrl+C 停止。\n`);

// A single tick() already processes its candidates one at a time (the for-loop
// awaits each runImport), but setInterval doesn't wait for a slow tick() to
// finish before firing the next one — importing hundreds of photos takes way
// longer than POLL_MS. Without this guard, overlapping ticks each spawn their
// own import process, and multiple processes racing to write into the same
// public/photos/ directory silently overwrite each other's output.
let busy = false;
setInterval(() => {
  if (busy) return;
  busy = true;
  tick()
    .catch((e) => console.error(e))
    .finally(() => {
      busy = false;
    });
}, POLL_MS);
