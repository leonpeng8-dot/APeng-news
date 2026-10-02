/**
 * Service Worker：网络优先，失败回退缓存
 * 缓存 index.html 本身 + 所有 CSS/JS 依赖 + 管理页
 * /api/ 与 Supabase 请求不缓存（数据要新）
 */
const CACHE_NAME = 'apeng-news-v5';

const PRECACHE = [
  './',
  './index.html',
  './styles/main.css',
  './js/userstore.js',
  './js/supabase.js',
  './js/annotation.js',
  './js/app.js',
  './js/vendor/marked.min.js',
  './js/vendor/supabase.min.js',
  './admin/',
  './admin/index.html',
  './styles/admin.css',
  './js/admin.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(PRECACHE.map((url) =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isCacheable(request, url) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (!isCacheable(request, url)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(request, { ignoreSearch: request.mode === 'navigate' }).then((cached) => {
          if (cached) return cached;
          if (request.mode === 'navigate') {
            return caches.match('./index.html').then((page) =>
              page || new Response('离线，且没有可用缓存', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
            );
          }
          return new Response('', { status: 504 });
        })
      )
  );
});
