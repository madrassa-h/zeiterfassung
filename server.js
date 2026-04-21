/* ══════════════════════════════════════════════════════
   Madrassa Hannover – Push-Notification-Server
   Startet mit: node server.js
   ══════════════════════════════════════════════════════ */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const webpush    = require('web-push');
const admin      = require('firebase-admin');

const app  = express();
const PORT = process.env.PORT || 3001;

/* ── CORS: nur deine GitHub-Pages-Domain ── */
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json());

/* ── VAPID konfigurieren ── */
webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

/* ── Firebase Admin initialisieren ── */
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId:  process.env.FIREBASE_PROJECT_ID
});
const db = admin.firestore();

/* ════════════════════════════════════════
   ENDPUNKT 1: Abonnement speichern
   POST /subscribe
   Body: { subscription: { endpoint, keys: { p256dh, auth } }, uid, name }
   ════════════════════════════════════════ */
app.post('/subscribe', async (req, res) => {
  const { subscription, uid, name } = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Kein gültiges Abonnement.' });
  }
  try {
    await db.collection('pushSubscriptions').doc(uid || subscription.endpoint).set({
      subscription,
      uid:  uid  || null,
      name: name || 'Unbekannt',
      erstellt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('Subscribe Fehler:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ════════════════════════════════════════
   ENDPUNKT 2: Abonnement löschen
   POST /unsubscribe
   Body: { uid }
   ════════════════════════════════════════ */
app.post('/unsubscribe', async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'UID fehlt.' });
  try {
    await db.collection('pushSubscriptions').doc(uid).delete();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ════════════════════════════════════════
   ENDPUNKT 3: Push an EINEN Mitarbeiter
   POST /push/one
   Body: { uid, title, body, url }
   ════════════════════════════════════════ */
app.post('/push/one', async (req, res) => {
  const { uid, title, body, url } = req.body;
  if (!uid) return res.status(400).json({ error: 'UID fehlt.' });

  try {
    const doc = await db.collection('pushSubscriptions').doc(uid).get();
    if (!doc.exists) return res.status(404).json({ error: 'Kein Abonnement gefunden.' });

    const payload = JSON.stringify({
      title: title || 'Madrassa Hannover',
      body:  body  || 'Neue Benachrichtigung',
      icon:  'https://velanya.github.io/images/logo.png',
      badge: 'https://velanya.github.io/images/logo.png',
      url:   url   || 'https://velanya.github.io/index.html'
    });

    await webpush.sendNotification(doc.data().subscription, payload);
    res.json({ ok: true, gesendet: 1 });
  } catch (e) {
    console.error('Push-Fehler:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ════════════════════════════════════════
   ENDPUNKT 4: Push an ALLE Mitarbeiter
   POST /push/all
   Body: { title, body, url }
   ════════════════════════════════════════ */
app.post('/push/all', async (req, res) => {
  const { title, body, url } = req.body;
  const payload = JSON.stringify({
    title: title || 'Madrassa Hannover',
    body:  body  || 'Neue Benachrichtigung',
    icon:  'https://velanya.github.io/images/logo.png',
    badge: 'https://velanya.github.io/images/logo.png',
    url:   url   || 'https://velanya.github.io/index.html'
  });

  try {
    const snap = await db.collection('pushSubscriptions').get();
    if (snap.empty) return res.json({ ok: true, gesendet: 0 });

    let gesendet = 0, fehler = 0;
    const aufgaben = snap.docs.map(async doc => {
      try {
        await webpush.sendNotification(doc.data().subscription, payload);
        gesendet++;
      } catch (e) {
        fehler++;
        // Abgelaufenes Abonnement löschen
        if (e.statusCode === 410 || e.statusCode === 404) {
          await doc.ref.delete();
        }
      }
    });
    await Promise.all(aufgaben);
    res.json({ ok: true, gesendet, fehler });
  } catch (e) {
    console.error('Push-All Fehler:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ════════════════════════════════════════
   ENDPUNKT 5: Abrechnung genehmigt →
   automatisch Mitarbeiter benachrichtigen
   POST /push/abrechnung
   Body: { uid, name, monat }
   ════════════════════════════════════════ */
app.post('/push/abrechnung', async (req, res) => {
  const { uid, name, monat } = req.body;
  if (!uid) return res.status(400).json({ error: 'UID fehlt.' });

  try {
    const doc = await db.collection('pushSubscriptions').doc(uid).get();
    if (!doc.exists) return res.json({ ok: true, gesendet: 0, hinweis: 'Kein Abonnement.' });

    const payload = JSON.stringify({
      title: '✅ Abrechnung genehmigt',
      body:  `Hallo ${name || ''}, deine Abrechnung für ${monat || ''} wurde genehmigt.`,
      icon:  'https://velanya.github.io/images/logo.png',
      badge: 'https://velanya.github.io/images/logo.png',
      url:   'https://velanya.github.io/index.html'
    });

    await webpush.sendNotification(doc.data().subscription, payload);
    res.json({ ok: true, gesendet: 1 });
  } catch (e) {
    console.error('Push-Abrechnung Fehler:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ── Gesundheitscheck ── */
app.get('/health', (req, res) => res.json({ ok: true, zeit: new Date().toISOString() }));

/* ── Server starten ── */
app.listen(PORT, () => {
  console.log(`✅ Push-Server läuft auf Port ${PORT}`);
  console.log(`   VAPID Public Key: ${process.env.VAPID_PUBLIC_KEY?.slice(0, 20)}...`);
});
