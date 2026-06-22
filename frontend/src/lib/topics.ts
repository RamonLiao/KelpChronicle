// Watchlist lives in the URL as repeated `?topic=` params (NOT a comma list): comma-safe and
// makes the legacy single `?topic=X` migrate for free. Memory itself never touches localStorage.
export function parseTopics(search: string, fallback: string): string[] {
  const all = new URLSearchParams(search).getAll('topic').map((s) => s.trim()).filter(Boolean);
  const deduped = [...new Set(all)];
  return deduped.length ? deduped : [fallback];
}

export function writeTopics(url: URL, topics: string[]): void {
  url.searchParams.delete('topic');
  url.searchParams.delete('topics'); // clear any legacy combined param
  for (const t of topics) url.searchParams.append('topic', t);
}
