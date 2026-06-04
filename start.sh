#!/bin/bash
# FoloUp — start both servers with one command
# Usage: ./start.sh

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  FoloUp Dev Launcher"
echo "  ───────────────────"
echo "  Next.js  → http://localhost:3000"
echo "  Voice    → http://localhost:7860"
echo ""
echo "  Press Ctrl+C to stop both servers"
echo ""

# Start voice server in background, capture its PID
cd "$ROOT/voice-server"
./run.sh &
VOICE_PID=$!

# Bring Next.js to foreground
cd "$ROOT"
yarn dev &
NEXT_PID=$!

# On Ctrl+C — kill both cleanly
trap "echo ''; echo 'Stopping...'; kill $VOICE_PID $NEXT_PID 2>/dev/null; wait" INT TERM

wait
