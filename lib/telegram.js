// lib/telegram.js
// ─────────────────────────────────────────────────────────────────────────────
// Thin wrapper untuk Telegram Bot API.
// Semua komunikasi keluar ke Telegram ada di sini.
// ─────────────────────────────────────────────────────────────────────────────

const { TELEGRAM_TOKEN } = require("./config");

const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

/**
 * Kirim request ke Telegram API.
 * @param {string} method  - Nama method Telegram (sendMessage, dll)
 * @param {object} payload - Body JSON
 */
async function callTelegram(method, payload) {
  const res = await fetch(`${BASE_URL}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!data.ok) {
    console.error(`[TELEGRAM] ${method} failed:`, JSON.stringify(data));
  }

  return data;
}

/**
 * Kirim pesan teks biasa.
 * @param {number|string} chatId
 * @param {string} text
 * @param {object} extra - Opsi tambahan (parse_mode, reply_markup, dll)
 */
async function sendMessage(chatId, text, extra = {}) {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    ...extra,
  });
}

/**
 * Kirim pesan dengan format Markdown V2.
 * Karakter spesial di teks biasa harus di-escape sebelum dikirim.
 * @param {number|string} chatId
 * @param {string} text - Teks sudah dalam format MarkdownV2
 */
async function sendMarkdown(chatId, text) {
  return sendMessage(chatId, text, { parse_mode: "MarkdownV2" });
}

/**
 * Escape karakter spesial untuk MarkdownV2.
 * Wajib dipakai untuk teks dinamis agar tidak error parse.
 * @param {string} text
 */
function escapeMarkdown(text) {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

module.exports = { sendMessage, sendMarkdown, escapeMarkdown };
