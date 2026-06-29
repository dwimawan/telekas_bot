# Testing Architecture & Command Reference

## System Diagram (Local Testing)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INTERNET (Telegram)                         │
└─────────────────────────────────────────────────────────────────────┘
                                  ↑↓
                         ┌────────────────┐
                         │   ngrok Tunnel │
                         │  abc123.ngrok  │
                         │       .io      │
                         └────────────────┘
                                  ↑↓
        ┌─────────────────────────────────────────────────────┐
        │           WSL (Your Local Machine)                   │
        │                                                      │
        │  ┌──────────────────────────────────────────────┐   │
        │  │  Terminal 1: npm start                       │   │
        │  │  http://localhost:3000/api/webhook           │   │
        │  │                                              │   │
        │  │  ├─ server.js (HTTP server lokal)           │   │
        │  │  ├─ api/webhook.js (endpoint logic)         │   │
        │  │  ├─ lib/handlers.js (command logic)         │   │
        │  │  ├─ lib/parser.js (transaksi parser)        │   │
        │  │  ├─ lib/sheets.js (Google Sheets API)       │   │
        │  │  └─ lib/telegram.js (Telegram API client)   │   │
        │  └──────────────────────────────────────────────┘   │
        │                         ↑↓                           │
        │                  .env.local config                   │
        │                                                      │
        │  ┌──────────────────────────────────────────────┐   │
        │  │  Terminal 2: ngrok http 3000                │   │
        │  │  ├─ Tunnel port 3000 ke public internet     │   │
        │  │  ├─ Generate random ngrok.io URL            │   │
        │  │  └─ Dashboard: http://127.0.0.1:4040        │   │
        │  └──────────────────────────────────────────────┘   │
        │                         ↑↓                           │
        │  ┌──────────────────────────────────────────────┐   │
        │  │  Terminal 3: node scripts/set-webhook.js    │   │
        │  │  (register ngrok URL ke Telegram bot)       │   │
        │  └──────────────────────────────────────────────┘   │
        │                                                      │
        │  ┌──────────────────────────────────────────────┐   │
        │  │  Terminal 4: Telegram client (desktop/mobile)   │
        │  │  Send message to your test bot               │   │
        │  └──────────────────────────────────────────────┘   │
        └─────────────────────────────────────────────────────┘
                              ↑↓ (read/write)
        ┌─────────────────────────────────────────────────────┐
        │        Google Cloud (REST API)                       │
        │  ├─ OAuth2 token generation (JWT auth)              │
        │  └─ Google Sheets API v4                            │
        └─────────────────────────────────────────────────────┘
                              ↑↓
        ┌─────────────────────────────────────────────────────┐
        │          Google Drive (Your Spreadsheet)            │
        │  ├─ data stored in Google Sheets                    │
        │  └─ visible in Google Drive                         │
        └─────────────────────────────────────────────────────┘
```

---

## Commands Reference

### Setup Phase

```bash
# Buat .env.local dari template
cp .env.example .env.local

# Edit .env.local dengan editor
nano .env.local

# Install dependencies
npm install

# (Optional) Run quick start validation script
chmod +x scripts/quickstart-dev.sh
./scripts/quickstart-dev.sh
```

### Development Phase

**Terminal 1 — Start local server**
```bash
npm start
# atau
node server.js

# Output:
# 🚀 Development server running on http://localhost:3000
# 📡 Webhook endpoint: http://localhost:3000/api/webhook
```

**Terminal 2 — Start ngrok tunnel**
```bash
# Install ngrok (jika belum)
sudo snap install ngrok  # atau download dari ngrok.com

# Authorize (first time only)
ngrok config add-authtoken YOUR_AUTH_TOKEN

# Start tunnel
ngrok http 3000

# Output:
# Forwarding    https://abc123def456.ngrok.io -> http://localhost:3000
```

**Terminal 3 — Register webhook to Telegram**
```bash
# Replace abc123def456 dengan ngrok URL kamu
TELEGRAM_TOKEN=xxx node scripts/set-webhook.js https://abc123def456.ngrok.io

# Check webhook status
TELEGRAM_TOKEN=xxx node scripts/check-webhook.js
```

**Terminal 4 — Test di Telegram client**
```
Send message to your bot:
/start
/help
50000 makan siang
+500k gaji
/undo
```

### Inspection & Debug

**Check webhook info (anytime)**
```bash
TELEGRAM_TOKEN=xxx node scripts/check-webhook.js

# Output shows:
# - Current webhook URL
# - Pending updates count
# - Last error (if any)
```

**View ngrok dashboard (live)**
```
Open in browser: http://127.0.0.1:4040

Shows:
- All HTTP requests coming through tunnel
- Request/response details
- Connection logs
```

**Test local endpoint directly (curl)**
```bash
# Health check
curl http://localhost:3000

# Test webhook (send fake Telegram update)
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 1,
    "message": {
      "message_id": 1,
      "date": '$(date +%s)',
      "chat": {"id": YOUR_CHAT_ID},
      "from": {"id": YOUR_CHAT_ID},
      "text": "test"
    }
  }'
```

---

## Testing Checklist

Setelah semua terminal jalan:

- [ ] Server lokal berjalan di port 3000
- [ ] ngrok tunnel aktif dan menunjukkan "Forwarding"
- [ ] Webhook berhasil didaftarkan ke Telegram
  - [ ] Check dengan `scripts/check-webhook.js`
  - [ ] URL sesuai ngrok URL
  - [ ] Pending count = 0
  - [ ] Last error kosong
- [ ] Send `/start` ke bot → bot respond
- [ ] Send `/help` → lihat panduan
- [ ] Send `50000 makan` → terminal 1 log masuk, Sheets update
- [ ] Send `/undo` → ada konfirmasi, bisa hapus
- [ ] Check ngrok dashboard → lihat request log
- [ ] Check Google Sheets → data tersimpan dengan benar

---

## Common Workflows

### Workflow 1: Rapid Testing

```bash
# Terminal 1
npm start

# Terminal 2 (in different window)
ngrok http 3000

# Terminal 3 (copy ngrok URL from terminal 2)
TELEGRAM_TOKEN=xxx node scripts/set-webhook.js https://xyz.ngrok.io

# Terminal 4
# Buka Telegram, kirim pesan ke bot
# Monitor Terminal 1 untuk logs
```

### Workflow 2: Debug Parser

```bash
# Quick test parser tanpa perlu Telegram:
node -e "
const { parseTransaction, formatRupiah } = require('./lib/parser');
const result = parseTransaction('50000 makan siang');
console.log(result);
"
```

### Workflow 3: Debug Sheets Integration

```bash
# Test Sheets connection (masukkan di Node REPL atau temporary script):
const { appendTransaction } = require('./lib/sheets');
const result = await appendTransaction({
  nominal: 50000,
  jenis: 'Pengeluaran',
  kategori: 'Makanan',
  keterangan: 'Test',
  tanggalTransaksi: '12/12/2024'
});
console.log('Row added:', result);
```

### Workflow 4: Production Deployment After Testing

```bash
# 1. Set env vars di Vercel Dashboard

# 2. Deploy
vercel --prod

# 3. Get production URL, register webhook
TELEGRAM_TOKEN=xxx node scripts/set-webhook.js https://your-app.vercel.app

# 4. Test di production
# (bot sekarang ke Vercel, bukan lokal)
```

---

## Troubleshooting Checklist

| Problem | Debug Steps |
|---------|------------|
| **Bot tidak respond** | 1) Cek server jalan (Terminal 1)<br>2) Cek ngrok tunnel aktif (Terminal 2)<br>3) Cek webhook registered: `scripts/check-webhook.js`<br>4) Cek Chat ID di .env.local<br>5) Monitor ngrok dashboard |
| **Webhook error: connection_failed** | Restart ngrok (buat URL baru), update webhook |
| **Google Sheets tidak update** | 1) Cek GOOGLE_SERVICE_ACCOUNT_JSON di .env.local<br>2) Cek service account email shared ke Sheets<br>3) Cek Sheets API enabled<br>4) Monitor Terminal 1 for [SHEETS] errors |
| **Parser tidak recognize input** | Test parser di Node: `node -e "const p = require('./lib/parser'); console.log(p.parseTransaction('50k makan'))"` |
| **ngrok timeout after hours** | ngrok URL expire. Restart Terminal 2, update webhook URL |

---

## Pro Tips

1. **Keep ngrok dashboard open** → http://127.0.0.1:4040 untuk lihat real-time request/response
2. **Terminal logs are your friend** → Terminal 1 akan print semua webhook incoming + errors
3. **Use curl to test endpoint directly** → tidak perlu buka Telegram, langsung test HTTP
4. **Monitor Google Drive** → buka Sheets, refresh, lihat data live update setiap kirim transaksi
5. **Save ngrok URL** → jangan restart ngrok di tengah testing, kalo perlu, daftarkan ulang webhooknya

