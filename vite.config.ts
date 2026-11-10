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
      const icons = ['./icon.svg', './favicon.ico', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
      const precache = ['./', ...files.filter((f) => f !== './index.html'), './index.html', './manifest.webmanifest', ...icons];
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8')
        .replace('__PRECACHE__', JSON.stringify([...new Set(precache)], null, 2))
        .replace('__VERSION__', version);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

/** Where the game is published. Used for the sitemap and robots.txt. */
const SITE_URL = 'https://tidebound.isstiaung.me/';

/** robots.txt and a sitemap, dated with the build so search engines see fresh content. */
function seoFiles(): Plugin {
  return {
    name: 'tidebound-seo-files',
    apply: 'build',
    generateBundle() {
      const today = new Date().toISOString().slice(0, 10);
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n` });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}</loc>
    <lastmod>${today}</lastmod>
  </url>
</urlset>
`,
      });
    },
  };
}

// base: './' keeps every asset path relative, so the build works from any
// host or sub-path (GitHub Pages, Netlify, Vercel, S3, a USB stick...).
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  plugins: [serviceWorker(), seoFiles()],
});
