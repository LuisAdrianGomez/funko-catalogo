// Genera, a partir de docs/productos.json (ya sanitizado):
//   docs/p/<slug>.html   una pagina por pieza (para que Google la indexe)
//   docs/sitemap.xml, docs/robots.txt, docs/pieza.css
// Borra y regenera docs/p/ completo en cada corrida: las piezas vendidas desaparecen solas.
// Tambien escribe `slug` en cada producto de productos.json (el catalogo lo usa para enlazar).
//   node sync/paginas.mjs          (se llama solo al final de sync.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const slugify = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
const money = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const jsonLd = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

const WA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

const CSS = `:root{--navy:#0b1f6b;--teal:#0a7ba8;--red:#e11d2e;--yel:#ffd21f;--gold:#e0a040;--bg:#f3f7fa;--txt:#14182b;--mut:#6b7280;--line:#e2e8ee;--ok:#15803d;--pre:#6d28d9}
*{box-sizing:border-box}body{margin:0;font-family:"DM Sans",system-ui,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--txt)}
.display{font-family:Impact,"Arial Narrow Bold","Bebas Neue",sans-serif;letter-spacing:.03em;text-transform:uppercase}
.hero{background:var(--navy);color:#fff;border-bottom:5px solid var(--yel)}
.top{max-width:1100px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:14px}
.top a{color:#fff;text-decoration:none;display:flex;align-items:center;gap:14px}
.logo{width:52px;height:52px;border-radius:50%;border:3px solid var(--yel);object-fit:cover;background:#fff}
.top b{font-size:1.5rem}.top b span{color:var(--yel)}
.top .back{margin-left:auto;font-size:.85rem;opacity:.9}
main{max-width:1100px;margin:24px auto 60px;padding:0 20px}
.crumb{font-size:.82rem;color:var(--mut);margin-bottom:14px}.crumb a{color:var(--teal)}
.dlg{background:#fff;border-radius:24px;display:grid;grid-template-columns:1.15fr 1fr;overflow:hidden;border:1px solid var(--line)}
.gal{background:radial-gradient(circle at 50% 40%,#fff 0 40%,#dcebf3 100%);position:relative;display:flex;flex-direction:column}
.main{position:relative;aspect-ratio:1}
.main img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;padding:34px;opacity:0;transition:opacity .3s}
.main img.on{opacity:1}
.nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:0;background:#fff;box-shadow:0 3px 10px rgba(0,0,0,.28);font-size:24px;line-height:1;cursor:pointer;z-index:3}
.nav:hover{background:var(--yel)}.nav.l{left:14px}.nav.r{right:14px}
.thumbs{display:flex;gap:8px;justify-content:center;padding:0 14px 16px;flex-wrap:wrap}
.thumbs button{width:58px;height:58px;border-radius:12px;border:2px solid transparent;background:#fff;padding:3px;cursor:pointer;opacity:.65}
.thumbs button.on{border-color:var(--teal);opacity:1}.thumbs img{width:100%;height:100%;object-fit:contain;display:block}
.det{padding:40px 34px 32px;display:flex;flex-direction:column;gap:12px}
.sub{color:var(--teal);font-size:.78rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
h1{margin:0;font-size:1.5rem;line-height:1.2}
.pr{font-size:2.3rem;color:var(--red);margin-top:4px}
.badge{align-self:flex-start;font-size:.72rem;font-weight:700;letter-spacing:.06em;padding:5px 13px;border-radius:999px;color:#fff}
.badge.stock{background:var(--ok)}.badge.preventa{background:var(--pre)}
.nota{color:var(--mut);font-size:.88rem;line-height:1.55;margin:0}
.wabtn{margin-top:auto;display:flex;align-items:center;justify-content:center;gap:10px;background:#25d366;color:#fff;text-decoration:none;font-weight:700;padding:15px 20px;border-radius:999px}
.wabtn:hover{background:#1ebe5a}.wabtn svg{width:22px;height:22px;fill:#fff}
.mas{display:inline-block;margin-top:22px;color:var(--teal);font-weight:600}
@media(max-width:800px){.dlg{grid-template-columns:1fr}.det{padding:24px 22px 26px}.pr{font-size:1.9rem}h1{font-size:1.25rem}.top .back{display:none}.top{padding:10px 14px}.top b{font-size:1.25rem}.wabtn{position:sticky;bottom:14px;box-shadow:0 6px 18px rgba(0,0,0,.3)}main{padding:0 12px;margin-top:14px}}
`;

function titulo(p) {
  const n = p.nombre.replace(/^[¡!]+/, '').replace(/\s+/g, ' ').trim();
  return /funko/i.test(n) ? n : `Funko Pop ${n}`;
}

export function generar() {
  const cfg = JSON.parse(fs.readFileSync(path.join(DOCS, 'config.json'), 'utf8'));
  const base = (cfg.url || '').replace(/\/?$/, '/');
  if (!cfg.url) throw new Error('Falta "url" en docs/config.json (ej. https://usuario.github.io/funko-catalogo/)');
  const marca = (cfg.titulo || 'Wuishop · Funko Pop').split('·')[0].trim() || 'Wuishop';
  const file = path.join(DOCS, 'productos.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const fecha = (data.actualizado || new Date().toISOString()).slice(0, 10);

  // slug estable: nombre + fecha de creacion de la publicacion (base 36). No lleva IDs de ML.
  const usados = new Set();
  for (const p of data.productos) {
    let s = `${slugify(titulo(p))}-${(p.creado || 0).toString(36)}`;
    while (usados.has(s)) s += 'x';
    usados.add(s); p.slug = s;
  }
  fs.writeFileSync(file, JSON.stringify(data));

  const dir = path.join(DOCS, 'p');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(DOCS, 'pieza.css'), CSS);

  for (const p of data.productos) {
    const t = titulo(p);
    const url = `${base}p/${p.slug}.html`;
    const imgs = p.imgs || [];
    const preventa = p.estado === 'preventa';
    const sub = [p.coleccion, p.caja ? `#${p.caja}` : ''].filter(Boolean).join(' · ');
    const desc = `${t}${p.coleccion ? ` de la colección ${p.coleccion}` : ''}, ${preventa ? 'en preventa' : 'disponible en stock'} en ${marca}, Monterrey. Precio ${money(p.precio)}. Pregunta por WhatsApp.`;
    const msg = (cfg.mensaje || '{nombre}').replace('{nombre}', p.nombre).replace(' #{caja}', p.caja ? ' #' + p.caja : '').replace('{caja}', p.caja)
      .replace('{precio}', money(p.precio)).replace('{tipo}', preventa ? '(preventa)' : '').replace(/\s+([.,?])/g, '$1').replace(/\s{2,}/g, ' ');
    const wa = cfg.whatsapp ? `https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent(msg)}` : '';
    const ld = {
      '@context': 'https://schema.org', '@type': 'Product', name: t, description: desc,
      image: imgs, brand: { '@type': 'Brand', name: 'Funko' }, ...(p.coleccion ? { category: p.coleccion } : {}),
      offers: { '@type': 'Offer', url, priceCurrency: 'MXN', price: p.precio,
        availability: preventa ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock',
        seller: { '@type': 'Organization', name: marca } },
    };
    const multi = imgs.length > 1;
    const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t)} | ${esc(marca)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/png" href="../favicon.png">
<meta property="og:type" content="product"><meta property="og:site_name" content="${esc(marca)}">
<meta property="og:title" content="${esc(t)} | ${esc(money(p.precio))}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">${imgs[0] ? `<meta property="og:image" content="${esc(imgs[0])}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="../pieza.css">
<script type="application/ld+json">${jsonLd(ld)}</script>
</head><body>
<header class="hero"><div class="top"><a href="../"><img class="logo" src="../logo.jpg" alt="Logo ${esc(marca)}" width="52" height="52"><b class="display">${esc(marca)} <span>Funko Pop</span></b></a><a class="back" href="../">← Ver todo el catálogo</a></div></header>
<main>
<div class="crumb"><a href="../">Catálogo</a>${p.coleccion ? ` › ${esc(p.coleccion)}` : ''} › ${esc(t)}</div>
<article class="dlg">
<div class="gal"><div class="main">${imgs.map((s, i) => `<img src="${esc(s)}" alt="${esc(t)}${i ? ` - foto ${i + 1}` : ''}"${i ? ' loading="lazy"' : ' class="on"'}>`).join('')}${multi ? '<button class="nav l" aria-label="Foto anterior">‹</button><button class="nav r" aria-label="Foto siguiente">›</button>' : ''}</div>
${multi ? `<div class="thumbs">${imgs.map((s, i) => `<button${i ? '' : ' class="on"'} aria-label="Foto ${i + 1}"><img src="${esc(s)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}</div>
<div class="det"><div class="sub">${esc(sub)}</div><h1>${esc(t)}</h1><div class="pr display">${esc(money(p.precio))}</div>
<span class="badge ${p.estado}">${preventa ? 'PREVENTA' : 'EN STOCK'}</span>
<p class="nota">${preventa ? 'Pieza en preventa: apártala por WhatsApp y te avisamos cuando llegue.' : 'Pieza disponible. Escríbenos por WhatsApp para apartarla o coordinar la entrega.'} Atendemos en Monterrey, Nuevo León.</p>
${wa ? `<a class="wabtn" href="${esc(wa)}" rel="noopener">${WA_SVG}<span>Preguntar por WhatsApp</span></a>` : ''}</div>
</article>
<a class="mas" href="../">← Ver más Funko Pop en ${esc(marca)}</a>
</main>
${multi ? `<script>(()=>{const im=[...document.querySelectorAll('.main img')],th=[...document.querySelectorAll('.thumbs button')];let i=0;const go=n=>{i=(n+im.length)%im.length;im.forEach((e,k)=>e.classList.toggle('on',k===i));th.forEach((e,k)=>e.classList.toggle('on',k===i))};document.querySelector('.nav.l').onclick=()=>go(i-1);document.querySelector('.nav.r').onclick=()=>go(i+1);th.forEach((b,k)=>b.onclick=()=>go(k));document.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')go(i-1);if(e.key==='ArrowRight')go(i+1)})})()</script>` : ''}
</body></html>
`;
    fs.writeFileSync(path.join(dir, `${p.slug}.html`), html);
  }

  const urls = [base, ...data.productos.map((p) => `${base}p/${p.slug}.html`)];
  fs.writeFileSync(path.join(DOCS, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u)}</loc><lastmod>${fecha}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  fs.writeFileSync(path.join(DOCS, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${base}sitemap.xml\n`);
  console.log(`docs/p/: ${data.productos.length} páginas + sitemap.xml + robots.txt`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) generar();
