// ============================================================================
// VOUCHERS · lógica pura de la pantalla (CH Estética · La Alameda)
// ============================================================================
//
// Sin base ni React: leer los filtros de la URL, armar el querystring del «Exportar», las
// etiquetas de cada estado y el resultado de una conciliación dicho en criollo claro. La
// pantalla (page.tsx), el route handler del CSV y los formularios de importación la comparten.
// Diseño: docs/tenants/ch/VOUCHERS-OPENKEY.md.

import { redondearAlCentavo } from "@/lib/dinero/redondeo";
import type { ResultadoConciliacion, ResultadoLiquidacion } from "@/lib/vouchers/voucher-core";

export const ESTADOS_ERP = ["DISPONIBLE", "USADO", "ANULADO"] as const;
export type EstadoErp = (typeof ESTADOS_ERP)[number];

/** Los filtros tal como viajan en la URL (y en el CSV): todos texto o null. */
export type FiltrosDeUrl = {
  desde: string | null;
  hasta: string | null;
  loteId: string | null;
  clientId: string | null;
  estado: EstadoErp | null;
  numero: string | null;
};

export const SIN_FILTROS: FiltrosDeUrl = { desde: null, hasta: null, loteId: null, clientId: null, estado: null, numero: null };

const CLAVES = ["desde", "hasta", "loteId", "clientId", "estado", "numero"] as const;

type ParametrosCrudos = Record<string, string | string[] | undefined> | URLSearchParams;

function primero(sp: ParametrosCrudos, clave: string): string | null {
  const v = sp instanceof URLSearchParams ? sp.get(clave) : sp[clave];
  const s = Array.isArray(v) ? v[0] : v;
  const t = typeof s === "string" ? s.trim() : "";
  return t ? t.slice(0, 80) : null;
}

function esDia(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Lee los filtros del querystring. Un valor que no se entiende se descarta con un aviso (la
 * pantalla sigue mostrando el resto, no un error); un rango invertido se da vuelta.
 */
export function leerFiltrosDeUrl(sp: ParametrosCrudos): { filtros: FiltrosDeUrl; avisos: string[] } {
  const avisos: string[] = [];
  let desde = primero(sp, "desde");
  let hasta = primero(sp, "hasta");
  if (desde && !esDia(desde)) {
    avisos.push("La fecha «desde» no se entiende: no se aplicó.");
    desde = null;
  }
  if (hasta && !esDia(hasta)) {
    avisos.push("La fecha «hasta» no se entiende: no se aplicó.");
    hasta = null;
  }
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  const estadoCrudo = primero(sp, "estado");
  const estado = estadoCrudo ? ((ESTADOS_ERP as readonly string[]).includes(estadoCrudo.toUpperCase()) ? (estadoCrudo.toUpperCase() as EstadoErp) : null) : null;
  if (estadoCrudo && !estado) avisos.push("El estado elegido no existe: se muestran todos.");
  return {
    filtros: { desde, hasta, loteId: primero(sp, "loteId"), clientId: primero(sp, "clientId"), estado, numero: primero(sp, "numero") },
    avisos,
  };
}

/** `?desde=…&estado=…` con sólo los filtros puestos ("" si no hay ninguno). */
export function queryDeFiltros(f: FiltrosDeUrl): string {
  const p = new URLSearchParams();
  for (const k of CLAVES) {
    const v = f[k];
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function hayFiltros(f: FiltrosDeUrl): boolean {
  return CLAVES.some((k) => f[k] != null);
}

// ── Etiquetas ────────────────────────────────────────────────────────────────

export const ETIQUETA_ESTADO_ERP: Record<EstadoErp, string> = {
  DISPONIBLE: "Disponible",
  USADO: "Usado",
  ANULADO: "Anulado",
};

export function etiquetaEstadoErp(e: string): string {
  return ETIQUETA_ESTADO_ERP[e as EstadoErp] ?? e;
}

/** Estado según la última foto de OpenKey (null = todavía no se importó ninguna que lo traiga). */
export function etiquetaOpenKey(e: string | null): string {
  if (e == null) return "Sin verificar";
  if (e === "DISPONIBLE") return "Disponible";
  if (e === "BAJA") return "Dado de baja";
  return e;
}

/** YYYY-MM-DD → dd/mm/aaaa; null → «—». */
export function fechaCorta(dia: string | null): string {
  if (!dia) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dia;
}

/** Usado acá y todavía disponible en OpenKey: hay que darlo de baja allá. */
export function faltaLaBaja(f: { estado: string; estadoOpenKey: string | null; bajaOpenKeyEn: string | null }): boolean {
  return f.estado === "USADO" && !f.bajaOpenKeyEn && f.estadoOpenKey !== "BAJA";
}

/** Cobrado con el voucher y OpenKey todavía no lo pagó. */
export function sinLiquidar(f: { estado: string; liquidadoEn: string | null }): boolean {
  return f.estado === "USADO" && !f.liquidadoEn;
}

export type ResumenDelListado = { total: number; usados: number; cubierto: number; faltanBaja: number; sinLiquidar: number };

export function resumirListado(
  filas: readonly { estado: string; estadoOpenKey: string | null; bajaOpenKeyEn: string | null; liquidadoEn: string | null; valorCubierto: number | null }[],
): ResumenDelListado {
  const r: ResumenDelListado = { total: filas.length, usados: 0, cubierto: 0, faltanBaja: 0, sinLiquidar: 0 };
  for (const f of filas) {
    if (f.estado === "USADO") {
      r.usados++;
      r.cubierto += f.valorCubierto ?? 0;
    }
    if (faltaLaBaja(f)) r.faltanBaja++;
    if (sinLiquidar(f)) r.sinLiquidar++;
  }
  r.cubierto = redondearAlCentavo(r.cubierto);
  return r;
}

// ── El resultado de una conciliación, en criollo claro ──────────────────────

export type TonoLinea = "ok" | "aviso" | "alerta";
export type LineaDeResultado = { tono: TonoLinea; texto: string; numeros: string[] };

const TOPE_NUMEROS = 30;

function n(cant: number, uno: string, varios: string): string {
  return `${cant} ${cant === 1 ? uno : varios}`;
}

function linea(tono: TonoLinea, texto: string, numeros: readonly string[] = []): LineaDeResultado {
  return { tono, texto, numeros: numeros.slice(0, TOPE_NUMEROS) };
}

type ErroresDeLectura = readonly { linea: number; motivo: string }[];

function lineaDeErrores(errores: ErroresDeLectura): LineaDeResultado[] {
  if (!errores.length) return [];
  const ejemplos = errores
    .slice(0, 3)
    .map((e) => `renglón ${e.linea}: ${e.motivo}`)
    .join(" · ");
  return [linea("aviso", `${n(errores.length, "renglón del archivo no se pudo leer", "renglones del archivo no se pudieron leer")} (${ejemplos}).`)];
}

/** La foto de OpenKey contra lo usado en el ERP. */
export function lineasDeLaFoto(r: {
  filas: number;
  actualizados: number;
  creados: readonly string[];
  anuladosPorOpenKey: readonly string[];
  conciliacion: ResultadoConciliacion;
  erroresDeLectura: ErroresDeLectura;
}): LineaDeResultado[] {
  const c = r.conciliacion;
  const out: LineaDeResultado[] = [
    linea("ok", `Se leyeron ${n(r.filas, "voucher", "vouchers")} del sistema de la administración del country; ${n(r.actualizados, "quedó actualizado", "quedaron actualizados")} acá.`),
  ];
  if (r.creados.length) out.push(linea("ok", `${n(r.creados.length, "voucher nuevo se dio de alta", "vouchers nuevos se dieron de alta")} con el documento del vecino.`, r.creados));
  if (r.anuladosPorOpenKey.length)
    out.push(linea("aviso", `${n(r.anuladosPorOpenKey.length, "voucher quedó anulado", "vouchers quedaron anulados")} porque la administración del country los anuló: ya no se pueden usar.`, r.anuladosPorOpenKey));
  if (c.faltaBaja.length)
    out.push(linea("aviso", `Falta dar de baja en el sistema de la administración del country ${n(c.faltaBaja.length, "voucher", "vouchers")}: se usaron acá y allá siguen disponibles.`, c.faltaBaja));
  if (c.usadoEnOpenKeySinCobro.length)
    out.push(
      linea(
        "alerta",
        `${n(c.usadoEnOpenKeySinCobro.length, "voucher figura usado", "vouchers figuran usados")} en el sistema de la administración y acá no tienen cobro: se cobró afuera o se usó mal. Revisalo.`,
        c.usadoEnOpenKeySinCobro,
      ),
    );
  if (c.anuladoEnOpenKeyUsadoEnErp.length)
    out.push(
      linea(
        "alerta",
        `${n(c.anuladoEnOpenKeyUsadoEnErp.length, "voucher está anulado", "vouchers están anulados")} en el sistema de la administración pero se usó acá: hay un turno cobrado con voucher sin respaldo.`,
        c.anuladoEnOpenKeyUsadoEnErp,
      ),
    );
  if (c.usadoEnTurnoCancelado.length)
    out.push(
      linea("alerta", `${n(c.usadoEnTurnoCancelado.length, "voucher quedó usado", "vouchers quedaron usados")} en un turno cancelado o que no vino: revisá si hay que anular el cobro.`, c.usadoEnTurnoCancelado),
    );
  if (c.desconocidosEnOpenKey.length)
    out.push(linea("aviso", `${n(c.desconocidosEnOpenKey.length, "voucher de la administración no está", "vouchers de la administración no están")} cargado acá: cargá su lote si son de este negocio.`, c.desconocidosEnOpenKey));
  out.push(...lineaDeErrores(r.erroresDeLectura));
  if (out.length === 1) out.push(linea("ok", "Todo coincide con la administración del country: no hay nada para revisar."));
  return out;
}

function pesos(v: number): string {
  return `$ ${v.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** La liquidación de OpenKey contra los cobros con voucher del ERP. */
export function lineasDeLaLiquidacion(r: { filas: number; marcados: number; conciliacion: ResultadoLiquidacion; erroresDeLectura: ErroresDeLectura }): LineaDeResultado[] {
  const c = r.conciliacion;
  const out: LineaDeResultado[] = [
    linea("ok", `Se leyeron ${n(r.filas, "voucher liquidado", "vouchers liquidados")}; ${n(r.marcados, "quedó marcado", "quedaron marcados")} como pagado por la administración del country.`),
  ];
  if (c.cobradoSinLiquidar.length) {
    const masViejo = c.cobradoSinLiquidar[0];
    out.push(
      linea(
        "aviso",
        `${n(c.cobradoSinLiquidar.length, "voucher cobrado sigue", "vouchers cobrados siguen")} sin liquidar por la administración del country` +
          (masViejo ? ` (el más viejo, ${masViejo.numero}, hace ${n(masViejo.dias, "día", "días")}).` : "."),
        c.cobradoSinLiquidar.map((x) => x.numero),
      ),
    );
  }
  if (c.liquidadoSinCobro.length)
    out.push(linea("alerta", `La administración del country pagó ${n(c.liquidadoSinCobro.length, "voucher", "vouchers")} que acá no tienen cobro: revisalo con La Alameda.`, c.liquidadoSinCobro));
  if (c.montoDistinto.length)
    out.push(
      linea(
        "alerta",
        `${n(c.montoDistinto.length, "voucher se liquidó", "vouchers se liquidaron")} por un monto distinto al cobrado: ` +
          c.montoDistinto
            .slice(0, 3)
            .map((m) => `${m.numero}: cobrado ${pesos(m.cobrado)}, liquidado ${pesos(m.liquidado)}`)
            .join(" · ") +
          (c.montoDistinto.length > 3 ? " …" : "."),
        c.montoDistinto.map((m) => m.numero),
      ),
    );
  out.push(...lineaDeErrores(r.erroresDeLectura));
  if (out.length === 1) out.push(linea("ok", "La liquidación coincide con lo cobrado: no hay nada para revisar."));
  return out;
}

/**
 * Los números de un lote tal como los separa `crearLote` (renglones, comas, punto y coma o
 * espacios), sin repetidos: es la cuenta que se muestra antes de guardar.
 */
export function numerosDelTexto(texto: string): string[] {
  return [...new Set(texto.split(/[\s,;]+/).filter(Boolean))];
}

/** Nombre del archivo del CSV, con el día de hoy (YYYY-MM-DD). */
export function nombreDelCsv(hoy: string): string {
  return `vouchers-${/^\d{4}-\d{2}-\d{2}$/.test(hoy) ? hoy : "reporte"}.csv`;
}
