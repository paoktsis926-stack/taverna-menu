'use strict';
// Έλεγχος της λογικής παραγγελιών σε προσωρινή βάση μνήμης (δεν αγγίζει τα πραγματικά δεδομένα).
const assert = require('node:assert/strict');
let Database;
try { Database = require('better-sqlite3'); } catch { Database = null; }
let db;
if (Database) db = new Database(':memory:');
else { const { DatabaseSync } = require('node:sqlite'); db = new DatabaseSync(':memory:'); }
db.exec(`
CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE items (id INTEGER PRIMARY KEY, category_id INTEGER, name TEXT, available INTEGER DEFAULT 1, price REAL DEFAULT 0, vat INTEGER DEFAULT 13);
INSERT INTO categories VALUES (1,'Ψάρια');
INSERT INTO items VALUES (1,1,'Τσιπούρες',1,40,13),(2,1,'Γαύρος',1,8,13),(3,1,'Εξαντλημένο',0,5,13),(4,1,'Μπύρα',1,4.5,24);`);
const { createOrders } = require('../orders');
const o = createOrders(db);

// κενή / λάθος είσοδος
assert.ok(o.create({}).error);
assert.ok(o.create({ table: '', items: [{ id: 1, qty: 1 }] }).error);
assert.ok(o.create({ table: '<b>7</b>', items: [{ id: 1, qty: 1 }] }).error);
assert.ok(o.create({ table: '7', items: [] }).error);
assert.ok(o.create({ table: '7', items: [{ id: 1, qty: 0 }] }).error);
assert.ok(o.create({ table: '7', items: [{ id: 1, qty: 99 }] }).error);
assert.ok(o.create({ table: '7', items: [{ id: 999, qty: 1 }] }).error);
assert.match(o.create({ table: '7', items: [{ id: 3, qty: 1 }] }).error, /εξαντληθεί/);

// σωστή παραγγελία, με όνομα από τον κατάλογο (όχι από τον client)
const r = o.create({ table: ' Βεράντα 2 ', waiter: 'Μαρία', note: 'βιάζονται', clientId: 'abcd-1234-efgh', items: [{ id: 1, qty: 2, note: 'χωρίς λεμόνι', name: 'ΨΕΥΤΙΚΟ' }, { id: 2, qty: 1 }] });
assert.equal(r.order.table_label, 'Βεράντα 2');
assert.equal(r.order.items.length, 2);
assert.equal(r.order.items[0].name, 'Τσιπούρες');
assert.equal(r.order.items[0].note, 'χωρίς λεμόνι');
assert.equal(r.order.status, 'new');

// διπλή αποστολή (ίδιο clientId) δεν δημιουργεί δεύτερη παραγγελία
const dup = o.create({ table: 'Βεράντα 2', clientId: 'abcd-1234-efgh', items: [{ id: 1, qty: 2 }] });
assert.ok(dup.duplicate);
assert.equal(o.list().length, 1);

// καταστάσεις
const id = r.order.id;
assert.equal(o.setStatus(id, 'preparing').order.status, 'preparing');
assert.equal(o.setStatus(id, 'served').code, 409); // δεν γίνεται σερβιρισμένη χωρίς να είναι έτοιμη
assert.equal(o.setStatus(id, 'ready').order.status, 'ready');
assert.equal(o.setStatus(id, 'served').order.status, 'served');
assert.equal(o.list().length, 0);
assert.equal(o.setStatus(id, 'new').code, 409);
assert.equal(o.setStatus(12345, 'ready').code, 404);
assert.ok(o.setStatus(id, 'foo').error);

// χειροκίνητη διαγραφή
const d = o.create({ table: '3', items: [{ id: 2, qty: 1 }] }).order;
assert.equal(o.get(d.id).items.length, 1);
assert.ok(o.remove(d.id).ok);
assert.equal(o.get(d.id), null);
assert.equal(o.remove(d.id).code, 404);
assert.equal(db.prepare('SELECT COUNT(*) n FROM order_items WHERE order_id = ?').get(d.id).n, 0);

// ---------- λογαριασμός με ΦΠΑ 13% / 24% ----------
const b1 = o.create({ table: '7', items: [{ id: 1, qty: 2 }, { id: 4, qty: 1 }] }).order;
assert.equal(b1.items[0].price, 40);
assert.equal(b1.items[1].vat, 24);
o.create({ table: '7', items: [{ id: 4, qty: 1 }, { id: 2, qty: 1 }] }); // δεύτερη παραγγελία ίδιου τραπεζιού
const c = o.create({ table: '7', items: [{ id: 2, qty: 1 }] }).order; // θα ακυρωθεί → δεν μετράει
assert.equal(o.setStatus(c.id, 'cancelled').order.status, 'cancelled');
let bl = o.bill('7');
assert.equal(bl.orderIds.length, 2);
const beer = bl.lines.find(l => l.name === 'Μπύρα');
assert.equal(beer.qty, 2); // ίδια γραμμή από δύο παραγγελίες ενώνεται
assert.equal(bl.gross, 40 * 2 * 100 + 8 * 100 + 4.5 * 2 * 100); // 8000 + 800 + 900 = 9700
assert.equal(bl.gross, 9700);
const r13 = bl.rates.find(r => r.rate === 13), r24 = bl.rates.find(r => r.rate === 24);
assert.equal(r13.gross, 8800); assert.equal(r13.net, Math.round(8800 / 1.13)); assert.equal(r13.vat, r13.gross - r13.net);
assert.equal(r24.gross, 900); assert.equal(r24.net, Math.round(900 / 1.24)); assert.equal(r24.vat, r24.gross - r24.net);
assert.equal(bl.rates.reduce((a, r) => a + r.net + r.vat, 0), bl.gross); // καθαρή αξία + ΦΠΑ = σύνολο
// αλλαγή τιμής μετά την παραγγελία δεν αλλάζει τον λογαριασμό
db.exec('UPDATE items SET price = 99 WHERE id = 1');
assert.equal(o.bill('7').gross, 9700);
assert.ok(o.openTables().some(t => t.table === '7' && t.gross === 9700));
// κλείσιμο τραπεζιού: αρνείται αν υπάρχουν μη σερβιρισμένα, εκτός αν force
assert.equal(o.closeTable('7', false).code, 409);
assert.ok(o.closeTable('7', true).ok);
assert.equal(o.bill('7').gross, 0);
assert.equal(o.closeTable('7', true).code, 404);
assert.ok(!o.list().some(x => x.table_label === '7')); // τα πιάτα που έμεναν στην κουζίνα έκλεισαν
const again = o.create({ table: '7', items: [{ id: 2, qty: 1 }] }).order; // νέο άνοιγμα τραπεζιού
assert.equal(o.bill('7').gross, 800);
assert.ok(again.id);

// καθαρισμός παλιών
db.exec(`UPDATE orders SET created_at = 1`);
o.cleanup();
assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
assert.equal(db.prepare('SELECT COUNT(*) n FROM order_items').get().n, 0);
console.log('Έλεγχος παραγγελιών επιτυχής.');
