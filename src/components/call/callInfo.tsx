"use client";

import QuestionAnswerCard from "@/components/dashboard/interview/questionAnswerCard";
import LoaderWithText from "@/components/loaders/loader-with-text/loaderWithText";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CandidateStatus } from "@/lib/enum";
import { ResponseService } from "@/services/responses.service";
import type { Analytics, CallData } from "@/types/response";
import { CircularProgress } from "@nextui-org/react";
import { ScrollArea } from "@radix-ui/react-scroll-area";
import axios from "axios";
import { DownloadIcon, RefreshCwIcon, TrashIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { marked } from "marked";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import ReactAudioPlayer from "react-audio-player";
import { toast } from "sonner";

type CallProps = {
  call_id: string;
  onDeleteResponse: (deletedCallId: string) => void;
  onCandidateStatusChange: (callId: string, newStatus: string) => void;
};

function CallInfo({ call_id, onDeleteResponse, onCandidateStatusChange }: CallProps) {
  const [call, setCall] = useState<CallData>();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [isClicked, setIsClicked] = useState(false);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [candidateStatus, setCandidateStatus] = useState<string>("");
  const [interviewId, setInterviewId] = useState<string>("");
  const [tabSwitchCount, setTabSwitchCount] = useState<number>();

  const fetchCallData = async (reanalyse = false) => {
    setIsLoading(true);
    setCall(undefined);
    setAnalytics(null);
    try {
      const response = await axios.post("/api/get-call", { id: call_id, reanalyse });
      setCall(response.data.callResponse);
      setAnalytics(response.data.analytics);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCallData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call_id]);

  useEffect(() => {
    const fetchEmail = async () => {
      setIsLoading(true);
      try {
        const response = await ResponseService.getResponseByCallId(call_id);
        setEmail(response.email);
        setName(response.name);
        setCandidateStatus(response.candidate_status);
        setInterviewId(response.interview_id);
        setTabSwitchCount(response.tab_switch_count);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call_id]);

  useEffect(() => {
    if (!call || !name) return;

    // Pipecat sessions save details.transcript as [{role, content}] array.
    // Older VAPI sessions saved it as a plain "Agent: ...\nUser: ..." string.
    // Normalise both to a consistent string before rendering.
    let rawTranscript: string;

    if (Array.isArray(call.transcript)) {
      // Pipecat format → convert to readable dialogue
      rawTranscript = (call.transcript as Array<{ role: string; content: string }>)
        .map((t) => `${t.role === "bot" ? "Interviewer" : name}: ${t.content}`)
        .join("\n\n");
    } else if (typeof call.transcript === "string") {
      // Legacy VAPI string format
      rawTranscript = (call.transcript as string)
        .replace(/Agent:/g, "**Interviewer:**")
        .replace(/User:/g, `**${name}:**`)
        .replace(/(?:\r\n|\r|\n)/g, "\n\n");
    } else {
      rawTranscript = "";
    }

    setTranscript(rawTranscript);
  }, [call, name]);

  const onDeleteResponseClick = async () => {
    try {
      const response = await ResponseService.getResponseByCallId(call_id);

      if (response) {
        const interview_id = response.interview_id;

        await ResponseService.deleteResponse(call_id);

        router.push(`/interviews/${interview_id}`);

        onDeleteResponse(call_id);
      }

      toast.success("Response deleted successfully.", {
        position: "bottom-right",

        duration: 3000,
      });
    } catch (error) {
      console.error("Error deleting response:", error);

      toast.error("Failed to delete the response.", {
        position: "bottom-right",

        duration: 3000,
      });
    }
  };

  return (
    <div className="h-screen z-[10] mx-2 mb-[100px] overflow-y-scroll">
      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-[75%] w-full">
          <LoaderWithText />
        </div>
      ) : (
        <>
          <div className="bg-slate-200 rounded-2xl min-h-[120px] p-4 px-5 y-3">
            <div className="flex flex-col justify-between bt-2">
              {/* <p className="font-semibold my-2 ml-2">
                Response Analysis and Insights
              </p> */}
              <div>
                <div className="flex justify-between items-center pb-4 pr-2">
                  <button
                    type="button"
                    className="inline-flex items-center text-indigo-600 hover:cursor-pointer"
                    onClick={() => {
                      router.push(`/interviews/${interviewId}`);
                    }}
                  >
                    <ArrowLeft className="mr-2" />
                    <p className="text-sm font-semibold">Back to Summary</p>
                  </button>
                  {tabSwitchCount && tabSwitchCount > 0 && (
                    <p className="text-sm font-semibold text-red-500 bg-red-200 rounded-sm px-2 py-1">
                      Tab Switching Detected
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col justify-between gap-3 w-full">
                <div className="flex flex-row justify-between">
                  <div className="flex flex-row gap-3">
                    <Avatar>
                      <AvatarFallback>{name ? name[0] : "A"}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      {name && <p className="text-sm font-semibold px-2">{name}</p>}
                      {email && <p className="text-sm px-2">{email}</p>}
                    </div>
                  </div>
                  <div className="flex flex-row mr-2 items-center gap-3">
                    <Button
                      variant="outline"
                      className="border-indigo-300 text-indigo-600 hover:bg-indigo-50 p-2 h-9"
                      title="Re-run analytics with fresh Groq analysis"
                      onClick={() => fetchCallData(true)}
                    >
                      <RefreshCwIcon size={14} className="mr-1" />
                      Re-analyse
                    </Button>
                    <Select
                      value={candidateStatus}
                      onValueChange={async (newValue: string) => {
                        setCandidateStatus(newValue);
                        await ResponseService.updateResponse(
                          { candidate_status: newValue },
                          call_id,
                        );
                        onCandidateStatusChange(call_id, newValue);
                      }}
                    >
                      <SelectTrigger className="w-[180px]  bg-slate-50 rounded-2xl">
                        <SelectValue placeholder="Not Selected" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CandidateStatus.NO_STATUS}>
                          <div className="flex items-center">
                            <div className="w-3 h-3 bg-gray-400 rounded-full mr-2" />
                            No Status
                          </div>
                        </SelectItem>
                        <SelectItem value={CandidateStatus.NOT_SELECTED}>
                          <div className="flex items-center">
                            <div className="w-3 h-3 bg-red-500 rounded-full mr-2" />
                            Not Selected
                          </div>
                        </SelectItem>
                        <SelectItem value={CandidateStatus.POTENTIAL}>
                          <div className="flex items-center">
                            <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2" />
                            Potential
                          </div>
                        </SelectItem>
                        <SelectItem value={CandidateStatus.SELECTED}>
                          <div className="flex items-center">
                            <div className="w-3 h-3 bg-green-500 rounded-full mr-2" />
                            Selected
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button disabled={isClicked} className="bg-red-500 hover:bg-red-600 p-2">
                          <TrashIcon size={16} className="" />
                        </Button>
                      </AlertDialogTrigger>

                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure?</AlertDialogTitle>

                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete this
                            response.
                          </AlertDialogDescription>
                        </AlertDialogHeader>

                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>

                          <AlertDialogAction
                            className="bg-indigo-600 hover:bg-indigo-800"
                            onClick={async () => {
                              await onDeleteResponseClick();
                            }}
                          >
                            Continue
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <div className="flex flex-col mt-3">
                  <p className="font-semibold">Interview Recording</p>
                  <div className="flex flex-row gap-3 mt-2">
                    {call?.recording_url && <ReactAudioPlayer src={call?.recording_url} controls />}
                    <a
                      className="my-auto"
                      href={call?.recording_url}
                      download=""
                      aria-label="Download"
                    >
                      <DownloadIcon size={20} />
                    </a>
                  </div>
                </div>
              </div>
            </div>
            {/* <div>{call.}</div> */}
          </div>
          <div className="bg-slate-200 rounded-2xl min-h-[120px] p-4 px-5 my-3">
            <p className="font-semibold my-2">General Summary</p>

            <div className="grid grid-cols-3 gap-4 my-2 mt-4 ">
              {analytics?.overallScore !== undefined && (
                <div className="flex flex-col gap-3 text-sm p-4 rounded-2xl bg-slate-50">
                  <div className="flex flex-row gap-2 align-middle">
                    <CircularProgress
                      classNames={{
                        svg: "w-28 h-28 drop-shadow-md",
                        indicator: "stroke-indigo-600",
                        track: "stroke-indigo-600/10",
                        value: "text-3xl font-semibold text-indigo-600",
                      }}
                      value={analytics?.overallScore}
                      strokeWidth={4}
                      showValueLabel={true}
                      formatOptions={{ signDisplay: "never" }}
                    />
                    <span className="font-medium my-auto text-xl">Overall Hiring Score</span>
                  </div>
                  <div className="">
                    <div className="font-medium ">
                      <span className="font-normal">Feedback: </span>
                      {analytics?.overallFeedback === undefined ? (
                        <Skeleton className="w-[200px] h-[20px]" />
                      ) : (
                        analytics?.overallFeedback
                      )}
                    </div>
                  </div>
                </div>
              )}
              {analytics?.communication && (
                <div className="flex flex-col gap-3 text-sm p-4 rounded-2xl bg-slate-50">
                  <div className="flex flex-row gap-2 align-middle">
                    <CircularProgress
                      classNames={{
                        svg: "w-28 h-28 drop-shadow-md",
                        indicator: "stroke-indigo-600",
                        track: "stroke-indigo-600/10",
                        value: "text-3xl font-semibold text-indigo-600",
                      }}
                      value={analytics?.communication.score}
                      maxValue={10}
                      minValue={0}
                      strokeWidth={4}
                      showValueLabel={true}
                      valueLabel={
                        <span className="flex items-baseline">
                          {analytics?.communication.score ?? 0}
                          <span className="text-xl ml-0.5">/10</span>
                        </span>
                      }
                      formatOptions={{ signDisplay: "never" }}
                    />
                    <span className="font-medium my-auto text-xl">Communication</span>
                  </div>
                  <div className="">
                    <div className="font-medium ">
                      <span className="font-normal">Feedback: </span>
                      {analytics?.communication.feedback === undefined ? (
                        <Skeleton className="w-[200px] h-[20px]" />
                      ) : (
                        analytics?.communication.feedback
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-3 text-sm p-4 rounded-2xl bg-slate-50">
                <div className="flex flex-row gap-2 align-middle">
                  <span className="my-auto">User Sentiment: </span>
                  <span className="font-medium my-auto flex items-center gap-2">
                    {analytics?.userSentiment ?? call?.call_analysis?.user_sentiment ?? "—"}
                    <span
                      className={`text-xl ${
                        (analytics?.userSentiment ?? call?.call_analysis?.user_sentiment) === "Neutral"
                          ? "text-yellow-500"
                          : (analytics?.userSentiment ?? call?.call_analysis?.user_sentiment) === "Negative"
                            ? "text-red-500"
                            : (analytics?.userSentiment ?? call?.call_analysis?.user_sentiment) === "Positive"
                              ? "text-green-500"
                              : "text-transparent"
                      }`}
                    >
                      ●
                    </span>
                  </span>
                </div>
                <div className="font-medium">
                  <span className="font-normal">Call Summary: </span>
                  {analytics?.callSummary ?? call?.call_analysis?.call_summary ?? "—"}
                </div>
                {(analytics?.callCompletionRating ?? call?.call_analysis?.call_completion_rating) && (
                  <div className="font-medium">
                    <span className="font-normal">Completion: </span>
                    {analytics?.callCompletionRating ?? call?.call_analysis?.call_completion_rating}
                  </div>
                )}
              </div>
            </div>
          </div>
          {analytics?.questionSummaries && analytics.questionSummaries.length > 0 && (
            <div className="bg-slate-200 rounded-2xl min-h-[120px] p-4 px-5 my-3">
              <p className="font-semibold my-2 mb-4">Question Summary</p>
              <ScrollArea className="rounded-md h-72 text-sm mt-3 py-3 leading-6 overflow-y-scroll whitespace-pre-line px-2">
                {analytics?.questionSummaries.map((qs, index) => (
                  <QuestionAnswerCard
                    key={qs.question}
                    questionNumber={index + 1}
                    question={qs.question}
                    answer={qs.summary}
                  />
                ))}
              </ScrollArea>
            </div>
          )}
          <div className="bg-slate-200 rounded-2xl min-h-[150px] max-h-[500px] p-4 px-5 mb-[150px]">
            <p className="font-semibold my-2 mb-4">Transcript</p>
            <ScrollArea className="rounded-2xl text-sm h-96  overflow-y-auto whitespace-pre-line px-2">
              <div
                className="text-sm p-4 rounded-2xl leading-5 bg-slate-50"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: required for markdown rendering
                dangerouslySetInnerHTML={{ __html: marked(transcript) }}
              />
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  );
}

export default CallInfo;
