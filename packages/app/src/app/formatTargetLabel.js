export function formatTargetLabel(target) {
  const lat = `${Math.abs(target.lat).toFixed(2)}\u00B0${target.lat >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(target.lon).toFixed(2)}\u00B0${target.lon >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lon}`;
}
