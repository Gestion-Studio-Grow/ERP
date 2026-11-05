// ============================================================================
// VOUCHERS (CH Estética · La Alameda) — la REGLA, pura: sin base, sin tenant, sin Next.
// ============================================================================
//
// docs/tenants/ch/VOUCHERS-OPENKEY.md · orden del dueño 05/11/2026: el voucher ES un cobro y un
// medio de pago (`PaymentMethod.VOUCHER`, prisma/pending-gate2/CH_voucher_enum.sql). Cobrar un turno
// con voucher escribe un `Collection` VOUCHER por el camino de cobro de siempre; NO entra al libro de
// caja (no hay plata en el cajón): es a cobrar a OpenKey, que lo LIQUIDA después. Por defecto cubre
// el saldo del turno [provisional a confirmar: un voucher = el servicio], o un monto menor; lo que
// falte se cobra con los medios de siempre.
//
// Acá viven: la validación del cobro, la conciliación de DISPONIBILIDAD (foto de OpenKey) y la de
// LIQUIDACIÓN (lo que OpenKey paga), los lectores de los CSV de OpenKey (columnas PROVISIONALES a
// confirmar con una exportación real) y el CSV del reporte.
// Persistencia: voucher-repo.ts · Server Actions: voucher-actions.ts.

import { round2 } from "@/lib/round";

export const ESTADOS_VOUCHER = ["DISPONIBLE", "USADO", "ANULADO"] as const;
export type EstadoVoucher = (typeof ESTADOS_VOUCHER)[number];
export type EstadoOpenKey = "DISPONIBLE" | "BAJA";
/** Lo que dice la foto de OpenKey de un voucher (el CSV distingue usado de anulado). */
export type EstadoEnOpenKey = "DISPONIBLE" | "USADO" | "ANULADO";

export function esEstadoVoucher(v: unknown): v is EstadoVoucher {
  return typeof v === "string" && (ESTADOS_VOUCHER as readonly string[]).includes(v);
}

/** El número como se compara: sin espacios, en mayúsculas. (Ceros a la izquierda: se respetan.) */
export function normalizarNumero(raw: string): string {
  return String(raw ?? "").replace(/\s+/g, "").toUpperCase();
}

// ── Cobrar un turno con un voucher ──────────────────────────────────────────

export type MotivoVoucherRechazado =
  | "anulado"
  | "ya-usado"
  | "baja-openkey"
  | "otro-cliente"
  | "turno-cerrado"
  | "sin-saldo"
  | "monto-invalido"
  | "excede-saldo"
  | "turno-con-voucher"
  | "no-existe"
  | "enum-ausente"
  | "apagado";

export const MENSAJES_VOUCHER: Record<MotivoVoucherRechazado, string> = {
  anulado: "Este voucher está anulado: no se puede usar.",
  "ya-usado": "Este voucher ya fue usado.",
  "baja-openkey": "Este voucher ya fue usado en OpenKey: OpenKey lo da por usado y no se puede volver a usar.",
  "otro-cliente": "Este voucher es de otro vecino: sólo lo puede usar la persona a la que se le dio.",
  "turno-cerrado": "Este turno está cancelado o marcado como no se presentó: no admite cobros.",
  "sin-saldo": "Este turno no tiene saldo pendiente: no hay nada que cobrar con el voucher.",
  "monto-invalido": "El monto del voucher tiene que ser mayor a cero.",
  "excede-saldo": "El monto del voucher supera lo que falta cobrar del turno.",
  "turno-con-voucher": "Este turno ya se cobró con un voucher.",
  "no-existe": "No hay un voucher con ese número en este negocio.",
  "enum-ausente":
    "Cobrar con voucher necesita un paso de base de datos que todavía no se aplicó (lo hace el dueño). Mientras tanto, cobrá con otro medio.",
  apagado: "Los vouchers no están prendidos en este negocio.",
};

export type VoucherParaValidar = { estado: string; clientId: string; estadoOpenKey: string | null };
export type TurnoParaValidar = { clientId: string; status: string };

export type ValidacionAplicacion =
  | { ok: true; valorCubierto: number; sinVerificar: boolean }
  | { ok: false; motivo: MotivoVoucherRechazado; mensaje: string };

function rechazo(motivo: MotivoVoucherRechazado): { ok: false; motivo: MotivoVoucherRechazado; mensaje: string } {
  return { ok: false, motivo, mensaje: MENSAJES_VOUCHER[motivo] };
}

/**
 * ¿Se puede cobrar este turno con este voucher, y por cuánto? `saldo` = lo que falta cobrar del
 * turno (`estadoCobroTurno(...).saldo`). Sin `monto`, el voucher cubre TODO el saldo; con `monto`,
 * ese (0 < monto ≤ saldo). `estadoOpenKey` null = la foto de OpenKey no lo vio todavía: se permite,
 * marcado «sin verificar».
 */
export function validarAplicacion(input: {
  voucher: VoucherParaValidar;
  turno: TurnoParaValidar;
  saldo: number;
  monto?: number | null;
}): ValidacionAplicacion {
  const { voucher, turno } = input;
  if (voucher.estado === "ANULADO") return rechazo("anulado");
  if (voucher.estado !== "DISPONIBLE") return rechazo("ya-usado");
  if (voucher.estadoOpenKey === "BAJA") return rechazo("baja-openkey");
  if (voucher.clientId !== turno.clientId) return rechazo("otro-cliente");
  if (turno.status === "CANCELLED" || turno.status === "NO_SHOW") return rechazo("turno-cerrado");
  const saldo = round2(Number(input.saldo));
  if (!Number.isFinite(saldo) || saldo <= 0) return rechazo("sin-saldo");
  let valor = saldo;
  if (input.monto != null) {
    const m = round2(Number(input.monto));
    if (!Number.isFinite(m) || m <= 0) return rechazo("monto-invalido");
    if (m > saldo) return rechazo("excede-saldo");
    valor = m;
  }
  return { ok: true, valorCubierto: valor, sinVerificar: voucher.estadoOpenKey == null };
}

/** La clave de idempotencia del cobro: `voucher:<id>` el primer uso, `voucher:<id>:<n>` si se re-usa tras anular. */
export function claveDelCobroConVoucher(voucherId: string, usosPrevios: number): string {
  return usosPrevios <= 0 ? `voucher:${voucherId}` : `voucher:${voucherId}:${usosPrevios + 1}`;
}

// ── Conciliación ERP ↔ OpenKey ──────────────────────────────────────────────

export type VoucherErp = {
  numero: string;
  estado: string;
  /** Estado del turno al que está pegado (si está USADO). */
  estadoTurno?: string | null;
};
export type VoucherOpenKey = { numero: string; estado: EstadoEnOpenKey };

export type ResultadoConciliacion = {
  /** Usado en el ERP y disponible en OpenKey: hay que darlo de baja en OpenKey. */
  faltaBaja: string[];
  /** Usado en OpenKey y no usado en el ERP: se cobró afuera o se usó mal. */
  usadoEnOpenKeySinCobro: string[];
  /** Anulado en OpenKey y usado en el ERP: hay un turno con descuento sin respaldo. */
  anuladoEnOpenKeyUsadoEnErp: string[];
  /** Usado en el ERP en un turno cancelado o «no vino»: hay que revisarlo. */
  usadoEnTurnoCancelado: string[];
  /** Están en la foto de OpenKey y el ERP no los conoce. */
  desconocidosEnOpenKey: string[];
};

export function conciliar(erp: readonly VoucherErp[], openkey: readonly VoucherOpenKey[]): ResultadoConciliacion {
  const porNumero = new Map(erp.map((v) => [normalizarNumero(v.numero), v]));
  const r: ResultadoConciliacion = {
    faltaBaja: [],
    usadoEnOpenKeySinCobro: [],
    anuladoEnOpenKeyUsadoEnErp: [],
    usadoEnTurnoCancelado: [],
    desconocidosEnOpenKey: [],
  };
  const vistos = new Set<string>();
  for (const ok of openkey) {
    const n = normalizarNumero(ok.numero);
    if (vistos.has(n)) continue;
    vistos.add(n);
    const v = porNumero.get(n);
    if (!v) {
      r.desconocidosEnOpenKey.push(n);
      continue;
    }
    if (v.estado === "USADO" && ok.estado === "DISPONIBLE") r.faltaBaja.push(n);
    if (ok.estado === "USADO" && v.estado !== "USADO") r.usadoEnOpenKeySinCobro.push(n);
    if (ok.estado === "ANULADO" && v.estado === "USADO") r.anuladoEnOpenKeyUsadoEnErp.push(n);
  }
  for (const v of erp) {
    if (v.estado === "USADO" && (v.estadoTurno === "CANCELLED" || v.estadoTurno === "NO_SHOW")) {
      r.usadoEnTurnoCancelado.push(normalizarNumero(v.numero));
    }
  }
  for (const k of Object.keys(r) as (keyof ResultadoConciliacion)[]) r[k].sort();
  return r;
}

// ── CSV de OpenKey (columnas PROVISIONALES a confirmar con una exportación real) ──

export type FilaOpenKey = { numero: string; lote: string | null; estado: EstadoEnOpenKey; documento: string | null };
export type LecturaOpenKey = { filas: FilaOpenKey[]; errores: { linea: number; motivo: string }[] };

const ALIAS_COLUMNAS: Record<"numero" | "lote" | "estado" | "documento", string[]> = {
  numero: ["numero", "nro", "voucher", "numerodevoucher", "nrovoucher", "codigo"],
  lote: ["lote", "nrolote", "numerodelote"],
  estado: ["estado", "status", "situacion"],
  documento: ["documento", "dni", "doc", "nrodocumento", "cuit"],
};

function claveDeColumna(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Estado de OpenKey → el nuestro. null = no se reconoce. [provisional a confirmar] */
export function estadoOpenKeyDesdeTexto(raw: string): EstadoEnOpenKey | null {
  const t = claveDeColumna(raw);
  if (["disponible", "activo", "vigente", "libre", "pendiente", "habilitado"].includes(t)) return "DISPONIBLE";
  if (["usado", "utilizado", "baja", "debaja", "dadodebaja", "consumido", "canjeado"].includes(t)) return "USADO";
  if (["anulado", "cancelado", "vencido", "inhabilitado"].includes(t)) return "ANULADO";
  return null;
}

/** Parte una línea CSV respetando comillas dobles (`""` = comilla literal). */
function partirLinea(linea: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (enComillas) {
      if (c === '"' && linea[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') enComillas = false;
      else cur += c;
    } else if (c === '"') enComillas = true;
    else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Lee la exportación de OpenKey: separador `,` o `;` (el que más aparezca en el encabezado), BOM,
 * fin de línea CRLF/LF, encabezado con alias tolerantes. Columnas: número y estado obligatorias;
 * lote y documento opcionales. Una fila mala no frena a las demás: va a `errores` con su línea.
 */
export function leerCsvOpenKey(texto: string): LecturaOpenKey {
  const limpio = String(texto ?? "").replace(/^﻿/, "");
  const lineas = limpio.split(/\r?\n/);
  const errores: LecturaOpenKey["errores"] = [];
  const iEnc = lineas.findIndex((l) => l.trim() !== "");
  if (iEnc < 0) return { filas: [], errores: [{ linea: 1, motivo: "El archivo está vacío." }] };
  const enc = lineas[iEnc];
  const sep = (enc.match(/;/g)?.length ?? 0) > (enc.match(/,/g)?.length ?? 0) ? ";" : ",";
  const columnas = partirLinea(enc, sep).map(claveDeColumna);
  const idx = (k: keyof typeof ALIAS_COLUMNAS) => columnas.findIndex((c) => ALIAS_COLUMNAS[k].includes(c));
  const iNum = idx("numero");
  const iEst = idx("estado");
  const iLote = idx("lote");
  const iDoc = idx("documento");
  if (iNum < 0 || iEst < 0) {
    return { filas: [], errores: [{ linea: iEnc + 1, motivo: "Faltan las columnas «número» y «estado» en el encabezado." }] };
  }
  const filas: FilaOpenKey[] = [];
  const vistos = new Set<string>();
  for (let i = iEnc + 1; i < lineas.length; i++) {
    if (lineas[i].trim() === "") continue;
    const celdas = partirLinea(lineas[i], sep);
    const numero = normalizarNumero(celdas[iNum] ?? "");
    if (!numero) {
      errores.push({ linea: i + 1, motivo: "Fila sin número de voucher." });
      continue;
    }
    const estado = estadoOpenKeyDesdeTexto(celdas[iEst] ?? "");
    if (!estado) {
      errores.push({ linea: i + 1, motivo: `Estado desconocido «${celdas[iEst] ?? ""}» para el voucher ${numero}.` });
      continue;
    }
    if (vistos.has(numero)) {
      errores.push({ linea: i + 1, motivo: `El voucher ${numero} está repetido en el archivo: vale la primera fila.` });
      continue;
    }
    vistos.add(numero);
    const lote = iLote >= 0 ? normalizarNumero(celdas[iLote] ?? "") || null : null;
    const documento = iDoc >= 0 ? (celdas[iDoc] ?? "").replace(/\D/g, "") || null : null;
    filas.push({ numero, lote, estado, documento });
  }
  return { filas, errores };
}

// ── Liquidación de OpenKey (lo que paga por cada voucher) ───────────────────

export type FilaLiquidacion = { numero: string; monto: number; fecha: string | null; referencia: string | null };
export type LecturaLiquidacion = { filas: FilaLiquidacion[]; errores: { linea: number; motivo: string }[] };

const ALIAS_LIQUIDACION: Record<"numero" | "monto" | "fecha" | "referencia", string[]> = {
  numero: ALIAS_COLUMNAS.numero,
  monto: ["monto", "importe", "valor", "total", "montoliquidado"],
  fecha: ["fecha", "fechadepago", "fechaliquidacion", "pagado"],
  referencia: ["referencia", "ref", "liquidacion", "nroliquidacion", "comprobante"],
};

/** Monto en formato argentino o inglés: «$ 12.345,50» · «12345.5» · «12,345.50». null = no se entiende. */
export function leerMonto(raw: string): number | null {
  let t = String(raw ?? "").replace(/[$\s]/g, "");
  if (!t) return null;
  const coma = t.lastIndexOf(",");
  const punto = t.lastIndexOf(".");
  if (coma > punto) t = t.replace(/\./g, "").replace(",", ".");
  else if (punto > coma && coma >= 0) t = t.replace(/,/g, "");
  else if (coma < 0 && (t.match(/\./g)?.length ?? 0) > 1) t = t.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = round2(Number(t));
  return Number.isFinite(n) ? n : null;
}

/** Fecha «dd/mm/aaaa», «dd-mm-aaaa» o «aaaa-mm-dd» → «aaaa-mm-dd». null = no se entiende. */
export function leerFecha(raw: string): string | null {
  const t = String(raw ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/**
 * Lee el CSV de la LIQUIDACIÓN de OpenKey (columnas provisionales a confirmar: número, monto, fecha,
 * referencia; número y monto obligatorias). Misma tolerancia que `leerCsvOpenKey`.
 */
export function leerCsvLiquidacion(texto: string): LecturaLiquidacion {
  const limpio = String(texto ?? "").replace(/^\uFEFF/, "");
  const lineas = limpio.split(/\r?\n/);
  const errores: LecturaLiquidacion["errores"] = [];
  const iEnc = lineas.findIndex((l) => l.trim() !== "");
  if (iEnc < 0) return { filas: [], errores: [{ linea: 1, motivo: "El archivo está vacío." }] };
  const enc = lineas[iEnc];
  const sep = (enc.match(/;/g)?.length ?? 0) > (enc.match(/,/g)?.length ?? 0) ? ";" : ",";
  const columnas = partirLinea(enc, sep).map(claveDeColumna);
  const idx = (k: keyof typeof ALIAS_LIQUIDACION) => columnas.findIndex((c) => ALIAS_LIQUIDACION[k].includes(c));
  const [iNum, iMonto, iFecha, iRef] = [idx("numero"), idx("monto"), idx("fecha"), idx("referencia")];
  if (iNum < 0 || iMonto < 0) {
    return { filas: [], errores: [{ linea: iEnc + 1, motivo: "Faltan las columnas «número» y «monto» en el encabezado." }] };
  }
  const filas: FilaLiquidacion[] = [];
  const vistos = new Set<string>();
  for (let i = iEnc + 1; i < lineas.length; i++) {
    if (lineas[i].trim() === "") continue;
    const celdas = partirLinea(lineas[i], sep);
    const numero = normalizarNumero(celdas[iNum] ?? "");
    if (!numero) {
      errores.push({ linea: i + 1, motivo: "Fila sin número de voucher." });
      continue;
    }
    const monto = leerMonto(celdas[iMonto] ?? "");
    if (monto == null || monto < 0) {
      errores.push({ linea: i + 1, motivo: `Monto ilegible «${celdas[iMonto] ?? ""}» para el voucher ${numero}.` });
      continue;
    }
    if (vistos.has(numero)) {
      errores.push({ linea: i + 1, motivo: `El voucher ${numero} está repetido en la liquidación: vale la primera fila.` });
      continue;
    }
    vistos.add(numero);
    const fecha = iFecha >= 0 ? leerFecha(celdas[iFecha] ?? "") : null;
    const referencia = iRef >= 0 ? (celdas[iRef] ?? "").trim() || null : null;
    filas.push({ numero, monto, fecha, referencia });
  }
  return { filas, errores };
}

export type VoucherParaLiquidar = {
  numero: string;
  estado: string;
  valorCubierto: number | null;
  /** Día del cobro (YYYY-MM-DD, zona del negocio), si está USADO. */
  usadoEn: string | null;
  /** Ya liquidado ANTES de esta liquidación. */
  liquidado: boolean;
};

export type ResultadoLiquidacion = {
  /** Cobrado en el ERP y OpenKey todavía no lo pagó, con los días que lleva. */
  cobradoSinLiquidar: { numero: string; monto: number; dias: number }[];
  /** OpenKey lo paga y el ERP no tiene un cobro con ese voucher. */
  liquidadoSinCobro: string[];
  /** Lo que paga OpenKey no coincide con lo que se cobró con el voucher. */
  montoDistinto: { numero: string; cobrado: number; liquidado: number }[];
};

function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86_400_000)) : 0;
}

/**
 * Concilia la liquidación de OpenKey contra los cobros con voucher del ERP. `erp` = los vouchers
 * USADOS sin liquidar y los que nombra la liquidación; `hoy` (YYYY-MM-DD) mide la antigüedad.
 */
export function conciliarLiquidacion(
  erp: readonly VoucherParaLiquidar[],
  liquidacion: readonly Pick<FilaLiquidacion, "numero" | "monto">[],
  hoy: string,
): ResultadoLiquidacion {
  const porNumero = new Map(erp.map((v) => [normalizarNumero(v.numero), v]));
  const enLaLiquidacion = new Set<string>();
  const r: ResultadoLiquidacion = { cobradoSinLiquidar: [], liquidadoSinCobro: [], montoDistinto: [] };
  for (const l of liquidacion) {
    const n = normalizarNumero(l.numero);
    if (enLaLiquidacion.has(n)) continue;
    enLaLiquidacion.add(n);
    const v = porNumero.get(n);
    if (!v || v.estado !== "USADO") {
      r.liquidadoSinCobro.push(n);
      continue;
    }
    const cobrado = round2(v.valorCubierto ?? 0);
    if (round2(l.monto) !== cobrado) r.montoDistinto.push({ numero: n, cobrado, liquidado: round2(l.monto) });
  }
  for (const v of erp) {
    const n = normalizarNumero(v.numero);
    if (v.estado !== "USADO" || v.liquidado || enLaLiquidacion.has(n)) continue;
    r.cobradoSinLiquidar.push({ numero: n, monto: round2(v.valorCubierto ?? 0), dias: v.usadoEn ? diasEntre(v.usadoEn, hoy) : 0 });
  }
  r.liquidadoSinCobro.sort();
  r.montoDistinto.sort((a, b) => a.numero.localeCompare(b.numero));
  // Los más viejos primero: son los que hay que reclamar.
  r.cobradoSinLiquidar.sort((a, b) => b.dias - a.dias || a.numero.localeCompare(b.numero));
  return r;
}

// ── CSV del reporte (el que CH le manda a La Alameda) ───────────────────────

export type FilaReporteVoucher = {
  numero: string;
  lote: string;
  cliente: string;
  /** Fecha del turno, YYYY-MM-DD (zona del negocio), o null. */
  turno: string | null;
  /** Fecha de uso, YYYY-MM-DD (zona del negocio), o null. */
  usadoEn: string | null;
  valorCubierto: number | null;
  estado: string;
  estadoOpenKey: string | null;
  /** Fecha de la baja en OpenKey, YYYY-MM-DD, o null. */
  bajaOpenKeyEn: string | null;
  /** Fecha en que OpenKey lo liquidó, YYYY-MM-DD, o null. */
  liquidadoEn: string | null;
  montoLiquidado: number | null;
  liquidacionRef: string | null;
};

export const COLUMNAS_REPORTE = [
  "Número",
  "Lote",
  "Cliente",
  "Turno",
  "Fecha de uso",
  "Valor cubierto",
  "Estado ERP",
  "Estado OpenKey",
  "Baja en OpenKey",
  "Liquidado",
  "Monto liquidado",
  "Referencia de liquidación",
] as const;

/** Una celda segura para Excel: neutraliza fórmulas (= + - @, tab, CR) y escapa `;`, `"` y saltos. */
export function celdaCsv(valor: string): string {
  let v = String(valor ?? "");
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[;"\n\r]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

function fechaAr(dia: string | null): string {
  if (!dia) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dia;
}

function montoAr(n: number | null): string {
  return n == null ? "" : round2(n).toFixed(2).replace(".", ",");
}

/** CSV con BOM y `;` (abre bien en el Excel argentino), mismas columnas que la pantalla. */
export function csvDelReporte(filas: readonly FilaReporteVoucher[]): string {
  const lineas = [COLUMNAS_REPORTE.map(celdaCsv).join(";")];
  for (const f of filas) {
    lineas.push(
      [
        f.numero,
        f.lote,
        f.cliente,
        fechaAr(f.turno),
        fechaAr(f.usadoEn),
        montoAr(f.valorCubierto),
        f.estado,
        f.estadoOpenKey ?? "Sin verificar",
        fechaAr(f.bajaOpenKeyEn),
        fechaAr(f.liquidadoEn),
        montoAr(f.montoLiquidado),
        f.liquidacionRef ?? "",
      ]
        .map(celdaCsv)
        .join(";"),
    );
  }
  return `﻿${lineas.join("\r\n")}\r\n`;
}
