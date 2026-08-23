# 相簿投影播放 Photo Slideshow

把照片轉成全螢幕投影播放網站，搭配自己準備的背景輕音樂，可在 iPad Safari
開啟並加入主畫面成全螢幕 kiosk 模式。

## 運作原理

- 照片是**靜態檔案**，放在 `public/photos/` 資料夾裡，`/api/photos` 只是列出
  這個資料夾目前有哪些檔案給前端用（跟 `/api/music` 列音樂檔的做法一樣）。
  照片本身用 `scripts/import-takeout-photos.js` 從 Google Takeout 匯出的相簿
  匯入並自動縮圖，詳見「匯入 / 更新照片」。
  - 之所以不是即時連 Google 相簿抓取，是因為 Google 相簿共享頁面用捲動載入，
    一次最多只能抓到前 ~300 張；Google Photos Library API 的公開讀取權限也已
    在 2025/3/31 被 Google 廢止，第三方程式沒辦法再用官方 API 讀取使用者相簿。
    因此改用「匯出後自行存放」的做法，一勞永逸不受這些限制影響。
- 音樂檔案放在 `music/` 資料夾，`/api/music` 會列出裡面所有音檔，前端隨機排序、
  循環播放，跟照片切換是各自獨立的節奏。

## 匯入 / 更新照片

相簿內容有變動時（新增、刪除照片），重新做一次這個流程即可：

1. 到 [Google Takeout](https://takeout.google.com/) → 「取消全選」→ 只勾選
   **Google Photos** → 「選擇相簿」只選你要投影播放的那個相簿 → 匯出，
   匯出方式選「.zip」，大小上限可以選大一點（例如 10GB）減少檔案數量。
   照片多的話 Google 需要一些時間打包，完成後會寄信附下載連結。
2. 下載後（可能有好幾個 zip 檔），把它們放同一個資料夾，執行匯入腳本：
   ```bash
   npm install
   node scripts/import-takeout-photos.js ~/Downloads/takeout/
   ```
   這會清空並重建 `public/photos/`（自動依 EXIF 校正方向、縮到螢幕夠用的解析度、
   壓縮成 JPEG）。

   **磁碟空間不夠一次放下全部 zip 的話**：一次只下載一個 zip，處理完馬上刪掉，
   騰出空間再下載下一個 —
   ```bash
   node scripts/import-takeout-photos.js ~/Downloads/takeout-01.zip --append --delete-source
   ```
   `--append` 保留之前已匯入的照片（不清空重來）、`--delete-source` 處理完自動
   刪除該 zip 釋放空間。每下載一個檔案就跑一次這行（換成對應的檔名），全部跑完
   後 `public/photos/` 就會累積齊全部照片。
3. 確認 `public/photos/` 內容更新後，commit 並 push：
   ```bash
   git add public/photos
   git commit -m "更新照片"
   git push
   ```
   Render 偵測到 push 會自動重新部署。

> 注意：`.heic` 原始檔如果 sharp 這台機器沒有 HEIF 解碼支援，該張會被跳過並在
> 終端機印出訊息（腳本執行完會顯示「成功 X 張，失敗 Y 張」）。如果失敗數量偏高，
> 跟我說一聲再另外處理。

## 本機測試

```bash
cd photo-slideshow
npm install
npm start
```

開啟 http://localhost:3000 測試，看到「共 X 張照片」代表 `public/photos/`
讀取成功（要先跑過上面的匯入腳本才會有照片）。

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

照片是直接 commit 進 repo 的，之後想更新照片，照上面「匯入 / 更新照片」的步驟
重新匯入、commit、push 一次即可，Render 會自動重新部署。

## 在 iPad 上開啟

1. 用 Safari 打開部署後的網址。
2. 點一下畫面上的「輕觸開始播放」按鈕（iOS 規定音樂/影片要有使用者點擊才能自動播放）。
3. 想要全螢幕、沒有 Safari 網址列的效果：點分享圖示 → 「加入主畫面」，
   之後從主畫面圖示開啟就是全螢幕 kiosk 模式。
4. 畫面右下角齒輪可以調整每張照片停留秒數、是否隨機播放；底部有播放/暫停、
   上一張/下一張、音量。控制列幾秒不動會自動隱藏，點一下畫面會再出現。
5. 支援 Screen Wake Lock 的裝置（iPadOS 16.4+ Safari）會在播放時自動防止螢幕休眠。
