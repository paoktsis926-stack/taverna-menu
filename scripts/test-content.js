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
// Κάθε γλώσσα έχει πλήρη μετάφραση σε ρυθμίσεις (όνομα, διεύθυνση, υπότιτλος, υποσέλιδο)
const { settings } = parse();
for (const k of require('../translations').TARGET_KEYS) assert.ok(settings[k], 'Λείπει μετάφραση ρύθμισης στο seed: ' + k);
// Έλεγχος ποιότητας: ούτε αγγλικές λέξεις μέσα σε βουλγαρικά/τουρκικά, ούτε κενές/διπλές τιμές
const ENGLISH = /\b(per kilo|portion|with|fried|grilled|salad|cheese|and|beer|water)\b/i;
for (const c of cats) for (const it of c.items) {
  const [bg, tr] = t.items[it.el];
  assert.ok(!ENGLISH.test(bg), 'Αγγλικές λέξεις στα βουλγαρικά: ' + it.el + ' → ' + bg);
  assert.ok(!ENGLISH.test(tr), 'Αγγλικές λέξεις στα τουρκικά: ' + it.el + ' → ' + tr);
  assert.ok(/[\u0400-\u04FF]/.test(bg) || /^[A-Za-z0-9 .\-]+$/.test(bg), 'Τα βουλγαρικά πρέπει να είναι σε κυριλλικό (ή όνομα μάρκας): ' + it.el);
  assert.ok(!/\((Per|Portion|From)\b/.test(it.en), 'Λάθος κεφαλαία στα αγγλικά: ' + it.en);
}
console.log('Έλεγχος περιεχομένου επιτυχής:', names.size, 'πιάτα,', cats.length, 'κατηγορίες.');
