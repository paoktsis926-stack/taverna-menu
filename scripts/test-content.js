'use strict';
// Έλεγχοι περιεχομένου χωρίς βάση: διπλότυπα στο seed και συνέπεια μεταφράσεων.
const assert = require('node:assert/strict');
const { parse } = require('../seed');
const t = require('../translations-bg-tr');
const { cats } = parse();
const names = new Set();
for (const c of cats) {
  assert.ok(t.categories[c.el], 'Λείπει μετάφραση κατηγορίας: ' + c.el);
  for (const it of c.items) {
    assert.ok(!names.has(it.el), 'Διπλότυπο πιάτο στο seed: ' + it.el);
    names.add(it.el);
    assert.ok(t.items[it.el], 'Λείπει BG/TR μετάφραση: ' + it.el);
    assert.ok(it.en, 'Λείπει αγγλική μετάφραση: ' + it.el);
    assert.ok(it.price > 0, 'Μη έγκυρη τιμή: ' + it.el);
  }
}
for (const [el, f] of Object.entries(t.fixes || {})) {
  assert.ok(names.has(el), 'Η διόρθωση αναφέρεται σε άγνωστο πιάτο: ' + el);
  const it = cats.flatMap(c => c.items).find(x => x.el === el);
  if (f.en) assert.equal(it.en, f.en[1], 'Το seed δεν συμφωνεί με τη διόρθωση EN: ' + el);
  if (f.bg) assert.equal(t.items[el][0], f.bg[1], 'BG: ' + el);
  if (f.tr) assert.equal(t.items[el][1], f.tr[1], 'TR: ' + el);
}
console.log('Έλεγχος περιεχομένου επιτυχής:', names.size, 'πιάτα,', cats.length, 'κατηγορίες.');
