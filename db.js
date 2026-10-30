const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'menu.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
  sort INTEGER DEFAULT 0, visible INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT DEFAULT '', price REAL DEFAULT 0,
  available INTEGER DEFAULT 1, sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS views (day TEXT NOT NULL, lang TEXT NOT NULL, n INTEGER DEFAULT 0, PRIMARY KEY (day, lang));
`);
const addCol = (t, c, d) => {
  if (!db.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`);
};
addCol('categories', 'name_en', "TEXT DEFAULT ''");
addCol('items', 'name_en', "TEXT DEFAULT ''");
addCol('items', 'description_en', "TEXT DEFAULT ''");
addCol('items', 'allergens', "TEXT DEFAULT ''");
addCol('items', 'allergens_en', "TEXT DEFAULT ''");
// Safe, idempotent migrations: preserve all existing dish records and media URLs.
addCol('items', 'image_url', "TEXT DEFAULT ''");
addCol('items', 'allergen_codes', "TEXT DEFAULT '[]'");
addCol('items', 'popular', "INTEGER DEFAULT 0");

module.exports = db;
