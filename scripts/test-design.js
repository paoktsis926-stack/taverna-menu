'use strict';
const assert = require('node:assert/strict');
const { DIGITAL_DEFAULT, PDF_DEFAULT, normalizeDesign } = require('../design');

assert.deepEqual(normalizeDesign('digital', {}), DIGITAL_DEFAULT);
assert.deepEqual(normalizeDesign('pdf', {}), PDF_DEFAULT);

const digital = normalizeDesign('digital', {
  colors: { primary: 'url(javascript:alert(1))', accent: '#ABCDEF' },
  typography: { headingFont: 'Comic Sans', bodySize: 500 },
  layout: { frameWidth: 9000, columns: 9, cardRadius: -2 },
  photos: { fit: 'expression(alert(1))', width: 1 },
  branding: { logoUrl: 'javascript:alert(1)', coverUrl: 'https://images.example.test/cover.jpg' },
  devices: { mobile: { fontSize: 99, columns: 0 } }
});
assert.equal(digital.colors.primary, DIGITAL_DEFAULT.colors.primary);
assert.equal(digital.colors.accent, '#ABCDEF');
assert.equal(digital.typography.headingFont, 'Georgia');
assert.equal(digital.typography.bodySize, 24);
assert.equal(digital.layout.frameWidth, 1600);
assert.equal(digital.layout.columns, 3);
assert.equal(digital.layout.cardRadius, 0);
assert.equal(digital.photos.fit, 'cover');
assert.equal(digital.photos.width, 48);
assert.equal(digital.branding.logoUrl, '');
assert.equal(digital.branding.coverUrl, 'https://images.example.test/cover.jpg');
assert.equal(digital.devices.mobile.fontSize, 24);
assert.equal(digital.devices.mobile.columns, 1);

const pdf = normalizeDesign('pdf', { layout: { marginTop: 100, columns: 0 }, typography: { bodySize: 1 } });
assert.equal(pdf.layout.marginTop, 25);
assert.equal(pdf.layout.columns, 1);
assert.equal(pdf.typography.bodySize, 6);
console.log('Design settings validation tests passed.');
