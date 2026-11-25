import { DatabaseBackup, HardDrive, MapPin, ShieldCheck, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { askPersist, createBackup, formatBytes, readBackup, storageInfo, type RestorePlan, type StorageInfo } from '../lib/backup';
import { downloadBlob } from '../lib/utils';
import { Toggle } from './ui';
import { isGeoOn, setGeoOn } from '../lib/place';
import { lastBackup, noteBackup } from '../lib/backupNudge';

/** Customise → Data: what is stored, keeping it, and moving it to another device. */
export default function DataPanel({
  counts,
  notify,
}: {
  counts: { photos: number; journals: number; collections: number };
  notify: (m: string, tone?: 'default' | 'warning') => void;
}) {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [withSettings, setWithSettings] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [geo, setGeo] = useState(isGeoOn);
  const [last, setLast] = useState(lastBackup);
  const toggleGeo = (on: boolean) => {
    if (!on || !navigator.geolocation) {
      setGeoOn(false);
      setGeo(false);
      if (on) notify('This browser cannot share a location.', 'warning');
      return;
    }
    // ask now, so the permission prompt never interrupts a shot
    navigator.geolocation.getCurrentPosition(
      () => {
        setGeoOn(true);
        setGeo(true);
        notify('New camera shots will remember where they were taken.');
      },
      () => notify('Location was not allowed. You can allow it in the browser’s site settings.', 'warning'),
      { timeout: 10000, maximumAge: 300000 },
    );
  };
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => void storageInfo().then(setInfo);
  useEffect(refresh, []);

  const backup = async () => {
    setProgress(0);
    try {
      const { blob, counts: c } = await createBackup((p) => setProgress(p));
      downloadBlob(blob, `delineate-backup-${new Date().toISOString().slice(0, 10)}.zip`);
      noteBackup(c.photos);
      setLast(lastBackup());
      notify(`Backup ready: ${c.photos} photos, ${c.journals} journals, ${c.collections} albums & keepsakes (${formatBytes(c.bytes)}).`);
    } catch (error) {
      console.error(error);
      notify('The backup could not be made. Check free space and try again.', 'warning');
    } finally {
      setProgress(null);
    }
  };
  const pick = async (f: File) => {
    try {
      setPlan(await readBackup(f));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'That backup could not be read.', 'warning');
    }
  };
  const restore = async () => {
    if (!plan) return;
    setRestoring(true);
    try {
      await plan.apply(withSettings);
      notify('Restored. Reloading…');
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      console.error(error);
      notify('Restore stopped part-way — nothing on this device was deleted. Free some space and try again.', 'warning');
      setRestoring(false);
    }
  };
  const used = info?.quota ? Math.min(1, info.used / info.quota) : 0;

  return (
    <div className="dp">
      <section className="dp-card">
        <h4>
          <HardDrive size={15} /> What is stored here
        </h4>
        <p>
          Everything lives in this browser on this device: {counts.photos} photos (with their originals and edit settings), {counts.journals} journals, and{' '}
          {counts.collections} albums, capsules, walls and yearbooks. Nothing is uploaded.
        </p>
        {info?.supported && (
          <div className="dp-meter" aria-label={`${formatBytes(info.used)} used of ${formatBytes(info.quota)}`}>
            <i style={{ width: `${Math.max(2, used * 100)}%` }} />
            <span>
              {formatBytes(info.used)} used · {formatBytes(info.quota)} available to Delineate
            </span>
          </div>
        )}
        <div className="dp-row">
          <span>
            <ShieldCheck size={14} /> {info?.persisted ? 'Protected storage is on — the browser will not clear it to save space.' : 'The browser may clear this storage if the device runs low on space.'}
          </span>
          {!info?.persisted && (
            <button
              type="button"
              className="button button-outline"
              onClick={() =>
                void askPersist().then((ok) => {
                  refresh();
                  notify(ok ? 'Storage is now protected.' : 'The browser declined. Installing the app usually allows it — and keep a backup.', ok ? 'default' : 'warning');
                })
              }
            >
              Protect storage
            </button>
          )}
        </div>
      </section>

      <section className="dp-card">
        <h4>
          <MapPin size={15} /> Location tags
        </h4>
        <p>Off by default. When on, each new camera shot keeps the coordinates where it was taken, shown in the photo’s details. They stay in this browser like everything else.</p>
        <Toggle checked={geo} onChange={toggleGeo} label="Save location with new shots" />
      </section>

      <section className="dp-card">
        <h4>
          <DatabaseBackup size={15} /> Backup
        </h4>
        <p>One .zip with every photo, original, journal, recipe, album, capsule and wall, plus your settings. Clearing browser data cannot touch it.</p>
        <p className="dp-last">
          {last
            ? `Last backup: ${new Date(last.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${Math.max(0, counts.photos - last.count)} new photos since`
            : 'No backup yet on this device.'}
        </p>
        <button type="button" className="button button-dark" onClick={() => void backup()} disabled={progress !== null}>
          <DatabaseBackup size={14} /> {progress === null ? 'Download backup' : `Packing… ${Math.round(progress)}%`}
        </button>
        {progress !== null && (
          <div className="dp-meter is-progress">
            <i style={{ width: `${progress}%` }} />
          </div>
        )}
      </section>

      <section className="dp-card">
        <h4>
          <Upload size={15} /> Restore
        </h4>
        {!plan ? (
          <>
            <p>Bring a backup onto this device. It is checked first, then merged — nothing already here is deleted.</p>
            <button type="button" className="button button-outline" onClick={() => file.current?.click()}>
              <Upload size={14} /> Choose a backup…
            </button>
          </>
        ) : (
          <div className="dp-plan">
            <p>
              <b>Backup checked.</b> Made {plan.createdAt ? new Date(plan.createdAt).toLocaleString() : 'at an unknown time'} with Delineate {plan.app}.
            </p>
            <ul>
              <li>{plan.counts.photos} photos</li>
              <li>{plan.counts.journals} journals</li>
              <li>{plan.counts.recipes} Process presets</li>
              <li>{plan.counts.collections} albums & keepsakes</li>
              <li>{plan.counts.media} image files · {formatBytes(plan.counts.bytes)}</li>
            </ul>
            <Toggle checked={withSettings} onChange={setWithSettings} label={`Also restore ${plan.settings} settings (theme, sounds, recipes…)`} />
            <div className="dp-row">
              <button type="button" className="button button-outline" onClick={() => setPlan(null)} disabled={restoring}>
                Cancel
              </button>
              <button type="button" className="button button-dark" onClick={() => void restore()} disabled={restoring}>
                {restoring ? 'Restoring…' : 'Restore now'}
              </button>
            </div>
          </div>
        )}
        <input
          ref={file}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void pick(f);
          }}
        />
      </section>
    </div>
  );
}
