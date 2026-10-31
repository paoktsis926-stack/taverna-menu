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
CREATE TABLE items (id INTEGER PRIMARY KEY, category_id INTEGER, name TEXT, available INTEGER DEFAULT 1);
INSERT INTO categories VALUES (1,'Ψάρια');
INSERT INTO items VALUES (1,1,'Τσιπούρες',1),(2,1,'Γαύρος',1),(3,1,'Εξαντλημένο',0);`);
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

// καθαρισμός παλιών
db.exec(`UPDATE orders SET created_at = 1`);
o.cleanup();
assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
assert.equal(db.prepare('SELECT COUNT(*) n FROM order_items').get().n, 0);
console.log('Έλεγχος παραγγελιών επιτυχής.');
