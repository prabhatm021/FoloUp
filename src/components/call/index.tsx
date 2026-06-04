"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useResponses } from "@/contexts/responses.context";
import { isLightColor } from "@/lib/utils";
import { InterviewerService } from "@/services/interviewers.service";
import { ResponseService } from "@/services/responses.service";
import type { Interview } from "@/types/interview";
import {
  PipecatClient,
  RTVIEvent,
  type BotLLMTextData,
  type TranscriptData,
} from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import { AlarmClockIcon, ArrowUpRightSquareIcon, CheckCircleIcon, PauseCircleIcon, PlayCircleIcon, XCircleIcon } from "lucide-react";
import Image from "next/image";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import MiniLoader from "../loaders/mini-loader/miniLoader";
import { Button } from "../ui/button";
import { Card, CardHeader, CardTitle } from "../ui/card";

// ── Pipecat server URL ──────────────────────────────────────────────────────
const PIPECAT_URL = "http://localhost:7860";

type InterviewProps = {
  interview: Interview;
};

type TranscriptEntry = {
  role: "user" | "bot";
  content: string;
};

function Call({ interview }: InterviewProps) {
  const { createResponse } = useResponses();
  const [lastInterviewerResponse, setLastInterviewerResponse] = useState<string>("");
  const [lastUserResponse, setLastUserResponse] = useState<string>("");
  const [activeTurn, setActiveTurn] = useState<string>("");
  const [Loading, setLoading] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [callId, setCallId] = useState<string>("");
  const [interviewerImg, setInterviewerImg] = useState("");
  const [interviewerName, setInterviewerName] = useState("");
  const [interviewTimeDuration, setInterviewTimeDuration] = useState<string>("1");
  const [time, setTime] = useState(0);
  const [currentTimeDuration, setCurrentTimeDuration] = useState<string>("0");
  const [isPaused, setIsPaused] = useState(false);
  const [pauseSeconds, setPauseSeconds] = useState(0);

  // Pipecat client ref — stable across renders
  const clientRef = useRef<PipecatClient | null>(null);
  // Audio element for bot voice playback — rendered in JSX so Chrome's
  // autoplay policy allows play() even seconds after the user's last click
  const botAudioRef = useRef<HTMLAudioElement | null>(null);
  // Tracks whether onConnected has fired — used to handle onTrackStarted arriving
  // before OR after onConnected (order varies by browser/network conditions)
  const isConnectedRef = useRef(false);
  // Holds the bot's audio track until connected — prevents noise during loading
  const botTrackRef = useRef<MediaStreamTrack | null>(null);
  // Full transcript accumulator for saving on end
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  // true while the bot's TTS is actively playing audio
  const botSpeakingRef = useRef(false);
  // Tokens that arrived before TTS started — flushed to display on onBotStartedSpeaking
  const pendingBotTokensRef = useRef<string[]>([]);
  // When paused mid-bot-speech, delay audio re-attach until bot finishes
  const pendingAudioResumeRef = useRef(false);
  // Accumulates only the current bot turn text — used for reliable transcript saving
  const currentBotTurnRef = useRef("");
  // Tracks call start time so we can save duration on end
  const callStartTimeRef = useRef<number>(0);

  const lastUserResponseRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll user transcript box
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on content change
  useEffect(() => {
    if (lastUserResponseRef.current) {
      const { current } = lastUserResponseRef;
      current.scrollTop = current.scrollHeight;
    }
  }, [lastUserResponse]);

  // ── Timer / auto-end ────────────────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional timer deps
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (isCalling) {
      intervalId = setInterval(() => setTime((t) => t + 1), 10);
    }
    setCurrentTimeDuration(String(Math.floor(time / 100)));
    if (Number(currentTimeDuration) === Number(interviewTimeDuration) * 60) {
      clientRef.current?.disconnect();
    }
    return () => clearInterval(intervalId);
  }, [isCalling, time, currentTimeDuration]);

  // ── Pause stopwatch ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPaused) { setPauseSeconds(0); return; }
    const id = setInterval(() => setPauseSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isPaused]);

  // ── Toggle pause ─────────────────────────────────────────────────────────────
  const togglePause = useCallback(() => {
    if (!clientRef.current) return;
    const next = !isPaused;

    // DO NOT use clientRef.current.enableMic() here.
    // enableMic() calls Daily.js setLocalAudio() which STOPS then RESTARTS
    // the audio capture stream on resume. That stream restart blows away
    // Chrome's AEC calibration every time, causing the user to hear their
    // own voice echoed back after every resume.
    //
    // Instead: grab the underlying MediaStreamTrack and toggle .enabled.
    // This is a WebRTC-level soft-mute — the stream stays alive, AEC stays
    // calibrated, the sender just sends silence RTP packets during pause.
    // Silero VAD on the server sees silence → no STT triggered.
    const micTrack = clientRef.current.tracks()?.local?.audio as MediaStreamTrack | undefined;
    if (micTrack) micTrack.enabled = !next;

    if (next) {
      // PAUSE — detach audio immediately so bot stops mid-sentence.
      // srcObject=null discards the live stream; no audio plays at all.
      if (botAudioRef.current) botAudioRef.current.srcObject = null;
    } else {
      // RESUME — only re-attach audio if the server has already finished
      // its current TTS turn. If the bot is still speaking (server kept
      // going while we were paused), we set a flag and re-attach in
      // onBotStoppedSpeaking once the server is done. This prevents
      // hearing the leftover tail of whatever the bot was saying.
      if (!botSpeakingRef.current) {
        const track = botTrackRef.current;
        if (track && botAudioRef.current) {
          botAudioRef.current.srcObject = new MediaStream([track]);
        }
      } else {
        pendingAudioResumeRef.current = true;
      }
      // Clear stale user caption only
      setLastUserResponse("");
    }

    setIsPaused(next);
  }, [isPaused]);

  // ── Interviewer image + name ────────────────────────────────────────────────
  useEffect(() => {
    const fetchInterviewer = async () => {
      const interviewer = await InterviewerService.getInterviewer(interview.interviewer_id);
      setInterviewerImg(interviewer.image);
      setInterviewerName(interviewer.name ?? "");
    };
    fetchInterviewer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview.interviewer_id]);

  useEffect(() => {
    if (interview?.time_duration) {
      setInterviewTimeDuration(interview.time_duration);
    }
  }, [interview]);

  // ── Save response.details on end ────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: run only when isEnded flips
  useEffect(() => {
    if (isEnded && callId) {
      // Save the last bot turn (it never gets a subsequent onBotStartedSpeaking)
      const lastBotTurn = currentBotTurnRef.current.trim();
      if (lastBotTurn) {
        transcriptRef.current = [
          ...transcriptRef.current,
          { role: "bot", content: lastBotTurn },
        ];
        currentBotTurnRef.current = "";
      }

      const durationSecs = callStartTimeRef.current
        ? Math.round((Date.now() - callStartTimeRef.current) / 1000)
        : 0;

      // Save transcript + duration, then kick off analytics in background
      // so the dashboard doesn't need a manual click to trigger Groq analysis.
      ResponseService.saveResponse(
        {
          is_ended: true,
          duration: durationSecs,
          details: { transcript: transcriptRef.current },
        },
        callId,
      ).then(() => {
        // Pre-warm analytics — fire and forget
        fetch("/api/get-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: callId }),
        }).catch(() => {});
      }).catch(console.error);
    }
  }, [isEnded]);

  // ── End call ─────────────────────────────────────────────────────────────────
  const onEndCallClick = useCallback(async () => {
    if (isStarted && clientRef.current) {
      setLoading(true);
      await clientRef.current.disconnect().catch(console.error);
      setLoading(false);
    }
    setIsEnded(true);
  }, [isStarted]);

  // ── Start conversation ───────────────────────────────────────────────────────
  const startConversation = async () => {
    setLoading(true);
    try {
      // Re-use any existing Daily call object rather than destroying it.
      // destroy() tears down internal Daily state that SmallWebRTCTransport
      // depends on, causing an immediate ICE→DTLS failure on the next attempt.
      // SmallWebRTCTransport creates fresh ICE/DTLS state per connect() call,
      // so reusing the call object here is safe.
      const DailyIframe = (await import("@daily-co/daily-js")).default;
      DailyIframe.getCallInstance() ??
        DailyIframe.createCallObject({
          // Bundles served by our local FastAPI server at :7860/static/
          bundlePathOverride: `${PIPECAT_URL}/static`,
        } as any);

      // Generate a fresh call ID
      const newCallId = crypto.randomUUID();
      setCallId(newCallId);
      transcriptRef.current = [];

      // Persist the response row in Supabase immediately
      await createResponse({
        interview_id: interview.id,
        call_id: newCallId,
        email: "local@localhost",
        name: "Local User",
      });

      // Interview context passed to the Pipecat server
      const interviewData = {
        call_id: newCallId,
        interview_id: interview.id,
        objective: interview.objective,
        // questions is empty for adaptive interviews — LLM improvises
        questions: interview.questions?.map((q: { question: string }) => q.question) ?? [],
        time_duration: interview.time_duration,
        interviewer_id: String(interview.interviewer_id),
        // Used by server.py to select the right Piper TTS voice per persona
        interviewer_name: interviewerName,
        // Extracted PDF text — lets the interviewer reference your background
        document_context: interview.document_context ?? "",
      };

      // Build transport + client
      const transport = new SmallWebRTCTransport({
        webrtcRequestParams: {
          endpoint: `${PIPECAT_URL}/api/offer`,
          requestData: interviewData,
        },
      });

      const client = new PipecatClient({
        transport,
        callbacks: {
          onConnected: () => {
            console.log("[Pipecat] Transport connected — starting session");
            callStartTimeRef.current = Date.now();
            isConnectedRef.current = true;
            setIsCalling(true);
            setIsStarted(true);
            setLoading(false);
            // onTrackStarted may have already fired — attach track if so
            const track = botTrackRef.current;
            if (track && botAudioRef.current) {
              console.log("[Pipecat] Attaching bot track on connect");
              botAudioRef.current.srcObject = new MediaStream([track]);
            }
          },
          // onTrackStarted fires before OR after onConnected depending on Chrome/network.
          // If already connected → attach immediately. Otherwise save for onConnected.
          onTrackStarted: (track: MediaStreamTrack) => {
            if (track.kind !== "audio") return;
            botTrackRef.current = track;
            if (isConnectedRef.current && botAudioRef.current) {
              console.log("[Pipecat] Bot audio track arrived — attaching to DOM element");
              botAudioRef.current.srcObject = new MediaStream([track]);
            } else {
              console.log("[Pipecat] Bot audio track received — holding until connected");
            }
          },
          onBotReady: () => {
            // Phase 5: real LLM will fire this; no-op for Phase 3 EchoInterviewer
            console.log("[Pipecat] Bot ready signal received");
          },
          onDisconnected: () => {
            console.log("[Pipecat] Disconnected");
            isConnectedRef.current = false;
            botTrackRef.current = null;
            botSpeakingRef.current = false;
            pendingBotTokensRef.current = [];
            pendingAudioResumeRef.current = false;
            setIsCalling(false);
            setIsEnded(true);
          },
          onBotStartedSpeaking: () => {
            setActiveTurn("agent");
            botSpeakingRef.current = true;
            // Save previous turn to transcript
            const prevTurn = currentBotTurnRef.current.trim();
            if (prevTurn) {
              transcriptRef.current = [
                ...transcriptRef.current,
                { role: "bot", content: prevTurn },
              ];
            }
            currentBotTurnRef.current = "";
            // Flush buffered tokens (arrived before TTS started) to display.
            // This replaces old captions only when audio actually begins —
            // so the previous question stays visible right up until the bot
            // starts speaking, with no blank flash.
            const buffered = pendingBotTokensRef.current.join(" ");
            pendingBotTokensRef.current = [];
            setLastInterviewerResponse(buffered);
          },
          onBotStoppedSpeaking: () => {
            botSpeakingRef.current = false;
            setActiveTurn("user");
            // If we paused while the bot was mid-speech, re-attach audio now
            // that the server has finished. The bot is silent so re-attaching
            // here plays nothing — fresh audio starts on the next bot turn.
            if (pendingAudioResumeRef.current) {
              pendingAudioResumeRef.current = false;
              const track = botTrackRef.current;
              if (track && botAudioRef.current) {
                botAudioRef.current.srcObject = new MediaStream([track]);
              }
            }
          },
          onUserStartedSpeaking: () => {
            // Clear only the user caption — bot's last question stays visible
            // while the user is formulating their answer.
            setLastUserResponse("");
            setActiveTurn("user");
          },
          onUserTranscript: (data: TranscriptData) => {
            if (data.text.trim()) {
              // Show both partial and final transcripts for a live feel.
              // Only append to the saved transcript on final results.
              setLastUserResponse(data.text);
              if (data.final) {
                transcriptRef.current = [
                  ...transcriptRef.current,
                  { role: "user", content: data.text },
                ];
              }
            }
          },
          onBotTranscript: (data: BotLLMTextData) => {
            if (data.text.trim()) {
              if (botSpeakingRef.current) {
                // TTS is active — append directly to display in sync with audio
                setLastInterviewerResponse((prev) => prev ? `${prev} ${data.text}` : data.text);
              } else {
                // TTS hasn't started yet — buffer until onBotStartedSpeaking
                pendingBotTokensRef.current.push(data.text);
              }
              currentBotTurnRef.current = currentBotTurnRef.current
                ? `${currentBotTurnRef.current} ${data.text}`
                : data.text;
            }
          },
        },
      });

      clientRef.current = client;
      await client.connect();
    } catch (err) {
      console.error("[Pipecat] Connection error:", err);
      toast.error("Failed to connect to the interview server. Is it running?");
      setIsEnded(true);
    } finally {
      setLoading(false);
    }
  };

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clientRef.current?.disconnect().catch(() => {});
      if (botAudioRef.current) {
        botAudioRef.current.srcObject = null;
      }
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="bg-white rounded-md md:w-[80%] w-[90%]">
        <Card className="relative h-[88vh] rounded-lg border-2 border-b-4 border-r-4 border-black text-xl font-bold transition-all md:block dark:border-white">
          <div>
            {/* Progress bar */}
            <div className="m-4 h-[15px] rounded-lg border-[1px] border-black">
              <div
                className="bg-indigo-600 h-[15px] rounded-lg"
                style={{
                  width: isEnded
                    ? "100%"
                    : `${
                        (Number(currentTimeDuration) / (Number(interviewTimeDuration) * 60)) * 100
                      }%`,
                }}
              />
            </div>

            <CardHeader className="items-center p-1">
              {!isEnded && (
                <CardTitle className="flex flex-row items-center text-lg md:text-xl font-bold mb-2">
                  {interview?.name}
                </CardTitle>
              )}
              {!isEnded && (
                <div className="flex mt-2 flex-row">
                  <AlarmClockIcon
                    className="text-indigo-600 h-[1rem] w-[1rem] rotate-0 scale-100 dark:-rotate-90 dark:scale-0 mr-2 font-bold"
                    style={{ color: interview.theme_color }}
                  />
                  <div className="text-sm font-normal">
                    Expected duration:{" "}
                    <span className="font-bold" style={{ color: interview.theme_color }}>
                      {interviewTimeDuration} mins
                    </span>{" "}
                    or less
                  </div>
                </div>
              )}
            </CardHeader>

            {/* Hidden bot audio element — must be in the DOM so Chrome's
                autoplay policy allows play() without a fresh user gesture */}
            {/* biome-ignore lint/a11y/useMediaCaption: bot voice, no captions needed */}
            <audio ref={botAudioRef} autoPlay playsInline style={{ display: "none" }} />

            {/* ── Pre-start screen ─────────────────────────────────────── */}
            {!isStarted && !isEnded && (
              <div className="w-fit min-w-[400px] max-w-[400px] mx-auto mt-2 border border-indigo-200 rounded-md p-2 m-2 bg-slate-50">
                {interview?.logo_url && (
                  <div className="p-1 flex justify-center">
                    <Image
                      src={interview.logo_url}
                      alt="Logo"
                      className="h-10 w-auto"
                      width={100}
                      height={100}
                    />
                  </div>
                )}
                <div className="p-2 font-normal text-sm mb-4 whitespace-pre-line">
                  {interview?.description && interview.description.trim().length > 0
                    ? interview.description
                    : null}
                  <p className="font-bold text-sm">
                    {"\n"}Ensure your volume is up and grant microphone access when prompted.
                    Additionally, please make sure you are in a quiet environment.
                  </p>
                  {typeof navigator !== "undefined" && navigator.userAgent.includes("Firefox") && (
                    <div className="mt-3 p-2 bg-amber-50 border border-amber-300 rounded text-xs text-amber-800">
                      ⚠️ <span className="font-semibold">Firefox detected.</span> The microphone may not work due to a known Firefox + WebRTC compatibility issue. For the best experience, please use <span className="font-semibold">Chrome or Chromium</span>.
                    </div>
                  )}
                </div>

                <div className="w-[80%] flex flex-row mx-auto justify-center items-center align-middle">
                  <Button
                    className="min-w-20 h-10 rounded-lg flex flex-row justify-center mb-8"
                    style={{
                      backgroundColor: interview.theme_color ?? "#4F46E5",
                      color: isLightColor(interview.theme_color ?? "#4F46E5") ? "black" : "white",
                    }}
                    disabled={Loading}
                    onClick={startConversation}
                  >
                    {!Loading ? "Start Interview" : <MiniLoader />}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        className="bg-white border ml-2 text-black min-w-15 h-10 rounded-lg flex flex-row justify-center mb-8"
                        style={{ borderColor: interview.theme_color }}
                        disabled={Loading}
                      >
                        Exit
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-indigo-600 hover:bg-indigo-800"
                          onClick={async () => {
                            await onEndCallClick();
                          }}
                        >
                          Continue
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}

            {/* ── Pause overlay ─────────────────────────────────────────── */}
            {isStarted && !isEnded && isPaused && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm rounded-lg">
                <PauseCircleIcon className="h-14 w-14 text-indigo-500 mb-4" />
                <p className="text-xl font-bold text-gray-800 mb-1">Interview Paused</p>
                <p className="text-sm text-gray-500 mb-6">Take your time — mic and audio are off</p>
                {/* Stopwatch */}
                <div className="text-5xl font-mono font-semibold text-indigo-600 mb-8 tabular-nums">
                  {String(Math.floor(pauseSeconds / 60)).padStart(2, "0")}
                  :
                  {String(pauseSeconds % 60).padStart(2, "0")}
                </div>
                <Button
                  className="px-8 h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2"
                  onClick={togglePause}
                >
                  <PlayCircleIcon className="h-5 w-5" />
                  Resume Interview
                </Button>
              </div>
            )}

            {/* ── Live call screen ──────────────────────────────────────── */}
            {isStarted && !isEnded && (
              <div className="flex flex-row p-2 grow">
                {/* Bot side */}
                <div className="border-r-2 border-gray-200 w-[50%] flex flex-col items-center py-4 px-4">
                  {/* Avatar + name */}
                  <div className="flex flex-col items-center mb-4">
                    <div className="relative">
                      {interviewerImg && (
                        <Image
                          src={interviewerImg}
                          alt="Image of the interviewer"
                          width={90}
                          height={90}
                          className={`object-cover object-center rounded-full transition-all duration-300 ${
                            activeTurn === "agent"
                              ? "ring-4 ring-indigo-500 ring-offset-2"
                              : "ring-2 ring-gray-200"
                          }`}
                        />
                      )}
                      {/* Speaking indicator dot */}
                      {activeTurn === "agent" && (
                        <span className="absolute bottom-1 right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse border-2 border-white" />
                      )}
                    </div>
                    <div className="font-semibold mt-2 text-sm text-gray-700">Interviewer</div>
                  </div>
                  {/* Caption box */}
                  <div
                    className={`w-full rounded-xl px-4 py-3 min-h-[160px] max-h-[220px] overflow-y-auto text-[15px] leading-relaxed transition-all duration-300 ${
                      activeTurn === "agent"
                        ? "bg-indigo-50 border border-indigo-200 text-gray-800"
                        : "bg-gray-50 border border-gray-200 text-gray-500"
                    }`}
                  >
                    {lastInterviewerResponse ? (
                      <p>{lastInterviewerResponse}</p>
                    ) : (
                      <p className="italic text-gray-400 text-sm">Waiting for interviewer…</p>
                    )}
                  </div>
                </div>

                {/* User side */}
                <div className="w-[50%] flex flex-col items-center py-4 px-4">
                  {/* Avatar + name */}
                  <div className="flex flex-col items-center mb-4">
                    <div className="relative">
                      <Image
                        src="/user-icon.png"
                        alt="Picture of the user"
                        width={90}
                        height={90}
                        className={`object-cover object-center rounded-full transition-all duration-300 ${
                          activeTurn === "user"
                            ? "ring-4 ring-indigo-500 ring-offset-2"
                            : "ring-2 ring-gray-200"
                        }`}
                      />
                      {/* Speaking indicator dot */}
                      {activeTurn === "user" && (
                        <span className="absolute bottom-1 right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse border-2 border-white" />
                      )}
                    </div>
                    <div className="font-semibold mt-2 text-sm text-gray-700">You</div>
                  </div>
                  {/* Caption box */}
                  <div
                    ref={lastUserResponseRef}
                    className={`w-full rounded-xl px-4 py-3 min-h-[160px] max-h-[220px] overflow-y-auto text-[15px] leading-relaxed transition-all duration-300 ${
                      activeTurn === "user"
                        ? "bg-indigo-50 border border-indigo-200 text-gray-800"
                        : "bg-gray-50 border border-gray-200 text-gray-500"
                    }`}
                  >
                    {lastUserResponse ? (
                      <p>{lastUserResponse}</p>
                    ) : activeTurn === "user" ? (
                      <p className="italic text-indigo-400 text-sm animate-pulse">Listening…</p>
                    ) : (
                      <p className="italic text-gray-400 text-sm">Your speech will appear here…</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Bottom action bar (Pause + End) ──────────────────────── */}
            {isStarted && !isEnded && (
              <div className="flex flex-row justify-center items-center gap-3 p-2">
                {/* Pause / Resume button */}
                <Button
                  className={`h-10 rounded-lg flex flex-row items-center gap-2 border ${
                    isPaused
                      ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                      : "bg-white text-black border-indigo-600 hover:bg-indigo-50"
                  }`}
                  onClick={togglePause}
                  disabled={Loading}
                >
                  {isPaused ? (
                    <><PlayCircleIcon className="h-5 w-5" /> Resume</>
                  ) : (
                    <><PauseCircleIcon className="h-5 w-5" /> Pause</>
                  )}
                </Button>

                {/* End interview */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      className="bg-white text-black border border-indigo-600 h-10 flex flex-row items-center gap-2"
                      disabled={Loading}
                    >
                      End Interview
                      <XCircleIcon className="h-5 w-5 text-red-500" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This action will end the call.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-indigo-600 hover:bg-indigo-800"
                        onClick={async () => {
                          await onEndCallClick();
                        }}
                      >
                        Continue
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            {/* ── Post-call / ended screen ──────────────────────────────── */}
            {isEnded && (
              <div className="w-fit min-w-[400px] max-w-[400px] mx-auto mt-2 border border-indigo-200 rounded-md p-2 m-2 bg-slate-50 absolute -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2">
                <div>
                  <div className="p-2 font-normal text-base mb-4 whitespace-pre-line">
                    <CheckCircleIcon className="h-[2rem] w-[2rem] mx-auto my-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-indigo-500" />
                    <p className="text-lg font-semibold text-center">
                      {isStarted
                        ? "Interview complete! Your responses have been saved."
                        : "Thank you for your time."}
                    </p>
                    <p className="text-center">{"\n"}You can close this tab now.</p>
                  </div>

                </div>
              </div>
            )}
          </div>
        </Card>

        <a
          className="flex flex-row justify-center align-middle mt-3"
          href="https://folo-up.co/"
          target="_blank"
          rel="noreferrer"
        >
          <div className="text-center text-md font-semibold mr-2">
            Powered by{" "}
            <span className="font-bold">
              Folo<span className="text-indigo-600">Up</span>
            </span>
          </div>
          <ArrowUpRightSquareIcon className="h-[1.5rem] w-[1.5rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-indigo-500" />
        </a>
      </div>
    </div>
  );
}

export default Call;
