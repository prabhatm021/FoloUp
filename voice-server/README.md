# FoloUp — Pipecat Voice Server

Real-time voice interview pipeline for [FoloUp](https://github.com/prabhatm021/FoloUp).

**Pipeline:** Browser mic → VAD → STT → Groq LLM → TTS → Browser speaker
**Transport:** WebRTC via SmallWebRTC

---

## Choose your setup path

| | Path A — Cloud (easy) | Path B — Local (private) |
|---|---|---|
| **STT** | Groq Whisper API | faster-whisper on your GPU |
| **TTS** | Groq Orpheus API | Piper TTS on CPU |
| **Needs GPU?** | ❌ No | ✅ Yes (CUDA) |
| **Needs API key?** | ✅ Groq key | ❌ No (for voice) |
| **Quality** | Great | Great |
| **Latency** | ~300ms extra | Lowest |

> You need a [Groq API key](https://console.groq.com) for the **LLM** regardless of which path you choose. Path A just also uses it for voice.

---

## Quick start

### 1. Clone the FoloUp repo (if you haven't already)

```bash
git clone https://github.com/prabhatm021/FoloUp.git
cd FoloUp/voice-server
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

**Path A — Cloud (no GPU needed):**
```bash
pip install fastapi uvicorn python-dotenv "pipecat-ai[silero,smallwebrtc,groq]" aiortc
```

**Path B — Local (GPU required):**
```bash
pip install -r requirements.txt
# Also install CUDA runtime libs for faster-whisper:
pip install "faster-whisper[cuda]"
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

**Path A — Cloud:**
```env
GROQ_API_KEY=your_groq_api_key_here
STT_PROVIDER=groq
TTS_PROVIDER=groq
```

**Path B — Local:**
```env
GROQ_API_KEY=your_groq_api_key_here   # still needed for the LLM
STT_PROVIDER=local
TTS_PROVIDER=local
```

### 4. Run the server

```bash
chmod +x run.sh
./run.sh
```

> **Note:** `run.sh` must be run with your virtualenv **already activated** (`source .venv/bin/activate`) so it can auto-detect CUDA library paths.

Server starts at `http://localhost:7860`.

---

## Environment variables

| Variable | Default | Options | Description |
|---|---|---|---|
| `GROQ_API_KEY` | — | — | Required. Get one free at [console.groq.com](https://console.groq.com) |
| `STT_PROVIDER` | `local` | `local` / `groq` | `local` = faster-whisper on GPU; `groq` = Groq cloud Whisper |
| `TTS_PROVIDER` | `local` | `local` / `groq` | `local` = Piper TTS on CPU; `groq` = Groq Orpheus (48kHz) |

---

## Do I have a CUDA GPU?

Run this:
```bash
python3 -c "import torch; print(torch.cuda.is_available())"
```
- `True` → use **Path B (local)**
- `False` or command not found → use **Path A (cloud)**

Not sure what GPU you have?
```bash
nvidia-smi
```
If that command works, you have an NVIDIA GPU and likely have CUDA support.

---

## Voices (local TTS only)

Piper voice models are **auto-downloaded** on first run into `./voices/`. No manual download needed.

| Interviewer | Voice model |
|---|---|
| Female (default) | `en_US-lessac-high` |
| Male ("Bob") | `en_US-ryan-high` |

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/offer` | WebRTC SDP offer — starts a session |
| `PATCH` | `/api/offer` | ICE candidate trickle |
| `GET` | `/health` | Health check + active providers |

---

## Requirements

- Python 3.10+
- **Path A:** Any machine with internet access
- **Path B:** NVIDIA GPU with CUDA 12.x, 4GB+ VRAM recommended

---

## Connecting to FoloUp

Point the FoloUp Next.js app at this server by setting in your FoloUp `.env`:
```env
NEXT_PUBLIC_PIPECAT_URL=http://localhost:7860
```
