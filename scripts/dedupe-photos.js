#!/usr/bin/env node
// Removes exact-duplicate files from public/photos/ (same content, different
// filename) — e.g. from accidentally importing the same Takeout zip twice.
// Keeps the lowest-numbered file in each duplicate group, deletes the rest.

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PHOTOS_DIR = path.join(__dirname, "..", "public", "photos");

async function hashFile(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const files = (await fs.readdir(PHOTOS_DIR)).filter((f) => f.toLowerCase().endsWith(".jpg")).sort();
  console.log(`檢查 ${files.length} 張照片...`);

  const byHash = new Map(); // hash -> [filenames], in scan order (already sorted)
  for (const file of files) {
    const hash = await hashFile(path.join(PHOTOS_DIR, file));
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(file);
  }

  let removed = 0;
  for (const [, group] of byHash) {
    if (group.length <= 1) continue;
    const [keep, ...dupes] = group;
    for (const dupe of dupes) {
      await fs.rm(path.join(PHOTOS_DIR, dupe));
      console.log(`刪除重複: ${dupe}（跟 ${keep} 內容相同）`);
      removed++;
    }
  }

  console.log(`\n完成。共移除 ${removed} 張重複照片，剩下 ${files.length - removed} 張。`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
