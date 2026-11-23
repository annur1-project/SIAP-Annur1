const CACHE_NAME = 'e-annursatu-shell-v3';
const SHELL_ASSETS = [
  '/manifest.webmanifest',
  '/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/icon-monochrome-512.png',
  '/icons/logo-e1.png',
];

const OFFLINE_FALLBACK_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Koneksi Terputus - e-AnNurSatu</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font-family: system-ui, -apple-system, sans-serif;
      background: #f8fafc;
      color: #0f172a;
    }
    .card {
      max-width: 380px;
      width: 100%;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 24px;
      text-align: center;
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 18px;
      font-weight: 700;
    }
    p {
      margin: 0 0 20px;
      font-size: 14px;
      line-height: 1.5;
      color: #475569;
    }
    button {
      width: 100%;
      padding: 12px 16px;
      border: 0;
      border-radius: 10px;
      background: #0f766e;
      color: #ffffff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Tidak Dapat Terhubung ke Server</h1>
    <p>Pastikan koneksi internet HP Anda aktif, lalu coba muat ulang halaman.</p>
    <button type="button" onclick="window.location.reload()">Muat Ulang Halaman</button>
  </div>
</body>
</html>`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/')) return;
  if (req.destination === 'script' || req.destination === 'style') return;

  // Network-first untuk navigasi halaman: selalu ambil versi terbaru dari server terlebih dahulu,
  // simpan ke cache saat sukses, dan gunakan cache atau halaman fallback HTML saat offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkRes = await fetch(req);
          const contentType = networkRes?.headers?.get('content-type') || '';
          if (
            networkRes &&
            networkRes.ok &&
            networkRes.type === 'basic' &&
            contentType.includes('text/html')
          ) {
            const copy = networkRes.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(req, copy))
              .catch(() => undefined);
          }
          return networkRes;
        } catch {
          const cachedExact = await caches.match(req);
          if (cachedExact) return cachedExact;

          const cachedNoSearch = await caches.match(req, { ignoreSearch: true });
          if (cachedNoSearch) return cachedNoSearch;

          const cachedRoot = await caches.match('/');
          if (cachedRoot) return cachedRoot;

          return new Response(OFFLINE_FALLBACK_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
      })()
    );
    return;
  }

  // Cache-first hanya untuk ikon statis lokal
  if (url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => undefined);
            }
            return res;
          })
          .catch(() => new Response('', { status: 404 }));
      })
    );
  }
});
