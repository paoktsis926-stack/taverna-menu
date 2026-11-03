/* Κοινός ορισμός σχεδιασμού για το ψηφιακό μενού και το PDF.
   Χρησιμοποιείται από: τη Διαχείριση (φόρμα + προεπισκόπηση), το μενού (index.html),
   το PDF (print.html) και τον server (έλεγχος τιμών). Μία πηγή αλήθειας για όλα. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DESIGN = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FONTS = {
    classic: { label: 'Κλασική (Georgia)', css: 'Georgia,"Times New Roman",serif' },
    elegant: { label: 'Κομψή (Palatino)', css: '"Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif' },
    modern: { label: 'Σύγχρονη (Helvetica / Arial)', css: 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif' },
    rounded: { label: 'Στρογγυλή (Trebuchet)', css: '"Trebuchet MS","Segoe UI",Verdana,sans-serif' },
    mono: { label: 'Γραφομηχανή (Courier)', css: '"Courier New",Courier,monospace' },
  };
  const fontOpts = Object.keys(FONTS).map(k => [k, FONTS[k].label]);
  const YN = [['1', 'Ναι'], ['0', 'Όχι']];

  // type: select | color | range | bool
  // Ενημέρωση για αλλεργίες (ίδιο κείμενο στο ψηφιακό μενού και στο PDF)
  const ALLERGY = {
    el: 'Αλλεργία ή δυσανεξία; Παρακαλούμε ενημερώστε το προσωπικό πριν παραγγείλετε και ζητήστε πληροφορίες για τα αλλεργιογόνα κάθε πιάτου. Ενδέχεται να υπάρξει επιμόλυνση κατά την προετοιμασία.',
    en: 'Allergy or intolerance? Please tell our staff before you order and ask for allergen information on any dish. Cross-contact may occur during preparation.',
    bg: 'Алергия или непоносимост? Моля, уведомете персонала, преди да поръчате, и попитайте за алергените във всяко ястие. Възможен е кръстосан контакт при приготвянето.',
    tr: 'Alerjiniz veya intoleransınız mı var? Lütfen sipariş vermeden önce personelimize bildirin ve her yemeğin alerjenlerini sorun. Hazırlık sırasında çapraz bulaşma olabilir.',
  };

  const WEB = [
    ['Χρώματα', [
      { k: 'c_header', t: 'color', d: '#103c46', l: 'Χρώμα επάνω μέρους' },
      { k: 'c_header_text', t: 'color', d: '#ffffff', l: 'Γράμματα επάνω μέρους' },
      { k: 'c_accent', t: 'color', d: '#d7ad63', l: 'Χρώμα έμφασης (γραμμές, κουμπιά)' },
      { k: 'c_bg', t: 'color', d: '#f6f4ee', l: 'Φόντο σελίδας' },
      { k: 'c_card', t: 'color', d: '#fffefa', l: 'Φόντο κάρτας πιάτου' },
      { k: 'c_text', t: 'color', d: '#19353a', l: 'Χρώμα κειμένου' },
      { k: 'c_title', t: 'color', d: '#103c46', l: 'Χρώμα τίτλων κατηγοριών' },
      { k: 'c_price', t: 'color', d: '#103c46', l: 'Χρώμα τιμής' },
    ]],
    ['Γράμματα', [
      { k: 'f_head', t: 'select', d: 'classic', o: fontOpts, l: 'Γραμματοσειρά τίτλων' },
      { k: 'f_body', t: 'select', d: 'modern', o: fontOpts, l: 'Γραμματοσειρά κειμένου' },
      { k: 'fs', t: 'range', d: 100, min: 85, max: 130, step: 5, u: '%', l: 'Μέγεθος γραμμάτων' },
      { k: 'title_size', t: 'range', d: 100, min: 60, max: 140, step: 5, u: '%', l: 'Μέγεθος ονόματος μαγαζιού' },
      { k: 'cat_size', t: 'range', d: 27, min: 18, max: 44, step: 1, u: 'px', l: 'Μέγεθος τίτλων κατηγοριών' },
      { k: 'cat_upper', t: 'bool', d: false, l: 'Τίτλοι κατηγοριών με κεφαλαία' },
    ]],
    ['Επάνω μέρος', [
      { k: 'hd_size', t: 'select', d: 'normal', o: [['compact', 'Μικρό'], ['normal', 'Κανονικό'], ['tall', 'Μεγάλο']], l: 'Ύψος' },
      { k: 'hd_align', t: 'select', d: 'center', o: [['center', 'Στο κέντρο'], ['left', 'Αριστερά']], l: 'Στοίχιση' },
      { k: 'hd_eyebrow', t: 'bool', d: true, l: 'Μικρός τίτλος «Ψηφιακός κατάλογος»' },
      { k: 'hd_tagline', t: 'bool', d: true, l: 'Υπότιτλος' },
      { k: 'hd_address', t: 'bool', d: true, l: 'Διεύθυνση' },
      { k: 'hd_deco', t: 'bool', d: true, l: 'Διακοσμητικοί κύκλοι' },
    ]],
    ['Κατηγορίες και αναζήτηση', [
      { k: 'cat_style', t: 'select', d: 'line', o: [['line', 'Με γραμμή'], ['plain', 'Απλός τίτλος'], ['pill', 'Κάψουλα'], ['boxed', 'Με πλαϊνή μπάρα']], l: 'Στυλ τίτλου κατηγορίας' },
      { k: 'show_nav', t: 'bool', d: true, l: 'Κουμπιά κατηγοριών (πλοήγηση)' },
      { k: 'show_allergy_box', t: 'bool', d: true, l: 'Ειδοποίηση για αλλεργίες (πάνω από τον κατάλογο)' },
      { k: 'show_search', t: 'bool', d: true, l: 'Αναζήτηση πιάτου' },
      { k: 'show_avail', t: 'bool', d: true, l: 'Φίλτρο «Μόνο διαθέσιμα»' },
    ]],
    ['Πιάτα', [
      { k: 'style', t: 'select', d: 'side', o: [['side', 'Φωτογραφία δίπλα στο κείμενο'], ['top', 'Μεγάλη φωτογραφία από πάνω'], ['text', 'Μόνο κείμενο']], l: 'Στυλ πιάτου' },
      { k: 'photo', t: 'select', d: 'md', o: [['sm', 'Μικρή'], ['md', 'Μεσαία'], ['lg', 'Μεγάλη']], l: 'Μέγεθος φωτογραφίας' },
      { k: 'shape', t: 'select', d: 'square', o: [['square', 'Τετράγωνο'], ['wide', 'Οριζόντιο (4:3)'], ['round', 'Στρογγυλό']], l: 'Σχήμα φωτογραφίας' },
      { k: 'columns', t: 'select', d: '2', o: [['2', '2 στήλες'], ['1', '1 στήλη']], l: 'Στήλες στον υπολογιστή' },
      { k: 'numbers', t: 'bool', d: false, l: 'Αρίθμηση πιάτων (1, 2, 3…)' },
      { k: 'bilingual', t: 'bool', d: false, l: 'Ελληνικά και αγγλικά μαζί (στα ελληνικά)' },
      { k: 'show_original', t: 'bool', d: false, l: 'Ελληνικό όνομα κάτω από τη μετάφραση (στις ξένες γλώσσες)' },
      { k: 'price_pos', t: 'select', d: 'right', o: [['right', 'Δεξιά από το όνομα'], ['below', 'Κάτω από το όνομα']], l: 'Θέση τιμής' },
      { k: 'show_desc', t: 'bool', d: true, l: 'Περιγραφές' },
      { k: 'show_allergens', t: 'bool', d: true, l: 'Αλλεργιογόνα' },
      { k: 'radius', t: 'range', d: 16, min: 0, max: 30, step: 1, u: 'px', l: 'Στρογγύλεμα γωνιών κάρτας' },
      { k: 'shadow', t: 'select', d: 'soft', o: [['none', 'Καθόλου'], ['soft', 'Ελαφριά'], ['strong', 'Έντονη']], l: 'Σκιά κάρτας' },
      { k: 'border', t: 'bool', d: true, l: 'Περίγραμμα κάρτας' },
      { k: 'gap', t: 'select', d: 'normal', o: [['compact', 'Σφιχτά'], ['normal', 'Κανονικά'], ['airy', 'Αραιά']], l: 'Αποστάσεις' },
      { k: 'hover', t: 'bool', d: true, l: 'Κίνηση όταν περνάει το δάχτυλο/ποντίκι' },
    ]],
    ['Κάτω μέρος', [
      { k: 'show_heritage', t: 'bool', d: true, l: 'Κείμενο «40 χρόνια…»' },
    ]],
  ];

  const PDF = [
    ['Σελίδα', [
      { k: 'paper', t: 'select', d: 'A4', o: [['A4', 'A4'], ['A5', 'A5'], ['Letter', 'Letter']], l: 'Χαρτί' },
      { k: 'orient', t: 'select', d: 'portrait', o: [['portrait', 'Κάθετο'], ['landscape', 'Οριζόντιο']], l: 'Προσανατολισμός' },
      { k: 'margin', t: 'range', d: 12, min: 6, max: 30, step: 1, u: 'mm', l: 'Περιθώρια' },
      { k: 'cols', t: 'select', d: '2', o: [['1', '1 στήλη'], ['2', '2 στήλες'], ['3', '3 στήλες']], l: 'Στήλες' },
      { k: 'col_gap', t: 'range', d: 10, min: 4, max: 20, step: 1, u: 'mm', l: 'Απόσταση στηλών' },
      { k: 'page_numbers', t: 'bool', d: true, l: 'Αριθμός σελίδας' },
      { k: 'page_per_cat', t: 'bool', d: false, l: 'Κάθε κατηγορία σε νέα σελίδα' },
    ]],
    ['Χρώματα', [
      { k: 'p_ink', t: 'color', d: '#19353a', l: 'Χρώμα κειμένου' },
      { k: 'p_title', t: 'color', d: '#103c46', l: 'Χρώμα τίτλων' },
      { k: 'p_accent', t: 'color', d: '#d7ad63', l: 'Χρώμα γραμμών' },
      { k: 'p_price', t: 'color', d: '#19353a', l: 'Χρώμα τιμής' },
    ]],
    ['Γράμματα', [
      { k: 'pf_head', t: 'select', d: 'classic', o: fontOpts, l: 'Γραμματοσειρά τίτλων' },
      { k: 'pf_body', t: 'select', d: 'classic', o: fontOpts, l: 'Γραμματοσειρά κειμένου' },
      { k: 'p_body', t: 'range', d: 10, min: 7, max: 15, step: 0.5, u: 'pt', l: 'Μέγεθος κειμένου' },
      { k: 'p_name', t: 'range', d: 30, min: 18, max: 56, step: 1, u: 'pt', l: 'Μέγεθος ονόματος μαγαζιού' },
      { k: 'p_cat', t: 'range', d: 13, min: 9, max: 24, step: 0.5, u: 'pt', l: 'Μέγεθος τίτλων κατηγοριών' },
    ]],
    ['Επάνω μέρος', [
      { k: 'p_head', t: 'bool', d: true, l: 'Εμφάνιση επάνω μέρους (όνομα)' },
      { k: 'p_eyebrow', t: 'bool', d: true, l: 'Μικρός τίτλος «Ψηφιακό μενού»' },
      { k: 'p_tagline', t: 'bool', d: true, l: 'Υπότιτλος' },
      { k: 'p_address', t: 'bool', d: true, l: 'Διεύθυνση' },
      { k: 'p_allergy', t: 'bool', d: true, l: 'Ειδοποίηση για αλλεργίες (κάτω από την κεφαλίδα)' },
      { k: 'p_align', t: 'select', d: 'center', o: [['center', 'Στο κέντρο'], ['left', 'Αριστερά']], l: 'Στοίχιση' },
    ]],
    ['Πιάτα', [
      { k: 'p_cat_style', t: 'select', d: 'line', o: [['line', 'Με γραμμή'], ['plain', 'Απλός τίτλος'], ['box', 'Με χρωματιστό φόντο']], l: 'Στυλ τίτλου κατηγορίας' },
      { k: 'p_cat_upper', t: 'bool', d: false, l: 'Τίτλοι κατηγοριών με κεφαλαία' },
      { k: 'p_numbers', t: 'bool', d: false, l: 'Αρίθμηση πιάτων' },
      { k: 'p_bilingual', t: 'bool', d: false, l: 'Ελληνικά και αγγλικά μαζί' },
      { k: 'p_desc', t: 'bool', d: true, l: 'Περιγραφές' },
      { k: 'p_allergens', t: 'bool', d: true, l: 'Αλλεργιογόνα' },
      { k: 'p_dots', t: 'bool', d: true, l: 'Τελείες μέχρι την τιμή' },
      { k: 'p_space', t: 'range', d: 2.3, min: 0.5, max: 7, step: 0.1, u: 'mm', l: 'Απόσταση μεταξύ πιάτων' },
      { k: 'p_photos', t: 'bool', d: false, l: 'Φωτογραφίες πιάτων' },
      { k: 'p_photo_mm', t: 'range', d: 22, min: 14, max: 45, step: 1, u: 'mm', l: 'Μέγεθος φωτογραφίας' },
      { k: 'p_photo_shape', t: 'select', d: 'square', o: [['square', 'Τετράγωνο'], ['round', 'Στρογγυλό']], l: 'Σχήμα φωτογραφίας' },
    ]],
    ['Κάτω μέρος', [
      { k: 'p_qr', t: 'bool', d: true, l: 'QR κωδικός' },
      { k: 'p_footer', t: 'bool', d: true, l: 'Κείμενο υποσέλιδου' },
      { k: 'p_heritage', t: 'bool', d: true, l: 'Κείμενο «40 χρόνια…»' },
    ]],
  ];

  const SCHEMA = { web: WEB, pdf: PDF };
  const fields = kind => SCHEMA[kind].flatMap(g => g[1]);
  const defaults = kind => Object.fromEntries(fields(kind).map(f => [f.k, f.d]));

  const HEX = /^#[0-9a-fA-F]{6}$/;
  function coerce(f, v) {
    if (v === undefined || v === null) return f.d;
    if (f.t === 'color') return HEX.test(String(v)) ? String(v).toLowerCase() : f.d;
    if (f.t === 'bool') {
      if (v === true || v === 1 || v === '1' || v === 'true') return true;
      if (v === false || v === 0 || v === '0' || v === 'false') return false;
      return f.d;
    }
    if (f.t === 'range') {
      const n = Number(v);
      if (!Number.isFinite(n)) return f.d;
      const c = Math.min(f.max, Math.max(f.min, n));
      return Number((Math.round((c - f.min) / f.step) * f.step + f.min).toFixed(2));
    }
    return f.o.some(o => o[0] === String(v)) ? String(v) : f.d; // select
  }
  function normalize(kind, obj) {
    obj = obj && typeof obj === 'object' ? obj : {};
    const out = {};
    fields(kind).forEach(f => { out[f.k] = coerce(f, obj[f.k]); });
    return out;
  }
  // Έλεγχος για τον server: όλα τα πεδία που στάλθηκαν πρέπει να υπάρχουν και να έχουν επιτρεπτή τιμή
  function isValid(kind, obj) {
    if (!obj || typeof obj !== 'object') return false;
    const by = Object.fromEntries(fields(kind).map(f => [f.k, f]));
    return Object.keys(obj).every(k => {
      const f = by[k], v = obj[k];
      if (!f) return false;
      if (f.t === 'color') return HEX.test(String(v));
      if (f.t === 'bool') return [true, false, 1, 0, '1', '0', 'true', 'false'].includes(v);
      if (f.t === 'range') return Number.isFinite(Number(v)) && Number(v) >= f.min && Number(v) <= f.max;
      return f.o.some(o => o[0] === String(v));
    });
  }

  // Παλιές ρυθμίσεις (layout_*) → νέο σχήμα, ώστε να μη χαθεί ό,τι είχε ήδη επιλεγεί
  function legacy(kind, s) {
    s = s || {};
    const o = {};
    if (kind === 'web') {
      if (s.layout_style) o.style = s.layout_style;
      if (s.layout_photo) o.photo = s.layout_photo;
      if (s.layout_shape) o.shape = s.layout_shape;
      if (s.layout_columns) o.columns = s.layout_columns;
      if (s.layout_numbers) o.numbers = s.layout_numbers === '1';
      if (s.layout_bilingual) o.bilingual = s.layout_bilingual === '1';
    } else {
      if (s.layout_numbers) o.p_numbers = s.layout_numbers === '1';
      if (s.layout_bilingual) o.p_bilingual = s.layout_bilingual === '1';
    }
    return o;
  }
  // Τελικός σχεδιασμός: αποθηκευμένος JSON (ή παλιές ρυθμίσεις) + προαιρετική προεπισκόπηση
  function resolve(kind, settings, preview) {
    let saved = null;
    try { saved = JSON.parse((settings || {})['design_' + kind] || 'null'); } catch (e) { saved = null; }
    return normalize(kind, preview || saved || legacy(kind, settings));
  }

  // ---------- βοηθητικά χρωμάτων ----------
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const hex = a => '#' + a.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
  const lum = h => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

  // ---------- CSS ψηφιακού μενού ----------
  function webCss(d) {
    d = normalize('web', d);
    const fs = d.fs / 100, ts = d.title_size / 100;
    const H = d.c_header, HT = d.c_header_text;
    const hdBg = `radial-gradient(ellipse at 50% -35%,${mix(H, '#ffffff', 0.28)} 0%,transparent 55%),linear-gradient(135deg,${mix(H, '#000000', 0.3)},${mix(H, '#ffffff', 0.08)} 68%,${mix(H, '#000000', 0.12)})`;
    const pad = { compact: '40px 20px 26px', normal: '54px 20px 42px', tall: '84px 20px 68px' }[d.hd_size];
    const padM = { compact: '46px 16px 20px', normal: '54px 16px 30px', tall: '72px 16px 50px' }[d.hd_size];
    const shadow = { none: 'none', soft: '0 4px 16px #19353a12', strong: '0 10px 30px #19353a33' }[d.shadow];
    const gap = { compact: 9, normal: 14, airy: 22 }[d.gap], dpad = { compact: 11, normal: 15, airy: 20 }[d.gap];
    const catUp = d.cat_upper ? 'text-transform:uppercase;letter-spacing:.04em;' : '';
    let catStyle = '';
    if (d.cat_style === 'plain') catStyle = '.cathead:after{display:none}';
    if (d.cat_style === 'pill') catStyle = '.cathead h2{background:var(--sea);color:#fff;padding:7px 20px;border-radius:99px}.cathead:after{display:none}';
    if (d.cat_style === 'boxed') catStyle = '.cathead{border-left:6px solid var(--gold);padding-left:12px}.cathead:after{display:none}';
    const pillTxt = lum(d.c_title) > 0.6 ? '#19353a' : '#ffffff';
    if (d.cat_style === 'pill') catStyle = catStyle.replace('color:#fff', 'color:' + pillTxt);
    const hide = [];
    if (!d.hd_eyebrow) hide.push('.eyebrow');
    if (!d.hd_tagline) hide.push('header p');
    if (!d.hd_address) hide.push('.ad');
    if (!d.hd_deco) hide.push('header:after');
    if (!d.show_nav) hide.push('nav');
    if (!d.show_search) hide.push('.search');
    if (!d.show_allergy_box) hide.push('.allergy-box');
    if (!d.show_avail) hide.push('.filter-row');
    if (!d.show_desc) hide.push('.desc', '.en-desc');
    if (!d.show_original) hide.push('.orig');
    if (!d.show_allergens) hide.push('.allergens', '.allergen-list', '.allergen-chip');
    if (!d.show_heritage) hide.push('footer .heritage-line');
    const hideCss = hide.length ? hide.join(',') + '{display:none!important}' : '';
    const below = d.price_pos === 'below' ? '.itemtop{flex-direction:column;gap:3px}' : '';
    const px = n => (Math.round(n * 10) / 10) + 'px';
    return `
:root{--ink:${d.c_text};--sea:${d.c_title};--gold:${d.c_accent};--paper:${d.c_bg};--card:${d.c_card};--price:${d.c_price}}
body{background:var(--paper);color:var(--ink);font-family:${FONTS[d.f_body].css};font-size:${px(16 * fs)}}
header{background:${hdBg};color:${HT};border-bottom-color:var(--gold);padding:${pad};text-align:${d.hd_align}}
header p,.ad{color:${HT};opacity:.88}.eyebrow{color:var(--gold)}
header .brand{${d.hd_align === 'left' ? 'margin:0 auto 0 0;max-width:1080px' : ''}}
.lang button{color:${HT}}.lang button.on{background:var(--gold);color:${lum(d.c_accent) > 0.55 ? '#233033' : '#ffffff'}}
h1,.intro h2,.cathead h2,footer .heritage-line{font-family:${FONTS[d.f_head].css}}
h1{font-size:calc(clamp(36px,8vw,60px)*${ts})}
.cathead h2{font-size:${px(d.cat_size)};color:var(--sea);${catUp}}.intro h2{color:var(--sea)}
.name{font-size:${px(16 * fs)}}.desc{font-size:${px(13 * fs)}}.en{font-size:${px(12 * fs)}}.price{font-size:${px(16 * fs)};color:var(--price)}
.item{border-radius:${d.radius}px;box-shadow:${shadow};${d.border ? '' : 'border-color:transparent;'}}
.items{gap:${gap}px}.details{padding:${dpad}px ${dpad + 1}px}
${d.hover ? '' : '.item:hover{transform:none;box-shadow:' + shadow + '}'}
${catStyle}${below}
${hideCss}
@media(max-width:700px){
header{padding:${padM}}
.items{gap:${Math.max(7, gap - 4)}px}.details{padding:${Math.max(10, dpad - 2)}px}
.name{font-size:${px(15 * fs)}}.price{font-size:${px(14 * fs)}}
.cathead h2{font-size:${px(Math.max(16, d.cat_size * 0.89))}}
}`;
  }

  // ---------- CSS PDF ----------
  const PAPER = { A4: [210, 297], A5: [148, 210], Letter: [216, 279] };
  function pdfCss(d) {
    d = normalize('pdf', d);
    let [w, h] = PAPER[d.paper];
    if (d.orient === 'landscape') [w, h] = [h, w];
    const up = d.p_cat_upper ? 'text-transform:uppercase;letter-spacing:.05em;' : '';
    let cat = `.cat h2{border-bottom:1pt solid ${d.p_accent};padding-bottom:1mm}`;
    if (d.p_cat_style === 'plain') cat = '.cat h2{border:0;padding:0}';
    if (d.p_cat_style === 'box') cat = `.cat h2{border:0;background:${mix(d.p_accent, '#ffffff', 0.72)};padding:1.2mm 2.5mm;border-radius:1.5mm;print-color-adjust:exact;-webkit-print-color-adjust:exact}`;
    const dots = d.p_dots ? '' : '.dots{display:none}.row{justify-content:space-between}';
    const photo = `.foodphoto{width:${d.p_photo_mm}mm;height:${d.p_photo_mm}mm;border-radius:${d.p_photo_shape === 'round' ? '50%' : '2mm'}}`;
    return `
@page{size:${d.paper === 'Letter' ? 'letter' : d.paper} ${d.orient};margin:${d.margin}mm ${d.margin}mm ${d.page_numbers ? d.margin + 2 : d.margin}mm;${d.page_numbers ? '@bottom-center{content:counter(page);font:8pt system-ui,sans-serif;color:#777}' : ''}}
:root{--sea:${d.p_title};--gold:${d.p_accent};--ink:${d.p_ink}}
body{color:${d.p_ink};font-family:${FONTS[d.pf_body].css};font-size:${d.p_body}pt}
.sheet{max-width:${w}mm;min-height:${h}mm;padding:${d.margin}mm}
.top{text-align:${d.p_align};border-bottom-color:${d.p_accent}}
.top h1{font-family:${FONTS[d.pf_head].css};font-size:${d.p_name}pt;color:${d.p_title}}
.eyebrow{color:${mix(d.p_accent, '#000000', 0.25)}}
.cols{column-count:${d.cols};column-gap:${d.col_gap}mm}
.cat h2{font-family:${FONTS[d.pf_head].css};font-size:${d.p_cat}pt;color:${d.p_title};${up}}${cat}
.it{margin-bottom:${d.p_space}mm;display:flow-root}.pr{color:${d.p_price}}.ds{font-size:${Math.max(6, d.p_body - 2)}pt}.en{font-size:${Math.max(6, d.p_body - 2)}pt}
${dots}${photo}
${d.p_desc ? '' : '.ds{display:none}'}${d.p_allergens ? '' : '.allergen{display:none}'}
.foot{border-top-color:${mix(d.p_accent, '#999999', 0.5)}}.heritage-line{color:${d.p_title}}
.cols + .cols{break-before:page;margin-top:0}
@media print{.sheet{padding:0;min-height:0;max-width:none}}`;
  }

  return { ALLERGY, FONTS, SCHEMA, fields, defaults, normalize, isValid, resolve, legacy, webCss, pdfCss, PAPER, mix, lum };
});
