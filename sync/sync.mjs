// Sincroniza tus publicaciones activas de ML -> docs/productos.json (SANITIZADO).
//   node sync/sync.mjs          incremental: solo consulta detalle de IDs nuevos; quita las que ya no estan activas
//   node sync/sync.mjs --full   refresca el detalle de TODAS (usalo para actualizar precios)
// Estado privado (NO se publica): state.json, con los IDs MLM de cada pieza.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnv, getAccessToken, api } from './ml.mjs';


// --- Normalizacion de colecciones (ML trae variantes: "Pop! Star Wars", "Star Wars", "Pokémon / Games"...) ---
const fold = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const aliasFile = path.join(ROOT, 'sync', 'colecciones.json');
const aliases = fs.existsSync(aliasFile) ? JSON.parse(fs.readFileSync(aliasFile, 'utf8')) : {};
function limpiarCol(raw) {
  if (!raw) return '';
  return raw.split(' / ')[0].replace(/^pop!?\s+/i, '').replace(/\s+/g, ' ').trim();
}
function construirNormalizador(rawCols) {
  // forma canonica = la variante mas usada de cada grupo (sin importar mayusculas/acentos/signos)
  const grupos = {};
  for (const r of rawCols) { const l = limpiarCol(r); if (l) { const k = fold(l); (grupos[k] ||= {})[l] = (grupos[k][l] || 0) + 1; } }
  const canon = {};
  for (const [k, v] of Object.entries(grupos)) canon[k] = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
  return (raw) => { const l = limpiarCol(raw); if (!l) return ''; const k = fold(l); return aliases[k] || canon[k] || l; };
}

// --- Numero de caja: el atributo ACTION_FIGURE_NUMBER de ML a veces trae basura (plantilla "1407", UPC...) ---
function candidatosTitulo(t) {
  const out = [];
  const re = /#?\s*(\d+)(\+|\s*ml\b|\s*cm\b|\s*a[nñ]os\b|\s*pack\b)?/gi;
  let m;
  while ((m = re.exec(t))) { if (m[2] || m[1].length > 4) continue; out.push({ n: String(+m[1]), hash: m[0].trim().startsWith('#') }); }
  return out;
}
const esAnio = (n) => n.length === 4 && +n >= 2000 && +n <= 2026;
function construirResolverCaja(items) {
  // valores del atributo que se repiten sin aparecer en el titulo = basura de plantilla
  const sospechosos = {};
  for (const p of items) if (p.caja && !candidatosTitulo(p.nombre).some((c) => c.n === String(+p.caja))) sospechosos[p.caja] = (sospechosos[p.caja] || 0) + 1;
  return (nombre, attr) => {
    const c = candidatosTitulo(nombre);
    const hash = c.find((x) => x.hash);
    if (hash) return hash.n;
    if (attr && c.some((x) => x.n === String(+attr))) return String(+attr);
    const sinAnio = c.filter((x) => !esAnio(x.n));
    const pool = sinAnio.length ? sinAnio : c;
    if (pool.length) return pool[0].n;
    if (attr && /^\d{1,4}$/.test(attr) && +attr > 0 && (sospechosos[attr] || 0) < 3) return String(+attr);
    return '';
  };
}

// --- Fotos del catalogo: sin protector; fotos de muestra + 1 foto real (la tuya) si esta subida ---
const fotosCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'sync', 'fotos.json'), 'utf8'));
function elegirFotos(fotos) {
  const vistas = new Set();
  const muestra = [], reales = [];
  for (const [url, size, max] of fotos || []) {
    const firma = `${size}|${max}`;
    if (fotosCfg.protector.includes(firma) || vistas.has(firma)) continue; // protector o repetida
    vistas.add(firma);
    (fotosCfg.real.includes(max) ? reales : muestra).push(url);
  }
  const out = [...muestra.slice(0, fotosCfg.maxMuestra), ...reales.slice(0, fotosCfg.maxReales)];
  return out.length ? out : (fotos || []).slice(0, 1).map((f) => f[0]);
}

const FULL = process.argv.includes('--full');
const env = loadEnv();
const token = await getAccessToken(env);
const me = await api(token, '/users/me');

const STATE = path.join(ROOT, 'state.json');
const known = !FULL && fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')).items : {};

// 1) IDs activos (scan: sin el tope de 1000 de la busqueda normal)
const ids = [];
let scroll = '';
for (;;) {
  const q = `status=active&search_type=scan&limit=100${scroll ? `&scroll_id=${encodeURIComponent(scroll)}` : ''}`;
  const r = await api(token, `/users/${me.id}/items/search?${q}`);
  if (!r.results.length) break;
  ids.push(...r.results);
  scroll = r.scroll_id;
  if (ids.length >= r.paging.total) break;
}
const activos = new Set(ids);
const nuevos = ids.filter((id) => !known[id]);
const quitados = Object.keys(known).filter((id) => !activos.has(id));
console.log(`Activas: ${ids.length} | nuevas a consultar: ${nuevos.length} | quitadas: ${quitados.length}${FULL ? ' (modo --full)' : ''}`);

// 2) Detalle pieza por pieza (el multiget /items?ids= no esta permitido para esta app)
const thumb = (u) => u.replace(/-[A-Z]\.(jpg|webp)$/, '-V.$1'); // ~36 KB en vez de ~70 KB
function sanitize(it) {
  if (it.status !== 'active' || it.available_quantity < 1) return null;
  if ((it.channels || []).includes('mp-link')) return null; // links de pago de Mercado Pago: no son piezas
  const attr = (id) => (it.attributes || []).find((a) => a.id === id)?.value_name || '';
  const caja = attr('ACTION_FIGURE_NUMBER').replace(/\D/g, '') || (it.title.match(/#\s*(\d{1,4})/) || [])[1] || '';
  const p = {
    nombre: it.title.replace(/\s+/g, ' ').trim(),
    caja,
    coleccion: attr('COLLECTION'),
    precio: it.price,
    creado: Math.floor(Date.parse(it.date_created) / 1000) || 0,
    estado: it.condition === 'new' ? 'preventa' : 'stock', // Nuevo = preventa, Usado = stock
    fotos: (it.pictures || []).slice(0, 14).map((x) => [thumb(x.secure_url), x.size, x.max_size]),
  };
  if (env.INCLUDE_PERMALINK === 'true') p.url = it.permalink;
  return p;
}

const items = {};
for (const id of ids) if (known[id]) items[id] = known[id];
let cursor = 0;
async function worker() {
  while (cursor < nuevos.length) {
    const id = nuevos[cursor++];
    try {
      const it = await api(token, `/items/${id}?attributes=id,title,price,condition,available_quantity,status,pictures,permalink,attributes,date_created,channels`);
      const p = sanitize(it);
      if (p) items[id] = p;
    } catch (e) { console.warn(`  omitida ${id}: ${e.message.slice(0, 80)}`); }
    if (cursor % 100 === 0) console.log(`  detalle ${cursor}/${nuevos.length}`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

// 3) Guardar estado privado y JSON publico
fs.writeFileSync(STATE, JSON.stringify({ items }, null, 2));
const resolverCaja = construirResolverCaja(Object.values(items));
const normCol = construirNormalizador(Object.values(items).map((p) => p.coleccion));
const excFile = path.join(ROOT, 'sync', 'excluir.json');
const excluir = (fs.existsSync(excFile) ? JSON.parse(fs.readFileSync(excFile, 'utf8')).patrones : []).map((x) => new RegExp(x, 'i'));
// --- Precio mostrado = lo que TE QUEDA (columna "Recibes" de ML), redondeado a multiplo de $5. El precio real de ML no se publica. ---
// Por defecto Recibes = 85% (comision 15%); recibes.json trae el monto exacto de las piezas con otra comision o envio gratis.
const recFile = path.join(ROOT, 'recibes.json');
const recibes = fs.existsSync(recFile) ? JSON.parse(fs.readFileSync(recFile, 'utf8')).valores : {};
const redondea5 = (n) => Math.round(n / 5) * 5;
let exactos = 0, aprox = 0;
function precioNeto(id, precio) {
  const r = recibes[id];
  if (r && r < precio && r > precio * 0.5) { exactos++; return redondea5(r); }
  aprox++; return redondea5(precio * 0.85);
}
const productos = Object.entries(items)
  .filter(([, p]) => !excluir.some((re) => re.test(p.nombre)))
  .map(([id, { fotos, ...p }]) => ({ ...p, imgs: elegirFotos(fotos), precio: precioNeto(id, p.precio), caja: resolverCaja(p.nombre, p.caja), coleccion: normCol(p.coleccion) }))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
console.log(`Precio neto: ${exactos} exactos (recibes.json) + ${aprox} calculados al 85%`);
fs.writeFileSync(path.join(ROOT, 'docs', 'productos.json'), JSON.stringify({ actualizado: new Date().toISOString(), productos }));

const c = (k) => productos.filter((p) => p.estado === k).length;
console.log(`docs/productos.json: ${productos.length} piezas (${c('stock')} stock, ${c('preventa')} preventa)`);
const sinCaja = productos.filter((p) => !p.caja);
if (sinCaja.length) console.log(`Sin # de caja: ${sinCaja.length}`);

// 4) Una pagina por pieza + sitemap (para Google). Borra las de piezas vendidas.
const { generar } = await import('./paginas.mjs');
generar();
