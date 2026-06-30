// lib/handlers.js
// ─────────────────────────────────────────────────────────────────────────────
// Handler untuk setiap jenis pesan/command dari Telegram.
// Setiap handler menerima (chatId, message) dan mengembalikan Promise.
// ─────────────────────────────────────────────────────────────────────────────

const { sendMessage, sendMarkdown, escapeMarkdown } = require("./telegram");
const { appendTransaction, deleteRow, getLastRow } = require("./sheets");
const { parseTransaction, formatRupiah } = require("./parser");

// In-memory store untuk last row per user (untuk /undo)
// Di Vercel serverless, ini akan reset tiap cold start — cukup untuk kebutuhan personal
// karena /undo biasanya dilakukan langsung setelah input salah.
const lastRowStore = new Map();

// ── Command Handlers ──────────────────────────────────────────────────────────

/**
 * /start — Pesan sambutan
 */
async function handleStart(chatId) {
  const text =
    `👋 *Halo\\! Selamat datang di Tele\\-Finance Bot*\n\n` +
    `Bot ini membantu kamu mencatat keuangan pribadi langsung dari Telegram\\.\n\n` +
    `Ketuk /help untuk melihat cara penggunaan\\.`;

  return sendMarkdown(chatId, text);
}

/**
 * /help — Panduan penggunaan
 */
async function handleHelp(chatId) {
  const text =
    `📖 *Cara Penggunaan Bot*\n\n` +
    `*Format Pencatatan Transaksi:*\n` +
    `\`\\[nominal\\] \\[keterangan\\]\`\n\n` +
    `*Contoh Pengeluaran:*\n` +
    `• \`50000 makan siang warteg\`\n` +
    `• \`25k kopi di cafe\`\n` +
    `• \`1\\.5jt bayar kos bulan ini\`\n` +
    `• \`150k gojek ke bandara\`\n\n` +
    `*Contoh Pemasukan \\(awali dengan \\+\\):*\n` +
    `• \`\\+500k gaji freelance\`\n` +
    `• \`\\+2jt transfer dari klien\`\n\n` +
    `*Satuan yang didukung:*\n` +
    `• \`k\` / \`rb\` / \`ribu\` → ribuan\n` +
    `• \`jt\` / \`juta\` → jutaan\n` +
    `• Angka penuh: \`50000\`, \`1500000\`\n\n` +
    `*Perintah:*\n` +
    `• /start — Pesan sambutan\n` +
    `• /help — Panduan ini\n` +
    `• /undo — Hapus transaksi terakhir`;

  return sendMarkdown(chatId, text);
}

/**
 * /undo — Hapus transaksi terakhir
 */
async function handleUndo(chatId) {
  try {
    await sendMessage(chatId, "🔍 Mengambil data transaksi terakhir...");

    const lastRow = await getLastRow();

    if (!lastRow) {
      return sendMessage(chatId, "⚠️ Tidak ada transaksi yang bisa dihapus.");
    }

    const { rowNumber, jenis, nominal, kategori, keterangan, timestamp } = lastRow;

    // Tampilkan preview dan minta konfirmasi
    const preview =
      `⚠️ *Konfirmasi Hapus Transaksi*\n\n` +
      `📅 *Waktu:* ${escapeMarkdown(timestamp)}\n` +
      `💰 *Jenis:* ${escapeMarkdown(jenis)}\n` +
      `💵 *Nominal:* ${escapeMarkdown(formatRupiah(nominal))}\n` +
      `🏷️ *Kategori:* ${escapeMarkdown(kategori)}\n` +
      `📝 *Keterangan:* ${escapeMarkdown(keterangan)}\n\n` +
      `Ketuk tombol di bawah untuk konfirmasi\\.`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: "✅ Ya, Hapus", callback_data: `undo_confirm:${rowNumber}` },
          { text: "❌ Batal", callback_data: "undo_cancel" },
        ],
      ],
    };

    // return sendMarkdown(chatId, preview, { reply_markup: keyboard });
    return sendMessage(chatId, preview, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard
    });
  } catch (err) {
    console.error("[HANDLER] /undo error:", err);
    return sendMessage(chatId, `❌ Gagal mengambil data: ${err.message}`);
  }
}

/**
 * Callback query handler (untuk tombol inline keyboard)
 */
async function handleCallbackQuery(chatId, data, messageId) {
  if (data === "undo_cancel") {
    return sendMessage(chatId, "👍 Oke, transaksi tidak dihapus.");
  }

  if (data.startsWith("undo_confirm:")) {
    const rowNumber = parseInt(data.split(":")[1]);

    try {
      await sendMessage(chatId, "🗑️ Menghapus transaksi...");
      await deleteRow(rowNumber);
      return sendMessage(chatId, "✅ Transaksi berhasil dihapus!");
    } catch (err) {
      console.error("[HANDLER] undo_confirm error:", err);
      return sendMessage(chatId, `❌ Gagal menghapus: ${err.message}`);
    }
  }
}

/**
 * Handler pesan teks biasa (pencatatan transaksi).
 * Mendukung single-line dan multi-line (batch) input.
 */
async function handleTextMessage(chatId, text) {
  if (!text || text.trim().length < 3) {
    return sendMessage(
      chatId,
      "⚠️ Pesan terlalu pendek. Ketuk /help untuk format pencatatan."
    );
  }

  // Deteksi multi-baris: split per baris, abaikan baris kosong
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  if (lines.length > 1) {
    return handleBatchMessage(chatId, lines);
  }

  // Single-line — behavior existing
  return handleSingleLine(chatId, text.trim());
}

/**
 * Proses satu baris transaksi (single-line).
 */
async function handleSingleLine(chatId, text) {
  const parsed = parseTransaction(text);

  if (!parsed) {
    return sendMessage(
      chatId,
      `❓ Format tidak dikenali.\n\nContoh: \`50000 makan siang\` atau \`25k kopi\`\n\nKetuk /help untuk panduan lengkap.`,
      { parse_mode: "Markdown" }
    );
  }

  try {
    await sendMessage(chatId, "💾 Menyimpan transaksi...");

    const result = await appendTransaction({
      ...parsed,
      sumberData: "Teks Manual",
    });

    lastRowStore.set(chatId, result.rowNumber);

    const emoji = parsed.jenis === "Pemasukan" ? "💚" : "🔴";
    const jenisLabel = parsed.jenis === "Pemasukan" ? "Pemasukan" : "Pengeluaran";

    const confirmation =
      `${emoji} *Transaksi Dicatat\\!*\n\n` +
      `💵 *${escapeMarkdown(jenisLabel)}:* ${escapeMarkdown(formatRupiah(parsed.nominal))}\n` +
      `🏷️ *Kategori:* ${escapeMarkdown(parsed.kategori)}\n` +
      `📝 *Keterangan:* ${escapeMarkdown(parsed.keterangan)}\n` +
      `📅 *Tanggal:* ${escapeMarkdown(parsed.tanggalTransaksi)}\n\n` +
      `_Salah input\\? Gunakan /undo_`;

    return sendMarkdown(chatId, confirmation);
  } catch (err) {
    console.error("[HANDLER] appendTransaction error:", err);
    return sendMessage(
      chatId,
      `❌ Gagal menyimpan transaksi: ${err.message}`
    );
  }
}

/**
 * Proses batch multi-baris: setiap baris = satu transaksi.
 * Mengumpulkan hasil sukses/gagal lalu membalas dengan ringkasan.
 */
async function handleBatchMessage(chatId, lines) {
  await sendMessage(chatId, `💾 Memproses ${lines.length} transaksi...`);

  const results = [];
  let total = 0;
  let lastRowNumber = null;

  for (const line of lines) {
    const parsed = parseTransaction(line);

    if (!parsed) {
      results.push({ success: false, line });
      continue;
    }

    try {
      const result = await appendTransaction({
        ...parsed,
        sumberData: "Teks Manual",
      });

      lastRowNumber = result.rowNumber;
      results.push({ success: true, ...parsed });
      total += parsed.nominal;
    } catch (err) {
      console.error("[HANDLER] batch append error:", err);
      results.push({ success: false, line, error: err.message });
    }
  }

  // Simpan row number terakhir untuk /undo
  if (lastRowNumber) {
    lastRowStore.set(chatId, lastRowNumber);
  }

  // Bangun pesan ringkasan
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;

  if (successCount === 0) {
    return sendMessage(
      chatId,
      `❓ Tidak ada baris yang berhasil diproses.\n\nContoh: \`50000 makan siang\` atau \`25k kopi\`\n\nKetuk /help untuk panduan lengkap.`,
      { parse_mode: "Markdown" }
    );
  }

  let summary = `📊 *Batch Tercatat:* ${successCount} transaksi`;
  if (failCount > 0) {
    summary += ` \\(${failCount} gagal\\)`;
  }
  summary += `\n\n`;

  for (const r of results) {
    if (r.success) {
      const label = r.jenis === "Pemasukan" ? "💚" : "🔴";
      summary += `${label} ${escapeMarkdown(r.keterangan || "(tanpa keterangan)")} — ${escapeMarkdown(formatRupiah(r.nominal))} \\(${escapeMarkdown(r.kategori)}\\)\n`;
    } else {
      summary += `⚠️ _${escapeMarkdown(r.line)}_ — format tidak dikenali\n`;
    }
  }

  summary += `\n💰 *Total:* ${escapeMarkdown(formatRupiah(total))}`;

  if (failCount === 0) {
    summary += `\n\n_Salah input\\? Gunakan /undo_`;
  }

  return sendMarkdown(chatId, summary);
}

module.exports = {
  handleStart,
  handleHelp,
  handleUndo,
  handleCallbackQuery,
  handleTextMessage,
};
