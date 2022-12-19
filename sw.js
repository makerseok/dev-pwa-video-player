const STATIC_CACHE_NAME = 'site-static-v73';
const DYNAMIC_CACHE_NAME = 'site-dynamic-v74';
const VIDEO_CACHE_NAME = 'site-video-v4';
const FONT_CACHE_NAME = 'site-font-v1';
const APEX_CACHE_NAME = 'site-apex-v1';

const assets = [
  '/pwa-video-player/',
  'index.html',
  'sw-installed.html',
  'js/app.js',
  'js/ui.js',
  'js/materialize.min.js',
  'css/styles.css',
  'css/materialize.min.css',
  'pages/fallback.html',
  'css/video-js.min.css',
  'js/video.min.js',
  'js/videojs-playlist.min.js',
  'js/api.js',
  'js/croner.min.js',
  'js/db.js',
  'js/dexie.min.js',
  'js/jquery.min.js',
  'css/jquery-ui.min.css',
  'js/axios.min.js',
  'js/jquery-ui.min.js',
  'js/mqttws31.min.js',
  'js/player.js',
  'js/ws.js',
  'https://fonts.googleapis.com/icon?family=Material+Icons',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100;300;400;700&display=swap',
];

// cache size limit function
const limitCacheSize = (name, size) => {
  caches.open(name).then(cache => {
    cache.keys().then(keys => {
      if (keys.length > size) {
        cache.delete(keys[0]).then(limitCacheSize(name, size));
      }
    });
  });
};

// install event
self.addEventListener('install', event => {
  console.log('service worker has been installed');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then(cache => {
      console.log('caching shell assets');
      cache.addAll(assets);
    }),
  );
});

// skipWaiting
addEventListener('message', function (messageEvent) {
  if (messageEvent.data === 'skipWaiting') {
    return skipWaiting();
  }
});

// activate event
self.addEventListener('activate', event => {
  console.log('service worker has been activated');
  event.waitUntil(
    caches.keys().then(keys => {
      // console.log(keys);
      return Promise.all(
        keys
          .filter(
            key =>
              key !== STATIC_CACHE_NAME &&
              key !== DYNAMIC_CACHE_NAME &&
              key !== VIDEO_CACHE_NAME &&
              key !== FONT_CACHE_NAME &&
              key !== APEX_CACHE_NAME,
          )
          .map(key => caches.delete(key)),
      );
    }),
  );
});

// fetch event
self.addEventListener('fetch', event => {
  // console.log('fetch event', event);
  const scope = self.registration.scope;
  const url = new URL(event.request.url);
  const queryReplacedUrl = url.href.replace(url.search, '');
  if (
    [scope, scope + 'index.html', scope + 'index.htm'].includes(
      queryReplacedUrl,
    )
  ) {
    event.respondWith(
      (async () => {
        const cachedResponse = await caches.match('sw-installed.html');
        if (cachedResponse) {
          console.log('Cached response', event.request.url);
          return cachedResponse;
        }
        const response = await fetch(scope + 'sw-installed.html' + url.search);
        const cache = await caches.open(STATIC_CACHE_NAME);
        await cache.put('sw-installed.html', response.clone());
        return response;
      })(),
    );
    return;
  }
  if (event.request.url.includes('chrome-extension:')) return;
  if (event.request.method !== 'GET') return;
  event.respondWith(
    (async () => {
      if (event.request.url.includes('ords/podo')) {
        try {
          return await fetchOthers(event.request, APEX_CACHE_NAME);
        } catch (error) {
          console.log('Error on fetching', event.request.url);
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            console.log('Cached response', event.request.url);
            return cachedResponse;
          }
        }
      }

      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      if (event.request.url.includes('.mp4')) {
        return fetchVideo(event.request);
      }
      if (event.request.url.includes('fonts.gstatic.com')) {
        console.log(
          'event.request.url.includes("fonts.gstatic.com")',
          event.request.url,
        );
        return fetchOthers(event.request, FONT_CACHE_NAME);
      }
      const path = url.pathname;
      if (
        !event.request.url.includes('hivestack.com') &&
        !assets.includes(event.request.url) &&
        !assets.includes(path)
      ) {
        return fetchDynamic(event.request);
      }
      return fetch(event.request);
    })(),
  );
});

const fetchDynamic = async request => {
  const response = await fetch(request);
  await cacheDynamic(request.url, response.clone());
  return response;
};

const cacheDynamic = async (url, response) => {
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  await cache.put(url, response);
  limitCacheSize(DYNAMIC_CACHE_NAME, 15);
};

const fetchOthers = async (request, cacheName) => {
  const response = await fetch(request);
  await cacheOthers(request.url, response.clone(), cacheName);
  return response;
};

const cacheOthers = async (url, response, cacheName) => {
  const cache = await caches.open(cacheName);
  await cache.put(url, response);
};

const cacheVideo = async (url, response) => {
  const cache = await caches.open(VIDEO_CACHE_NAME);
  await cache.put(url, response);
};

const fetchVideo = async request => {
  const response = await fetch(request);
  if (response.status === 200) {
    await cacheVideo(request.url, response.clone());
    console.log('video cached', request.url);
  }
  return response;
};
