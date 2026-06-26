export function nowIso() {
  return new Date().toISOString();
}

export function hoursBetween(a, b) {
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60);
}

export function addDays(date, days) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString();
}

export function isDue(lastRunAt, intervalHours, currentTime) {
  if (!lastRunAt) {
    return true;
  }
  return hoursBetween(lastRunAt, currentTime) >= intervalHours;
}
