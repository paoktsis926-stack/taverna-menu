'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taverna-menu-migration-'));
const file = path.join(dir, 'legacy.db');
process.env.DB_PATH = file;
try {
  const legacy = new Database(file);
  legacy.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sort INTEGER DEFAULT 0, visible INTEGER DEFAULT 1); CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT DEFAULT '', price REAL DEFAULT 0, available INTEGER DEFAULT 1, sort INTEGER DEFAULT 0); CREATE TABLE views (day TEXT NOT NULL, lang TEXT NOT NULL, n INTEGER DEFAULT 0, PRIMARY KEY (day, lang));");
  const categoryId = legacy.prepare('INSERT INTO categories(name) VALUES (?)').run('Ορεκτικά').lastInsertRowid;
  const itemId = legacy.prepare('INSERT INTO items(category_id,name,description,price) VALUES (?,?,?,?)').run(categoryId, 'Τζατζίκι', 'Παραδοσιακό', 4.5).lastInsertRowid;
  legacy.close();

  let db = require('../db');
  const columns = db.prepare('PRAGMA table_info(items)').all().map(row => row.name);
  assert.ok(columns.includes('image_url'), 'image_url migration must be applied');
  assert.equal(db.prepare('SELECT name FROM items WHERE id=?').get(itemId).name, 'Τζατζίκι', 'existing item must be preserved');
  db.prepare('UPDATE items SET image_url=? WHERE id=?').run('https://example.com/tzatziki.jpg', itemId);
  db.close();

  delete require.cache[require.resolve('../db')];
  db = require('../db');
  assert.equal(db.prepare('SELECT image_url FROM items WHERE id=?').get(itemId).image_url, 'https://example.com/tzatziki.jpg', 'migration must be repeatable and preserve photo URLs');
  db.close();
  console.log('SQLite migration test passed: legacy rows preserved, image_url added idempotently.');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
