const tryFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatKurus(kurus: number): string {
  return tryFormatter.format(kurus / 100);
}

export function formatTryFromKurus(kurus: number, _locale?: string): string {
  return formatKurus(kurus);
}
