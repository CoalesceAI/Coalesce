import type {
  PolymarketMarket,
  KalshiMarket,
  ArbitragePair,
} from "@/types/market";
import { getOpenAIClient } from "@/lib/openai";

// ---------------------------------------------------------------------------
// Cross-platform market matcher.
//
// Three tiers (attempted in order):
//   1. Predexon matched-pairs API (handled in the route, not here)
//   2. OpenAI embeddings + optional GPT-4o-mini verification
//   3. Local text heuristics (synonym + Jaccard + bigram)
// ---------------------------------------------------------------------------

export interface MatchedPairLocal {
  polymarket: PolymarketMarket;
  kalshi: KalshiMarket;
  similarity: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Match markets across platforms. Automatically picks the best available
 * strategy (embeddings → heuristics).
 */
export async function matchMarkets(
  polymarkets: PolymarketMarket[],
  kalshiMarkets: KalshiMarket[],
  minSimilarity = 60,
): Promise<MatchedPairLocal[]> {
  const openai = getOpenAIClient();

  if (openai) {
    try {
      return await matchViaEmbeddings(polymarkets, kalshiMarkets, minSimilarity);
    } catch (err) {
      console.error("Embeddings matching failed, falling back to heuristics:", err);
    }
  }

  return matchViaHeuristics(polymarkets, kalshiMarkets, minSimilarity);
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER 2 — OpenAI Embeddings + GPT Verification
// ═══════════════════════════════════════════════════════════════════════════

const EMBEDDING_MODEL = "text-embedding-3-small";
const COSINE_THRESHOLD = 0.75;
const VERIFY_MODEL = "gpt-4o-mini";
const MAX_VERIFY_PAIRS = 80;

async function embedTexts(texts: string[]): Promise<number[][]> {
  const openai = getOpenAIClient()!;
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

interface EmbeddingCandidate {
  poly: PolymarketMarket;
  kalshi: KalshiMarket;
  cosine: number;
}

async function matchViaEmbeddings(
  polymarkets: PolymarketMarket[],
  kalshiMarkets: KalshiMarket[],
  minSimilarity: number,
): Promise<MatchedPairLocal[]> {
  const polyTitles = polymarkets.map((m) => m.title);
  const kalshiTitles = kalshiMarkets.map((m) => m.title);
  const allTitles = [...polyTitles, ...kalshiTitles];

  const allEmbeddings = await embedTexts(allTitles);
  const polyEmbeddings = allEmbeddings.slice(0, polyTitles.length);
  const kalshiEmbeddings = allEmbeddings.slice(polyTitles.length);

  const candidates: EmbeddingCandidate[] = [];
  for (let i = 0; i < polymarkets.length; i++) {
    for (let j = 0; j < kalshiMarkets.length; j++) {
      const cosine = cosineSimilarity(polyEmbeddings[i], kalshiEmbeddings[j]);
      if (cosine >= COSINE_THRESHOLD) {
        candidates.push({
          poly: polymarkets[i],
          kalshi: kalshiMarkets[j],
          cosine,
        });
      }
    }
  }

  candidates.sort((a, b) => b.cosine - a.cosine);

  // Greedy 1:1 assignment
  const usedPoly = new Set<string>();
  const usedKalshi = new Set<string>();
  const assigned: EmbeddingCandidate[] = [];

  for (const c of candidates) {
    if (usedPoly.has(c.poly.condition_id) || usedKalshi.has(c.kalshi.ticker)) {
      continue;
    }
    usedPoly.add(c.poly.condition_id);
    usedKalshi.add(c.kalshi.ticker);
    assigned.push(c);
  }

  // LLM verification pass
  const verified = await verifyWithLLM(assigned);

  const minCosineForScore = COSINE_THRESHOLD;
  return verified
    .map((v) => ({
      polymarket: v.poly,
      kalshi: v.kalshi,
      similarity: v.llmScore ?? cosineToScore(v.cosine, minCosineForScore),
    }))
    .filter((p) => p.similarity >= minSimilarity);
}

/** Map cosine similarity [threshold..1] → 0..100 score. */
function cosineToScore(cosine: number, threshold: number): number {
  const normalized = (cosine - threshold) / (1 - threshold);
  return Math.round(Math.max(0, Math.min(1, normalized)) * 100);
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER 2b — GPT-4o-mini Verification
// ═══════════════════════════════════════════════════════════════════════════

interface VerifiedCandidate extends EmbeddingCandidate {
  llmScore: number | null;
}

async function verifyWithLLM(
  candidates: EmbeddingCandidate[],
): Promise<VerifiedCandidate[]> {
  const openai = getOpenAIClient();
  if (!openai || candidates.length === 0) {
    return candidates.map((c) => ({ ...c, llmScore: null }));
  }

  const toVerify = candidates.slice(0, MAX_VERIFY_PAIRS);
  const remainder = candidates.slice(MAX_VERIFY_PAIRS);

  const pairsList = toVerify
    .map(
      (c, i) =>
        `${i + 1}. Polymarket: "${c.poly.title}" | Kalshi: "${c.kalshi.title}"`,
    )
    .join("\n");

  try {
    const res = await openai.chat.completions.create({
      model: VERIFY_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a prediction market analyst. For each numbered pair of market titles, determine if they track the SAME real-world outcome and would resolve identically (YES resolves YES on both).

Return JSON: { "results": [ { "index": 1, "match": "exact"|"related"|"unrelated", "score": 0-100, "reason": "brief explanation" }, ... ] }

Scoring guide:
- 95-100: Identical markets, same resolution criteria
- 85-94: Same event, minor wording differences, likely same resolution
- 70-84: Related but potentially different resolution criteria
- 0-69: Different markets or unrelated events

Be strict: markets about the same topic but different specific outcomes (e.g. "Trump wins" vs "Trump nominated") are "related" not "exact".`,
        },
        {
          role: "user",
          content: `Classify these ${toVerify.length} prediction market pairs:\n\n${pairsList}`,
        },
      ],
    });

    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error("Empty LLM response");

    const parsed = JSON.parse(content) as {
      results: Array<{ index: number; match: string; score: number }>;
    };

    const scoreMap = new Map<number, number>();
    for (const r of parsed.results) {
      if (r.match === "unrelated") {
        scoreMap.set(r.index, 0);
      } else {
        scoreMap.set(r.index, r.score);
      }
    }

    const verified: VerifiedCandidate[] = toVerify.map((c, i) => ({
      ...c,
      llmScore: scoreMap.get(i + 1) ?? null,
    }));

    const unverified: VerifiedCandidate[] = remainder.map((c) => ({
      ...c,
      llmScore: null,
    }));

    return [...verified, ...unverified];
  } catch (err) {
    console.error("LLM verification failed, using cosine scores:", err);
    return candidates.map((c) => ({ ...c, llmScore: null }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER 3 — Text Heuristics (no API keys needed)
// ═══════════════════════════════════════════════════════════════════════════

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "shall", "should", "may", "might", "can", "could", "that", "which",
  "who", "whom", "this", "these", "those", "it", "its", "not", "no",
  "if", "then", "than", "so", "as", "up", "out", "about", "into",
  "over", "after", "before", "between", "under", "again", "further",
  "once", "here", "there", "when", "where", "how", "what",
]);

const SYNONYM_GROUPS: string[][] = [
  ["bitcoin", "btc"],
  ["ethereum", "eth"],
  ["solana", "sol"],
  ["dogecoin", "doge"],
  ["xrp", "ripple"],
  ["fed", "federal reserve", "fomc"],
  ["gdp", "gross domestic product"],
  ["cpi", "consumer price index", "inflation"],
  ["president", "presidential"],
  ["election", "elected"],
  ["recession", "economic downturn"],
  ["rate", "rates", "interest rate", "interest rates"],
  ["cut", "cuts", "cutting"],
  ["hike", "hikes", "hiking", "raise"],
  ["nominee", "nominate", "nomination", "nominated"],
  ["chair", "chairman", "chairwoman", "chairperson"],
  ["100k", "100,000", "100000"],
  ["50k", "50,000", "50000"],
  ["trump", "donald trump"],
  ["biden", "joe biden"],
  ["us", "u.s.", "united states", "america"],
  ["uk", "u.k.", "united kingdom", "britain"],
];

const synonymMap = new Map<string, string>();
for (const group of SYNONYM_GROUPS) {
  const canonical = group[0];
  for (const term of group) {
    synonymMap.set(term, canonical);
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9'$%.-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function expandMultiWordSynonyms(text: string): string {
  let result = text.toLowerCase();
  for (const group of SYNONYM_GROUPS) {
    const canonical = group[0];
    for (const term of group) {
      if (term.includes(" ") && result.includes(term)) {
        result = result.replaceAll(term, canonical);
      }
    }
  }
  return result;
}

function normalize(title: string): string[] {
  const expanded = expandMultiWordSynonyms(title);
  return tokenize(expanded)
    .filter((t) => !STOP_WORDS.has(t))
    .map((t) => synonymMap.get(t) ?? t);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function bigramSet(text: string): Set<string> {
  const s = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const grams = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) grams.add(s.slice(i, i + 2));
  return grams;
}

function bigramSimilarity(a: string, b: string): number {
  const gramsA = bigramSet(a);
  const gramsB = bigramSet(b);
  let intersection = 0;
  for (const g of gramsA) if (gramsB.has(g)) intersection++;
  const union = new Set([...gramsA, ...gramsB]).size;
  return union === 0 ? 0 : intersection / union;
}

function extractEntities(title: string): string[] {
  const entities: string[] = [];
  const numbers = title.match(/\b\d[\d,.]*%?\b/g);
  if (numbers) entities.push(...numbers);
  const years = title.match(/\b20\d{2}\b/g);
  if (years) entities.push(...years);
  const months = title.match(
    /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
  );
  if (months) entities.push(...months.map((m) => m.toLowerCase()));
  const capitalWords = title.match(/\b[A-Z][a-z]{2,}\b/g);
  if (capitalWords) {
    entities.push(
      ...capitalWords.map((w) => w.toLowerCase()).filter((w) => !STOP_WORDS.has(w)),
    );
  }
  return entities;
}

function entityOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const e of setA) if (setB.has(e)) intersection++;
  return intersection / Math.min(setA.size, setB.size);
}

function computeHeuristicSimilarity(titleA: string, titleB: string): number {
  const tokensA = normalize(titleA);
  const tokensB = normalize(titleB);
  const jaccard = jaccardSimilarity(tokensA, tokensB);
  const bigram = bigramSimilarity(tokensA.join(" "), tokensB.join(" "));
  const entities = entityOverlap(extractEntities(titleA), extractEntities(titleB));
  return Math.round((jaccard * 0.45 + bigram * 0.30 + entities * 0.25) * 100);
}

function matchViaHeuristics(
  polymarkets: PolymarketMarket[],
  kalshiMarkets: KalshiMarket[],
  minSimilarity: number,
): MatchedPairLocal[] {
  interface Candidate {
    poly: PolymarketMarket;
    kalshi: KalshiMarket;
    score: number;
  }

  const candidates: Candidate[] = [];
  for (const poly of polymarkets) {
    for (const kalshi of kalshiMarkets) {
      const score = computeHeuristicSimilarity(poly.title, kalshi.title);
      if (score >= minSimilarity) {
        candidates.push({ poly, kalshi, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const usedPoly = new Set<string>();
  const usedKalshi = new Set<string>();
  const pairs: MatchedPairLocal[] = [];

  for (const c of candidates) {
    if (usedPoly.has(c.poly.condition_id) || usedKalshi.has(c.kalshi.ticker)) continue;
    usedPoly.add(c.poly.condition_id);
    usedKalshi.add(c.kalshi.ticker);
    pairs.push({ polymarket: c.poly, kalshi: c.kalshi, similarity: c.score });
  }

  return pairs;
}

// ═══════════════════════════════════════════════════════════════════════════
// Convert to API response type
// ═══════════════════════════════════════════════════════════════════════════

export function toArbitragePairs(matches: MatchedPairLocal[]): ArbitragePair[] {
  return matches.map((m) => {
    const polyYes =
      m.polymarket.outcomes.find((o) => o.label === "Yes")?.price ?? null;
    const kalshiYes =
      m.kalshi.outcomes.find((o) => o.label === "Yes")?.bid ??
      m.kalshi.last_price ??
      null;

    const spread =
      polyYes != null && kalshiYes != null
        ? Math.abs(polyYes - kalshiYes)
        : null;

    return {
      polymarketTitle: m.polymarket.title,
      kalshiTitle: m.kalshi.title,
      polymarketYesPrice: polyYes,
      kalshiYesPrice: kalshiYes,
      spread,
      similarity: m.similarity,
      polymarketConditionId: m.polymarket.condition_id,
      polymarketSlug: m.polymarket.market_slug,
      kalshiTicker: m.kalshi.ticker,
      expiresAt: m.polymarket.end_time
        ? Math.floor(new Date(m.polymarket.end_time).getTime() / 1000)
        : null,
    };
  });
}
