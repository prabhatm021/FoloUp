"use client";

import { FeedbackForm } from "@/components/call/feedbackForm";
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
import { FeedbackService } from "@/services/feedback.service";
import { InterviewerService } from "@/services/interviewers.service";
import { ResponseService } from "@/services/responses.service";
import type { Interview } from "@/types/interview";
import type { FeedbackData } from "@/types/response";
import {
  PipecatClient,
  RTVIEvent,
  type BotLLMTextData,
  type TranscriptData,
} from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import { AlarmClockIcon, ArrowUpRightSquareIcon, CheckCircleIcon, XCircleIcon } from "lucide-react";
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
  const [isFeedbackSubmitted, setIsFeedbackSubmitted] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [interviewerImg, setInterviewerImg] = useState("");
  const [interviewerName, setInterviewerName] = useState("");
  const [interviewTimeDuration, setInterviewTimeDuration] = useState<string>("1");
  const [time, setTime] = useState(0);
  const [currentTimeDuration, setCurrentTimeDuration] = useState<string>("0");

  // Pipecat client ref — stable across renders
  const clientRef = useRef<PipecatClient | null>(null);
  // Audio element for bot voice playback (SmallWebRTCTransport does not
  // auto-attach the remote audio track; the app must do it via onTrackStarted)
  const botAudioRef = useRef<HTMLAudioElement | null>(null);
  // Full transcript accumulator for saving on end
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  // When true, next onBotTranscript chunk starts a fresh caption (clears old one)
  const botNewTurnRef = useRef(false);
  // Accumulates only the current bot turn text — used for reliable transcript saving
  const currentBotTurnRef = useRef("");
  // Tracks call start time so we can save duration on end
  const callStartTimeRef = useRef<number>(0);

  const lastUserResponseRef = useRef<HTMLDivElement | null>(null);

  const handleFeedbackSubmit = async (formData: Omit<FeedbackData, "interview_id">) => {
    try {
      const result = await FeedbackService.submitFeedback({
        ...formData,
        interview_id: interview.id,
      });
      if (result) {
        toast.success("Thank you for your feedback!");
        setIsFeedbackSubmitted(true);
        setIsDialogOpen(false);
      } else {
        toast.error("Failed to submit feedback. Please try again.");
      }
    } catch (error) {
      console.error("Error submitting feedback:", error);
      toast.error("An error occurred. Please try again later.");
    }
  };

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
      // Calculate duration in seconds from call start
      const durationSecs = callStartTimeRef.current
        ? Math.round((Date.now() - callStartTimeRef.current) / 1000)
        : 0;
      ResponseService.saveResponse(
        {
          is_ended: true,
          duration: durationSecs,
          details: { transcript: transcriptRef.current },
        },
        callId,
      ).catch(console.error);
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
      // Pre-initialise Daily.co call object with local bundle so the browser
      // never needs to reach c.daily.co (SmallWebRTCTransport uses daily-js
      // internally for mic/camera management).
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
            setIsCalling(true);
            setIsStarted(true);
            setLoading(false);
          },
          // SmallWebRTCTransport does not auto-play remote tracks — we must
          // grab the bot's audio track here and attach it to an audio element.
          onTrackStarted: (track: MediaStreamTrack) => {
            if (track.kind !== "audio") return;
            console.log("[Pipecat] Bot audio track started — attaching to <audio>");
            let el = botAudioRef.current;
            if (!el) {
              el = new Audio();
              el.autoplay = true;
              botAudioRef.current = el;
            }
            el.srcObject = new MediaStream([track]);
            el.play().catch((e) =>
              console.warn("[Pipecat] audio.play() blocked:", e)
            );
          },
          onBotReady: () => {
            // Phase 5: real LLM will fire this; no-op for Phase 3 EchoInterviewer
            console.log("[Pipecat] Bot ready signal received");
          },
          onDisconnected: () => {
            console.log("[Pipecat] Disconnected");
            setIsCalling(false);
            setIsEnded(true);
          },
          onBotStartedSpeaking: () => {
            setActiveTurn("agent");
            // Reset current turn accumulator so we capture only this turn
            currentBotTurnRef.current = "";
            // Mark that the display caption should start fresh on next chunk
            botNewTurnRef.current = true;
          },
          onBotStoppedSpeaking: () => {
            setActiveTurn("user");
            // Save the completed bot turn using the dedicated ref (not state)
            // to avoid any React batching / stale-capture issues.
            const turnText = currentBotTurnRef.current.trim();
            if (turnText) {
              transcriptRef.current = [
                ...transcriptRef.current,
                { role: "bot", content: turnText },
              ];
            }
            currentBotTurnRef.current = "";
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
              // Accumulate into the display caption word-by-word
              setLastInterviewerResponse((prev) => {
                if (botNewTurnRef.current) {
                  // First chunk of a new bot turn — start fresh in display
                  botNewTurnRef.current = false;
                  return data.text;
                }
                return prev ? `${prev} ${data.text}` : data.text;
              });
              // Also accumulate into the turn ref for reliable transcript saving
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
        botAudioRef.current = null;
      }
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="bg-white rounded-md md:w-[80%] w-[90%]">
        <Card className="h-[88vh] rounded-lg border-2 border-b-4 border-r-4 border-black text-xl font-bold transition-all md:block dark:border-white">
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
                    ) : (
                      <p className="italic text-gray-400 text-sm">Your speech will appear here…</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── End call button ───────────────────────────────────────── */}
            {isStarted && !isEnded && (
              <div className="items-center p-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild className="w-full">
                    <Button
                      className="bg-white text-black border border-indigo-600 h-10 mx-auto flex flex-row justify-center mb-8"
                      disabled={Loading}
                    >
                      End Interview{" "}
                      <XCircleIcon className="h-[1.5rem] ml-2 w-[1.5rem] rotate-0 scale-100 dark:-rotate-90 dark:scale-0 text-red" />
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

                  {isStarted && !isFeedbackSubmitted && (
                    <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                      <AlertDialogTrigger asChild className="w-full flex justify-center">
                        <Button
                          className="bg-indigo-600 text-white h-10 mt-4 mb-4"
                          onClick={() => setIsDialogOpen(true)}
                        >
                          Provide Feedback
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <FeedbackForm email="local@localhost" onSubmit={handleFeedbackSubmit} />
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
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
