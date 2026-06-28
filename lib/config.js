// lib/config.js
// ─────────────────────────────────────────────────────────────────────────────
// Central config — semua nilai sensitif dibaca dari environment variables.
// Jangan pernah hardcode token/key di sini.
// ─────────────────────────────────────────────────────────────────────────────

const config = {
  // Telegram
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,

  // Whitelist: Chat ID yang boleh pakai bot (pisahkan dengan koma di env var)
  // Contoh env: ALLOWED_CHAT_IDS=123456789,987654321
  ALLOWED_CHAT_IDS: (process.env.ALLOWED_CHAT_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),

  // Google Sheets
  SPREADSHEET_ID: process.env.SPREADSHEET_ID,
  SHEET_NAME: process.env.SHEET_NAME || "Transaksi",

  // Service Account credentials (paste seluruh JSON sebagai satu env var)
  GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
};

// Validasi saat startup (akan muncul di Vercel Function logs)
const required = ["TELEGRAM_TOKEN", "ALLOWED_CHAT_IDS", "SPREADSHEET_ID", "GOOGLE_SERVICE_ACCOUNT_JSON"];
for (const key of required) {
  const val = config[key];
  const isEmpty = Array.isArray(val) ? val.length === 0 : !val;
  if (isEmpty) {
    console.error(`[CONFIG] Missing required env var: ${key}`);
  }
}

module.exports = config;
