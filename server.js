const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const db = require('./db');
const { seed } = require('./seed');
const localized = require('./translations-bg-tr');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.dirname(process.env.DB_PATH || path.join(__dirname, 'data', 'menu.db'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) { console.error('Λείπει η μεταβλητή ADMIN_PASSWORD'); process.exit(1); }
// Το μυστικό των sessions ΔΕΝ παράγεται από τον κωδικό διαχείρισης. Αν λείπει το SESSION_SECRET,
// δημιουργείται τυχαίο και αποθηκεύεται στον persistent δίσκο ώστε να μένει σταθερό μετά από restart.
const loadSecret = () => {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = path.join(DATA_DIR, '.session-secret');
  try { const v = fs.readFileSync(f, 'utf8').trim(); if (v.length >= 32) return v; } catch {}
  const v = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(f, v, { mode: 0o600 });
  return v;
};
const SECRET = loadSecret();
if (seed(db, false)) console.log('Φορτώθηκε το αρχικό μενού από το menu-seed.txt');
const applyInitialTranslations = db.transaction(() => {
  for (const c of db.prepare('SELECT id,name,name_bg,name_tr FROM categories').all()) {
    const t = localized.categories[c.name];
    if (t) db.prepare("UPDATE categories SET name_bg=CASE WHEN name_bg='' THEN ? ELSE name_bg END,name_tr=CASE WHEN name_tr='' THEN ? ELSE name_tr END WHERE id=?").run(t[0],t[1],c.id);
  }
  for (const i of db.prepare('SELECT id,name,name_bg,name_tr FROM items').all()) {
    const t = localized.items[i.name];
    if (t) db.prepare("UPDATE items SET name_bg=CASE WHEN name_bg='' THEN ? ELSE name_bg END,name_tr=CASE WHEN name_tr='' THEN ? ELSE name_tr END WHERE id=?").run(t[0],t[1],i.id);
  }
});
applyInitialTranslations();
// Διορθώσεις μεταφράσεων σε υπάρχουσες βάσεις: αλλάζει μόνο αν η τιμή είναι ακόμη η παλιά (δεν πατάει χειροκίνητες αλλαγές).
db.transaction(() => {
  const col = { en: 'name_en', bg: 'name_bg', tr: 'name_tr' };
  for (const [el, f] of Object.entries(localized.fixes || {}))
    for (const [lg, [oldV, newV]] of Object.entries(f))
      db.prepare(`UPDATE items SET ${col[lg]}=? WHERE name=? AND ${col[lg]}=?`).run(newV, el, oldV);
  db.prepare("UPDATE items SET name_tr='Bouyiourdi' WHERE name='Μπουγιουρντί' AND name_tr LIKE 'Buy%'").run();
})();

{
  const fill = db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE settings.value=''");
  const base = { tagline_bg: '40 години с изискани вкусове', tagline_tr: '40 yıldır seçkin lezzetler', footer_bg: 'Цените могат да се променят в зависимост от наличностите на пазара.', footer_tr: 'Fiyatlar piyasa koşullarına göre değişebilir.' };
  db.transaction(() => { for (const k in base) fill.run(k, base[k]); })();
}
const DEF = { name: 'Ψαροταβέρνα «Τα Μπαρμπούνια»', tagline: '', tagline_en: '', tagline_bg: '', tagline_tr: '', address: '', footer: '', footer_en: '', footer_bg: '', footer_tr: '', currency: '€' };
const getSettings = () => {
  const s = { ...DEF };
  db.prepare('SELECT * FROM settings').all().forEach(r => (s[r.key] = r.value));
  return s;
};
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) && n >= 0 ? n : 0; };
const bool = v => (v === false || v === 0 || v === '0' ? 0 : 1);
const imageUrl = (v, current = '') => { const value = str(v, 1000); if (!value) return ''; if (value === current) return value; try { const u = new URL(value); return u.protocol === 'https:' ? u.href : null; } catch { return null; } };
const allergenCodes = v => { try { const a = Array.isArray(v) ? v : JSON.parse(String(v || '[]')); return JSON.stringify([...new Set(a.map(x => String(x)))].filter(x => /^(gluten|crustaceans|eggs|fish|peanuts|soybeans|milk|nuts|celery|mustard|sesame|sulphites|lupin|molluscs)$/.test(x))); } catch { return '[]'; } };

function getMenu(all) {
  const cats = db.prepare(`SELECT * FROM categories ${all ? '' : 'WHERE visible=1'} ORDER BY sort, id`).all();
  const items = db.prepare('SELECT * FROM items ORDER BY sort, id').all();
  cats.forEach(c => (c.items = items.filter(i => i.category_id === c.id)));
  return { settings: getSettings(), categories: all ? cats : cats.filter(c => c.items.length) };
}

// ---------- Auth ----------
const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const makeToken = () => { const exp = String(Date.now() + 7 * 864e5); return exp + '.' + sign(exp); };
const getCookie = (req, n) => {
  const m = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(n + '='));
  return m ? decodeURIComponent(m.slice(n.length + 1)) : '';
};
const revoked = new Map(); // token -> λήξη (ακυρωμένα με logout)
const authed = req => {
  const tok = getCookie(req, 'sid');
  const [exp, sig] = tok.split('.');
  if (!exp || !sig || +exp < Date.now() || revoked.has(tok)) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
};
const safeEq = (a, b) =>
  crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());

const attempts = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, a] of attempts) if (now - a.t > 15 * 60e3) attempts.delete(k);
  for (const [k, e] of revoked) if (e < now) revoked.delete(k);
}, 10 * 60e3).unref();
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.disable('etag');
app.use('/api', (req, res, next) => { res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' }); next(); });
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'" }); next(); });
// gzip μόνο για το JSON του μενού (το μεγαλύτερο API response)
app.use('/api/menu', (req, res, next) => {
  if (!/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return next();
  const json = res.json.bind(res);
  res.json = body => {
    const buf = zlib.gzipSync(Buffer.from(JSON.stringify(body)));
    res.set({ 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding', 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length });
    return res.end(buf);
  };
  next();
});

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ' + baseUrl(req) + '/sitemap.xml\n'));
app.get('/sitemap.xml', (req, res) => { const url = (baseUrl(req) + '/').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' + url + '</loc></url></urlset>'); });

app.post('/api/login', (req, res) => {
  const a = attempts.get(req.ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) return res.status(429).json({ error: 'Πολλές προσπάθειες. Δοκιμάστε σε λίγα λεπτά.' });
  if (!safeEq(String(req.body.password || ''), ADMIN_PASSWORD)) {
    a.n++; attempts.set(req.ip, a);
    return res.status(401).json({ error: 'Λάθος κωδικός' });
  }
  attempts.delete(req.ip);
  res.cookie('sid', makeToken(), { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 7 * 864e5 });
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => {
  const tok = getCookie(req, 'sid'), exp = +tok.split('.')[0];
  if (tok && exp > Date.now()) revoked.set(tok, exp);
  res.clearCookie('sid'); res.json({ ok: true });
});

// ---------- Δημόσιο ----------
app.get('/api/menu', (req, res) => { res.set('Cache-Control', 'no-cache'); res.json(getMenu(false)); });
app.post('/api/view', (req, res) => {
  const lang = ['el','en','bg','tr'].includes(req.body.lang) ? req.body.lang : 'el';
  db.prepare("INSERT INTO views(day,lang,n) VALUES(date('now'),?,1) ON CONFLICT(day,lang) DO UPDATE SET n=n+1").run(lang);
  res.json({ ok: true });
});

const baseUrl = req => (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
app.get('/qr.png', async (req, res) => {
  const table = str(req.query.table, 40).replace(/[^\p{L}\p{N}_ -]/gu, '')
  const target = baseUrl(req) + '/' + (table ? '?table=' + encodeURIComponent(table) : '');
  const buf = await QRCode.toBuffer(target, {
    width: Math.min(Math.max(+req.query.size || 1000, 200), 3000), margin: 2, errorCorrectionLevel: 'M' });
  if (req.query.download) res.set('Content-Disposition', 'attachment; filename="menu-qr.png"');
  res.type('png').send(buf);
});
app.get('/qr.svg', async (req, res) => {
  const table = str(req.query.table, 40).replace(/[^\p{L}\p{N}_ -]/gu, '')
  const target = baseUrl(req) + '/' + (table ? '?table=' + encodeURIComponent(table) : '');
  const svg = await QRCode.toString(target, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  if (req.query.download) res.set('Content-Disposition', 'attachment; filename="menu-qr.svg"');
  res.type('image/svg+xml').send(svg);
});
app.get('/api/info', (req, res) => res.json({ url: baseUrl(req) + '/' }));

// ---------- Διαχείριση ----------
const A = express.Router();
A.use((req, res, next) => (authed(req) ? next() : res.status(401).json({ error: 'Απαιτείται σύνδεση' })));

A.get('/menu', (req, res) => res.json(getMenu(true)));
A.post('/upload-image', express.raw({ type: 'application/octet-stream', limit: '8mb' }), (req, res) => {
  const b = req.body;
  if (!Buffer.isBuffer(b) || !b.length) return res.status(400).json({ error: 'Επιλέξτε φωτογραφία.' });
  let ext = '';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ext = '.jpg';
  else if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ext = '.png';
  else if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') ext = '.webp';
  if (!ext) return res.status(415).json({ error: 'Υποστηρίζονται μόνο JPG, PNG και WEBP.' });
  const name = crypto.randomBytes(18).toString('hex') + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), b, { flag: 'wx' });
  res.json({ url: '/uploads/' + name });
});

A.get('/stats', (req, res) => res.json({
  rows: db.prepare("SELECT day,lang,n FROM views WHERE day>=date('now','-29 day') ORDER BY day").all(),
  total: db.prepare('SELECT COALESCE(SUM(n),0) n FROM views').get().n }));

A.put('/settings', (req, res) => {
  const up = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  db.transaction(() => Object.keys(DEF).forEach(k => k in req.body && up.run(k, str(req.body[k], 300))))();
  res.json(getSettings());
});

A.post('/categories', (req, res) => {
  const name = str(req.body.name, 100);
  if (!name) return res.status(400).json({ error: 'Δώστε όνομα κατηγορίας' });
  const sort = db.prepare('SELECT COALESCE(MAX(sort),0)+1 n FROM categories').get().n;
  res.json({ id: db.prepare('INSERT INTO categories(name,name_en,name_bg,name_tr,sort) VALUES(?,?,?,?,?)').run(name, str(req.body.name_en, 100), str(req.body.name_bg,100), str(req.body.name_tr,100), sort).lastInsertRowid });
});
A.put('/categories/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Δεν βρέθηκε' });
  const b = { ...c, ...req.body }, name = str(b.name, 100);
  if (!name) return res.status(400).json({ error: 'Δώστε όνομα κατηγορίας' });
  db.prepare('UPDATE categories SET name=?, name_en=?, name_bg=?, name_tr=?, visible=? WHERE id=?').run(name, str(b.name_en, 100), str(b.name_bg,100), str(b.name_tr,100), bool(b.visible), c.id);
  res.json({ ok: true });
});
A.delete('/categories/:id', (req, res) => { db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id); res.json({ ok: true }); });

A.post('/items', (req, res) => {
  const b = req.body, name = str(b.name, 150);
  if (!name) return res.status(400).json({ error: 'Δώστε όνομα πιάτου' });
  if (!db.prepare('SELECT 1 FROM categories WHERE id=?').get(b.category_id)) return res.status(400).json({ error: 'Άκυρη κατηγορία' });
  const image = imageUrl(b.image_url);
  if (image === null) return res.status(400).json({ error: 'Η φωτογραφία πρέπει να έχει έγκυρο URL HTTPS.' });
  const sort = db.prepare('SELECT COALESCE(MAX(sort),0)+1 n FROM items WHERE category_id=?').get(b.category_id).n;
  res.json({ id: db.prepare('INSERT INTO items(category_id,name,name_en,name_bg,name_tr,description,description_en,description_bg,description_tr,price,available,sort,allergens,allergens_en,allergens_bg,allergens_tr,image_url,allergen_codes,popular) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(b.category_id, name, str(b.name_en,150), str(b.name_bg,150), str(b.name_tr,150), str(b.description,400), str(b.description_en,400), str(b.description_bg,400), str(b.description_tr,400), num(b.price), bool(b.available ?? 1), sort, str(b.allergens,300), str(b.allergens_en,300), str(b.allergens_bg,300), str(b.allergens_tr,300), image, allergenCodes(b.allergen_codes), bool(b.popular ?? 0)).lastInsertRowid });
});
A.put('/items/:id', (req, res) => {
  const it = db.prepare('SELECT * FROM items WHERE id=?').get(req.params.id);
  if (!it) return res.status(404).json({ error: 'Δεν βρέθηκε' });
  const b = { ...it, ...req.body }, name = str(b.name, 150);
  if (!name) return res.status(400).json({ error: 'Δώστε όνομα πιάτου' });
  const image = imageUrl(b.image_url, it.image_url || '');
  if (image === null) return res.status(400).json({ error: 'Η φωτογραφία πρέπει να έχει έγκυρο URL HTTPS.' });
  db.prepare('UPDATE items SET category_id=?,name=?,name_en=?,name_bg=?,name_tr=?,description=?,description_en=?,description_bg=?,description_tr=?,price=?,available=?,allergens=?,allergens_en=?,allergens_bg=?,allergens_tr=?,image_url=?,allergen_codes=?,popular=? WHERE id=?')
    .run(b.category_id, name, str(b.name_en,150), str(b.name_bg,150), str(b.name_tr,150), str(b.description,400), str(b.description_en,400), str(b.description_bg,400), str(b.description_tr,400), num(b.price), bool(b.available), str(b.allergens,300), str(b.allergens_en,300), str(b.allergens_bg,300), str(b.allergens_tr,300), image, allergenCodes(b.allergen_codes ?? it.allergen_codes), bool(b.popular ?? it.popular), it.id);
  res.json({ ok: true });
});
A.delete('/items/:id', (req, res) => { db.prepare('DELETE FROM items WHERE id=?').run(req.params.id); res.json({ ok: true }); });

A.post('/reorder', (req, res) => {
  const t = req.body.table === 'categories' ? 'categories' : req.body.table === 'items' ? 'items' : null;
  if (!t || !Array.isArray(req.body.ids)) return res.status(400).json({ error: 'Άκυρο αίτημα' });
  const up = db.prepare(`UPDATE ${t} SET sort=? WHERE id=?`);
  db.transaction(() => req.body.ids.forEach((id, i) => up.run(i + 1, id)))();
  res.json({ ok: true });
});

A.put('/translations', (req, res) => {
  const langs = ['en','bg','tr'];
  const uc = db.prepare('UPDATE categories SET name_en=?,name_bg=?,name_tr=? WHERE id=?');
  const ui = db.prepare('UPDATE items SET name_en=?,name_bg=?,name_tr=?,description_en=?,description_bg=?,description_tr=?,allergens_en=?,allergens_bg=?,allergens_tr=? WHERE id=?');
  db.transaction(() => {
    (req.body.categories || []).forEach(c => uc.run(...langs.map(l=>str(c['name_'+l],100)), c.id));
    (req.body.items || []).forEach(i => ui.run(
      ...langs.map(l=>str(i['name_'+l],150)),
      ...langs.map(l=>str(i['description_'+l],400)),
      ...langs.map(l=>str(i['allergens_'+l],300)), i.id));
  })();
  res.json({ ok: true });
});

A.post('/bulk-price', (req, res) => {
  const p = parseFloat(String(req.body.percent).replace(',', '.'));
  const step = [0, 0.05, 0.1, 0.5, 1].includes(+req.body.step) ? +req.body.step : 0.1;
  if (!isFinite(p) || p < -90 || p > 200) return res.status(400).json({ error: 'Άκυρο ποσοστό' });
  const rows = req.body.category_id
    ? db.prepare('SELECT id,price FROM items WHERE category_id=?').all(req.body.category_id)
    : db.prepare('SELECT id,price FROM items').all();
  const up = db.prepare('UPDATE items SET price=? WHERE id=?');
  db.transaction(() => rows.forEach(r => {
    let v = r.price * (1 + p / 100);
    if (step) v = Math.round(v / step) * step;
    up.run(Math.round(v * 100) / 100, r.id);
  }))();
  res.json({ updated: rows.length });
});
app.use('/api/admin', A);

// ---------- Σελίδες ----------
const pub = path.join(__dirname, 'public');
app.get('/admin', (req, res) => res.sendFile(path.join(pub, 'admin.html')));
app.get('/print', (req, res) => res.sendFile(path.join(pub, 'print.html')));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use(express.static(pub, { index: 'index.html', maxAge: 0, setHeaders: (res, filePath) => { if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); } }));

app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Σφάλμα διακομιστή' }); });
app.listen(PORT, '0.0.0.0', () => console.log('Menu server on :' + PORT));
