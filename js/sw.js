const CACHE_NAME = 'study-timer-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/api.js',
    '/js/app.js',
    '/js/timer.js',
    '/js/chart.js',
    '/assets/icons/app_icon.png',
    '/assets/icons/app_icon.svg',
    '/assets/manifest.json'
];

// 서비스 워커 설치 및 리소스 캐싱
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 리소스 요청 시 캐시 우선 전략 사용
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
