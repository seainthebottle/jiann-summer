const CACHE_NAME = 'study-timer-v19-pause';
const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'css/style.css',
    'js/api.js',
    'js/app.js',
    'js/timer.js',
    'js/chart.js',
    'assets/icons/app_icon.png',
    'assets/icons/app_icon.svg',
    'assets/manifest.json'
];

// 서비스 워커 설치 및 리소스 캐싱
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 활성화 시 이전 버전 캐시 삭제
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 리소스 요청 시 전략
self.addEventListener('fetch', (event) => {
    // API 요청은 캐시하지 않고 항상 네트워크 사용
    if (event.request.url.includes('/api/')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // HTML 파일 (내비게이션)은 네트워크 우선 전략 사용 (최신 버전 유지 목적)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // 성공적으로 네트워크에서 가져오면 캐시 업데이트
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 기타 리소스는 캐시 우선 전략 사용
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).then(fetchRes => {
                return caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, fetchRes.clone());
                    return fetchRes;
                });
            });
        })
    );
});
