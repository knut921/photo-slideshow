const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const MUSIC_DIR = path.join(__dirname, "music");
const PHOTOS_DIR = path.join(__dirname, "public", "photos");
const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".aac", ".ogg", ".wav"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

app.get("/api/photos", async (req, res) => {
  try {
    const entries = await fs.readdir(PHOTOS_DIR, { withFileTypes: true });
    const photos = entries
      .filter((e) => e.isFile() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
      .map((e) => `/photos/${encodeURIComponent(e.name)}`)
      .sort();
    res.json({ title: "相簿投影播放", photos });
  } catch (err) {
    console.error("Failed to list photos:", err.message);
    res.status(502).json({ error: "找不到 public/photos/，請先執行 scripts/import-takeout-photos.js 匯入照片。" });
  }
});

app.get("/api/music", async (req, res) => {
  try {
    const entries = await fs.readdir(MUSIC_DIR, { withFileTypes: true });
    const tracks = entries
      .filter((e) => e.isFile() && AUDIO_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
      .map((e) => ({
        name: path.parse(e.name).name,
        url: `/music/${encodeURIComponent(e.name)}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ tracks });
  } catch (err) {
    console.error("Failed to list music:", err.message);
    res.json({ tracks: [] });
  }
});

app.use("/music", express.static(MUSIC_DIR, { maxAge: "1d" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1d" }));

app.listen(PORT, () => {
  console.log(`Photo slideshow running on port ${PORT}`);
});
