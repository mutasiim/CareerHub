import React, { createContext, useContext, useState } from 'react';

export type ResumeFeedback =
  | {
      isResume: false;
      message: string;
    }
  | {
      isResume: true;
      score: number;
      atsScore: number;
      resumeTier: 'Gold' | 'Silver' | 'Bronze';
      scoreBreakdown: {
        overallImpression: number;
        contentAndRelevance: number;
        formattingAndVisualAppeal: number;
        languageAndProfessionalism: number;
        careerAlignmentImpact: number;
      };
      overallImpression: string;
      contentAndRelevance: string;
      formattingAndVisualAppeal: string;
      languageAndProfessionalism: string;
      recommendations: string[];
      additionalNotes: string;
      weakestBullet: string;
      rewrittenBullet: string;
    };

type ResumeContextType = {
  fileName: string | null;
  setFileName: (name: string | null) => void;
  feedback: ResumeFeedback | null;
  setFeedback: (feedback: ResumeFeedback | null) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
};

const ResumeContext = createContext<ResumeContextType | undefined>(undefined);

export function ResumeProvider({ children }: { children: React.ReactNode }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ResumeFeedback | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <ResumeContext.Provider
      value={{
        fileName,
        setFileName,
        feedback,
        setFeedback,
        loading,
        setLoading,
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