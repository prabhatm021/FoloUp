"use client";

import CreateInterviewCard from "@/components/dashboard/interview/createInterviewCard";
import InterviewCard from "@/components/dashboard/interview/interviewCard";
import { useInterviews } from "@/contexts/interviews.context";
import React from "react";

function Interviews() {
  const { interviews, interviewsLoading } = useInterviews();

  function InterviewsLoader() {
    return (
      <div className="flex flex-row">
        <div className="h-60 w-56 ml-1 mr-3 mt-3 flex-none animate-pulse rounded-xl bg-gray-300" />
        <div className="h-60 w-56 ml-1 mr-3 mt-3 flex-none animate-pulse rounded-xl bg-gray-300" />
        <div className="h-60 w-56 ml-1 mr-3 mt-3 flex-none animate-pulse rounded-xl bg-gray-300" />
      </div>
    );
  }

  return (
    <main className="p-8 pt-0 ml-12 mr-auto rounded-md">
      <div className="flex flex-col items-left">
        <h2 className="mr-2 text-2xl font-semibold tracking-tight mt-8">My Interviews</h2>
        <h3 className="text-sm tracking-tight text-gray-600 font-medium">
          Start getting responses now!
        </h3>
        <div className="relative flex items-center mt-1 flex-wrap">
          <CreateInterviewCard />
          {interviewsLoading ? (
            <InterviewsLoader />
          ) : (
            interviews.map((item) => (
              <InterviewCard
                id={item.id}
                interviewerId={item.interviewer_id}
                key={item.id}
                name={item.name}
                url={item.url ?? ""}
                readableSlug={item.readable_slug}
              />
            ))
          )}
        </div>
      </div>
    </main>
  );
}

export default Interviews;
