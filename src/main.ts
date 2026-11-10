import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import './styles.css';
import { initApp } from './ui/app';

initApp();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is a bonus; the game works without it */
    });
  });
}
