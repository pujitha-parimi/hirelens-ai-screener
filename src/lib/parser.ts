import mammoth from "mammoth";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ResumeSectionChunk {
  chunkType: "WORK_EXPERIENCE" | "PROJECTS" | "SKILLS" | "EDUCATION" | "CERTIFICATIONS" | "SUMMARY";
  chunkText: string;
}

export async function extractResumeText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".pdf")) {
    // Polyfill browser globals expected by pdfjs-dist in Node.js
    const g = globalThis as Record<string, unknown>;
    if (!g.DOMMatrix) {
      g.DOMMatrix = class DOMMatrix {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
        constructor() {}
      };
    }
    if (!g.Path2D) {
      g.Path2D = class Path2D {};
    }
    if (!g.ImageData) {
      g.ImageData = class ImageData {};
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfModule = require("pdf-parse");
      const pdfParse = typeof pdfModule === "function" ? pdfModule : pdfModule.default;
      if (typeof pdfParse === "function") {
        const data = await pdfParse(buffer);
        if (data?.text && data.text.trim().length > 20) {
          return cleanText(data.text);
        }
      }
      if (pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: buffer });
        const textResult = await parser.getText();
        if (textResult?.text && textResult.text.trim().length > 20) {
          return cleanText(textResult.text);
        }
      }
    } catch {
      // Fall through to Gemini native PDF text extraction
    }

    // Rock-solid fallback: Gemini native PDF document extraction
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
    const models = [
      process.env.GEMINI_CHAT_MODEL || "gemini-3.1-flash-lite",
      "gemini-3.8-flash",
      "gemini-3.5-flash-lite",
      "gemini-2.5-flash",
    ];
    let lastErr: unknown;
    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const res = await model.generateContent([
          {
            inlineData: {
              mimeType: "application/pdf",
              data: buffer.toString("base64"),
            },
          },
          "Extract all text verbatim from this resume PDF preserving section headings and bullet points. Output only the extracted text.",
        ]);
        return cleanText(res.response.text());
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
    const result = await mammoth.extractRawText({ buffer });
    return cleanText(result.value);
  }

  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    return cleanText(buffer.toString("utf-8"));
  }

  throw new Error(`Unsupported file format for "${filename}". Upload PDF, DOCX, DOC, or TXT.`);
}

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkResumeBySection(resumeText: string): ResumeSectionChunk[] {
  const lines = resumeText.split("\n");
  const chunks: ResumeSectionChunk[] = [];

  let currentType: ResumeSectionChunk["chunkType"] = "SUMMARY";
  let buffer: string[] = [];

  const detectSection = (line: string): ResumeSectionChunk["chunkType"] | null => {
    const normalized = line.trim().toUpperCase().replace(/[:\-_]/g, "");
    if (normalized.length > 40) return null;

    if (/^(WORK\s+EXPERIENCE|EXPERIENCE|EMPLOYMENT|PROFESSIONAL\s+EXPERIENCE|INTERNSHIPS?)$/.test(normalized)) {
      return "WORK_EXPERIENCE";
    }
    if (/^(PROJECTS?|PERSONAL\s+PROJECTS?|KEY\s+PROJECTS?|ACADEMIC\s+PROJECTS?)$/.test(normalized)) {
      return "PROJECTS";
    }
    if (/^(SKILLS?|TECHNICAL\s+SKILLS?|CORE\s+COMPETENCIES|TECHNOLOGIES|TECH\s+STACK)$/.test(normalized)) {
      return "SKILLS";
    }
    if (/^(EDUCATION|ACADEMIC\s+QUALIFICATIONS?|QUALIFICATIONS?)$/.test(normalized)) {
      return "EDUCATION";
    }
    if (/^(CERTIFICATIONS?|CERTIFICATES?|LICENSES?|AWARDS?)$/.test(normalized)) {
      return "CERTIFICATIONS";
    }
    return null;
  };

  for (const line of lines) {
    const detected = detectSection(line);
    if (detected) {
      if (buffer.join("\n").trim().length > 15) {
        chunks.push({ chunkType: currentType, chunkText: buffer.join("\n").trim() });
      }
      currentType = detected;
      buffer = [line];
    } else {
      buffer.push(line);
    }
  }

  if (buffer.join("\n").trim().length > 15) {
    chunks.push({ chunkType: currentType, chunkText: buffer.join("\n").trim() });
  }

  if (chunks.length === 0 && resumeText.trim().length > 0) {
    chunks.push({ chunkType: "SUMMARY", chunkText: resumeText.trim() });
  }

  return chunks;
}

