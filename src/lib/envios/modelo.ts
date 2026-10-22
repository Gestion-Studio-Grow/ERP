// ============================================================================
// ENVÍOS · EL MODELO — tipos de la configuración y su validación. LÓGICA PURA.
// ============================================================================
//
// La configuración de envíos de un negocio: retiro en el local, pedido mínimo para envío, zonas
// con su costo y su «gratis desde», franjas, y la tienda pausada. Se guarda en AuditLog
// (config.ts); acá sólo está la forma y la regla de qué es una configuración válida, para que la
// pantalla y el servidor digan lo mismo. Sin Prisma ni red: lo usan el navegador y los tests.
//
// La plata va en PESOS con hasta dos decimales (como `Order.total`), y se valida al centavo
// (dinero/redondeo.ts). Los importes escritos a mano se leen con `leerImporte` («20.000» son
// veinte mil pesos, no veinte).

import { leerImporte } from "@/lib/dinero/leer";
import { admiteCentavos, redondearAlCentavo } from "@/lib/dinero/redondeo";

export type ZonaDeEnvio = {
  id: string;
  nombre: string;
  /** Costo del envío a esta zona (ARS, al centavo). 0 = sin cargo. */
  costo: number;
  /** Subtotal desde el que el envío a esta zona es gratis; `null` = nunca es gratis. */
  gratisDesde: number | null;
  /** Días y franjas en texto («L-S 11-13»), tal cual se le muestran a la clienta. */
  franjas: string[];
};

export type ConfigEnvios = {
  retiroEnLocal: boolean;
  horarioRetiro: string | null;
  /** Subtotal mínimo para pedir con envío; `null` = sin mínimo. El retiro no tiene mínimo. */
  pedidoMinimoEnvio: number | null;
  zonas: ZonaDeEnvio[];
  franjasRetiro: string[];
  /** Con valor, la tienda no toma pedidos y muestra el mensaje. */
  tiendaPausada: { mensaje: string } | null;
};

/**
 * Lo que rige cuando el negocio nunca configuró envíos: lo de siempre. Retiro en el local, sin
 * zonas (la tienda usa la tarifa de su copy, `storefront.ts`, o envío $0), sin mínimo, abierta.
 */
export const CONFIG_ENVIOS_POR_DEFECTO: Readonly<ConfigEnvios> = Object.freeze({
  retiroEnLocal: true,
  horarioRetiro: null,
  pedidoMinimoEnvio: null,
  zonas: [],
  franjasRetiro: [],
  tiendaPausada: null,
});

export function configPorDefecto(): ConfigEnvios {
  return { ...CONFIG_ENVIOS_POR_DEFECTO, zonas: [], franjasRetiro: [] };
}

// ── Límites (para que una carga equivocada no infle la fila ni la pantalla) ─────────────────────
export const MAX_ZONAS = 30;
export const MAX_FRANJAS = 12;
export const MAX_LARGO_NOMBRE_ZONA = 60;
export const MAX_LARGO_FRANJA = 40;
export const MAX_LARGO_HORARIO = 80;
export const MAX_LARGO_MENSAJE_PAUSA = 200;
/** Tope de un importe de envío o de un umbral: cien millones de pesos. */
export const MAX_IMPORTE = 100_000_000;

export const MENSAJE_PAUSA_POR_DEFECTO = "Por ahora no estamos tomando pedidos por la web. Escribinos por WhatsApp.";

const ID_VALIDO = /^[a-z0-9][a-z0-9-]{0,39}$/;

/**
 * Parte un texto de franjas en renglones: separa por punto y coma o salto de línea (la coma no,
 * porque se usa adentro de una franja: «Ma, Vi 17-19»).
 * «L-S 11-13; L-S 17-19» → ["L-S 11-13", "L-S 17-19"]. Saca vacíos y repetidos.
 */
export function partirFranjas(texto: string): string[] {
  const out: string[] = [];
  for (const parte of texto.split(/[;\n]/)) {
    const f = parte.replace(/\s+/g, " ").trim();
    if (f && !out.includes(f)) out.push(f);
  }
  return out;
}

type Importe = { ok: true; valor: number | null } | { ok: false };

/** Un importe que llega como número (JSON) o como texto escrito a mano. Vacío → null. */
function leerImporteDeAfuera(v: unknown): Importe {
  if (v === null || v === undefined) return { ok: true, valor: null };
  if (typeof v === "number") {
    if (!admiteCentavos(v) || v < 0) return { ok: false };
    if (redondearAlCentavo(v) !== v) return { ok: false };
    return { ok: true, valor: v };
  }
  if (typeof v === "string") {
    const l = leerImporte(v);
    if (l.estado === "vacio") return { ok: true, valor: null };
    if (l.estado === "invalida") return { ok: false };
    return { ok: true, valor: l.valor };
  }
  return { ok: false };
}

function textoCorto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

function franjasDeAfuera(v: unknown): string[] | string {
  const lista = typeof v === "string" ? partirFranjas(v) : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean) : [];
  const unicas = [...new Set(lista)];
  if (unicas.length > MAX_FRANJAS) return `Son muchas franjas: cargá hasta ${MAX_FRANJAS}.`;
  const larga = unicas.find((f) => f.length > MAX_LARGO_FRANJA);
  if (larga) return `La franja «${larga.slice(0, 20)}…» es muy larga: escribila más corta (hasta ${MAX_LARGO_FRANJA} letras).`;
  return unicas;
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

export type ResultadoValidacion = { ok: true; config: ConfigEnvios } | { ok: false; error: string };

/**
 * Valida y normaliza una configuración que llega de afuera (la pantalla, o la fila guardada).
 * Devuelve el error en criollo, listo para mostrar, con el nombre de la zona que falla.
 */
export function validarConfigEnvios(entrada: unknown): ResultadoValidacion {
  if (!entrada || typeof entrada !== "object") return { ok: false, error: "La configuración llegó incompleta: volvé a abrir la pantalla." };
  const o = entrada as Record<string, unknown>;

  const retiroEnLocal = o.retiroEnLocal === true;
  const horarioRetiro = textoCorto(o.horarioRetiro, MAX_LARGO_HORARIO);

  const minimo = leerImporteDeAfuera(o.pedidoMinimoEnvio);
  if (!minimo.ok) return { ok: false, error: "El pedido mínimo para envío no es un importe: escribilo como 20.000." };
  if (minimo.valor !== null && minimo.valor > MAX_IMPORTE) return { ok: false, error: "El pedido mínimo para envío es demasiado alto." };
  const pedidoMinimoEnvio = minimo.valor && minimo.valor > 0 ? minimo.valor : null;

  const crudas = Array.isArray(o.zonas) ? o.zonas : [];
  if (crudas.length > MAX_ZONAS) return { ok: false, error: `Son muchas zonas: cargá hasta ${MAX_ZONAS}.` };
  const zonas: ZonaDeEnvio[] = [];
  const ids = new Set<string>();
  const nombres = new Set<string>();
  for (let i = 0; i < crudas.length; i++) {
    const z = (crudas[i] ?? {}) as Record<string, unknown>;
    const nombre = textoCorto(z.nombre, MAX_LARGO_NOMBRE_ZONA + 1);
    const cual = nombre ? `«${nombre.slice(0, MAX_LARGO_NOMBRE_ZONA)}»` : `de la fila ${i + 1}`;
    if (!nombre) return { ok: false, error: `A la zona de la fila ${i + 1} le falta el nombre (por ejemplo, «Canning centro»).` };
    if (nombre.length > MAX_LARGO_NOMBRE_ZONA) return { ok: false, error: `El nombre de la zona ${cual} es muy largo: hasta ${MAX_LARGO_NOMBRE_ZONA} letras.` };
    const clave = nombre.toLocaleLowerCase("es");
    if (nombres.has(clave)) return { ok: false, error: `Hay dos zonas que se llaman ${cual}: cambiale el nombre a una.` };
    nombres.add(clave);

    const costo = leerImporteDeAfuera(z.costo);
    if (!costo.ok || costo.valor === null) return { ok: false, error: `Poné el costo del envío a la zona ${cual} (0 si no se cobra).` };
    if (costo.valor > MAX_IMPORTE) return { ok: false, error: `El costo del envío a la zona ${cual} es demasiado alto.` };

    const gratis = leerImporteDeAfuera(z.gratisDesde);
    if (!gratis.ok) return { ok: false, error: `«Gratis desde» de la zona ${cual} no es un importe: escribilo como 60.000, o dejalo vacío.` };
    if (gratis.valor !== null && gratis.valor > MAX_IMPORTE) return { ok: false, error: `«Gratis desde» de la zona ${cual} es demasiado alto.` };
    const gratisDesde = gratis.valor && gratis.valor > 0 ? gratis.valor : null;
    if (gratisDesde !== null && pedidoMinimoEnvio !== null && gratisDesde < pedidoMinimoEnvio) {
      return { ok: false, error: `En la zona ${cual}, «gratis desde» (${fmt(gratisDesde)}) es menor que el pedido mínimo (${fmt(pedidoMinimoEnvio)}): el envío saldría siempre gratis. Revisá los dos números.` };
    }

    const franjas = franjasDeAfuera(z.franjas);
    if (typeof franjas === "string") return { ok: false, error: `Zona ${cual}: ${franjas}` };

    let id = typeof z.id === "string" && ID_VALIDO.test(z.id) && !ids.has(z.id) ? z.id : "";
    for (let n = i + 1; !id; n++) if (!ids.has(`zona-${n}`)) id = `zona-${n}`;
    ids.add(id);

    zonas.push({ id, nombre, costo: costo.valor, gratisDesde, franjas });
  }

  const franjasRetiro = franjasDeAfuera(o.franjasRetiro);
  if (typeof franjasRetiro === "string") return { ok: false, error: `Franjas para retiro: ${franjasRetiro}` };

  let tiendaPausada: ConfigEnvios["tiendaPausada"] = null;
  if (o.tiendaPausada && typeof o.tiendaPausada === "object") {
    const m = (o.tiendaPausada as Record<string, unknown>).mensaje;
    const mensaje = typeof m === "string" ? m.replace(/\s+/g, " ").trim() : "";
    if (mensaje.length > MAX_LARGO_MENSAJE_PAUSA) return { ok: false, error: `El mensaje de la tienda pausada es muy largo: hasta ${MAX_LARGO_MENSAJE_PAUSA} letras.` };
    tiendaPausada = { mensaje };
  }

  if (!retiroEnLocal && zonas.length === 0) {
    return { ok: false, error: "Si no hay retiro en el local, cargá al menos una zona de envío: si no, la tienda no tendría cómo entregar." };
  }

  return { ok: true, config: { retiroEnLocal, horarioRetiro, pedidoMinimoEnvio, zonas, franjasRetiro, tiendaPausada } };
}
