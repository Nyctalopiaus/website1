export function formatCurrency(val) {
  const safeVal = val < 0 ? 0 : val;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(safeVal);
}
