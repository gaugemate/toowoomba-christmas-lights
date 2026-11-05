// Service worker: lets the app install on a phone and open with weak or no signal.
// - App files: fetched fresh when there's signal (so updates show straight away), the saved copy when there isn't.
// - Map pictures: saved as they're viewed (up to MAX_TILES) so maps you've looked at still show offline.
// - Address search, road times and the database are never saved here; the app has its own fallbacks for those.
// Bump VERSION when the list of APP_FILES changes.
const VERSION = 'v4';
const APP_CACHE = `tcl-app-${VERSION}`;
const TILE_CACHE = 'tcl-tiles';
const MAX_TILES = 600;

const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'src/app.js', 'src/config.js', 'src/guide.js', 'src/planner.js', 'src/sample-displays.js',
  'src/services.js', 'src/store.js', 'src/styles.css',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'fonts/InterVariable.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon-180.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('tcl-app-') && name !== APP_CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

const isTile = url => /(^|\.)basemaps\.cartocdn\.com$/.test(url.hostname);

async function appFile(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 4000));
    const fresh = await Promise.race([fetch(request), timeout]);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const saved = await cache.match(request, { ignoreSearch: true }) ||
      (request.mode === 'navigate' ? await cache.match('index.html') : null);
    if (saved) return saved;
    throw e;
  }
}

async function tile(request) {
  const cache = await caches.open(TILE_CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const fresh = await fetch(request);
  if (fresh.ok || fresh.type === 'opaque') {
    await cache.put(request, fresh.clone());
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]); // drop the oldest
  }
  return fresh;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) event.respondWith(appFile(request));
  else if (isTile(url)) event.respondWith(tile(request));
  // everything else (address search, road times, Firebase) goes straight to the network
});
