// ============================================================================
// IMPORTADOR DE LA CARTERA PÚBLICA DE PDC PROPIEDADES — del sitio (Mapaprop) al módulo inmobiliaria.
// ============================================================================
//
// Recorre www.pdcpropiedades.com.ar (sitio público, armado sobre Mapaprop) y trae las fichas
// publicadas con sus fotos al negocio `pdcinmobiliaria`. La autorización del cliente para usar
// su marca y su material está registrada en docs/tenants/inmobiliaria/README.md ("Marca").
//
// Dos pasos, a propósito separados:
//
//   npx tsx scripts/inmobiliaria/importar-pdc.ts --slug pdcinmobiliaria --solo-mirar [--salida foto.json]
//       → recorre el sitio, guarda una "foto" (JSON) de toda la cartera y muestra un resumen.
//         No abre ninguna base.
//
//   DATABASE_URL=<base> npx tsx scripts/inmobiliaria/importar-pdc.ts --slug pdcinmobiliaria --cargar \
//         [--salida foto.json] [--confirmar]
//       → lee esa foto (si no existe, vuelve a recorrer el sitio) y la carga en el negocio.
//         Clave de alta/actualización: (negocio, código del sitio, ej. "2716-358"). Si la ficha ya
//         estaba, actualiza sus datos y REEMPLAZA sus fotos; no borra nada más del negocio.
//         Contra una base que no es de esta máquina exige --confirmar. La cadena de conexión va
//         sólo por la variable de entorno, nunca por argv.
//
// Otros: --limite N (recorre sólo N fichas, para probar) · INMO_IMPORT_DB_MAX (conexiones, default 2).
//
// Cómo está armado el sitio hoy (visto el 13/10/2026):
//   · /buscar/?view=cards-filters&page=N  pagina de a 10, N arranca en 0; las tarjetas reales viven
//     en #propertiesGrid (después hay 21 destacadas de relleno, que se ignoran).
//   · /destacados/  lista las destacadas (las mismas de la portada).
//   · /propiedad/<slug>-2716-<idMapaprop>  tiene título, descripción, "Detalles de la propiedad"
//     (Dirección, Barrio, Total construido, Superficie total, Baños, Dormitorios, Ambientes,
//     Cocheras, Antigüedad, Estado, Precio…), la galería como JSON (`var mpGalFotos = [...]`,
//     fotos a tamaño completo en images.mapaprop.app), el video de YouTube y el mapa de Google
//     (un iframe con `q=lat,lng`: de ahí salen las coordenadas).
//   · El código de la casa ("Cód. 2716-358") sale en la tarjeta del listado, no en la ficha.
//
// Qué NO hace: no descarga las fotos. Quedan enlazadas a images.mapaprop.app; si el cliente deja
// Mapaprop, esos links mueren (ver README-importar.md).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ORIGEN = "https://www.pdcpropiedades.com.ar";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const PAUSA_MS = 300;
const SALIDA_DEFAULT = "C:\\Users\\mlloveras2\\AppData\\Local\\Temp\\claude\\C--gsg-rendi\\a8b1b386-7641-446c-99d6-a57c78ec112b\\scratchpad\\pdc-cartera.json";
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const log = (m: string) => process.stdout.write(`[importar-pdc] ${m}\n`);
// Declarada como function (no arrow) para que TypeScript entienda que después de fatal() no se sigue.
function fatal(m: string): never {
  console.error(`\n✖ FRENADO: ${m}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------

const args: Record<string, string | true> = {};
for (let i = 2; i < process.argv.length; i++) {
  const t = process.argv[i];
  if (!t.startsWith("--")) continue;
  const k = t.slice(2);
  const v = process.argv[i + 1];
  if (v && !v.startsWith("--")) {
    args[k] = v;
    i++;
  } else args[k] = true;
}
const SLUG = String(args.slug ?? "").trim();
const SALIDA = typeof args.salida === "string" ? path.resolve(args.salida) : SALIDA_DEFAULT;
const LIMITE = typeof args.limite === "string" ? Number(args.limite) : Infinity;
const SOLO_MIRAR = args["solo-mirar"] === true;
const CARGAR = args.cargar === true;

// ---------------------------------------------------------------------------
// Tipos de la foto (lo que se guarda en el JSON y después va a la base)
// ---------------------------------------------------------------------------

interface Tarjeta {
  href: string;
  op: string;
  tipo: string;
  precio: string;
  titulo: string;
  dir: string;
  codigo: string;
  miniatura: string;
}

interface FotoFicha {
  url: string;
  alt: string;
  posicion: number;
}

interface Ficha {
  codigo: string;
  mapapropId: string;
  url: string;
  slug: string;
  titulo: string;
  descripcion: string;
  tipo: string;
  estado: "PUBLICADA";
  destacada: boolean;
  enVenta: boolean;
  precioVenta: number | null;
  monedaVenta: "ARS" | "USD";
  enAlquiler: boolean;
  precioAlquiler: number | null;
  monedaAlquiler: "ARS" | "USD";
  expensas: number | null;
  aptoCredito: boolean;
  aptoMascotas: boolean;
  direccion: string;
  barrio: string;
  localidad: string;
  partido: string;
  provincia: string;
  lat: number | null;
  lng: number | null;
  ambientes: number | null;
  dormitorios: number | null;
  banos: number | null;
  cocheras: number | null;
  supCubierta: number | null;
  supTotal: number | null;
  antiguedad: number | null;
  comodidades: string[];
  videoUrl: string | null;
  notasInternas: string;
  fotos: FotoFicha[];
  // Tal cual lo muestra el sitio, por si mañana hace falta otro campo.
  detalles: Record<string, string>;
  etiquetas: { operacion: string; tipo: string };
}

interface Snapshot {
  origen: string;
  generadoEl: string;
  totalAnunciado: number | null;
  propiedades: Ficha[];
  fallos: { url: string; motivo: string }[];
}

// ---------------------------------------------------------------------------
// Texto: entidades, limpieza, slug (misma regla que src/lib/inmobiliaria/core.ts)
// ---------------------------------------------------------------------------

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ordm: "º", ordf: "ª", deg: "°", sup2: "²",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", Uuml: "Ü", iquest: "¿", iexcl: "¡",
};

function decodificar(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e] ?? m;
  });
}

/** HTML → texto con saltos de línea (los <br> y los </p> cuentan como salto). */
const texto = (html: string): string =>
  decodificar(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(/\r/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** HTML → una sola línea. */
const linea = (html: string): string => texto(html).replace(/\s+/g, " ").trim();

const sinAcentos = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function aSlug(t: string, max = 70): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}
const slugDePropiedad = (titulo: string, codigo: string): string => [aSlug(titulo), aSlug(codigo, 20)].filter(Boolean).join("-");

// ---------------------------------------------------------------------------
// Red: una pedida por vez, 300 ms entre pedidas, un reintento
// ---------------------------------------------------------------------------

let ultimaBajada = 0;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bajar(url: string): Promise<string> {
  let ultimoError: unknown = null;
  for (let intento = 1; intento <= 2; intento++) {
    const espera = ultimaBajada + PAUSA_MS - Date.now();
    if (espera > 0) await dormir(espera);
    ultimaBajada = Date.now();
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.8", "Accept-Language": "es-AR,es;q=0.9" },
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      ultimoError = e;
      if (intento === 1) await dormir(1500);
    }
  }
  throw new Error(`no se pudo bajar ${url}: ${ultimoError instanceof Error ? ultimoError.message : String(ultimoError)}`);
}

// ---------------------------------------------------------------------------
// Parseo del sitio
// ---------------------------------------------------------------------------

/** Las tarjetas <a class="card"> de un fragmento de HTML (listado, destacados o relleno). */
function tarjetas(html: string): Tarjeta[] {
  const out: Tarjeta[] = [];
  const re = /<a class="card" href="([^"]+)">([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const b = m[2];
    out.push({
      href: m[1],
      op: linea(b.match(/<span class="tag tag-op">([^<]*)</)?.[1] ?? ""),
      tipo: linea(b.match(/<span class="tag">([^<]*)</)?.[1] ?? ""),
      precio: linea(b.match(/<div class="card-precio">([^<]*)</)?.[1] ?? ""),
      titulo: linea(b.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? ""),
      dir: linea(b.match(/<div class="card-dir">\s*<span>([\s\S]*?)<\/span>/)?.[1] ?? ""),
      codigo: linea(b.match(/class="card-cod"[^>]*>([^<]*)</)?.[1] ?? "").replace(/^c[óo]d(?:igo)?\.?\s*/i, "").trim(),
      miniatura: b.match(/<img[^>]*src="([^"]+)"/)?.[1] ?? "",
    });
  }
  return out;
}

/** Sólo las tarjetas del resultado de la búsqueda (#propertiesGrid), sin las destacadas de relleno. */
function tarjetasDeGrilla(html: string): Tarjeta[] {
  const ini = html.indexOf('id="propertiesGrid"');
  if (ini < 0) return [];
  let fin = html.indexOf('id="infiniteScrollSentinel"', ini);
  if (fin < 0) fin = html.indexOf("pagination-container", ini);
  if (fin < 0) fin = html.length;
  return tarjetas(html.slice(ini, fin));
}

const entero = (s: string | undefined): number | null => {
  const m = s?.match(/\d+/);
  return m ? Number(m[0]) : null;
};

/** "50 m²" → 50 · "1.200 m²" → 1200 · "65,5 m²" → 65.5 */
const metros = (s: string | undefined): number | null => {
  const m = s?.replace(/\./g, "").match(/\d+(?:,\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** "ARS 480.000" · "USD 79.900" · "USD 1.250.000" */
function parsearPrecio(s: string | undefined): { moneda: "ARS" | "USD"; monto: number } | null {
  const m = s?.match(/(USD|U\$S|ARS|\$)\s*([\d.]+(?:,\d+)?)/i);
  if (!m) return null;
  const moneda: "ARS" | "USD" = /usd|u\$s/i.test(m[1]) ? "USD" : "ARS";
  const monto = Number(m[2].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(monto) && monto > 0 ? { moneda, monto } : null;
}

const TIPO_POR_ETIQUETA: Record<string, string> = {
  departamento: "DEPARTAMENTO",
  casa: "CASA",
  terreno: "TERRENO",
  lote: "TERRENO",
  galpon: "GALPON",
  "local comercial": "LOCAL",
  local: "LOCAL",
  ph: "PH",
  duplex: "DUPLEX",
  triplex: "DUPLEX",
  edificio: "EDIFICIO",
  "complejo turistico": "QUINTA",
  quinta: "QUINTA",
  oficina: "OFICINA",
  cochera: "COCHERA",
};
const tipoDe = (etiqueta: string): string => TIPO_POR_ETIQUETA[sinAcentos(etiqueta)] ?? "DEPARTAMENTO";

/**
 * Dirección y zona. La ficha trae "Dirección" y "Barrio" (que en Mapaprop es la zona:
 * "Monte Grande, Esteban Echeverría, Buenos Aires"); la tarjeta trae
 * "CALLE 123 · Monte Grande, Esteban Echeverría, Buenos Aires, Argentina".
 */
function parsearUbicacion(dirFicha: string, zonaFicha: string, dirTarjeta: string) {
  let direccion = dirFicha;
  let zona = zonaFicha;
  if (!direccion || !zona) {
    const [d = "", z = ""] = dirTarjeta.split("·").map((s) => s.trim());
    direccion ||= d;
    zona ||= z;
  }
  const partes = zona
    .split(",")
    .map((s) => s.trim())
    .filter((p) => p && !/^argentina$/i.test(p));
  let barrio = "";
  let localidad = "";
  let partido = "";
  let provincia = "Buenos Aires";
  if (partes.length >= 4) [barrio, localidad, partido, provincia] = partes.slice(-4) as [string, string, string, string];
  else if (partes.length === 3) [localidad, partido, provincia] = partes as [string, string, string];
  else if (partes.length === 2) [localidad, partido] = partes as [string, string];
  else if (partes.length === 1) localidad = partes[0];
  return { direccion, barrio, localidad, partido, provincia };
}

/** El bloque "Detalles de la propiedad": etiqueta → valor, tal cual. */
function parsearDetalles(html: string): Record<string, string> {
  const ini = html.indexOf("<!-- caracteristicas -->");
  const fin = ini >= 0 ? html.indexOf("<!-- fin caracteristicas -->", ini) : -1;
  const bloque = ini >= 0 && fin > ini ? html.slice(ini, fin) : "";
  const out: Record<string, string> = {};
  // Etiqueta (p gris) … ícono … valor (p normal). Entre medio no puede aparecer otra etiqueta.
  const re = /md:text-lg">([^<]*)<\/p>(?:(?!md:text-lg")[\s\S])*?<p class="text-lg md:text-sm[^"]*">([^<]*)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bloque))) {
    const k = linea(m[1]);
    const v = linea(m[2]);
    if (k && v && !(k in out)) out[k] = v;
  }
  return out;
}

function parsearFotos(html: string, alt: string): FotoFicha[] {
  const urls: string[] = [];
  const gal = html.match(/var mpGalFotos\s*=\s*(\[[\s\S]*?\]);/);
  if (gal) {
    try {
      for (const f of JSON.parse(gal[1]) as { src?: string }[]) if (f?.src) urls.push(f.src);
    } catch {
      /* se cae al plan B */
    }
  }
  if (urls.length === 0) {
    // Plan B: todas las fotos de la ficha a tamaño completo (las miniaturas terminan en "t.jpg").
    const re = /https:\/\/images\.mapaprop\.app\/photos\/\d+\/\d+\/\d+\.(?:jpe?g|png|webp)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) urls.push(m[0]);
  }
  const vistas = new Set<string>();
  const fotos: FotoFicha[] = [];
  for (const u of urls) {
    if (vistas.has(u)) continue;
    vistas.add(u);
    fotos.push({ url: u, alt, posicion: fotos.length });
  }
  return fotos;
}

function parsearFicha(html: string, t: Tarjeta, destacada: boolean): Ficha {
  const url = t.href.startsWith("http") ? t.href : `${ORIGEN}${t.href}`;
  const mapapropId = t.href.match(/-(\d+)\/?$/)?.[1] ?? "";
  const codigo = t.codigo || (mapapropId ? `2716-${mapapropId}` : "");
  if (!codigo) throw new Error("sin código");

  const titulo = linea(html.match(/<h1 class="text-xl">([\s\S]*?)<\/h1>/)?.[1] ?? "") || t.titulo;
  if (!titulo) throw new Error("sin título");

  const descHtml = html.match(/id="mpDesc1"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "";
  const descripcion = texto(descHtml);

  const detalles = parsearDetalles(html);
  const etiquetaOp = html.match(/mp-on-scrim\)\] p-5 text-center ">\s*([^<]+?)\s*<\/p>/)?.[1] ?? "";
  const [tipoEtiqueta = "", opEtiqueta = ""] = linea(etiquetaOp).split(/\s+en\s+/i);
  const operacion = t.op || opEtiqueta;
  const tipoTexto = t.tipo || tipoEtiqueta;

  const precio = parsearPrecio(detalles.Precio) ?? parsearPrecio(t.precio);
  const esVenta = /venta/i.test(operacion);
  const esAlquiler = /alquiler/i.test(operacion);

  const ubic = parsearUbicacion(detalles["Dirección"] ?? "", detalles.Barrio ?? "", t.dir);

  const coords = html.match(/maps\/embed\/v1\/place\?[^"]*?[&?]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const lat = coords ? Number(coords[1]) : null;
  const lng = coords ? Number(coords[2]) : null;

  const video = html.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/)?.[1];

  const comodidades: string[] = [];
  const cocherasTexto = detalles.Cocheras ?? "";
  const cocheraDesc = cocherasTexto.split("·")[1]?.trim();
  if (cocheraDesc) comodidades.push(cocheraDesc);
  const plantas = entero(detalles["Plantas/pisos"]);
  if (plantas && plantas > 1) comodidades.push(`${plantas} plantas`);
  const toilettes = entero(detalles.Toilettes);
  if (toilettes) comodidades.push(toilettes === 1 ? "Toilette" : `${toilettes} toilettes`);

  const todoElTexto = sinAcentos(`${titulo}\n${descripcion}`);
  const aptoCredito = /apto (?:a )?credito/.test(todoElTexto) || /^s[ií]$/i.test(detalles["Apto Crédito"] ?? "");
  const aptoMascotas = /(?<!no )(?:apto|acepta|se aceptan|admite) mascotas/.test(todoElTexto);

  const notas = [
    `Importada de ${ORIGEN} (Mapaprop #${mapapropId}) el ${new Date().toISOString().slice(0, 10)}.`,
    detalles.Estado ? `Estado según el sitio: ${detalles.Estado}.` : "",
    detalles.Condiciones ? `Condiciones: ${detalles.Condiciones}.` : "",
    detalles.Impuestos ? `Impuestos: ${detalles.Impuestos}.` : "",
  ].filter(Boolean);

  const expensas = parsearPrecio(detalles.Expensas)?.monto ?? null;

  return {
    codigo,
    mapapropId,
    url,
    slug: slugDePropiedad(titulo, codigo),
    titulo,
    descripcion,
    tipo: tipoDe(tipoTexto),
    estado: "PUBLICADA",
    destacada,
    enVenta: esVenta,
    precioVenta: esVenta ? (precio?.monto ?? null) : null,
    monedaVenta: esVenta && precio ? precio.moneda : "USD",
    enAlquiler: esAlquiler,
    precioAlquiler: esAlquiler ? (precio?.monto ?? null) : null,
    monedaAlquiler: esAlquiler && precio ? precio.moneda : "ARS",
    expensas,
    aptoCredito,
    aptoMascotas,
    ...ubic,
    lat: Number.isFinite(lat as number) ? lat : null,
    lng: Number.isFinite(lng as number) ? lng : null,
    ambientes: entero(detalles.Ambientes),
    dormitorios: entero(detalles.Dormitorios),
    banos: entero(detalles["Baños"]),
    cocheras: entero(cocherasTexto),
    supCubierta: metros(detalles["Total construido"]),
    supTotal: metros(detalles["Superficie total"]),
    antiguedad: entero(detalles["Antigüedad"]),
    comodidades,
    videoUrl: video ? `https://www.youtube.com/watch?v=${video}` : null,
    notasInternas: notas.join(" "),
    fotos: parsearFotos(html, titulo),
    detalles,
    etiquetas: { operacion, tipo: tipoTexto },
  };
}

// ---------------------------------------------------------------------------
// Recorrido completo del sitio
// ---------------------------------------------------------------------------

async function recorrer(): Promise<Snapshot> {
  log(`recorriendo ${ORIGEN} (una pedida por vez, ${PAUSA_MS} ms entre pedidas)`);
  const destacadosHtml = await bajar(`${ORIGEN}/destacados/`);
  const destacadas = tarjetas(destacadosHtml);
  const hrefsDestacados = new Set(destacadas.map((t) => t.href));
  log(`destacadas: ${hrefsDestacados.size}`);

  const porHref = new Map<string, Tarjeta>();
  let totalAnunciado: number | null = null;
  let porPagina = 10;
  for (let pagina = 0; pagina < 200; pagina++) {
    const html = await bajar(`${ORIGEN}/buscar/?view=cards-filters&page=${pagina}`);
    if (pagina === 0) {
      const t = html.match(/var totalItems\s*=\s*(\d+)/)?.[1];
      totalAnunciado = t ? Number(t) : null;
      porPagina = Number(html.match(/var perPage\s*=\s*(\d+)/)?.[1] ?? 10) || 10;
      log(`el sitio anuncia ${totalAnunciado ?? "?"} propiedades, de a ${porPagina} por página`);
    }
    const ts = tarjetasDeGrilla(html);
    if (ts.length === 0) break;
    for (const t of ts) if (!porHref.has(t.href)) porHref.set(t.href, t);
    log(`página ${pagina}: ${ts.length} tarjetas · acumuladas ${porHref.size}`);
    if (totalAnunciado != null && (pagina + 1) * porPagina >= totalAnunciado) break;
  }
  // Por si alguna destacada no apareció en el listado.
  for (const t of destacadas) if (!porHref.has(t.href)) porHref.set(t.href, t);

  const lista = [...porHref.values()].slice(0, LIMITE);
  const propiedades: Ficha[] = [];
  const fallos: Snapshot["fallos"] = [];
  const codigosVistos = new Map<string, string>();
  let i = 0;
  for (const t of lista) {
    i++;
    const url = `${ORIGEN}${t.href}`;
    try {
      const html = await bajar(url);
      const f = parsearFicha(html, t, hrefsDestacados.has(t.href));
      const repetido = codigosVistos.get(f.codigo);
      if (repetido) throw new Error(`código ${f.codigo} repetido (ya lo tiene ${repetido})`);
      codigosVistos.set(f.codigo, t.href);
      propiedades.push(f);
      log(`${i}/${lista.length} ${f.codigo} · ${f.tipo} · ${f.etiquetas.operacion} · ${f.fotos.length} fotos${f.lat != null ? " · mapa" : ""}`);
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      fallos.push({ url, motivo });
      log(`${i}/${lista.length} ✖ ${t.href}: ${motivo}`);
    }
  }
  return { origen: ORIGEN, generadoEl: new Date().toISOString(), totalAnunciado, propiedades, fallos };
}

function resumen(snap: Snapshot): void {
  const cuenta = (xs: string[]) => {
    const c = new Map<string, number>();
    for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(" · ");
  };
  const ps = snap.propiedades;
  const sinFotos = ps.filter((p) => p.fotos.length === 0);
  const sinPrecio = ps.filter((p) => (p.enVenta && p.precioVenta == null) || (p.enAlquiler && p.precioAlquiler == null) || (!p.enVenta && !p.enAlquiler));
  const sinMapa = ps.filter((p) => p.lat == null);
  const totalFotos = ps.reduce((n, p) => n + p.fotos.length, 0);
  console.log("\n================ RESUMEN ================");
  console.log(`Fichas leídas: ${ps.length}${snap.totalAnunciado != null ? ` (el sitio anuncia ${snap.totalAnunciado})` : ""} · fallos: ${snap.fallos.length}`);
  console.log(`Por tipo:      ${cuenta(ps.map((p) => p.tipo))}`);
  console.log(`Por operación: ${cuenta(ps.map((p) => (p.enVenta ? "venta" : p.enAlquiler ? "alquiler" : "sin operación")))}`);
  console.log(`Por moneda:    ${cuenta(ps.map((p) => (p.enVenta ? p.monedaVenta : p.monedaAlquiler)))}`);
  console.log(`Destacadas: ${ps.filter((p) => p.destacada).length} · apto crédito: ${ps.filter((p) => p.aptoCredito).length} · con video: ${ps.filter((p) => p.videoUrl).length}`);
  console.log(`Fotos: ${totalFotos} en total · sin fotos: ${sinFotos.length}${sinFotos.length ? ` (${sinFotos.map((p) => p.codigo).join(", ")})` : ""}`);
  console.log(`Sin precio: ${sinPrecio.length}${sinPrecio.length ? ` (${sinPrecio.map((p) => p.codigo).join(", ")})` : ""}`);
  console.log(`Sin coordenadas: ${sinMapa.length}${sinMapa.length ? ` (${sinMapa.map((p) => p.codigo).join(", ")})` : ""}`);
  console.log(`Etiquetas de tipo vistas: ${cuenta(ps.map((p) => p.etiquetas.tipo || "(vacía)"))}`);
  for (const f of snap.fallos) console.log(`  ✖ ${f.url} → ${f.motivo}`);
  console.log("=========================================\n");
}

// ---------------------------------------------------------------------------
// Carga en la base (alta o actualización por código; reemplaza las fotos de cada ficha)
// ---------------------------------------------------------------------------

async function cargar(snap: Snapshot): Promise<void> {
  const cadena = process.env.DATABASE_URL;
  if (!cadena) fatal("falta DATABASE_URL (va por variable de entorno, nunca por argv).");
  let host = "";
  try {
    host = new URL(cadena).hostname.toLowerCase();
  } catch {
    fatal("DATABASE_URL no es una URL legible.");
  }
  const esLocal = HOSTS_LOCALES.has(host);
  console.log(`Base: ${host}${esLocal ? " (esta máquina)" : ""} · negocio: ${SLUG} · fichas a cargar: ${snap.propiedades.length}`);
  if (!esLocal && !args.confirmar) fatal("la base no es de esta máquina. Para escribir ahí hace falta --confirmar.");

  const { PrismaClient } = await import("../../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: cadena, max: Number(process.env.INMO_IMPORT_DB_MAX ?? 2) || 2 }),
  });

  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG }, select: { id: true, name: true } });
    if (!tenant) fatal(`no existe el negocio "${SLUG}" en esa base.`);
    const tenantId = tenant.id;
    log(`negocio: ${tenant.name} (${tenantId})`);

    let creadas = 0;
    let actualizadas = 0;
    let fotosCargadas = 0;
    const ahora = new Date();

    for (const f of snap.propiedades) {
      // Lo que viene del sitio. Lo que es de la casa (estado, propietario, quién la captó, notas
      // internas, fecha de publicación) se escribe sólo en el alta y no se pisa al actualizar.
      const datos = {
        slug: f.slug,
        titulo: f.titulo,
        descripcion: f.descripcion,
        tipo: f.tipo,
        destacada: f.destacada,
        enVenta: f.enVenta,
        precioVenta: f.precioVenta,
        monedaVenta: f.monedaVenta,
        enAlquiler: f.enAlquiler,
        precioAlquiler: f.precioAlquiler,
        monedaAlquiler: f.monedaAlquiler,
        expensas: f.expensas,
        aptoCredito: f.aptoCredito,
        aptoMascotas: f.aptoMascotas,
        direccion: f.direccion,
        barrio: f.barrio,
        localidad: f.localidad,
        partido: f.partido,
        provincia: f.provincia,
        lat: f.lat,
        lng: f.lng,
        ambientes: f.ambientes,
        dormitorios: f.dormitorios,
        banos: f.banos,
        cocheras: f.cocheras,
        supCubierta: f.supCubierta,
        supTotal: f.supTotal,
        antiguedad: f.antiguedad,
        comodidades: f.comodidades,
        videoUrl: f.videoUrl,
      };

      const previa = await prisma.inmoPropiedad.findUnique({ where: { tenantId_codigo: { tenantId, codigo: f.codigo } }, select: { id: true } });
      // El slug es único por negocio: si otra ficha ya lo usa, se le suma el id de Mapaprop.
      const choque = await prisma.inmoPropiedad.findFirst({ where: { tenantId, slug: datos.slug, NOT: { codigo: f.codigo } }, select: { id: true } });
      if (choque) datos.slug = `${aSlug(f.titulo, 60)}-${aSlug(`${f.codigo}-${f.mapapropId}`, 30)}`;

      const id = await prisma.$transaction(async (tx) => {
        const p = previa
          ? await tx.inmoPropiedad.update({ where: { id: previa.id }, data: datos, select: { id: true } })
          : await tx.inmoPropiedad.create({
              data: { tenantId, codigo: f.codigo, estado: f.estado, publicadaEl: ahora, notasInternas: f.notasInternas, ...datos },
              select: { id: true },
            });
        await tx.inmoFoto.deleteMany({ where: { tenantId, propiedadId: p.id } });
        if (f.fotos.length > 0) {
          await tx.inmoFoto.createMany({
            data: f.fotos.map((x) => ({ tenantId, propiedadId: p.id, url: x.url, alt: x.alt, posicion: x.posicion, esData: false })),
          });
        }
        return p.id;
      });

      if (previa) actualizadas++;
      else creadas++;
      fotosCargadas += f.fotos.length;
      log(`${previa ? "actualizada" : "creada"} ${f.codigo} · ${f.fotos.length} fotos · ${id}`);
    }

    console.log(`\n✅ ${tenant.name}: ${creadas} fichas creadas, ${actualizadas} actualizadas, ${fotosCargadas} fotos enlazadas.`);
    if (snap.fallos.length) console.log(`⚠ ${snap.fallos.length} fichas no se pudieron leer del sitio (ver la foto JSON).`);
  } finally {
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(SLUG)) fatal("--slug tiene que ser minúsculas, dígitos y guiones (ej. pdcinmobiliaria).");
  if (SOLO_MIRAR === CARGAR) fatal("elegí uno: --solo-mirar (recorre y guarda la foto) o --cargar (lee la foto y escribe en la base).");

  let snap: Snapshot | null = null;
  if (CARGAR && existsSync(SALIDA)) {
    snap = JSON.parse(readFileSync(SALIDA, "utf8")) as Snapshot;
    log(`foto leída de ${SALIDA} (${snap.generadoEl}, ${snap.propiedades.length} fichas)`);
  }
  if (!snap) {
    snap = await recorrer();
    mkdirSync(path.dirname(SALIDA), { recursive: true });
    writeFileSync(SALIDA, JSON.stringify(snap, null, 2), "utf8");
    log(`foto guardada en ${SALIDA}`);
    resumen(snap);
  }
  if (CARGAR) await cargar(snap);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
