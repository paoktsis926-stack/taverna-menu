// Εισάγει το μενού από το menu-seed.txt.
// Αυτόματα στην πρώτη εκκίνηση (κενή βάση). Χειροκίνητα (αντικαθιστά ΟΛΟ το μενού): npm run seed
const fs = require('fs');
const path = require('path');

const split = s => { const i = s.indexOf(' / '); return i < 0 ? [s.trim(), ''] : [s.slice(0, i).trim(), s.slice(i + 3).trim()]; };

function parse() {
  const lines = fs.readFileSync(path.join(__dirname, 'menu-seed.txt'), 'utf8')
    .split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('//'));
  const cats = [], settings = {};
  for (const l of lines) {
    if (l.startsWith('@')) { const [k, ...v] = l.slice(1).split('='); settings[k.trim()] = v.join('=').trim(); }
    else if (l.startsWith('# ')) { const [el, en] = split(l.slice(2)); cats.push({ el, en, items: [] }); }
    else { const [nm, pr] = l.split('|'); const [el, en] = split(nm); cats[cats.length - 1].items.push({ el, en, price: parseFloat(pr.replace(',', '.')) }); }
  }
  return { settings, cats };
}

function seed(db, force) {
  if (!force && db.prepare('SELECT COUNT(*) n FROM categories').get().n) return false;
  const { settings, cats } = parse();
  const ic = db.prepare('INSERT INTO categories(name,name_en,sort) VALUES(?,?,?)');
  const ii = db.prepare('INSERT INTO items(category_id,name,name_en,price,sort) VALUES(?,?,?,?,?)');
  const us = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  db.transaction(() => {
    if (force) db.exec('DELETE FROM items; DELETE FROM categories;');
    cats.forEach((c, ci) => {
      const id = ic.run(c.el, c.en, ci + 1).lastInsertRowid;
      c.items.forEach((it, i) => ii.run(id, it.el, it.en, it.price, i + 1));
    });
    for (const k in settings) us.run(k, settings[k]);
  })();
  return true;
}

module.exports = { seed, parse };

if (require.main === module) {
  const db = require('./db');
  seed(db, true);
  const n = db.prepare('SELECT COUNT(*) n FROM items').get().n;
  console.log(`Έγινε εισαγωγή: ${n} προϊόντα.`);
}
