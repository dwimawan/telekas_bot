#!/bin/bash
# scripts/quickstart-dev.sh
# ─────────────────────────────────────────────────────────────────────────────
# Quick start untuk development di WSL.
# Membantu setup environment lokal dengan beberapa checks.
#
# Usage:
#   chmod +x scripts/quickstart-dev.sh
#   ./scripts/quickstart-dev.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║     Tele-Finance Bot — Quick Start Development (WSL)       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check Node.js
echo "✓ Checking Node.js..."
if ! command -v node &> /dev/null; then
  echo "  ❌ Node.js not found. Install from https://nodejs.org"
  exit 1
fi
NODE_VERSION=$(node -v)
echo "  $NODE_VERSION"

# Check npm
echo "✓ Checking npm..."
NPM_VERSION=$(npm -v)
echo "  v$NPM_VERSION"

# Check .env.local exists
echo "✓ Checking .env.local..."
if [ ! -f ".env.local" ]; then
  echo "  ⚠️  .env.local not found"
  echo "     Creating from .env.example..."
  cp .env.example .env.local
  echo "  ✓ Created. Edit with: nano .env.local"
else
  echo "  ✓ Found"
fi

# Check required env vars in .env.local
echo "✓ Validating .env.local..."
if grep -q "^TELEGRAM_TOKEN=" .env.local && grep -q "^ALLOWED_CHAT_IDS=" .env.local; then
  echo "  ✓ Required vars present"
else
  echo "  ❌ Missing required variables in .env.local"
  echo "     Edit .env.local dan pastikan punya:"
  echo "       - TELEGRAM_TOKEN"
  echo "       - ALLOWED_CHAT_IDS"
  echo "       - SPREADSHEET_ID"
  echo "       - GOOGLE_SERVICE_ACCOUNT_JSON"
  exit 1
fi

# Install dependencies
echo "✓ Installing dependencies..."
if [ ! -d "node_modules" ]; then
  npm install
else
  echo "  ✓ node_modules already exists"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                 Setup Selesai! Next Steps:                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "1. Edit .env.local dengan credential kamu:"
echo "   nano .env.local"
echo ""
echo "2. Terminal 1 — Start dev server:"
echo "   npm start"
echo ""
echo "3. Terminal 2 — Start ngrok tunnel:"
echo "   ngrok http 3000"
echo ""
echo "4. Terminal 3 — Register webhook:"
echo "   TELEGRAM_TOKEN=xxx node scripts/set-webhook.js https://xxx.ngrok.io"
echo ""
echo "5. Terminal 4 — Test di Telegram:"
echo "   Kirim pesan ke bot kamu"
echo ""
echo "📖 Dokumentasi: cat TESTING_LOCAL.md"
echo ""
