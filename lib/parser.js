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
// Urutan penting: lebih spesifik dulu
const CATEGORY_KEYWORDS = {
  Makanan: [
    "makan", "minum", "kopi", "teh", "bakso", "warung", "warteg", "resto",
    "restoran", "cafe", "seafood", "nasi", "ayam", "pizza", "burger",
    "indomie", "snack", "camilan", "jajan", "beli makan", "sarapan",
    "makan siang", "makan malam", "boba", "es", "juice",
  ],
  Transportasi: [
    "gojek", "grab", "ojek", "ojol", "taksi", "taxi", "bus", "busway",
    "transjakarta", "kereta", "krl", "mrt", "lrt", "bensin", "bbm",
    "parkir", "tol", "angkot", "damri", "travel", "transport",
  ],
  Belanja: [
    "alfamart", "indomaret", "supermarket", "minimarket", "tokopedia",
    "shopee", "lazada", "belanja", "beli", "toko", "mall", "plaza",
  ],
  Tagihan: [
    "listrik", "air", "pdam", "internet", "wifi", "telkom", "indihome",
    "pulsa", "kuota", "token", "tagihan", "bayar tagihan", "iuran",
    "cicilan", "kredit", "kos", "kontrakan", "sewa",
  ],
  Hiburan: [
    "netflix", "spotify", "bioskop", "film", "game", "youtube premium",
    "hiburan", "main", "liburan", "wisata", "hotel", "airbnb",
  ],
  Kesehatan: [
    "obat", "dokter", "klinik", "rumah sakit", "rs", "apotek", "vitamin",
    "suplemen", "kesehatan", "bpjs",
  ],
  Pendidikan: [
    "kursus", "buku", "udemy", "coursera", "sekolah", "kampus", "spp",
    "pendidikan", "les", "bimbel",
  ],
  Pemasukan: [
    "gaji", "salary", "freelance", "transfer masuk", "dapat", "bonus",
    "THR", "dividen", "refund", "cashback",
  ],
};

/**
 * Tebak kategori dari teks keterangan.
 * @param {string} text
 * @param {string} defaultJenis - "Pemasukan" atau "Pengeluaran"
 * @returns {string} Nama kategori
 */
function guessCategory(text, defaultJenis) {
  const lower = text.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return category;
    }
  }

  // Fallback berdasarkan jenis
  return defaultJenis === "Pemasukan" ? "Pemasukan Lainnya" : "Lainnya";
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
    const pemasukanKeywords = CATEGORY_KEYWORDS["Pemasukan"];
    if (pemasukanKeywords.some((kw) => keterangan.toLowerCase().includes(kw))) {
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
