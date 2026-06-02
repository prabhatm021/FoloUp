import DetailsPopup from "@/components/dashboard/interview/create-popup/details";
import LoaderWithLogo from "@/components/loaders/loader-with-logo/loaderWithLogo";
import type { InterviewBase } from "@/types/interview";
import React, { useEffect, useState } from "react";

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CreateEmptyInterviewData = (): InterviewBase => ({
  user_id: "",
  organization_id: "",
  name: "",
  interviewer_id: BigInt(0),
  objective: "",
  question_count: 0,
  time_duration: "",
  is_anonymous: false,
  questions: [],
  description: "",
  response_count: BigInt(0),
  document_context: "",
});

function CreateInterviewModal({ open, setOpen }: Props) {
  const [loading, setLoading] = useState(false);
  const [interviewData, setInterviewData] = useState<InterviewBase>(CreateEmptyInterviewData());

  // File upload state
  const [isUploaded, setIsUploaded] = useState(false);
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    if (!open) {
      setLoading(false);
      setInterviewData(CreateEmptyInterviewData());
      setIsUploaded(false);
      setFileName("");
    }
  }, [open]);

  return (
    <>
      {loading ? (
        <div className="w-[38rem] h-[35.3rem] flex items-center justify-center">
          <LoaderWithLogo />
        </div>
      ) : (
        <DetailsPopup
          open={open}
          setOpen={setOpen}
          setLoading={setLoading}
          interviewData={interviewData}
          setInterviewData={setInterviewData}
          isUploaded={isUploaded}
          setIsUploaded={setIsUploaded}
          fileName={fileName}
          setFileName={setFileName}
        />
      )}
    </>
  );
}

export default CreateInterviewModal;
