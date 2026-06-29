// server.js
// ─────────────────────────────────────────────────────────────────────────────
// Local development server untuk testing di WSL.
// Menjalankan HTTP server yang mendengarkan webhook Telegram.
// 
// Usage:
//   node server.js
// ─────────────────────────────────────────────────────────────────────────────

const http = require("http");
const url = require("url");

// Load config dari .env.local
require("dotenv").config({ path: ".env.local" });

const handler = require("./api/webhook.js");

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  const pathname = url.parse(req.url).pathname;

  // Health check
  if (pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
  }

  // Webhook endpoint
  if (pathname === "/api/webhook" && req.method === "POST") {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const data = JSON.parse(body);
        console.log("\n[WEBHOOK] Incoming update:");
        console.log(JSON.stringify(data, null, 2));

        // Panggil handler (mirip Vercel)
        // Adapt dari VercelRequest ke Node request
        const mockReq = {
          method: "POST",
          body: data,
        };

        const mockRes = {
          status: (code) => ({
            json: (response) => {
              res.writeHead(code, { "Content-Type": "application/json" });
              res.end(JSON.stringify(response));
              console.log(`[WEBHOOK] Response: ${code}`, response);
            },
          }),
          statusCode: 200,
          setHeader: () => {},
          end: (data) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(data);
          },
        };

        await handler(mockReq, mockRes);
      } catch (err) {
        console.error("[WEBHOOK] Error:", err);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`\n🚀 Development server running on http://localhost:${PORT}`);
  console.log(`\n📡 Webhook endpoint: http://localhost:${PORT}/api/webhook`);
  console.log(`\n💡 Tips:`);
  console.log(`   - Gunakan ngrok untuk expose ke internet: ngrok http ${PORT}`);
  console.log(`   - Daftarkan URL ngrok ke Telegram bot: node scripts/set-webhook.js https://xxx.ngrok.io`);
  console.log(`   - Cek webhook info: TELEGRAM_TOKEN=xxx node scripts/check-webhook.js\n`);
});
