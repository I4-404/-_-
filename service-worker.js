// Pixel Studio Pro — Service Worker
// بيخزّن التطبيق كامل (الصفحة + المكتبات الخارجية + الخطوط) عشان يشتغل بدون إنترنت.
// أي تعديل في الكود، لازم تزوّد رقم النسخة (CACHE_VERSION) عشان يحصل تحديث فعلي عند المستخدمين.

const CACHE_VERSION = 'v2';
const CACHE_NAME = 'pixel-studio-pro-' + CACHE_VERSION;

// الملفات الأساسية اللي لازم تتحمّل من أول مرة عشان التطبيق يفتح بدون نت
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// مكتبات خارجية ثابتة (CDN) — نسخة مقفولة برقم، فآمنة نعملها cache دائم
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // نحاول نخزن كل حاجة، لكن مانفشلش التسطيب كله لو ملف واحد فشل (مثلاً أيقونة لسه مش مرفوعة)
      await Promise.allSettled(
        [...CORE_ASSETS, ...CDN_ASSETS].map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
            console.warn('[SW] فشل تخزين:', url, err);
          })
        )
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('pixel-studio-pro-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // بس طلبات GET بنتعامل معاها بالكاش
  if (req.method !== 'GET') return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) {
        // Cache-first: لو موجود في الكاش هات منه على طول (سرعة + شغل أوفلاين)
        // وفي الخلفية حاول تحدّثه من النت لو متاح (stale-while-revalidate)
        fetchAndUpdateCache(req);
        return cached;
      }

      try {
        const fresh = await fetch(req);
        // خزّن أي حاجة جديدة نجح تحميلها (خطوط Google Fonts مثلاً) عشان تبقى متاحة أوفلاين المرة الجاية
        if (fresh && fresh.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        // مفيش نت ومفيش نسخة مخزنة — لو طلب صفحة، رجّع الصفحة الرئيسية كحل بديل
        if (req.mode === 'navigate') {
          const fallback = await caches.match('./index.html');
          if (fallback) return fallback;
        }
        throw err;
      }
    })()
  );
});

async function fetchAndUpdateCache(req) {
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh);
    }
  } catch (err) {
    // معندناش نت — عادي، هنفضل نستخدم النسخة المخزنة
  }
}
