# ⚡ WSL Testing — Quick Reference Card

## The 5-Minute Setup

```bash
# 1. Install dependencies & validate env
./scripts/quickstart-dev.sh

# 2. Edit .env.local (IMPORTANT!)
nano .env.local
# Masukkan: TELEGRAM_TOKEN, ALLOWED_CHAT_IDS, SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_JSON

# 3. Terminal 1 — Start server
npm start

# 4. Terminal 2 — Start tunnel
ngrok http 3000
# Copy ngrok URL: https://abc123def456.ngrok.io

# 5. Terminal 3 — Register webhook
TELEGRAM_TOKEN=your_token_here node scripts/set-webhook.js https://abc123def456.ngrok.io

# 6. Terminal 4 — Test Telegram
# Send: /start, /help, 50000 makan siang, +500k gaji, /undo
```

---

## File Structure

```
tele-finance-bot/
├── api/webhook.js              ← Vercel function entry point
├── lib/
│   ├── config.js               ← Environment & config validation
│   ├── handlers.js             ← Command handlers (/start, /help, /undo)
│   ├── parser.js               ← Text parser + auto-categorization
│   ├── sheets.js               ← Google Sheets integration (JWT auth)
│   └── telegram.js             ← Telegram Bot API wrapper
├── scripts/
│   ├── quickstart-dev.sh       ← Setup validation (run first!)
│   ├── set-webhook.js          ← Register webhook URL to Telegram
│   ├── check-webhook.js        ← Check current webhook status
│   └── test-webhook.sh         ← Test with curl (no Telegram needed)
├── server.js                   ← Local dev server
├── package.json                ← Dependencies (only dotenv)
├── .env.local                  ← Local config (create from .env.example)
├── .env.example                ← Template
├── README.md                   ← Main docs
├── TESTING_LOCAL.md            ← Detailed testing guide
└── TESTING_REFERENCE.md        ← Architecture + command reference
```

---

## Key Env Vars (.env.local)

| Variable | Where to get | Format |
|----------|-------------|--------|
| `TELEGRAM_TOKEN` | @BotFather → `/newbot` | `1234567890:AABBcc...` |
| `ALLOWED_CHAT_IDS` | @userinfobot → send any message | `123456789` (only 1 for testing) |
| `SPREADSHEET_ID` | Google Sheets URL | URL: `.../d/SPREADSHEET_ID/edit` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Cloud Console → Service Account | Entire JSON file (1 line) |
| `SHEET_NAME` | Google Sheets tab name | `Transaksi` (default) |

---

## Testing Commands

### Option A: Telegram Client (Real)

1. Open Telegram
2. Find your bot (@YourBotName)
3. Send messages:
   - `/start` → bot should greet
   - `/help` → show usage guide
   - `50000 makan` → parse & save
   - `/undo` → delete last transaction

### Option B: Using curl (No Telegram)

```bash
# Terminal 3 — Test endpoint (server harus running di Terminal 1)
./scripts/test-webhook.sh
```

This script sends 5 test payloads:
- ✓ /start command
- ✓ /help command
- ✓ Valid transaction (50k makan)
- ✓ Income transaction (+500k gaji)
- ✓ Invalid format (rejected)

---

## Monitoring & Debug

### Terminal 1 (npm start) Logs
```
[WEBHOOK] Incoming update:
{ update_id: 1, message: { ... } }

[HANDLER] appendTransaction error: ...
[SHEETS] ...
```

### ngrok Dashboard (live)
```
Open: http://127.0.0.1:4040
Shows: All HTTP requests, responses, timing
```

### Check Webhook Status
```bash
TELEGRAM_TOKEN=xxx node scripts/check-webhook.js
# Shows: URL, pending count, last error
```

### Google Sheets Live
Open spreadsheet in Google Drive, refresh, data appears in realtime.

---

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| "Bot tidak respond" | 1) Check npm start running<br>2) Check ngrok tunnel active<br>3) Check webhook registered: `scripts/check-webhook.js` |
| "Webhook error: connection_failed" | Restart ngrok, update webhook URL with new ngrok URL |
| "Google Sheets tidak update" | 1) Check GOOGLE_SERVICE_ACCOUNT_JSON is valid JSON<br>2) Check service account email shared to Sheets<br>3) Monitor Terminal 1 [SHEETS] logs |
| "ngrok URL invalid" | Each ngrok session gets new URL. Update webhook after restart. |
| ".env.local not found" | Run `cp .env.example .env.local` then edit |

---

## Deployment Checklist

Before `vercel --prod`:

- [ ] Tested all `/start`, `/help`, `/undo`, text input locally
- [ ] Google Sheets has data from local testing
- [ ] ngrok webhook working (check with `scripts/check-webhook.js`)
- [ ] .env.local has all required vars
- [ ] Ready to add these env vars to Vercel Dashboard:
  - TELEGRAM_TOKEN
  - ALLOWED_CHAT_IDS
  - SPREADSHEET_ID
  - GOOGLE_SERVICE_ACCOUNT_JSON

Then:
```bash
vercel --prod
TELEGRAM_TOKEN=xxx node scripts/set-webhook.js https://your-app.vercel.app
```

---

## Next Steps (Fase 2)

After Phase 1 testing is done:
- [ ] Phase 2: Add photo receipt OCR (Gemini Vision API)
- [ ] Phase 3: Dashboard visualization in Sheets
- [ ] Phase 3: Better auto-categorization

---

## Docs Map

- **Quick Start?** → This card (you're reading it!)
- **Detailed Setup?** → [`TESTING_LOCAL.md`](./TESTING_LOCAL.md)
- **Architecture?** → [`TESTING_REFERENCE.md`](./TESTING_REFERENCE.md)
- **Production Deploy?** → [`README.md`](./README.md)
- **Code Details?** → Comments in `lib/` files

---

**Good luck! Monitor Terminal 1 logs closely — they tell you everything.** 🚀
