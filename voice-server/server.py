"""
FoloUp Pipecat Voice Server
----------------------------
Pipeline: Browser mic → Silero VAD → STT → Groq LLM → TTS → Browser speaker
WebRTC transport via SmallWebRTC

STT/TTS providers are selected via environment variables:
  STT_PROVIDER=local   → faster-whisper (runs on GPU, requires CUDA)
  STT_PROVIDER=groq    → Groq Whisper cloud API (requires GROQ_API_KEY)

  TTS_PROVIDER=local   → Piper TTS (runs on CPU, voices downloaded to ./voices/)
  TTS_PROVIDER=groq    → Groq Orpheus TTS cloud API (requires GROQ_API_KEY, 48kHz)

Models are preloaded at startup so each connection is instant.
"""

import asyncio
import logging
import os
import re
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import EndFrame, LLMContextFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.processors.audio.vad_processor import VADProcessor
from pipecat.services.groq.llm import GroqLLMService
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.request_handler import (
    SmallWebRTCRequest,
    SmallWebRTCRequestHandler,
)
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

load_dotenv()

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# ── Provider selection ─────────────────────────────────────────────────────────
STT_PROVIDER = os.getenv("STT_PROVIDER", "local").lower()   # "local" | "groq"
TTS_PROVIDER = os.getenv("TTS_PROVIDER", "local").lower()   # "local" | "groq"

# Groq TTS outputs at 48kHz; Piper outputs at 22050 Hz.
AUDIO_OUT_SAMPLE_RATE = 48000 if TTS_PROVIDER == "groq" else 22050

logger.info(f"Providers — STT: {STT_PROVIDER}, TTS: {TTS_PROVIDER}")


# ── Text sanitiser (prevents Piper TTS garble on special chars) ───────────────
_CLEAN_RE = re.compile(r"[^\w\s.,!?'\-:;()\"]")

def sanitise_for_tts(text: str) -> str:
    """Strip characters that can confuse Piper TTS and cause garbled output."""
    return _CLEAN_RE.sub("", text).strip()


# ── Local Whisper model cache ──────────────────────────────────────────────────
def _make_local_stt():
    from pipecat.services.whisper.stt import WhisperSTTService

    class CachedWhisperSTTService(WhisperSTTService):
        _cached_model = None

        def _load(self):
            if CachedWhisperSTTService._cached_model is None:
                logger.info("[Whisper/local] Loading model into cache...")
                super()._load()
                CachedWhisperSTTService._cached_model = self._model
                logger.info("[Whisper/local] Model cached — future loads are instant")
            else:
                self._model = CachedWhisperSTTService._cached_model
                logger.info("[Whisper/local] Using cached model (instant)")

    return CachedWhisperSTTService(
        settings=CachedWhisperSTTService.Settings(model="large-v3-turbo"),
        device="cuda",
        compute_type="int8",
        no_speech_threshold=0.6,
        condition_on_previous_text=False,
    )


def _make_groq_stt():
    from pipecat.services.groq.stt import GroqSTTService
    logger.info("[Whisper/groq] Using Groq cloud Whisper STT")
    return GroqSTTService(
        api_key=os.environ["GROQ_API_KEY"],
        model="whisper-large-v3-turbo",
    )


# ── TTS factories ──────────────────────────────────────────────────────────────

# Groq Orpheus voice mapping: female (Lisa) → "tara", male (Bob) → "leo"
_GROQ_VOICES = {"female": "tara", "male": "leo"}
_PIPER_VOICES = {"female": "en_US-lessac-high", "male": "en_US-ryan-high"}

def _get_gender(interviewer_name: str) -> str:
    return "male" if "bob" in interviewer_name.lower() else "female"


def _make_local_tts(interviewer_name: str):
    from pipecat.services.piper.tts import PiperTTSService
    voice = _PIPER_VOICES[_get_gender(interviewer_name)]
    return PiperTTSService(
        settings=PiperTTSService.Settings(voice=voice),
        download_dir=Path("./voices"),
        use_cuda=False,
    )


def _make_groq_tts(interviewer_name: str):
    from pipecat.services.groq.tts import GroqTTSService
    voice = _GROQ_VOICES[_get_gender(interviewer_name)]
    logger.info(f"[TTS/groq] Using Groq Orpheus TTS, voice={voice}")
    return GroqTTSService(
        api_key=os.environ["GROQ_API_KEY"],
        settings=GroqTTSService.Settings(
            model="canopylabs/orpheus-v1-english",
            voice=voice,
        ),
    )


# ── System prompt builder ──────────────────────────────────────────────────────
def build_system_prompt(interview_data: dict) -> str:
    objective = interview_data.get("objective", "Conduct a professional interview.")
    time_duration = interview_data.get("time_duration", "30")
    document_context = (interview_data.get("document_context") or "").strip()

    candidate_section = ""
    if document_context:
        trimmed = document_context[:2000]
        if len(document_context) > 2000:
            trimmed += "\n[document trimmed]"
        candidate_section = f"""
CANDIDATE BACKGROUND (from their uploaded document — use this to personalise your questions):
{trimmed}
"""

    return f"""You are an expert interviewer running a realistic, high-quality practice interview session.

INTERVIEW FOCUS:
{objective}
{candidate_section}
TOTAL SESSION TIME: {time_duration} minutes.

YOUR JOB:
Conduct a natural, adaptive interview based entirely on the focus above. You have no script — explore topics fluidly the way a real interviewer would.

OPENING:
Introduce yourself in one sentence, then ask your first question. If you have the candidate's background, open with something specific from it — make it feel personal, not generic.

HOW TO INTERVIEW:
- Follow the focus above precisely. If it names specific topics, methods, or frameworks — cover those. Do not substitute your own topic list.
- Take one topic at a time. Ask a broad opening question, then dig deeper based on what the candidate says.
- When an answer is vague or surface-level: probe with one specific follow-up ("Can you walk me through exactly what you did?" or "What was the outcome?").
- When an answer is strong and specific: acknowledge it briefly and move on.
- When the candidate mentions something interesting: follow that thread — that's where real insight lives.
- Never ask two questions in one turn.
- Never revisit a topic the candidate has already addressed well.

PACING:
- Aim to explore 3–5 distinct areas within {time_duration} minutes. Depth over breadth.
- With ~2 minutes left: wrap up warmly. Briefly note what stood out and thank them.

TONE:
- Warm but professional. Challenging but fair.
- React like a real person — not a checklist.

VOICE RULES (critical — output goes directly to text-to-speech):
- Every response is 2–3 sentences maximum. No exceptions.
- No bullet points, lists, headers, or markdown of any kind.
- No filler phrases like "Great question!" or "Certainly!".
- Write exactly as you would say it out loud in a real conversation.
"""


# ── Startup: pre-warm models ───────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=" * 60)
    logger.info(f"Starting up — STT: {STT_PROVIDER}, TTS: {TTS_PROVIDER}")
    logger.info("=" * 60)

    if STT_PROVIDER == "local":
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: _make_local_stt()._load())
        logger.info("[STT] Local Whisper model warmed")
    else:
        logger.info("[STT] Groq cloud Whisper — no warm-up needed")

    if TTS_PROVIDER == "local":
        loop = asyncio.get_event_loop()

        def _warm_piper_female():
            from pipecat.services.piper.tts import PiperTTSService
            PiperTTSService(
                settings=PiperTTSService.Settings(voice="en_US-lessac-high"),
                download_dir=Path("./voices"),
                use_cuda=False,
            )
            logger.info("[TTS] Local Piper female voice warmed")

        def _warm_piper_male():
            from pipecat.services.piper.tts import PiperTTSService
            PiperTTSService(
                settings=PiperTTSService.Settings(voice="en_US-ryan-high"),
                download_dir=Path("./voices"),
                use_cuda=False,
            )
            logger.info("[TTS] Local Piper male voice warmed")

        await loop.run_in_executor(None, _warm_piper_female)
        await loop.run_in_executor(None, _warm_piper_male)
    else:
        logger.info("[TTS] Groq cloud Orpheus — no warm-up needed")

    logger.info("=" * 60)
    logger.info("All models ready — server accepting connections")
    logger.info("=" * 60)
    yield


# ── Pipeline factory ───────────────────────────────────────────────────────────
async def run_pipeline(
    webrtc_connection: SmallWebRTCConnection,
    interview_data: dict | None = None,
):
    interview_data = interview_data or {}
    call_id = interview_data.get("call_id", "unknown")
    interviewer_name = interview_data.get("interviewer_name", "")
    logger.info(f"Starting pipeline — call_id={call_id}, interviewer={interviewer_name!r}, "
                f"stt={STT_PROVIDER}, tts={TTS_PROVIDER}")

    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            audio_in_sample_rate=16000,
            audio_out_sample_rate=AUDIO_OUT_SAMPLE_RATE,
        ),
    )

    stt = _make_local_stt() if STT_PROVIDER == "local" else _make_groq_stt()

    llm = GroqLLMService(
        api_key=os.environ["GROQ_API_KEY"],
        settings=GroqLLMService.Settings(model="llama-3.3-70b-versatile"),
    )

    tts = _make_local_tts(interviewer_name) if TTS_PROVIDER == "local" else _make_groq_tts(interviewer_name)

    vad = VADProcessor(
        vad_analyzer=SileroVADAnalyzer(
            params=VADParams(
                confidence=0.6,
                start_secs=0.2,
                stop_secs=0.8,
                min_volume=0.05,  # low threshold — catches normal speech levels
            )
        )
    )

    system_prompt = build_system_prompt(interview_data)
    logger.info(f"[LLM] System prompt built ({len(system_prompt)} chars)")

    context = LLMContext(messages=[
        {"role": "system", "content": system_prompt},
    ])

    aggregators = LLMContextAggregatorPair(context)

    pipeline = Pipeline([
        transport.input(),
        vad,
        stt,
        aggregators.user(),
        llm,
        tts,
        transport.output(),
        aggregators.assistant(),
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=16000,
            audio_out_sample_rate=AUDIO_OUT_SAMPLE_RATE,
        ),
        # Kill the pipeline after 30s of silence/inactivity — prevents stale
        # tasks from accumulating and corrupting the shared request handler
        # state when new connections come in.
        idle_timeout_secs=30,
        cancel_on_idle_timeout=True,
    )

    @transport.event_handler("on_client_connected")
    async def on_connect(_transport, *args):
        logger.info(f"Client connected (call_id={call_id})")
        await task.queue_frame(LLMContextFrame(context))

    @transport.event_handler("on_client_disconnected")
    async def on_disconnect(_transport, *args):
        logger.info(f"Client disconnected (call_id={call_id})")
        await task.queue_frame(EndFrame())
        # Close the WebRTC connection so its pc_id is freed from the request
        # handler registry — prevents stale tasks from blocking new connections.
        try:
            await webrtc_connection.close()
        except Exception:
            pass

    runner = PipelineRunner(handle_sigint=False)
    await runner.run(task)
    logger.info(f"Pipeline finished (call_id={call_id})")


# ── FastAPI ────────────────────────────────────────────────────────────────────
app = FastAPI(title="FoloUp Pipecat Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

_request_handler = SmallWebRTCRequestHandler()


@app.post("/api/offer")
async def offer(request: Request, background_tasks: BackgroundTasks):
    data = await request.json()
    logger.info(f"WebRTC offer received (pc_id={data.get('pc_id', 'new')})")

    interview_data: dict | None = data.get("requestData")
    if not interview_data:
        logger.warning("No requestData — running without interview context")

    webrtc_request = SmallWebRTCRequest(
        sdp=data["sdp"],
        type=data["type"],
        pc_id=data.get("pc_id"),
    )

    async def pipeline_with_context(conn: SmallWebRTCConnection):
        async def run_safe(c, d):
            try:
                await run_pipeline(c, d)
            except Exception as exc:
                logger.exception(f"Pipeline error (call_id={d.get('call_id') if d else '?'}): {exc}")

        background_tasks.add_task(run_safe, conn, interview_data)

    answer = await _request_handler.handle_web_request(webrtc_request, pipeline_with_context)
    return answer


@app.patch("/api/offer")
async def patch_offer(request: Request):
    from pipecat.transports.smallwebrtc.request_handler import IceCandidate, SmallWebRTCPatchRequest

    data = await request.json()
    valid_candidates = [
        IceCandidate(**c)
        for c in data.get("candidates", [])
        if c.get("candidate") and len(c["candidate"].split()) >= 8
    ]

    await _request_handler.handle_patch_request(
        SmallWebRTCPatchRequest(pc_id=data["pc_id"], candidates=valid_candidates)
    )
    return {"status": "ok"}


@app.get("/health")
async def health():
    return {"status": "ok", "stt": STT_PROVIDER, "tts": TTS_PROVIDER}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860, log_level="info")
