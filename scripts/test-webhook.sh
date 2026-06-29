#!/bin/bash
# scripts/test-webhook.sh
# ─────────────────────────────────────────────────────────────────────────────
# Test webhook endpoint menggunakan curl — tanpa perlu Telegram client.
# Berguna untuk debug cepat saat development.
#
# Usage:
#   chmod +x scripts/test-webhook.sh
#   ./scripts/test-webhook.sh
#
# Atau manual dengan curl:
#   curl -X POST http://localhost:3000/api/webhook \
#     -H "Content-Type: application/json" \
#     -d '{"update_id":1,"message":{"message_id":1,"date":1234567890,"chat":{"id":123},"from":{"id":123},"text":"50000 makan"}}'
# ─────────────────────────────────────────────────────────────────────────────

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get YOUR_CHAT_ID from .env.local
CHAT_ID=$(grep "ALLOWED_CHAT_IDS=" .env.local | cut -d'=' -f2 | head -1)

if [ -z "$CHAT_ID" ]; then
  echo "❌ ALLOWED_CHAT_IDS not found in .env.local"
  echo "   Edit .env.local dan set ALLOWED_CHAT_IDS=YOUR_CHAT_ID"
  exit 1
fi

ENDPOINT="http://localhost:3000/api/webhook"
TIMESTAMP=$(date +%s)

echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Webhook Test — Tele-Finance Bot${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}\n"

# Test 1: /start command
echo -e "${YELLOW}[Test 1] /start command${NC}"
PAYLOAD=$(cat <<EOF
{
  "update_id": 1,
  "message": {
    "message_id": 1,
    "date": $TIMESTAMP,
    "chat": {"id": $CHAT_ID},
    "from": {"id": $CHAT_ID},
    "text": "/start"
  }
}
EOF
)

echo "Sending: /start"
curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq .
echo ""

# Test 2: /help command
echo -e "${YELLOW}[Test 2] /help command${NC}"
PAYLOAD=$(cat <<EOF
{
  "update_id": 2,
  "message": {
    "message_id": 2,
    "date": $TIMESTAMP,
    "chat": {"id": $CHAT_ID},
    "from": {"id": $CHAT_ID},
    "text": "/help"
  }
}
EOF
)

echo "Sending: /help"
curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq .
echo ""

# Test 3: Pengeluaran transaksi
echo -e "${YELLOW}[Test 3] Pencatatan pengeluaran (50k makan)${NC}"
PAYLOAD=$(cat <<EOF
{
  "update_id": 3,
  "message": {
    "message_id": 3,
    "date": $TIMESTAMP,
    "chat": {"id": $CHAT_ID},
    "from": {"id": $CHAT_ID},
    "text": "50000 makan siang warteg"
  }
}
EOF
)

echo "Sending: 50000 makan siang warteg"
curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq .
echo ""

# Test 4: Pemasukan transaksi
echo -e "${YELLOW}[Test 4] Pencatatan pemasukan (+500k gaji)${NC}"
PAYLOAD=$(cat <<EOF
{
  "update_id": 4,
  "message": {
    "message_id": 4,
    "date": $TIMESTAMP,
    "chat": {"id": $CHAT_ID},
    "from": {"id": $CHAT_ID},
    "text": "+500k gaji freelance"
  }
}
EOF
)

echo "Sending: +500k gaji freelance"
curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq .
echo ""

# Test 5: Invalid format
echo -e "${YELLOW}[Test 5] Invalid format (should reject)${NC}"
PAYLOAD=$(cat <<EOF
{
  "update_id": 5,
  "message": {
    "message_id": 5,
    "date": $TIMESTAMP,
    "chat": {"id": $CHAT_ID},
    "from": {"id": $CHAT_ID},
    "text": "ini bukan transaksi"
  }
}
EOF
)

echo "Sending: ini bukan transaksi"
curl -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq .
echo ""

echo -e "${GREEN}✓ All tests sent!${NC}"
echo ""
echo -e "${BLUE}Checklist:${NC}"
echo "  ☐ Check terminal di npm start — ada [WEBHOOK] logs?"
echo "  ☐ Check Google Sheets — ada data masuk?"
echo "  ☐ Check command response — bot kirim pesan?"
echo ""
