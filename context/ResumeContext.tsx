import React, { createContext, useContext, useState } from 'react';

type FeedbackItem = {
  issue: string;
  fix: string;
};

type FeedbackSection = {
  intro: string;
  highImpact: FeedbackItem[];
  mediumImpact: FeedbackItem[];
  recruiterInsight: string;
  outcome: string;
};

export type ResumeFeedback =
  | {
      isResume: false;
      message: string;
    }
  | {
      isResume: true;
      score: number;
      resumeTier: 'Gold' | 'Silver' | 'Bronze';
      scoreBreakdown: {
        overallImpression: number;
        contentAndRelevance: number;
        formattingAndVisualAppeal: number;
        languageAndProfessionalism: number;
        careerAlignmentImpact: number;
      };
      overallImpression: FeedbackSection;
      contentAndRelevance: FeedbackSection;
      formattingAndVisualAppeal: FeedbackSection;
      languageAndProfessionalism: FeedbackSection;
      recommendations: string[];
      additionalNotes: string;
      careerPaths: string[];
      jobKeywords: string[];
      recommendedSearchTerms: string[];
    };

type ResumeContextType = {
  fileName: string | null;
  setFileName: (name: string | null) => void;
  feedback: ResumeFeedback | null;
  setFeedback: (feedback: ResumeFeedback | null) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  resumeRefreshKey: number;
};

const ResumeContext = createContext<ResumeContextType | undefined>(undefined);

export function ResumeProvider({ children }: { children: React.ReactNode }) {
  const [fileName, setFileNameState] = useState<string | null>(null);
  const [feedback, setFeedbackState] = useState<ResumeFeedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [resumeRefreshKey, setResumeRefreshKey] = useState(0);

  const setFileName = (name: string | null) => {
    setFileNameState(name);
  };

  const setFeedback = (nextFeedback: ResumeFeedback | null) => {
    setFeedbackState(nextFeedback);
    setResumeRefreshKey((current) => current + 1);
  };

  return (
    <ResumeContext.Provider
      value={{
        fileName,
        setFileName,
        feedback,
        setFeedback,
        loading,
        setLoading,
        resumeRefreshKey,
      }}
    >
      {children}
    </ResumeContext.Provider>
  );
}

export function useResume() {
  const context = useContext(ResumeContext);
  if (!context) {
    throw new Error('useResume must be used inside ResumeProvider');
  }
  return context;
}