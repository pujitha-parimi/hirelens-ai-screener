import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractResumeText, chunkResumeBySection } from "@/lib/parser";
import { generateEmbeddingsBatch } from "@/lib/embeddings";
import { runCandidateScreeningPipeline } from "@/lib/agents/screeningGraph";
import { DEFAULT_SCORING_WEIGHTS, type ScoringWeights } from "@/lib/agents/schemas";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const pastedText = formData.get("pastedResumeText") as string | null;
    const pastedName = (formData.get("pastedCandidateName") as string | null) || "Pasted_Resume.txt";

    const itemsToProcess: Array<{ filename: string; rawText: string }> = [];

    for (const file of files) {
      if (file && file.size > 0) {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const rawText = await extractResumeText(buffer, file.name);
        itemsToProcess.push({ filename: file.name, rawText });
      }
    }

    if (pastedText && pastedText.trim().length > 30) {
      itemsToProcess.push({ filename: pastedName, rawText: pastedText.trim() });
    }

    if (itemsToProcess.length === 0) {
      return NextResponse.json(
        { error: "Please upload at least one PDF, DOCX, or TXT resume." },
        { status: 400 }
      );
    }

    const weights = (job.weightsJson as ScoringWeights | null) || DEFAULT_SCORING_WEIGHTS;

    // Process all uploaded resumes concurrently
    const settled = await Promise.allSettled(
      itemsToProcess.map(async (item) => {
        const sectionChunks = chunkResumeBySection(item.rawText);

        let embeddings: number[][] = [];
        try {
          embeddings = await generateEmbeddingsBatch(sectionChunks.map((c) => c.chunkText));
        } catch {
          embeddings = sectionChunks.map(() => []);
        }

        const chunksWithVectors = sectionChunks.map((chunk, idx) => ({
          chunkType: chunk.chunkType,
          chunkText: chunk.chunkText,
          embedding: embeddings[idx] || [],
        }));

        const pipelineOutput = await runCandidateScreeningPipeline({
          jdText: job.jdText,
          jobTitle: job.title,
          jobLocation: job.location,
          rawResumeText: item.rawText,
          chunks: chunksWithVectors,
          weights,
        });

        const parsed = pipelineOutput.parsedCandidate!;
        const evalOut = pipelineOutput.evaluationOutput!;

        return prisma.candidate.create({
          data: {
            jobId: job.id,
            fullName: parsed.fullName || item.filename.replace(/\.[^/.]+$/, ""),
            email: parsed.email || null,
            phone: parsed.phone || null,
            location: parsed.location || null,
            linkedinUrl: parsed.linkedinUrl || null,
            githubUrl: parsed.githubUrl || null,
            portfolioUrl: parsed.portfolioUrl || null,
            currentTitle: parsed.currentTitle || null,
            currentCompany: parsed.currentCompany || null,
            totalExperienceYears: parsed.totalExperienceYears || 0,
            resumeFileUrl: `local://uploads/${job.id}/${item.filename}`,
            rawResumeText: item.rawText,
            parsedResumeJson: parsed,
            chunks: {
              create: chunksWithVectors.map((c) => ({
                chunkType: c.chunkType,
                chunkText: c.chunkText,
                embedding: c.embedding,
                metadata: { sourceFile: item.filename },
              })),
            },
            evaluation: {
              create: {
                jobId: job.id,
                overallScore: pipelineOutput.overallScore,
                technicalScore: evalOut.technicalScore,
                experienceScore: evalOut.experienceScore,
                domainScore: evalOut.domainScore,
                educationScore: evalOut.educationScore,
                seniorityScore: evalOut.seniorityScore,
                locationScore: evalOut.locationScore,
                qualityScore: evalOut.qualityScore,
                recommendation: pipelineOutput.recommendation,
                strengths: evalOut.strengths,
                gaps: evalOut.gaps,
                risks: evalOut.risks,
                missingSkills: evalOut.missingSkills,
                matchedSkills: evalOut.matchedSkills,
                explanation: evalOut.explanation,
                evidence: evalOut.evidence,
                interviewQuestions: evalOut.interviewQuestions,
                auditMetadata: {
                  model: process.env.GEMINI_CHAT_MODEL || "gemini-3.1-flash-lite",
                  embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004",
                  jdVersionTimestamp: job.createdAt.toISOString(),
                  evaluatedAt: new Date().toISOString(),
                  parsingConfidence: parsed.parsingConfidence,
                },
              },
            },
          },
          include: {
            evaluation: true,
          },
        });
      })
    );

    const results = settled
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof prisma.candidate.create>>> => r.status === "fulfilled")
      .map((r) => r.value);

    const failed = settled
      .map((r, idx) => (r.status === "rejected" ? `${itemsToProcess[idx].filename}: ${r.reason?.message || "Failed"}` : null))
      .filter(Boolean);

    if (results.length === 0 && failed.length > 0) {
      return NextResponse.json({ error: failed.join(" | ") }, { status: 500 });
    }

    return NextResponse.json(
      { processedCount: results.length, failedCount: failed.length, failures: failed, candidates: results },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process resumes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
