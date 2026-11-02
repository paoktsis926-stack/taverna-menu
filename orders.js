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
  note TEXT DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
`);
  // Λογαριασμός: τιμή και ΦΠΑ κάθε γραμμής αποθηκεύονται τη στιγμή της παραγγελίας· το τραπέζι κλείνει με closed_at
  const colsOf = t => db.prepare(`PRAGMA table_info(${t})`).all().map(x => x.name);
  if (!colsOf('order_items').includes('price')) {
    db.exec('ALTER TABLE order_items ADD COLUMN price REAL NOT NULL DEFAULT 0');
    db.exec('ALTER TABLE order_items ADD COLUMN vat INTEGER NOT NULL DEFAULT 13');
    db.exec('UPDATE order_items SET price = COALESCE((SELECT price FROM items WHERE items.id = order_items.item_id), 0), vat = COALESCE((SELECT vat FROM items WHERE items.id = order_items.item_id), 13)');
  }
  if (!colsOf('orders').includes('closed_at')) db.exec('ALTER TABLE orders ADD COLUMN closed_at INTEGER');

  const getItem = db.prepare('SELECT i.id, i.name, i.available, i.price, i.vat, c.name AS category FROM items i JOIN categories c ON c.id = i.category_id WHERE i.id = ?');
  const byClient = db.prepare('SELECT id FROM orders WHERE client_id = ?');
  const insOrder = db.prepare('INSERT INTO orders(client_id, table_label, waiter, note, status, created_at, updated_at) VALUES(?,?,?,?,?,?,?)');
  const insLine = db.prepare('INSERT INTO order_items(order_id, item_id, name, category, qty, note, price, vat) VALUES(?,?,?,?,?,?,?,?)');
  const getOrder = db.prepare('SELECT * FROM orders WHERE id = ?');
  const getLines = db.prepare('SELECT item_id, name, category, qty, note, price, vat FROM order_items WHERE order_id = ? ORDER BY id');
  const listActive = db.prepare(`SELECT * FROM orders WHERE status IN ('new','preparing','ready') ORDER BY created_at, id`);
  const setStatusStmt = db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?');
  const delOneLines = db.prepare('DELETE FROM order_items WHERE order_id = ?');
  const delOne = db.prepare('DELETE FROM orders WHERE id = ?');
  const delLines = db.prepare('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE created_at < ?)');
  const delOrders = db.prepare('DELETE FROM orders WHERE created_at < ?');

  const full = o => (o ? { ...o, items: getLines.all(o.id) } : null);

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
      lines.push({ id: it.id, name: it.name, category: it.category, qty, note: clean(raw.note, 120), price: Number(it.price) || 0, vat: Number(it.vat) === 24 ? 24 : 13 });
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
      for (const l of v.lines) insLine.run(id, l.id, l.name, l.category, l.qty, l.note, l.price, l.vat);
      db.exec('COMMIT');
      return { order: full(getOrder.get(id)) };
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      throw e;
    }
  }

  const list = () => listActive.all().map(full);

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

  // ---------- λογαριασμός ----------
  const openOrders = db.prepare("SELECT * FROM orders WHERE table_label = ? AND closed_at IS NULL AND status != 'cancelled' ORDER BY created_at, id");
  const openTablesQ = db.prepare("SELECT table_label, MIN(created_at) AS since FROM orders WHERE closed_at IS NULL AND status != 'cancelled' GROUP BY table_label ORDER BY since");
  const closeQ = db.prepare("UPDATE orders SET closed_at = ?, updated_at = ?, status = CASE WHEN status IN ('new','preparing','ready') THEN 'served' ELSE status END WHERE table_label = ? AND closed_at IS NULL");
  const cents = x => Math.round((Number(x) || 0) * 100);

  function totals(lines) {
    const by = {};
    let gross = 0;
    for (const l of lines) { gross += l.total; by[l.vat] = (by[l.vat] || 0) + l.total; }
    const rates = Object.keys(by).map(Number).sort((a, b) => a - b).map(rate => {
      const g = by[rate], net = Math.round(g / (1 + rate / 100));
      return { rate, gross: g, net, vat: g - net };
    });
    return { gross, rates };
  }

  function bill(table) {
    const orders = openOrders.all(table);
    const merged = new Map();
    for (const o of orders) for (const l of getLines.all(o.id)) {
      const key = [l.item_id, l.name, l.price, l.vat].join('|');
      const e = merged.get(key) || { name: l.name, price: l.price, vat: l.vat, qty: 0 };
      e.qty += l.qty;
      merged.set(key, e);
    }
    const lines = [...merged.values()].map(l => ({ ...l, total: cents(l.price) * l.qty }));
    return {
      table, orderIds: orders.map(o => o.id), since: orders.length ? orders[0].created_at : null,
      pending: orders.filter(o => ['new', 'preparing', 'ready'].includes(o.status)).length,
      lines, ...totals(lines),
    };
  }
  const openTables = () => openTablesQ.all().map(t => {
    const b = bill(t.table_label);
    return { table: t.table_label, since: t.since, orders: b.orderIds.length, gross: b.gross, pending: b.pending };
  });

  function closeTable(table, force) {
    const b = bill(table);
    if (!b.orderIds.length) return { error: 'Το τραπέζι δεν έχει ανοιχτές παραγγελίες.', code: 404 };
    if (b.pending && !force) return { error: 'Υπάρχουν παραγγελίες που δεν έχουν σερβιριστεί.', code: 409, pending: b.pending };
    const now = Date.now();
    closeQ.run(now, now, table);
    return { ok: true, bill: b };
  }

  return { validate, create, list, get, setStatus, remove, cleanup, bill, openTables, closeTable };
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
  const tableParam = v => clean(v, 20);
  app.get('/api/staff/tables', guard, (req, res) => res.json({ now: Date.now(), tables: core.openTables() }));
  app.get('/api/staff/bill', guard, (req, res) => {
    const t = tableParam(req.query.table);
    if (!t) return res.status(400).json({ error: 'Λείπει το τραπέζι.' });
    res.json(core.bill(t));
  });
  app.post('/api/staff/tables/close', guard, (req, res) => {
    const t = tableParam(req.body && req.body.table);
    if (!t) return res.status(400).json({ error: 'Λείπει το τραπέζι.' });
    const r = core.closeTable(t, !!(req.body && req.body.force));
    if (r.error) return res.status(r.code || 400).json({ error: r.error, pending: r.pending });
    res.json({ ok: true });
  });
  app.get('/bill', (req, res) => res.sendFile(ctx.path.join(ctx.pub, 'bill.html')));
  app.get('/waiter', (req, res) => res.sendFile(ctx.path.join(ctx.pub, 'waiter.html')));
  app.get('/order', (req, res) => res.sendFile(ctx.path.join(ctx.pub, 'order.html')));
  app.get('/kitchen', (req, res) => res.sendFile(ctx.path.join(ctx.pub, 'kitchen.html')));
}

module.exports = { createOrders, mountOrders, STATUSES, ACTIVE, NEXT };
