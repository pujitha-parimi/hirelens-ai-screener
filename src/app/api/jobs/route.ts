import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SCORING_WEIGHTS, ScoringWeightsSchema } from "@/lib/agents/schemas";

async function getOrCreateDefaultOrgAndUser() {
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: { name: "HireLens Demo Workspace", plan: "GROWTH", credits: 500 },
    });
  }
  let user = await prisma.user.findFirst({ where: { organizationId: org.id } });
  if (!user) {
    user = await prisma.user.create({
      data: { name: "Pujitha Parimi", email: "recruiter@hirelens.ai", role: "ADMIN", organizationId: org.id },
    });
  }
  return { org, user };
}

export async function GET() {
  try {
    const jobs = await prisma.job.findMany({
      include: {
        candidates: {
          include: { evaluation: true },
          orderBy: { evaluation: { overallScore: "desc" } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const totalCandidates = jobs.reduce((sum, job) => sum + job.candidates.length, 0);
    const estimatedMinutesSaved = totalCandidates * 40;
    return NextResponse.json({
      jobs,
      stats: {
        activeJobs: jobs.length,
        candidatesProcessed: totalCandidates,
        estimatedHoursSaved: Math.round((estimatedMinutesSaved / 60) * 10) / 10,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch jobs";
    return NextResponse.json({ error: message, jobs: [], stats: { activeJobs: 0, candidatesProcessed: 0, estimatedHoursSaved: 0 } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { org, user } = await getOrCreateDefaultOrgAndUser();
    const parsedWeights = body.weights ? ScoringWeightsSchema.parse(body.weights) : DEFAULT_SCORING_WEIGHTS;
    const mustHaveSkills = Array.isArray(body.mustHaveSkills)
      ? body.mustHaveSkills
      : String(body.mustHaveSkills || "").split(",").map((s) => s.trim()).filter(Boolean);
    const niceToHaveSkills = Array.isArray(body.niceToHaveSkills)
      ? body.niceToHaveSkills
      : String(body.niceToHaveSkills || "").split(",").map((s) => s.trim()).filter(Boolean);

    const job = await prisma.job.create({
      data: {
        organizationId: org.id,
        title: body.title || "Untitled Role",
        department: body.department || "Engineering",
        location: body.location || "Remote",
        employmentType: body.employmentType || "Full-time",
        seniority: body.seniority || "Mid-Senior",
        salaryRange: body.salaryRange || null,
        jdText: body.jdText,
        mustHaveSkills,
        niceToHaveSkills,
        minimumExperience: Number(body.minimumExperience ?? 2),
        weightsJson: parsedWeights,
        createdBy: user.id,
      },
    });
    return NextResponse.json({ job }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create job";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
