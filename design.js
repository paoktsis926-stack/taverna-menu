'use strict';

const DIGITAL_DEFAULT = {
  colors: { primary:'#103c46', accent:'#d7ad63', background:'#f6f4ee', card:'#fffefa', text:'#19353a', muted:'#697a79', border:'#e4e2d8' },
  typography: { headingFont:'Georgia', bodyFont:'system-ui', headingSize:30, bodySize:16, headingWeight:700, bodyWeight:400, textAlign:'left' },
  layout: { frameWidth:1080, columns:2, cardRadius:16, cardPadding:15, cardGap:14, borderWidth:1, cardShadow:'soft' },
  photos: { width:124, height:124, fit:'cover', position:'center', radius:12 },
  branding: { logoUrl:'', backgroundUrl:'', coverUrl:'' },
  devices: {
    mobile:{ columns:1, cardGap:9, cardPadding:12, fontSize:15, photoWidth:96, photoHeight:96 },
    tablet:{ columns:2, cardGap:12, cardPadding:14, fontSize:16, photoWidth:112, photoHeight:112 },
    desktop:{ columns:2, cardGap:14, cardPadding:15, fontSize:16, photoWidth:124, photoHeight:124 }
  }
};
const PDF_DEFAULT = {
  colors: { primary:'#103c46', accent:'#d7ad63', background:'#ffffff', card:'#fffefa', text:'#19353a', muted:'#657371', border:'#dddddd' },
  typography: { headingFont:'Georgia', bodyFont:'system-ui', headingSize:30, bodySize:10, categorySize:13, headingWeight:700, bodyWeight:400, textAlign:'left' },
  layout: { pageSize:'A4', marginTop:12, marginSide:12, marginBottom:14, columns:2, columnGap:10, itemGap:2.3, borderWidth:0 },
  branding: { logoUrl:'', backgroundUrl:'', coverUrl:'' }
};
const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const color = (v, fallback) => /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v) : fallback;
const weight = (v, fallback) => ['400','500','600','700','800'].includes(String(v)) ? Number(v) : fallback;
const font = (v, fallback) => ['Georgia','Arial','system-ui','Verdana','Trebuchet MS','Times New Roman','Palatino Linotype'].includes(v) ? v : fallback;
const image = v => {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(s)) return s;
  try { const u = new URL(s); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
};
function normalizeDesign(type, input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const d = type === 'pdf' ? structuredClone(PDF_DEFAULT) : structuredClone(DIGITAL_DEFAULT);
  for (const k of Object.keys(d.colors)) d.colors[k] = color(src.colors?.[k], d.colors[k]);
  d.typography.headingFont = font(src.typography?.headingFont, d.typography.headingFont);
  d.typography.bodyFont = font(src.typography?.bodyFont, d.typography.bodyFont);
  d.typography.headingSize = clamp(src.typography?.headingSize, 12, 56, d.typography.headingSize);
  d.typography.bodySize = clamp(src.typography?.bodySize, type === 'pdf' ? 6 : 11, 24, d.typography.bodySize);
  d.typography.headingWeight = weight(src.typography?.headingWeight, d.typography.headingWeight);
  d.typography.bodyWeight = weight(src.typography?.bodyWeight, d.typography.bodyWeight);
  d.typography.textAlign = ['left','center','right'].includes(src.typography?.textAlign) ? src.typography.textAlign : d.typography.textAlign;
  if (type === 'pdf') {
    d.typography.categorySize = clamp(src.typography?.categorySize, 8, 28, d.typography.categorySize);
    d.layout.pageSize = 'A4';
    d.layout.marginTop = clamp(src.layout?.marginTop, 4, 25, d.layout.marginTop);
    d.layout.marginSide = clamp(src.layout?.marginSide, 4, 25, d.layout.marginSide);
    d.layout.marginBottom = clamp(src.layout?.marginBottom, 4, 25, d.layout.marginBottom);
    d.layout.columns = clamp(src.layout?.columns, 1, 3, d.layout.columns);
    d.layout.columnGap = clamp(src.layout?.columnGap, 2, 24, d.layout.columnGap);
    d.layout.itemGap = clamp(src.layout?.itemGap, 0.5, 8, d.layout.itemGap);
    d.layout.borderWidth = clamp(src.layout?.borderWidth, 0, 4, d.layout.borderWidth);
  } else {
    d.layout.frameWidth = clamp(src.layout?.frameWidth, 320, 1600, d.layout.frameWidth);
    d.layout.columns = clamp(src.layout?.columns, 1, 3, d.layout.columns);
    d.layout.cardRadius = clamp(src.layout?.cardRadius, 0, 36, d.layout.cardRadius);
    d.layout.cardPadding = clamp(src.layout?.cardPadding, 4, 32, d.layout.cardPadding);
    d.layout.cardGap = clamp(src.layout?.cardGap, 0, 32, d.layout.cardGap);
    d.layout.cardShadow = ['none','soft','strong'].includes(src.layout?.cardShadow) ? src.layout.cardShadow : d.layout.cardShadow;
    d.layout.borderWidth = clamp(src.layout?.borderWidth, 0, 4, d.layout.borderWidth);
    d.photos.width = clamp(src.photos?.width, 48, 320, d.photos.width);
    d.photos.height = clamp(src.photos?.height, 48, 320, d.photos.height);
    d.photos.fit = ['cover','contain','fill'].includes(src.photos?.fit) ? src.photos.fit : d.photos.fit;
    d.photos.position = ['center','top','bottom','left','right'].includes(src.photos?.position) ? src.photos.position : d.photos.position;
    d.photos.radius = clamp(src.photos?.radius, 0, 100, d.photos.radius);
    for (const device of ['mobile','tablet','desktop']) {
      const x = src.devices?.[device] || {};
      d.devices[device] = {
        columns: clamp(x.columns, 1, 3, d.devices[device].columns),
        cardGap: clamp(x.cardGap, 0, 32, d.devices[device].cardGap),
        cardPadding: clamp(x.cardPadding, 4, 32, d.devices[device].cardPadding),
        fontSize: clamp(x.fontSize, 11, 24, d.devices[device].fontSize),
        photoWidth: clamp(x.photoWidth, 48, 320, d.devices[device].photoWidth),
        photoHeight: clamp(x.photoHeight, 48, 320, d.devices[device].photoHeight)
      };
    }
  }
  for (const k of ['logoUrl','backgroundUrl','coverUrl']) d.branding[k] = image(src.branding?.[k]);
  return d;
}
module.exports = { DIGITAL_DEFAULT, PDF_DEFAULT, normalizeDesign };
