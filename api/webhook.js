// api/webhook.js
// ─────────────────────────────────────────────────────────────────────────────
// Entry point utama — Vercel Serverless Function.
// URL: https://<your-app>.vercel.app/api/webhook
//
// Telegram mengirim POST request ke sini setiap ada pesan masuk.
// ─────────────────────────────────────────────────────────────────────────────

const { ALLOWED_CHAT_IDS } = require("../lib/config");
const {
  handleStart,
  handleHelp,
  handleUndo,
  handleCallbackQuery,
  handleTextMessage,
} = require("../lib/handlers");

/**
 * Vercel Serverless Function handler.
 * @param {import('@vercel/node').VercelRequest} req
 * @param {import('@vercel/node').VercelResponse} res
 */
async function handler(req, res) {
  // Vercel otomatis parse JSON body
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Telegram selalu mengirim JSON, tapi jaga-jaga
  const update = req.body;

  if (!update) {
    return res.status(400).json({ error: "Empty body" });
  }

  try {
    await processUpdate(update);
  } catch (err) {
    // Log error tapi tetap return 200 ke Telegram
    // Jika return non-200, Telegram akan retry terus-menerus
    console.error("[WEBHOOK] Unhandled error:", err);
  }

  // Selalu return 200 ke Telegram agar tidak ada retry spam
  return res.status(200).json({ ok: true });
}

/**
 * Routing utama berdasarkan tipe update dari Telegram.
 * @param {object} update - Telegram Update object
 */
async function processUpdate(update) {
  // ── Callback Query (tombol inline keyboard) ───────────────────────────────
  if (update.callback_query) {
    const { id, from, data, message } = update.callback_query;
    const chatId = from.id;

    if (!isAllowed(chatId)) {
      console.warn(`[SECURITY] Blocked callback from chat_id: ${chatId}`);
      return;
    }

    await handleCallbackQuery(chatId, data, message?.message_id);
    return;
  }

  // ── Regular Message ───────────────────────────────────────────────────────
  if (!update.message) return;

  const { message } = update;
  const chatId = message.chat.id;
  const text = message.text || "";

  // ── FR-01: Security Whitelisting ──────────────────────────────────────────
  if (!isAllowed(chatId)) {
    console.warn(`[SECURITY] Blocked message from unauthorized chat_id: ${chatId}`);
    // Diam saja, jangan balas — tidak perlu beri tahu bot ada di sini
    return;
  }

  // ── Command Routing ───────────────────────────────────────────────────────
  if (text.startsWith("/")) {
    const command = text.split(" ")[0].toLowerCase();

    switch (command) {
      case "/start":
        return handleStart(chatId);

      case "/help":
        return handleHelp(chatId);

      case "/undo":
        return handleUndo(chatId);

      default:
        // Command tidak dikenal
        return; // Diam saja untuk command asing
    }
  }

  // ── Text Message (Pencatatan Transaksi) ───────────────────────────────────
  if (text) {
    return handleTextMessage(chatId, text);
  }

  // ── Tipe pesan lain (foto, stiker, dll) — Fase 2 ─────────────────────────
  // Foto akan ditangani di Fase 2 (OCR Struk)
  if (message.photo) {
    return; // Placeholder — akan diimplementasikan di Fase 2
  }
}

/**
 * Cek apakah chat ID diizinkan.
 * FR-01: Security Whitelisting
 * @param {number|string} chatId
 */
function isAllowed(chatId) {
  if (!ALLOWED_CHAT_IDS || ALLOWED_CHAT_IDS.length === 0) {
    console.error("[SECURITY] ALLOWED_CHAT_IDS is empty — blocking all requests");
    return false;
  }
  return ALLOWED_CHAT_IDS.includes(String(chatId));
}

// Export untuk Vercel + local server.js
module.exports = handler;
