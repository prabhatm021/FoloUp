import Modal from "@/components/dashboard/Modal";
import InterviewerDetailsModal from "@/components/dashboard/interviewer/interviewerDetailsModal";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useInterviewers } from "@/contexts/interviewers.context";
import { useInterviews } from "@/contexts/interviews.context";
import { LOCAL_ORG_ID, LOCAL_ORG_NAME, LOCAL_USER_ID } from "@/lib/local-user";
import type { InterviewBase } from "@/types/interview";
import type { Interviewer } from "@/types/interviewer";
import axios from "axios";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import Image from "next/image";
import React, { useState, useEffect } from "react";
import FileUpload from "../fileUpload";

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  interviewData: InterviewBase;
  setInterviewData: (interviewData: InterviewBase) => void;
  isUploaded: boolean;
  setIsUploaded: (isUploaded: boolean) => void;
  fileName: string;
  setFileName: (fileName: string) => void;
}

function DetailsPopup({
  open,
  setOpen,
  setLoading,
  interviewData,
  setInterviewData,
  isUploaded,
  setIsUploaded,
  fileName,
  setFileName,
}: Props) {
  const { interviewers } = useInterviewers();
  const { fetchInterviews } = useInterviews();

  const [openInterviewerDetails, setOpenInterviewerDetails] = useState(false);
  const [interviewerDetails, setInterviewerDetails] = useState<Interviewer>();

  const [name, setName] = useState(interviewData.name);
  const [selectedInterviewer, setSelectedInterviewer] = useState(interviewData.interviewer_id);
  const [objective, setObjective] = useState(interviewData.objective);
  const [isAnonymous, setIsAnonymous] = useState<boolean>(interviewData.is_anonymous);
  const [duration, setDuration] = useState(interviewData.time_duration);
  const [uploadedDocumentContext, setUploadedDocumentContext] = useState("");

  // Auto-select first interviewer
  useEffect(() => {
    if (interviewers.length > 0 && selectedInterviewer === BigInt(0)) {
      setSelectedInterviewer(interviewers[0].id);
    }
  }, [interviewers, selectedInterviewer]);

  useEffect(() => {
    if (!open) {
      setName("");
      setSelectedInterviewer(BigInt(0));
      setObjective("");
      setIsAnonymous(false);
      setDuration("");
      setUploadedDocumentContext("");
    }
  }, [open]);

  const slideLeft = (id: string, value: number) => {
    const slider = document.getElementById(id);
    if (slider) slider.scrollLeft -= value;
  };

  const slideRight = (id: string, value: number) => {
    const slider = document.getElementById(id);
    if (slider) slider.scrollLeft += value;
  };

  const isValid = name && objective && duration && String(selectedInterviewer) !== "0";

  const onCreate = async () => {
    setLoading(true);
    try {
      // Auto-derive question pool size from duration (used by adaptive interviewer)
      const durationNum = Number(duration);
      const poolSize = Math.max(4, Math.ceil(durationNum / 4));

      const sanitizedInterviewData: any = {
        ...interviewData,
        user_id: LOCAL_USER_ID,
        organization_id: LOCAL_ORG_ID,
        name: name.trim(),
        objective: objective.trim(),
        interviewer_id: String(selectedInterviewer),
        response_count: "0",
        question_count: poolSize,
        time_duration: String(duration),
        is_anonymous: isAnonymous,
        description: "",
        questions: [],           // no pre-set questions — adaptive interviewer decides
        document_context: uploadedDocumentContext || null,
        logo_url: "",
      };

      await axios.post("/api/create-interview", {
        organizationName: LOCAL_ORG_NAME,
        interviewData: sanitizedInterviewData,
      });

      fetchInterviews();
      setOpen(false);
    } catch (err) {
      console.error("Create interview failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="text-center w-[38rem]">
        <h1 className="text-xl font-semibold">Create an Interview</h1>
        <div className="flex flex-col justify-center items-start mt-4 ml-10 mr-8">

          {/* Interview name */}
          <div className="flex flex-row justify-center items-center">
            <h3 className="text-sm font-medium">Interview Name:</h3>
            <input
              type="text"
              className="border-b-2 focus:outline-none border-gray-500 px-2 w-96 py-0.5 ml-3"
              placeholder="e.g. PM Practice — Prioritisation"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={(e) => setName(e.target.value.trim())}
            />
          </div>

          {/* Interviewer selector */}
          <h3 className="text-sm mt-3 font-medium">Select an Interviewer:</h3>
          <div className="relative flex items-center mt-1">
            <div
              id="slider-3"
              className="h-36 pt-1 overflow-x-scroll scroll whitespace-nowrap scroll-smooth scrollbar-hide w-[27.5rem]"
            >
              {interviewers.map((item) => (
                <div
                  className="p-0 inline-block cursor-pointer ml-1 mr-5 rounded-xl shrink-0 overflow-hidden"
                  key={item.id}
                >
                  <button
                    type="button"
                    className="absolute ml-9"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInterviewerDetails(item);
                      setOpenInterviewerDetails(true);
                    }}
                  >
                    <Info size={18} color="#4f46e5" strokeWidth={2.2} />
                  </button>
                  <button
                    type="button"
                    className={`w-[96px] overflow-hidden rounded-full ${
                      String(selectedInterviewer) === String(item.id)
                        ? "border-4 border-indigo-600"
                        : ""
                    }`}
                    onClick={() => setSelectedInterviewer(item.id)}
                  >
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt="Picture of the interviewer"
                        width={70}
                        height={70}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-[70px] h-[70px] bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                        {item.name?.[0] ?? "?"}
                      </div>
                    )}
                  </button>
                  <CardTitle className="mt-0 text-xs text-center">{item.name}</CardTitle>
                </div>
              ))}
            </div>
            {interviewers.length > 4 && (
              <div className="flex-row justify-center ml-3 mb-1 items-center space-y-6">
                <ChevronRight
                  className="opacity-50 cursor-pointer hover:opacity-100"
                  size={27}
                  onClick={() => slideRight("slider-3", 115)}
                />
                <ChevronLeft
                  className="opacity-50 cursor-pointer hover:opacity-100"
                  size={27}
                  onClick={() => slideLeft("slider-3", 115)}
                />
              </div>
            )}
          </div>

          {/* Objective */}
          <h3 className="text-sm font-medium">What do you want to practice?</h3>
          <Textarea
            value={objective}
            className="h-24 mt-2 border-2 border-gray-500 w-[33.2rem]"
            placeholder="e.g. PM interview focusing on prioritisation, metrics, and stakeholder management. I have 3 years of B2C product experience."
            onChange={(e) => setObjective(e.target.value)}
            onBlur={(e) => setObjective(e.target.value.trim())}
          />

          {/* Document upload */}
          <h3 className="text-sm font-medium mt-2">
            Upload your resume or a job description{" "}
            <span className="font-normal text-gray-500">(optional — helps tailor questions)</span>
          </h3>
          <FileUpload
            isUploaded={isUploaded}
            setIsUploaded={setIsUploaded}
            fileName={fileName}
            setFileName={setFileName}
            setUploadedDocumentContext={setUploadedDocumentContext}
          />

          {/* Anonymous toggle */}
          <div className="flex-col mt-4 w-full">
            <div className="flex items-center cursor-pointer">
              <span className="text-sm font-medium">
                Keep responses anonymous?
              </span>
              <Switch
                checked={isAnonymous}
                className={`ml-4 mt-1 ${isAnonymous ? "bg-indigo-600" : "bg-[#E6E7EB]"}`}
                onCheckedChange={(checked) => setIsAnonymous(checked)}
              />
            </div>
          </div>

          {/* Duration */}
          <div className="flex flex-row justify-center items-center mt-4">
            <h3 className="text-sm font-medium">Duration (mins):</h3>
            <input
              type="number"
              step="1"
              min="1"
              className="border-b-2 text-center focus:outline-none border-gray-500 w-16 px-2 py-0.5 ml-3"
              value={duration}
              placeholder="20"
              onChange={(e) => {
                const value = e.target.value;
                if (value === "" || (Number.isInteger(Number(value)) && Number(value) > 0)) {
                  setDuration(value);
                }
              }}
            />
            <span className="text-xs text-gray-400 ml-3">
              {duration
                ? `~${Math.max(4, Math.ceil(Number(duration) / 4))} topics to cover`
                : ""}
            </span>
          </div>

          {/* Create button */}
          <div className="flex flex-row w-full justify-center mt-6 mb-2">
            <Button
              disabled={!isValid}
              className="bg-indigo-600 hover:bg-indigo-800 w-48"
              onClick={onCreate}
            >
              Create Interview
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={openInterviewerDetails}
        closeOnOutsideClick={true}
        onClose={() => setOpenInterviewerDetails(false)}
      >
        <InterviewerDetailsModal interviewer={interviewerDetails} />
      </Modal>
    </>
  );
}

export default DetailsPopup;
