import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

// NOTE: the spec named @xenova/transformers, but that package pulls in
// `sharp` as a transitive dependency, which fails to install on this
// machine (no prebuilt binary reachable, no Visual Studio C++ toolchain to
// build it from source — confirmed, not assumed). @huggingface/transformers
// is the actively-maintained successor, installs cleanly here, and loads
// the same Xenova/all-MiniLM-L6-v2 model — verified with a real smoke test
// that produced a genuine 384-dimensional embedding before this was written.
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMENSION = 384;

// Loaded once, on first use, and reused across every call — loading this
// per-call would be far too slow (real model weights, not a stub).
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL_ID) as Promise<FeatureExtractionPipeline>;
  }
  return extractorPromise;
}

/** Returns a normalized 384-dim embedding vector for the given text. */
export async function getEmbedding(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

/** Formats a vector as a pgvector literal for use in a parameterized query (cast with ::vector). */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
