#!/usr/bin/env node
// One-time (and re-runnable) import: takes a Google Takeout export of a
// Google Photos album and writes a resized, slideshow-ready copy of every
// photo into public/photos/ so server.js can serve them as plain static
// files (no Google API/scraping involved).
//
// Usage:
//   node scripts/import-takeout-photos.js <path> [--append] [--delete-source]
//
// <path> can be:
//   - a folder containing one or more Takeout .zip files (processed one at a
//     time so we're never unzipping more than one at once — Takeout exports
//     can be tens of GB)
//   - a single .zip file
//   - a folder you already unzipped yourself
//
// By default this wipes public/photos/ and rebuilds it from just what you
// passed in — use this once you have everything in one place.
//
// If your Takeout export is too big to fit on disk all at once, download and
// process it in chunks instead: run this once per downloaded zip with
// --append (keeps everything imported so far instead of wiping it) and
// --delete-source (deletes the zip after it's been processed, to free up
// space for the next download). Only pass a single zip file at a time when
// using --delete-source.

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const sharp = require("sharp");

const OUTPUT_DIR = path.join(__dirname, "..", "public", "photos");
const MAX_DIMENSION = 2200; // matches the slideshow's on-screen size cap
const JPEG_QUALITY = 82;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);

async function findImages(dir, out = []) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await findImages(full, out);
    } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

function extractZipToTemp(zipPath) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "takeout-"));
  console.log(`解壓縮 ${path.basename(zipPath)} ...`);
  // Use macOS's `ditto` rather than `unzip` — the classic Info-ZIP `unzip`
  // bundled with macOS mishandles non-ASCII (e.g. Chinese) filenames inside
  // the archive and can spew enough stderr to overflow execFileSync's buffer.
  execFileSync("ditto", ["-x", "-k", zipPath, dest], { maxBuffer: 1024 * 1024 * 100 });
  return dest;
}

// Yields one { dir, cleanup } at a time so we only ever have one zip
// extracted on disk at once, regardless of how many were passed in.
async function* sourceDirs(input, deleteSource) {
  const resolved = path.resolve(input);
  const stat = fs.statSync(resolved);

  if (stat.isFile()) {
    if (!resolved.toLowerCase().endsWith(".zip")) {
      console.error(`跳過不是 zip 的檔案: ${input}`);
      return;
    }
    const dir = extractZipToTemp(resolved);
    yield {
      dir,
      cleanup: async () => {
        await fsp.rm(dir, { recursive: true, force: true });
        if (deleteSource) {
          await fsp.rm(resolved, { force: true });
          console.log(`已刪除 ${resolved}`);
        }
      },
    };
    return;
  }

  if (!stat.isDirectory()) return;

  const entries = await fsp.readdir(resolved, { withFileTypes: true });
  const zips = entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".zip"));

  if (zips.length > 0) {
    for (const zip of zips) {
      const zipPath = path.join(resolved, zip.name);
      const dir = extractZipToTemp(zipPath);
      yield {
        dir,
        cleanup: async () => {
          await fsp.rm(dir, { recursive: true, force: true });
          if (deleteSource) {
            await fsp.rm(zipPath, { force: true });
            console.log(`已刪除 ${zipPath}`);
          }
        },
      };
    }
  } else {
    // Already-extracted folder — nothing to clean up afterwards.
    yield { dir: resolved, cleanup: async () => {} };
  }
}

// sharp's bundled libheif rejects some real-world iPhone HEIC files (e.g. Live
// Photos with many auxiliary images) with "Security limit exceeded: Number of
// references in iref box ...". Route .heic through macOS's own `sips` first —
// it uses Apple's native decoder and doesn't have that limit.
async function heicToTempJpeg(src) {
  const tmp = path.join(os.tmpdir(), `heic-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  execFileSync("sips", ["-s", "format", "jpeg", src, "--out", tmp], { stdio: "ignore" });
  return tmp;
}

async function processImage(src, index) {
  const outName = `${String(index).padStart(5, "0")}.jpg`;
  const isHeic = path.extname(src).toLowerCase() === ".heic";
  const input = isHeic ? await heicToTempJpeg(src) : src;
  try {
    await sharp(input)
      .rotate() // auto-orient from EXIF, then strip it
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toFile(path.join(OUTPUT_DIR, outName));
  } finally {
    if (isHeic) await fsp.rm(input, { force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith("--"));
  const append = args.includes("--append");
  const deleteSource = args.includes("--delete-source");

  if (!input) {
    console.error("用法: node scripts/import-takeout-photos.js <Takeout zip 或資料夾路徑> [--append] [--delete-source]");
    process.exit(1);
  }

  await fsp.mkdir(OUTPUT_DIR, { recursive: true });

  let startIndex = 0;
  if (append) {
    const existing = (await fsp.readdir(OUTPUT_DIR)).filter((f) => /^\d+\.jpg$/.test(f));
    startIndex = existing.reduce((max, f) => Math.max(max, parseInt(f, 10)), 0);
    console.log(`累加模式：目前已有 ${existing.length} 張，從第 ${startIndex + 1} 張開始編號。`);
  } else {
    await fsp.rm(OUTPUT_DIR, { recursive: true, force: true });
    await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  }

  let done = 0;
  let failed = 0;

  for await (const { dir, cleanup } of sourceDirs(input, deleteSource)) {
    console.log(`掃描 ${dir} ...`);
    const images = await findImages(dir);
    console.log(`  找到 ${images.length} 張圖片，開始處理...`);

    for (const src of images) {
      try {
        await processImage(src, startIndex + done + failed + 1);
        done++;
      } catch (e) {
        failed++;
        console.error(`跳過（無法處理）: ${src} — ${e.message}`);
      }
      const total = done + failed;
      if (total % 200 === 0) console.log(`  已處理 ${total}（成功 ${done}）`);
    }

    await cleanup();
  }

  if (done === 0) {
    console.error("\n沒有成功匯入任何圖片，請確認路徑正確。");
    process.exit(1);
  }

  console.log(`\n完成！成功 ${done} 張，失敗 ${failed} 張，存在 public/photos/。`);
  console.log(`接下來可以 git add public/photos && git commit，再 push 部署。`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
