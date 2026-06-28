# Tele-Finance Bot — Fase 1

Bot Telegram pencatatan keuangan pribadi.  
Stack: **Vercel Serverless** + **Google Sheets** (via Service Account).  
Zero dependencies eksternal — hanya Node.js built-in.

---

## Struktur Project

```
tele-finance-bot/
├── api/
│   └── webhook.js          ← Vercel serverless function (entry point)
├── lib/
│   ├── config.js           ← Baca env vars, validasi startup
│   ├── telegram.js         ← Wrapper Telegram Bot API
│   ├── sheets.js           ← Google Sheets via REST API + JWT auth
│   ├── parser.js           ← Regex parser transaksi + auto-kategorisasi
│   └── handlers.js         ← Logic handler per command/pesan
├── scripts/
│   └── set-webhook.js      ← Daftarkan webhook URL ke Telegram
├── .env.example            ← Template env vars
├── .gitignore
├── package.json
└── vercel.json
```

---

## Setup (Langkah demi Langkah)

### Langkah 1: Buat Telegram Bot

1. Buka Telegram, cari **@BotFather**
2. Kirim `/newbot`, ikuti instruksi
3. Simpan **Bot Token** (format: `1234567890:AABBcc...`)
4. Cari **@userinfobot**, kirim pesan apa saja → catat **Chat ID** kamu

---

### Langkah 2: Siapkan Google Sheets

1. Buka [Google Sheets](https://sheets.google.com), buat spreadsheet baru
2. Rename tab pertama menjadi `Transaksi`
3. Tambahkan header di baris pertama:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Timestamp | Tanggal Transaksi | Jenis | Nominal | Kategori | Keterangan | Sumber Data |

4. Catat **Spreadsheet ID** dari URL:  
   `https://docs.google.com/spreadsheets/d/**SPREADSHEET_ID**/edit`

---

### Langkah 3: Buat Google Service Account

1. Buka [Google Cloud Console](https://console.cloud.google.com)
2. Buat project baru (atau pilih yang sudah ada)
3. Aktifkan **Google Sheets API**:
   - Menu → APIs & Services → Library
   - Cari "Google Sheets API" → Enable
4. Buat Service Account:
   - Menu → APIs & Services → Credentials
   - Create Credentials → Service Account
   - Isi nama (misal: `tele-finance-bot`)
   - Klik Done (skip role assignment)
5. Download JSON key:
   - Klik service account yang baru dibuat
   - Tab **Keys** → Add Key → Create new key → JSON
   - File JSON akan terdownload otomatis
6. **Share Google Sheets** ke service account:
   - Buka spreadsheet
   - Klik Share → tambahkan email service account (ada di JSON, field `client_email`)
   - Beri role **Editor**
   - Uncheck "Notify people" → Share

---

### Langkah 4: Deploy ke Vercel

```bash
# Clone / copy project ini
cd tele-finance-bot

# Install Vercel CLI (jika belum)
npm install -g vercel

# Login Vercel
vercel login

# Deploy
vercel --prod
```

Catat URL deployment, contoh: `https://tele-finance-bot.vercel.app`

---

### Langkah 5: Set Environment Variables di Vercel

Masuk ke [Vercel Dashboard](https://vercel.com) → Project → **Settings** → **Environment Variables**.

Tambahkan variabel berikut:

| Variable | Value |
|----------|-------|
| `TELEGRAM_TOKEN` | Token dari BotFather |
| `ALLOWED_CHAT_IDS` | Chat ID kamu (bisa multiple, pisah koma: `123,456`) |
| `SPREADSHEET_ID` | ID spreadsheet Google Sheets |
| `SHEET_NAME` | `Transaksi` (atau nama tab lain) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Seluruh isi file JSON service account (satu baris) |

> **Tips untuk `GOOGLE_SERVICE_ACCOUNT_JSON`:**  
> Buka file JSON service account, copy seluruh isinya (termasuk kurung kurawal).  
> Paste langsung di kolom value Vercel — Vercel bisa handle JSON multi-baris.

Setelah set env vars, **redeploy** agar env terbaca:
```bash
vercel --prod
```

---

### Langkah 6: Daftarkan Webhook ke Telegram

```bash
TELEGRAM_TOKEN=xxx node scripts/set-webhook.js https://tele-finance-bot.vercel.app
```

Output sukses:
```
✅ Webhook berhasil didaftarkan!

📋 Webhook Info:
   URL          : https://tele-finance-bot.vercel.app/api/webhook
   Pending count: 0
   Last error   : —
```

---

## Cara Pakai Bot

### Format Pencatatan

```
[nominal] [keterangan]
```

**Pengeluaran (default):**
```
50000 makan siang warteg
25k kopi di cafe
1.5jt bayar kos
150k gojek ke bandara
```

**Pemasukan (awali dengan +):**
```
+500k gaji freelance
+2jt transfer dari klien
```

**Satuan yang didukung:**
- `k` / `rb` / `ribu` → ×1.000
- `jt` / `juta` → ×1.000.000
- Angka penuh: `50000`, `1500000`

### Commands

| Command | Fungsi |
|---------|--------|
| `/start` | Pesan sambutan |
| `/help` | Panduan penggunaan |
| `/undo` | Hapus transaksi terakhir (dengan konfirmasi) |

### Auto-Kategorisasi

Bot otomatis menebak kategori berdasarkan kata kunci di keterangan:

| Kategori | Kata Kunci |
|----------|-----------|
| Makanan | makan, kopi, warung, bakso, nasi, snack, ... |
| Transportasi | gojek, grab, ojek, bus, kereta, bensin, parkir, ... |
| Belanja | alfamart, indomaret, shopee, tokopedia, ... |
| Tagihan | listrik, air, internet, pulsa, kos, cicilan, ... |
| Hiburan | netflix, spotify, bioskop, game, ... |
| Kesehatan | obat, dokter, apotek, vitamin, bpjs, ... |
| Pendidikan | kursus, buku, udemy, sekolah, ... |

---

## Troubleshooting

**Bot tidak merespons:**
- Cek webhook terdaftar: `https://api.telegram.org/botTOKEN/getWebhookInfo`
- Cek Vercel Function logs di dashboard
- Pastikan Chat ID kamu ada di `ALLOWED_CHAT_IDS`

**Error "Failed to get access token":**
- Pastikan `GOOGLE_SERVICE_ACCOUNT_JSON` berisi JSON yang valid
- Pastikan Sheets API sudah diaktifkan di Google Cloud Console
- Pastikan service account email sudah di-share ke spreadsheet sebagai Editor

**Transaksi tidak masuk ke Sheets:**
- Cek nama tab sama persis dengan `SHEET_NAME`
- Pastikan header sudah ada di baris pertama
- Cek Vercel logs untuk detail error

---

## Fase Berikutnya (Roadmap)

- **Fase 2:** OCR Struk via foto (Gemini Vision API)
- **Fase 3:** Dashboard visual di Sheets + `/undo` by keyword + auto-kategorisasi lebih cerdas
