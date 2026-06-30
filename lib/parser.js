// lib/parser.js
// ─────────────────────────────────────────────────────────────────────────────
// Regex-based parser untuk teks transaksi (FR-02).
// Mendukung beberapa format input:
//
//   1. Nominal di depan:
//      "50000 makan siang di warteg"
//      "25k bakso"
//
//   2. Nominal di belakang:
//      "Periksa gigi 265k"
//      "belanja sayur pasar 125rb"
//
//   3. Format bebas / kata-kata (nominal ditulis dengan kata "ribu"/"juta"):
//      "beli beras 75 ribu"
//      "bayar listrik 200k"
//
//   4. Paksa kategori dengan tagar di akhir teks:
//      "50rb bensin stylo #transport"
//      "Periksa gigi 265k #kesehatan"
//   5. Source of Fund (SOF) dengan @ di akhir teks:
//      "50k makan @BRI", "30rb pulsa @Jago"
// ─────────────────────────────────────────────────────────────────────────────

// Daftar SOF yang dikenal (case-insensitive)
const KNOWN_SOF = ["BRI", "Jago", "Seabank", "LinkAja", "Cash"];
const DEFAULT_SOF = "BRI";

// Mapping kategori berdasarkan kata kunci di keterangan/kategori
// Format: array of objects dengan keywords dan category
// Urutan penting: lebih spesifik dulu, akan di-check dari atas ke bawah
const CATEGORY_KEYWORD_MAP = [
    { keywords: ['food', 'makan', 'resto', 'warung', 'cafe', 'kafe', 'warteg', 'pecel', 'ayam', 'reva selamat riadi', 'wingstop', 'pepper lunch', 'gyu kaku', 'mie ayam', 'bakso', 'lokomart', 'coffee', 'angkringan', 'ramen', 'kopi', 'kitchen', 'nasi goreng', 'kebab', 'sbux', 'drink', 'soto', 'cimol', 'siomay', 'marugame', 'ichiban', 'sushi', 'snack', 'calf', 'telur', 'rm ampera', 'buber', 'warkop', 'lawson', 'jajan', 'hekeng', 'gorengan', 'wanawatu', 'hachi grill'], category: 'Food & Beverage' },
    { keywords: ['indomaret', 'groceries', 'alfamrt', 'alfagift', 'superindo', 'belanja bulanan', 'sekar talango', 'callistashop', 'kirana mart'], category: 'Groceries' },
    { keywords: ['brizzi', 'emoney', 'transport', 'spbu', 'access by kai', 'kencana', 'proban', 'spooring', 'brio', 'tiket bis', 'motor', 'ganti oli', 'bensin'], category: 'Transport' },
    { keywords: ['youtube', 'yutup', 'netflix', 'minsoc', 'billiard', 'margasatwa', 'hotel'], category: 'Entertainment' },
    { keywords: ['bpjs', 'uang bulanan', 'ahmad galih saputra', 'sovia'], category: 'Family' },
    { keywords: ['pulsa', 'paket data', 'im3', 'telkomsel', 'smartfren'], category: 'Gadget & Electronic' },
    { keywords: ['barbershop', 'potong rambut'], category: 'Selfcare' },
    { keywords: ['apotik', 'apotek', 'klinik', 'dokter', 'siloam'], category: 'Healthcare' },
    { keywords: ['uniqlo', 't-shirt', 'decathlon', 'fashion', 'new balance'], category: 'Fashion' },
    { keywords: ['roni robiansyah', 'kos'], category: 'Rent' },
    { keywords: ['rokok', 'mild', 'sampoerna'], category: 'Rokok' },
    { keywords: ['toru', 'laundry', 'mr diy', 'tools', 'pengering', 'kompor', 'gorden', 'sticker', 'omega elektrik'], category: 'Utilities' },
    { keywords: ['wedding'], category: 'Gift' }
];

// Mapping tagar (hashtag) paksa kategori → nama kategori resmi.
// Pengguna bisa menulis "#transport" atau "#kesehatan" di akhir pesan untuk
// override hasil tebakan otomatis. Key harus lowercase, tanpa tagar.
const FORCE_CATEGORY_MAP = {
    makanan: "Food & Beverage",
    food: "Food & Beverage",
    transport: "Transport",
    transportasi: "Transport",
    groceries: "Groceries",
    belanja: "Groceries",
    entertainment: "Entertainment",
    hiburan: "Entertainment",
    kesehatan: "Healthcare",
    health: "Healthcare",
    family: "Family",
    keluarga: "Family",
    gadget: "Gadget & Electronic",
    lainnya: "Other Category",
    other: "Other Category",
};

/**
 * Tebak kategori dari teks keterangan.
 * Menggunakan CATEGORY_KEYWORD_MAP dengan checking urut dari atas ke bawah.
 * @param {string} text
 * @param {string} defaultJenis - "Pemasukan" atau "Pengeluaran"
 * @returns {string} Nama kategori
 */
function guessCategory(text, defaultJenis) {
    if (!text) {
        return defaultJenis === "Pemasukan" ? "Pemasukan" : "Other Category";
    }

    const lower = text.toLowerCase();

    // Check setiap entry di CATEGORY_KEYWORD_MAP
    for (const entry of CATEGORY_KEYWORD_MAP) {
        if (entry.keywords.some((kw) => lower.includes(kw))) {
            return entry.category;
        }
    }

    // Fallback berdasarkan jenis
    return defaultJenis === "Pemasukan" ? "Pemasukan" : "Other Category";
}

/**
 * Ekstrak tagar paksa kategori di akhir teks, jika ada.
 * Contoh: "50rb bensin stylo #transport" → { category: "Transportasi", cleanText: "50rb bensin stylo" }
 * Tagar tidak harus di akhir absolut, tapi pencarian dilakukan global lalu dihapus dari teks.
 * @param {string} text
 * @returns {{ category: string|null, cleanText: string }}
 */
function extractForcedCategory(text) {
    const hashtagMatch = text.match(/#([a-zA-Z]+)\s*$/);

    if (!hashtagMatch) {
        return { category: null, cleanText: text };
    }

    const tag = hashtagMatch[1].toLowerCase();
    const category = FORCE_CATEGORY_MAP[tag] || null;

    // Hapus tagar dari teks (terlepas dikenali atau tidak, agar tidak ikut jadi keterangan)
    const cleanText = text.slice(0, hashtagMatch.index).trim();

    return { category, cleanText };
}

/**
 * Ekstrak Source of Fund (SOF) dari teks dengan pola @SofName.
 * Contoh: "50k makan @BRI" → { sof: "BRI", cleanText: "50k makan" }
 * Jika tidak ada @SOF, return default "BRI".
 * Jika @SOF tidak dikenal, return default "BRI" (token tetap dihapus dari teks).
 * @param {string} text
 * @returns {{ sof: string, cleanText: string }}
 */
function extractSOF(text) {
    const pattern = new RegExp(`@(${KNOWN_SOF.join("|")})(?=\\s|$)`, "i");
    const match = text.match(pattern);

    if (!match) {
        return { sof: DEFAULT_SOF, cleanText: text };
    }

    const sof = KNOWN_SOF.find((s) => s.toLowerCase() === match[1].toLowerCase());
    const cleanText = text.slice(0, match.index).trim() + " " + text.slice(match.index + match[0].length).trim();
    return { sof: sof || DEFAULT_SOF, cleanText: cleanText.trim() };
}

/**
 * Parse nominal dari berbagai format penulisan Indonesia:
 * - "50000" → 50000
 * - "50k" / "50rb" / "50ribu" → 50000
 * - "1.5jt" / "1,5jt" / "1jt" → 1000000 / 1500000 / 1000000
 * - "1.500.000" / "1,500,000" → 1500000
 * - "75 ribu" / "2 juta" (dengan spasi sebelum satuan kata) → 75000 / 2000000
 * @param {string} str
 * @returns {number|null}
 */
function parseNominal(str) {
    if (!str) return null;

    const s = str.trim().toLowerCase().replace(/\s+/g, "");

    // Handle jutaan: "1.5jt", "1,5jt", "2jt", "1.5juta"
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
 * Cari kandidat token nominal di mana saja dalam teks (bukan hanya di depan).
 * Mendukung dua bentuk penulisan satuan:
 *   - Menyatu dengan angka: "75rb", "265k", "1.5jt"
 *   - Terpisah spasi (kata penuh): "75 ribu", "2 juta"
 *
 * Mengembalikan token pertama yang match beserta posisi (index awal & akhir
 * di teks asli) supaya bisa "dipotong" untuk menyisakan keterangan.
 *
 * @param {string} text
 * @returns {{ match: string, nominal: number, start: number, end: number } | null}
 */
function findNominalToken(text) {
    // Regex tunggal yang menangkap:
    //   group 1: angka (boleh pakai . atau , sebagai pemisah)
    //   group 2: satuan opsional, boleh menyatu langsung atau dipisah spasi
    //            (k|rb|ribu|jt|juta)
    // \b dipakai di awal angka agar tidak nyangkut di tengah kata lain.
    const pattern = /\b(\d+(?:[.,]\d+)?)\s*(ribu|ribuan|rb|juta|jt|k)?\b/gi;

    let match;
    while ((match = pattern.exec(text)) !== null) {
        const numberPart = match[1];
        const unitPart = match[2] || "";
        const combined = `${numberPart}${unitPart}`;
        const nominal = parseNominal(combined);

        if (nominal && nominal > 0) {
            return {
                match: match[0],
                nominal,
                start: match.index,
                end: match.index + match[0].length,
            };
        }
    }

    return null;
}

/**
 * Parse pesan teks transaksi dari pengguna.
 *
 * Pola yang dikenali (dicoba berurutan):
 * 1. Nominal di depan:    "50000 makan siang warteg", "25k bakso"
 * 2. Nominal di belakang: "Periksa gigi 265k", "belanja sayur pasar 125rb"
 * 3. Format bebas/kata:   "beli beras 75 ribu", "bayar listrik 200k"
 * 4. Paksa kategori:      tambahkan "#kategori" di akhir teks, contoh:
 *                         "50rb bensin stylo #transport"
 * 5. Source of Fund:      tambahkan "@bank" di akhir teks, contoh:
 *                         "50k makan @BRI", "30rb pulsa @Jago"
 *
 * @param {string} text - Pesan mentah dari pengguna
 * @returns {{ nominal, jenis, kategori, keterangan, sof, tanggalTransaksi } | null}
 */
function parseTransaction(text) {
    if (!text || typeof text !== "string") return null;

    let trimmed = text.trim();

    // ── Step 1: Ekstrak tagar paksa kategori (jika ada) ───────────────────────
    const { category: forcedCategory, cleanText } = extractForcedCategory(trimmed);
    trimmed = cleanText;

    if (!trimmed) return null;

    // ── Step 2: Ekstrak Source of Fund (SOF) ──────────────────────────────────
    const { sof, cleanText: textAfterSOF } = extractSOF(trimmed);
    trimmed = textAfterSOF;

    if (!trimmed) return null;

    // ── Step 3: Deteksi tanda pemasukan/pengeluaran eksplisit ─────────────────
    let jenis = "Pengeluaran"; // default
    let rawText = trimmed;

    if (rawText.startsWith("+")) {
        jenis = "Pemasukan";
        rawText = rawText.slice(1).trim();
    } else if (rawText.startsWith("-")) {
        jenis = "Pengeluaran";
        rawText = rawText.slice(1).trim();
    }

    // ── Step 4: Cari token nominal di mana saja dalam teks ────────────────────
    // Mendukung nominal di depan ("50k makan"), di belakang ("makan 50k"),
    // dan format kata terpisah ("makan 50 ribu").
    const nominalToken = findNominalToken(rawText);

    if (!nominalToken) return null;

    const { nominal, start, end } = nominalToken;

    // Sisa teks setelah nominal dihapus → jadi keterangan.
    // Gabungkan bagian sebelum & sesudah token nominal, lalu rapikan spasi.
    const before = rawText.slice(0, start).trim();
    const after = rawText.slice(end).trim();
    const keterangan = [before, after].filter(Boolean).join(" ").trim();

    // ── Step 5: Override jenis jika ada kata kunci pemasukan di keterangan ───
    if (jenis === "Pengeluaran") {
        const pemasukanEntry = CATEGORY_KEYWORD_MAP.find((e) => e.category === "Pemasukan");
        if (pemasukanEntry && pemasukanEntry.keywords.some((kw) => keterangan.toLowerCase().includes(kw))) {
            jenis = "Pemasukan";
        }
    }

    // ── Step 6: Tentukan kategori — tagar paksa selalu menang ─────────────────
    const kategori = forcedCategory || guessCategory(keterangan, jenis);

    return {
        nominal,
        jenis,
        kategori,
        keterangan,
        sof,
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