// lib/handlers.js
// ─────────────────────────────────────────────────────────────────────────────
// Handler untuk setiap jenis pesan/command dari Telegram.
// Setiap handler menerima (chatId, message) dan mengembalikan Promise.
// ─────────────────────────────────────────────────────────────────────────────

const { sendMessage, sendMarkdown, escapeMarkdown } = require("./telegram");
const { appendTransaction, deleteRow, getLastRow, getAllTransactions } = require("./sheets");
const { parseTransaction, formatRupiah } = require("./parser");
const {
  getTodayTransactions,
  getThisWeekTransactions,
  getThisMonthTransactions,
  getLastMonthTransactions,
  getLastN,
  computeStats,
  generateReport,
  generateHistoryReport,
  computeDailyInsight,
  computeWeeklyInsight,
  computeMonthlyInsight,
  formatDate,
  getWeekStart,
  getMonthRange,
  nowWIB,
} = require("./reports");

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

    const { rowNumber, jenis, nominal, kategori, keterangan, sof, timestamp } = lastRow;

    // Tampilkan preview dan minta konfirmasi
    const preview =
      `⚠️ *Konfirmasi Hapus Transaksi*\n\n` +
      `📅 *Waktu:* ${escapeMarkdown(timestamp)}\n` +
      `💰 *Jenis:* ${escapeMarkdown(jenis)}\n` +
      `💵 *Nominal:* ${escapeMarkdown(formatRupiah(nominal))}\n` +
      `🏷️ *Kategori:* ${escapeMarkdown(kategori)}\n` +
      `📝 *Keterangan:* ${escapeMarkdown(keterangan)}\n` +
      `🏦 *Source:* ${escapeMarkdown(sof)}\n\n` +
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

  const trimmed = text.trim().toLowerCase();

  // ── Keyword Monitoring ──────────────────────────────────────────────────
  if (trimmed === "hari ini") return handleHarian(chatId);
  if (trimmed === "minggu ini") return handleMingguan(chatId);
  if (trimmed === "bulan ini") return handleBulanan(chatId);
  if (trimmed === "riwayat") return handleRiwayat(chatId);

  // ── Multi-baris / Single-line ────────────────────────────────────────────
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  if (lines.length > 1) {
    return handleBatchMessage(chatId, lines);
  }

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
      `🏦 *Source:* ${escapeMarkdown(parsed.sof)}\n` +
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
      summary += `${label} ${escapeMarkdown(r.keterangan || "(tanpa keterangan)")} — ${escapeMarkdown(formatRupiah(r.nominal))} \\(${escapeMarkdown(r.kategori)}\\) @${escapeMarkdown(r.sof)}\n`;
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

// ── Monitoring Handlers ──────────────────────────────────────────────────────

async function handleHarian(chatId) {
  try {
    await sendMessage(chatId, "🔍 Mengambil laporan harian...");

    const allRows = await getAllTransactions();
    const today = getTodayTransactions(allRows);
    const stats = computeStats(today, 1);

    const insight = computeDailyInsight(allRows, stats.total);
    const report = generateReport(stats, "Hari Ini", insight);

    return sendMarkdown(chatId, report);
  } catch (err) {
    console.error("[HANDLER] hari ini error:", err);
    return sendMessage(chatId, `❌ Gagal membuat laporan: ${err.message}`);
  }
}

async function handleMingguan(chatId) {
  try {
    await sendMessage(chatId, "🔍 Mengambil laporan mingguan...");

    const allRows = await getAllTransactions();
    const thisWeek = getThisWeekTransactions(allRows);

    const weekStart = getWeekStart();
    const today = nowWIB();
    const diffDays = Math.max(1, Math.ceil((today.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const stats = computeStats(thisWeek, diffDays);
    const insight = computeWeeklyInsight(allRows, stats.total);

    const label = `${formatDate(weekStart)} - ${formatDate(today)}`;
    const report = generateReport(stats, `Minggu Ini (${label})`, insight);

    return sendMarkdown(chatId, report);
  } catch (err) {
    console.error("[HANDLER] minggu ini error:", err);
    return sendMessage(chatId, `❌ Gagal membuat laporan: ${err.message}`);
  }
}

async function handleBulanan(chatId) {
  try {
    await sendMessage(chatId, "🔍 Mengambil laporan bulanan...");

    const allRows = await getAllTransactions();
    const thisMonth = getThisMonthTransactions(allRows);
    const lastMonth = getLastMonthTransactions(allRows);

    const { start, end } = getMonthRange();
    const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    const stats = computeStats(thisMonth, diffDays);

    let insight = null;
    const monthlyInsight = computeMonthlyInsight(lastMonth, stats.total);
    if (monthlyInsight) {
      insight = {
        avgLabel: "Bulan lalu",
        avgValue: monthlyInsight.lastMonthTotal,
        currentTotal: monthlyInsight.thisMonthTotal,
        pctDiff: monthlyInsight.pctDiff,
        isHigher: monthlyInsight.isHigher,
      };
    }

    const label = `${formatDate(start)} - ${formatDate(end)}`;
    const report = generateReport(stats, `Bulan Ini (${label})`, insight);

    return sendMarkdown(chatId, report);
  } catch (err) {
    console.error("[HANDLER] bulan ini error:", err);
    return sendMessage(chatId, `❌ Gagal membuat laporan: ${err.message}`);
  }
}

async function handleRiwayat(chatId) {
  try {
    await sendMessage(chatId, "🔍 Mengambil riwayat transaksi...");

    const allRows = await getAllTransactions();
    const last5 = getLastN(allRows, 5);
    const report = generateHistoryReport(last5);

    return sendMarkdown(chatId, report);
  } catch (err) {
    console.error("[HANDLER] riwayat error:", err);
    return sendMessage(chatId, `❌ Gagal mengambil riwayat: ${err.message}`);
  }
}

module.exports = {
  handleStart,
  handleHelp,
  handleUndo,
  handleCallbackQuery,
  handleTextMessage,
};
