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

const REMOTIVE_API_URL = 'https://remotive.com/api/remote-jobs';

function asCleanString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeRemotiveJob(job, searchQuery = '') {
  const title = asCleanString(job?.title, 'Untitled Role');
  const company = asCleanString(job?.company_name, 'Unknown Company');
  const location = asCleanString(job?.candidate_required_location, 'Remote');
  const type = asCleanString(job?.job_type, 'Remote Role')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

  const haystack = `${title} ${company} ${job?.category || ''} ${job?.description || ''}`.toLowerCase();
  const normalizedQuery = searchQuery.toLowerCase();

  let fit = 'Good Match';
  if (normalizedQuery) {
    if (haystack.includes(normalizedQuery)) {
      fit = 'High Match';
    } else if (normalizedQuery.split(/\s+/).some((word) => word.length > 2 && haystack.includes(word))) {
      fit = 'Potential Match';
    }
  } else if (String(job?.job_type || '').toLowerCase().includes('intern')) {
    fit = 'Strong Internship Match';
  }

  return {
    id: job?.id ? String(job.id) : undefined,
    title,
    company,
    location,
    type,
    fit,
    applyUrl: asCleanString(job?.url) || undefined,
    source: 'Remotive',
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

async function fetchRemotiveJobs({ search = '', limit = 12, category } = {}) {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (limit) params.append('limit', String(limit));
  if (category) params.append('category', category);

  const response = await fetch(`${REMOTIVE_API_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Remotive request failed with status ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data?.jobs) ? data.jobs : [];
}

app.get('/jobs/recommended', async (req, res) => {
  try {
    const internshipJobs = await fetchRemotiveJobs({
      search: 'software engineer intern',
      category: 'software-dev',
      limit: 9,
    });

    const jobs = internshipJobs.map((job) => normalizeRemotiveJob(job, 'software engineer intern'));
    const roles = buildRecommendedRoles(jobs);

    res.json({
      roles,
      jobs,
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

    const jobsFromApi = await fetchRemotiveJobs({
      search: query,
      category: 'software-dev',
      limit: 18,
    });

    let jobs = jobsFromApi.map((job) => normalizeRemotiveJob(job, query));

    if (filter.toLowerCase() === 'internship') {
      jobs = jobs.filter((job) => job.type.toLowerCase().includes('intern'));
    }

    if (filter.toLowerCase() === 'remote') {
      jobs = jobs.filter((job) => job.location.toLowerCase().includes('remote') || job.location.toLowerCase().includes('worldwide'));
    }

    if (location) {
      jobs = jobs.filter((job) => job.location.toLowerCase().includes(location.toLowerCase()));
    }

    res.json({ jobs });
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