export function isVersionOutdated(current: string, minimum?: string | null): boolean {
  if (!minimum) return false;
  const parse = (v: string) =>
    v
      .split('-')[0]!
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const a = parse(current);
  const b = parse(minimum);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av < bv) return true;
    if (av > bv) return false;
  }
  return false;
}

