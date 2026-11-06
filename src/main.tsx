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
const syncRotation = () => {
  const angle = screen.orientation?.angle ?? 0;
  if (phoneLandscape.matches && (angle === 90 || angle === 270)) document.documentElement.dataset.rot = String(angle);
  else delete document.documentElement.dataset.rot;
};
phoneLandscape.addEventListener('change', syncRotation);
screen.orientation?.addEventListener('change', syncRotation);
syncRotation();

// Offline support only in production builds; the dev server should always serve fresh code.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('Offline mode unavailable', error));
  });
}
