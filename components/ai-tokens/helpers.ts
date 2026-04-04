export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export const OPERATION_LABELS: Record<string, string> = {
  compose: '✉️ Compose',
  reply: '↩️ Reply',
  summary: '📝 Summary',
  rerank: '🔀 Rerank',
};

export const OPERATION_COLORS: Record<string, string> = {
  compose: 'bg-indigo-500/20',
  reply: 'bg-emerald-500/20',
  summary: 'bg-amber-500/20',
  rerank: 'bg-rose-500/20',
};

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
