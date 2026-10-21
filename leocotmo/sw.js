// Lưu game vào máy để chơi được cả khi mất mạng.
const CACHE = 'leocotmo-v1';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
  'fonts/baloo.css',
  'fonts/baloo-2-vietnamese-500-normal.woff2', 'fonts/baloo-2-vietnamese-700-normal.woff2', 'fonts/baloo-2-vietnamese-800-normal.woff2',
  'fonts/baloo-2-latin-500-normal.woff2', 'fonts/baloo-2-latin-700-normal.woff2', 'fonts/baloo-2-latin-800-normal.woff2',
  'fonts/baloo-2-latin-ext-500-normal.woff2', 'fonts/baloo-2-latin-ext-700-normal.woff2', 'fonts/baloo-2-latin-ext-800-normal.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Có mạng thì lấy bản mới nhất, mất mạng thì dùng bản đã lưu.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
