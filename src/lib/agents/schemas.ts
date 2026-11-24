import { z } from "zod";

export const ScoringWeightsSchema = z.object({
  technical: z.number().min(0).max(100).default(35),
  experience: z.number().min(0).max(100).default(25),
  domain: z.number().min(0).max(100).default(15),
  seniority: z.number().min(0).max(100).default(10),
  education: z.number().min(0).max(100).default(5),
  location: z.number().min(0).max(100).default(5),
  quality: z.number().min(0).max(100).default(5),
});

export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  technical: 35,
  experience: 25,
  domain: 15,
  seniority: 10,
  education: 5,
  location: 5,
  quality: 5,
};

// Agent 1 Output: JD Analysis
export const JDAnalysisSchema = z.object({
  roleSummary: z.string(),
  mustHaveSkills: z.array(z.string()),
  niceToHaveSkills: z.array(z.string()),
  minimumExperienceYears: z.number(),
  seniorityLevel: z.string(),
  domainRequirements: z.array(z.string()),
  redFlags: z.array(z.string()),
  interviewFocusAreas: z.array(z.string()),
  biasedLanguageFlags: z.array(z.string()),
});

export type JDAnalysis = z.infer<typeof JDAnalysisSchema>;

// Agent 2 Output: Structured Candidate Profile (no .nullable() arrays for Gemini response_schema compatibility)
export const ParsedCandidateSchema = z.object({
  fullName: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  currentTitle: z.string().optional(),
  currentCompany: z.string().optional(),
  totalExperienceYears: z.number(),
  skills: z.array(z.string()),
  education: z.array(z.string()),
  certifications: z.array(z.string()),
  previousCompanies: z.array(z.string()),
  projects: z.array(z.string()),
  linkedinUrl: z.string().optional(),
  githubUrl: z.string().optional(),
  portfolioUrl: z.string().optional(),
  parsingConfidence: z.number().min(0).max(100),
});

export type ParsedCandidate = z.output<typeof ParsedCandidateSchema>;

// Agent 3 + 6 Output: Evidence-Backed Evaluation & Interview Plan
export const CandidateEvaluationOutputSchema = z.object({
  technicalScore: z.number().min(0).max(100),
  experienceScore: z.number().min(0).max(100),
  domainScore: z.number().min(0).max(100),
  seniorityScore: z.number().min(0).max(100),
  educationScore: z.number().min(0).max(100),
  locationScore: z.number().min(0).max(100),
  qualityScore: z.number().min(0).max(100),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  risks: z.array(z.string()),
  evidence: z.array(z.string()).min(1),
  explanation: z.string(),
  interviewQuestions: z.array(z.string()).min(3),
});

export type CandidateEvaluationOutput = z.infer<typeof CandidateEvaluationOutputSchema>;

export function computeWeightedOverallScore(
  scores: CandidateEvaluationOutput,
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
): number {
  const totalWeight =
    weights.technical +
    weights.experience +
    weights.domain +
    weights.seniority +
    weights.education +
    weights.location +
    weights.quality;

  if (totalWeight <= 0) return 0;

  const weightedSum =
    scores.technicalScore * weights.technical +
    scores.experienceScore * weights.experience +
    scores.domainScore * weights.domain +
    scores.seniorityScore * weights.seniority +
    scores.educationScore * weights.education +
    scores.locationScore * weights.location +
    scores.qualityScore * weights.quality;

  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

export function getRecommendationLabel(overallScore: number): string {
  if (overallScore >= 85) return "Strongly Recommend Interview";
  if (overallScore >= 70) return "Recommend Interview";
  if (overallScore >= 55) return "Maybe / Secondary Shortlist";
  if (overallScore >= 40) return "Weak Match";
  return "Reject";
}
