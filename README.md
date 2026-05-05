# 🎵 TikSave — TikTok Downloader Tanpa Watermark

Web app download video TikTok tanpa watermark, dibangun dengan Node.js murni (tanpa dependency eksternal).

---

## 🚀 Cara Jalankan di Termux

### 1. Install Node.js
```bash
pkg update && pkg install nodejs
```

### 2. Clone / copy folder ini ke Termux
```bash
# Kalau pake scp/sftp dari PC ke Termux
# atau buat folder manual:
mkdir tiksave && cd tiksave
```

### 3. Jalankan server
```bash
node server.js
```

Server bakal jalan di: **http://localhost:3000**

---

## 🌐 Deploy ke VPS / Cloud

### Railway (Gratis)
1. Push ke GitHub
2. Buka railway.app → New Project → Deploy from GitHub
3. Done! Auto dapat domain gratis

### Render (Gratis)
1. Push ke GitHub
2. render.com → New Web Service
3. Build command: `node server.js`
4. Done!

### VPS Manual (Ubuntu)
```bash
# Install Node
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Copy files & jalankan
node server.js

# Pakai PM2 biar gak mati
npm install -g pm2
pm2 start server.js --name tiksave
pm2 startup
pm2 save
```

---

## 📁 Struktur Project

```
tiksave/
├── server.js        ← Backend Express (no dependencies!)
├── package.json
└── public/
    └── index.html   ← Frontend premium
```

---

## ✨ Fitur

- ✅ Download video **tanpa watermark** (HD)
- ✅ Download video dengan watermark
- ✅ Download audio/musik (MP3)
- ✅ Proxy download langsung dari server (no CORS)
- ✅ Backend murni Node.js built-in (no npm install!)
- ✅ Frontend animasi premium
- ✅ Auto-fetch saat paste URL
- ✅ Custom cursor + ripple effect
- ✅ Particle animation background

---

## 🔧 Port Custom

```bash
PORT=8080 node server.js
```

---

## ⚠️ Catatan

- Gunakan hanya untuk keperluan pribadi
- Hormati hak cipta kreator TikTok
- API menggunakan [TikWM](https://tikwm.com) yang gratis & tanpa API key
