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
  "scoreBreakdown": {
    "overallImpression": number,
    "contentAndRelevance": number,
    "formattingAndVisualAppeal": number,
    "languageAndProfessionalism": number,
    "careerAlignmentImpact": number
  },
  "overallImpression": "string",
  "contentAndRelevance": "string",
  "formattingAndVisualAppeal": "string",
  "languageAndProfessionalism": "string",
  "recommendations": ["string", "string", "string"],
  "additionalNotes": "string"
}

SCORING RUBRIC:
- Overall Impression: score out of 15
- Content and Relevance: score out of 30
- Formatting and Visual Appeal: score out of 20
- Language and Professionalism: score out of 20
- Career Alignment / Impact: score out of 15

IMPORTANT SCORING RULES:
- The total score must equal the sum of the 5 category scores
- Total score must be out of 100
- Use realistic scoring, not inflated scoring
- A resume with clear issues should not score unrealistically high
- Judge the resume like a real career advisor reviewing a student resume

VERY IMPORTANT RULES:
- If the file is not a resume, do NOT provide resume feedback sections
- If the file is not a resume, return only the isResume:false JSON
- Do not use markdown
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

Overall Impression:
- Comment on first-glance professionalism, balance, organization, and ATS-friendliness

Content and Relevance:
- Evaluate alignment of experiences/skills with likely goals
- Discuss quantification, project depth, and relevance of sections

Formatting and Visual Appeal:
- Evaluate consistency, skimmability, spacing, section order, margins, and alignment

Language and Professionalism:
- Evaluate action verbs, clarity, specificity, precision, and professionalism

Recommendations:
- Provide 3 specific, high-impact action steps

Additional Notes:
- Mention inconsistencies, typos, spelling issues, formatting mismatches, or say clearly if there are no major issues

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
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return res.status(500).json({
        error: 'AI returned invalid JSON',
        raw: rawText,
      });
    }

    res.json({
      result: parsed,
      extractedTextLength: resumeText.length,
    });
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