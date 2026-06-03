#!/bin/bash
# FoloUp Pipecat voice server launcher
# Usage: ./run.sh
#
# If using STT_PROVIDER=local (faster-whisper on CUDA), the CUDA shared libraries
# must be on LD_LIBRARY_PATH before Python starts — os.environ is too late for
# ctranslate2. This script auto-detects them from your active virtualenv.

set -e
cd "$(dirname "$0")"

# ── CUDA library paths (auto-detected from active venv) ───────────────────────
if [ -n "$VIRTUAL_ENV" ]; then
    NVIDIA_LIB_DIR="$VIRTUAL_ENV/lib/python$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')/site-packages/nvidia"
    if [ -d "$NVIDIA_LIB_DIR" ]; then
        CUBLAS="$NVIDIA_LIB_DIR/cublas/lib"
        CUDNN="$NVIDIA_LIB_DIR/cudnn/lib"
        export LD_LIBRARY_PATH="$CUBLAS:$CUDNN${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    fi
fi

# ── Start server ───────────────────────────────────────────────────────────────
STT=${STT_PROVIDER:-local}
TTS=${TTS_PROVIDER:-local}

echo ""
echo "  FoloUp Pipecat Server"
echo "  ─────────────────────"
echo "  WebRTC endpoint : http://localhost:7860/api/offer"
echo "  Health check    : http://localhost:7860/health"
echo "  STT provider    : $STT"
echo "  TTS provider    : $TTS"
echo ""

python3 server.py
