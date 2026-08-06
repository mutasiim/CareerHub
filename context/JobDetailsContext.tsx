import type { SavableJob } from "@/context/SavedJobsContext";
import React, { createContext, useContext, useMemo, useState } from "react";

type JobDetailsContextValue = {
  selectedJob: SavableJob | null;
  selectJob: (job: SavableJob) => void;
};

const JobDetailsContext = createContext<JobDetailsContextValue | undefined>(
  undefined,
);

export function JobDetailsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selectedJob, setSelectedJob] = useState<SavableJob | null>(null);

  const value = useMemo(
    () => ({
      selectedJob,
      selectJob: setSelectedJob,
    }),
    [selectedJob],
  );

  return (
    <JobDetailsContext.Provider value={value}>
      {children}
    </JobDetailsContext.Provider>
  );
}

export function useJobDetails() {
  const context = useContext(JobDetailsContext);

  if (!context) {
    throw new Error("useJobDetails must be used within JobDetailsProvider");
  }

  return context;
}
