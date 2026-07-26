// Service worker mínimo para el Juego de las Camisetas
// Estrategia: network-first para HTML, cache-first para assets con hash.

const CACHE_VERSION = 'v4';
const CACHE_NAME = `juego-camisetas-${CACHE_VERSION}`;
// Caché aparte para la cita. No lleva versión y no se limpia con las demás:
// la escribe el app un instante antes de pedirla y se pisa en cada uso.
const CACHE_CITAS = 'juego-camisetas-citas';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME && k !== CACHE_CITAS).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Solo cacheamos el mismo origen
  if (url.origin !== self.location.origin) return;

  // La cita. Va de primero y antes del bloque de navegación a propósito:
  // pedir /cita.ics es una navegación, y network-first la mandaría a buscar
  // al servidor un archivo que no existe allá y nunca va a existir.
  //
  // Esto es el único camino que iOS acepta para abrir el calendario: no le
  // basta el contenido del evento, necesita navegar a una URL que responda
  // con Content-Type text/calendar. Un blob: o un data: no lo logran. El
  // service worker fabrica esa respuesta dentro del teléfono; nada sale a
  // la red, y la ruta ni siquiera existe en el servidor.
  if (url.pathname === '/cita.ics') {
    event.respondWith(
      caches.open(CACHE_CITAS)
        .then(cache => cache.match('/cita.ics'))
        .then(r => r || new Response('', { status: 404 }))
    );
    return;
  }

  // HTML y root: network first
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/')))
    );
    return;
  }

  // Resto (JS, CSS, fuentes, imágenes): cache first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
