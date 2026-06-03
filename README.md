[![GitHub stars](https://img.shields.io/github/stars/prabhatm021/FoloUp?style=social)](https://github.com/prabhatm021/FoloUp/stargazers)
![License](https://img.shields.io/github/license/prabhatm021/FoloUp)

# FoloUp — AI Practice Interview Tool 🎙️

FoloUp is an open-source AI-powered practice interview platform. Create custom interviews, practice with a real-time voice AI interviewer, and get detailed feedback on your performance — all running locally on your machine.

## Key Features

- **🎙️ Real-time Voice Interviews:** Talk to an AI interviewer that listens, responds, and adapts — powered by WebRTC and a local/cloud voice pipeline
- **🎯 Custom Interview Creation:** Define your own objective, topics, and upload a resume/document for personalised questions
- **🤖 Adaptive AI:** No fixed question list — the AI improvises based on your objective and your answers
- **📊 Automatic Analytics:** Detailed scores and feedback generated automatically after each session
- **📈 Dashboard:** Track all your past sessions, scores, and progress over time
- **🔒 Fully local option:** Run STT and TTS on your own GPU — no data leaves your machine

---

## Architecture

```
Browser (Next.js)  ←→  Voice Server (Python/Pipecat)
       ↓
   Supabase (local)
```

- **Next.js app** — UI, dashboard, analytics (this repo, `src/`)
- **Voice server** — Real-time WebRTC pipeline: VAD → STT → Groq LLM → TTS (`voice-server/`)
- **Supabase** — Local database for interviews, responses, transcripts

---

## Prerequisites

- Node.js 18+ and Yarn
- Python 3.10+ (for the voice server)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase`)
- A free [Groq API key](https://console.groq.com) — used for the LLM (and optionally for cloud STT/TTS)

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/prabhatm021/FoloUp.git
cd FoloUp
```

### 2. Configure the Next.js app

```bash
cp .env.example .env
```

Fill in `.env`:

```env
NEXT_PUBLIC_LIVE_URL=localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Supabase — get these after running `supabase start` (step 3)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start output>

# Groq — required for analytics and LLM
GROQ_API_KEY=your_groq_api_key_here

# OpenAI — optional fallback if GROQ_API_KEY is not set
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Start Supabase locally

```bash
supabase start
```

This prints a local URL and anon key — paste them into `.env` above.

Then apply the schema:

```bash
supabase db reset
```

### 4. Install and run the Next.js app

```bash
yarn
yarn dev
```

App runs at [http://localhost:3000](http://localhost:3000).

### 5. Set up the voice server

The voice server runs as a separate process. See **[voice-server/README.md](voice-server/README.md)** for full setup — it covers:

- **No GPU (easy):** Use Groq cloud for STT + TTS — just needs your Groq API key
- **With GPU:** Run faster-whisper + Piper TTS fully locally — no data leaves your machine

Quick version:

```bash
cd voice-server
python3 -m venv .venv
source .venv/bin/activate

# Cloud path (no GPU needed):
pip install fastapi uvicorn python-dotenv "pipecat-ai[silero,smallwebrtc,groq]" aiortc
cp .env.example .env   # set GROQ_API_KEY, STT_PROVIDER=groq, TTS_PROVIDER=groq

# Then start it:
./run.sh
```

Voice server runs at `http://localhost:7860`.

---

## STT / TTS options

| | Cloud (easy, no GPU) | Local (private, GPU required) |
|---|---|---|
| **Set via** | `STT_PROVIDER=groq` / `TTS_PROVIDER=groq` | `STT_PROVIDER=local` / `TTS_PROVIDER=local` |
| **STT model** | Groq Whisper API | faster-whisper large-v3-turbo (CUDA) |
| **TTS model** | Groq Orpheus | Piper TTS (CPU) |
| **Needs GPU?** | ❌ | ✅ NVIDIA CUDA |
| **Extra cost?** | Groq free tier is generous | ❌ Free |

---

## Running in production

- Deploy the Next.js app to [Vercel](https://vercel.com/) or any Node host
- Deploy the voice server to any machine with Python (GPU optional)
- Use a hosted [Supabase](https://supabase.com/) project instead of local

---

## Contributing

Fork the repo, make your changes, and open a pull request. Contributions are welcome!

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT
