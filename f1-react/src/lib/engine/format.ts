// ─── Formatadores de tempo ────────────────────────────────────────────────────

// Segundos → "m:ss.mmm" (ex: 71.861 → "1:11.861"). null → travessão.
export function fmtTime(secs: number | null): string {
  if (secs == null) return '—';
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
}

// Gap em segundos → "+X.XXXs" (ou "—" para líder / null).
export function fmtGap(gap: number | null): string {
  if (gap == null || gap === 0) return '—';
  return (gap > 0 ? '+' : '') + gap.toFixed(3) + 's';
}

// Tempo de setor → 3 casas decimais, null → travessão.
export function fmtSec(s: number | null): string {
  return s != null ? s.toFixed(3) : '—';
}
