import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import OpenAI from 'openai';

import { PDFParse } from 'pdf-parse';
import { CanvasFactory } from 'pdf-parse/worker';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ADZUNA_API_URL = 'https://api.adzuna.com/v1/api';
const ADZUNA_COUNTRY = process.env.ADZUNA_COUNTRY || 'us';
const GREENHOUSE_BOARDS = (process.env.GREENHOUSE_BOARDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const LEVER_BOARDS = (process.env.LEVER_BOARDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const JOB_CACHE_TTL_MS = 1000 * 60 * 20;
const jobCache = new Map();

function asCleanString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function toTitleCase(value) {
  return asCleanString(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeForDedupe(value = '') {
  return asCleanString(value)
    .toLowerCase()
    .replace(/\b(internship|intern|co-op|coop|remote|hybrid|full-time|full time|part-time|part time)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getJobDedupeKey(job) {
  const company = normalizeForDedupe(job?.company || '');
  const title = normalizeForDedupe(job?.title || '');
  const remoteStatus = isRemoteJob(job) ? 'remote' : 'onsite';
  const internshipStatus = isInternshipJob(job) ? 'intern' : 'standard';

  return `${company}-${title}-${remoteStatus}-${internshipStatus}`;
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

function buildFitLabel(searchQuery, haystack) {
  const normalizedQuery = asCleanString(searchQuery).toLowerCase();
  if (!normalizedQuery) return 'Good Match';

  if (haystack.includes(normalizedQuery)) {
    return 'High Match';
  }

  if (
    normalizedQuery
      .split(/\s+/)
      .some((word) => word.length > 2 && haystack.includes(word))
  ) {
    return 'Potential Match';
  }

  return 'Good Match';
}

function matchesSearchText(search = '', haystack = '') {
  const normalizedSearch = asCleanString(search).toLowerCase();
  const normalizedHaystack = asCleanString(haystack).toLowerCase();

  if (!normalizedSearch) return true;
  if (normalizedHaystack.includes(normalizedSearch)) return true;

  const words = normalizedSearch
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);

  if (words.length === 0) return true;

  const matchedWords = words.filter((word) => normalizedHaystack.includes(word));
  return matchedWords.length >= Math.min(2, words.length);
}

function isInternshipJob(job) {
  const haystack = `${job.title} ${job.company} ${job.location} ${job.type} ${job.description || ''}`.toLowerCase();

  return (
    haystack.includes('intern') ||
    haystack.includes('internship') ||
    haystack.includes('co-op') ||
    haystack.includes('coop') ||
    haystack.includes('student') ||
    haystack.includes('summer intern')
  );
}

function isRemoteJob(job) {
  const haystack = `${job.title} ${job.company} ${job.location} ${job.type} ${job.description || ''}`.toLowerCase();

  return (
    haystack.includes('remote') ||
    haystack.includes('work from home') ||
    haystack.includes('wfh') ||
    haystack.includes('hybrid')
  );
}

function normalizeAdzunaJob(job, searchQuery = '') {
  const title = asCleanString(job?.title, 'Untitled Role');
  const company = asCleanString(job?.company?.display_name, 'Unknown Company');
  const location = asCleanString(
    job?.location?.display_name || job?.location?.area?.join(', '),
    'Location not specified'
  );
  const type = toTitleCase(job?.contract_type || job?.contract_time || 'Role');
  const description = asCleanString(job?.description);
  const haystack = `${title} ${company} ${description}`.toLowerCase();

  return {
    id: job?.id ? String(job.id) : undefined,
    title,
    company,
    location,
    type,
    fit: buildFitLabel(searchQuery, haystack),
    applyUrl: asCleanString(job?.redirect_url || job?.adref) || undefined,
    source: 'Adzuna',
    description,
  };
}

function normalizeGreenhouseJob(job, boardToken, searchQuery = '') {
  const title = asCleanString(job?.title, 'Untitled Role');
  const company = toTitleCase(boardToken.replace(/[-_]+/g, ' ')) || 'Greenhouse Company';
  const location = asCleanString(job?.location?.name, 'Location not specified');
  const metadataText = Array.isArray(job?.metadata)
    ? job.metadata
        .flatMap((item) => [item?.name, item?.value])
        .filter(Boolean)
        .join(' ')
    : '';
  const haystack = `${title} ${company} ${location} ${metadataText}`.toLowerCase();

  return {
    id: job?.id ? `greenhouse-${job.id}` : undefined,
    title,
    company,
    location,
    type: 'Role',
    fit: buildFitLabel(searchQuery, haystack),
    applyUrl:
      asCleanString(job?.absolute_url || `https://boards.greenhouse.io/${boardToken}/jobs/${job?.id}`) ||
      undefined,
    source: 'Greenhouse',
  };
}

function normalizeLeverJob(job, site, searchQuery = '') {
  const title = asCleanString(job?.text, 'Untitled Role');
  const company = toTitleCase(site.replace(/[-_]+/g, ' ')) || 'Lever Company';
  const location = asCleanString(job?.categories?.location, 'Location not specified');
  const type = asCleanString(job?.categories?.commitment, 'Role');
  const description = asCleanString(job?.descriptionPlain || job?.description);
  const haystack = `${title} ${company} ${location} ${type} ${description}`.toLowerCase();

  return {
    id: job?.id ? `lever-${job.id}` : undefined,
    title,
    company,
    location,
    type,
    fit: buildFitLabel(searchQuery, haystack),
    applyUrl: asCleanString(job?.hostedUrl || `https://jobs.lever.co/${site}/${job?.id}`) || undefined,
    source: 'Lever',
    description,
  };
}

function buildRecommendedRoles(jobs) {
  const keywordRules = [
    {
      label: 'Software Engineering Intern',
      reason:
        'These roles emphasize coding, software development, and technical problem-solving, which align well with a computer science student profile.',
      keywords: ['software engineer', 'software development', 'backend', 'frontend', 'full stack', 'developer'],
    },
    {
      label: 'Frontend / Full-Stack Intern',
      reason:
        'These openings focus on application development and product-facing engineering work, which can be a strong fit for project-based technical experience.',
      keywords: ['frontend', 'front-end', 'full stack', 'full-stack', 'react', 'web'],
    },
    {
      label: 'Data / Analytics Intern',
      reason:
        'These roles may be relevant if the resume includes programming, analytical thinking, and data-oriented coursework or projects.',
      keywords: ['data', 'analytics', 'machine learning', 'python', 'sql'],
    },
  ];

  const matchedRoles = keywordRules.filter((rule) =>
    jobs.some((job) => {
      const haystack = `${job.title} ${job.company} ${job.type}`.toLowerCase();
      return rule.keywords.some((keyword) => haystack.includes(keyword));
    })
  );

  return (matchedRoles.length > 0 ? matchedRoles : keywordRules.slice(0, 3))
    .slice(0, 3)
    .map((role) => ({
      title: role.label,
      reason: role.reason,
    }));
}

function normalizeStringList(value, { max = 8 } = {}) {
  const cleaned = Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    : [];

  return Array.from(new Set(cleaned)).slice(0, max);
}

function inferResumeJobProfile(resumeText = '') {
  const lowerText = asCleanString(resumeText).toLowerCase();

  const domainRules = [
    {
      match: /(meteorology|atmospheric science|atmospheric|weather|climate|forecast|gis|environmental science)/i,
      careerPaths: [
        'Meteorology Intern',
        'Atmospheric Science Intern',
        'Climate Data Analyst',
        'Weather Research Assistant',
      ],
      jobKeywords: [
        'meteorology',
        'atmospheric science',
        'weather',
        'climate',
        'forecasting',
        'environmental data',
        'gis',
      ],
      recommendedSearchTerms: [
        'meteorology intern',
        'atmospheric science intern',
        'weather analyst intern',
        'climate research assistant',
        'gis analyst',
      ],
    },
    {
      match: /(computer science|software|java|python|c\+\+|react|frontend|backend|full stack|web development|programming)/i,
      careerPaths: [
        'Software Engineering Intern',
        'Frontend / Full-Stack Intern',
        'Data / Analytics Intern',
      ],
      jobKeywords: [
        'software engineering',
        'frontend',
        'backend',
        'full stack',
        'python',
        'java',
        'data analysis',
      ],
      recommendedSearchTerms: [
        'software engineer intern',
        'frontend developer intern',
        'full stack developer intern',
        'backend developer intern',
        'data analyst intern',
      ],
    },
    {
      match: /(data science|statistics|analytics|sql|machine learning|business analytics|data analysis)/i,
      careerPaths: [
        'Data Analyst Intern',
        'Business Analytics Intern',
        'Research / Data Assistant',
      ],
      jobKeywords: [
        'data analysis',
        'analytics',
        'statistics',
        'sql',
        'machine learning',
        'reporting',
      ],
      recommendedSearchTerms: [
        'data analyst intern',
        'business analyst intern',
        'analytics intern',
        'research data assistant',
      ],
    },
    {
      match: /(biology|biological|biochemistry|biomedical|microbiology|genetics|neuroscience|life science)/i,
      careerPaths: [
        'Biology Research Assistant',
        'Laboratory Intern',
        'Clinical Research Intern',
      ],
      jobKeywords: [
        'biology',
        'laboratory',
        'research',
        'clinical research',
        'life sciences',
      ],
      recommendedSearchTerms: [
        'biology research assistant',
        'laboratory intern',
        'clinical research intern',
        'life sciences intern',
      ],
    },
    {
      match: /(pharmacy|pharmaceutical|pharmacology|pre-pharmacy|medication)/i,
      careerPaths: [
        'Pharmacy Intern',
        'Pharmaceutical Research Assistant',
        'Clinical Support Intern',
      ],
      jobKeywords: [
        'pharmacy',
        'pharmaceutical',
        'clinical support',
        'medication',
        'healthcare',
      ],
      recommendedSearchTerms: [
        'pharmacy intern',
        'pharmaceutical intern',
        'clinical support intern',
        'healthcare intern',
      ],
    },
    {
      match: /(marketing|communications|public relations|branding|social media|advertising)/i,
      careerPaths: [
        'Marketing Intern',
        'Communications Intern',
        'Social Media Intern',
      ],
      jobKeywords: [
        'marketing',
        'communications',
        'branding',
        'social media',
        'content',
      ],
      recommendedSearchTerms: [
        'marketing intern',
        'communications intern',
        'social media intern',
        'content marketing intern',
      ],
    },
    {
      match: /(finance|accounting|economics|investment|financial analysis|banking)/i,
      careerPaths: [
        'Finance Intern',
        'Accounting Intern',
        'Financial Analyst Intern',
      ],
      jobKeywords: [
        'finance',
        'accounting',
        'financial analysis',
        'economics',
        'banking',
      ],
      recommendedSearchTerms: [
        'finance intern',
        'accounting intern',
        'financial analyst intern',
        'banking intern',
      ],
    },
    {
      match: /(psychology|mental health|counseling|human services|behavioral)/i,
      careerPaths: [
        'Psychology Research Assistant',
        'Behavioral Health Intern',
        'Human Services Intern',
      ],
      jobKeywords: [
        'psychology',
        'mental health',
        'behavioral health',
        'research',
        'human services',
      ],
      recommendedSearchTerms: [
        'psychology research assistant',
        'behavioral health intern',
        'human services intern',
        'mental health intern',
      ],
    },
  ];

  const matchedRule = domainRules.find((rule) => rule.match.test(lowerText));
  if (matchedRule) {
    return {
      careerPaths: matchedRule.careerPaths,
      jobKeywords: matchedRule.jobKeywords,
      recommendedSearchTerms: matchedRule.recommendedSearchTerms,
    };
  }

  const matchedKeywordPool = uniqueNonEmptyStrings(
    [
      ...(lowerText.includes('research') ? ['research assistant'] : []),
      ...(lowerText.includes('lab') || lowerText.includes('laboratory') ? ['laboratory assistant'] : []),
      ...(lowerText.includes('analysis') || lowerText.includes('analyst') ? ['analyst'] : []),
      ...(lowerText.includes('design') ? ['design intern'] : []),
      ...(lowerText.includes('education') || lowerText.includes('teaching') || lowerText.includes('tutor')
        ? ['tutor', 'teaching assistant']
        : []),
    ],
    5
  );

  return {
    careerPaths: matchedKeywordPool.length > 0 ? matchedKeywordPool.map((term) => toTitleCase(term)) : ['General Internship', 'Research Assistant', 'Entry-Level Analyst'],
    jobKeywords: matchedKeywordPool.length > 0 ? matchedKeywordPool : ['internship', 'research', 'analysis'],
    recommendedSearchTerms:
      matchedKeywordPool.length > 0
        ? matchedKeywordPool.map((term) => (term.includes('intern') || term.includes('assistant') ? term : `${term} intern`))
        : ['internship', 'research assistant', 'entry level analyst'],
  };
}

function enrichResumeAnalysis(parsed, resumeText = '') {
  if (!parsed || parsed.isResume !== true) {
    return parsed;
  }

  const fallbackProfile = inferResumeJobProfile(resumeText);

  const careerPaths = normalizeStringList(parsed.careerPaths, { max: 5 });
  const jobKeywords = normalizeStringList(parsed.jobKeywords, { max: 8 });
  const recommendedSearchTerms = normalizeStringList(parsed.recommendedSearchTerms, { max: 6 });

  return {
    ...parsed,
    careerPaths: careerPaths.length > 0 ? careerPaths : fallbackProfile.careerPaths,
    jobKeywords: jobKeywords.length > 0 ? jobKeywords : fallbackProfile.jobKeywords,
    recommendedSearchTerms:
      recommendedSearchTerms.length > 0
        ? recommendedSearchTerms
        : fallbackProfile.recommendedSearchTerms,
  };
}

function uniqueNonEmptyStrings(values, max = 10) {
  return Array.from(
    new Set(
      values
        .map((value) => asCleanString(value))
        .filter(Boolean)
    )
  ).slice(0, max);
}

function buildSearchVariants(baseQuery = '', filter = 'All') {
  const normalized = asCleanString(baseQuery).toLowerCase();

  if (!normalized) {
    return filter === 'All'
      ? ['internship', 'entry level analyst', 'research assistant']
      : filter === 'Internship'
      ? ['internship', 'research assistant']
      : ['remote internship', 'remote analyst', 'hybrid analyst'];
  }

  const variants = [normalized];

  if (/(meteorology|atmospheric|weather|climate|forecast|gis|environmental)/i.test(normalized)) {
    variants.push(
      'meteorology intern',
      'atmospheric science intern',
      'weather intern',
      'climate data analyst',
      'environmental data analyst',
      'gis analyst'
    );
  } else if (/(software|computer science|frontend|backend|full stack|developer|engineer|python|java|react|c\+\+)/i.test(normalized)) {
    variants.push(
      'software engineer intern',
      'software developer intern',
      'frontend developer intern',
      'backend developer intern',
      'data analyst intern'
    );
  } else if (/(data|analytics|statistics|sql|machine learning|business analytics)/i.test(normalized)) {
    variants.push(
      'data analyst intern',
      'analytics intern',
      'business analyst intern',
      'research data assistant'
    );
  } else if (/(biology|biological|biochemistry|biomedical|microbiology|genetics|neuroscience|life science)/i.test(normalized)) {
    variants.push(
      'biology research assistant',
      'laboratory intern',
      'clinical research intern'
    );
  } else if (/(pharmacy|pharmaceutical|pharmacology|medication|clinical support)/i.test(normalized)) {
    variants.push(
      'pharmacy intern',
      'pharmaceutical intern',
      'clinical support intern'
    );
  } else if (/(marketing|communications|branding|social media|content)/i.test(normalized)) {
    variants.push(
      'marketing intern',
      'communications intern',
      'social media intern'
    );
  } else if (/(finance|accounting|economics|financial|banking)/i.test(normalized)) {
    variants.push(
      'finance intern',
      'accounting intern',
      'financial analyst intern'
    );
  } else if (/(psychology|mental health|counseling|behavioral|human services)/i.test(normalized)) {
    variants.push(
      'psychology research assistant',
      'behavioral health intern',
      'human services intern'
    );
  }

  const cleaned = uniqueNonEmptyStrings(variants, 6);

  if (filter === 'Internship') {
    return uniqueNonEmptyStrings(
      cleaned.flatMap((term) => [
        term.includes('intern') ? term : `${term} intern`,
        term.includes('internship') ? term : `${term} internship`,
      ]),
      6
    );
  }

  if (filter === 'Remote') {
    return uniqueNonEmptyStrings(
      cleaned.flatMap((term) => [
        term.includes('remote') ? term : `remote ${term}`,
        `hybrid ${term}`,
      ]),
      6
    );
  }

  return cleaned;
}

function buildRoleRecommendationsFromCareerPaths(careerPaths = []) {
  return uniqueNonEmptyStrings(careerPaths, 5).map((path) => ({
    title: path,
    reason: 'This role is being recommended based on the uploaded resume and detected career direction.',
  }));
}

function buildRecommendedSearchInputs({ searchTerms = [], careerPaths = [], jobKeywords = [] } = {}) {
  const baseTerms = uniqueNonEmptyStrings([...searchTerms, ...careerPaths, ...jobKeywords], 5);

  if (baseTerms.length === 0) {
    return {
      searchTerms: ['software engineer intern', 'data analyst intern'],
      primaryQuery: 'software engineer intern',
    };
  }

  const expandedTerms = uniqueNonEmptyStrings(
    baseTerms.flatMap((term) => buildSearchVariants(term, 'Internship')),
    6
  );

  return {
    searchTerms: expandedTerms.length > 0 ? expandedTerms : baseTerms,
    primaryQuery: expandedTerms[0] || baseTerms[0],
  };
}

async function fetchAdzunaJobs({ search = '', location = '', page = 1, resultsPerPage = 50 } = {}) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    throw new Error('Missing Adzuna credentials in environment variables');
  }

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(resultsPerPage),
    'content-type': 'application/json',
  });

  if (search) params.append('what', search);
  if (location) params.append('where', location);

  const response = await fetch(
    `${ADZUNA_API_URL}/jobs/${ADZUNA_COUNTRY}/search/${page}?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(`Adzuna request failed with status ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data?.results) ? data.results : [];
}

async function fetchAdzunaJobsForQueries({
  queries = [],
  location = '',
  page = 1,
  resultsPerPage = 50,
} = {}) {
  const safeQueries = uniqueNonEmptyStrings(queries, 5);

  const settled = await Promise.allSettled(
    safeQueries.map((search) => fetchAdzunaJobs({ search, location, page, resultsPerPage }))
  );

  return settled
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value);
}

async function fetchGreenhouseJobs({ search = '', location = '' } = {}) {
  if (GREENHOUSE_BOARDS.length === 0) return [];

  const responses = await Promise.all(
    GREENHOUSE_BOARDS.map(async (boardToken) => {
      const response = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`
      );
      if (!response.ok) return [];
      const data = await response.json();
      const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
      return jobs.map((job) => normalizeGreenhouseJob(job, boardToken, search));
    })
  );

  return responses.flat().filter((job) => {
    const haystack = `${job.title} ${job.company} ${job.location} ${job.type}`.toLowerCase();
    const matchesSearch = matchesSearchText(search, haystack);
    const matchesLocation =
      !location || job.location.toLowerCase().includes(location.toLowerCase());
    return matchesSearch && matchesLocation;
  });
}

async function fetchLeverJobs({ search = '', location = '' } = {}) {
  if (LEVER_BOARDS.length === 0) return [];

  const responses = await Promise.all(
    LEVER_BOARDS.map(async (site) => {
      const response = await fetch(`https://api.lever.co/v0/postings/${site}?mode=json`);
      if (!response.ok) return [];
      const data = await response.json();
      const jobs = Array.isArray(data) ? data : [];
      return jobs.map((job) => normalizeLeverJob(job, site, search));
    })
  );

  return responses.flat().filter((job) => {
    const haystack = `${job.title} ${job.company} ${job.location} ${job.type} ${job.description || ''}`.toLowerCase();
    const matchesSearch = matchesSearchText(search, haystack);
    const matchesLocation =
      !location || job.location.toLowerCase().includes(location.toLowerCase());
    return matchesSearch && matchesLocation;
  });
}

function mergeAndDedupeJobs(jobLists) {
  const merged = jobLists.flat().filter((job) => job && job.title && job.company);
  const deduped = new Map();

  for (const job of merged) {
    const key = getJobDedupeKey(job);

    if (!key || key === '-') continue;

    if (!deduped.has(key)) {
      deduped.set(key, job);
      continue;
    }

    const existing = deduped.get(key);
    const existingHasApplyUrl = Boolean(existing?.applyUrl);
    const nextHasApplyUrl = Boolean(job?.applyUrl);

    if (!existingHasApplyUrl && nextHasApplyUrl) {
      deduped.set(key, job);
    }
  }

  return Array.from(deduped.values());
}

function applyJobFilters(jobs, { search = '', location = '', filter = 'All' } = {}) {
  return jobs.filter((job) => {
    const haystack = `${job.title} ${job.company} ${job.location} ${job.type} ${job.description || ''}`.toLowerCase();
    const matchesSearch = matchesSearchText(search, haystack);
    const matchesLocation =
      !location || job.location.toLowerCase().includes(location.toLowerCase());

    const matchesFilter =
      filter === 'All' ||
      (filter === 'Internship' && isInternshipJob(job)) ||
      (filter === 'Remote' && isRemoteJob(job));

    return matchesSearch && matchesLocation && matchesFilter;
  });
}

app.get('/jobs/recommended', async (req, res) => {
  try {
    const searchTermsParam = asCleanString(req.query.searchTerms);
    const careerPathsParam = asCleanString(req.query.careerPaths);
    const jobKeywordsParam = asCleanString(req.query.jobKeywords);

    const cacheKey = getCacheKey('recommended', {
      searchTerms: searchTermsParam.toLowerCase(),
      careerPaths: careerPathsParam.toLowerCase(),
      jobKeywords: jobKeywordsParam.toLowerCase(),
    });

    const cachedResponse = getCachedValue(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    const rawSearchTerms = searchTermsParam
      ? searchTermsParam
          .split(',')
          .map((term) => term.trim())
          .filter(Boolean)
      : [];

    const careerPaths = careerPathsParam
      ? uniqueNonEmptyStrings(
          careerPathsParam
            .split(',')
            .map((term) => term.trim())
            .filter(Boolean),
          5
        )
      : [];

    const jobKeywords = jobKeywordsParam
      ? uniqueNonEmptyStrings(
          jobKeywordsParam
            .split(',')
            .map((term) => term.trim())
            .filter(Boolean),
          8
        )
      : [];

    const { searchTerms, primaryQuery } = buildRecommendedSearchInputs({
      searchTerms: rawSearchTerms,
      careerPaths,
      jobKeywords,
    });

    const adzunaRawJobs = await fetchAdzunaJobsForQueries({
      queries: searchTerms.slice(0, 4),
      resultsPerPage: 18,
    });

    const [greenhouseResult, leverResult] = await Promise.allSettled([
      fetchGreenhouseJobs({ search: primaryQuery || 'intern' }),
      fetchLeverJobs({ search: primaryQuery || 'intern' }),
    ]);

    const greenhouseJobs = greenhouseResult.status === 'fulfilled' ? greenhouseResult.value : [];
    const leverJobs = leverResult.status === 'fulfilled' ? leverResult.value : [];

    const adzunaJobs = adzunaRawJobs.map((job) =>
      normalizeAdzunaJob(job, primaryQuery || 'intern')
    );

    const mergedJobs = mergeAndDedupeJobs([adzunaJobs, greenhouseJobs, leverJobs]);

    const recommendedJobs = applyJobFilters(mergedJobs, {
      filter: 'Internship',
    })
      .filter((job) => job.applyUrl)
      .slice(0, 30);

    const roles =
      careerPaths.length > 0
        ? buildRoleRecommendationsFromCareerPaths(careerPaths)
        : recommendedJobs.length > 0
        ? buildRecommendedRoles(recommendedJobs)
        : buildRoleRecommendationsFromCareerPaths(rawSearchTerms);

    const responsePayload = {
      roles,
      jobs: recommendedJobs,
      searchTerms,
      primaryQuery,
    };

    setCachedValue(cacheKey, responsePayload);
    res.json(responsePayload);
  } catch (error) {
    console.error('RECOMMENDED JOBS ERROR:', error);
    res.status(500).json({
      error: 'Failed to load recommended jobs',
      details: error?.message || 'Unknown error',
    });
  }
});

app.get('/jobs/search', async (req, res) => {
  try {
    const query = asCleanString(req.query.query);
    const location = asCleanString(req.query.location);
    const filter = asCleanString(req.query.filter, 'All');
    const page = Number.parseInt(asCleanString(req.query.page, '1'), 10) || 1;
    const searchTermsParam = asCleanString(req.query.searchTerms);

    const cacheKey = getCacheKey('search', {
      query: query.toLowerCase(),
      location: location.toLowerCase(),
      filter,
      page,
      searchTerms: searchTermsParam.toLowerCase(),
    });

    const cachedResponse = getCachedValue(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    const requestedSearchTerms = searchTermsParam
      ? uniqueNonEmptyStrings(
          searchTermsParam
            .split(',')
            .map((term) => term.trim())
            .filter(Boolean),
          5
        )
      : [];

    const baseSeedTerms =
      requestedSearchTerms.length > 0
        ? requestedSearchTerms.slice(0, 3)
        : query
        ? [query]
        : ['software engineer'];

    const searchQueries = uniqueNonEmptyStrings(
      baseSeedTerms.flatMap((term) => buildSearchVariants(term, filter)),
      6
    );

    let adzunaRawJobs = await fetchAdzunaJobsForQueries({
      queries: searchQueries,
      location,
      page,
      resultsPerPage: 25,
    });

    if (adzunaRawJobs.length === 0 && filter !== 'All') {
      const relaxedQueries = uniqueNonEmptyStrings(
        baseSeedTerms.flatMap((term) => buildSearchVariants(term, 'All')),
        4
      );

      adzunaRawJobs = await fetchAdzunaJobsForQueries({
        queries: relaxedQueries,
        location,
        page,
        resultsPerPage: 15,
      });
    }

    const boardSearch = query || searchQueries[0] || requestedSearchTerms[0] || 'intern';

    const [greenhouseJobs, leverJobs] = await Promise.all([
      fetchGreenhouseJobs({ search: boardSearch, location }),
      fetchLeverJobs({ search: boardSearch, location }),
    ]);

    const adzunaJobs = adzunaRawJobs.map((job) =>
      normalizeAdzunaJob(job, boardSearch)
    );

    const mergedJobs = mergeAndDedupeJobs([adzunaJobs, greenhouseJobs, leverJobs]);

    const relaxedSearch = query || requestedSearchTerms[0] || searchQueries[0] || '';

    let jobs = applyJobFilters(mergedJobs, {
      search: relaxedSearch,
      location,
      filter,
    });

    if (jobs.length === 0 && filter !== 'All') {
      jobs = applyJobFilters(mergedJobs, {
        search: '',
        location,
        filter,
      });
    }

    jobs = jobs.slice(0, 50);

    const responsePayload = {
      jobs,
      page,
      filter,
      searchQueries,
      totalFetched: mergedJobs.length,
    };

    setCachedValue(cacheKey, responsePayload);
    res.json(responsePayload);
  } catch (error) {
    console.error('SEARCH JOBS ERROR:', error);
    res.status(500).json({
      error: 'Failed to search jobs',
      details: error?.message || 'Unknown error',
    });
  }
});

app.post('/analyze-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Resume PDF is required' });
    }

    console.log('Uploaded file:', req.file.originalname);

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
        error: 'Could not extract text from PDF',
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
  "overallImpression": {
    "intro": "string"
  },
  "contentAndRelevance": {
    "intro": "string"
  },
  "formattingAndVisualAppeal": {
    "intro": "string"
  },
  "languageAndProfessionalism": {
    "intro": "string"
  },
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

RESUME TIER RULES:
- Gold = 85 to 100
- Silver = 70 to 84
- Bronze = below 70
- Resume tier must be based on the overall score

VERY IMPORTANT RULES:
- The total score must equal the sum of the 5 category scores
- Total score must be out of 100
- Use realistic scoring, not inflated scoring
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

STYLE EXAMPLE TO FOLLOW:
Overall Impression:
Your resume has a solid structure and is easy to follow. It clearly reflects strong academic achievement and dedication, particularly through your consistent academic performance and honors distinctions. With further refinement to the structure and organization, the resume can become even stronger and more strategically aligned with your long-term career goal.

Content and Relevance:
Your resume reflects a strong academic background, which is highly important and well aligned with your long-term goal. I recommend adding relevant coursework under your Education section to better represent your academic progress and showcase advanced or field-specific classes you complete. You may also consider removing older or less relevant experiences to free up space for more recent achievements and college-level experiences. While your prior work experience demonstrates strong responsibility and transferable skills, I recommend quantifying your bullet points wherever possible. Adding measurable details will make your accomplishments more precise and impactful.

Formatting and Visual Appeal:
Your resume has a solid structure and layout. However, I have a few recommendations to strengthen its presentation. I recommend keeping all dates consistently aligned to the right throughout the resume to improve visual balance and readability. You may also consider placing your most relevant sections closer to the top to better emphasize your strongest qualifications. Additionally, simplifying lengthy lines and removing unnecessary details can reduce clutter and make the resume easier to skim.

Language and Professionalism:
Your bullet points effectively communicate your responsibilities and demonstrate a strong work ethic. However, I recommend strengthening them by using a more structured approach: begin with a strong action verb, clearly state the task performed, highlight the transferable skill applied, and conclude with a measurable outcome when possible. This will make your experiences more precise and impactful.

Recommendations:
1. Seek opportunities or experiences that directly align with the student's long-term career goal.
2. Refine the Education or Skills section so the most relevant academic and technical strengths are easier to identify.
3. Incorporate measurable outcomes and field-specific details throughout the resume where applicable.

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

Overall Impression:
- Guiding question: How does the resume look at first glance? Is it balanced and professional?
- Write one polished paragraph of 3 to 5 sentences.
- Start positive, then mention the main structural or strategic improvement.
- Focus on first-glance professionalism, balance, organization, and whether the resume feels ready for internships, jobs, or academic opportunities.

Content and Relevance:
- Guiding question: Do the experiences and skills align with the student's career goals? Are accomplishments quantified when possible?
- Write one polished paragraph of 4 to 7 sentences.
- Discuss alignment with the student's likely career direction, relevant coursework, projects, work experience, leadership, skills, and quantification.
- Mention missing or underdeveloped sections if applicable.
- Recommend specific additions or removals based on the resume.

Formatting and Visual Appeal:
- Guiding question: Is the format consistent? Is it easy to skim? Are the sections well-organized?
- Write one polished paragraph of 3 to 6 sentences.
- Discuss spacing, alignment, margins, section order, date placement, ATS-friendliness, contact information, and readability when relevant.
- Make the feedback practical and student-friendly.

Language and Professionalism:
- Guiding question: Are strong action verbs used? Is the language industry appropriate? Are there unnecessary fillers?
- Write one polished paragraph of 3 to 5 sentences.
- Discuss action verbs, bullet structure, clarity, specificity, professional tone, and measurable outcomes.
- Encourage the structure: action verb + task performed + transferable skill or tool used + measurable outcome when possible.

Recommendations:
- Provide exactly 3 strings.
- Each recommendation should be a complete sentence or two, not a short fragment.
- The recommendations should be the highest-impact next steps for the student.
- Do not repeat the exact same advice from the paragraphs word-for-word, but it can reinforce the main themes.

Additional Notes:
- Only include meaningful additional notes.
- If there are no major additional notes, return an empty string for additionalNotes.
- Do not force unnecessary comments.

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
      model: 'gpt-5.4',
      input: prompt,
    });

    const rawText = response.output_text.trim();
    console.log('OpenAI raw output:', rawText);

    let parsed;
    try {
      parsed = JSON.parse(rawText);
      parsed = enrichResumeAnalysis(parsed, resumeText);
      console.log('PARSED AI JSON:', JSON.stringify(parsed, null, 2));
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return res.status(500).json({
        error: 'AI returned invalid JSON',
        raw: rawText,
      });
    }

    const requiredSectionKeys = [
      'overallImpression',
      'contentAndRelevance',
      'formattingAndVisualAppeal',
      'languageAndProfessionalism',
    ];

    if (parsed?.isResume === true) {
      const missingSections = requiredSectionKeys.filter((key) => {
        const section = parsed[key];
        return !section || typeof section !== 'object';
      });

      if (missingSections.length > 0) {
        console.error('AI response missing required sections:', missingSections);
        return res.status(500).json({
          error: 'AI response missing required resume sections',
          missingSections,
          raw: parsed,
        });
      }
    }

    res.json(parsed);
  } catch (error) {
    console.error('FULL SERVER ERROR:', error);

    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Failed to analyze resume',
      details: error?.message || 'Unknown error',
    });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
