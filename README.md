# HireLens — AI Resume Screening, Matching & Candidate Shortlisting Platform

HireLens is an end-to-end **multi-agent AI recruitment screening platform** built with **Next.js App Router, TypeScript, Prisma v6, Neon PostgreSQL (`pgvector`), LangGraph.js, Zod, and Google Gemini**. It parses multi-format resumes (`PDF`, `DOCX`, `DOC`, `TXT`), chunks resumes by semantic section, embeds them with Gemini vector embeddings, strips protected demographic attributes, and produces **evidence-backed, weighted candidate rankings** with tailored interview questions and human-in-the-loop recruiter overrides.

---

## Architecture: 6-Agent LangGraph Screening Pipeline

```text
Resume Upload (PDF / DOCX / DOC / TXT)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. JDAnalysisAgent          → Extracts must-have skills,     │
│                               seniority, red flags & bias   │
├─────────────────────────────────────────────────────────────┤
│ 2. ResumeParsingAgent       → Extracts structured profile   │
│                               with strict Zod validation    │
├─────────────────────────────────────────────────────────────┤
│ 3. BiasComplianceGuardrail  → Redacts protected attributes  │
│                               (age, gender, religion, etc.) │
├─────────────────────────────────────────────────────────────┤
│ 4. HybridRAGEvaluationAgent → Semantic chunk vector search  │
│                               + 7-dimension evidence scoring│
├─────────────────────────────────────────────────────────────┤
│ 5. LinkedInConsistencyAgent → Validates profile handle      │
│                               (zero unauthorized scraping)  │
├─────────────────────────────────────────────────────────────┤
│ 6. FinalReportAgent         → Computes custom weighted score│
│                               & generates interview guide   │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
Neon Cloud PostgreSQL (Candidate, CandidateChunk, Evaluation + Audit Log)