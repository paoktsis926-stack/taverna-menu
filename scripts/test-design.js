'use strict';
// Έλεγχος του κοινού σχήματος σχεδιασμού (ψηφιακό μενού + PDF).
const assert = require('node:assert/strict');
const D = require('../public/design.js');
for (const kind of ['web', 'pdf']) {
  const def = D.normalize(kind, {});
  assert.ok(Object.keys(def).length > 25, kind + ': πολύ λίγες επιλογές');
  assert.ok(D.isValid(kind, def), kind + ': οι προεπιλογές πρέπει να είναι έγκυρες');
  assert.deepEqual(D.normalize(kind, def), def, kind + ': η κανονικοποίηση πρέπει να είναι σταθερή');
  const css = kind === 'web' ? D.webCss(def) : D.pdfCss(def);
  assert.ok(!/undefined|NaN|\[object/.test(css), kind + ': λάθος τιμή στο CSS');
  // κάθε επιλογή select/range/color/bool: οι ακραίες τιμές δεν σπάνε το CSS
  for (const f of D.fields(kind)) {
    const tries = f.t === 'select' ? f.o.map(o => o[0]) : f.t === 'range' ? [f.min, f.max] : f.t === 'bool' ? [true, false] : ['#000000', '#ffffff'];
    for (const v of tries) {
      const n = D.normalize(kind, { [f.k]: v });
      const out = kind === 'web' ? D.webCss(n) : D.pdfCss(n);
      assert.ok(!/undefined|NaN|\[object/.test(out), `${kind}.${f.k}=${v}: λάθος CSS`);
    }
  }
}
// κακές τιμές απορρίπτονται
assert.ok(!D.isValid('web', { c_header: 'red' }));
assert.ok(!D.isValid('web', { fs: 9999 }));
assert.ok(!D.isValid('web', { style: '<script>' }));
assert.ok(!D.isValid('pdf', { paper: 'A3' }));
assert.ok(!D.isValid('pdf', { evil: 1 }));
assert.equal(D.normalize('web', { style: '<script>' }).style, 'side');
// παλιές ρυθμίσεις μεταφέρονται
assert.equal(D.resolve('web', { layout_style: 'top', layout_numbers: '1' }).style, 'top');
assert.equal(D.resolve('web', { layout_style: 'top', layout_numbers: '1' }).numbers, true);
assert.equal(D.resolve('web', { design_web: '{"style":"text"}' }).style, 'text');
assert.equal(D.resolve('pdf', {}).p_photos, false);
console.log('Έλεγχος σχεδιασμού επιτυχής.');
