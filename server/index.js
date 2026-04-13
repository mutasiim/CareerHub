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

function asCleanString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function toTitleCase(value) {
  return asCleanString(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildFitLabel(searchQuery, haystack) {
  const normalizedQuery = asCleanString(searchQuery).toLowerCase();
  if (!normalizedQuery) return 'Good Match';

  if (haystack.includes(normalizedQuery)) {
    return 'High Match';
  }

  if (normalizedQuery.split(/\s+/).some((word) => word.length > 2 && haystack.includes(word))) {
    return 'Potential Match';
  }

  return 'Good Match';
}

function normalizeAdzunaJob(job, searchQuery = '') {
  const title = asCleanString(job?.title, 'Untitled Role');
  const company = asCleanString(job?.company?.display_name, 'Unknown Company');
  const location = asCleanString(job?.location?.display_name || job?.location?.area?.join(', '), 'Location not specified');
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
    applyUrl: asCleanString(job?.absolute_url || `https://boards.greenhouse.io/${boardToken}/jobs/${job?.id}`) || undefined,
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

  return (matchedRoles.length > 0 ? matchedRoles : keywordRules.slice(0, 3)).slice(0, 3).map((role) => ({
    title: role.label,
    reason: role.reason,
  }));
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

  const response = await fetch(`${ADZUNA_API_URL}/jobs/${ADZUNA_COUNTRY}/search/${page}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Adzuna request failed with status ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data?.results) ? data.results : [];
}

async function fetchGreenhouseJobs({ search = '', location = '' } = {}) {
  if (GREENHOUSE_BOARDS.length === 0) return [];

  const responses = await Promise.all(
    GREENHOUSE_BOARDS.map(async (boardToken) => {
      const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`);
      if (!response.ok) return [];
      const data = await response.json();
      const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
      return jobs.map((job) => normalizeGreenhouseJob(job, boardToken, search));
    })
  );

  return responses.flat().filter((job) => {
    const matchesSearch = !search || `${job.title} ${job.company}`.toLowerCase().includes(search.toLowerCase());
    const matchesLocation = !location || job.location.toLowerCase().includes(location.toLowerCase());
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
    const matchesSearch = !search || `${job.title} ${job.company}`.toLowerCase().includes(search.toLowerCase());
    const matchesLocation = !location || job.location.toLowerCase().includes(location.toLowerCase());
    return matchesSearch && matchesLocation;
  });
}

function mergeAndDedupeJobs(jobLists) {
  const merged = jobLists.flat().filter((job) => job && job.title && job.company);

  return Array.from(
    new Map(
      merged.map((job) => [job.applyUrl || `${job.title}-${job.company}-${job.location}`, job])
    ).values()
  );
}

function applyJobFilters(jobs, { search = '', location = '', filter = 'All' } = {}) {
  return jobs.filter((job) => {
    const haystack = `${job.title} ${job.company} ${job.location} ${job.type} ${job.description || ''}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search.toLowerCase());
    const matchesLocation = !location || job.location.toLowerCase().includes(location.toLowerCase());
    const filterHaystack = `${job.title} ${job.type} ${job.location} ${job.description || ''}`.toLowerCase();
    const matchesFilter =
      filter === 'All' ||
      (filter === 'Internship' && (filterHaystack.includes('intern') || filterHaystack.includes('internship'))) ||
      (filter === 'Remote' && (filterHaystack.includes('remote') || filterHaystack.includes('work from home') || filterHaystack.includes('hybrid')));

    return matchesSearch && matchesLocation && matchesFilter;
  });
}

app.get('/jobs/recommended', async (req, res) => {
  try {
    const searches = [
      'software engineer intern',
      'software developer intern',
      'frontend developer intern',
      'full stack developer intern',
      'data analyst intern',
      'python intern',
      'remote software intern',
    ];

    const adzunaResults = await Promise.allSettled(
      searches.map((search) => fetchAdzunaJobs({ search, resultsPerPage: 24 }))
    );

    const successfulAdzunaJobs = adzunaResults
      .filter((result) => result.status === 'fulfilled')
      .flatMap((result) => result.value)
      .map((job) => normalizeAdzunaJob(job));

    const [greenhouseResult, leverResult] = await Promise.allSettled([
      fetchGreenhouseJobs({ search: 'intern' }),
      fetchLeverJobs({ search: 'intern' }),
    ]);

    const greenhouseJobs = greenhouseResult.status === 'fulfilled' ? greenhouseResult.value : [];
    const leverJobs = leverResult.status === 'fulfilled' ? leverResult.value : [];

    const mergedJobs = mergeAndDedupeJobs([
      successfulAdzunaJobs,
      greenhouseJobs,
      leverJobs,
    ]);

    const recommendedJobs = mergedJobs
      .filter((job) => {
        const text = `${job.title} ${job.type} ${job.location} ${job.description || ''}`.toLowerCase();
        return (
          text.includes('intern') ||
          text.includes('internship') ||
          text.includes('software') ||
          text.includes('frontend') ||
          text.includes('full stack') ||
          text.includes('developer') ||
          text.includes('engineer') ||
          text.includes('analyst') ||
          text.includes('data') ||
          text.includes('python')
        );
      })
      .filter((job) => job.applyUrl)
      .slice(0, 30);

    const roles = recommendedJobs.length > 0 ? buildRecommendedRoles(recommendedJobs) : [];

    res.json({
      roles,
      jobs: recommendedJobs,
    });
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
    const query = asCleanString(req.query.query, 'software engineer');
    const location = asCleanString(req.query.location);
    const filter = asCleanString(req.query.filter, 'All');
    const page = Number.parseInt(asCleanString(req.query.page, '1'), 10) || 1;

    let effectiveQuery = query;
    if (filter === 'Internship' && !/intern/i.test(effectiveQuery)) {
      effectiveQuery = `${effectiveQuery} intern`;
    }
    if (filter === 'Remote' && !/remote/i.test(effectiveQuery)) {
      effectiveQuery = `remote ${effectiveQuery}`;
    }

    const [adzunaRawJobs, greenhouseJobs, leverJobs] = await Promise.all([
      fetchAdzunaJobs({ search: effectiveQuery, location, page, resultsPerPage: 50 }),
      fetchGreenhouseJobs({ search: effectiveQuery, location }),
      fetchLeverJobs({ search: effectiveQuery, location }),
    ]);

    const adzunaJobs = adzunaRawJobs.map((job) => normalizeAdzunaJob(job, effectiveQuery));

    const mergedJobs = mergeAndDedupeJobs([adzunaJobs, greenhouseJobs, leverJobs]);
    const jobs = applyJobFilters(mergedJobs, { search: effectiveQuery, location, filter }).slice(0, 50);

    res.json({ jobs, page });
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
You are a professional resume reviewer and career peer advisor.

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
    "intro": "string",
    "highImpact": [
      { "issue": "string", "fix": "string" }
    ],
    "mediumImpact": [
      { "issue": "string", "fix": "string" }
    ],
    "recruiterInsight": "string",
    "outcome": "string"
  },
  "contentAndRelevance": {
    "intro": "string",
    "highImpact": [
      { "issue": "string", "fix": "string" }
    ],
    "mediumImpact": [
      { "issue": "string", "fix": "string" }
    ],
    "recruiterInsight": "string",
    "outcome": "string"
  },
  "formattingAndVisualAppeal": {
    "intro": "string",
    "highImpact": [
      { "issue": "string", "fix": "string" }
    ],
    "mediumImpact": [
      { "issue": "string", "fix": "string" }
    ],
    "recruiterInsight": "string",
    "outcome": "string"
  },
  "languageAndProfessionalism": {
    "intro": "string",
    "highImpact": [
      { "issue": "string", "fix": "string" }
    ],
    "mediumImpact": [
      { "issue": "string", "fix": "string" }
    ],
    "recruiterInsight": "string",
    "outcome": "string"
  },
  "recommendations": ["string", "string", "string"],
  "additionalNotes": "string"
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
- Sound like a real career peer advisor
- Be supportive but honest
- Start positive, then give improvements
- Use natural phrasing like:
  - "I recommend..."
  - "You may consider..."
  - "This would strengthen..."
- Avoid robotic language
- Be specific to the actual resume content
- Encourage quantification where appropriate
- Tailor suggestions to the student's field and likely career goals

SECTION GUIDELINES:

For EACH of these four sections — Overall Impression, Content and Relevance, Formatting and Visual Appeal, and Language and Professionalism — follow this structure:
- "intro": write a short 2-3 sentence overview in a supportive but honest tone
- "highImpact": provide 2 or 3 high-impact issues, each with a very specific fix
- "mediumImpact": provide 1 or 2 medium-impact issues, each with a specific fix
- "recruiterInsight": explain how a recruiter would likely react to this section
- "outcome": explain what would improve if the student fixes the issues

Overall Impression:
- Focus on first-glance professionalism, balance, organization, and overall readiness for internships or early-career roles

Content and Relevance:
- Focus on alignment of experiences and skills with likely goals
- Discuss quantification, project depth, and relevance of sections

Formatting and Visual Appeal:
- Focus on consistency, skimmability, spacing, section order, margins, and alignment

Language and Professionalism:
- Focus on action verbs, clarity, specificity, precision, and professionalism

Recommendations:
- Provide exactly 3 specific, high-impact action steps

Additional Notes:
- Mention inconsistencies, typos, spelling issues, formatting mismatches, or say clearly if there are no major issues

JSON QUALITY RULES:
- Every section object must contain all 5 keys: intro, highImpact, mediumImpact, recruiterInsight, outcome
- highImpact must contain at least 2 objects
- mediumImpact must contain at least 1 object
- Each issue and fix must be specific to the uploaded resume, not generic advice
- Keep the response concise but useful

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