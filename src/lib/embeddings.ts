import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

let embedderInstance: GoogleGenerativeAIEmbeddings | null = null;

function getEmbedder(): GoogleGenerativeAIEmbeddings {
  if (!embedderInstance) {
    embedderInstance = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY,
      model: process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004",
    });
  }
  return embedderInstance;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const embedder = getEmbedder();
  return embedder.embedQuery(text);
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const embedder = getEmbedder();
  return embedder.embedDocuments(texts);
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}