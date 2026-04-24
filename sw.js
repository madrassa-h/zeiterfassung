/* Madrassa Hannover – Service Worker v3 */
const CACHE = 'madrassa-v3';
const ASSETS = [
  './',
  './index.html',
  './zeiterfassung.html',
  './abwesenheit.html',
  './klassenbuch.html',
  './zeugnisse.html',
  './modir.html',
  './manifest.json',
  './manifest-admin.json',
  './images/logo.PNG',
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap'
];

/* ── INSTALL ── */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return Promise.allSettled(
        ASSETS.map(function(url) {
          return cache.add(url).catch(function() {});
        })
      );
    })
  );
  self.skipWaiting();
});

/* ── ACTIVATE ── */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

/* ── FETCH ── */
self.addEventListener('fetch', function(e) {
  if (e.request.url.includes('firebase') ||
      e.request.url.includes('firestore') ||
      e.request.url.includes('googleapis.com') ||
      e.request.url.includes('emailjs') ||
      e.request.url.includes('cdnjs') ||
      e.request.method !== 'GET') {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        return res;
      });
    })
  );
});

/* ── PUSH ── */
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch(x) {}
  var title  = data.title  || 'Madrassa Hannover';
  var body   = data.body   || 'Neue Benachrichtigung';
  var icon   = data.icon   || './images/logo.PNG';
  var badge  = data.badge  || './images/logo.PNG';
  var url    = data.url    || './index.html';
  e.waitUntil(
    self.registration.showNotification(title, {
      body: body, icon: icon, badge: badge,
      data: { url: url }, vibrate: [200, 100, 200]
    })
  );
});

/* ── NOTIFICATION CLICK ── */
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var target = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.includes(target) && 'focus' in list[i]) return list[i].focus();
      }
      return clients.openWindow(target);
    })
  );
});
