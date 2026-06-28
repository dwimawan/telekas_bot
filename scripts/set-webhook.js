#!/usr/bin/env node
// scripts/set-webhook.js
// ─────────────────────────────────────────────────────────────────────────────
// Jalankan sekali setelah deploy untuk mendaftarkan webhook URL ke Telegram.
//
// Usage:
//   node scripts/set-webhook.js https://your-app.vercel.app
//
// Atau jika sudah set TELEGRAM_TOKEN di env:
//   TELEGRAM_TOKEN=xxx node scripts/set-webhook.js https://your-app.vercel.app
// ─────────────────────────────────────────────────────────────────────────────

const token = process.env.TELEGRAM_TOKEN;
const url = process.argv[2];

if (!token) {
  console.error("❌ Error: Set TELEGRAM_TOKEN di environment variable.");
  console.error("   Contoh: TELEGRAM_TOKEN=xxx node scripts/set-webhook.js https://...");
  process.exit(1);
}

if (!url) {
  console.error("❌ Error: Masukkan URL Vercel sebagai argument.");
  console.error("   Contoh: node scripts/set-webhook.js https://your-app.vercel.app");
  process.exit(1);
}

const webhookUrl = `${url.replace(/\/$/, "")}/api/webhook`;

async function main() {
  console.log(`\n📡 Mendaftarkan webhook ke Telegram...`);
  console.log(`   URL: ${webhookUrl}\n`);

  // Set webhook
  const setRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true, // Bersihkan antrian lama
    }),
  });

  const setData = await setRes.json();

  if (setData.ok) {
    console.log("✅ Webhook berhasil didaftarkan!");
  } else {
    console.error("❌ Gagal daftarkan webhook:", setData);
    process.exit(1);
  }

  // Verifikasi webhook info
  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const infoData = await infoRes.json();

  if (infoData.ok) {
    const info = infoData.result;
    console.log("\n📋 Webhook Info:");
    console.log(`   URL          : ${info.url}`);
    console.log(`   Pending count: ${info.pending_update_count}`);
    console.log(`   Last error   : ${info.last_error_message || "—"}`);
  }
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
