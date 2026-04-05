export function formatCurrency(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCompact(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPct(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

export function formatDate(value?: string | null) {
  if (!value) return '--';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
