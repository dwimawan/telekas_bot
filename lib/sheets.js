// lib/sheets.js
// ─────────────────────────────────────────────────────────────────────────────
// Google Sheets helper via Sheets REST API v4.
// Auth menggunakan Service Account + JWT (tanpa library tambahan).
// ─────────────────────────────────────────────────────────────────────────────

const { SPREADSHEET_ID, SHEET_NAME, GOOGLE_SERVICE_ACCOUNT_JSON } = require("./config");

// ── JWT Utilities ─────────────────────────────────────────────────────────────

/**
 * Encode string ke Base64URL (untuk JWT).
 */
function base64url(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Buat dan tanda-tangani JWT untuk Google OAuth2 service account.
 * Menggunakan Node.js built-in `crypto` — zero dependencies.
 */
async function createJWT(serviceAccount) {
  const crypto = require("crypto");

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  const signingInput = `${header}.${claim}`;

  // Private key dari service account JSON
  const privateKey = crypto.createPrivateKey(serviceAccount.private_key);
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(privateKey, "base64");
  const signatureUrl = signature
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${signingInput}.${signatureUrl}`;
}

/**
 * Tukar JWT dengan access token Google OAuth2.
 * Token berlaku 1 jam. Untuk skala personal ini cukup — token di-generate
 * fresh tiap request (GAS juga melakukan hal yang sama secara internal).
 */
async function getAccessToken() {
  const serviceAccount = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
  const jwt = await createJWT(serviceAccount);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();

  if (!data.access_token) {
    throw new Error(`[SHEETS] Failed to get access token: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

// ── Sheets Operations ─────────────────────────────────────────────────────────

/**
 * Format tanggal ke string lokal Indonesia.
 * @param {Date} date
 */
function formatDate(date) {
  return date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Append satu baris transaksi ke Google Sheets.
 * Struktur kolom:
 * A: Timestamp | B: Tanggal Transaksi | C: Jenis | D: Nominal |
 * E: Kategori  | F: Keterangan        | G: Source | H: Sumber Data
 *
 * @param {object} transaction
 * @param {string} transaction.tanggalTransaksi - Tanggal aktual transaksi
 * @param {string} transaction.jenis            - "Pengeluaran" | "Pemasukan"
 * @param {number} transaction.nominal          - Angka murni
 * @param {string} transaction.kategori         - Kategori transaksi
 * @param {string} transaction.keterangan       - Deskripsi detail
 * @param {string} transaction.sof              - Source of Fund (BRI, Jago, dll)
 * @param {string} transaction.sumberData       - "Teks Manual" | "Foto Struk"
 */
async function appendTransaction(transaction) {
  const token = await getAccessToken();
  const now = new Date();
  const timestamp = formatDate(now);

  const row = [
    timestamp,
    transaction.tanggalTransaksi || timestamp,
    transaction.jenis || "Pengeluaran",
    transaction.nominal,
    transaction.kategori || "Other Category",
    transaction.keterangan || "",
    transaction.sof || "BRI",
    transaction.sumberData || "Teks Manual",
  ];

  const range = encodeURIComponent(`${SHEET_NAME}!A:H`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [row] }),
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(`[SHEETS] Append failed: ${JSON.stringify(data.error)}`);
  }

  // Kembalikan info baris yang baru ditambahkan (untuk keperluan /undo)
  const updatedRange = data.updates?.updatedRange || "";
  const match = updatedRange.match(/(\d+)$/);
  const rowNumber = match ? parseInt(match[1]) : null;

  return { rowNumber, timestamp };
}

/**
 * Hapus baris terakhir (untuk fitur /undo).
 * Menggunakan batchUpdate untuk delete dimension.
 * @param {number} rowNumber - Nomor baris (1-indexed, header di baris 1)
 */
async function deleteRow(rowNumber) {
  if (!rowNumber || rowNumber <= 1) {
    throw new Error("Invalid row number for deletion");
  }

  const token = await getAccessToken();

  // Perlu sheet ID (bukan spreadsheet ID) untuk batchUpdate
  // Ambil dulu metadata sheet
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const meta = await metaRes.json();

  const sheet = meta.sheets?.find(
    (s) => s.properties.title === SHEET_NAME
  );

  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" tidak ditemukan`);
  }

  const sheetId = sheet.properties.sheetId;
  const zeroIndexRow = rowNumber - 1; // API pakai 0-index

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: zeroIndexRow,
                endIndex: zeroIndexRow + 1,
              },
            },
          },
        ],
      }),
    }
  );

  const data = await res.json();

  if (data.error) {
    throw new Error(`[SHEETS] Delete row failed: ${JSON.stringify(data.error)}`);
  }

  return true;
}

/**
 * Ambil baris terakhir dari sheet (untuk preview sebelum /undo).
 */
async function getLastRow() {
  const token = await getAccessToken();
  const range = encodeURIComponent(`${SHEET_NAME}!A:H`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(`[SHEETS] Get rows failed: ${JSON.stringify(data.error)}`);
  }

  const rows = data.values || [];
  if (rows.length <= 1) return null; // Hanya header, tidak ada data

  const lastRow = rows[rows.length - 1];
  const rowNumber = rows.length; // 1-indexed, header di baris 1

  return {
    rowNumber,
    timestamp: lastRow[0],
    tanggalTransaksi: lastRow[1],
    jenis: lastRow[2],
    nominal: lastRow[3],
    kategori: lastRow[4],
    keterangan: lastRow[5],
    sof: lastRow[6] || "BRI",
    sumberData: lastRow[7] || "Teks Manual",
  };
}

/**
 * Ambil semua baris transaksi dari sheet.
 * Return array of objects dengan key sesuai kolom.
 */
async function getAllTransactions() {
  const token = await getAccessToken();
  const range = encodeURIComponent(`${SHEET_NAME}!A:H`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(`[SHEETS] Get all transactions failed: ${JSON.stringify(data.error)}`);
  }

  const rows = data.values || [];
  if (rows.length <= 1) return []; // Hanya header

  return rows.slice(1).map((row) => ({
    timestamp: row[0] || "",
    tanggalTransaksi: row[1] || "",
    jenis: row[2] || "Pengeluaran",
    nominal: parseInt(row[3], 10) || 0,
    kategori: row[4] || "Other Category",
    keterangan: row[5] || "",
    sof: row[6] || "BRI",
    sumberData: row[7] || "Teks Manual",
  }));
}

module.exports = { appendTransaction, deleteRow, getLastRow, getAllTransactions };
