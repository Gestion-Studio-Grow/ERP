// ============================================================================
// PLANILLA DE CORTES Y PRECIOS — bajar el catálogo a Excel, editarlo y subirlo.
// ============================================================================
//
// POR QUÉ EXISTE. El catálogo sólo se carga de a un corte (catalog-actions.ts: `createProduct`
// y `updateProduct` trabajan de a uno), y el alta de un corte son siete campos más "Enviar".
// MAGRA declara unos 202 productos disponibles en Bistrosoft (docs/preventa/magra/
// analisis-brecha-bistrosoft.md:53) y cada local es un tenant propio (caja, cierre y punto de
// venta de ARCA son por tenant). Cargarlos a mano, local por local, es lo que hoy frena abrir.
// Y un aumento de precios son tres clics por corte.
//
// QUÉ HACE Y QUÉ NO.
//   · Baja un CSV con: nombre, forma de venta, precio, controla stock y stock actual.
//   · Sube el mismo CSV editado y arma un PLAN: altas, cambios de precio / control de stock,
//     y errores con la fila y el motivo. El plan es lo que se muestra en la vista previa Y lo
//     que se escribe: el servidor lo vuelve a armar desde el texto del archivo, contra el
//     catálogo leído en la misma transacción, y no usa nada que haya calculado el navegador.
//   · NO carga stock. Ni en altas ni en filas existentes. La columna "Stock actual" sale para
//     que se vea, y al subir se ignora. El stock de cada local entra por un recuento en
//     Ajustes, que deja su fila en el ledger. Un número tipeado en una planilla que pisa el
//     stock no tiene historia, y la venta de ayer ya lo dejó viejo.
//   · NO cambia la forma de venta de un corte que ya existe: sus kilos pasarían a leerse como
//     unidades (o al revés). Eso se hace desde el catálogo, con el corte a la vista.
//   · Si UNA fila tiene error, no se aplica NADA. La planilla entra entera o no entra.
//
// FORMATO. CSV con `;`, BOM UTF-8 y coma decimal: es lo que Excel en es-AR abre sin preguntar
// y con los acentos bien. NO xlsx: la librería viene de CDN (package.json) y en este árbol ya
// hubo tests rotos por el CDN bloqueado. Al leer se acepta también `,` o tabulador como
// separador, por si alguien guarda desde otra planilla.
//
// EL CRUCE es por nombre normalizado (sin mayúsculas, sin acentos, sin espacios dobles). Es
// frágil ante un renombre: "Vacío" → "Vacío premium" no encuentra a nadie y sale como ALTA.
// Por eso las altas se listan una por una en la vista previa, y los productos del catálogo
// que no están en el archivo se cuentan aparte: un renombre se ve como "1 alta + 1 que no
// está", no pasa callado.
//
// Todo lo de arriba es PURO (sin DB, sin React, sin Prisma de valor): se testea con datos.
// La única pieza que toca la base es `escribirPlan`, al final, que recibe la tx del llamador
// (igual que `recordMovement`) y no abre la suya.

import { leerCantidad, leerImporte } from "@/lib/pos-peso";
import type { LedgerTx } from "@/lib/stock/ledger";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type FormaDeVenta = "UNIT" | "WEIGHT";

/** Lo que hace falta saber de cada producto del catálogo para cruzarlo con la planilla. */
export type ProductoDelCatalogo = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  active: boolean;
  saleUnit: FormaDeVenta;
  price: number | null;
  pricePerKg: number | null;
  trackStock: boolean;
};

/** Las columnas de `Product` que lee la planilla. La usan la descarga y la acción que aplica. */
export const SELECT_CATALOGO = {
  id: true,
  name: true,
  unit: true,
  stock: true,
  active: true,
  saleUnit: true,
  price: true,
  pricePerKg: true,
  trackStock: true,
} as const;

/** Fila de Prisma → producto de la planilla. El enum llega como string: se estrecha acá. */
export function aProductoDelCatalogo(p: {
  id: string;
  name: string;
  unit: string;
  stock: number;
  active: boolean;
  saleUnit: string;
  price: number | null;
  pricePerKg: number | null;
  trackStock: boolean;
}): ProductoDelCatalogo {
  return { ...p, saleUnit: p.saleUnit === "WEIGHT" ? "WEIGHT" : "UNIT" };
}

export type ErrorDeFila = { fila: number; nombre: string; motivo: string };

/**
 * Lo que se escribe en `Product` para un alta. No lleva `stock`: nace en el default de la
 * columna (0) y lo que haya lo pone un recuento por el ledger (ver cabecera).
 */
export type DatosAlta = {
  name: string;
  unit: string;
  saleUnit: FormaDeVenta;
  price: number | null;
  pricePerKg: number | null;
  trackStock: boolean;
};

/** Sólo los campos que cambian. Ausente = no se toca. */
export type DatosCambio = { price?: number; pricePerKg?: number; trackStock?: boolean };

export type Alta = { fila: number; data: DatosAlta };

export type Cambio = {
  fila: number;
  productId: string;
  nombre: string;
  saleUnit: FormaDeVenta;
  /** El producto está pausado en el catálogo: se le cambia el precio, pero sigue pausado. */
  inactivo: boolean;
  precioAntes: number | null;
  /** null = el precio no cambia. */
  precioDespues: number | null;
  controlAntes: boolean;
  /** null = el control de stock no cambia. */
  controlDespues: boolean | null;
  data: DatosCambio;
};

export type PlanPlanilla = {
  /** Error que invalida el archivo entero (encabezado, formato). Si está, no hay filas. */
  errorGeneral: string | null;
  filasLeidas: number;
  altas: Alta[];
  cambios: Cambio[];
  sinCambios: number;
  errores: ErrorDeFila[];
  /** Productos del catálogo que el archivo no nombra. No se tocan; se cuentan para que un renombre se vea. */
  noEstanEnPlanilla: { id: string; nombre: string }[];
  /** Filas cuyo "Stock actual" no coincide con el del sistema: aviso, no error (el stock no se importa). */
  stockIgnorado: number;
  /** Resumen determinista del plan: si cambia entre la vista previa y el "Aplicar", no se aplica. */
  huella: string;
};

// ── Constantes del formato ──────────────────────────────────────────────────

export const SEPARADOR = ";";
export const BOM = "\uFEFF";

/** El encabezado que baja. Al subir se reconoce por nombre, no por posición. */
export const ENCABEZADO = [
  "Nombre",
  "Forma de venta (kg / u)",
  "Precio",
  "Controla stock (sí / no)",
  "Stock actual (no se importa)",
] as const;

/** Tope de filas por archivo. 202 productos por local es la cifra de hoy; esto deja margen. */
export const MAX_FILAS = 2000;
/** Tope del texto que acepta la acción. 2000 filas de ~60 caracteres son ~120 KB. */
export const MAX_BYTES = 512 * 1024;
const MAX_NOMBRE = 120;

// ── Utilidades de texto ─────────────────────────────────────────────────────

/** Nombre para cruzar: sin acentos, minúsculas, un solo espacio. "  Vacío  al VACÍO" → "vacio al vacio". */
export function normalizarNombre(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** El nombre tal como se guarda en un alta: el que se escribió, sin espacios de más. */
function nombreLimpio(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const centavos = (n: number): number => Math.round(n * 100);

/** Precio como lo lee Excel es-AR: sin miles, coma decimal, centavos sólo si hay. */
export function precioParaPlanilla(n: number | null): string {
  if (n == null || !(n > 0)) return "";
  const c = centavos(n);
  return c % 100 === 0 ? String(c / 100) : (c / 100).toFixed(2).replace(".", ",");
}

function cantidadParaPlanilla(n: number): string {
  return String(Math.round(n * 1000) / 1000).replace(".", ",");
}

function campoCsv(v: string): string {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ── Bajar ───────────────────────────────────────────────────────────────────

/**
 * El CSV del catálogo, listo para Excel: BOM, `;`, CRLF, coma decimal. Determinista.
 * Precio = el de la forma de venta (por kilo si es WEIGHT, por unidad si es UNIT).
 */
export function armarPlanilla(productos: readonly ProductoDelCatalogo[]): string {
  const orden = [...productos].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const lineas = [ENCABEZADO.map(campoCsv).join(SEPARADOR)];
  for (const p of orden) {
    lineas.push(
      [
        p.name,
        p.saleUnit === "WEIGHT" ? "kg" : "u",
        precioParaPlanilla(p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price),
        p.trackStock ? "sí" : "no",
        cantidadParaPlanilla(p.stock),
      ]
        .map(campoCsv)
        .join(SEPARADOR),
    );
  }
  return BOM + lineas.join("\r\n") + "\r\n";
}

// ── Leer el CSV ─────────────────────────────────────────────────────────────

/**
 * Bytes del archivo → texto. Primero UTF-8 estricto; si no es UTF-8 válido, Windows-1252.
 *
 * Por qué: la planilla baja en UTF-8 con BOM, pero Excel en Windows tiene dos "CSV" en
 * "Guardar como", y el que no dice UTF-8 guarda en la página de códigos del sistema
 * (Windows-1252 en español). No lo medí con un Excel real: lo que está probado (test) es
 * que ese archivo, leído como UTF-8, trae "Entra\uFFFDa" en vez de "Entraña", no cruza con
 * el catálogo y saldría como un alta fantasma; y que con este fallback se lee bien. Un texto
 * en Windows-1252 con acentos casi nunca es UTF-8 válido, por eso el intento estricto
 * alcanza para distinguirlos.
 */
export function decodificarArchivo(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

type Registro = { linea: number; celdas: string[] };

/** Separador del archivo: el que más aparece en la primera línea con algo, fuera de comillas. */
function detectarSeparador(texto: string): string {
  const primera = texto.split(/\r\n|\r|\n/).find((l) => l.trim() !== "") ?? "";
  let enComillas = false;
  const cuenta: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  for (const ch of primera) {
    if (ch === '"') enComillas = !enComillas;
    else if (!enComillas && ch in cuenta) cuenta[ch]++;
  }
  const [mejor, n] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? mejor : SEPARADOR;
}

/**
 * CSV → registros con la línea donde EMPIEZA cada uno (la que la persona ve en Excel).
 * RFC 4180: comillas dobles, `""` escapado, saltos de línea dentro de comillas.
 */
function leerCsv(texto: string, sep: string): { registros: Registro[]; error: string | null } {
  const registros: Registro[] = [];
  let celdas: string[] = [];
  let celda = "";
  let enComillas = false;
  let linea = 1;
  let inicio = 1;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (enComillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          celda += '"';
          i++;
        } else enComillas = false;
      } else {
        if (ch === "\n") linea++;
        celda += ch;
      }
      continue;
    }
    if (ch === '"') enComillas = true;
    else if (ch === sep) {
      celdas.push(celda);
      celda = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      celdas.push(celda);
      registros.push({ linea: inicio, celdas });
      celdas = [];
      celda = "";
      linea++;
      inicio = linea;
    } else celda += ch;
  }
  if (enComillas) return { registros, error: `Hay unas comillas sin cerrar desde la fila ${inicio}.` };
  if (celda !== "" || celdas.length > 0) {
    celdas.push(celda);
    registros.push({ linea: inicio, celdas });
  }
  return { registros, error: null };
}

type Columna = "nombre" | "forma" | "precio" | "controla" | "stock";

/** Reconoce una columna por su encabezado, con o sin acentos y con o sin la aclaración entre paréntesis. */
function columnaDe(encabezado: string): Columna | null {
  const h = normalizarNombre(encabezado.replace(/\(.*\)/g, ""));
  if (h === "nombre" || h === "corte" || h === "producto") return "nombre";
  if (h.startsWith("forma") || h === "venta" || h === "unidad de venta") return "forma";
  if (h.startsWith("precio")) return "precio";
  if (h.startsWith("controla") || h.startsWith("control")) return "controla";
  if (h.startsWith("stock")) return "stock";
  return null;
}

function leerForma(raw: string): FormaDeVenta | null | "invalida" {
  const s = normalizarNombre(raw).replace(/^por /, "").replace(/\.$/, "");
  if (s === "") return null;
  if (["kg", "kgs", "kilo", "kilos", "peso"].includes(s)) return "WEIGHT";
  if (["u", "un", "uni", "unidad", "unidades"].includes(s)) return "UNIT";
  return "invalida";
}

function leerSiNo(raw: string): boolean | null | "invalida" {
  const s = normalizarNombre(raw);
  if (s === "") return null;
  if (["si", "s", "x", "1", "true", "verdadero"].includes(s)) return true;
  if (["no", "n", "0", "false", "falso"].includes(s)) return false;
  return "invalida";
}

// ── Planificar ──────────────────────────────────────────────────────────────

/** FNV-1a de 32 bits: alcanza para notar que el plan cambió, no es criptografía. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function huellaDe(altas: readonly Alta[], cambios: readonly Cambio[]): string {
  const cuerpo = JSON.stringify({
    a: altas.map((a) => a.data),
    c: cambios.map((c) => [c.productId, c.data]),
  });
  return `${altas.length}-${cambios.length}-${fnv1a(cuerpo)}`;
}

/**
 * Un plan que son sólo CAMBIOS ya decididos (sin archivo): el de "Actualizar precios"
 * (aumento-core.ts). Mismo formato y misma huella que el de la planilla, así se escribe con
 * `escribirPlan` y se valida igual entre la vista previa y el "Aplicar".
 */
export function armarPlanDeCambios(cambios: Cambio[]): PlanPlanilla {
  return {
    errorGeneral: null,
    filasLeidas: cambios.length,
    altas: [],
    cambios,
    sinCambios: 0,
    errores: [],
    noEstanEnPlanilla: [],
    stockIgnorado: 0,
    huella: huellaDe([], cambios),
  };
}

function planVacio(errorGeneral: string, catalogo: readonly ProductoDelCatalogo[]): PlanPlanilla {
  return {
    errorGeneral,
    filasLeidas: 0,
    altas: [],
    cambios: [],
    sinCambios: 0,
    errores: [],
    noEstanEnPlanilla: catalogo.map((p) => ({ id: p.id, nombre: p.name })),
    stockIgnorado: 0,
    huella: "vacio",
  };
}

/**
 * Lee el texto del archivo y lo cruza con el catálogo. PURA: no escribe nada.
 *
 * Es la misma función para la vista previa y para el "Aplicar": el servidor la corre dos
 * veces, y la segunda contra el catálogo leído dentro de la transacción que escribe.
 */
export function planificarPlanilla(texto: string, catalogo: readonly ProductoDelCatalogo[]): PlanPlanilla {
  const limpio = texto.replace(/^\uFEFF/, "");
  if (limpio.trim() === "") return planVacio("El archivo está vacío.", catalogo);

  const { registros, error } = leerCsv(limpio, detectarSeparador(limpio));
  if (error) return planVacio(error, catalogo);

  const conAlgo = registros.filter((r) => r.celdas.some((c) => c.trim() !== ""));
  if (conAlgo.length === 0) return planVacio("El archivo está vacío.", catalogo);
  const [cabecera, ...filas] = conAlgo;
  const indice: Partial<Record<Columna, number>> = {};
  cabecera.celdas.forEach((c, i) => {
    const col = columnaDe(c);
    if (col && indice[col] === undefined) indice[col] = i;
  });
  if (indice.nombre === undefined || indice.precio === undefined) {
    return planVacio(
      `La primera fila tiene que ser el encabezado (${ENCABEZADO.join("; ")}). Bajá la planilla de nuevo y editá esa.`,
      catalogo,
    );
  }
  if (filas.length > MAX_FILAS) {
    return planVacio(`El archivo tiene ${filas.length} filas; el máximo es ${MAX_FILAS}. Partilo en dos.`, catalogo);
  }

  // Catálogo por nombre normalizado. Dos productos con el mismo nombre son un cruce ambiguo.
  const porNombre = new Map<string, ProductoDelCatalogo[]>();
  for (const p of catalogo) {
    const k = normalizarNombre(p.name);
    porNombre.set(k, [...(porNombre.get(k) ?? []), p]);
  }

  const celda = (r: Registro, col: Columna): string => {
    const i = indice[col];
    return i === undefined ? "" : (r.celdas[i] ?? "").trim();
  };

  const altas: Alta[] = [];
  const cambios: Cambio[] = [];
  const errores: ErrorDeFila[] = [];
  const vistos = new Map<string, number>(); // nombre normalizado → fila donde apareció
  const nombrados = new Set<string>(); // ids del catálogo que el archivo nombra
  let sinCambios = 0;
  let stockIgnorado = 0;

  for (const r of filas) {
    const fila = r.linea;
    const nombre = nombreLimpio(celda(r, "nombre"));
    const err = (motivo: string) => errores.push({ fila, nombre, motivo });

    if (!nombre) {
      err("Falta el nombre del corte.");
      continue;
    }
    if (nombre.length > MAX_NOMBRE) {
      err(`El nombre tiene ${nombre.length} caracteres; el máximo es ${MAX_NOMBRE}.`);
      continue;
    }
    const clave = normalizarNombre(nombre);
    const repetida = vistos.get(clave);
    if (repetida !== undefined) {
      err(`El nombre se repite: ya está en la fila ${repetida}. Dejá una sola.`);
      continue;
    }
    vistos.set(clave, fila);

    // Cada columna se lee y se valida antes de decidir: una fila con dos problemas muestra
    // el primero, y la persona lo corrige y vuelve a subir.
    const forma = leerForma(celda(r, "forma"));
    if (forma === "invalida") {
      err(`Forma de venta "${celda(r, "forma")}": escribí kg o u.`);
      continue;
    }
    const lecturaPrecio = leerImporte(celda(r, "precio"));
    if (lecturaPrecio.estado === "invalida") {
      err(`Precio "${celda(r, "precio")}": no es un importe. Escribilo como 12500 o 12500,50.`);
      continue;
    }
    const precio = lecturaPrecio.estado === "ok" ? lecturaPrecio.valor : null;
    if (precio !== null && !(precio > 0)) {
      err("El precio tiene que ser mayor que cero.");
      continue;
    }
    const controla = leerSiNo(celda(r, "controla"));
    if (controla === "invalida") {
      err(`Controla stock "${celda(r, "controla")}": escribí sí o no.`);
      continue;
    }

    const coincidencias = porNombre.get(clave) ?? [];
    if (coincidencias.length > 1) {
      err(`Hay ${coincidencias.length} productos con este nombre en el catálogo. Renombrá uno desde Catálogo y volvé a subir.`);
      continue;
    }
    const existente = coincidencias[0];

    if (!existente) {
      // ALTA. Sin forma de venta ni precio no se puede vender: se pide, no se adivina.
      if (forma === null) {
        err("Corte nuevo sin forma de venta: escribí kg o u.");
        continue;
      }
      if (precio === null) {
        err("Corte nuevo sin precio.");
        continue;
      }
      // Control de stock vacío en un alta = sí, como siembra el rubro retail.
      altas.push({
        fila,
        data: {
          name: nombre,
          unit: forma === "WEIGHT" ? "kg" : "unidad",
          saleUnit: forma,
          price: forma === "UNIT" ? precio : null,
          pricePerKg: forma === "WEIGHT" ? precio : null,
          trackStock: controla ?? true,
        },
      });
      const st = leerCantidad(celda(r, "stock"));
      if (st.estado === "ok" && st.valor !== 0) stockIgnorado++;
      continue;
    }

    nombrados.add(existente.id);
    if (forma !== null && forma !== existente.saleUnit) {
      err(
        `Hoy se vende ${existente.saleUnit === "WEIGHT" ? "por kg" : "por unidad"}. La forma de venta de un corte que ya existe se cambia desde Catálogo, no desde la planilla.`,
      );
      continue;
    }
    const precioAntes = existente.saleUnit === "WEIGHT" ? existente.pricePerKg : existente.price;
    // Precio vacío en una fila existente = no tocar. Así la planilla recién bajada de un
    // corte sin precio vuelve a subir sin cambios.
    const cambiaPrecio = precio !== null && (precioAntes == null || centavos(precioAntes) !== centavos(precio));
    const cambiaControl = controla !== null && controla !== existente.trackStock;

    const st = leerCantidad(celda(r, "stock"));
    if (st.estado === "ok" && Math.round(st.valor * 1000) !== Math.round(existente.stock * 1000)) stockIgnorado++;

    if (!cambiaPrecio && !cambiaControl) {
      sinCambios++;
      continue;
    }
    const data: DatosCambio = {};
    if (cambiaPrecio) data[existente.saleUnit === "WEIGHT" ? "pricePerKg" : "price"] = precio!;
    if (cambiaControl) data.trackStock = controla!;
    cambios.push({
      fila,
      productId: existente.id,
      nombre: existente.name,
      saleUnit: existente.saleUnit,
      inactivo: !existente.active,
      precioAntes,
      precioDespues: cambiaPrecio ? precio : null,
      controlAntes: existente.trackStock,
      controlDespues: cambiaControl ? controla : null,
      data,
    });
  }

  return {
    errorGeneral: null,
    filasLeidas: filas.length,
    altas,
    cambios,
    sinCambios,
    errores,
    noEstanEnPlanilla: catalogo.filter((p) => !nombrados.has(p.id)).map((p) => ({ id: p.id, nombre: p.name })),
    stockIgnorado,
    huella: huellaDe(altas, cambios),
  };
}

/** ¿Se puede aplicar? Sólo sin error general, sin errores de fila y con algo para escribir. */
export function planAplicable(plan: PlanPlanilla): boolean {
  return plan.errorGeneral === null && plan.errores.length === 0 && plan.altas.length + plan.cambios.length > 0;
}

// ── Escribir (la única pieza con base de datos) ─────────────────────────────

/**
 * Escribe el plan dentro de la tx del llamador. Dos sentencias, sea cual sea el tamaño:
 * un `createManyAndReturn` con las altas y UN `UPDATE … FROM unnest(…)` con todos los cambios.
 * Las altas vuelven con su id para que el llamador deje, en la misma transacción, el registro
 * de su precio (lo que lee Etiquetas para saber qué falta imprimir). Con
 * una sentencia por fila, 200 filas son 200 idas y vueltas a la base dentro de una
 * transacción interactiva, que Prisma corta a los 5 s por defecto (según su documentación;
 * `tenantTransaction` no cambia ese tope).
 *
 * MEDIDO el 2026-09-23 contra un Postgres 16 local descartable (schema con `db push`), con
 * el cliente Prisma y el adaptador `pg` del repo: 202 productos, planilla de 300 filas
 * (202 cambios de precio o de control + 98 altas) → la transacción entera (leer catálogo,
 * planificar, escribir) tardó 39 ms, con 4 consultas en el log de Prisma. Los `null` de los
 * arreglos llegaron como NULL y el COALESCE dejó el campo como estaba. NO medido contra
 * Neon: ahí cada ida y vuelta cuesta más, pero siguen siendo las mismas cuatro.
 * Con `createManyAndReturn` (ola 2): 202 cambios + 98 altas contra el Postgres local de QA, con
 * el rol de RLS (app_rls) y el negocio puesto, `escribirPlan` hizo 2 consultas en 51 ms y
 * devolvió las 98 altas con su id.
 *
 * El UPDATE usa COALESCE: un `null` en el arreglo es "no tocar ese campo", que es lo que
 * dice `DatosCambio` con un campo ausente. Si no se actualizan exactamente tantas filas como
 * cambios (un producto borrado entre la lectura y la escritura), lanza y la tx se deshace.
 */
export async function escribirPlan(
  tx: LedgerTx,
  tenantId: string,
  plan: PlanPlanilla,
): Promise<{ altas: number; cambios: number; creados: ProductoCreado[] }> {
  if (!planAplicable(plan)) throw new Error("La planilla tiene errores o no cambia nada: no se aplica.");

  let creados: ProductoCreado[] = [];
  if (plan.altas.length > 0) {
    const filas = await tx.product.createManyAndReturn({
      data: plan.altas.map((a) => ({ tenantId, ...a.data })),
      select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true },
    });
    creados = filas.map((f) => ({ ...f, saleUnit: f.saleUnit === "WEIGHT" ? "WEIGHT" : "UNIT" }));
  }
  const altas = creados.length;

  let cambios = 0;
  if (plan.cambios.length > 0) {
    const ids = plan.cambios.map((c) => c.productId);
    const precios = plan.cambios.map((c) => c.data.price ?? null);
    const preciosKg = plan.cambios.map((c) => c.data.pricePerKg ?? null);
    const controles = plan.cambios.map((c) => c.data.trackStock ?? null);
    cambios = await tx.$executeRaw`
      UPDATE "Product" AS p SET
        "price" = COALESCE(v.precio, p."price"),
        "pricePerKg" = COALESCE(v.precio_kg, p."pricePerKg"),
        "trackStock" = COALESCE(v.controla, p."trackStock"),
        "updatedAt" = now()
      FROM unnest(${ids}::text[], ${precios}::double precision[], ${preciosKg}::double precision[], ${controles}::boolean[])
        AS v(id, precio, precio_kg, controla)
      WHERE p."id" = v.id AND p."tenantId" = ${tenantId} AND p."deletedAt" IS NULL`;
    if (cambios !== plan.cambios.length) {
      throw new Error(
        `Se esperaban ${plan.cambios.length} cambios y la base encontró ${cambios} productos. Alguien tocó el catálogo mientras tanto: volvé a subir la planilla.`,
      );
    }
  }
  return { altas, cambios, creados };
}

/** Un producto recién dado de alta por `escribirPlan`, con lo que hace falta para registrar su precio. */
export type ProductoCreado = {
  id: string;
  name: string;
  saleUnit: FormaDeVenta;
  price: number | null;
  pricePerKg: number | null;
};
