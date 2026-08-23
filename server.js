const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const MUSIC_DIR = path.join(__dirname, "music");
const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".aac", ".ogg", ".wav"]);

// Default album is the one provided by the user; can be overridden per-deploy via env var.
// NOTE: we use the resolved photos.google.com/share/... form, not the photos.app.goo.gl
// short link — the short link renders a JS interstitial that only redirects in a real
// browser, so a plain server-side fetch never reaches the actual album HTML.
const DEFAULT_ALBUM_URL =
  "https://photos.google.com/share/AF1QipMkD-oHYIOJ2KENHmLeCVBHtdLp-oq0L8PdVhWwgsk4gh-402hfJS1JH4BjwXKpUQ?key=NHlZM3E4VXJKaDlRVGZ4VEpJaXAwVWhPeV9sMy1n";
const ALBUM_URLS = (process.env.ALBUM_URL || DEFAULT_ALBUM_URL)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let photoCache = { data: null, fetchedAt: 0 };

async function fetchAlbumPhotos(albumUrl) {
  const res = await fetch(albumUrl, {
    redirect: "follow",
    headers: {
      // Google serves the lightweight photos.app.goo.gl interstitial to non-browser UAs.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!res.ok) {
    throw new Error(`Album fetch failed: HTTP ${res.status}`);
  }

  const html = await res.text();

  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  const rawTitle = titleMatch ? titleMatch[1].replace(/\s*-\s*Google Photos\s*$/, "") : "Photo Album";
  const title = rawTitle
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Shared-album pages embed each photo as a base CDN URL (…/pw/<id>) with a
  // size/crop suffix after "=". We only want the unique base URLs; the client
  // appends its own size suffix per device.
  const matches = html.matchAll(/https:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_-]+/g);
  const seen = new Set();
  for (const m of matches) {
    seen.add(m[0]);
  }

  if (seen.size === 0) {
    throw new Error("No photos found — Google may have changed the album page format, or the album is empty/private.");
  }

  return { title, photos: Array.from(seen) };
}

app.get("/api/photos", async (req, res) => {
  try {
    const now = Date.now();
    if (!photoCache.data || now - photoCache.fetchedAt > CACHE_TTL_MS) {
      const allPhotos = new Set();
      let mergedTitle = "";

      const results = await Promise.all(
        ALBUM_URLS.map(async (url) => {
          try {
            return await fetchAlbumPhotos(url);
          } catch (e) {
            console.error(`Failed to fetch album (${url}):`, e.message);
            return null;
          }
        })
      );

      for (const result of results) {
        if (result) {
          if (!mergedTitle) mergedTitle = result.title;
          for (const p of result.photos) {
            allPhotos.add(p);
          }
        }
      }

      if (allPhotos.size === 0) {
        throw new Error("No photos found in any of the configured albums.");
      }

      photoCache = {
        data: { title: mergedTitle || "Photo Album", photos: Array.from(allPhotos) },
        fetchedAt: now,
      };
    }
    res.json(photoCache.data);
  } catch (err) {
    // Serve a stale cache rather than a broken slideshow, if we have one.
    if (photoCache.data) {
      res.json(photoCache.data);
      return;
    }
    console.error("Failed to load album:", err.message);
    res.status(502).json({ error: err.message });
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
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h" }));

app.listen(PORT, () => {
  console.log(`Photo slideshow running on port ${PORT}`);
  console.log(`Album: ${ALBUM_URL}`);
});
