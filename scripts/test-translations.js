'use strict';
// Έλεγχος εξαγωγής/εισαγωγής μεταφράσεων σε προσωρινή βάση μνήμης.
const assert = require('node:assert/strict');
let db;
try { const D = require('better-sqlite3'); db = new D(':memory:'); } catch { const { DatabaseSync } = require('node:sqlite'); db = new DatabaseSync(':memory:'); }
db.exec(`
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT, name_en TEXT DEFAULT '', name_bg TEXT DEFAULT '', name_tr TEXT DEFAULT '', sort INTEGER DEFAULT 0);
CREATE TABLE items (id INTEGER PRIMARY KEY, category_id INTEGER, name TEXT, description TEXT DEFAULT '', allergens TEXT DEFAULT '',
  name_en TEXT DEFAULT '', name_bg TEXT DEFAULT '', name_tr TEXT DEFAULT '', description_en TEXT DEFAULT '', description_bg TEXT DEFAULT '', description_tr TEXT DEFAULT '',
  allergens_en TEXT DEFAULT '', allergens_bg TEXT DEFAULT '', allergens_tr TEXT DEFAULT '', price REAL DEFAULT 5, available INTEGER DEFAULT 1, vat INTEGER DEFAULT 13, sort INTEGER DEFAULT 0);
INSERT INTO categories(id,name) VALUES (1,'Τυριά');
INSERT INTO items(id,category_id,name,description) VALUES (1,1,'Φέτα','Αυθεντική ελληνική φέτα'),(2,1,'Κεφαλοτύρι','');
INSERT INTO settings VALUES ('tagline','40 χρόνια'),('footer','Οι τιμές αλλάζουν');`);
const T = require('../translations');
const settings = { tagline: '40 χρόνια', footer: 'Οι τιμές αλλάζουν' };
let data = T.exportAll(db, settings);
assert.equal(data.format, 'taverna-translations/1');
assert.equal(data.items.length, 2);
assert.equal(data.items[0].description, 'Αυθεντική ελληνική φέτα'); // το ελληνικό κείμενο φαίνεται για να μεταφραστεί
let cov = T.coverage(data);
assert.equal(cov.bg.names, 2); assert.equal(cov.bg.descriptions, 1); assert.equal(cov.bg.settings, 2);

// εισαγωγή: γράφει μόνο μεταφράσεις, δεν αγγίζει τιμές/ΦΠΑ/ελληνικά
data.categories[0].name_bg = 'Сирена'; data.categories[0].name_en = 'Cheeses'; data.categories[0].name_tr = 'Peynirler';
Object.assign(data.items[0], { name_en: 'Feta', name_bg: 'Сирене фета', name_tr: 'Feta peyniri', description_en: 'Authentic Greek feta', description_bg: 'Автентична гръцка фета', description_tr: 'Otantik Yunan fetası' });
data.items[0].price = 999; data.items[0].name = 'ΧΑΚΑΡΙΣΜΕΝΟ'; data.items[0].vat = 24;
data.settings.tagline_bg = '40 години'; data.settings.tagline = 'ΧΑΚΑΡΙΣΜΕΝΟ';
const r = T.importAll(db, data);
assert.ok(r.ok); assert.equal(r.categories, 1); assert.equal(r.items, 2);
const f = db.prepare('SELECT * FROM items WHERE id = 1').get();
assert.equal(f.name_bg, 'Сирене фета'); assert.equal(f.description_tr, 'Otantik Yunan fetası');
assert.equal(f.price, 5); assert.equal(f.name, 'Φέτα'); assert.equal(f.vat, 13); // αμετάβλητα
assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'tagline_bg'").get().value, '40 години');
assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'tagline'").get().value, '40 χρόνια'); // το ελληνικό δεν αλλάζει
cov = T.coverage(T.exportAll(db, { tagline: '40 χρόνια', footer: 'Οι τιμές αλλάζουν', tagline_bg: '40 години' }));
assert.equal(cov.bg.names, 1); assert.equal(cov.bg.descriptions, 0); assert.equal(cov.bg.settings, 1);
// μη έγκυρο αρχείο και κακά δεδομένα
assert.ok(T.importAll(db, { format: 'x' }).error);
assert.ok(T.importAll(db, null).error);
const r2 = T.importAll(db, { format: 'taverna-translations/1', items: [{ id: 'DROP TABLE', name_en: 'x' }, { id: 999, name_en: 'y' }], categories: 'oops' });
assert.equal(r2.items, 0);
// μακριά κείμενα κόβονται
T.importAll(db, { format: 'taverna-translations/1', items: [{ id: 2, name_en: 'x'.repeat(500), description_en: 'y'.repeat(900) }] });
assert.equal(db.prepare('SELECT name_en FROM items WHERE id = 2').get().name_en.length, 150);
assert.equal(db.prepare('SELECT description_en FROM items WHERE id = 2').get().description_en.length, 400);
console.log('Έλεγχος μεταφράσεων επιτυχής.');
