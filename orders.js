'use strict';
// Παραγγελίες σερβιτόρων → κουζίνα. Χρησιμοποιεί τον ίδιο κατάλογο (πίνακας items) με το μενού.
const crypto = require('crypto');

const STATUSES = ['new', 'preparing', 'ready', 'served', 'cancelled'];
const ACTIVE = ['new', 'preparing', 'ready'];
const NEXT = {
  new: ['preparing', 'ready', 'cancelled'],
  preparing: ['ready', 'new', 'cancelled'],
  ready: ['served', 'preparing', 'cancelled'],
  served: [],
  cancelled: [],
};
const KEEP_MS = 3 * 864e5; // οι παραγγελίες σβήνονται μετά από 3 ημέρες

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function createOrders(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT UNIQUE,
  table_label TEXT NOT NULL,
  waiter TEXT DEFAULT '',
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id INTEGER,
  name TEXT NOT NULL,
  category TEXT DEFAULT '',
  qty INTEGER NOT NULL,
  note TEXT DEFAULT '',
  unit_price REAL NOT NULL DEFAULT 0,
  vat_rate INTEGER NOT NULL DEFAULT 13);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
`);

  // Idempotent migration for existing waiter orders. Snapshot menu price and VAT once,
  // so later product edits never rewrite an already placed order.
  const lineColumns = new Set(db.prepare('PRAGMA table_info(order_items)').all().map(x => x.name));
  if (!lineColumns.has('unit_price')) {
    db.exec('ALTER TABLE order_items ADD COLUMN unit_price REAL NOT NULL DEFAULT 0');
    db.exec('UPDATE order_items SET unit_price=COALESCE((SELECT price FROM items WHERE items.id=order_items.item_id),0)');
  }
  if (!lineColumns.has('vat_rate')) {
    db.exec('ALTER TABLE order_items ADD COLUMN vat_rate INTEGER NOT NULL DEFAULT 13');
    db.exec('UPDATE order_items SET vat_rate=COALESCE((SELECT vat_rate FROM items WHERE items.id=order_items.item_id),13)');
  }

  const getItem = db.prepare('SELECT i.id, i.name, i.available, i.price, i.vat_rate, c.name AS category FROM items i JOIN categories c ON c.id = i.category_id WHERE i.id = ?');
  const byClient = db.prepare('SELECT id FROM orders WHERE client_id = ?');
  const insOrder = db.prepare('INSERT INTO orders(client_id, table_label, waiter, note, status, created_at, updated_at) VALUES(?,?,?,?,?,?,?)');
  const insLine = db.prepare('INSERT INTO order_items(order_id, item_id, name, category, qty, note, unit_price, vat_rate) VALUES(?,?,?,?,?,?,?,?)');
  const getOrder = db.prepare('SELECT * FROM orders WHERE id = ?');
  const getLines = db.prepare('SELECT item_id, name, category, qty, note, unit_price, vat_rate FROM order_items WHERE order_id = ? ORDER BY id');
  const listForBills = db.prepare("SELECT * FROM orders WHERE status <> 'cancelled' ORDER BY created_at, id");
  const listActive = db.prepare(`SELECT * FROM orders WHERE status IN ('new','preparing','ready') ORDER BY created_at, id`);
  const setStatusStmt = db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?');
  const delOneLines = db.prepare('DELETE FROM order_items WHERE order_id = ?');
  const delOne = db.prepare('DELETE FROM orders WHERE id = ?');
  const delLines = db.prepare('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE created_at < ?)');
  const delOrders = db.prepare('DELETE FROM orders WHERE created_at < ?');

  function summarize(lines) {
    const out = { net: 0, vat13: 0, vat24: 0, vat: 0, total: 0 };
    let netCents = 0, vat13Cents = 0, vat24Cents = 0, totalCents = 0;
    for (const line of lines) {
      const gross = Math.round(Number(line.unit_price) * 100) * Number(line.qty);
      const rate = Number(line.vat_rate);
      const tax = Math.round(gross * rate / (100 + rate));
      totalCents += gross;
      if (rate === 13) vat13Cents += tax; else if (rate === 24) vat24Cents += tax;
      netCents += gross - tax;
    }
    out.net = netCents / 100; out.vat13 = vat13Cents / 100; out.vat24 = vat24Cents / 100;
    out.vat = (vat13Cents + vat24Cents) / 100; out.total = totalCents / 100;
    return out;
  }
  const full = o => { if (!o) return null; const items = getLines.all(o.id); return { ...o, items, totals: summarize(items) }; };

  function validate(body) {
    body = body || {};
    const table = clean(body.table, 20);
    if (!table || !/^[\p{L}\p{N} .\-\/]+$/u.test(table)) return { error: 'Γράψτε τραπέζι (π.χ. 7 ή Βεράντα 2).' };
    if (!Array.isArray(body.items) || !body.items.length) return { error: 'Η παραγγελία είναι κενή.' };
    if (body.items.length > 60) return { error: 'Πολλά πιάτα σε μία παραγγελία.' };
    const lines = [];
    for (const raw of body.items) {
      const id = Number(raw && raw.id), qty = Number(raw && raw.qty);
      if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1 || qty > 50) return { error: 'Μη έγκυρο πιάτο ή ποσότητα.' };
      const it = getItem.get(id);
      if (!it) return { error: 'Ένα πιάτο δεν υπάρχει πια στον κατάλογο.' };
      if (!it.available) return { error: `Το «${it.name}» έχει εξαντληθεί.` };
      const price = Number(it.price), vatRate = Number(it.vat_rate);
      if (!Number.isFinite(price) || price < 0 || ![13,24].includes(vatRate)) return { error: 'Το προϊόν έχει μη έγκυρη τιμή ή συντελεστή ΦΠΑ. Ελέγξτε το στο Admin.' };
      lines.push({ id: it.id, name: it.name, category: it.category, qty, note: clean(raw.note, 120), unit_price: Math.round(price * 100) / 100, vat_rate: vatRate });
    }
    const cid = clean(body.clientId, 64);
    return {
      table, lines,
      note: clean(body.note, 200),
      waiter: clean(body.waiter, 30),
      clientId: /^[A-Za-z0-9-]{8,64}$/.test(cid) ? cid : null,
    };
  }

  function create(body) {
    const v = validate(body);
    if (v.error) return { error: v.error };
    if (v.clientId) { // ίδια αποστολή ξανά (κακό δίκτυο) → επιστρέφει την ήδη καταχωρημένη
      const ex = byClient.get(v.clientId);
      if (ex) return { order: full(getOrder.get(ex.id)), duplicate: true };
    }
    const now = Date.now();
    db.exec('BEGIN IMMEDIATE');
    try {
      const r = insOrder.run(v.clientId, v.table, v.waiter, v.note, 'new', now, now);
      const id = Number(r.lastInsertRowid);
      for (const l of v.lines) insLine.run(id, l.id, l.name, l.category, l.qty, l.note, l.unit_price, l.vat_rate);
      db.exec('COMMIT');
      return { order: full(getOrder.get(id)) };
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      throw e;
    }
  }

  const list = () => listActive.all().map(full);
  function bills() {
    const grouped = new Map();
    for (const row of listForBills.all()) {
      const order = full(row);
      if (!grouped.has(order.table_label)) grouped.set(order.table_label, { table_label: order.table_label, orders: [], totals: { net: 0, vat13: 0, vat24: 0, vat: 0, total: 0 } });
      const bill = grouped.get(order.table_label);
      bill.orders.push(order);
      for (const key of ['net','vat13','vat24','vat','total']) bill.totals[key] = Math.round((bill.totals[key] + order.totals[key]) * 100) / 100;
    }
    return Array.from(grouped.values()).sort((a,b) => a.table_label.localeCompare(b.table_label, 'el', { numeric: true }));
  }

  function setStatus(id, status) {
    if (!STATUSES.includes(status)) return { error: 'Μη έγκυρη κατάσταση.' };
    const o = getOrder.get(id);
    if (!o) return { error: 'Η παραγγελία δεν βρέθηκε.', code: 404 };
    if (o.status === status) return { order: full(o) };
    if (!NEXT[o.status].includes(status)) return { error: 'Δεν επιτρέπεται αυτή η αλλαγή.', code: 409 };
    setStatusStmt.run(status, Date.now(), id);
    return { order: full(getOrder.get(id)) };
  }

  function cleanup() {
    const cut = Date.now() - KEEP_MS;
    db.exec('BEGIN');
    try { delLines.run(cut); delOrders.run(cut); db.exec('COMMIT'); } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
  }

  const get = id => full(getOrder.get(id));

  function remove(id) {
    if (!getOrder.get(id)) return { error: 'Η παραγγελία δεν βρέθηκε.', code: 404 };
    db.exec('BEGIN');
    try { delOneLines.run(id); delOne.run(id); db.exec('COMMIT'); } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
    return { ok: true };
  }

  return { validate, create, list, bills, get, setStatus, remove, cleanup };
}

// Σύνδεση με το express. ctx: { sign, getCookie, safeEq, attempts, adminAuthed, adminPassword, staffPassword, pub, path }
function mountOrders(app, db, ctx) {
  const core = createOrders(db);
  core.cleanup();
  setInterval(() => { try { core.cleanup(); } catch (e) { console.error(e); } }, 6 * 3600e3).unref();

  const TTL = 16 * 3600e3;
  const makeToken = () => { const exp = String(Date.now() + TTL); return exp + '.' + ctx.sign('staff:' + exp); };
  const staffAuthed = req => {
    if (ctx.adminAuthed(req)) return true;
    const [exp, sig] = ctx.getCookie(req, 'staff').split('.');
    if (!exp || !sig || +exp < Date.now()) return false;
    const good = ctx.sign('staff:' + exp);
    return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
  };
  const guard = (req, res, next) => (staffAuthed(req) ? next() : res.status(401).json({ error: 'Απαιτείται σύνδεση.' }));

  app.post('/api/staff/login', (req, res) => {
    const key = 'staff:' + req.ip;
    const a = ctx.attempts.get(key) || { n: 0, t: Date.now() };
    if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
    if (a.n >= 10) return res.status(429).json({ error: 'Πολλές προσπάθειες. Δοκιμάστε σε λίγα λεπτά.' });
    const pw = String((req.body && req.body.password) || '');
    const ok = (ctx.staffPassword && ctx.safeEq(pw, ctx.staffPassword)) || ctx.safeEq(pw, ctx.adminPassword);
    if (!ok) { a.n++; ctx.attempts.set(key, a); return res.status(401).json({ error: 'Λάθος κωδικός' }); }
    ctx.attempts.delete(key);
    res.cookie('staff', makeToken(), { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: TTL });
    res.json({ ok: true });
  });
  app.post('/api/staff/logout', (req, res) => { res.clearCookie('staff'); res.json({ ok: true }); });
  app.get('/api/staff/me', guard, (req, res) => res.json({ ok: true }));
  app.get('/api/staff/orders', guard, (req, res) => res.json({ now: Date.now(), orders: core.list() }));
  app.get('/api/staff/bills', guard, (req, res) => res.json({ bills: core.bills() }));
  app.post('/api/staff/orders', guard, (req, res) => {
    const r = core.create(req.body);
    if (r.error) return res.status(400).json({ error: r.error });
    res.status(r.duplicate ? 200 : 201).json(r.order);
  });
  app.get('/api/staff/orders/:id', guard, (req, res) => {
    const o = core.get(Number(req.params.id));
    if (!o) return res.status(404).json({ error: 'Η παραγγελία δεν βρέθηκε.' });
    res.json(o);
  });
  app.delete('/api/staff/orders/:id', guard, (req, res) => {
    const r = core.remove(Number(req.params.id));
    if (r.error) return res.status(r.code || 400).json({ error: r.error });
    res.json({ ok: true });
  });
  app.patch('/api/staff/orders/:id', guard, (req, res) => {
    const r = core.setStatus(Number(req.params.id), String((req.body && req.body.status) || ''));
    if (r.error) return res.status(r.code || 400).json({ error: r.error });
    res.json(r.order);
  });
  app.get('/waiter', (req, res) => res.sendFile(ctx.path.join(ctx.pub, 'waiter.html')));
  app.get('/order', (req, res) => res.sendFile(ctx.path.join(ctx.pub, 'order.html')));
  app.get('/kitchen', (req, res) => res.sendFile(ctx.path.join(ctx.pub, 'kitchen.html')));
}

module.exports = { createOrders, mountOrders, STATUSES, ACTIVE, NEXT };
