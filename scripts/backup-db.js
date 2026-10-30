'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const source = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'menu.db');
if (!fs.existsSync(source)) { console.error('Δεν βρέθηκε βάση δεδομένων:', source); process.exit(1); }
const dir = path.join(__dirname, '..', 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(dir, 'menu-' + stamp + '.db');
(async () => { const db = new Database(source, { readonly: true, fileMustExist: true }); try { await db.backup(target); console.log('Backup δημιουργήθηκε:', target); } finally { db.close(); } })().catch(err => { console.error('Backup απέτυχε:', err.message); process.exit(1); });
