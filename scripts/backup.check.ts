// Self-check for the backup reminder: when it shows, and that it never nags twice in a few days.
import assert from 'node:assert/strict';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
const { backupNudge, noteBackup } = await import('../src/lib/backupNudge.ts');
const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 25);

assert.equal(backupNudge(4, now), null, 'too few photos to bother');
assert.match(backupNudge(12, now) ?? '', /12 photos live only in this browser/);
assert.equal(backupNudge(12, now + DAY), null, 'not again the next day');

store.clear();
noteBackup(20); // backed up "now" (real clock), then pretend time passes
const at = JSON.parse(store.get('delineate-last-backup')!).at as number;
assert.equal(backupNudge(25, at + 10 * DAY), null, 'recent backup: quiet');
assert.match(backupNudge(25, at + 40 * DAY) ?? '', /40 days since your last backup, and you have 5 new photos/);
store.delete('delineate-backup-nudged');
assert.equal(backupNudge(20, at + 40 * DAY), null, 'nothing new since the backup: quiet');
console.log('backup reminder ok');
