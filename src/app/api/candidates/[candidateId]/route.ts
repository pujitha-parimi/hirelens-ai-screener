import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ candidateId: string }> }
) {
  try {
    const { candidateId } = await context.params;
    const body = await req.json();
    const { recruiterOverride } = body;

    const existing = await prisma.evaluation.findUnique({
      where: { candidateId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });
    }

    const updated = await prisma.evaluation.update({
      where: { candidateId },
      data: {
        recruiterOverride: recruiterOverride || null,
        auditMetadata: {
          ...(existing.auditMetadata as Record<string, unknown>),
          overriddenByRecruiter: true,
          recruiterOverrideValue: recruiterOverride,
          overriddenAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({ evaluation: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update override";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
