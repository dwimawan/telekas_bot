#!/usr/bin/env node
// scripts/check-webhook.js
// ─────────────────────────────────────────────────────────────────────────────
// Cek status webhook yang saat ini terdaftar di Telegram.
// ─────────────────────────────────────────────────────────────────────────────

const token = process.env.TELEGRAM_TOKEN;

if (!token) {
  console.error("❌ Error: Set TELEGRAM_TOKEN di environment variable.");
  console.error("   Contoh: TELEGRAM_TOKEN=xxx node scripts/check-webhook.js");
  process.exit(1);
}

async function main() {
  console.log(`\n🔍 Mengecek webhook info...\n`);

  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const data = await res.json();

  if (!data.ok) {
    console.error("❌ Error:", data);
    process.exit(1);
  }

  const info = data.result;

  console.log("Webhook Status:");
  console.log("  URL                 :", info.url || "—");
  console.log("  Pending updates     :", info.pending_update_count || 0);
  console.log("  Last error date     :", info.last_error_date ? new Date(info.last_error_date * 1000).toLocaleString('id-ID') : "—");
  console.log("  Last error message  :", info.last_error_message || "—");
  console.log("  Max connections     :", info.max_connections || "—");
  console.log("  Allowed updates     :", info.allowed_updates || "—");
  console.log();
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
