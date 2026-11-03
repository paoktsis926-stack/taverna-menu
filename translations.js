'use strict';
// Εξαγωγή / εισαγωγή μεταφράσεων σε JSON (μαζική μετάφραση όλου του καταλόγου, από άκρη σε άκρη).
// Δεν αγγίζει τιμές, φωτογραφίες, διαθεσιμότητα, ΦΠΑ ή ελληνικά κείμενα.
const TEXT_KEYS = ['name', 'address', 'tagline', 'footer'].flatMap(k => [k, k + '_en', k + '_bg', k + '_tr']);
const TARGET_KEYS = TEXT_KEYS.filter(k => /_(en|bg|tr)$/.test(k)); // μόνο οι μεταφράσεις γράφονται
const LANGS = ['en', 'bg', 'tr'];
const cut = (v, n) => String(v ?? '').trim().slice(0, n);

function exportAll(db, settingsObj) {
  const settings = Object.fromEntries(TEXT_KEYS.map(k => [k, settingsObj[k] || '']));
  const categories = db.prepare('SELECT id, name, name_en, name_bg, name_tr FROM categories ORDER BY sort, id').all();
  const items = db.prepare(`SELECT i.id, c.name AS category, i.name, i.description, i.allergens,
    i.name_en, i.name_bg, i.name_tr, i.description_en, i.description_bg, i.description_tr, i.allergens_en, i.allergens_bg, i.allergens_tr
    FROM items i JOIN categories c ON c.id = i.category_id ORDER BY c.sort, c.id, i.sort, i.id`).all();
  return { format: 'taverna-translations/1', settings, categories, items };
}

function importAll(db, body) {
  const b = body || {};
  if (b.format !== 'taverna-translations/1') return { error: 'Μη έγκυρο αρχείο μεταφράσεων.' };
  const uc = db.prepare('UPDATE categories SET name_en = ?, name_bg = ?, name_tr = ? WHERE id = ?');
  const ui = db.prepare('UPDATE items SET name_en = ?, name_bg = ?, name_tr = ?, description_en = ?, description_bg = ?, description_tr = ?, allergens_en = ?, allergens_bg = ?, allergens_tr = ? WHERE id = ?');
  const us = db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  let nc = 0, ni = 0, ns = 0;
  db.exec('BEGIN');
  try {
    for (const c of Array.isArray(b.categories) ? b.categories : []) {
      if (!Number.isInteger(c.id)) continue;
      nc += Number(uc.run(...LANGS.map(l => cut(c['name_' + l], 100)), c.id).changes);
    }
    for (const i of Array.isArray(b.items) ? b.items : []) {
      if (!Number.isInteger(i.id)) continue;
      ni += Number(ui.run(...LANGS.map(l => cut(i['name_' + l], 150)), ...LANGS.map(l => cut(i['description_' + l], 400)), ...LANGS.map(l => cut(i['allergens_' + l], 300)), i.id).changes);
    }
    for (const k of TARGET_KEYS) if (b.settings && typeof b.settings[k] === 'string') { us.run(k, cut(b.settings[k], 300)); ns++; }
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
  return { ok: true, categories: nc, items: ni, settings: ns };
}

// Έλεγχος κάλυψης: τι λείπει ανά γλώσσα (για τη Διαχείριση και για τον έλεγχο πριν την εκτύπωση)
function coverage(data) {
  const out = {};
  for (const l of LANGS) {
    out[l] = {
      categories: data.categories.filter(c => !c['name_' + l]).length,
      names: data.items.filter(i => !i['name_' + l]).length,
      descriptions: data.items.filter(i => i.description && !i['description_' + l]).length,
      settings: ['name', 'address', 'tagline', 'footer'].filter(k => data.settings[k] && !data.settings[k + '_' + l]).length,
    };
  }
  return out;
}

module.exports = { TEXT_KEYS, TARGET_KEYS, exportAll, importAll, coverage };
