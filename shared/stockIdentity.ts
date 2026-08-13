export type StockIdentity = { symbol: string; stockName: string };

export type StockSearchCandidate = StockIdentity & { pinyin: string };

export function parseAStockSearchCandidates(payload: string): StockSearchCandidate[] {
  const encodedHints = payload.match(/v_hint="([^"]*)"/)?.[1];
  if (!encodedHints || encodedHints === "N") return [];
  let hints = "";
  try {
    hints = JSON.parse(`"${encodedHints.replaceAll('"', '\\"')}"`) as string;
  } catch {
    return [];
  }
  const candidates = hints.split("^").map(item => {
    const [, symbol, stockName, pinyin, category] = item.split("~");
    return { symbol, stockName, pinyin, category };
  }).filter(candidate => candidate.category === "GP-A" && /^\d{6}$/.test(candidate.symbol) && candidate.stockName);
  return Array.from(new Map(candidates.map(candidate => [candidate.symbol, { symbol: candidate.symbol, stockName: candidate.stockName, pinyin: candidate.pinyin ?? "" }])).values());
}

export function parseAStockIdentitySearch(payload: string, query: string): StockIdentity | null {
  const normalizedQuery = query.trim();
  const candidates = parseAStockSearchCandidates(payload);
  const matched = /^\d{6}$/.test(normalizedQuery)
    ? candidates.find(candidate => candidate.symbol === normalizedQuery)
    : candidates.find(candidate => candidate.stockName === normalizedQuery);
  return matched ? { symbol: matched.symbol, stockName: matched.stockName } : null;
}
