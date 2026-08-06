import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import multer from "multer";
import OpenAI from "openai";

import { PDFParse } from "pdf-parse";
import { CanvasFactory } from "pdf-parse/worker";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ADZUNA_API_URL = "https://api.adzuna.com/v1/api";
const ADZUNA_COUNTRY = process.env.ADZUNA_COUNTRY || "us";
const GREENHOUSE_BOARDS = (process.env.GREENHOUSE_BOARDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const LEVER_BOARDS = (process.env.LEVER_BOARDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const JOB_CACHE_TTL_MS = 1000 * 60 * 20;
const jobCache = new Map();
const sourceCache = new Map();

const SOURCE_CACHE_TTL_MS = {
  muse: 1000 * 60 * 60,
  remotive: 1000 * 60 * 60 * 6,
  usaJobs: 1000 * 60 * 30,
  jooble: 1000 * 60 * 30,
};

function asCleanString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function toTitleCase(value) {
  return asCleanString(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeForDedupe(value = "") {
  return asCleanString(value)
    .toLowerCase()
    .replace(
      /\b(internship|intern|co-op|coop|remote|hybrid|full-time|full time|part-time|part time|summer|fall|spring|2025|2026|2027)\b/g,
      "",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForSearch(value = "") {
  return asCleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getJobDedupeKey(job) {
  const company = normalizeForDedupe(job?.company || "");
  const title = normalizeForDedupe(job?.title || "");

  return `${company}-${title}`;
}

function getCacheKey(namespace, payload = {}) {
  return `${namespace}:${JSON.stringify(payload)}`;
}

function getCachedValue(key) {
  const cached = jobCache.get(key);

  if (!cached) return null;

  if (Date.now() - cached.createdAt > JOB_CACHE_TTL_MS) {
    jobCache.delete(key);
    return null;
  }

  return cached.value;
}

function setCachedValue(key, value) {
  jobCache.set(key, {
    createdAt: Date.now(),
    value,
  });
}

async function getOrLoadSource(key, ttlMs, loader) {
  const cached = sourceCache.get(key);

  if (cached && Date.now() - cached.createdAt <= ttlMs) {
    return cached.value;
  }

  const pending = Promise.resolve().then(loader);
  sourceCache.set(key, { createdAt: Date.now(), value: pending });

  try {
    const value = await pending;
    sourceCache.set(key, { createdAt: Date.now(), value });
    return value;
  } catch (error) {
    sourceCache.delete(key);
    throw error;
  }
}

function buildFitLabel(searchQuery, haystack) {
  const normalizedQuery = asCleanString(searchQuery).toLowerCase();
  if (!normalizedQuery) return "Good Match";

  if (haystack.includes(normalizedQuery)) {
    return "High Match";
  }

  const words = normalizedQuery.split(/\s+/).filter((word) => word.length > 2);

  const matchedWords = words.filter((word) => haystack.includes(word));

  if (matchedWords.length >= Math.min(2, words.length)) {
    return "High Match";
  }

  if (matchedWords.length > 0) {
    return "Potential Match";
  }

  return "Good Match";
}

function matchesSearchText(search = "", haystack = "") {
  const normalizedSearch = normalizeForSearch(search);
  const normalizedHaystack = normalizeForSearch(haystack);

  if (!normalizedSearch) return true;
  if (normalizedHaystack.includes(normalizedSearch)) return true;

  const words = normalizedSearch
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);

  if (words.length === 0) return true;

  const matchedWords = words.filter((word) =>
    normalizedHaystack.includes(word),
  );
  return matchedWords.length >= Math.min(2, words.length);
}

function isInternshipJob(job) {
  const title = asCleanString(job?.title).toLowerCase();
  const type = asCleanString(job?.type).toLowerCase();

  const blockedTitleKeywords = [
    "professor",
    "faculty",
    "lecturer",
    "instructor",
    "tenure",
    "surgeon",
    "physician",
    "physical therapist",
    "therapist",
    "vp",
    "vice president",
    "director",
    "manager",
    "senior",
    "sr.",
    "sr ",
    "principal",
    "lead ",
    "chief",
    "head of",
  ];

  if (blockedTitleKeywords.some((keyword) => title.includes(keyword))) {
    return false;
  }

  const titleInternshipKeywords = [
    "intern",
    "internship",
    "co-op",
    "coop",
    "co op",
    "student worker",
    "student assistant",
    "student trainee",
    "work study",
    "work-study",
    "trainee",
    "fellowship",
  ];

  if (titleInternshipKeywords.some((keyword) => title.includes(keyword))) {
    return true;
  }

  return type === "internship";
}

function isRemoteJob(job) {
  const title = asCleanString(job?.title).toLowerCase();
  const location = asCleanString(job?.location).toLowerCase();
  const type = asCleanString(job?.type).toLowerCase();
  const description = asCleanString(job?.description).toLowerCase();

  const strongText = `${title} ${location} ${type}`;
  const fullText = `${strongText} ${description}`;

  if (
    strongText.includes("remote") ||
    strongText.includes("work from home") ||
    strongText.includes("wfh") ||
    strongText.includes("virtual") ||
    strongText.includes("telework") ||
    strongText.includes("telecommute") ||
    strongText.includes("anywhere") ||
    strongText.includes("hybrid")
  ) {
    return true;
  }

  return (
    fullText.includes("fully remote") ||
    fullText.includes("100% remote") ||
    fullText.includes("remote position") ||
    fullText.includes("remote role") ||
    fullText.includes("remote opportunity")
  );
}

function inferJobType({
  title = "",
  type = "",
  description = "",
  location = "",
} = {}) {
  const haystack = `${title} ${type} ${description} ${location}`.toLowerCase();

  if (isInternshipJob({ title, type, description, location, company: "" }))
    return "Internship";
  if (haystack.includes("part time") || haystack.includes("part-time"))
    return "Part Time";
  if (haystack.includes("full time") || haystack.includes("full-time"))
    return "Full Time";
  if (haystack.includes("contract")) return "Contract";
  if (isRemoteJob({ title, type, description, location, company: "" }))
    return "Remote / Hybrid";

  return "Role";
}

function normalizeAdzunaJob(job, searchQuery = "") {
  const title = asCleanString(job?.title, "Untitled Role");
  const company = asCleanString(job?.company?.display_name, "Unknown Company");
  const location = asCleanString(
    job?.location?.display_name || job?.location?.area?.join(", "),
    "Location not specified",
  );
  const description = asCleanString(job?.description);
  const rawType = asCleanString(job?.contract_type || job?.contract_time);
  const type = rawType
    ? toTitleCase(rawType)
    : inferJobType({ title, description, location });
  const haystack =
    `${title} ${company} ${location} ${type} ${description}`.toLowerCase();

  return {
    id: job?.id ? String(job.id) : undefined,
    title,
    company,
    location,
    type,
    fit: buildFitLabel(searchQuery, haystack),
    applyUrl: asCleanString(job?.redirect_url || job?.adref) || undefined,
    createdAt: asCleanString(job?.created) || undefined,
    salaryMin: Number.isFinite(Number(job?.salary_min))
      ? Number(job.salary_min)
      : undefined,
    salaryMax: Number.isFinite(Number(job?.salary_max))
      ? Number(job.salary_max)
      : undefined,
    source: "Adzuna",
    description,
  };
}

function normalizeGreenhouseJob(job, boardToken, searchQuery = "") {
  const title = asCleanString(job?.title, "Untitled Role");
  const company =
    toTitleCase(boardToken.replace(/[-_]+/g, " ")) || "Greenhouse Company";
  const location = asCleanString(job?.location?.name, "Location not specified");
  const metadataText = Array.isArray(job?.metadata)
    ? job.metadata
        .flatMap((item) => [item?.name, item?.value])
        .filter(Boolean)
        .join(" ")
    : "";
  const description = asCleanString(job?.content || metadataText);
  const type = inferJobType({ title, description, location });
  const haystack =
    `${title} ${company} ${location} ${type} ${metadataText} ${description}`.toLowerCase();

  return {
    id: job?.id ? `greenhouse-${job.id}` : undefined,
    title,
    company,
    location,
    type,
    fit: buildFitLabel(searchQuery, haystack),
    applyUrl:
      asCleanString(
        job?.absolute_url ||
          `https://boards.greenhouse.io/${boardToken}/jobs/${job?.id}`,
      ) || undefined,
    source: "Greenhouse",
    description,
  };
}

function normalizeLeverJob(job, site, searchQuery = "") {
  const title = asCleanString(job?.text, "Untitled Role");
  const company = toTitleCase(site.replace(/[-_]+/g, " ")) || "Lever Company";
  const location = asCleanString(
    job?.categories?.location,
    "Location not specified",
  );
  const description = asCleanString(job?.descriptionPlain || job?.description);
  const rawType = asCleanString(job?.categories?.commitment);
  const type = rawType || inferJobType({ title, description, location });
  const haystack =
    `${title} ${company} ${location} ${type} ${description}`.toLowerCase();

  return {
    id: job?.id ? `lever-${job.id}` : undefined,
    title,
    company,
    location,
    type,
    fit: buildFitLabel(searchQuery, haystack),
    applyUrl:
      asCleanString(
        job?.hostedUrl || `https://jobs.lever.co/${site}/${job?.id}`,
      ) || undefined,
    source: "Lever",
    description,
  };
}

function stripHtml(value = "") {
  return asCleanString(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMuseJob(job, searchQuery = "") {
  const title = asCleanString(job?.name, "Untitled Role");
  const company = asCleanString(job?.company?.name, "Unknown Company");
  const location = Array.isArray(job?.locations)
    ? uniqueNonEmptyStrings(
        job.locations.map((item) => item?.name),
        3,
      ).join("; ")
    : "Location not specified";
  const description = stripHtml(job?.contents);
  const type = inferJobType({ title, description, location });
  const haystack =
    `${title} ${company} ${location} ${type} ${description}`.toLowerCase();

  return {
    id: job?.id ? `muse-${job.id}` : undefined,
    title,
    company,
    location: location || "Location not specified",
    type,
    fit: buildFitLabel(searchQuery, haystack),
    applyUrl: asCleanString(job?.refs?.landing_page) || undefined,
    createdAt: asCleanString(job?.publication_date) || undefined,
    source: "The Muse",
    description,
  };
}

function normalizeRemotiveJob(job, searchQuery = "") {
  const title = asCleanString(job?.title, "Untitled Role");
  const company = asCleanString(job?.company_name, "Unknown Company");
  const location = asCleanString(job?.candidate_required_location, "Remote");
  const description = stripHtml(job?.description);
  const rawType = asCleanString(job?.job_type);
  const type = rawType ? toTitleCase(rawType) : "Remote";
  const haystack =
    `${title} ${company} ${location} ${type} ${description}`.toLowerCase();

  return {
    id: job?.id ? `remotive-${job.id}` : undefined,
    title,
    company,
    location,
    type,
    fit: buildFitLabel(searchQuery, haystack),
    applyUrl: asCleanString(job?.url) || undefined,
    createdAt: asCleanString(job?.publication_date) || undefined,
    salaryText: asCleanString(job?.salary) || undefined,
    source: "Remotive",
    description,
  };
}

function normalizeUsaJobsJob(item, searchQuery = "") {
  const job = item?.MatchedObjectDescriptor || item || {};
  const locations = Array.isArray(job?.PositionLocation)
    ? job.PositionLocation.map((entry) => entry?.LocationName)
    : [];
  const title = asCleanString(job?.PositionTitle, "Untitled Role");
  const company = asCleanString(
    job?.OrganizationName || job?.DepartmentName,
    "U.S. Federal Government",
  );
  const location =
    uniqueNonEmptyStrings(locations, 3).join("; ") || "United States";
  const details = job?.UserArea?.Details || {};
  const description = stripHtml(
    [
      details?.JobSummary,
      details?.MajorDuties,
      details?.Education,
      details?.Requirements,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const type = inferJobType({ title, description, location });
  const remuneration = Array.isArray(job?.PositionRemuneration)
    ? job.PositionRemuneration[0]
    : undefined;
  const haystack =
    `${title} ${company} ${location} ${type} ${description}`.toLowerCase();

  return {
    id: asCleanString(job?.PositionID || item?.MatchedObjectId) || undefined,
    title,
    company,
    location,
    type,
    fit: buildFitLabel(searchQuery, haystack),
    applyUrl:
      asCleanString(job?.PositionURI || job?.ApplyURI?.[0]) || undefined,
    createdAt:
      asCleanString(job?.PublicationStartDate || job?.PositionStartDate) ||
      undefined,
    salaryMin: Number.isFinite(Number(remuneration?.MinimumRange))
      ? Number(remuneration.MinimumRange)
      : undefined,
    salaryMax: Number.isFinite(Number(remuneration?.MaximumRange))
      ? Number(remuneration.MaximumRange)
      : undefined,
    source: "USAJOBS",
    description,
  };
}

function normalizeJoobleJob(job, searchQuery = "") {
  const title = asCleanString(job?.title, "Untitled Role");
  const company = asCleanString(job?.company, "Unknown Company");
  const location = asCleanString(job?.location, "Location not specified");
  const description = stripHtml(job?.snippet);
  const type =
    asCleanString(job?.type) || inferJobType({ title, description, location });
  const haystack =
    `${title} ${company} ${location} ${type} ${description}`.toLowerCase();

  return {
    id: job?.id ? `jooble-${job.id}` : undefined,
    title,
    company,
    location,
    type,
    fit: buildFitLabel(searchQuery, haystack),
    applyUrl: asCleanString(job?.link) || undefined,
    createdAt: asCleanString(job?.updated) || undefined,
    salaryText: asCleanString(job?.salary) || undefined,
    source: "Jooble",
    description,
  };
}

function buildRecommendedRoles(jobs) {
  const topJobs = jobs.slice(0, 5);

  if (topJobs.length > 0) {
    return topJobs.map((job) => ({
      title: job.title,
      reason:
        "This role is being recommended based on the uploaded resume and detected career direction.",
    }));
  }

  return [
    {
      title: "Relevant Internship or Entry-Level Role",
      reason:
        "This role is being recommended based on the uploaded resume and detected career direction.",
    },
  ];
}

function normalizeStringList(value, { max = 8 } = {}) {
  const cleaned = Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];

  return Array.from(new Set(cleaned)).slice(0, max);
}

function normalizeRolePhrase(value = "") {
  return asCleanString(value)
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(
      /\b(remote|hybrid|virtual|internship|intern|co-op|coop|full-time|full time|part-time|part time|entry-level|entry level)\b/g,
      " ",
    )
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueNonEmptyStrings(values, max = 10) {
  return Array.from(
    new Set(values.map((value) => asCleanString(value)).filter(Boolean)),
  ).slice(0, max);
}

function buildBaseResumeTermsFromText(resumeText = "") {
  const normalized = asCleanString(resumeText).toLowerCase();
  const candidatePatterns = [
    /\b([a-z]{3,}(?:\s+[a-z]{3,}){0,2}\s+(?:research assistant|researcher|analyst|technician|scientist|assistant|intern|developer|engineer|specialist|coordinator|tutor))\b/g,
    /\b(?:skills|coursework|projects|experience)[:\-]?\s*([a-z][a-z0-9+\-\s,]{6,120})/g,
  ];

  const rawMatches = [];
  for (const pattern of candidatePatterns) {
    for (const match of normalized.matchAll(pattern)) {
      if (match[1]) rawMatches.push(match[1]);
    }
  }

  const simpleFallbacks = uniqueNonEmptyStrings(
    [
      ...(normalized.includes("research") ? ["research assistant"] : []),
      ...(normalized.includes("lab") || normalized.includes("laboratory")
        ? ["laboratory assistant"]
        : []),
      ...(normalized.includes("analysis") || normalized.includes("analyst")
        ? ["analyst"]
        : []),
      ...(normalized.includes("teaching") || normalized.includes("tutor")
        ? ["teaching assistant"]
        : []),
      ...(normalized.includes("communication")
        ? ["communications intern"]
        : []),
      ...(normalized.includes("marketing") ? ["marketing intern"] : []),
    ],
    6,
  );

  return uniqueNonEmptyStrings(
    [
      ...rawMatches.map((item) => normalizeRolePhrase(item)),
      ...simpleFallbacks,
    ],
    8,
  ).filter((term) => term.length >= 4);
}

function buildGenericSearchVariants(baseQuery = "", filter = "All") {
  const exact = asCleanString(baseQuery).toLowerCase();
  const normalized = normalizeRolePhrase(baseQuery);

  if (!exact && !normalized) {
    return filter === "All"
      ? ["internship", "research assistant"]
      : filter === "Internship"
        ? ["internship"]
        : ["remote internship", "hybrid internship"];
  }

  const variants = uniqueNonEmptyStrings([exact, normalized], 8);

  if (normalized) {
    const words = normalized.split(/\s+/).filter(Boolean);

    if (words.length >= 3) {
      variants.push(words.slice(0, 2).join(" "));
      variants.push(words.slice(0, 3).join(" "));
      variants.push(words.slice(-2).join(" "));
    } else if (words.length === 2) {
      variants.push(words.join(" "));
      variants.push(words[0]);
    }
  }

  const cleaned = uniqueNonEmptyStrings(variants, 8);

  if (filter === "Internship") {
    return uniqueNonEmptyStrings(
      cleaned.flatMap((term) => [
        term.includes("intern") ? term : `${term} intern`,
        term.includes("internship") ? term : `${term} internship`,
        term.includes("assistant") ? term : `${term} assistant`,
        term,
      ]),
      10,
    );
  }

  if (filter === "Remote") {
    return uniqueNonEmptyStrings(
      cleaned.flatMap((term) => [
        term.includes("remote") ? term : `remote ${term}`,
        `${term} remote`,
        `virtual ${term}`,
        `${term} virtual`,
        `work from home ${term}`,
        `${term} work from home`,
        `remote intern ${term}`,
        `remote internship ${term}`,
        `remote assistant ${term}`,
        `hybrid ${term}`,
        term,
      ]),
      12,
    );
  }

  return cleaned;
}

function inferResumeJobProfile(resumeText = "") {
  const fallbackTerms = buildBaseResumeTermsFromText(resumeText);

  if (fallbackTerms.length > 0) {
    return {
      careerPaths: fallbackTerms.map((term) => toTitleCase(term)).slice(0, 5),
      jobKeywords: fallbackTerms.slice(0, 8),
      recommendedSearchTerms: fallbackTerms
        .map((term) =>
          term.includes("intern") || term.includes("assistant")
            ? term
            : `${term} intern`,
        )
        .slice(0, 6),
    };
  }

  return {
    careerPaths: [
      "General Internship",
      "Research Assistant",
      "Entry-Level Analyst",
    ],
    jobKeywords: ["internship", "research", "analysis"],
    recommendedSearchTerms: [
      "internship",
      "research assistant",
      "entry level analyst",
    ],
  };
}

function enrichResumeAnalysis(parsed, resumeText = "") {
  if (!parsed || parsed.isResume !== true) return parsed;

  const fallbackProfile = inferResumeJobProfile(resumeText);

  const careerPaths = normalizeStringList(parsed.careerPaths, { max: 5 });
  const jobKeywords = normalizeStringList(parsed.jobKeywords, { max: 8 });
  const recommendedSearchTerms = normalizeStringList(
    parsed.recommendedSearchTerms,
    { max: 6 },
  );

  return {
    ...parsed,
    careerPaths:
      careerPaths.length > 0 ? careerPaths : fallbackProfile.careerPaths,
    jobKeywords:
      jobKeywords.length > 0 ? jobKeywords : fallbackProfile.jobKeywords,
    recommendedSearchTerms:
      recommendedSearchTerms.length > 0
        ? recommendedSearchTerms
        : fallbackProfile.recommendedSearchTerms,
  };
}

function buildSearchVariants(baseQuery = "", filter = "All") {
  return buildGenericSearchVariants(baseQuery, filter);
}

function buildRoleRecommendationsFromCareerPaths(careerPaths = []) {
  return uniqueNonEmptyStrings(careerPaths, 5).map((path) => ({
    title: path,
    reason:
      "This role is being recommended based on the uploaded resume and detected career direction.",
  }));
}

function buildRecommendedSearchInputs({
  searchTerms = [],
  careerPaths = [],
  jobKeywords = [],
} = {}) {
  const preferredTerms = normalizeStringList(searchTerms, { max: 6 });
  const secondaryTerms = normalizeStringList(careerPaths, { max: 5 });
  const tertiaryTerms = normalizeStringList(jobKeywords, { max: 8 });

  const baseTerms = uniqueNonEmptyStrings(
    [...preferredTerms, ...secondaryTerms, ...tertiaryTerms].map(
      (term) => normalizeRolePhrase(term) || asCleanString(term),
    ),
    10,
  );

  if (baseTerms.length === 0) {
    return {
      searchTerms: ["internship", "research assistant", "entry level analyst"],
      primaryQuery: "internship",
    };
  }

  const expandedTerms = uniqueNonEmptyStrings(
    baseTerms.flatMap((term) => buildGenericSearchVariants(term, "Internship")),
    12,
  );

  return {
    searchTerms: expandedTerms.length > 0 ? expandedTerms : baseTerms,
    primaryQuery: baseTerms[0],
  };
}

function getJobHaystack(job) {
  return `${job.title} ${job.company} ${job.location} ${job.type} ${job.description || ""}`.toLowerCase();
}

function scoreJob(job, context = {}) {
  const haystack = getJobHaystack(job);
  const title = asCleanString(job.title).toLowerCase();
  const searchTerms = context.searchTerms || [];
  const careerPaths = context.careerPaths || [];
  const jobKeywords = context.jobKeywords || [];
  const allTerms = uniqueNonEmptyStrings(
    [...searchTerms, ...careerPaths, ...jobKeywords],
    25,
  )
    .map(
      (term) => normalizeRolePhrase(term) || asCleanString(term).toLowerCase(),
    )
    .filter(Boolean);

  let score = 0;

  for (const term of allTerms) {
    if (!term) continue;
    if (title.includes(term)) score += 12;
    else if (haystack.includes(term)) score += 6;

    const words = term.split(/\s+/).filter((word) => word.length >= 3);
    for (const word of words) {
      if (title.includes(word)) score += 2;
      else if (haystack.includes(word)) score += 1;
    }
  }

  if (isInternshipJob(job)) score += 8;
  if (job.applyUrl) score += 3;
  if (job.description) score += 2;
  if (isRemoteJob(job)) score += 1;

  const seniorNegative = [
    "senior",
    "sr.",
    "manager",
    "director",
    "principal",
    "lead ",
    "head of",
    "chief",
  ];
  if (seniorNegative.some((word) => title.includes(word))) score -= 20;

  return score;
}

function rankJobs(jobs, context = {}) {
  return [...jobs]
    .map((job) => {
      const score = scoreJob(job, context);
      return {
        ...job,
        matchScore: score,
        fit:
          score >= 24
            ? "High Match"
            : score >= 12
              ? "Good Match"
              : job.fit || "Potential Match",
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

async function fetchAdzunaJobs({
  search = "",
  location = "",
  radiusKm,
  page = 1,
  resultsPerPage = 50,
} = {}) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    throw new Error("Missing Adzuna credentials in environment variables");
  }

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(resultsPerPage),
    "content-type": "application/json",
  });

  if (search) params.append("what", search);
  if (location) params.append("where", location);
  if (location && Number.isFinite(radiusKm))
    params.append("distance", String(radiusKm));

  const response = await fetch(
    `${ADZUNA_API_URL}/jobs/${ADZUNA_COUNTRY}/search/${page}?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error(`Adzuna request failed with status ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data?.results) ? data.results : [];
}

async function fetchAdzunaJobsForQueries({
  queries = [],
  location = "",
  radiusKm,
  page = 1,
  resultsPerPage = 50,
} = {}) {
  const safeQueries = uniqueNonEmptyStrings(queries, 8);

  const settled = await Promise.allSettled(
    safeQueries.map((search) =>
      fetchAdzunaJobs({ search, location, radiusKm, page, resultsPerPage }),
    ),
  );

  return settled
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value);
}

async function fetchGreenhouseJobs({ search = "", location = "" } = {}) {
  if (GREENHOUSE_BOARDS.length === 0) return [];

  const responses = await Promise.all(
    GREENHOUSE_BOARDS.map(async (boardToken) => {
      const response = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`,
      );
      if (!response.ok) return [];
      const data = await response.json();
      const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
      return jobs.map((job) => normalizeGreenhouseJob(job, boardToken, search));
    }),
  );

  return responses.flat().filter((job) => {
    const haystack = getJobHaystack(job);
    const matchesSearch = matchesSearchText(search, haystack);
    const matchesLocation =
      !location || job.location.toLowerCase().includes(location.toLowerCase());
    return matchesSearch && matchesLocation;
  });
}

async function fetchLeverJobs({ search = "", location = "" } = {}) {
  if (LEVER_BOARDS.length === 0) return [];

  const responses = await Promise.all(
    LEVER_BOARDS.map(async (site) => {
      const response = await fetch(
        `https://api.lever.co/v0/postings/${site}?mode=json`,
      );
      if (!response.ok) return [];
      const data = await response.json();
      const jobs = Array.isArray(data) ? data : [];
      return jobs.map((job) => normalizeLeverJob(job, site, search));
    }),
  );

  return responses.flat().filter((job) => {
    const haystack = getJobHaystack(job);
    const matchesSearch = matchesSearchText(search, haystack);
    const matchesLocation =
      !location || job.location.toLowerCase().includes(location.toLowerCase());
    return matchesSearch && matchesLocation;
  });
}

function matchesAnySearchTerm(job, searchTerms = []) {
  const terms = uniqueNonEmptyStrings(searchTerms, 6);
  if (terms.length === 0) return true;
  const haystack = getJobHaystack(job);
  return terms.some((term) => matchesSearchText(term, haystack));
}

async function fetchMuseJobs({ searchTerms = [], location = "" } = {}) {
  if (location) return [];

  const rawJobs = await getOrLoadSource(
    "muse:pages:1-4",
    SOURCE_CACHE_TTL_MS.muse,
    async () => {
      const settled = await Promise.allSettled(
        [1, 2, 3, 4].map(async (page) => {
          const response = await fetch(
            `https://www.themuse.com/api/public/jobs?page=${page}`,
          );
          if (!response.ok)
            throw new Error(
              `The Muse request failed with status ${response.status}`,
            );
          const data = await response.json();
          return Array.isArray(data?.results) ? data.results : [];
        }),
      );

      return settled
        .filter((result) => result.status === "fulfilled")
        .flatMap((result) => result.value);
    },
  );

  const primaryQuery = searchTerms[0] || "";
  return rawJobs
    .map((job) => normalizeMuseJob(job, primaryQuery))
    .filter((job) => matchesAnySearchTerm(job, searchTerms));
}

async function fetchRemotiveJobs({ searchTerms = [], location = "" } = {}) {
  if (location) return [];

  const rawJobs = await getOrLoadSource(
    "remotive:all",
    SOURCE_CACHE_TTL_MS.remotive,
    async () => {
      const response = await fetch("https://remotive.com/api/remote-jobs");
      if (!response.ok)
        throw new Error(
          `Remotive request failed with status ${response.status}`,
        );
      const data = await response.json();
      return Array.isArray(data?.jobs) ? data.jobs : [];
    },
  );

  const primaryQuery = searchTerms[0] || "";
  return rawJobs
    .map((job) => normalizeRemotiveJob(job, primaryQuery))
    .filter((job) => matchesAnySearchTerm(job, searchTerms));
}

async function fetchUsaJobs({
  search = "",
  location = "",
  radiusMiles,
  page = 1,
} = {}) {
  const apiKey = process.env.USAJOBS_API_KEY;
  const email = process.env.USAJOBS_EMAIL;
  if (!apiKey || !email) return [];

  const params = new URLSearchParams({
    ResultsPerPage: "50",
    Page: String(page),
    WhoMayApply: "public",
    Fields: "Full",
  });
  if (search) params.append("Keyword", search);
  if (location) params.append("LocationName", location);
  if (location && Number.isFinite(radiusMiles))
    params.append("Radius", String(radiusMiles));

  const cacheKey = `usajobs:${params.toString()}`;
  const data = await getOrLoadSource(
    cacheKey,
    SOURCE_CACHE_TTL_MS.usaJobs,
    async () => {
      const response = await fetch(
        `https://data.usajobs.gov/api/search?${params.toString()}`,
        {
          headers: {
            Host: "data.usajobs.gov",
            "User-Agent": email,
            "Authorization-Key": apiKey,
          },
        },
      );
      if (!response.ok)
        throw new Error(
          `USAJOBS request failed with status ${response.status}`,
        );
      return response.json();
    },
  );

  const items = data?.SearchResult?.SearchResultItems;
  return Array.isArray(items)
    ? items.map((item) => normalizeUsaJobsJob(item, search))
    : [];
}

async function fetchJoobleJobs({ search = "", location = "", page = 1 } = {}) {
  const apiKey = process.env.JOOBLE_API_KEY;
  if (!apiKey) return [];

  const payload = { keywords: search, location, page: String(page) };
  const cacheKey = `jooble:${JSON.stringify(payload).toLowerCase()}`;
  const data = await getOrLoadSource(
    cacheKey,
    SOURCE_CACHE_TTL_MS.jooble,
    async () => {
      const response = await fetch(`https://jooble.org/api/${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok)
        throw new Error(`Jooble request failed with status ${response.status}`);
      return response.json();
    },
  );

  return Array.isArray(data?.jobs)
    ? data.jobs.map((job) => normalizeJoobleJob(job, search))
    : [];
}

function mergeAndDedupeJobs(jobLists) {
  const merged = jobLists
    .flat()
    .filter((job) => job && job.title && job.company);
  const deduped = new Map();

  for (const job of merged) {
    const key = getJobDedupeKey(job);
    if (!key || key === "-") continue;

    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, job);
      continue;
    }

    const existingScore =
      (existing.applyUrl ? 3 : 0) +
      (existing.description ? 2 : 0) +
      (isRemoteJob(existing) ? 1 : 0) +
      (isInternshipJob(existing) ? 1 : 0);

    const nextScore =
      (job.applyUrl ? 3 : 0) +
      (job.description ? 2 : 0) +
      (isRemoteJob(job) ? 1 : 0) +
      (isInternshipJob(job) ? 1 : 0);

    if (nextScore > existingScore) {
      deduped.set(key, job);
    }
  }

  return Array.from(deduped.values());
}

function applyJobFilters(
  jobs,
  { search = "", location = "", filter = "All" } = {},
) {
  return jobs.filter((job) => {
    const haystack = getJobHaystack(job);
    const matchesSearch = matchesSearchText(search, haystack);
    const matchesLocation =
      !location || job.location.toLowerCase().includes(location.toLowerCase());

    const matchesFilter =
      filter === "All" ||
      (filter === "Internship" && isInternshipJob(job)) ||
      (filter === "Remote" && isRemoteJob(job));

    return matchesSearch && matchesLocation && matchesFilter;
  });
}

function removeSeniorLevelJobs(jobs) {
  return jobs.filter((job) => {
    const title = asCleanString(job.title).toLowerCase();
    return !(
      title.includes("senior") ||
      title.includes("sr.") ||
      title.includes("manager") ||
      title.includes("director") ||
      title.includes("principal") ||
      title.includes("lead ") ||
      title.includes("chief")
    );
  });
}

async function fetchJobPool({
  searchTerms = [],
  careerPaths = [],
  jobKeywords = [],
  location = "",
  radiusKm,
  filter = "All",
  page = 1,
} = {}) {
  const seeds = uniqueNonEmptyStrings(
    [...searchTerms, ...careerPaths, ...jobKeywords],
    10,
  );
  const baseSeeds =
    seeds.length > 0 ? seeds : ["internship", "research assistant"];

  const searchQueries = uniqueNonEmptyStrings(
    baseSeeds.flatMap((term) => buildGenericSearchVariants(term, filter)),
    12,
  );

  let adzunaRawJobs = await fetchAdzunaJobsForQueries({
    queries: searchQueries,
    location,
    radiusKm,
    page,
    resultsPerPage: 35,
  });

  if (adzunaRawJobs.length < 8 && filter !== "All") {
    const relaxedQueries = uniqueNonEmptyStrings(
      baseSeeds.flatMap((term) => buildGenericSearchVariants(term, "All")),
      8,
    );

    const relaxedRawJobs = await fetchAdzunaJobsForQueries({
      queries: relaxedQueries,
      location,
      radiusKm,
      page,
      resultsPerPage: 25,
    });

    adzunaRawJobs = [...adzunaRawJobs, ...relaxedRawJobs];
  }

  const boardSearch = searchQueries[0] || baseSeeds[0] || "intern";
  const sourceSearchTerms = uniqueNonEmptyStrings(
    [...baseSeeds, ...searchQueries],
    6,
  );
  const radiusMiles = Number.isFinite(radiusKm)
    ? Math.round(radiusKm / 1.60934)
    : undefined;

  const sourceResults = await Promise.allSettled([
    fetchGreenhouseJobs({ search: boardSearch, location }),
    fetchLeverJobs({ search: boardSearch, location }),
    fetchMuseJobs({ searchTerms: sourceSearchTerms, location }),
    fetchRemotiveJobs({ searchTerms: sourceSearchTerms, location }),
    fetchUsaJobs({ search: boardSearch, location, radiusMiles, page }),
    fetchJoobleJobs({ search: boardSearch, location, page }),
  ]);

  const [
    greenhouseJobs,
    leverJobs,
    museJobs,
    remotiveJobs,
    usaJobs,
    joobleJobs,
  ] = sourceResults.map((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  const adzunaJobs = adzunaRawJobs.map((job) =>
    normalizeAdzunaJob(job, boardSearch),
  );
  const mergedJobs = mergeAndDedupeJobs([
    adzunaJobs,
    greenhouseJobs,
    leverJobs,
    museJobs,
    remotiveJobs,
    usaJobs,
    joobleJobs,
  ]);
  const rankedJobs = rankJobs(mergedJobs, {
    searchTerms,
    careerPaths,
    jobKeywords,
  });

  return {
    jobs: rankedJobs,
    searchQueries,
    totalFetched: mergedJobs.length,
    sources: uniqueNonEmptyStrings(
      mergedJobs.map((job) => job.source),
      10,
    ),
  };
}

app.get("/jobs/recommended", async (req, res) => {
  try {
    const searchTermsParam = asCleanString(req.query.searchTerms);
    const careerPathsParam = asCleanString(req.query.careerPaths);
    const jobKeywordsParam = asCleanString(req.query.jobKeywords);

    const cacheKey = getCacheKey("recommended", {
      searchTerms: searchTermsParam.toLowerCase(),
      careerPaths: careerPathsParam.toLowerCase(),
      jobKeywords: jobKeywordsParam.toLowerCase(),
    });

    const cachedResponse = getCachedValue(cacheKey);
    if (cachedResponse) return res.json(cachedResponse);

    const rawSearchTerms = searchTermsParam
      ? searchTermsParam
          .split(",")
          .map((term) => term.trim())
          .filter(Boolean)
      : [];

    const careerPaths = careerPathsParam
      ? uniqueNonEmptyStrings(
          careerPathsParam
            .split(",")
            .map((term) => term.trim())
            .filter(Boolean),
          5,
        )
      : [];

    const jobKeywords = jobKeywordsParam
      ? uniqueNonEmptyStrings(
          jobKeywordsParam
            .split(",")
            .map((term) => term.trim())
            .filter(Boolean),
          8,
        )
      : [];

    const { searchTerms, primaryQuery } = buildRecommendedSearchInputs({
      searchTerms: rawSearchTerms,
      careerPaths,
      jobKeywords,
    });

    const pool = await fetchJobPool({
      searchTerms,
      careerPaths,
      jobKeywords,
      filter: "All",
      page: 1,
    });

    const noSeniorJobs = removeSeniorLevelJobs(pool.jobs).filter(
      (job) => job.applyUrl,
    );
    const internshipJobs = noSeniorJobs.filter(isInternshipJob);

    const recommendedSource =
      internshipJobs.length >= 6 ? internshipJobs : noSeniorJobs;

    const seenRecommendedCompanies = new Map();

    const recommendedJobs = recommendedSource
      .filter((job) => {
        const company = normalizeForDedupe(job.company || "unknown");
        const count = seenRecommendedCompanies.get(company) || 0;

        if (count >= 2) return false;

        seenRecommendedCompanies.set(company, count + 1);
        return true;
      })
      .slice(0, 30);

    const roles =
      careerPaths.length > 0
        ? buildRoleRecommendationsFromCareerPaths(careerPaths)
        : buildRecommendedRoles(recommendedJobs);

    const responsePayload = {
      roles,
      jobs: recommendedJobs,
      searchTerms,
      primaryQuery,
      totalFetched: pool.totalFetched,
      searchQueries: pool.searchQueries,
      sources: pool.sources,
    };

    setCachedValue(cacheKey, responsePayload);
    res.json(responsePayload);
  } catch (error) {
    console.error("RECOMMENDED JOBS ERROR:", error);
    res.status(500).json({
      error: "Failed to load recommended jobs",
      details: error?.message || "Unknown error",
    });
  }
});

app.get("/jobs/search", async (req, res) => {
  try {
    const query = asCleanString(req.query.query);
    const location = asCleanString(req.query.location);
    const requestedRadiusMiles = Number.parseInt(
      asCleanString(req.query.radiusMiles, "25"),
      10,
    );
    const radiusMiles = [10, 25, 50, 100].includes(requestedRadiusMiles)
      ? requestedRadiusMiles
      : 25;
    const radiusKm = Math.round(radiusMiles * 1.60934);
    const filter = asCleanString(req.query.filter, "All");
    const page = Number.parseInt(asCleanString(req.query.page, "1"), 10) || 1;
    const searchTermsParam = asCleanString(req.query.searchTerms);

    const cacheKey = getCacheKey("search", {
      query: query.toLowerCase(),
      location: location.toLowerCase(),
      radiusMiles: location ? radiusMiles : null,
      filter,
      page,
      searchTerms: searchTermsParam.toLowerCase(),
    });

    const cachedResponse = getCachedValue(cacheKey);
    if (cachedResponse) return res.json(cachedResponse);

    const requestedSearchTerms = searchTermsParam
      ? uniqueNonEmptyStrings(
          searchTermsParam
            .split(",")
            .map((term) => term.trim())
            .filter(Boolean),
          8,
        )
      : [];

    const baseSeedTerms =
      requestedSearchTerms.length > 0
        ? requestedSearchTerms
        : query
          ? [query]
          : ["internship"];

    const pool = await fetchJobPool({
      searchTerms: query ? [query, ...baseSeedTerms] : baseSeedTerms,
      location,
      radiusKm: location ? radiusKm : undefined,
      filter,
      page,
    });

    const relaxedSearch = query || "";

    let jobs = applyJobFilters(pool.jobs, {
      search: relaxedSearch,
      location: "",
      filter,
    });

    if (jobs.length === 0 && filter !== "All") {
      jobs = applyJobFilters(pool.jobs, {
        search: "",
        location: "",
        filter,
      });
    }

    if (filter === "Remote" && jobs.length < 8) {
      const remotePool = await fetchJobPool({
        searchTerms: baseSeedTerms.flatMap((term) => [
          `remote ${term}`,
          `${term} remote`,
          `virtual ${term}`,
          `${term} virtual`,
          `work from home ${term}`,
          `${term} work from home`,
          `remote intern ${term}`,
          `remote internship ${term}`,
          `remote assistant ${term}`,
        ]),
        location,
        radiusKm: location ? radiusKm : undefined,
        filter: "All",
        page,
      });

      const additionalRemoteJobs = applyJobFilters(remotePool.jobs, {
        search: "",
        location: "",
        filter: "Remote",
      });

      jobs = rankJobs(mergeAndDedupeJobs([jobs, additionalRemoteJobs]), {
        searchTerms: baseSeedTerms,
      });
    }

    jobs = mergeAndDedupeJobs([jobs]).slice(0, 50);

    const responsePayload = {
      jobs,
      page,
      filter,
      radiusMiles: location ? radiusMiles : null,
      searchQueries: pool.searchQueries,
      totalFetched: pool.totalFetched,
      sources: pool.sources,
    };

    setCachedValue(cacheKey, responsePayload);
    res.json(responsePayload);
  } catch (error) {
    console.error("SEARCH JOBS ERROR:", error);
    res.status(500).json({
      error: "Failed to search jobs",
      details: error?.message || "Unknown error",
    });
  }
});

app.post("/analyze-resume", upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Resume PDF is required" });
    }

    console.log("Uploaded file:", req.file.originalname);

    const fileBuffer = fs.readFileSync(req.file.path);

    const parser = new PDFParse({
      data: fileBuffer,
      CanvasFactory,
    });

    const pdfTextResult = await parser.getText();
    const resumeText = pdfTextResult.text?.trim();

    await parser.destroy?.();

    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (!resumeText) {
      return res.status(400).json({
        error: "Could not extract text from PDF",
      });
    }

    const prompt = `
You are a professional resume reviewer and career peer advisor for a university career services office.
Your feedback must follow the exact structure used by a career peer advisor when reviewing student resumes.

Your FIRST task is to determine whether the uploaded document is actually a resume.

A document should be considered a resume ONLY if it clearly contains multiple resume-like sections or content such as:
- name / contact information
- education
- work experience
- projects
- skills
- leadership / involvement

If the uploaded document is NOT a resume, you MUST return ONLY valid JSON in exactly this shape:
{
  "isResume": false,
  "message": "This file does not appear to be a resume. Please upload a valid resume PDF."
}

If the uploaded document IS a resume, you MUST return ONLY valid JSON in exactly this shape:
{
  "isResume": true,
  "score": number,
  "resumeTier": "Gold" | "Silver" | "Bronze",
  "scoreBreakdown": {
    "overallImpression": number,
    "contentAndRelevance": number,
    "formattingAndVisualAppeal": number,
    "languageAndProfessionalism": number,
    "careerAlignmentImpact": number
  },
  "overallImpression": { "intro": "string" },
  "contentAndRelevance": { "intro": "string" },
  "formattingAndVisualAppeal": { "intro": "string" },
  "languageAndProfessionalism": { "intro": "string" },
  "recommendations": ["string", "string", "string"],
  "additionalNotes": "string",
  "careerPaths": ["string", "string", "string"],
  "jobKeywords": ["string", "string", "string"],
  "recommendedSearchTerms": ["string", "string", "string"]
}

SCORING RUBRIC:
- Overall Impression: score out of 15
- Content and Relevance: score out of 30
- Formatting and Visual Appeal: score out of 20
- Language and Professionalism: score out of 20
- Career Alignment / Impact: score out of 15

STRICT SCORING PHILOSOPHY:
- Score like a real university career services reviewer, not like a generous chatbot.
- Do NOT give high scores just because the document has basic resume sections.
- A resume with only short sections, limited detail, generic bullets, weak structure, missing dates, missing locations, or limited measurable impact should usually score between 50 and 70.
- A resume should only score 80 or higher if it is genuinely strong, well-formatted, specific, detailed, easy to skim, and includes strong bullet points with clear impact.
- A resume should only score 90 or higher if it is polished, competitive, highly targeted, consistently formatted, quantified, and close to submission-ready.
- If the resume is short, thin, generic, or looks like a quick sample resume, it should NOT score above 75.
- If sections run together, headings are unclear, formatting is weak, or the resume is hard to skim, strongly penalize Formatting and Visual Appeal.
- If experience bullets are generic responsibilities without enough measurable outcomes, strongly penalize Content and Relevance and Language and Professionalism.
- If the resume has only one or two experiences and little project/detail depth, strongly penalize Content and Relevance.
- If the career direction is understandable but not strongly supported with targeted experience, coursework, projects, or skills, penalize Career Alignment / Impact.

SCORE BAND GUIDANCE:
- 90 to 100: Excellent, polished, highly competitive, targeted, quantified, and nearly ready to submit.
- 80 to 89: Strong resume with solid structure, relevant experience, good detail, and only moderate improvements needed.
- 70 to 79: Decent resume, but still has noticeable issues such as limited detail, weak bullets, inconsistent formatting, or underdeveloped sections.
- 60 to 69: Basic or thin resume with some relevant content but significant improvement needed before it feels competitive.
- 50 to 59: Weak resume with limited structure, vague content, missing details, or poor formatting.
- Below 50: Very weak, incomplete, unclear, or barely resume-like.

CATEGORY-SPECIFIC SCORING RULES:
- Overall Impression out of 15: Give 13 to 15 only if the resume immediately looks professional, organized, complete, and targeted. Give 8 to 12 for basic but underdeveloped resumes. Give below 8 if it looks incomplete, messy, or hard to review.
- Content and Relevance out of 30: Give 25 to 30 only if experiences, projects, skills, and coursework strongly support the target field with specific achievements. Give 17 to 24 if relevant content exists but lacks depth or measurable impact. Give below 17 if content is thin, generic, or weakly connected to the target field.
- Formatting and Visual Appeal out of 20: Give 17 to 20 only if headings, spacing, alignment, dates, locations, and section organization are clean and easy to skim. Give 11 to 16 for basic formatting with noticeable issues. Give below 11 if the resume lacks clear structure or sections run together.
- Language and Professionalism out of 20: Give 17 to 20 only if bullet points consistently use strong action verbs, clear tasks, tools/skills, and outcomes. Give 11 to 16 if language is understandable but generic. Give below 11 if bullets are vague, repetitive, or poorly written.
- Career Alignment / Impact out of 15: Give 13 to 15 only if the resume clearly supports a specific career direction. Give 8 to 12 if the direction is visible but not strongly developed. Give below 8 if the career direction is unclear or weakly supported.

RESUME TIER RULES:
- Gold = 85 to 100
- Silver = 70 to 84
- Bronze = below 70
- Resume tier must be based on the overall score

VERY IMPORTANT RULES:
- The total score must equal the sum of the 5 category scores
- Total score must be out of 100
- Use strict, realistic scoring, not inflated scoring
- If the resume feels like a quick sample, short test document, or underdeveloped draft, score it lower even if the content is relevant
- If the file is not a resume, do NOT provide resume feedback sections
- If the file is not a resume, return only the isResume:false JSON
- Do not use markdown or code fences
- Do not include any explanation outside the JSON
- Be strict in deciding whether it is a resume

WRITING STYLE RULES:
- Write like a real university career peer advisor giving resume feedback to a student.
- Each major feedback section should be ONE polished paragraph, not bullet points and not a list of separate issue/fix statements.
- The paragraph should sound human, supportive, and professional.
- Start with a positive observation, then smoothly transition into recommendations.
- Use natural phrasing such as "I recommend...", "You may also consider...", "Additionally...", "To further strengthen...", and "This would make..."
- Avoid robotic language, generic filler, and overly short feedback.
- Avoid extremely long paragraphs. Each section paragraph should usually be 3 to 6 sentences.
- Be specific to the actual resume content.
- Do not invent experience, awards, projects, companies, coursework, or technical skills not visible in the resume text.
- Do not mention that you are an AI.

SECTION GUIDELINES:

The feedback must be organized around these exact student-facing sections:
1. Overall Impression
2. Content and Relevance
3. Formatting and Visual Appeal
4. Language and Professionalism
5. Recommendations
6. Additional Notes

For each of these four section objects — overallImpression, contentAndRelevance, formattingAndVisualAppeal, and languageAndProfessionalism — use only the "intro" field.
The "intro" field must contain the full paragraph for that section.
Do not split the section into issue/fix/recruiter/outcome fields.

Career Paths:
- Provide 3 to 5 likely internship, early-career, academic, or professional paths based on the actual resume.
- These must reflect the student's major, skills, projects, coursework, and experience.
- Avoid unrelated roles even if they appear in broad job search results.

Job Keywords:
- Provide 4 to 8 useful job-search keywords based on the actual resume.
- Include field-specific terms, technical terms, and likely role-related keywords.
- Avoid overly broad keywords like "job," "internship," "student," or "engineer" by themselves.

Recommended Search Terms:
- Provide 3 to 6 realistic job search phrases the app can use to find relevant openings.
- These should be specific to the uploaded resume, not generic defaults.
- Prefer role phrases like "software engineering intern," "data analyst intern," "meteorology intern," "math tutor," or "marketing analytics intern" depending on the resume.

JSON QUALITY RULES:
- Each of the four main section objects must contain the key "intro".
- The four main section objects should not include highImpact, mediumImpact, recruiterInsight, or outcome.
- The intro value must be the full polished paragraph for that section.
- careerPaths must contain 3 to 5 strings.
- jobKeywords must contain 4 to 8 strings.
- recommendedSearchTerms must contain 3 to 6 strings.
- recommendations must contain exactly 3 strings.
- additionalNotes should be an empty string if there are no meaningful additional notes.
- Keep the response useful and specific, but do not make the section paragraphs huge.
- Return only valid JSON.

Uploaded text:
${resumeText}
`;

    const response = await client.responses.create({
      model: "gpt-5.4",
      input: prompt,
    });

    const rawText = response.output_text.trim();
    console.log("OpenAI raw output:", rawText);

    let parsed;
    try {
      parsed = JSON.parse(rawText);
      parsed = enrichResumeAnalysis(parsed, resumeText);
      console.log("PARSED AI JSON:", JSON.stringify(parsed, null, 2));
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return res.status(500).json({
        error: "AI returned invalid JSON",
        raw: rawText,
      });
    }

    const requiredSectionKeys = [
      "overallImpression",
      "contentAndRelevance",
      "formattingAndVisualAppeal",
      "languageAndProfessionalism",
    ];

    if (parsed?.isResume === true) {
      const missingSections = requiredSectionKeys.filter((key) => {
        const section = parsed[key];
        return !section || typeof section !== "object";
      });

      if (missingSections.length > 0) {
        console.error(
          "AI response missing required sections:",
          missingSections,
        );
        return res.status(500).json({
          error: "AI response missing required resume sections",
          missingSections,
          raw: parsed,
        });
      }
    }

    res.json(parsed);
  } catch (error) {
    console.error("FULL SERVER ERROR:", error);

    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: "Failed to analyze resume",
      details: error?.message || "Unknown error",
    });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
