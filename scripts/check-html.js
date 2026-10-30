'use strict';
const fs = require('fs');
const vm = require('vm');
const files = ['public/index.html', 'public/admin.html', 'public/print.html'];
let checked = 0;
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  for (let i = 0; i < scripts.length; i++) {
    const source = scripts[i][1].trim();
    if (!source) continue;
    new vm.Script(source, { filename: file + ':script-' + (i + 1) });
    checked++;
  }
}
console.log('Έλεγχος σύνταξης επιτυχής:', checked, 'inline scripts.');
