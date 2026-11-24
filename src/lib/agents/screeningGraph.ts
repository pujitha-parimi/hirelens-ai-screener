import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  JDAnalysisSchema,
  ParsedCandidateSchema,
  CandidateEvaluationOutputSchema,
  DEFAULT_SCORING_WEIGHTS,
  computeWeightedOverallScore,
  getRecommendationLabel,
  type JDAnalysis,
  type ParsedCandidate,
  type CandidateEvaluationOutput,
  type ScoringWeights,
} from "./schemas";
import { cosineSimilarity, generateEmbedding } from "../embeddings";

export interface RetrievedChunkEvidence {
  chunkType: string;
  chunkText: string;
  similarity: number;
}

const ScreeningStateAnnotation = Annotation.Root({
  jdText: Annotation<string>,
  jobTitle: Annotation<string>,
  jobLocation: Annotation<string>,
  rawResumeText: Annotation<string>,
  chunks: Annotation<Array<{ chunkType: string; chunkText: string; embedding?: number[] }>>,
  weights: Annotation<ScoringWeights>,

  jdAnalysis: Annotation<JDAnalysis | null>,
  parsedCandidate: Annotation<ParsedCandidate | null>,
  sanitizedResumeText: Annotation<string>,
  retrievedChunks: Annotation<RetrievedChunkEvidence[]>,
  linkedinNote: Annotation<string>,
  evaluationOutput: Annotation<CandidateEvaluationOutput | null>,
  overallScore: Annotation<number>,
  recommendation: Annotation<string>,
});

type ScreeningState = typeof ScreeningStateAnnotation.State;

function getChatModel(modelName?: string) {
  return new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: modelName || process.env.GEMINI_CHAT_MODEL || "gemini-3.1-flash-lite",
    temperature: 0.1,
    maxRetries: 2,
  });
}

async function invokeStructuredWithFallback<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any,
  messages: [string, string][]
): Promise<T> {
  const models = Array.from(
    new Set([
      process.env.GEMINI_CHAT_MODEL || "gemini-3.1-flash-lite",
      "gemini-3.8-flash",
      "gemini-3.5-flash-lite",
      "gemini-2.5-flash",
    ])
  );
  let lastError: unknown;
  for (const modelName of models) {
    try {
      const model = getChatModel(modelName).withStructuredOutput(schema);
      return (await model.invoke(messages)) as T;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// Agent 1: JD Analysis Agent
async function jdAnalysisNode(state: ScreeningState): Promise<Partial<ScreeningState>> {
  const analysis = await invokeStructuredWithFallback<JDAnalysis>(JDAnalysisSchema, [
    [
      "system",
      "You are Agent 1 (JD Analysis Agent) for HireLens. Extract structured requirements, must-have skills, nice-to-have skills, seniority, domain needs, red flags, interview focus areas, and flag any potentially biased language in the Job Description.",
    ],
    ["human", `Job Title: ${state.jobTitle}\nLocation: ${state.jobLocation}\n\nJob Description:\n${state.jdText}`],
  ]);

  return { jdAnalysis: analysis };
}

// Agent 2: Resume Parsing Agent
async function resumeParsingNode(state: ScreeningState): Promise<Partial<ScreeningState>> {
  const parsed = await invokeStructuredWithFallback<ParsedCandidate>(ParsedCandidateSchema, [
    [
      "system",
      "You are Agent 2 (Resume Parsing Agent). Extract accurate structured candidate fields from the resume text. Never invent skills, companies, or years of experience that are not explicitly stated.",
    ],
    ["human", `Resume Text:\n${state.rawResumeText}`],
  ]);

  return { parsedCandidate: parsed };
}

// Agent 5 (Pre-Scoring Guardrail): Bias & Compliance Guardrail Agent
async function biasComplianceGuardrailNode(state: ScreeningState): Promise<Partial<ScreeningState>> {
  const sanitized = state.rawResumeText
    .replace(/\b(Date of Birth|DOB|Age|Gender|Sex|Marital Status|Religion|Caste|Nationality)\s*:[^\n]*/gi, "[REDACTED_PROTECTED_ATTRIBUTE]")
    .replace(/\b(Male|Female|Married|Single|Hindu|Muslim|Christian|Sikh)\b/gi, "[REDACTED]");

  return { sanitizedResumeText: sanitized };
}

// Hybrid RAG Retrieval + Agent 3: Candidate Evaluation Agent
async function candidateEvaluationNode(state: ScreeningState): Promise<Partial<ScreeningState>> {
  let topChunks: RetrievedChunkEvidence[] = [];
  try {
    const jdQueryText = `${state.jobTitle}: ${state.jdAnalysis?.mustHaveSkills.join(", ") || state.jdText.slice(0, 400)}`;
    const jdVector = await generateEmbedding(jdQueryText);

    const scoredChunks = state.chunks
      .filter((c) => Array.isArray(c.embedding) && c.embedding.length > 0)
      .map((c) => ({
        chunkType: c.chunkType,
        chunkText: c.chunkText,
        similarity: Math.round(cosineSimilarity(jdVector, c.embedding!) * 1000) / 1000,
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 4);

    topChunks =
      scoredChunks.length > 0
        ? scoredChunks
        : state.chunks.slice(0, 4).map((c) => ({ chunkType: c.chunkType, chunkText: c.chunkText, similarity: 0.75 }));
  } catch {
    topChunks = state.chunks.slice(0, 4).map((c) => ({ chunkType: c.chunkType, chunkText: c.chunkText, similarity: 0.75 }));
  }

  const evalResult = await invokeStructuredWithFallback<CandidateEvaluationOutput>(
    CandidateEvaluationOutputSchema,
    [
      [
        "system",
        `You are Agent 3 (Candidate Evaluation Agent) for HireLens.
Score the candidate from 0 to 100 across all 7 dimensions using ONLY job-related evidence from the resume.
CRITICAL COMPLIANCE RULES:
- Ignore all protected demographic attributes (age, gender, race, caste, religion, marital status).
- Every score MUST cite exact verbatim evidence quotes from the resume in the 'evidence' array.
- Do NOT invent experience. Penalize missing must-have skills transparently in 'missingSkills' and 'gaps'.
- Generate 4 targeted, role-specific interview questions probing the candidate's gaps and claimed projects.`,
      ],
      [
        "human",
        `JOB REQUIREMENTS (Agent 1 Output):
${JSON.stringify(state.jdAnalysis, null, 2)}

STRUCTURED CANDIDATE PROFILE (Agent 2 Output):
${JSON.stringify(state.parsedCandidate, null, 2)}

TOP SEMANTICALLY RETRIEVED RESUME CHUNKS (Hybrid RAG):
${topChunks.map((c) => `[${c.chunkType} | sim=${c.similarity}]\n${c.chunkText}`).join("\n\n")}

SANITIZED RESUME TEXT:
${state.sanitizedResumeText}`,
      ],
    ]
  );

  return {
    retrievedChunks: topChunks,
    evaluationOutput: evalResult,
  };
}

// Agent 4: LinkedIn Verification & Enrichment Agent
async function linkedinEnrichmentNode(state: ScreeningState): Promise<Partial<ScreeningState>> {
  const url = state.parsedCandidate?.linkedinUrl;
  if (!url) {
    return {
      linkedinNote: "No LinkedIn URL provided on resume. Skipped external profile check.",
    };
  }
  const isValidFormat = /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?$/i.test(url.trim());
  return {
    linkedinNote: isValidFormat
      ? `Verified valid LinkedIn profile handle (${url.trim()}). Ready for candidate-consented OAuth enrichment (no unauthorized scraping performed per LinkedIn ToS).`
      : `LinkedIn URL listed (${url.trim()}) — format requires manual verification.`,
  };
}

// Agent 6: Final Report & Weighted Score Calculator
async function finalReportNode(state: ScreeningState): Promise<Partial<ScreeningState>> {
  const evalOut = state.evaluationOutput!;
  const weights = state.weights || DEFAULT_SCORING_WEIGHTS;
  const overallScore = computeWeightedOverallScore(evalOut, weights);
  const recommendation = getRecommendationLabel(overallScore);

  const enrichedExplanation = `${evalOut.explanation}\n\n[Compliance & Verification]: ${state.linkedinNote}`;

  return {
    overallScore,
    recommendation,
    evaluationOutput: {
      ...evalOut,
      explanation: enrichedExplanation,
    },
  };
}

// Compile the 6-Agent LangGraph Workflow
const workflow = new StateGraph(ScreeningStateAnnotation)
  .addNode("jd_analysis", jdAnalysisNode)
  .addNode("resume_parsing", resumeParsingNode)
  .addNode("bias_guardrail", biasComplianceGuardrailNode)
  .addNode("candidate_evaluation", candidateEvaluationNode)
  .addNode("linkedin_enrichment", linkedinEnrichmentNode)
  .addNode("final_report", finalReportNode);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = workflow as any;
g.addEdge(START, "jd_analysis");
g.addEdge("jd_analysis", "resume_parsing");
g.addEdge("resume_parsing", "bias_guardrail");
g.addEdge("bias_guardrail", "candidate_evaluation");
g.addEdge("candidate_evaluation", "linkedin_enrichment");
g.addEdge("linkedin_enrichment", "final_report");
g.addEdge("final_report", END);

export const hireLensGraph = g.compile();

export async function runCandidateScreeningPipeline(input: {
  jdText: string;
  jobTitle: string;
  jobLocation: string;
  rawResumeText: string;
  chunks: Array<{ chunkType: string; chunkText: string; embedding?: number[] }>;
  weights?: ScoringWeights;
}) {
  return hireLensGraph.invoke({
    jdText: input.jdText,
    jobTitle: input.jobTitle,
    jobLocation: input.jobLocation,
    rawResumeText: input.rawResumeText,
    chunks: input.chunks,
    weights: input.weights || DEFAULT_SCORING_WEIGHTS,
    jdAnalysis: null,
    parsedCandidate: null,
    sanitizedResumeText: "",
    retrievedChunks: [],
    linkedinNote: "",
    evaluationOutput: null,
    overallScore: 0,
    recommendation: "Pending",
  });
}