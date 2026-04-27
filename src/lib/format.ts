/**
 * Trim/collapse whitespace then truncate. `mode='firstBlock'` snaps to the
 * first paragraph (split on blank line) — used for node summaries where we
 * want a clean first thought, not a mid-sentence cut.
 */
export function summarizeText(
  s: string | undefined | null,
  maxLen: number,
  mode: 'inline' | 'firstBlock' = 'inline',
): string {
  if (!s) return '';
  let t: string;
  if (mode === 'firstBlock') {
    t = s.split(/\n\s*\n/)[0]?.trim() ?? '';
  } else {
    t = s.replace(/\s+/g, ' ').trim();
  }
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen).trimEnd() + '…';
}

export function formatTokenUsage(
  usage?: { prompt: number; completion: number },
): string | null {
  if (!usage) return null;
  const total = (usage.prompt ?? 0) + (usage.completion ?? 0);
  if (total < 1000) return `${total} tok`;
  return `${(total / 1000).toFixed(1)}k tok`;
}

export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return formatAbsoluteDate(ts);
}

export function formatAbsoluteTime(ts: number): string {
  const d = new Date(ts);
  return `${formatAbsoluteDate(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatAbsoluteDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const pad = (n: number) => String(n).padStart(2, '0');
