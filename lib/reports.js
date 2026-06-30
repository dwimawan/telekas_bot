// lib/reports.js
// ─────────────────────────────────────────────────────────────────────────────
// Query, agregasi, dan formatting laporan keuangan dari Google Sheets.
// Digunakan oleh handler monitoring: hari ini, minggu ini, bulan ini, riwayat.
// ─────────────────────────────────────────────────────────────────────────────

const { getAllTransactions } = require("./sheets");
const { formatRupiah } = require("./parser");

// ── Konfigurasi Periode ───────────────────────────────────────────────────────

const MONTHLY_START_DATE = 25;     // Tanggal awal siklus bulanan (default: 25)
const WEEKLY_START_DAY = "Monday"; // Hari awal siklus mingguan (default: Monday)

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── Helper: Tanggal Lokal (WIB) ───────────────────────────────────────────────

/**
 * Return objek Date yang mewakili "sekarang" di zona WIB.
 * Tidak mengubah timezone sistem, hanya menggeser offset.
 */
function nowWIB() {
  const n = new Date();
  // WIB = UTC+7 → tambah 7 jam ke UTC
  const offsetMs = 7 * 60 * 60 * 1000;
  return new Date(n.getTime() + offsetMs);
}

/**
 * Parse string tanggal DD/MM/YYYY ke objek Date (WIB).
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  // Buat sebagai UTC midnight lalu offset ke WIB
  const d = new Date(Date.UTC(
    parseInt(parts[2]),       // year
    parseInt(parts[1]) - 1,   // month (0-indexed)
    parseInt(parts[0]),       // day
    7, 0, 0                   // WIB = UTC+7
  ));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format Date (WIB) ke string DD/MM/YYYY.
 */
function formatDate(d) {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Dapatkan tanggal mulai minggu ini (Senin jam 00:00 WIB).
 */
function getWeekStart() {
  const now = nowWIB();
  const dayIndex = now.getUTCDay(); // 0=Sun, 1=Mon, ...
  const targetIndex = DAY_NAMES.indexOf(WEEKLY_START_DAY);
  let diff = dayIndex - targetIndex;
  if (diff < 0) diff += 7;
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - diff);
  start.setUTCHours(7, 0, 0, 0);
  return start;
}

/**
 * Dapatkan tanggal mulai bulan ini berdasarkan MONTHLY_START_DATE.
 * Logika: jika hari ini >= MONTHLY_START_DATE, mulai dari MONTHLY_START_DATE bulan ini.
 * Jika hari ini < MONTHLY_START_DATE, mulai dari MONTHLY_START_DATE bulan lalu.
 */
function getMonthStart() {
  const now = nowWIB();
  const day = now.getUTCDate();
  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();

  let startMonth = month;
  let startYear = year;
  if (day < MONTHLY_START_DATE) {
    // Mundur satu bulan
    startMonth = month - 1;
    if (startMonth < 0) {
      startMonth = 11;
      startYear = year - 1;
    }
  }

  return new Date(Date.UTC(startYear, startMonth, MONTHLY_START_DATE, 7, 0, 0));
}

// ── Filter Functions ──────────────────────────────────────────────────────────

/**
 * Filter transaksi hari ini (pengeluaran saja).
 */
function getTodayTransactions(rows) {
  const today = formatDate(nowWIB());
  return rows.filter((r) => r.tanggalTransaksi === today && r.jenis === "Pengeluaran");
}

/**
 * Filter transaksi minggu ini (Senin s/d hari ini, pengeluaran saja).
 */
function getThisWeekTransactions(rows) {
  const weekStart = getWeekStart();
  const todayStr = formatDate(nowWIB());

  return rows.filter((r) => {
    if (r.jenis !== "Pengeluaran") return false;
    const d = parseDate(r.tanggalTransaksi);
    if (!d) return false;
    return d >= weekStart && formatDate(d) <= todayStr;
  });
}

/**
 * Filter transaksi bulan ini (MONTHLY_START_DATE s/d hari ini, pengeluaran saja).
 */
function getThisMonthTransactions(rows) {
  const monthStart = getMonthStart();
  const todayStr = formatDate(nowWIB());

  return rows.filter((r) => {
    if (r.jenis !== "Pengeluaran") return false;
    const d = parseDate(r.tanggalTransaksi);
    if (!d) return false;
    return d >= monthStart && formatDate(d) <= todayStr;
  });
}

/**
 * Filter transaksi bulan lalu dengan offset yang sama.
 * Misal: bulan ini 25 Mei - 30 Jun → bulan lalu 25 Mar - 30 Apr
 */
function getLastMonthTransactions(rows) {
  const monthStart = getMonthStart();
  const today = nowWIB();

  // Mundur 1 bulan dari monthStart
  const lastStart = new Date(monthStart);
  lastStart.setUTCMonth(lastStart.getUTCMonth() - 1);

  // Mundur 1 bulan dari today
  const lastEnd = new Date(today);
  lastEnd.setUTCMonth(lastEnd.getUTCMonth() - 1);
  const lastEndStr = formatDate(lastEnd);

  return rows.filter((r) => {
    if (r.jenis !== "Pengeluaran") return false;
    const d = parseDate(r.tanggalTransaksi);
    if (!d) return false;
    return d >= lastStart && formatDate(d) <= lastEndStr;
  });
}

/**
 * Ambil N transaksi terakhir (semua jenis), paling baru = index 0.
 */
function getLastN(rows, n) {
  return rows.slice(-n).reverse();
}

// ── Agregasi / Statistik ──────────────────────────────────────────────────────

/**
 * Hitung statistik dari array transaksi.
 * @returns {{ total, count, byCategory, top3, avgDaily, avgWeekly }}
 */
function computeStats(transactions, periodDays) {
  const total = transactions.reduce((sum, t) => sum + t.nominal, 0);
  const count = transactions.length;

  // Breakdown per kategori
  const catMap = new Map();
  for (const t of transactions) {
    const cat = t.kategori || "Other Category";
    catMap.set(cat, (catMap.get(cat) || 0) + t.nominal);
  }
  const byCategory = Array.from(catMap.entries())
    .map(([name, amount]) => ({ name, amount, pct: total > 0 ? Math.round((amount / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);

  // Top 3
  const sorted = [...transactions].sort((a, b) => b.nominal - a.nominal);
  const top3 = sorted.slice(0, 3);

  // Rata-rata
  const avgDaily = periodDays > 0 ? Math.round(total / periodDays) : total;

  return { total, count, byCategory, top3, avgDaily };
}

// ── Formatting Output ─────────────────────────────────────────────────────────

/**
 * Format rupiah tanpa desimal untuk tampilan.
 */
function rp(n) {
  return formatRupiah(n);
}

/**
 * Escape karakter khusus MarkdownV2.
 */
function esc(text) {
  return String(text || "")
    .replace(/[_*[\]()~`>#+\-=|{}.!/]/g, "\\$&");
}

/**
 * Format laporan statistik ke pesan MarkdownV2 untuk Telegram.
 * @param {object} stats - Hasil dari computeStats()
 * @param {string} label - Label periode (contoh: "Hari Ini", "Minggu Ini")
 * @param {object} insight - { avgLabel, avgValue, currentTotal, pctDiff, isHigher }
 */
function generateReport(stats, label, insight) {
  const lines = [];

  lines.push(`📊 *Laporan ${esc(label)}*`);
  lines.push("");

  if (stats.count === 0) {
    lines.push(`Tidak ada transaksi pengeluaran pada periode ini\\.`);
    return lines.join("\n");
  }

  lines.push(`💰 *Total:* ${esc(rp(stats.total))}`);
  lines.push(`📝 *Transaksi:* ${stats.count}`);
  lines.push("");

  // Breakdown per kategori
  lines.push(`🏷️ *Kategori:*`);
  for (const cat of stats.byCategory) {
    lines.push(`  • ${esc(cat.name)}: ${esc(rp(cat.amount))} \\(${cat.pct}%\\)`);
  }
  lines.push("");

  // Top 3
  lines.push(`🔝 *Top 3 Pengeluaran:*`);
  stats.top3.forEach((t, i) => {
    lines.push(`  ${i + 1}\\. ${esc(t.keterangan || "(tanpa keterangan)")} — ${esc(rp(t.nominal))} \\(${esc(t.kategori)}\\)`);
  });
  lines.push("");

  // Insight
  if (insight && insight.avgValue > 0) {
    const arrow = insight.isHigher ? "⚠️" : "✅";
    const labelHigher = insight.isHigher ? "di atas" : "di bawah";
    lines.push(`📈 *Insight:*`);
    lines.push(`${escapeMarkdownSmart(insight.avgLabel)}: ${esc(rp(insight.avgValue))}`);
    lines.push(`${esc(label)}: ${esc(rp(insight.currentTotal))} — ${arrow} ${insight.pctDiff}% ${labelHigher} rata\\-rata`);
  }

  return lines.join("\n");
}

/**
 * Escape MarkdownV2 yang lebih toleran — hanya escape karakter yang wajib.
 */
function escapeMarkdownSmart(text) {
  return String(text || "")
    .replace(/([_*[\]()~`>#+\-=|{}.!/])/g, "\\$1");
}

/**
 * Format laporan riwayat (N transaksi terakhir).
 */
function generateHistoryReport(transactions) {
  if (transactions.length === 0) {
    return "📋 Tidak ada transaksi tersedia\\.";
  }

  const lines = [];
  lines.push(`📋 *5 Transaksi Terakhir*`);
  lines.push("");

  transactions.forEach((t, i) => {
    const emoji = t.jenis === "Pemasukan" ? "💚" : "🔴";
    const num = i + 1;
    lines.push(
      `${num}\\. ${emoji} ${esc(t.keterangan || "(tanpa keterangan)")} — ${esc(rp(t.nominal))}`
    );
    lines.push(`   🏷️ ${esc(t.kategori)}  🏦 ${esc(t.sof || "BRI")}  📅 ${esc(t.tanggalTransaksi)}`);
    lines.push("");
  });

  return lines.join("\n");
}

// ── Insight Helpers ───────────────────────────────────────────────────────────

/**
 * Hitung insight perbandingan.
 * @param {number} currentTotal - Total periode ini
 * @param {number} avgTotal - Total rata-rata periode pembanding
 * @param {string} avgLabel - Label rata-rata (contoh: "Rata-rata harian (7 hari)")
 */
function computeInsight(currentTotal, avgTotal, avgLabel) {
  if (!avgTotal || avgTotal === 0) return null;
  const isHigher = currentTotal > avgTotal;
  const pctDiff = Math.round(Math.abs((currentTotal - avgTotal) / avgTotal) * 100);
  return {
    avgLabel,
    avgValue: avgTotal,
    currentTotal,
    pctDiff,
    isHigher,
  };
}

/**
 * Hitung insight harian: bandingkan hari ini vs rata-rata 7 hari terakhir.
 */
function computeDailyInsight(allRows, todayTotal) {
  const now = nowWIB();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setUTCDate(now.getUTCDate() - 7);
  const sevenDaysAgoStr = formatDate(sevenDaysAgo);
  const todayStr = formatDate(now);

  // Ambil transaksi 7 hari terakhir (tidak termasuk hari ini)
  const last7Days = allRows.filter((r) => {
    if (r.jenis !== "Pengeluaran") return false;
    const d = parseDate(r.tanggalTransaksi);
    if (!d) return false;
    const dateStr = formatDate(d);
    return dateStr >= sevenDaysAgoStr && dateStr < todayStr;
  });

  if (last7Days.length === 0) return null;
  const avgDaily = Math.round(last7Days.reduce((s, r) => s + r.nominal, 0) / 7);
  return computeInsight(todayTotal, avgDaily, "Rata-rata harian (7 hari)");
}

/**
 * Hitung insight mingguan: bandingkan minggu ini vs rata-rata 4 minggu terakhir.
 */
function computeWeeklyInsight(allRows, thisWeekTotal) {
  const weekStart = getWeekStart();

  // 4 minggu terakhir sebelum minggu ini
  const fourWeeksAgo = new Date(weekStart);
  fourWeeksAgo.setUTCDate(fourWeeksAgo.getUTCDate() - 28);

  const last4Weeks = allRows.filter((r) => {
    if (r.jenis !== "Pengeluaran") return false;
    const d = parseDate(r.tanggalTransaksi);
    if (!d) return false;
    return d >= fourWeeksAgo && d < weekStart;
  });

  if (last4Weeks.length === 0) return null;
  const avgWeekly = Math.round(last4Weeks.reduce((s, r) => s + r.nominal, 0) / 4);
  return computeInsight(thisWeekTotal, avgWeekly, "Rata-rata mingguan (4 minggu)");
}

/**
 * Hitung insight bulanan: bandingkan bulan ini vs bulan lalu (periode sama).
 */
function computeMonthlyInsight(lastMonthTransactions, thisMonthTotal) {
  if (lastMonthTransactions.length === 0) return null;
  const lastMonthTotal = lastMonthTransactions.reduce((s, r) => s + r.nominal, 0);
  const isHigher = thisMonthTotal > lastMonthTotal;
  const pctDiff = Math.round(Math.abs((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100);
  const labelHigher = isHigher ? "lebih boros" : "lebih hemat";
  const arrow = isHigher ? "⚠️" : "✅";

  return {
    lastMonthTotal,
    thisMonthTotal,
    pctDiff,
    isHigher,
    labelHigher,
    arrow,
  };
}

module.exports = {
  MONTHLY_START_DATE,
  WEEKLY_START_DAY,
  nowWIB,
  parseDate,
  formatDate,
  getWeekStart,
  getMonthStart,
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
};
