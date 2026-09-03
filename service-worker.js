/* =========================================================
   service-worker.js
   IMPORTANTE: sempre que você (ou eu) alterar qualquer arquivo
   .js ou .css do app, o número da versão abaixo (CACHE_VERSION)
   precisa mudar. Isso força o app a baixar os arquivos novos em
   vez de continuar usando a cópia antiga guardada no celular.
   ========================================================= */

const CACHE_VERSION = 'v17';
const CACHE_NAME = `controle-equipe-${CACHE_VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/db.js',
  './js/constants.js',
  './js/catalog.js',
  './js/categorias.js',
  './js/metrics.js',
  './js/servicos.js',
  './js/corte.js',
  './js/avisos.js',
  './js/ferias.js',
  './js/seed-import.js',
  './js/admin.js',
  './js/dashboard.js',
  './js/auth.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached || caches.match('./index.html'));

      // cache-first para carregar rápido; atualiza em segundo plano
      return cached || network;
    })
  );
});
