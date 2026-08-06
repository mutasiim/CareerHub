import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type SavedJob = {
  id?: string;
  title: string;
  company: string;
  location: string;
  type: string;
  fit?: string;
  applyUrl?: string;
  createdAt?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryText?: string;
  source?: string;
  description?: string;
  savedAt: string;
};

export type SavableJob = Omit<SavedJob, "savedAt">;

type SavedJobsContextType = {
  savedJobs: SavedJob[];
  hydrated: boolean;
  isJobSaved: (job: SavableJob) => boolean;
  toggleSavedJob: (job: SavableJob) => void;
};

const STORAGE_KEY = "@careerhub/saved-jobs-v1";
const SavedJobsContext = createContext<SavedJobsContextType | undefined>(
  undefined,
);

function normalizeKeyPart(value = "") {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getSavedJobKey(job: SavableJob) {
  if (job.applyUrl) {
    return `url:${job.applyUrl.trim().toLowerCase()}`;
  }

  if (job.id) {
    return `id:${job.id}`;
  }

  return `job:${normalizeKeyPart(job.company)}:${normalizeKeyPart(job.title)}:${normalizeKeyPart(
    job.location,
  )}`;
}

export function SavedJobsProvider({ children }: { children: React.ReactNode }) {
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((storedValue) => {
        if (!isMounted || !storedValue) return;

        const parsed = JSON.parse(storedValue);
        if (Array.isArray(parsed)) {
          setSavedJobs(parsed);
        }
      })
      .catch(() => {
        // A storage failure should not prevent the Jobs screen from loading.
      })
      .finally(() => {
        if (isMounted) setHydrated(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(savedJobs)).catch(() => {
      // Keep the in-memory list usable even when persistence is unavailable.
    });
  }, [hydrated, savedJobs]);

  const savedKeys = useMemo(
    () => new Set(savedJobs.map((job) => getSavedJobKey(job))),
    [savedJobs],
  );

  const isJobSaved = (job: SavableJob) => savedKeys.has(getSavedJobKey(job));

  const toggleSavedJob = (job: SavableJob) => {
    const key = getSavedJobKey(job);

    setSavedJobs((currentJobs) => {
      const alreadySaved = currentJobs.some(
        (savedJob) => getSavedJobKey(savedJob) === key,
      );

      if (alreadySaved) {
        return currentJobs.filter(
          (savedJob) => getSavedJobKey(savedJob) !== key,
        );
      }

      return [{ ...job, savedAt: new Date().toISOString() }, ...currentJobs];
    });
  };

  return (
    <SavedJobsContext.Provider
      value={{ savedJobs, hydrated, isJobSaved, toggleSavedJob }}
    >
      {children}
    </SavedJobsContext.Provider>
  );
}

export function useSavedJobs() {
  const context = useContext(SavedJobsContext);

  if (!context) {
    throw new Error("useSavedJobs must be used inside SavedJobsProvider");
  }

  return context;
}
