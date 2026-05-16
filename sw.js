/* Madrassa Hannover – Service Worker v5 */
const CACHE = 'madrassa-v5'; // ← Bei jedem Deploy um 1 erhöhen → v6, v7 …
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
  // KEIN skipWaiting() hier – neuer SW wartet bis alle Tabs geschlossen sind.
  // Das verhindert dass Firebase Auth mitten in einer Session unterbrochen wird.
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
    }).then(function() {
      // clients.claim() NACH dem Cache-Cleanup – und nur wenn kein User eingeloggt ist
      // würde die Auth stören. Stattdessen: sanftes Claim ohne Force-Reload.
      return self.clients.claim();
    })
  );
});

/* ── FETCH ── */
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Firebase Auth IndexedDB & Token-Requests: NIEMALS abfangen
  // (firebaseinstallations, securetoken, identitytoolkit = Auth-Endpoints)
  if (url.includes('firebase') ||
      url.includes('firestore') ||
      url.includes('firebaseinstallations') ||
      url.includes('securetoken') ||
      url.includes('identitytoolkit') ||
      url.includes('emailjs') ||
      url.includes('cdnjs') ||
      e.request.method !== 'GET') {
    return; // Netzwerk direkt, SW komplett außen vor
  }

  // ── HTML & JS: Network First ──────────────────────────────────
  // Immer aktuellste Version vom Server holen.
  // Fällt auf Cache zurück wenn offline.
  if (url.includes('.html') || url === self.location.origin + '/' || url.endsWith('/')) {
    e.respondWith(
      fetch(e.request)
        .then(function(res) {
          var clone = res.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
          return res;
        })
        .catch(function() {
          return caches.match(e.request);
        })
    );
    return;
  }

  // ── Bilder & Fonts: Cache First ───────────────────────────────
  // Schnell aus Cache laden; im Hintergrund aktualisieren.
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var fetchPromise = fetch(e.request).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        return res;
      });
      return cached || fetchPromise;
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
