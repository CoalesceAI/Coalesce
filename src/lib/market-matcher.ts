import type {
  PolymarketMarket,
  KalshiMarket,
  ArbitragePair,
} from "@/types/market";

// ---------------------------------------------------------------------------
// Local cross-platform market matcher.
//
// Replicates what Predexon's LLM-based matching-markets endpoint does, using
// lightweight NLP heuristics instead.  Architecture supports plugging the
// Predexon endpoint back in — see `findArbitragePairs` which tries Predexon
// first and falls back to local matching on 403.
// ---------------------------------------------------------------------------

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

/** Domain-specific synonyms so "BTC"↔"bitcoin", "fed"↔"federal reserve", etc. */
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

// ---- Tokenization & normalization -----------------------------------------

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9'$%.-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function removeStopWords(tokens: string[]): string[] {
  return tokens.filter((t) => !STOP_WORDS.has(t));
}

/** Replace tokens with their canonical synonym form. */
function applySynonyms(tokens: string[]): string[] {
  return tokens.map((t) => synonymMap.get(t) ?? t);
}

/**
 * Multi-word synonym expansion: before tokenizing, replace known multi-word
 * phrases (e.g. "federal reserve" → "fed") at the string level.
 */
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
  return applySynonyms(removeStopWords(tokenize(expanded)));
}

// ---- Similarity metrics ---------------------------------------------------

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function bigramSet(text: string): Set<string> {
  const s = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const grams = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) {
    grams.add(s.slice(i, i + 2));
  }
  return grams;
}

function bigramSimilarity(a: string, b: string): number {
  const gramsA = bigramSet(a);
  const gramsB = bigramSet(b);
  let intersection = 0;
  for (const g of gramsA) {
    if (gramsB.has(g)) intersection++;
  }
  const union = new Set([...gramsA, ...gramsB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Extract entities likely to be proper nouns, numbers, or dates. */
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
      ...capitalWords
        .map((w) => w.toLowerCase())
        .filter((w) => !STOP_WORDS.has(w)),
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
  for (const e of setA) {
    if (setB.has(e)) intersection++;
  }
  return intersection / Math.min(setA.size, setB.size);
}

// ---- Composite similarity -------------------------------------------------

function computeSimilarity(polyTitle: string, kalshiTitle: string): number {
  const tokensA = normalize(polyTitle);
  const tokensB = normalize(kalshiTitle);

  const jaccard = jaccardSimilarity(tokensA, tokensB);
  const bigram = bigramSimilarity(tokensA.join(" "), tokensB.join(" "));

  const entities = entityOverlap(
    extractEntities(polyTitle),
    extractEntities(kalshiTitle),
  );

  const raw = jaccard * 0.45 + bigram * 0.30 + entities * 0.25;

  return Math.round(raw * 100);
}

// ---- Matching engine ------------------------------------------------------

export interface MatchedPairLocal {
  polymarket: PolymarketMarket;
  kalshi: KalshiMarket;
  similarity: number;
}

/**
 * Find cross-platform matches from two pre-fetched market lists.
 * O(n*m) but both lists are capped (typically 100-200 each) so this is fine.
 */
export function matchMarkets(
  polymarkets: PolymarketMarket[],
  kalshiMarkets: KalshiMarket[],
  minSimilarity = 60,
): MatchedPairLocal[] {
  const pairs: MatchedPairLocal[] = [];

  for (const poly of polymarkets) {
    let bestMatch: { kalshi: KalshiMarket; score: number } | null = null;

    for (const kalshi of kalshiMarkets) {
      const score = computeSimilarity(poly.title, kalshi.title);
      if (score >= minSimilarity) {
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { kalshi, score };
        }
      }
    }

    if (bestMatch) {
      pairs.push({
        polymarket: poly,
        kalshi: bestMatch.kalshi,
        similarity: bestMatch.score,
      });
    }
  }

  pairs.sort((a, b) => b.similarity - a.similarity);

  const usedKalshi = new Set<string>();
  const deduped: MatchedPairLocal[] = [];
  for (const pair of pairs) {
    if (!usedKalshi.has(pair.kalshi.ticker)) {
      usedKalshi.add(pair.kalshi.ticker);
      deduped.push(pair);
    }
  }

  return deduped;
}

// ---- Convert to ArbitragePair ---------------------------------------------

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
