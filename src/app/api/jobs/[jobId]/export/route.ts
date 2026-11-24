import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        candidates: {
          include: { evaluation: true },
          orderBy: { evaluation: { overallScore: "desc" } },
        },
      },
    });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const headers = [
      "Rank", "Candidate Name", "Email", "Current Role", "Experience (Years)",
      "Overall Score", "AI Recommendation", "Recruiter Override",
      "Technical Score", "Experience Score", "Matched Skills", "Missing Skills", "Top Evidence Quote",
    ];
    const rows = job.candidates.map((c, index) => {
      const ev = c.evaluation;
      const esc = (val: unknown) => '"' + String(val ?? "").replace(/"/g, '""') + '"';
      return [
        index + 1, esc(c.fullName), esc(c.email || ""), esc(c.currentTitle || ""),
        c.totalExperienceYears, ev?.overallScore ?? 0, esc(ev?.recommendation ?? "Pending"),
        esc(ev?.recruiterOverride ?? ""), ev?.technicalScore ?? 0, ev?.experienceScore ?? 0,
        esc((ev?.matchedSkills || []).join("; ")), esc((ev?.missingSkills || []).join("; ")),
        esc((ev?.evidence || [])[0] || ""),
      ].join(",");
    });
    const csvContent = [headers.join(","), ...rows].join("\n");
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=HireLens_Shortlist.csv",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
