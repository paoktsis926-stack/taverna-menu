'use strict';
// Έλεγχος αρχείων PWA: manifests, εικονίδια, service worker και σελίδες.
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const pub = path.join(__dirname, '..', 'public');
const read = f => fs.readFileSync(path.join(pub, f), 'utf8');
const pages = { waiter: 'waiter.html', kitchen: 'kitchen.html', admin: 'admin.html', suite: 'app.html' };
for (const [name, page] of Object.entries(pages)) {
  const m = JSON.parse(read(name + '.webmanifest'));
  assert.ok(m.name && m.short_name && m.start_url && m.display === 'standalone', name + ': λείπουν βασικά πεδία');
  assert.ok(m.icons.some(i => i.sizes === '192x192') && m.icons.some(i => i.sizes === '512x512'), name + ': λείπουν εικονίδια 192/512');
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(pub, i.src)), name + ': λείπει το ' + i.src);
  for (const s of [180, 192, 512]) assert.ok(fs.existsSync(path.join(pub, 'icons', `${name}-${s}.png`)), `λείπει icons/${name}-${s}.png`);
  const html = read(page);
  assert.ok(html.includes(`/${name}.webmanifest`), page + ': δεν δείχνει στο manifest');
  assert.ok(html.includes('/pwa.js'), page + ': δεν φορτώνει το pwa.js');
  assert.ok(html.includes(`/icons/${name}-180.png`), page + ': λείπει το apple-touch-icon');
}
const sw = read('sw.js');
assert.ok(sw.includes("'__BUILD__'"), 'ο service worker πρέπει να έχει το placeholder __BUILD__');
assert.ok(!/skipWaiting\(\)\s*;?\s*\}\);\s*self\.addEventListener\('message'/.test(sw), 'ο worker δεν πρέπει να κάνει αυτόματο skipWaiting');
assert.ok(fs.existsSync(path.join(pub, 'offline.html')));
console.log('Έλεγχος PWA επιτυχής.');
