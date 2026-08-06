import { useResume } from "@/context/ResumeContext";
import { useSavedJobs } from "@/context/SavedJobsContext";
import { Ionicons } from "@expo/vector-icons";
import { router, useNavigation } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const API_URL = "https://careerhub-backend-xbe9.onrender.com";
const BROWSE_PAGE_SIZE = 8;

type SortOption = "Relevance" | "Newest";
type SearchDistance = 25 | 50 | 100 | "Anywhere";

type RecommendedRole = {
  title: string;
  reason: string;
};

type JobOpening = {
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
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function normalizeRecommendedRole(role: any): RecommendedRole {
  return {
    title: asString(role?.title, "Recommended Role"),
    reason: asString(
      role?.reason,
      "This role appears relevant based on your resume.",
    ),
  };
}

function normalizeJob(job: any): JobOpening {
  return {
    id: asString(job?.id || job?._id || job?.jobId || job?.job_id) || undefined,
    title: asString(
      job?.title || job?.jobTitle || job?.job_title,
      "Untitled Role",
    ),
    company: asString(
      job?.company || job?.companyName || job?.company_name,
      "Unknown Company",
    ),
    location: asString(
      job?.location || job?.jobLocation || job?.job_location,
      "Location not specified",
    ),
    type: asString(
      job?.type || job?.employmentType || job?.employment_type,
      "Role",
    ),
    fit: asString(job?.fit || job?.matchLabel || job?.match_label) || undefined,
    applyUrl:
      asString(
        job?.applyUrl ||
          job?.apply_url ||
          job?.url ||
          job?.jobUrl ||
          job?.job_url,
      ) || undefined,
    createdAt:
      asString(job?.createdAt || job?.created_at || job?.created) || undefined,
    salaryMin:
      typeof job?.salaryMin === "number"
        ? job.salaryMin
        : typeof job?.salary_min === "number"
          ? job.salary_min
          : undefined,
    salaryMax:
      typeof job?.salaryMax === "number"
        ? job.salaryMax
        : typeof job?.salary_max === "number"
          ? job.salary_max
          : undefined,
    salaryText: asString(job?.salaryText || job?.salary_text) || undefined,
    source: asString(job?.source) || undefined,
  };
}

function formatPostedDate(createdAt?: string): string | null {
  if (!createdAt) return null;
  const createdTime = Date.parse(createdAt);
  if (!Number.isFinite(createdTime)) return null;

  const daysAgo = Math.max(
    0,
    Math.floor((Date.now() - createdTime) / 86_400_000),
  );
  if (daysAgo === 0) return "Posted today";
  if (daysAgo === 1) return "Posted yesterday";
  if (daysAgo < 30) return `Posted ${daysAgo}d ago`;
  return `Posted ${Math.floor(daysAgo / 30)}mo ago`;
}

function formatSalary(job: JobOpening): string | null {
  if (job.salaryText) return job.salaryText;
  const minimum = job.salaryMin;
  const maximum = job.salaryMax;
  if (!minimum && !maximum) return null;

  const compact = (value: number) =>
    value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${Math.round(value)}`;

  if (minimum && maximum && minimum !== maximum) {
    return `${compact(minimum)}–${compact(maximum)} est.`;
  }
  return `${compact(minimum || maximum || 0)} est.`;
}

function JobMeta({ job }: { job: JobOpening }) {
  const postedDate = formatPostedDate(job.createdAt);
  const salary = formatSalary(job);

  return (
    <View style={styles.jobMetaWrap}>
      <Text style={styles.jobMetaText}>{job.type}</Text>
      {postedDate ? <Text style={styles.jobMetaText}>{postedDate}</Text> : null}
      {salary ? <Text style={styles.salaryText}>{salary}</Text> : null}
      {job.source ? (
        <Text style={styles.sourceText}>via {job.source}</Text>
      ) : null}
    </View>
  );
}

function normalizeForDedupe(value: string): string {
  return value
    .toLowerCase()
    .replace(
      /\b(internship|intern|co-op|coop|remote|hybrid|full-time|full time|part-time|part time)\b/g,
      "",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getJobDedupeKey(job: JobOpening): string {
  const title = normalizeForDedupe(job.title);
  const company = normalizeForDedupe(job.company);

  return `${company}-${title}`;
}

function dedupeJobsByRole(jobs: JobOpening[]): JobOpening[] {
  const seen = new Set<string>();
  const deduped: JobOpening[] = [];

  for (const job of jobs) {
    const key = getJobDedupeKey(job);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(job);
  }

  return deduped;
}

function getJobText(job: JobOpening): string {
  return `${job.title} ${job.company} ${job.location} ${job.type}`.toLowerCase();
}

function isSeniorOrAdvancedJob(job: JobOpening): boolean {
  const text = getJobText(job);

  return /(^|\W)(vp|vice president|senior|sr|manager|director|principal|lead|chief|head of|postdoctoral|postdoc|professor|faculty|surgeon|physician|therapist|architect)(\W|$)/.test(
    text,
  );
}

function isLikelyInternshipJob(job: JobOpening): boolean {
  if (isSeniorOrAdvancedJob(job)) {
    return false;
  }

  const text = getJobText(job);

  return (
    /(^|\W)(intern|internship|co-op|coop|co op|student trainee|work study|work-study|summer intern|fall intern|spring intern)(\W|$)/.test(
      text,
    ) ||
    (/\b(student|undergraduate)\b/.test(text) &&
      /\b(research assistant|lab assistant|teaching assistant|student worker)\b/.test(
        text,
      ))
  );
}

function isLikelyRemoteJob(job: JobOpening): boolean {
  const text = getJobText(job);
  const location = job.location.toLowerCase();
  const type = job.type.toLowerCase();

  return (
    /(^|\W)(remote|hybrid|virtual|wfh|telework|telecommute)(\W|$)/.test(text) ||
    text.includes("work from home") ||
    text.includes("remote eligible") ||
    text.includes("flexible location") ||
    location === "us" ||
    location.includes("remote") ||
    location.includes("hybrid") ||
    location.includes("virtual") ||
    type.includes("remote") ||
    type.includes("hybrid")
  );
}

async function fetchJsonWithRetry(url: string, retries = 2): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });

      const rawText = await response.text();
      let data: any = null;

      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error("Server returned an invalid response.");
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
            data?.details ||
            `Request failed with status ${response.status}`,
        );
      }

      return data;
    } catch (error: any) {
      lastError =
        error instanceof Error ? error : new Error("Unknown network error");

      if (attempt < retries) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1200 * (attempt + 1)),
        );
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("Unable to reach the jobs service right now.");
}

export default function JobsScreen() {
  const navigation = useNavigation();
  const { feedback, resumeRefreshKey } = useResume();
  const {
    savedJobs,
    hydrated: savedJobsHydrated,
    isJobSaved,
    toggleSavedJob,
  } = useSavedJobs();
  const [activeTab, setActiveTab] = useState<
    "recommended" | "browse" | "saved"
  >("recommended");
  const [searchText, setSearchText] = useState("");
  const [locationText, setLocationText] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<
    "All" | "Internship" | "Remote"
  >("All");
  const [sortOption, setSortOption] = useState<SortOption>("Relevance");
  const [radiusMiles, setRadiusMiles] = useState<SearchDistance>(50);
  const [openFilterPicker, setOpenFilterPicker] = useState<
    "jobType" | "sort" | null
  >(null);
  const [browsePage, setBrowsePage] = useState(1);

  const [recommendedRoleData, setRecommendedRoleData] = useState<
    RecommendedRole[]
  >([]);
  const [recommendedJobData, setRecommendedJobData] = useState<JobOpening[]>(
    [],
  );
  const [browseJobData, setBrowseJobData] = useState<JobOpening[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [recommendedError, setRecommendedError] = useState<string | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const browseCacheRef = useRef<Map<string, JobOpening[]>>(new Map());

  const resumeSearchTerms = useMemo(() => {
    if (!feedback || feedback.isResume !== true) {
      return [] as string[];
    }

    return Array.isArray(feedback.recommendedSearchTerms)
      ? feedback.recommendedSearchTerms.filter(
          (term): term is string =>
            typeof term === "string" && term.trim().length > 0,
        )
      : [];
  }, [feedback]);

  const resumeCareerPaths = useMemo(() => {
    if (!feedback || feedback.isResume !== true) {
      return [] as string[];
    }

    return Array.isArray(feedback.careerPaths)
      ? feedback.careerPaths.filter(
          (term): term is string =>
            typeof term === "string" && term.trim().length > 0,
        )
      : [];
  }, [feedback]);

  const resumeJobKeywords = useMemo(() => {
    if (!feedback || feedback.isResume !== true) {
      return [] as string[];
    }

    return Array.isArray(feedback.jobKeywords)
      ? feedback.jobKeywords.filter(
          (term): term is string =>
            typeof term === "string" && term.trim().length > 0,
        )
      : [];
  }, [feedback]);

  const resumeDrivenQueries = useMemo(() => {
    if (!feedback || feedback.isResume !== true) {
      return [] as string[];
    }

    return Array.from(
      new Set(
        [
          ...resumeSearchTerms,
          ...resumeCareerPaths,
          ...resumeJobKeywords,
        ].filter(
          (term): term is string =>
            typeof term === "string" && term.trim().length > 0,
        ),
      ),
    ).slice(0, 3);
  }, [
    feedback,
    resumeSearchTerms,
    resumeCareerPaths,
    resumeJobKeywords,
    resumeRefreshKey,
  ]);

  const strongResumeQueries = useMemo(() => {
    const blockedExactTerms = new Set([
      "engineer",
      "developer",
      "intern",
      "internship",
      "remote",
      "hybrid",
      "technology",
      "tech",
      "student",
      "assistant",
      "specialist",
      "professional",
      "role",
      "job",
      "experience",
      "skills",
      "education",
      "coursework",
      "project",
      "projects",
    ]);

    return resumeDrivenQueries.filter((term) => {
      const lower = term.toLowerCase().trim();

      if (!lower || blockedExactTerms.has(lower)) {
        return false;
      }

      if (lower.split(/\s+/).length >= 2) {
        return true;
      }

      return lower.length >= 4;
    });
  }, [resumeDrivenQueries]);

  const recommendedJobFallbackData = recommendedJobData;

  const fetchBrowseJobs = async (page: number) => {
    const trimmedSearch = searchText.trim();
    const trimmedLocation = locationText.trim();
    const relevantResumeQueries =
      strongResumeQueries.length > 0
        ? strongResumeQueries
        : resumeDrivenQueries;
    const hasResumeDrivenQueries = relevantResumeQueries.length > 0;

    const cacheKey = JSON.stringify({
      page,
      search: trimmedSearch.toLowerCase(),
      location: trimmedLocation.toLowerCase(),
      radiusMiles: trimmedLocation ? radiusMiles : null,
      filter: selectedFilter,
      queries: relevantResumeQueries.map((term) => term.toLowerCase()),
    });

    const cachedJobs = browseCacheRef.current.get(cacheKey);
    if (cachedJobs) {
      return cachedJobs;
    }

    const backendSearchTerms = hasResumeDrivenQueries
      ? relevantResumeQueries.slice(0, 6)
      : [];

    if (!trimmedSearch && backendSearchTerms.length === 0) {
      return [] as JobOpening[];
    }

    const params = new URLSearchParams();

    if (trimmedSearch) {
      params.append("query", trimmedSearch);
    }

    if (backendSearchTerms.length > 0) {
      params.append("searchTerms", backendSearchTerms.join(","));
    }

    if (trimmedLocation && radiusMiles !== "Anywhere") {
      params.append("location", trimmedLocation);
      params.append("radiusMiles", String(radiusMiles));
    }

    params.append("filter", selectedFilter);
    params.append("page", String(page));

    const data = await fetchJsonWithRetry(
      `${API_URL}/jobs/search?${params.toString()}`,
    );

    const jobs = Array.isArray(data?.jobs)
      ? data.jobs.map(normalizeJob)
      : Array.isArray(data)
        ? data.map(normalizeJob)
        : [];

    const cleanedJobs = dedupeJobsByRole(jobs).filter((job) => {
      if (selectedFilter === "Internship") {
        return isLikelyInternshipJob(job);
      }

      if (selectedFilter === "Remote") {
        return isLikelyRemoteJob(job);
      }

      return true;
    });

    browseCacheRef.current.set(cacheKey, cleanedJobs);
    return cleanedJobs;
  };

  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  useEffect(() => {
    browseCacheRef.current.clear();
    setActiveTab("recommended");
    setRecommendedRoleData([]);
    setRecommendedJobData([]);
    setBrowseJobData([]);
    setRecommendedError(null);
    setBrowseError(null);
    setSearchText("");
    setLocationText("");
    setSelectedFilter("All");
    setSortOption("Relevance");
    setRadiusMiles(50);
    setBrowsePage(1);
  }, [resumeRefreshKey]);

  useEffect(() => {
    let isMounted = true;

    const loadRecommendedJobs = async () => {
      try {
        setRecommendedLoading(true);
        setRecommendedError(null);

        const params = new URLSearchParams();
        if (resumeSearchTerms.length > 0) {
          params.append("searchTerms", resumeSearchTerms.join(","));
        }
        if (resumeCareerPaths.length > 0) {
          params.append("careerPaths", resumeCareerPaths.join(","));
        }
        if (resumeJobKeywords.length > 0) {
          params.append("jobKeywords", resumeJobKeywords.join(","));
        }

        const recommendedUrl = params.toString()
          ? `${API_URL}/jobs/recommended?${params.toString()}`
          : `${API_URL}/jobs/recommended`;

        const data = await fetchJsonWithRetry(recommendedUrl);

        const roles = Array.isArray(data?.roles)
          ? data.roles.map(normalizeRecommendedRole)
          : Array.isArray(data?.recommendedRoles)
            ? data.recommendedRoles.map(normalizeRecommendedRole)
            : Array.isArray(data?.recommended_roles)
              ? data.recommended_roles.map(normalizeRecommendedRole)
              : [];

        const jobs = Array.isArray(data?.jobs)
          ? data.jobs.map(normalizeJob)
          : Array.isArray(data?.recommendedJobs)
            ? data.recommendedJobs.map(normalizeJob)
            : Array.isArray(data?.recommended_jobs)
              ? data.recommended_jobs.map(normalizeJob)
              : [];

        if (!isMounted) return;

        setRecommendedRoleData(roles);
        setRecommendedJobData(jobs);

        if (
          jobs.length === 0 &&
          roles.length === 0 &&
          resumeCareerPaths.length === 0
        ) {
          setRecommendedError("No recommended jobs were returned right now.");
        }
      } catch (error: any) {
        if (!isMounted) return;
        setRecommendedError(
          error?.message ||
            "Unable to load recommended jobs right now. Please try again in a moment.",
        );
      } finally {
        if (isMounted) {
          setRecommendedLoading(false);
        }
      }
    };

    loadRecommendedJobs();

    return () => {
      isMounted = false;
    };
  }, [
    resumeSearchTerms,
    resumeCareerPaths,
    resumeJobKeywords,
    resumeRefreshKey,
  ]);

  useEffect(() => {
    let isMounted = true;

    const timeout = setTimeout(async () => {
      try {
        setBrowseLoading(true);
        setBrowseError(null);

        const jobs = await fetchBrowseJobs(1);

        if (!isMounted) return;

        setBrowseJobData(jobs);

        if (jobs.length === 0) {
          setBrowseError("No jobs were returned right now.");
        }
      } catch (error: any) {
        if (!isMounted) return;
        setBrowseError(
          error?.message ||
            "Unable to load jobs right now. Please try again in a moment.",
        );
        setBrowseJobData([]);
      } finally {
        if (isMounted) {
          setBrowseLoading(false);
        }
      }
    }, 500);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [
    searchText,
    locationText,
    radiusMiles,
    selectedFilter,
    resumeDrivenQueries,
    strongResumeQueries,
    resumeRefreshKey,
  ]);

  useEffect(() => {
    setBrowsePage(1);
  }, [searchText, locationText, selectedFilter]);

  const isRelevantToResume = (job: JobOpening) => {
    if (strongResumeQueries.length === 0) {
      return true;
    }

    const haystack =
      `${job.title} ${job.company} ${job.location} ${job.type}`.toLowerCase();

    return strongResumeQueries.some((term) => {
      const lower = term.toLowerCase();

      if (haystack.includes(lower)) {
        return true;
      }

      const words = lower.split(/\s+/).filter((word) => word.length >= 3);
      const matchedWords = words.filter((word) => haystack.includes(word));

      return (
        words.length > 0 && matchedWords.length >= Math.min(2, words.length)
      );
    });
  };

  const filteredBrowseJobs = useMemo(() => {
    return browseJobData.filter((job) => {
      const normalizedSearch = searchText.trim().toLowerCase();
      const normalizedLocation = locationText.trim().toLowerCase();

      const haystack =
        `${job.title} ${job.company} ${job.type} ${job.location}`.toLowerCase();
      const jobLocation = job.location.toLowerCase();

      const matchesSearch =
        !normalizedSearch || haystack.includes(normalizedSearch);
      const matchesLocation = !normalizedLocation || Boolean(jobLocation);

      const isInternship = isLikelyInternshipJob(job);
      const isRemote = isLikelyRemoteJob(job);

      let matchesFilter = true;
      const matchesResumeRelevance =
        selectedFilter === "Remote" ? true : isRelevantToResume(job);

      if (selectedFilter === "Internship") {
        matchesFilter = isInternship;
      } else if (selectedFilter === "Remote") {
        matchesFilter = isRemote;
      }

      return (
        matchesSearch &&
        matchesLocation &&
        matchesFilter &&
        matchesResumeRelevance
      );
    });
  }, [
    browseJobData,
    searchText,
    locationText,
    selectedFilter,
    strongResumeQueries,
    resumeDrivenQueries,
  ]);

  const sortedBrowseJobs = useMemo(() => {
    if (sortOption === "Newest") {
      return [...filteredBrowseJobs].sort((a, b) => {
        const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
        const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
        return bTime - aTime;
      });
    }

    return filteredBrowseJobs;
  }, [filteredBrowseJobs, sortOption]);

  const maxBrowsePages = Math.max(
    1,
    Math.ceil(sortedBrowseJobs.length / BROWSE_PAGE_SIZE),
  );

  const paginatedBrowseJobs = useMemo(() => {
    const startIndex = (browsePage - 1) * BROWSE_PAGE_SIZE;
    return sortedBrowseJobs.slice(startIndex, startIndex + BROWSE_PAGE_SIZE);
  }, [sortedBrowseJobs, browsePage]);

  const hasActiveBrowseFilters =
    searchText.trim().length > 0 ||
    locationText.trim().length > 0 ||
    selectedFilter !== "All" ||
    sortOption !== "Relevance";

  const handleViewJob = async (job: JobOpening) => {
    if (!job.applyUrl) {
      Alert.alert(
        "Job link unavailable",
        "This opening does not have an application link yet.",
      );
      return;
    }

    try {
      const supported = await Linking.canOpenURL(job.applyUrl);
      if (!supported) {
        throw new Error("Unsupported URL");
      }
      await Linking.openURL(job.applyUrl);
    } catch {
      Alert.alert(
        "Unable to open job",
        "There was a problem opening this job link.",
      );
    }
  };

  const resetBrowseFilters = () => {
    setSearchText("");
    setLocationText("");
    setRadiusMiles(50);
    setSelectedFilter("All");
    setSortOption("Relevance");
    setBrowseError(null);
    setBrowsePage(1);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Jobs</Text>

        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>CareerHub Jobs</Text>
        <Text style={styles.heroTitle}>Find roles worth applying to</Text>
        <Text style={styles.heroText}>
          Explore jobs recommended from your resume or browse openings with
          filters.
        </Text>
      </View>

      <View style={styles.segmentedControl}>
        <Pressable
          onPress={() => setActiveTab("recommended")}
          style={[
            styles.segmentButton,
            activeTab === "recommended" && styles.segmentButtonActive,
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === "recommended" && styles.segmentTextActive,
            ]}
          >
            Recommended
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("browse")}
          style={[
            styles.segmentButton,
            activeTab === "browse" && styles.segmentButtonActive,
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === "browse" && styles.segmentTextActive,
            ]}
          >
            Browse
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("saved")}
          style={[
            styles.segmentButton,
            activeTab === "saved" && styles.segmentButtonActive,
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              activeTab === "saved" && styles.segmentTextActive,
            ]}
          >
            Saved
          </Text>
        </Pressable>
      </View>

      {activeTab === "recommended" ? (
        <>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Recommended Roles</Text>

            {recommendedLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#60a5fa" />
                <Text style={styles.loadingText}>
                  Loading recommended roles...
                </Text>
              </View>
            ) : null}

            {recommendedError &&
            recommendedRoleData.length === 0 &&
            resumeCareerPaths.length === 0 ? (
              <Text style={styles.infoText}>{recommendedError}</Text>
            ) : null}

            {!recommendedLoading &&
            !recommendedError &&
            recommendedRoleData.length === 0 ? (
              <Text style={styles.infoText}>
                {resumeSearchTerms.length > 0
                  ? "No resume-based recommended roles are available right now."
                  : "Upload a resume to get personalized recommended roles."}
              </Text>
            ) : null}

            {(resumeCareerPaths.length > 0
              ? resumeCareerPaths.map((path) => ({
                  title: path,
                  reason:
                    "This role is being recommended based on your uploaded resume and detected career direction.",
                }))
              : recommendedRoleData
            ).map((role, index) => (
              <View key={`${role.title}-${index}`} style={styles.roleCard}>
                <View style={styles.roleIconWrap}>
                  <Ionicons
                    name="briefcase-outline"
                    size={18}
                    color="#93c5fd"
                  />
                </View>

                <View style={styles.roleTextWrap}>
                  <Text style={styles.roleTitle}>{role.title}</Text>
                  <Text style={styles.roleReason}>{role.reason}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Suggested Job Openings</Text>

            {!recommendedLoading && recommendedJobFallbackData.length === 0 ? (
              <Text style={styles.infoText}>
                {resumeSearchTerms.length > 0
                  ? "No resume-based recommended job openings are available right now."
                  : "Upload a resume to get personalized recommended jobs."}
              </Text>
            ) : null}

            {recommendedJobFallbackData.map((job, index) => (
              <View
                key={
                  job.applyUrl ||
                  `${job.id || "job"}-${job.title}-${job.company}-${index}`
                }
                style={styles.jobCard}
              >
                <View style={styles.jobTopRow}>
                  <View style={styles.jobMainText}>
                    <Text style={styles.jobTitle}>{job.title}</Text>
                    <Text style={styles.jobCompany}>
                      {job.company} • {job.location}
                    </Text>
                  </View>

                  <View style={styles.jobTopActions}>
                    <View style={styles.matchBadge}>
                      <Text style={styles.matchBadgeText}>
                        {job.fit || "Recommended"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.saveButton,
                        isJobSaved(job) && styles.saveButtonActive,
                      ]}
                      onPress={() => toggleSavedJob(job)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        isJobSaved(job) ? "Remove saved job" : "Save job"
                      }
                      hitSlop={8}
                    >
                      <Ionicons
                        name={isJobSaved(job) ? "bookmark" : "bookmark-outline"}
                        size={18}
                        color={isJobSaved(job) ? "#ffffff" : "#93c5fd"}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <JobMeta job={job} />

                <TouchableOpacity
                  style={styles.applyButton}
                  activeOpacity={0.9}
                  onPress={() => handleViewJob(job)}
                >
                  <Text style={styles.applyButtonText}>View Job</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </>
      ) : activeTab === "browse" ? (
        <>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Browse Jobs</Text>

            <View style={styles.searchInputWrap}>
              <Ionicons name="search-outline" size={18} color="#64748b" />
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search by title or company"
                placeholderTextColor="#64748b"
                style={styles.searchInput}
              />
              {searchText ? (
                <Pressable onPress={() => setSearchText("")} hitSlop={10}>
                  <Ionicons name="close-circle" size={20} color="#64748b" />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.locationBlock}>
              <View style={styles.locationInputWrap}>
                <Ionicons name="location-outline" size={18} color="#60a5fa" />
                <TextInput
                  value={locationText}
                  onChangeText={setLocationText}
                  placeholder="City, state, or ZIP"
                  placeholderTextColor="#64748b"
                  style={styles.locationInput}
                />
                {locationText ? (
                  <Pressable onPress={() => setLocationText("")} hitSlop={10}>
                    <Ionicons name="close-circle" size={20} color="#64748b" />
                  </Pressable>
                ) : null}
              </View>

              <Text style={styles.locationHint}>
                {locationText.trim()
                  ? radiusMiles === "Anywhere"
                    ? `Searching nationwide — location preference: ${locationText.trim()}`
                    : `Showing jobs within ${radiusMiles} miles of ${locationText.trim()}`
                  : "Enter a location, then choose how far away to search."}
              </Text>

              <View style={styles.radiusRow}>
                {([25, 50, 100, "Anywhere"] as const).map((radius) => {
                  const disabled = !locationText.trim();
                  return (
                    <Pressable
                      key={radius}
                      disabled={disabled}
                      onPress={() => {
                        setRadiusMiles(radius);
                        setBrowsePage(1);
                      }}
                      style={[
                        styles.radiusChip,
                        disabled && styles.choiceDisabled,
                        !disabled &&
                          radiusMiles === radius &&
                          styles.filterChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.compactChoiceText,
                          disabled && styles.choiceDisabledText,
                          !disabled &&
                            radiusMiles === radius &&
                            styles.filterChipTextActive,
                        ]}
                      >
                        {radius === "Anywhere" ? "Anywhere" : `${radius} mi`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.refinePanel}>
              <View style={styles.refineHeader}>
                <View style={styles.refineIconWrap}>
                  <Ionicons name="options-outline" size={16} color="#60a5fa" />
                </View>
                <View>
                  <Text style={styles.refineTitle}>Refine results</Text>
                  <Text style={styles.refineSubtitle}>
                    Choose the roles and order you prefer
                  </Text>
                </View>
              </View>

              <View style={styles.controlsRow}>
                <Pressable
                  style={styles.selectorButton}
                  onPress={() => setOpenFilterPicker("jobType")}
                >
                  <View>
                    <Text style={styles.selectorLabel}>Job type</Text>
                    <Text style={styles.selectorValue} numberOfLines={1}>
                      {selectedFilter === "All" ? "All jobs" : selectedFilter}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={17} color="#60a5fa" />
                </Pressable>

                <Pressable
                  style={styles.selectorButton}
                  onPress={() => setOpenFilterPicker("sort")}
                >
                  <View>
                    <Text style={styles.selectorLabel}>Sort by</Text>
                    <Text style={styles.selectorValue} numberOfLines={1}>
                      {sortOption === "Relevance"
                        ? "Most relevant"
                        : "Newest first"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={17} color="#60a5fa" />
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.openingsHeader}>
              <View>
                <Text style={styles.sectionTitle}>Openings</Text>
                {!browseLoading && sortedBrowseJobs.length > 0 ? (
                  <Text style={styles.resultCount}>
                    {sortedBrowseJobs.length}{" "}
                    {sortedBrowseJobs.length === 1 ? "job" : "jobs"} found
                  </Text>
                ) : null}
              </View>
              {hasActiveBrowseFilters ? (
                <Pressable
                  style={styles.resetButton}
                  onPress={resetBrowseFilters}
                >
                  <Ionicons name="refresh-outline" size={15} color="#93c5fd" />
                  <Text style={styles.resetButtonText}>Reset</Text>
                </Pressable>
              ) : null}
            </View>

            {browseLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#60a5fa" />
                <Text style={styles.loadingText}>Loading jobs...</Text>
              </View>
            ) : null}

            {browseError && browseJobData.length === 0 ? (
              <Text style={styles.infoText}>
                No jobs were returned right now. Try a different title,
                location, or filter.
              </Text>
            ) : null}

            {!browseLoading && !browseError && browseJobData.length === 0 ? (
              <Text style={styles.infoText}>
                No browse jobs are available right now. Upload a resume, wait
                for analysis to finish, or search for a specific title.
              </Text>
            ) : null}

            {filteredBrowseJobs.length > 0 ? (
              <>
                {paginatedBrowseJobs.map((job, index) => (
                  <View
                    key={
                      job.applyUrl ||
                      `${job.id || "job"}-${job.title}-${job.company}-${index}`
                    }
                    style={styles.jobCard}
                  >
                    <View style={styles.jobTopRow}>
                      <View style={styles.jobMainText}>
                        <Text style={styles.jobTitle}>{job.title}</Text>
                        <Text style={styles.jobCompany}>
                          {job.company} • {job.location}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.saveButton,
                          isJobSaved(job) && styles.saveButtonActive,
                        ]}
                        onPress={() => toggleSavedJob(job)}
                        accessibilityRole="button"
                        accessibilityLabel={
                          isJobSaved(job) ? "Remove saved job" : "Save job"
                        }
                        hitSlop={8}
                      >
                        <Ionicons
                          name={
                            isJobSaved(job) ? "bookmark" : "bookmark-outline"
                          }
                          size={18}
                          color={isJobSaved(job) ? "#ffffff" : "#93c5fd"}
                        />
                      </TouchableOpacity>
                    </View>
                    <JobMeta job={job} />

                    <TouchableOpacity
                      style={styles.applyButton}
                      activeOpacity={0.9}
                      onPress={() => handleViewJob(job)}
                    >
                      <Text style={styles.applyButtonText}>View Job</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <View style={styles.paginationWrap}>
                  <TouchableOpacity
                    style={[
                      styles.paginationButton,
                      browsePage === 1 && styles.paginationButtonDisabled,
                    ]}
                    activeOpacity={0.85}
                    disabled={browsePage === 1 || browseLoading}
                    onPress={() =>
                      setBrowsePage((current) => Math.max(1, current - 1))
                    }
                  >
                    <Text
                      style={[
                        styles.paginationButtonText,
                        browsePage === 1 && styles.paginationButtonTextDisabled,
                      ]}
                    >
                      Previous
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.paginationText}>
                    Page {browsePage} of {maxBrowsePages}
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.paginationButton,
                      (browsePage === maxBrowsePages ||
                        paginatedBrowseJobs.length === 0) &&
                        styles.paginationButtonDisabled,
                    ]}
                    activeOpacity={0.85}
                    disabled={
                      browsePage === maxBrowsePages ||
                      browseLoading ||
                      paginatedBrowseJobs.length === 0
                    }
                    onPress={() =>
                      setBrowsePage((current) =>
                        Math.min(maxBrowsePages, current + 1),
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.paginationButtonText,
                        (browsePage === maxBrowsePages ||
                          paginatedBrowseJobs.length === 0) &&
                          styles.paginationButtonTextDisabled,
                      ]}
                    >
                      Next
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : browseJobData.length > 0 ? (
              <Text style={styles.emptyText}>
                No jobs match your current filters.
              </Text>
            ) : browseError ? (
              <Text style={styles.emptyText}>
                Browse jobs are unavailable right now.
              </Text>
            ) : (
              <Text style={styles.emptyText}>
                No jobs match your current filters.
              </Text>
            )}
          </View>
        </>
      ) : (
        <View style={styles.sectionCard}>
          <View style={styles.savedSectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Saved Jobs</Text>
              <Text style={styles.savedCountText}>
                {savedJobs.length} {savedJobs.length === 1 ? "job" : "jobs"}{" "}
                saved on this device
              </Text>
            </View>
            <Ionicons name="bookmark" size={22} color="#60a5fa" />
          </View>

          {!savedJobsHydrated ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#60a5fa" />
              <Text style={styles.loadingText}>Loading saved jobs...</Text>
            </View>
          ) : savedJobs.length === 0 ? (
            <View style={styles.savedEmptyState}>
              <View style={styles.savedEmptyIcon}>
                <Ionicons name="bookmark-outline" size={26} color="#60a5fa" />
              </View>
              <Text style={styles.savedEmptyTitle}>No saved jobs yet</Text>
              <Text style={styles.savedEmptyText}>
                Tap the bookmark on any recommended or browse job to keep it
                here.
              </Text>
            </View>
          ) : (
            savedJobs.map((job) => (
              <View
                key={job.applyUrl || job.id || `${job.company}-${job.title}`}
                style={styles.jobCard}
              >
                <View style={styles.jobTopRow}>
                  <View style={styles.jobMainText}>
                    <Text style={styles.jobTitle}>{job.title}</Text>
                    <Text style={styles.jobCompany}>
                      {job.company} • {job.location}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.saveButton, styles.saveButtonActive]}
                    onPress={() => toggleSavedJob(job)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove saved job"
                    hitSlop={8}
                  >
                    <Ionicons name="bookmark" size={18} color="#ffffff" />
                  </TouchableOpacity>
                </View>
                <JobMeta job={job} />
                <TouchableOpacity
                  style={styles.applyButton}
                  activeOpacity={0.9}
                  onPress={() => handleViewJob(job)}
                >
                  <Text style={styles.applyButtonText}>View Job</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      )}

      <Modal
        visible={openFilterPicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenFilterPicker(null)}
      >
        <Pressable
          style={styles.pickerBackdrop}
          onPress={() => setOpenFilterPicker(null)}
        >
          <Pressable
            style={styles.pickerSheet}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>
              {openFilterPicker === "jobType"
                ? "Choose job type"
                : "Sort openings"}
            </Text>

            {(openFilterPicker === "jobType"
              ? (["All", "Internship", "Remote"] as const)
              : (["Relevance", "Newest"] as const)
            ).map((option) => {
              const selected =
                openFilterPicker === "jobType"
                  ? selectedFilter === option
                  : sortOption === option;
              const label =
                option === "All"
                  ? "All jobs"
                  : option === "Relevance"
                    ? "Most relevant"
                    : option === "Newest"
                      ? "Newest first"
                      : option;

              return (
                <Pressable
                  key={option}
                  style={[
                    styles.pickerOption,
                    selected && styles.pickerOptionActive,
                  ]}
                  onPress={() => {
                    if (openFilterPicker === "jobType") {
                      setSelectedFilter(
                        option as "All" | "Internship" | "Remote",
                      );
                      setBrowseError(null);
                    } else {
                      setSortOption(option as SortOption);
                    }
                    setBrowsePage(1);
                    setOpenFilterPicker(null);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      selected && styles.pickerOptionTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                  {selected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={21}
                      color="#60a5fa"
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 56 : 40,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  heroCard: {
    backgroundColor: "#1e293b",
    padding: 22,
    borderRadius: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  heroEyebrow: {
    color: "#60a5fa",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 10,
  },
  heroText: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 24,
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#111827",
    padding: 6,
    borderRadius: 16,
    marginBottom: 18,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  segmentButtonActive: {
    backgroundColor: "#2563eb",
  },
  segmentText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600",
  },
  segmentTextActive: {
    color: "#ffffff",
  },
  sectionCard: {
    backgroundColor: "#1e293b",
    padding: 18,
    borderRadius: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14,
  },
  roleCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  roleIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(59,130,246,0.16)",
    marginRight: 12,
    marginTop: 2,
  },
  roleTextWrap: {
    flex: 1,
  },
  roleTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  roleReason: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 22,
  },
  jobCard: {
    backgroundColor: "#111827",
    padding: 16,
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  jobTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  jobMainText: {
    flex: 1,
    marginRight: 12,
  },
  jobTopActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  saveButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(59,130,246,0.12)",
    borderWidth: 1,
    borderColor: "rgba(147,197,253,0.18)",
  },
  saveButtonActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  jobTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  jobCompany: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 20,
  },
  jobType: {
    color: "#cbd5e1",
    fontSize: 13,
    marginBottom: 12,
  },
  jobMetaWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
    marginBottom: 12,
  },
  jobMetaText: {
    color: "#cbd5e1",
    fontSize: 12,
    backgroundColor: "rgba(148,163,184,0.09)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  salaryText: {
    color: "#86efac",
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: "rgba(34,197,94,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  sourceText: {
    color: "#93c5fd",
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 3,
    paddingVertical: 5,
  },
  matchBadge: {
    backgroundColor: "rgba(59,130,246,0.16)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  matchBadgeText: {
    color: "#bfdbfe",
    fontSize: 12,
    fontWeight: "700",
  },
  applyButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  applyButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    backgroundColor: "#111827",
    color: "#ffffff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  searchInput: {
    flex: 1,
    color: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  openingsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  resultCount: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: -8,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(59,130,246,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.18)",
  },
  resetButtonText: {
    color: "#bfdbfe",
    fontSize: 12,
    fontWeight: "700",
  },
  locationBlock: {
    backgroundColor: "rgba(15,23,42,0.55)",
    borderRadius: 15,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.14)",
  },
  locationInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  locationInput: {
    flex: 1,
    color: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 13,
  },
  locationHint: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 9,
    marginBottom: 10,
  },
  radiusRow: {
    flexDirection: "row",
    gap: 7,
  },
  radiusChip: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  controlsRow: {
    flexDirection: "row",
    gap: 10,
  },
  selectorButton: {
    flex: 1,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#111827",
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.12)",
  },
  selectorLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.45,
    marginBottom: 3,
  },
  selectorValue: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "700",
    maxWidth: 105,
  },
  refinePanel: {
    backgroundColor: "rgba(15,23,42,0.42)",
    borderRadius: 15,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  refineHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 13,
  },
  refineIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(59,130,246,0.13)",
    marginRight: 9,
  },
  refineTitle: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "700",
  },
  refineSubtitle: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 2,
  },
  pickerBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(2,6,23,0.72)",
  },
  pickerSheet: {
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  pickerHandle: {
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#475569",
    alignSelf: "center",
    marginBottom: 18,
  },
  pickerTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 14,
  },
  pickerOption: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#111827",
    borderRadius: 14,
    paddingHorizontal: 15,
    marginBottom: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  pickerOptionActive: {
    backgroundColor: "rgba(37,99,235,0.16)",
    borderColor: "rgba(96,165,250,0.5)",
  },
  pickerOptionText: {
    color: "#cbd5e1",
    fontSize: 15,
    fontWeight: "600",
  },
  pickerOptionTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  controlColumnWide: {
    flex: 1.35,
  },
  controlColumn: {
    flex: 1,
  },
  compactChoices: {
    flexDirection: "row",
    gap: 5,
  },
  compactChoice: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
    borderRadius: 11,
    paddingHorizontal: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  compactChoiceText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "700",
  },
  choiceDisabled: {
    opacity: 0.38,
  },
  choiceDisabledText: {
    color: "#64748b",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  filterGroup: {
    marginTop: 4,
  },
  filterLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  filterChip: {
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    marginRight: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  filterChipActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  filterChipText: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#ffffff",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  loadingText: {
    color: "#cbd5e1",
    fontSize: 14,
  },
  infoText: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: 15,
    lineHeight: 22,
  },
  paginationWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    gap: 12,
  },
  paginationButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  paginationButtonDisabled: {
    backgroundColor: "#334155",
  },
  paginationButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  paginationButtonTextDisabled: {
    color: "#94a3b8",
  },
  paginationText: {
    flex: 1,
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  savedSectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  savedCountText: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: -8,
  },
  savedEmptyState: {
    alignItems: "center",
    paddingVertical: 30,
    paddingHorizontal: 18,
  },
  savedEmptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(59,130,246,0.14)",
    marginBottom: 14,
  },
  savedEmptyTitle: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
  },
  savedEmptyText: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
});
