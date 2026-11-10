import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * Emit sw.js with the exact list of built files, so the service worker can
 * cache the whole game on the first visit and it works offline afterwards.
 */
function serviceWorker(): Plugin {
  return {
    name: 'tidebound-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map'))
        .map((f) => `./${f}`);
      const precache = ['./', ...files.filter((f) => f !== './index.html'), './index.html', './icon.svg', './manifest.webmanifest'];
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8')
        .replace('__PRECACHE__', JSON.stringify([...new Set(precache)], null, 2))
        .replace('__VERSION__', version);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// base: './' keeps every asset path relative, so the build works from any
// host or sub-path (GitHub Pages, Netlify, Vercel, S3, a USB stick...).
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  plugins: [serviceWorker()],
});
