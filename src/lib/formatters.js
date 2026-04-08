// Shared display formatters.
//
// formatWeight(value, unit)
//   Renders a weight value the way clients expect:
//     - numeric → "95 lbs" / "42 kg"
//     - text    → as-is, so things like "BW" / "Bodyweight" survive
//     - empty   → ""
//
//   Unit is purely a label — we never convert between lbs and kg. Each
//   client picks their preferred unit in Settings; the value they typed
//   gets shown back with that label.

export function formatWeight(value, unit = 'lbs') {
  if (value === null || value === undefined || value === '') return '';
  const trimmed = String(value).trim();
  if (trimmed === '') return '';
  const n = Number(trimmed);
  if (Number.isFinite(n)) return `${n} ${unit}`;
  return trimmed;
}
