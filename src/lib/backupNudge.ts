// When to remind someone to back up: photos live only in this browser, so a backup is the only safety net.
const LAST = 'delineate-last-backup'; // { at, count } from the last backup made
const NUDGED = 'delineate-backup-nudged'; // when we last reminded

export type LastBackup = { at: number; count: number };

export function lastBackup(): LastBackup | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST) ?? 'null') as LastBackup | null;
    return v && v.at > 0 ? v : null;
  } catch {
    return null;
  }
}
export function noteBackup(count: number) {
  try {
    localStorage.setItem(LAST, JSON.stringify({ at: Date.now(), count }));
  } catch {
    /* private mode */
  }
}

const DAY = 86_400_000;
/** The reminder to show now, or null. Pure apart from reading/writing the two keys. */
export function backupNudge(photoCount: number, now = Date.now()): string | null {
  try {
    if (now - Number(localStorage.getItem(NUDGED) ?? 0) < 3 * DAY) return null;
  } catch {
    return null;
  }
  const last = lastBackup();
  let message: string | null = null;
  if (!last) {
    if (photoCount >= 10) message = `${photoCount} photos live only in this browser. Download a backup so they're safe if it's ever cleared.`;
  } else {
    const days = Math.floor((now - last.at) / DAY);
    const added = photoCount - last.count;
    if (days >= 30 && added > 0) message = `It's been ${days} days since your last backup, and you have ${added} new ${added === 1 ? 'photo' : 'photos'}.`;
  }
  if (message) {
    try {
      localStorage.setItem(NUDGED, String(now));
    } catch {
      /* fine */
    }
  }
  return message;
}
