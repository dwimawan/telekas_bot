# Local Testing Guide — Tele-Finance Bot di WSL

Testing lokal di WSL sebelum deploy ke Vercel. Menggunakan **ngrok** untuk tunnel lokal ke internet.

---

## Langkah 1: Setup Environment Lokal

### 1.1 Clone/extract project
```bash
cd tele-finance-bot
npm install
```

### 1.2 Copy dan edit `.env.local`
```bash
cp .env.example .env.local
nano .env.local  # atau buka dengan editor favorit
```

Isi dengan:
- **TELEGRAM_TOKEN** — dari BotFather
- **ALLOWED_CHAT_IDS** — Chat ID kamu (pakai @userinfobot di Telegram)
- **SPREADSHEET_ID** — dari Google Sheets URL
- **SHEET_NAME** — nama tab (default: `Transaksi`)
- **GOOGLE_SERVICE_ACCOUNT_JSON** — copy-paste seluruh isi file JSON service account

### 1.3 Setup Google Sheets & Service Account
Sama seperti langkah di README untuk Sheets, hanya tidak perlu set env vars di Vercel (baru di Vercel setelah testing selesai).

---

## Langkah 2: Setup ngrok (Tunnel Internet)

ngrok memungkinkan Telegram menghubungi server lokal WSL kamu dari internet.

### 2.1 Install ngrok

**Via Snap (paling simpel):**
```bash
# Jika belum ada snap
sudo apt update && sudo apt install snapd

# Install ngrok
sudo snap install ngrok
```

**Atau download manual:** https://ngrok.com/download

### 2.2 Login/authorize ngrok

```bash
# Daftar account gratis di https://dashboard.ngrok.com
# Dapatkan auth token dari dashboard

ngrok config add-authtoken YOUR_AUTH_TOKEN_HERE
```

---

## Langkah 3: Jalankan Local Server

### Terminal 1 — Start dev server
```bash
# Masuk direktori project
cd tele-finance-bot

# Start server di port 3000
npm start
```

Output:
```
🚀 Development server running on http://localhost:3000

📡 Webhook endpoint: http://localhost:3000/api/webhook

💡 Tips:
   - Gunakan ngrok untuk expose ke internet: ngrok http 3000
   - Daftarkan URL ngrok ke Telegram bot: node scripts/set-webhook.js https://xxx.ngrok.io
   - Cek webhook info: TELEGRAM_TOKEN=xxx node scripts/check-webhook.js
```

**Server sudah running dan siap menerima request.**

---

## Langkah 4: Tunnel dengan ngrok

### Terminal 2 — Start ngrok tunnel
```bash
ngrok http 3000
```

Output:
```
ngrok                                                              (Ctrl+C to quit)

Session Status                online
Session Expires               1 hour, 59 minutes
Version                       3.3.5
Region                        ap
Latency                       70ms
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123def456.ngrok.io -> http://localhost:3000

Connections                   ttl    opn     rt1    rt5    p95
                              0      0       0.00   0.00   0.00
```

**Catat URL ngrok:** `https://abc123def456.ngrok.io` (berbeda tiap kali dijalankan)

---

## Langkah 5: Daftarkan Webhook ke Telegram

### Terminal 3 — Set webhook

```bash
# Ganti abc123def456 dengan URL ngrok kamu
TELEGRAM_TOKEN=xxx node scripts/set-webhook.js https://abc123def456.ngrok.io
```

Output sukses:
```
📡 Mendaftarkan webhook ke Telegram...
   URL: https://abc123def456.ngrok.io/api/webhook

✅ Webhook berhasil didaftarkan!

📋 Webhook Info:
   URL          : https://abc123def456.ngrok.io/api/webhook
   Pending count: 0
   Last error   : —
```

**Sekarang Telegram sudah tahu untuk mengirim pesan ke tunnel lokal kamu.**

---

## Langkah 6: Test Bot

Buka Telegram, cari bot kamu (`@BotName` dari BotFather), dan kirim pesan:

```
/start
```

Expected response:
```
👋 Halo! Selamat datang di Tele-Finance Bot

Bot ini membantu kamu mencatat keuangan pribadi langsung dari Telegram.

Ketuk /help untuk melihat cara penggunaan.
```

Kalo berhasil, lanjut test command lain:

```
/help
50000 makan siang warteg
25k kopi di cafe
+500k gaji freelance
/undo
```

---

## Troubleshooting

### "Bot tidak merespons"

1. **Cek server jalan:**
   ```bash
   curl http://localhost:3000
   ```
   Response: `{"status":"ok",...}`

2. **Cek ngrok tunnel aktif:**
   - Buka http://127.0.0.1:4040 (dashboard ngrok lokal)
   - Lihat request log masuk
   - Kalo ada error, tampil di sini

3. **Cek webhook terdaftar:**
   ```bash
   TELEGRAM_TOKEN=xxx node scripts/check-webhook.js
   ```
   Pastikan URL di output sama dengan URL ngrok

4. **Lihat logs di terminal server:**
   Terminal 1 (npm start) akan menampilkan:
   ```
   [WEBHOOK] Incoming update:
   {
     "update_id": 123456789,
     "message": {...}
   }
   ```

### "Webhook error: connection_failed"

- Cek ngrok tunnel masih aktif di Terminal 2
- URL ngrok kadang timeout / expire setelah beberapa jam
- Restart ngrok jika perlu (buat URL baru, update webhook)

### "ALLOWED_CHAT_IDS error / Bot mengabaikan pesan"

- Buka @userinfobot di Telegram, catat Chat ID
- Masukkan di `.env.local` variabel `ALLOWED_CHAT_IDS`
- Restart server (Ctrl+C di Terminal 1, lalu `npm start` lagi)

### "Google Sheets tidak tercatat data"

- Cek `.env.local` sudah punya `GOOGLE_SERVICE_ACCOUNT_JSON` yang valid
- Pastikan Sheets API sudah enabled di Google Cloud Console
- Pastikan service account email sudah di-share ke spreadsheet dengan role **Editor**
- Lihat terminal logs di Terminal 1, cari error dari `[SHEETS]`

---

## Workflow Testing

Ini urutan ideal untuk testing:

1. **Setup phase:**
   - ✅ `.env.local` sudah lengkap
   - ✅ Google Sheets & Service Account siap
   - ✅ npm start → server jalan

2. **Tunnel phase:**
   - ✅ Terminal baru: `ngrok http 3000`
   - ✅ Catat URL ngrok

3. **Webhook phase:**
   - ✅ Register webhook ke Telegram dengan ngrok URL
   - ✅ Check webhook status dengan `scripts/check-webhook.js`

4. **Test phase:**
   - ✅ /start → bot respond
   - ✅ /help → tampil panduan
   - ✅ text transaksi → catat ke Sheets
   - ✅ /undo → hapus dengan konfirmasi

5. **Debug phase:**
   - Monitor Terminal 1 logs (webhook incoming)
   - Monitor ngrok dashboard di http://127.0.0.1:4040
   - Monitor Sheets untuk validasi data masuk

---

## Iterasi Code Lokal

Setelah server jalan, kamu bisa edit file (seperti `lib/parser.js`, `lib/handlers.js`) dan server **tidak perlu restart** karena Node.js membaca file fresh tiap request.

Kalo ubah `.env.local`, baru perlu restart server.

---

## Siap Deploy ke Vercel?

Setelah testing lokal selesai dan semua berjalan lancar:

1. Pastikan env vars sudah siap di Vercel Dashboard
2. Deploy: `vercel --prod`
3. Set webhook ke Vercel URL: `TELEGRAM_TOKEN=xxx node scripts/set-webhook.js https://your-app.vercel.app`

**Selesai!** Bot siap di production.
