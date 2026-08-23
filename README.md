# 相簿投影播放 Photo Slideshow

把 Google Photos 公開共享相簿轉成全螢幕投影播放網站，搭配自己準備的背景輕音樂，
可在 iPad Safari 開啟並加入主畫面成全螢幕 kiosk 模式。

## 運作原理

- `server.js` 會在伺服器端抓取共享相簿頁面（`ALBUM_URL`），解析出照片的圖片網址，
  提供 `/api/photos` 給前端使用。這是非官方做法（Google Photos 沒有公開相簿的
  正式 API），如果 Google 改版頁面格式，解析可能會失效，屆時需要調整
  `server.js` 裡的正規表示式。
- 音樂檔案放在 `music/` 資料夾，`/api/music` 會列出裡面所有音檔，前端隨機排序、
  循環播放，跟照片切換是各自獨立的節奏。

## 本機測試

```bash
cd photo-slideshow
npm install
npm start
```

開啟 http://localhost:3000 測試，會看到「共 301 張照片」代表相簿抓取成功。

## 放入背景音樂

把 mp3 / m4a / aac / ogg / wav 檔案丟進 `music/` 資料夾即可，不需要修改程式碼。
詳見 `music/README.txt`。

## 部署到雲端（Render，免費方案）

1. 把這個資料夾推到你自己的 GitHub repo（音樂檔案記得一起 commit）：
   ```bash
   cd photo-slideshow
   git remote add origin https://github.com/<你的帳號>/photo-slideshow.git
   git push -u origin main
   ```
2. 到 https://render.com 註冊/登入，選 **New + → Web Service**，連接剛剛的 GitHub repo。
3. Render 會偵測到 `render.yaml`，自動帶入設定（Build: `npm install`，Start: `npm start`）；
   直接按 **Create Web Service** 即可。免費方案完全夠用。
4. 部署完成後會拿到一個網址，例如 `https://photo-slideshow-xxxx.onrender.com`。

> 免費方案在無人訪問一段時間後會休眠，重新打開時第一次載入會慢個十幾秒，
> 之後就正常。如果介意，可升級付費方案或改用 Railway / Fly.io 等平台
> （程式碼不需要改，一樣是標準 Node.js + Express app）。

若想改用別的相簿，或相簿之後過期／換連結，替換 Render 上的環境變數 `ALBUM_URL`
即可，不用改程式碼。**注意**：`ALBUM_URL` 請用瀏覽器網址列裡完整的
`https://photos.google.com/share/...?key=...` 網址，不要用 `photos.app.goo.gl`
短網址（短網址是用 JavaScript 跳轉的，伺服器端抓不到內容）。

## 在 iPad 上開啟

1. 用 Safari 打開部署後的網址。
2. 點一下畫面上的「輕觸開始播放」按鈕（iOS 規定音樂/影片要有使用者點擊才能自動播放）。
3. 想要全螢幕、沒有 Safari 網址列的效果：點分享圖示 → 「加入主畫面」，
   之後從主畫面圖示開啟就是全螢幕 kiosk 模式。
4. 畫面右下角齒輪可以調整每張照片停留秒數、是否隨機播放；底部有播放/暫停、
   上一張/下一張、音量。控制列幾秒不動會自動隱藏，點一下畫面會再出現。
5. 支援 Screen Wake Lock 的裝置（iPadOS 16.4+ Safari）會在播放時自動防止螢幕休眠。
