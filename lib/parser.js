// lib/parser.js
// ─────────────────────────────────────────────────────────────────────────────
// Regex-based parser untuk teks transaksi (FR-02).
// Mendukung dua format input:
//
//   Format Terstruktur (prioritas utama):
//   [nominal] [jenis?] [kategori] [keterangan]
//   Contoh: "50000 makan siang di warteg"
//           "150k transport gojek ke kantor"
//           "+500000 pemasukan gaji freelance"
//
//   Format Shorthand (alternatif ringkas):
//   [nominal][k/rb/jt] [keterangan]
//   Contoh: "25k bakso", "1.5jt bayar kos"
// ─────────────────────────────────────────────────────────────────────────────

// Mapping kategori berdasarkan kata kunci di keterangan/kategori
// Format: array of objects dengan keywords dan category
// Urutan penting: lebih spesifik dulu, akan di-check dari atas ke bawah
const CATEGORY_KEYWORD_MAP = [
  { keywords: ['food', 'makan', 'resto', 'warung', 'cafe', 'kafe', 'warteg', 'pecel', 'ayam', 'reva selamat riadi', 'wingstop', 'pepper lunch', 'gyu kaku', 'mie ayam', 'bakso', 'lokomart', 'coffee', 'angkringan', 'ramen', 'kopi', 'kitchen', 'nasi goreng', 'kebab', 'sbux', 'drink', 'soto', 'cimol', 'siomay', 'marugame', 'ichiban', 'sushi', 'snack', 'calf', 'telur', 'rm ampera', 'buber', 'warkop', 'lawson', 'jajan', 'hekeng', 'gorengan', 'wanawatu', 'hachi grill'], category: 'Food & Beverage' },
  { keywords: ['indomaret', 'groceries', 'alfamrt', 'alfagift', 'superindo', 'belanja bulanan', 'sekar talango', 'callistashop', 'kirana mart'],category: 'Groceries' },
  { keywords: ['brizzi', 'emoney', 'transport', 'spbu', 'access by kai', 'kencana', 'proban', 'spooring', 'brio', 'tiket bis', 'motor', 'ganti oli', 'bensin'], category: 'Transport' },
  { keywords: ['youtube', 'yutup', 'netflix', 'minsoc', 'billiard', 'margasatwa', 'hotel'], category: 'Entertainment' },
  { keywords: ['bpjs', 'uang bulanan', 'ahmad galih saputra', 'sovia'], category: 'Family' },
  { keywords: ['pulsa', 'paket data', 'im3', 'telkomsel', 'smartfren'], category: 'Gadget & Electronic' },
  { keywords: ['barbershop'], category: 'Selfcare' },
  { keywords: ['apotik', 'apotek', 'klinik', 'dokter', 'siloam'], category: 'Healthcare' },
  { keywords: ['uniqlo', 't-shirt', 'decathlon', 'fashion', 'new balance'], category: 'Fashion' },
  { keywords: ['roni robiansyah', 'kos'], category: 'Rent' },
  { keywords: ['rokok', 'mild', 'sampoerna'], category: 'Rokok' },
  { keywords: ['toru', 'laundry', 'mr diy', 'tools', 'pengering', 'kompor', 'gorden', 'sticker', 'omega elektrik'], category: 'Utilities' },
  { keywords: ['wedding'], category: 'Gift' }
];

/**
 * Tebak kategori dari teks keterangan.
 * Menggunakan CATEGORY_KEYWORD_MAP dengan checking urut dari atas ke bawah.
 * @param {string} text
 * @param {string} defaultJenis - "Pemasukan" atau "Pengeluaran"
 * @returns {string} Nama kategori
 */
function guessCategory(text, defaultJenis) {
  if (!text) {
    return defaultJenis === "Pemasukan" ? "Pemasukan" : "Lainnya";
  }

  const lower = text.toLowerCase();

  // Check setiap entry di CATEGORY_KEYWORD_MAP
  for (const entry of CATEGORY_KEYWORD_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.category;
    }
  }

  // Fallback berdasarkan jenis
  return defaultJenis === "Pemasukan" ? "Pemasukan" : "Lainnya";
}

/**
 * Parse nominal dari berbagai format penulisan Indonesia:
 * - "50000" → 50000
 * - "50k" / "50rb" / "50ribu" → 50000
 * - "1.5jt" / "1,5jt" / "1jt" → 1000000 / 1500000 / 1000000
 * - "1.500.000" / "1,500,000" → 1500000
 * @param {string} str
 * @returns {number|null}
 */
function parseNominal(str) {
  if (!str) return null;

  const s = str.trim().toLowerCase().replace(/\s/g, "");

  // Handle jutaan: "1.5jt", "1,5jt", "2jt", "1.5 juta"
  const jutaMatch = s.match(/^(\d+[.,]?\d*)\s*j(t|uta)?$/);
  if (jutaMatch) {
    const num = parseFloat(jutaMatch[1].replace(",", "."));
    return Math.round(num * 1_000_000);
  }

  // Handle ribuan: "50k", "50rb", "50ribu", "150k"
  const ribuMatch = s.match(/^(\d+[.,]?\d*)\s*(k|rb|ribu)$/);
  if (ribuMatch) {
    const num = parseFloat(ribuMatch[1].replace(",", "."));
    return Math.round(num * 1_000);
  }

  // Handle angka biasa dengan pemisah ribuan: "1.500.000" atau "1,500,000"
  const plainMatch = s.match(/^[\d.,]+$/);
  if (plainMatch) {
    // Deteksi apakah titik/koma sebagai pemisah ribuan atau desimal
    const cleaned = s
      .replace(/\./g, "") // hapus titik (pemisah ribuan)
      .replace(/,/g, ""); // hapus koma
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
  }

  return null;
}

/**
 * Parse pesan teks transaksi dari pengguna.
 *
 * Pola yang dikenali:
 * 1. [+/-][nominal] [keterangan lengkap]
 *    Contoh: "50000 makan siang warteg", "+500k gaji freelance"
 * 2. [nominal][satuan] [keterangan]
 *    Contoh: "25k bakso", "1.5jt bayar kos"
 *
 * @param {string} text - Pesan mentah dari pengguna
 * @returns {{ nominal, jenis, kategori, keterangan, tanggalTransaksi } | null}
 */
function parseTransaction(text) {
  if (!text || typeof text !== "string") return null;

  const trimmed = text.trim();

  // Deteksi tanda pemasukan/pengeluaran eksplisit
  let jenis = "Pengeluaran"; // default
  let rawText = trimmed;

  if (rawText.startsWith("+")) {
    jenis = "Pemasukan";
    rawText = rawText.slice(1).trim();
  } else if (rawText.startsWith("-")) {
    jenis = "Pengeluaran";
    rawText = rawText.slice(1).trim();
  }

  // Pisahkan token pertama sebagai kandidat nominal
  // Format: "<nominal>[satuan] <sisa teks>"
  const firstTokenMatch = rawText.match(/^(\d+[.,]?\d*\s*(?:k|rb|ribu|jt|juta)?)\s+(.+)$/i);

  if (!firstTokenMatch) {
    // Coba format tanpa keterangan (nominal saja)
    const nominalOnly = parseNominal(rawText);
    if (nominalOnly) {
      return {
        nominal: nominalOnly,
        jenis,
        kategori: guessCategory("", jenis),
        keterangan: "",
        tanggalTransaksi: getTodayDate(),
      };
    }
    return null;
  }

  const nominalRaw = firstTokenMatch[1].trim();
  const keterangan = firstTokenMatch[2].trim();
  const nominal = parseNominal(nominalRaw);

  if (!nominal || nominal <= 0) return null;

  // Override jenis jika kata kunci pemasukan ditemukan di keterangan
  if (jenis === "Pengeluaran") {
    const pemasukanEntry = CATEGORY_KEYWORD_MAP.find((e) => e.category === "Pemasukan");
    if (pemasukanEntry && pemasukanEntry.keywords.some((kw) => keterangan.toLowerCase().includes(kw))) {
      jenis = "Pemasukan";
    }
  }

  const kategori = guessCategory(keterangan, jenis);

  return {
    nominal,
    jenis,
    kategori,
    keterangan,
    tanggalTransaksi: getTodayDate(),
  };
}

/**
 * Tanggal hari ini dalam format DD/MM/YYYY (WIB).
 */
function getTodayDate() {
  return new Date().toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Format nominal ke rupiah untuk ditampilkan.
 * @param {number} nominal
 * @returns {string} "Rp 50.000"
 */
function formatRupiah(nominal) {
  return (
    "Rp " +
    Number(nominal).toLocaleString("id-ID", {
      minimumFractionDigits: 0,
    })
  );
}

module.exports = { parseTransaction, formatRupiah, getTodayDate };