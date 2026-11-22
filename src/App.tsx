import {
  Aperture,
  Archive,
  BookHeart,
  CircleHelp,
  Download,
  FlaskConical,
  Gem,
  HardDrive,
  Keyboard,
  LayoutGrid,
  Lock,
  Palette,
  Accessibility,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  Wand2,
  WifiOff,
} from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { Album, Collection, EditTarget, PhotoRecord } from './types';
import { getAllPhotos, deletePhoto, savePhoto, getAllCollections, saveCollection, deleteCollection, getAllJournals } from './lib/db';
import { loadImage, pad } from './lib/utils';
import { importedRecord } from './lib/importPhoto';
import {
  getSoundPack, haptic, isClickyOn, isHapticsOn, isSoundOn, playTap, setClickyOn, setHapticsOn, setSoundOn, setSoundPack,
  SOUND_PACKS, type SoundPack,
} from './lib/audio';
import CameraView from './components/CameraView';
// Every tab but the camera loads on demand, so the first screen arrives sooner; see the idle preload below.
const LAZY = {
  develop: () => import('./components/DevelopView'),
  process: () => import('./components/ProcessView'),
  library: () => import('./components/LibraryView'),
  journal: () => import('./components/JournalView'),
  collage: () => import('./components/CollageView'),
  art: () => import('./components/ArtStudio'),
  memories: () => import('./components/memories/MemoriesView'),
  data: () => import('./components/DataPanel'),
};
const DevelopView = lazy(LAZY.develop);
const ProcessView = lazy(LAZY.process);
const LibraryView = lazy(LAZY.library);
const JournalView = lazy(LAZY.journal);
const CollageView = lazy(LAZY.collage);
const ArtStudio = lazy(LAZY.art);
const MemoriesView = lazy(LAZY.memories);
const DataPanel = lazy(LAZY.data);
import { ControlsContext, Modal, Range, Spinner, Toast, Toggle, type ControlStyle, type ToastAction } from './components/ui';
import { APP_VERSION, CHANGELOG } from './lib/changelog';

type CzTab = 'look' | 'controls' | 'sound' | 'comfort' | 'data' | 'new';
const CZ_TABS: { id: CzTab; label: string; icon: typeof Palette }[] = [
  { id: 'look', label: 'Look', icon: Palette },
  { id: 'controls', label: 'Controls', icon: SlidersHorizontal },
  { id: 'sound', label: 'Sound', icon: Volume2 },
  { id: 'comfort', label: 'Comfort', icon: Accessibility },
  { id: 'data', label: 'Data', icon: HardDrive },
  { id: 'new', label: 'What’s new', icon: Sparkles },
];
const SEEN_KEY = 'delineate-seen-version';
/** A tiny visual for each button-sound pack. */
const SOUND_GLYPH: Record<SoundPack, string> = {
  classic: '∿', retro: '▚▞', modern: '◦', typewriter: '⌨', bubble: '○', wood: '▭',
};

type Tab = 'camera' | 'develop' | 'process' | 'archive' | 'memories' | 'journal' | 'collage' | 'lab';
type Theme = 'light' | 'dark' | 'vintage' | 'pastel' | 'darkroom' | 'sage' | 'midnight' | 'mono';
type ToastState = { id: number; message: string; tone: 'default' | 'warning'; action?: ToastAction };
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const TABS = [
  { id: 'camera' as const, label: 'Camera', icon: Aperture },
  { id: 'develop' as const, label: 'Develop', icon: FlaskConical },
  { id: 'process' as const, label: 'Process', icon: Wand2 },
  { id: 'archive' as const, label: 'Archive', icon: Archive },
  { id: 'memories' as const, label: 'Memories', icon: Gem },
  { id: 'journal' as const, label: 'Journal', icon: BookHeart },
  { id: 'collage' as const, label: 'Collage', icon: LayoutGrid },
  { id: 'lab' as const, label: 'Art Lab', icon: Sparkles },
];

const THEMES: { id: Theme; label: string; color: string; swatch: string }[] = [
  { id: 'light', label: 'Light', color: '#f2ead9', swatch: 'linear-gradient(135deg,#f2ead9 50%,#20231d 50%)' },
  { id: 'dark', label: 'Dark', color: '#121310', swatch: 'linear-gradient(135deg,#121310 50%,#e07a4f 50%)' },
  { id: 'vintage', label: 'Vintage', color: '#e6d3ad', swatch: 'linear-gradient(135deg,#e6d3ad 50%,#7a3b1d 50%)' },
  { id: 'pastel', label: 'Pastel', color: '#f7eef6', swatch: 'linear-gradient(135deg,#f7eef6 50%,#8b6ccc 50%)' },
  { id: 'darkroom', label: 'Darkroom', color: '#0d0605', swatch: 'linear-gradient(135deg,#0d0605 50%,#ff4a3a 50%)' },
  { id: 'sage', label: 'Sage', color: '#e9eee2', swatch: 'linear-gradient(135deg,#e9eee2 50%,#4f7a5a 50%)' },
  { id: 'midnight', label: 'Midnight', color: '#0e1424', swatch: 'linear-gradient(135deg,#0e1424 50%,#7aa2ff 50%)' },
  { id: 'mono', label: 'Contrast', color: '#ffffff', swatch: 'linear-gradient(135deg,#ffffff 50%,#000000 50%)' },
];
const ACCENTS = ['', '#c65d36', '#d93a2b', '#2f7d6d', '#3f6fd0', '#8d5bd1', '#d9a43a', '#e2568a'];
const CONTROLS: { id: ControlStyle; label: string; note: string }[] = [
  { id: 'modern', label: 'Modern', note: 'Slim virtual sliders' },
  { id: 'tactile', label: 'Vintage tactile', note: 'Chunky faders & push keys' },
  { id: 'knobs', label: 'Rotary knobs', note: 'Every slider becomes a dial' },
];

const FILM_COUNT_KEY = 'nostalgia-film-count';
const THEME_KEY = 'delineate-theme';
const read = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked */
  }
};

function GuideModal({ onClose }: { onClose: () => void }) {
  const steps = [
    ['Camera', '30 cameras in five collections — turn the dial to change collection, spin the wheel to change body. Each has its own buttons, sounds and live look. Power on, hold the shutter to focus, release to shoot; review with W / T or the arrows.'],
    ['Develop', 'Every shot lands on your roll as a negative. Print it by hand in the darkroom: expose, develop, stop, fix, wash and dry — or let the one-hour lab skip it.'],
    ['Process', 'Grade prints with film presets (Portra, CineStill, VHS…) and effects: halation, fisheye, date stamps, double exposures, borders, photo-booth strips.'],
    ['Archive', 'Your private storage. Favourite, search, download, or re-edit a processed frame — its settings are remembered.'],
    ['Memories', 'Camera passport, a daily handful of forgotten frames to rediscover, time capsules, a gallery room, a memory wall and a printable yearbook.'],
    ['Journal', 'Scrapbook books with themed pages, photos, text, doodles and 80+ decorations. Download any book as a PDF.'],
    ['Collage & Art Lab', 'Compose multi-photo layouts, or turn a print into pixel art, swirls, facets or a looping GIF — with picture frames.'],
  ];
  return (
    <Modal title="Welcome to Delineate" eyebrow="Made to remember" wide onClose={onClose}>
      <div className="guide-grid">
        {steps.map(([title, body], i) => (
          <section key={title}>
            <span className="guide-number">{pad(i + 1, 2)}</span>
            <div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </section>
        ))}
      </div>
      <div className="guide-shortcuts">
        <span>
          <Keyboard size={15} /> Shortcuts
        </span>
        <div>
          <kbd>Space</kbd> shutter / expose <kbd>← →</kbd> rock tray <kbd>Ctrl Z</kbd> undo in journal <kbd>Esc</kbd> close
        </div>
      </div>
      <div className="guide-privacy">
        <Lock size={15} />
        <p>
          Everything stays in this browser (IndexedDB) and works offline once installed. Clearing site data erases it — download
          what you want to keep forever.
        </p>
      </div>
      <p className="guide-credit">
        Developed by <b>kpr3306</b> ·{' '}
        <a href="https://github.com/kpr3306-lab" target="_blank" rel="noreferrer">
          github.com/kpr3306-lab
        </a>
      </p>
      <div className="modal-actions">
        <button type="button" className="button button-dark" onClick={onClose}>
          Start remembering
        </button>
      </div>
    </Modal>
  );
}

export default function App() {
  useEffect(() => {
    const t = window.setTimeout(() => Object.values(LAZY).forEach((load) => void load().catch(() => undefined)), 2500);
    return () => window.clearTimeout(t);
  }, []);
  const [tab, setTab] = useState<Tab>('camera');
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [journalCount, setJournalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processTarget, setProcessTarget] = useState<EditTarget | null>(null);
  const [developFocus, setDevelopFocus] = useState<string | null>(null);
  const [artSource, setArtSource] = useState<PhotoRecord | null>(null);
  const [guideOpen, setGuideOpen] = useState(() => !read('delineate-welcomed'));
  const [toast, setToast] = useState<ToastState | null>(null);
  const [filmNumber, setFilmNumber] = useState(1);
  const [theme, setTheme] = useState<Theme>(() => (read(THEME_KEY) as Theme) || 'light');
  const [controls, setControls] = useState<ControlStyle>(() => (read('delineate-controls') as ControlStyle) || 'modern');
  const [accent, setAccent] = useState(() => read('delineate-accent') || '');
  // no saved choice yet → follow the device's "reduce motion" setting
  const [calm, setCalm] = useState(() => {
    const saved = read('delineate-calm');
    return saved === null ? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false : saved === '1';
  });
  const [grain, setGrain] = useState(() => read('delineate-grain') !== '0');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sound, setSound] = useState(isSoundOn());
  const [haptics, setHaptics] = useState(isHapticsOn());
  const [clicky, setClicky] = useState(isClickyOn());
  const [soundPack, setSoundPackState] = useState(getSoundPack());
  const [czTab, setCzTab] = useState<CzTab>('look');
  // returning users get a dot until they read this release's notes; brand-new users have nothing to catch up on
  const [unseen, setUnseen] = useState(() => read('delineate-welcomed') !== null && read(SEEN_KEY) !== APP_VERSION);
  useEffect(() => {
    if (read('delineate-welcomed') === null) write(SEEN_KEY, APP_VERSION);
  }, []);
  useEffect(() => {
    if (!settingsOpen || czTab !== 'new') return;
    write(SEEN_KEY, APP_VERSION);
    setUnseen(false);
  }, [settingsOpen, czTab]);
  const [demo, setDemo] = useState(60);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const photosRef = useRef<PhotoRecord[]>([]);
  const toastTimer = useRef<number | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Measure the real visible height and the fixed bottom tab bar (its height varies with gesture-bar insets,
  // font scaling and browser chrome) so every page ends exactly above the bar instead of under it.
  useEffect(() => {
    const sync = () => {
      const nav = navRef.current;
      const style = document.documentElement.style;
      // turned page (main.tsx): the portrait height it is laid out at, not the landscape window's
      style.setProperty('--vh', document.documentElement.dataset.rot ? style.getPropertyValue('--rot-h') : `${window.innerHeight}px`);
      style.setProperty('--nav-h', nav && getComputedStyle(nav).position === 'fixed' ? `${nav.offsetHeight}px` : '0px');
    };
    sync();
    const observer = new ResizeObserver(sync);
    // border-box: the safe-area inset is padding, which a content-box observer would miss
    if (navRef.current) observer.observe(navRef.current, { box: 'border-box' });
    window.addEventListener('resize', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);

  const developed = useMemo(() => photos.filter((p) => p.developed !== false), [photos]);
  const roll = useMemo(() => photos.filter((p) => p.developed === false).sort((a, b) => a.createdAt - b.createdAt), [photos]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // albums, capsules, walls and yearbooks
  useEffect(() => {
    getAllCollections().then(setCollections, (error) => console.error(error));
    getAllJournals().then((j) => setJournalCount(j.length), () => undefined);
  }, []);
  const handleSaveCollection = useCallback(async (item: Collection) => {
    setCollections((current) => [item, ...current.filter((c) => c.id !== item.id)]);
    await saveCollection(item);
  }, []);
  const handleDeleteCollection = useCallback(async (id: string) => {
    setCollections((current) => current.filter((c) => c.id !== id));
    await deleteCollection(id);
  }, []);
  const albums = useMemo(() => collections.filter((c): c is Album => c.type === 'album').sort((a, b) => a.createdAt - b.createdAt), [collections]);

  const notify = useCallback((message: string, tone: 'default' | 'warning' = 'default', action?: ToastAction) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, tone, action });
    // an undo-able message stays a little longer so there is time to reach the button
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 7000 : 3800);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAllPhotos()
      .then((records) => {
        if (cancelled) return;
        setPhotos(records);
        photosRef.current = records;
        const stored = Number(read(FILM_COUNT_KEY));
        const next = stored > 0 ? stored : records.length + 1;
        setFilmNumber(next);
        write(FILM_COUNT_KEY, String(next));
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) notify('The local archive could not be opened in this browser.', 'warning');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [notify]);

  // Theme, install prompt, online status, and a soft click + buzz on every button.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', (THEMES.find((t) => t.id === theme) ?? THEMES[0]).color);
    write(THEME_KEY, theme);
  }, [theme]);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.controls = controls;
    root.dataset.motion = calm ? 'calm' : 'full';
    root.dataset.grain = grain ? 'on' : 'off';
    write('delineate-grain', grain ? '1' : '0');
    // derived shades mix toward the theme's ink/paper, so they read on light and dark themes alike
    const shades: [string, string][] = [
      ['--accent', accent],
      ['--accent-deep', `color-mix(in srgb, ${accent} 78%, var(--ink))`],
      ['--accent-soft', `color-mix(in srgb, ${accent} 32%, var(--paper))`],
    ];
    for (const [k, v] of shades) {
      if (accent) root.style.setProperty(k, v);
      else root.style.removeProperty(k);
    }
    write('delineate-controls', controls);
    write('delineate-accent', accent);
    write('delineate-calm', calm ? '1' : '0');
  }, [controls, accent, calm, grain]);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPrompt);
    };
    const onOnline = () => setOffline(!navigator.onLine);
    const onTap = (e: PointerEvent) => {
      const button = (e.target as HTMLElement).closest('button');
      // sound-pack cards play their own preview on click instead
      if (!button || button.disabled || button.closest('.knob, .dc-shutter, .dv-expose, .cz-sounds')) return;
      playTap();
      haptic(4);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOnline);
    document.addEventListener('pointerdown', onTap);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOnline);
      document.removeEventListener('pointerdown', onTap);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [tab]);

  const go = (next: Tab) => {
    setTab(next);
    haptic(6);
  };

  const handleSave = useCallback(async (record: PhotoRecord) => {
    const exists = photosRef.current.some((photo) => photo.id === record.id);
    await savePhoto(record);
    setPhotos((current) =>
      (exists ? current.map((photo) => (photo.id === record.id ? record : photo)) : [record, ...current]).sort(
        (a, b) => b.createdAt - a.createdAt,
      ),
    );
    if (!exists && record.kind === 'still' && record.developed === false) {
      setFilmNumber((current) => {
        const next = current + 1;
        write(FILM_COUNT_KEY, String(next));
        return next;
      });
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deletePhoto(id);
    setPhotos((current) => current.filter((photo) => photo.id !== id));
    setArtSource((current) => (current?.id === id ? null : current));
    setProcessTarget((current) => (current?.record?.id === id ? null : current));
  }, []);

  const openImport = useCallback(() => fileInputRef.current?.click(), []);
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('That file is not an image. Try a JPG, PNG, WEBP or GIF.', 'warning');
      return;
    }
    if (tab === 'process') {
      setProcessTarget({ blob: file, fileName: file.name });
      return;
    }
    // anywhere else, stay put: file the picture in the archive (and open it in the Art Lab when that's where you are)
    const here = tab;
    loadImage(file)
      .then(async (img) => {
        const record = await importedRecord(file, img);
        await handleSave(record);
        if (here === 'lab') setArtSource(record);
        notify(here === 'lab' ? 'Imported and opened in the Art Lab.' : 'Imported to your archive.');
      })
      .catch(() => notify('That image could not be opened.', 'warning'));
  };

  // the Art Lab editor closes when you leave the tab
  useEffect(() => {
    if (tab !== 'lab') setArtSource(null);
  }, [tab]);

  const openProcess = (record: PhotoRecord) => {
    setProcessTarget({ record, blob: record.blob, fileName: record.name });
    setTab('process');
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  };


  return (
    <ControlsContext.Provider value={controls}>
    <div className={`app-shell ${tab === 'camera' ? 'is-camera' : ''}`}>
      <div className="ambient-grain" aria-hidden="true" />
      <header className="site-header">
        <button className="brand" type="button" onClick={() => go('camera')}>
          <span className="brand-mark">
            <img src="/brand-mark.png" alt="" />
          </span>
          <span className="brand-type">
            <strong>Delineate</strong>
            <span>MADE TO REMEMBER</span>
          </span>
        </button>

        <nav ref={navRef} className="main-nav" aria-label="Sections">
          {TABS.map((item) => {
            const Icon = item.icon;
            const badge = item.id === 'develop' ? roll.length : item.id === 'archive' ? developed.length : 0;
            return (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? 'is-active' : ''}
                onClick={() => go(item.id)}
                aria-current={tab === item.id ? 'page' : undefined}
              >
                <Icon size={16} />
                <span className="nav-label">{item.label}</span>
                {badge > 0 && <span className={`nav-count ${item.id === 'develop' ? 'is-hot' : ''}`}>{pad(badge, 2)}</span>}
              </button>
            );
          })}
        </nav>

        <div className="header-right">
          {offline && (
            <span className="offline-pill" title="You are offline — everything still works locally">
              <WifiOff size={13} /> Offline
            </span>
          )}
          <div className="header-roll">
            <span>ROLL 01</span>
            <strong>{pad(filmNumber, 3)} EXP</strong>
          </div>
          {installPrompt && (
            <button className="round-icon" type="button" onClick={() => void install()} title="Install Delineate" aria-label="Install app">
              <Download size={17} />
            </button>
          )}
          {/* the camera puts its body description here on phones */}
          <span id="header-cam-info" className="header-cam-info" />
          <button
            className={`round-icon ${unseen ? 'has-news' : ''}`}
            type="button"
            onClick={() => {
              if (unseen) setCzTab('new'); // open straight onto the release notes the first time
              setSettingsOpen(true);
            }}
            title={unseen ? 'Customise · new features' : 'Customise'}
            aria-label={unseen ? 'Customise themes, controls and sound. New features to see' : 'Customise themes, controls and sound'}
          >
            <Palette size={17} />
          </button>
          <button className="round-icon header-help" type="button" onClick={() => setGuideOpen(true)} aria-label="Open guide" title="Guide">
            <CircleHelp size={18} />
          </button>
        </div>
      </header>

      <main className="app-main" key={tab}>
        <Suspense fallback={<div className="app-loading"><Spinner label="Opening…" /></div>}>
        {loading ? (
          <div className="app-loading">
            <div className="loading-camera">
              <Aperture size={36} strokeWidth={1} className="slow-spin" />
            </div>
            <Spinner label="Loading the roll…" />
          </div>
        ) : tab === 'camera' ? (
          <CameraView
            filmNumber={filmNumber}
            photos={photos}
            undeveloped={roll.length}
            onSave={handleSave}
            notify={notify}
            onOpenDevelop={() => go('develop')}
            onNavigate={(id) => go(id as Tab)}
          />
        ) : tab === 'develop' ? (
          <DevelopView
            roll={roll}
            focusId={developFocus}
            onSave={handleSave}
            notify={notify}
            onCamera={() => go('camera')}
            onProcess={openProcess}
            library={developed}
          />
        ) : tab === 'process' ? (
          <ProcessView
            photos={developed}
            target={processTarget}
            onTarget={setProcessTarget}
            onSave={handleSave}
            onImport={openImport}
            notify={notify}
          />
        ) : tab === 'archive' ? (
          <LibraryView
            photos={photos}
            onEdit={openProcess}
            onArt={(record) => {
              setArtSource(record);
              go('lab');
            }}
            onDevelop={(record) => {
              setDevelopFocus(record.id);
              go('develop');
            }}
            onFavorite={(record) => void handleSave({ ...record, favorite: !record.favorite })}
            onRename={(record, name) => void handleSave({ ...record, name })}
            onRestore={async (records) => {
              // straight back into storage: going through handleSave would count a restored negative as a new shot
              for (const r of records) await savePhoto(r);
              setPhotos((current) => [...current.filter((p) => !records.some((r) => r.id === p.id)), ...records].sort((a, b) => b.createdAt - a.createdAt));
              notify(records.length === 1 ? `${records[0].name} is back.` : `${records.length} frames are back.`);
            }}
            onDelete={handleDelete}
            onImport={openImport}
            onCamera={() => go('camera')}
            notify={notify}
            albums={albums}
            onSaveCollection={handleSaveCollection}
            onDeleteCollection={handleDeleteCollection}
          />
        ) : tab === 'memories' ? (
          <MemoriesView
            photos={developed}
            allPhotos={photos}
            collections={collections}
            onSaveCollection={handleSaveCollection}
            onDeleteCollection={handleDeleteCollection}
            onSavePhoto={handleSave}
            onUseCamera={(id) => {
              write('delineate-skin', id);
              go('camera');
            }}
            onBackup={() => {
              setCzTab('data');
              setSettingsOpen(true);
            }}
            notify={notify}
          />
        ) : tab === 'journal' ? (
          <JournalView photos={developed} notify={notify} />
        ) : tab === 'collage' ? (
          <CollageView photos={developed} onSave={handleSave} notify={notify} />
        ) : (
          <ArtStudio
            photos={developed}
            source={artSource}
            onSource={setArtSource}
            onSave={handleSave}
            onImport={openImport}
            notify={notify}
          />
        )}
        </Suspense>
      </main>


      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="visually-hidden"
        onChange={handleFile}
        aria-label="Import a photo from your device"
      />

      {guideOpen && (
        <GuideModal
          onClose={() => {
            setGuideOpen(false);
            write('delineate-welcomed', '1');
          }}
        />
      )}
      {settingsOpen && (
        <Modal title="Make it yours" eyebrow="Customise" wide onClose={() => setSettingsOpen(false)}>
          <div className="segmented cz-tabs" role="tablist" aria-label="Customise sections">
            {CZ_TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={czTab === t.id} className={czTab === t.id ? 'is-active' : ''} onClick={() => setCzTab(t.id)}>
                <t.icon size={13} /> {t.label}
                {t.id === 'new' && unseen && <i className="cz-dot" aria-label="unread" />}
              </button>
            ))}
          </div>
          <div className="cz-panel" role="tabpanel" key={czTab}>
          {czTab === 'look' && (
          <>
          <div className="cz-section">
            <span className="eyebrow">Theme</span>
            <div className="cz-grid">
              {THEMES.map((t) => (
                <button key={t.id} type="button" className={`cz-card ${theme === t.id ? 'is-active' : ''}`} onClick={() => setTheme(t.id)}>
                  <span className="cz-swatch" style={{ background: t.swatch }} />
                  <strong>{t.label}</strong>
                </button>
              ))}
            </div>
          </div>
          <div className="cz-section">
            <span className="eyebrow">Accent colour</span>
            <div className="jr-swatches">
              {ACCENTS.map((c) => (
                <button
                  key={c || 'theme'}
                  type="button"
                  className={accent === c ? 'is-active' : ''}
                  style={{ background: c || 'conic-gradient(#c65d36 0 25%, #e07a4f 0 50%, #a98bd8 0 75%, #ff4a3a 0)' }}
                  onClick={() => setAccent(c)}
                  aria-label={c ? `Accent ${c}` : 'Theme default accent'}
                  title={c || 'Theme default'}
                />
              ))}
              <input type="color" value={accent || '#c65d36'} onChange={(e) => setAccent(e.target.value)} aria-label="Custom accent colour" />
            </div>
          </div>
          </>
          )}
          {czTab === 'controls' && (
          <div className="cz-section">
            <span className="eyebrow">Slider style</span>
            <div className="cz-grid">
              {CONTROLS.map((c) => (
                <button key={c.id} type="button" className={`cz-card cz-control-${c.id} ${controls === c.id ? 'is-active' : ''}`} onClick={() => setControls(c.id)}>
                  <span className="cz-preview" aria-hidden="true"><i /></span>
                  <strong>{c.label}</strong>
                  <small>{c.note}</small>
                </button>
              ))}
            </div>
            {controls !== 'modern' && (
              <div className="cz-clicky">
                <Toggle checked={clicky} onChange={(v) => { setClickyOn(v); setClicky(v); }} label={controls === 'knobs' ? 'Clicky knob detents' : 'Clicky fader detents'} />
                <small>{clicky ? 'Sliders click and buzz through 20 notches as you drag.' : 'Sliders glide silently.'}</small>
              </div>
            )}
            <span className="eyebrow">Try it</span>
            <div className="cz-demo">
              <Range label="Demo" min={0} max={100} value={demo} onChange={setDemo} />
            </div>
          </div>
          )}
          {czTab === 'sound' && (
          <div className="cz-section">
            <div className="cz-toggles">
              <Toggle checked={sound} onChange={(v) => { setSoundOn(v); setSound(v); }} label="Sounds" />
              <Toggle checked={haptics} onChange={(v) => { setHapticsOn(v); setHaptics(v); if (v) navigator.vibrate?.(20); }} label="Haptics (Android)" />
            </div>
            <span className="eyebrow">Button sounds</span>
            <div className={`cz-grid cz-sounds ${sound ? '' : 'is-muted'}`}>
              {SOUND_PACKS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`cz-card ${soundPack === p.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setSoundPack(p.id);
                    setSoundPackState(p.id);
                    playTap(p.id);
                    haptic(4);
                  }}
                >
                  <span className="cz-wave" aria-hidden="true">{SOUND_GLYPH[p.id]}</span>
                  <strong>{p.label}</strong>
                  <small>{p.note}</small>
                </button>
              ))}
            </div>
            <small className="cz-note">{sound ? 'Tap a pack to hear it. Every button in the app uses it.' : 'Sounds are off. Turn them on to hear the packs.'}</small>
          </div>
          )}
          {czTab === 'comfort' && (
          <div className="cz-section">
            <div className="cz-rows">
              <div><Toggle checked={calm} onChange={setCalm} label="Calm motion" /><small>Turns off page turns, pulses and other animation.</small></div>
              <div><Toggle checked={grain} onChange={setGrain} label="Paper grain" /><small>The faint film-grain texture over the whole app.</small></div>
            </div>
          </div>
          )}
          {czTab === 'data' && (
            <Suspense fallback={<Spinner />}>
              <DataPanel counts={{ photos: photos.length, journals: journalCount, collections: collections.length }} notify={notify} />
            </Suspense>
          )}
          {czTab === 'new' && (
          <div className="cz-news">
            {CHANGELOG.map((r) => (
              <article key={r.version} className="cz-release">
                <header>
                  <span className="cz-version">v{r.version}</span>
                  <span className="eyebrow">{r.date}{r.version === APP_VERSION ? ' · this version' : ''}</span>
                </header>
                <h3>{r.title}</h3>
                {r.areas.map((a) => (
                  <section key={a.name}>
                    <span className="eyebrow">{a.name}</span>
                    <ul>
                      {a.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </article>
            ))}
          </div>
          )}
          </div>
        </Modal>
      )}
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          tone={toast.tone}
          action={toast.action}
          onAction={() => {
            toast.action?.run();
            setToast(null);
          }}
        />
      )}
    </div>
    </ControlsContext.Provider>
  );
}
