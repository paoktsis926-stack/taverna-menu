/* Εγγραφή του service worker και σωστή ενημέρωση εφαρμογής.
   data-update="banner" : εμφανίζει κουμπί «Ενημέρωση» (διαχείριση, για να μη χαθούν μη αποθηκευμένες αλλαγές)
   data-update="safe"   : ενημερώνεται μόνο όταν η σελίδα λέει ότι είναι ασφαλές (window.PWA_CAN_RELOAD) — σερβιτόρος
   data-update="idle"   : ενημερώνεται σε λίγα δευτερόλεπτα (οθόνη κουζίνας) */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  var script = document.currentScript, mode = (script && script.dataset.update) || 'banner';
  var hadController = !!navigator.serviceWorker.controller, reloading = false, bar = null, timer = null;

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!hadController) { hadController = true; return; } // η πρώτη αλλαγή είναι η αρχική εγκατάσταση: χωρίς επανεκκίνηση
    if (reloading) return;
    reloading = true; location.reload();
  });

  function showBar(text, withButton, onClick) {
    if (!bar) {
      bar = document.createElement('div');
      bar.setAttribute('role', 'status');
      bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(' + (mode === 'safe' ? '104px' : '12px') + ' + env(safe-area-inset-bottom,0px));z-index:2147483000;background:#103c46;color:#fff;border-radius:14px;padding:12px 14px;display:flex;gap:12px;align-items:center;font:600 14px system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35)';
      document.body.appendChild(bar);
    }
    bar.innerHTML = '';
    var t = document.createElement('span'); t.style.flex = '1'; t.textContent = text; bar.appendChild(t);
    if (withButton) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Ενημέρωση τώρα';
      b.style.cssText = 'border:0;border-radius:10px;padding:9px 14px;background:#c8962d;color:#fff;font:700 14px system-ui,sans-serif';
      b.onclick = onClick; bar.appendChild(b);
    }
  }

  function apply(worker) { try { worker.postMessage({ type: 'SKIP_WAITING' }); } catch (e) {} }

  function offer(worker) {
    if (timer) return;
    if (mode === 'idle') {
      showBar('Νέα έκδοση — γίνεται ενημέρωση…', false);
      timer = setTimeout(function () { apply(worker); }, 4000);
    } else if (mode === 'safe') {
      var go = function () { return typeof window.PWA_CAN_RELOAD === 'function' ? window.PWA_CAN_RELOAD() : true; };
      showBar('Υπάρχει νέα έκδοση. Θα ενημερωθεί μόλις ολοκληρώσετε την ενέργειά σας.', true, function () { apply(worker); });
      timer = setInterval(function () { if (go()) apply(worker); }, 3000);
    } else {
      showBar('Υπάρχει νέα έκδοση της εφαρμογής.', true, function () { apply(worker); });
      timer = true;
    }
  }

  navigator.serviceWorker.register('/sw.js').then(function (reg) {
    var check = function () { reg.update().catch(function () {}); };
    setInterval(check, 60 * 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
    window.addEventListener('online', check);
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', function () {
      var nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', function () {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(nw);
      });
    });
  }).catch(function () {});

  // κουμπί εγκατάστασης (Chrome/Android)
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); window.PWA_INSTALL = e;
    document.dispatchEvent(new Event('pwa-installable'));
  });
  window.addEventListener('appinstalled', function () { window.PWA_INSTALL = null; document.dispatchEvent(new Event('pwa-installed')); });
})();
