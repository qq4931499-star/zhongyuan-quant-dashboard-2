export type StockIdentity = { symbol: string; stockName: string };

export function parseAStockIdentitySearch(payload: string, query: string): StockIdentity | null {
  const normalizedQuery = query.trim();
  const encodedHints = payload.match(/v_hint="([^"]*)"/)?.[1];
  if (!encodedHints || encodedHints === "N") return null;
  let hints = "";
  try {
    hints = JSON.parse(`"${encodedHints.replaceAll('"', '\\"')}"`) as string;
  } catch {
    return null;
  }
  const candidates = hints.split("^").map(item => {
    const [, symbol, stockName, , category] = item.split("~");
    return { symbol, stockName, category };
  }).filter(candidate => candidate.category === "GP-A" && /^\d{6}$/.test(candidate.symbol) && candidate.stockName);
  const matched = /^\d{6}$/.test(normalizedQuery)
    ? candidates.find(candidate => candidate.symbol === normalizedQuery)
    : candidates.find(candidate => candidate.stockName === normalizedQuery);
  return matched ? { symbol: matched.symbol, stockName: matched.stockName } : null;
}
