import { env } from '../env.js';

// Voyage AI embeddings for semantic search. Called via the REST API (no SDK
// dependency). When VOYAGE_API_KEY is unset the whole feature degrades to text
// search — embed() returns null and callers fall back. voyage-3.5 is 1024-dim
// and multilingual (covers Macedonian/Albanian); dimension must match the
// pgvector column (vector(1024)).
export const EMBED_DIM = 1024;

export function embeddingsEnabled(): boolean {
  return !!env.VOYAGE_API_KEY;
}

// input_type distinguishes a stored document from a search query (asymmetric
// retrieval — Voyage recommends it for better ranking).
export async function embed(text: string, inputType: 'document' | 'query'): Promise<number[] | null> {
  const key = env.VOYAGE_API_KEY;
  if (!key) return null;
  const clean = text.trim().slice(0, 32000); // guard against oversized inputs
  if (!clean) return null;
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: [clean], model: env.VOYAGE_MODEL, input_type: inputType, output_dimension: EMBED_DIM }),
  });
  if (!res.ok) {
    throw new Error(`Voyage embeddings ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const json = (await res.json()) as { data?: { embedding?: number[] }[] };
  const vec = json.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== EMBED_DIM) {
    throw new Error(`Voyage returned an unexpected embedding (len ${vec?.length ?? 0}).`);
  }
  return vec;
}

// pgvector literal: "[0.1,0.2,...]".
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}
