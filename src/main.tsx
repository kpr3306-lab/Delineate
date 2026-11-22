import { createRoot } from 'react-dom/client';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/space-grotesk/wght.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import './styles.css';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);

// UI is portrait-only on phones. Installed apps lock via the manifest; in a browser tab we counter-rotate the page instead.
const phoneLandscape = window.matchMedia('(orientation: landscape) and (pointer: coarse) and (max-height: 500px)');
// Lay the page out at the phone's full portrait width (not the short side left over beside the address bar,
// which squeezed every control), then scale it down to fit that short side.
const syncRotation = () => {
  const root = document.documentElement;
  const angle = screen.orientation?.angle ?? 0;
  if (!(phoneLandscape.matches && (angle === 90 || angle === 270))) {
    delete root.dataset.rot;
    return;
  }
  const w = Math.min(screen.width, screen.height) || innerHeight;
  const k = Math.min(1, innerHeight / w);
  root.style.setProperty('--rot-w', `${w}px`);
  root.style.setProperty('--rot-h', `${innerWidth / k}px`);
  root.style.setProperty('--rot-k', String(k));
  root.style.setProperty('--rot-x', `${innerWidth}px`);
  root.style.setProperty('--rot-y', `${innerHeight}px`);
  root.dataset.rot = String(angle);
};
phoneLandscape.addEventListener('change', syncRotation);
window.addEventListener('resize', syncRotation);
screen.orientation?.addEventListener('change', syncRotation);
syncRotation();

// Offline support only in production builds; the dev server should always serve fresh code.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('Offline mode unavailable', error));
  });
}
