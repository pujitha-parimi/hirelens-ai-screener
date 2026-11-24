"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Briefcase,
  Users,
  Clock,
  Upload,
  Plus,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Sparkles,
  ShieldCheck,
  Sliders,
  ExternalLink,
  Search,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface ScoringWeights {
  technical: number;
  experience: number;
  domain: number;
  seniority: number;
  education: number;
  location: number;
  quality: number;
}

interface Evaluation {
  id: string;
  overallScore: number;
  technicalScore: number;
  experienceScore: number;
  domainScore: number;
  educationScore: number;
  seniorityScore: number;
  locationScore: number;
  qualityScore: number;
  recommendation: string;
  recruiterOverride: string | null;
  strengths: string[];
  gaps: string[];
  risks: string[];
  missingSkills: string[];
  matchedSkills: string[];
  explanation: string;
  evidence: string[];
  interviewQuestions: string[];
  auditMetadata: Record<string, unknown>;
}

interface Candidate {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  totalExperienceYears: number;
  rawResumeText: string;
  evaluation: Evaluation | null;
}

interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  employmentType: string;
  seniority: string;
  salaryRange: string | null;
  jdText: string;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  minimumExperience: number;
  weightsJson: ScoringWeights | null;
  candidates: Candidate[];
  createdAt: string;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  technical: 35,
  experience: 25,
  domain: 15,
  seniority: 10,
  education: 5,
  location: 5,
  quality: 5,
};

export default function HireLensDashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState({ activeJobs: 0, candidatesProcessed: 0, estimatedHoursSaved: 0 });
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [activeTab, setActiveTab] = useState<"shortlist" | "create-job" | "upload">("shortlist");
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [minScoreFilter, setMinScoreFilter] = useState<number>(0);
  const [recFilter, setRecFilter] = useState<string>("ALL");

  // Create Job Form State
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("Engineering");
  const [jobLocation, setJobLocation] = useState("Remote / Hybrid");
  const [seniority, setSeniority] = useState("Senior");
  const [minExp, setMinExp] = useState(3);
  const [mustHaveSkills, setMustHaveSkills] = useState("TypeScript, Next.js, React, Node.js, PostgreSQL, RAG");
  const [niceToHaveSkills, setNiceToHaveSkills] = useState("LangGraph, Docker, AWS");
  const [jdText, setJdText] = useState("");
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_WEIGHTS);
  const [creatingJob, setCreatingJob] = useState(false);

  // Upload Resumes State
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [pastedName, setPastedName] = useState("");
  const [pastedResumeText, setPastedResumeText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs");
      const text = await res.text();
      if (!text) return;
      const data = JSON.parse(text);
      if (data.jobs) {
        setJobs(data.jobs);
        setStats(data.stats || { activeJobs: 0, candidatesProcessed: 0, estimatedHoursSaved: 0 });
        if (!selectedJobId && data.jobs.length > 0) {
          setSelectedJobId(data.jobs[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load jobs:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedJobId]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const activeJob = jobs.find((j) => j.id === selectedJobId) || jobs[0] || null;

  const filteredCandidates = (activeJob?.candidates || []).filter((c) => {
    const score = c.evaluation?.overallScore ?? 0;
    const rec = c.evaluation?.recruiterOverride || c.evaluation?.recommendation || "";
    const matchesSearch =
      c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.currentTitle || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.evaluation?.matchedSkills || []).some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesScore = score >= minScoreFilter;
    const matchesRec = recFilter === "ALL" || rec.toLowerCase().includes(recFilter.toLowerCase());
    return matchesSearch && matchesScore && matchesRec;
  });

  const appendFiles = (incoming: File[]) => {
    const validExtensions = [".pdf", ".docx", ".doc", ".txt", ".md"];
    const filtered = incoming.filter((file) =>
      validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
    );
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      return [...prev, ...filtered.filter((f) => !existingNames.has(f.name))];
    });
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobTitle.trim() || !jdText.trim()) return;
    setCreatingJob(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: jobTitle,
          department,
          location: jobLocation,
          seniority,
          minimumExperience: minExp,
          mustHaveSkills,
          niceToHaveSkills,
          jdText,
          weights,
        }),
      });
      const data = await res.json();
      if (data.job) {
        await fetchJobs();
        setSelectedJobId(data.job.id);
        setJobTitle("");
        setJdText("");
        setActiveTab("upload");
      }
    } finally {
      setCreatingJob(false);
    }
  };

  const handleUploadResumes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeJob) return;
    if (files.length === 0 && !pastedResumeText.trim()) return;

    const totalCount = files.length + (pastedResumeText.trim() ? 1 : 0);
    setUploading(true);
    setUploadStatus(
      `Screening ${totalCount} resume(s) in parallel via 6-Agent LangGraph Pipeline (Parsing → Bias Guardrail → Hybrid RAG Scoring)...`
    );

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      if (pastedResumeText.trim()) {
        formData.append("pastedCandidateName", pastedName || "Candidate_Resume.txt");
        formData.append("pastedResumeText", pastedResumeText);
      }

      const res = await fetch(`/api/jobs/${activeJob.id}/resumes`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadStatus(`Error: ${data.error}`);
      } else {
        const failureNote =
          data.failedCount > 0 ? ` (${data.failedCount} failed: ${(data.failures || []).join("; ")})` : "";
        setUploadStatus(`Successfully evaluated ${data.processedCount} candidate(s)!${failureNote}`);
        setFiles([]);
        setPastedName("");
        setPastedResumeText("");
        await fetchJobs();
        setActiveTab("shortlist");
      }
    } catch (err: unknown) {
      setUploadStatus(`Error: ${err instanceof Error ? err.message : "Upload failed"}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRecruiterOverride = async (candidateId: string, overrideValue: string) => {
    await fetch(`/api/candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recruiterOverride: overrideValue }),
    });
    await fetchJobs();
    if (selectedCandidate && selectedCandidate.id === candidateId && selectedCandidate.evaluation) {
      setSelectedCandidate({
        ...selectedCandidate,
        evaluation: { ...selectedCandidate.evaluation, recruiterOverride: overrideValue },
      });
    }
  };

  const getBadgeStyle = (rec: string) => {
    const r = rec.toLowerCase();
    if (r.includes("strongly")) return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    if (r.includes("recommend") || r.includes("interview")) return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    if (r.includes("maybe")) return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  };

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">HireLens</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                  AI Screening & Shortlisting
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Hybrid RAG + 6-Agent Evidence-Backed Candidate Evaluation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("shortlist")}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "shortlist"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              Ranked Shortlist
            </button>
            <button
              onClick={() => {
                setUploadStatus(null);
                setActiveTab("upload");
              }}
              disabled={!activeJob}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                activeTab === "upload"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40"
              }`}
            >
              <Upload className="h-4 w-4" />
              Upload Resumes
            </button>
            <button
              onClick={() => setActiveTab("create-job")}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                activeTab === "create-job"
                  ? "bg-indigo-600 text-white"
                  : "bg-emerald-600/90 text-white hover:bg-emerald-500"
              }`}
            >
              <Plus className="h-4 w-4" />
              New Job Role
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* KPI Dashboard Cards */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between text-slate-400 text-sm">
              <span>Active Job Roles</span>
              <Briefcase className="h-4 w-4 text-indigo-400" />
            </div>
            <p className="text-3xl font-bold text-white mt-2">{stats.activeJobs}</p>
            <p className="text-xs text-slate-500 mt-1">Configurable role rubrics</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between text-slate-400 text-sm">
              <span>Candidates Screened</span>
              <Users className="h-4 w-4 text-sky-400" />
            </div>
            <p className="text-3xl font-bold text-white mt-2">{stats.candidatesProcessed}</p>
            <p className="text-xs text-slate-500 mt-1">Parsed & vector-indexed</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between text-slate-400 text-sm">
              <span>Recruiter Time Saved</span>
              <Clock className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="text-3xl font-bold text-emerald-400 mt-2">{stats.estimatedHoursSaved} hrs</p>
            <p className="text-xs text-slate-500 mt-1">~85% faster than manual review</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between text-slate-400 text-sm">
              <span>Compliance Guardrail</span>
              <ShieldCheck className="h-4 w-4 text-amber-400" />
            </div>
            <p className="text-lg font-bold text-white mt-2">Active & Audited</p>
            <p className="text-xs text-slate-500 mt-1">PII/Bias stripped • Human override</p>
          </div>
        </section>

        {/* Job Selector Bar */}
        {jobs.length > 0 && (
          <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                Selected Role:
              </span>
              <select
                value={activeJob?.id || ""}
                onChange={(e) => {
                  setSelectedJobId(e.target.value);
                  setSelectedCandidate(null);
                }}
                className="bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} ({job.location}) — {job.candidates.length} candidates
                  </option>
                ))}
              </select>
              {activeJob && (
                <div className="flex flex-wrap gap-1.5">
                  {activeJob.mustHaveSkills.slice(0, 5).map((skill) => (
                    <span
                      key={skill}
                      className="text-xs px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {activeJob && activeJob.candidates.length > 0 && (
              <a
                href={`/api/jobs/${activeJob.id}/export`}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-medium text-slate-200 flex items-center gap-2 transition"
              >
                <Download className="h-4 w-4 text-emerald-400" />
                Export Shortlist CSV
              </a>
            )}
          </section>
        )}

        {/* TAB 1: CREATE JOB ROLE WITH WEIGHT SLIDERS */}
        {(activeTab === "create-job" || (!loading && jobs.length === 0)) && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white">Create Job Role & Scoring Rubric</h2>
              <p className="text-sm text-slate-400 mt-1">
                Paste the Job Description and customize category weights for this specific role.
              </p>
            </div>

            <form onSubmit={handleCreateJob} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Job Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Senior Full-Stack AI Engineer"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Location / Remote Policy</label>
                  <input
                    type="text"
                    value={jobLocation}
                    onChange={(e) => setJobLocation(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Department</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Seniority</label>
                    <input
                      type="text"
                      value={seniority}
                      onChange={(e) => setSeniority(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Min Exp (Yrs)</label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={minExp}
                      onChange={(e) => setMinExp(Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Must-Have Skills (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={mustHaveSkills}
                    onChange={(e) => setMustHaveSkills(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Nice-to-Have Skills (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={niceToHaveSkills}
                    onChange={(e) => setNiceToHaveSkills(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Job Description (JD) *</label>
                <textarea
                  required
                  rows={5}
                  placeholder="Paste the complete job description, responsibilities, and qualifications..."
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Configurable Scoring Weights */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Sliders className="h-4 w-4 text-indigo-400" />
                    Configurable Category Weights
                  </div>
                  <span
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      totalWeight === 100
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    Total: {totalWeight}%
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(Object.keys(weights) as Array<keyof ScoringWeights>).map((key) => (
                    <div key={key} className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                      <div className="flex justify-between text-xs text-slate-300 capitalize mb-1">
                        <span>{key}</span>
                        <span className="font-bold text-indigo-400">{weights[key]}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={60}
                        step={5}
                        value={weights[key]}
                        onChange={(e) =>
                          setWeights({ ...weights, [key]: Number(e.target.value) })
                        }
                        className="w-full accent-indigo-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={creatingJob}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {creatingJob ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {creatingJob ? "Saving Job Role..." : "Create Job & Proceed to Resume Upload"}
              </button>
            </form>
          </section>
        )}

        {/* TAB 2: MULTI-RESUME UPLOADER (DRAG & DROP + MULTI-SELECT BATCHING) */}
        {activeTab === "upload" && activeJob && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-3xl mx-auto">
            <h2 className="text-xl font-bold text-white">
              Upload Candidate Resumes for <span className="text-indigo-400">{activeJob.title}</span>
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Drag and drop multiple resumes at once, or select multiple files (.pdf, .docx, .doc, .txt).
            </p>

            <form onSubmit={handleUploadResumes} className="mt-6 space-y-5">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const dropped = Array.from(e.dataTransfer.files || []);
                  if (dropped.length > 0) appendFiles(dropped);
                }}
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition ${
                  isDragging
                    ? "border-indigo-400 bg-indigo-500/10"
                    : "border-slate-700 hover:border-indigo-500 bg-slate-800/40"
                }`}
              >
                <Upload className="h-10 w-10 text-indigo-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-white">
                  Drag &amp; drop multiple resumes here, or click &ldquo;Choose Files&rdquo;
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Hold <span className="text-slate-200 font-semibold">Ctrl</span> or{" "}
                  <span className="text-slate-200 font-semibold">Shift</span> in the file picker to select multiple resumes at once, or add batches repeatedly.
                </p>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.txt,.md"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files || []);
                    if (picked.length > 0) appendFiles(picked);
                    e.target.value = "";
                  }}
                  className="mt-4 text-xs text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
                />

                {files.length > 0 && (
                  <div className="mt-5 space-y-2">
                    <div className="flex items-center justify-between text-xs text-emerald-400 font-medium px-1">
                      <span>{files.length} resume(s) queued for batch screening</span>
                      <button
                        type="button"
                        onClick={() => setFiles([])}
                        className="text-slate-400 hover:text-rose-400 underline"
                      >
                        Clear all
                      </button>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      {files.map((f) => (
                        <span
                          key={f.name}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="max-w-[200px] truncate">{f.name}</span>
                          <button
                            type="button"
                            onClick={() => setFiles((prev) => prev.filter((item) => item.name !== f.name))}
                            className="ml-1 text-slate-400 hover:text-rose-400 font-bold"
                            title="Remove file"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-800 pt-5 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Or Paste Raw Resume Text (Quick Demo Mode)
                </p>
                <input
                  type="text"
                  placeholder="Candidate Filename / Label (e.g., Aditya_J_Resume.txt)"
                  value={pastedName}
                  onChange={(e) => setPastedName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <textarea
                  rows={5}
                  placeholder="Paste full candidate resume text here..."
                  value={pastedResumeText}
                  onChange={(e) => setPastedResumeText(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {uploadStatus && (
                <div className="p-3.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 text-sm flex items-center gap-2">
                  {uploading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
                  <span>{uploadStatus}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={uploading || (files.length === 0 && !pastedResumeText.trim())}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Screening {files.length + (pastedResumeText.trim() ? 1 : 0)} Candidate(s) in Parallel...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Screen &amp; Rank {files.length + (pastedResumeText.trim() ? 1 : 0) || ""} Candidate(s)
                  </>
                )}
              </button>
            </form>
          </section>
        )}

        {/* TAB 3: RANKED CANDIDATE RESULTS + SIDE-BY-SIDE REPORT */}
        {activeTab === "shortlist" && activeJob && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Ranked Shortlist Table */}
            <div className={`${selectedCandidate ? "lg:col-span-6" : "lg:col-span-12"} space-y-4`}>
              {/* Filter Bar */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    placeholder="Filter by candidate name, role, or matched skill..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <select
                  value={minScoreFilter}
                  onChange={(e) => setMinScoreFilter(Number(e.target.value))}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200"
                >
                  <option value={0}>All Scores (0+)</option>
                  <option value={85}>Strong Match (85+)</option>
                  <option value={70}>Interview Fit (70+)</option>
                  <option value={55}>Maybe+ (55+)</option>
                </select>
                <select
                  value={recFilter}
                  onChange={(e) => setRecFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200"
                >
                  <option value="ALL">All Decisions</option>
                  <option value="Strongly">Strongly Recommend</option>
                  <option value="Recommend">Recommend Interview</option>
                  <option value="Maybe">Maybe</option>
                  <option value="Reject">Reject</option>
                </select>
              </div>

              {filteredCandidates.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
                  <FileText className="h-10 w-10 text-slate-500 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-white">No candidates screened yet for this role</h3>
                  <p className="text-sm text-slate-400 mt-1">
                    Click &ldquo;Upload Resumes&rdquo; to evaluate PDF, DOCX, or TXT resumes against this JD.
                  </p>
                  <button
                    onClick={() => setActiveTab("upload")}
                    className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white"
                  >
                    Upload Resumes Now
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredCandidates.map((cand, idx) => {
                    const ev = cand.evaluation;
                    const score = ev?.overallScore ?? 0;
                    const displayRec = ev?.recruiterOverride || ev?.recommendation || "Pending";
                    const isSelected = selectedCandidate?.id === cand.id;

                    return (
                      <div
                        key={cand.id}
                        onClick={() => setSelectedCandidate(cand)}
                        className={`bg-slate-900 border rounded-2xl p-5 cursor-pointer transition ${
                          isSelected
                            ? "border-indigo-500 ring-1 ring-indigo-500/40"
                            : "border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3.5">
                            <div className="h-9 w-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm text-indigo-400 shrink-0">
                              #{idx + 1}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-bold text-white text-base">{cand.fullName}</h3>
                                <span
                                  className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${getBadgeStyle(
                                    displayRec
                                  )}`}
                                >
                                  {displayRec}
                                </span>
                                {ev?.recruiterOverride && (
                                  <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                    Recruiter Override
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400 mt-1">
                                {cand.currentTitle || "Candidate"}{" "}
                                {cand.currentCompany ? `at ${cand.currentCompany}` : ""} •{" "}
                                {cand.totalExperienceYears} yrs exp • {cand.location || "Location N/A"}
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-2xl font-extrabold text-white">
                              {score}
                              <span className="text-xs font-normal text-slate-400">/100</span>
                            </div>
                            <span className="text-xs text-indigo-400 flex items-center justify-end gap-0.5 mt-0.5">
                              Report <ChevronRight className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        </div>

                        {/* Score Progress Bar */}
                        <div className="w-full bg-slate-800 h-2 rounded-full mt-4 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              score >= 85
                                ? "bg-emerald-500"
                                : score >= 70
                                ? "bg-sky-500"
                                : score >= 55
                                ? "bg-amber-500"
                                : "bg-rose-500"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                          />
                        </div>

                        {/* Matched & Missing Skills Pills */}
                        {ev && (
                          <div className="mt-3.5 flex flex-wrap gap-1.5">
                            {ev.matchedSkills.slice(0, 6).map((s) => (
                              <span
                                key={s}
                                className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                              >
                                ✓ {s}
                              </span>
                            ))}
                            {ev.missingSkills.slice(0, 3).map((s) => (
                              <span
                                key={s}
                                className="text-[11px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20"
                              >
                                ✕ {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Candidate Detail & Evidence Report */}
            {selectedCandidate && selectedCandidate.evaluation && (
              <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 h-fit sticky top-24">
                <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedCandidate.fullName}</h2>
                    <p className="text-xs text-slate-400 mt-1">
                      {selectedCandidate.email || "No email"} • {selectedCandidate.phone || "No phone"}
                    </p>
                    <div className="flex gap-3 mt-2">
                      {selectedCandidate.linkedinUrl && (
                        <a
                          href={selectedCandidate.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-sky-400 hover:underline flex items-center gap-1"
                        >
                          LinkedIn <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {selectedCandidate.githubUrl && (
                        <a
                          href={selectedCandidate.githubUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
                        >
                          GitHub <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedCandidate(null)}
                    className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800"
                  >
                    Close
                  </button>
                </div>

                {/* Human-in-the-Loop Recruiter Override (Compliance Rule 4) */}
                <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-300">
                    Recruiter Final Decision Override:
                  </span>
                  <div className="flex gap-1.5">
                    {["Interview", "Maybe", "Reject"].map((decision) => (
                      <button
                        key={decision}
                        onClick={() => handleRecruiterOverride(selectedCandidate.id, decision)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                          selectedCandidate.evaluation?.recruiterOverride === decision
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-900 text-slate-300 hover:bg-slate-700 border border-slate-700"
                        }`}
                      >
                        {decision}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 7-Dimension Score Breakdown */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                    7-Dimension Score Breakdown
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[
                      { label: "Technical", val: selectedCandidate.evaluation.technicalScore },
                      { label: "Experience", val: selectedCandidate.evaluation.experienceScore },
                      { label: "Domain", val: selectedCandidate.evaluation.domainScore },
                      { label: "Seniority", val: selectedCandidate.evaluation.seniorityScore },
                      { label: "Education", val: selectedCandidate.evaluation.educationScore },
                      { label: "Location", val: selectedCandidate.evaluation.locationScore },
                      { label: "Quality", val: selectedCandidate.evaluation.qualityScore },
                      { label: "Overall", val: selectedCandidate.evaluation.overallScore },
                    ].map((item) => (
                      <div key={item.label} className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700/70">
                        <div className="text-[11px] text-slate-400">{item.label}</div>
                        <div className="text-base font-bold text-white mt-0.5">{item.val}/100</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Verbatim Resume Evidence Quotes */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Direct Resume Evidence Quotes
                  </h3>
                  <ul className="space-y-2">
                    {selectedCandidate.evaluation.evidence.map((quote, i) => (
                      <li
                        key={i}
                        className="text-xs text-slate-200 bg-emerald-500/10 border-l-2 border-emerald-500 px-3 py-2 rounded-r-lg italic"
                      >
                        &ldquo;{quote}&rdquo;
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Strengths & Gaps */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-400 mb-2">
                      Key Strengths
                    </h4>
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      {selectedCandidate.evaluation.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-sky-400 shrink-0 mt-0.5" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2">
                      Gaps & Risks
                    </h4>
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      {[...selectedCandidate.evaluation.gaps, ...selectedCandidate.evaluation.risks].map(
                        (g, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            {i < selectedCandidate.evaluation!.gaps.length ? (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                            )}
                            <span>{g}</span>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                </div>

                {/* AI Explanation */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Evaluation Rationale & Compliance Note
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-slate-800/50 p-3 rounded-xl border border-slate-800">
                    {selectedCandidate.evaluation.explanation}
                  </p>
                </div>

                {/* Tailored Interview Questions */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-2">
                    AI-Generated Interview Focus Questions
                  </h3>
                  <ol className="space-y-2 list-decimal list-inside text-xs text-slate-200 bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                    {selectedCandidate.evaluation.interviewQuestions.map((q, i) => (
                      <li key={i} className="leading-relaxed">
                        {q}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}