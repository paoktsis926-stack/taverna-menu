/* Service worker της σουίτας (σερβιτόρος, κουζίνα, διαχείριση).
   Το __BUILD__ αντικαθίσταται από τον server με αναγνωριστικό της τρέχουσας έκδοσης.
   Κάθε νέο deploy => νέο __BUILD__ => ο browser εγκαθιστά νέο worker και η εφαρμογή ενημερώνεται. */
const BUILD = '__BUILD__';
const CACHE = 'suite-' + BUILD;
const SHELL = ['/offline.html', '/icons/suite-192.png'];
const APP_PAGES = ['/app', '/waiter', '/kitchen', '/admin'];

self.addEventListener('install', e => {
  // ΔΕΝ γίνεται skipWaiting αυτόματα: η σελίδα αποφασίζει πότε είναι ασφαλές να ενημερωθεί (π.χ. όχι στη μέση παραγγελίας)
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('suite-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.startsWith('/api/') || u.pathname === '/sw.js') return; // δεδομένα και worker: ποτέ από cache
  if (r.mode === 'navigate') {
    if (!APP_PAGES.includes(u.pathname)) return; // μενού πελατών κλπ: κανονικά από το δίκτυο
    // πρώτα το δίκτυο (πάντα η τελευταία έκδοση)· χωρίς σύνδεση, η τελευταία αποθηκευμένη ή η σελίδα «χωρίς σύνδεση»
    e.respondWith(fetch(r).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(u.pathname, copy)); }
      return res;
    }).catch(() => caches.match(u.pathname).then(m => m || caches.match('/offline.html'))));
    return;
  }
  // αρχεία της εφαρμογής (js, εικόνες, manifest): πρώτα το δίκτυο, αλλιώς cache
  if (/\.(js|png|svg|webmanifest|ico)$/.test(u.pathname)) {
    e.respondWith(fetch(r).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r)));
  }
});
