(() => {
  "use strict";

  const layerEls = [document.getElementById("layerA"), document.getElementById("layerB")];
  const startOverlay = document.getElementById("startOverlay");
  const startSubtitle = document.getElementById("startSubtitle");
  const startBtn = document.getElementById("startBtn");
  const controls = document.getElementById("controls");
  const playPauseBtn = document.getElementById("playPauseBtn");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const trackInfo = document.getElementById("trackInfo");
  const volumeSlider = document.getElementById("volumeSlider");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsPanel = document.getElementById("settingsPanel");
  const settingsCloseBtn = document.getElementById("settingsCloseBtn");
  const intervalSlider = document.getElementById("intervalSlider");
  const intervalValue = document.getElementById("intervalValue");
  const shuffleToggle = document.getElementById("shuffleToggle");
  const counterEl = document.getElementById("counter");
  const audio = document.getElementById("audioPlayer");

  const settings = loadSettings();

  const state = {
    photos: [],
    order: [],
    pos: -1,
    activeLayer: 0,
    slideTimer: null,
    paused: false,
    tracks: [],
    trackOrder: [],
    trackPos: -1,
    started: false,
    wakeLock: null,
  };

  intervalSlider.value = settings.intervalSec;
  intervalValue.textContent = settings.intervalSec + "s";
  shuffleToggle.checked = settings.shuffle;
  volumeSlider.value = settings.volume;
  audio.volume = settings.volume;

  init();

  async function init() {
    try {
      const [photoData, musicData] = await Promise.all([loadPhotos(), loadMusic()]);
      state.photos = photoData.photos || [];
      state.tracks = musicData.tracks || [];

      if (state.photos.length === 0) {
        startSubtitle.textContent = "找不到相簿裡的照片，請確認相簿連結是否公開分享。";
        return;
      }

      buildOrder();
      buildTrackOrder();

      startSubtitle.textContent = `${photoData.title || "相簿"} · 共 ${state.photos.length} 張照片` +
        (state.tracks.length === 0 ? "（未放入音樂檔）" : ` · ${state.tracks.length} 首背景音樂`);
      startBtn.disabled = false;
    } catch (err) {
      console.error(err);
      startSubtitle.textContent = "載入相簿失敗，請稍後重新整理頁面再試一次。";
    }
  }

  async function loadPhotos() {
    const res = await fetch("/api/photos");
    if (!res.ok) throw new Error("photos fetch failed");
    return res.json();
  }

  async function loadMusic() {
    const res = await fetch("/api/music");
    if (!res.ok) return { tracks: [] };
    return res.json();
  }

  function loadSettings() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem("slideshow-settings") || "{}");
    } catch (e) { /* ignore */ }
    return {
      intervalSec: saved.intervalSec ?? 8,
      shuffle: saved.shuffle ?? true,
      volume: saved.volume ?? 0.6,
    };
  }

  function saveSettings() {
    localStorage.setItem("slideshow-settings", JSON.stringify(settings));
  }

  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildOrder() {
    const indices = state.photos.map((_, i) => i);
    state.order = settings.shuffle ? shuffleArray(indices) : indices;
    state.pos = -1;
  }

  function buildTrackOrder() {
    const indices = state.tracks.map((_, i) => i);
    state.trackOrder = shuffleArray(indices);
    state.trackPos = -1;
  }

  // Photos are pre-resized at import time (scripts/import-takeout-photos.js),
  // so both layers just use the file as-is — no per-device size suffix needed.
  function fgUrl(base) {
    return base;
  }

  function bgUrl(base) {
    return base;
  }

  function preload(base) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = fgUrl(base);
    });
  }

  // ---------- slideshow ----------

  async function showSlide(step) {
    if (state.order.length === 0) return;

    let nextPos = state.pos + step;
    if (nextPos >= state.order.length) {
      buildOrder();
      nextPos = 0;
    } else if (nextPos < 0) {
      nextPos = state.order.length - 1;
    }
    state.pos = nextPos;

    const base = state.photos[state.order[state.pos]];
    await preload(base);

    const currentLayerIdx = state.activeLayer;
    const nextLayerIdx = 1 - currentLayerIdx;
    const nextLayerEl = layerEls[nextLayerIdx];
    const currentLayerEl = layerEls[currentLayerIdx];

    const fg = nextLayerEl.querySelector(".fg");
    const bg = nextLayerEl.querySelector(".bg");
    fg.src = fgUrl(base);
    bg.src = bgUrl(base);

    fg.classList.remove("kenburns-in", "kenburns-out");
    void fg.offsetWidth; // restart animation
    const kbClass = Math.random() < 0.5 ? "kenburns-in" : "kenburns-out";
    fg.style.animationDuration = (settings.intervalSec + 2) + "s";
    fg.classList.add(kbClass);

    nextLayerEl.classList.add("active");
    currentLayerEl.classList.remove("active");
    state.activeLayer = nextLayerIdx;

    counterEl.textContent = `${state.pos + 1} / ${state.order.length}`;

    scheduleNext();
  }

  function scheduleNext() {
    clearTimeout(state.slideTimer);
    if (state.paused) return;
    state.slideTimer = setTimeout(() => showSlide(1), settings.intervalSec * 1000);
  }

  // ---------- music ----------

  function playCurrentTrack() {
    if (state.trackOrder.length === 0) return;
    const track = state.tracks[state.trackOrder[state.trackPos]];
    trackInfo.textContent = "🎵 " + track.name;
    audio.src = track.url;
    audio.play().catch(() => {});
  }

  function nextTrack() {
    if (state.trackOrder.length === 0) return;
    state.trackPos += 1;
    if (state.trackPos >= state.trackOrder.length) {
      buildTrackOrder();
      state.trackPos = 0;
    }
    playCurrentTrack();
  }

  audio.addEventListener("ended", nextTrack);

  // ---------- controls ----------

  function setPaused(paused) {
    state.paused = paused;
    playPauseBtn.textContent = paused ? "▶" : "⏸";
    if (paused) {
      clearTimeout(state.slideTimer);
      audio.pause();
    } else {
      scheduleNext();
      audio.play().catch(() => {});
    }
  }

  playPauseBtn.addEventListener("click", () => setPaused(!state.paused));
  prevBtn.addEventListener("click", () => showSlide(-1));
  nextBtn.addEventListener("click", () => showSlide(1));

  volumeSlider.addEventListener("input", () => {
    audio.volume = parseFloat(volumeSlider.value);
    settings.volume = audio.volume;
    saveSettings();
  });

  settingsBtn.addEventListener("click", () => settingsPanel.classList.toggle("open"));
  settingsCloseBtn.addEventListener("click", () => settingsPanel.classList.remove("open"));

  intervalSlider.addEventListener("input", () => {
    settings.intervalSec = parseInt(intervalSlider.value, 10);
    intervalValue.textContent = settings.intervalSec + "s";
    saveSettings();
    if (!state.paused) scheduleNext();
  });

  shuffleToggle.addEventListener("change", () => {
    settings.shuffle = shuffleToggle.checked;
    saveSettings();
    buildOrder();
  });

  // auto-hide controls
  let hideTimer = null;
  function showControls() {
    controls.classList.remove("hidden");
    counterEl.classList.remove("hidden");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      controls.classList.add("hidden");
      counterEl.classList.add("hidden");
      settingsPanel.classList.remove("open");
    }, 4500);
  }
  ["mousemove", "touchstart", "click"].forEach((evt) =>
    document.addEventListener(evt, showControls, { passive: true })
  );

  // ---------- start ----------

  startBtn.addEventListener("click", () => {
    // Must call play() synchronously inside the gesture handler for iOS autoplay rules.
    audio.muted = false;
    if (state.tracks.length > 0) {
      audio.play().catch(() => {});
    }

    startOverlay.classList.add("hidden");
    state.started = true;

    if (state.tracks.length > 0) nextTrack();
    showSlide(1);
    showControls();
    requestWakeLock();
    tryFullscreen();
  });

  function tryFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) {
      req.call(el).catch(() => {});
    }
  }

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      state.wakeLock = await navigator.wakeLock.request("screen");
    } catch (e) { /* ignore — not fatal */ }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.started && !state.wakeLock) {
      requestWakeLock();
    }
  });
})();
