/**
 * Monitor de obligaciones fiscales (Finanzas y Control, FC-11 · T7). PURO: recibe filas leídas y
 * la hora, y decide qué se muestra, en qué orden, quién lo tiene y qué avisar.
 *
 * «Vencido» no se guarda (ni lo marca nadie): sale de `estadoEfectivo` comparando con hoy en
 * Argentina. El monitor suma un caso: una obligación de presentar Y pagar que se presentó pero no
 * se pagó, pasada la fecha, también está vencida (falta el pago).
 *
 * Responsable: sin migración (T7 usa sólo ola 1), el responsable de cada obligación sale de una
 * regla (con estudio en cartera, el estudio presenta y el negocio paga) y se puede cambiar; el
 * cambio se guarda como evento en `AuditLog` (lo lee `responsablesDesdeEventos`). Deuda anotada:
 * pasarlo a una tabla lateral cuando haya migración de Finanzas y Control.
 */

import {
  diaIso,
  estadoEfectivo,
  hoyEnArgentina,
  type AccionObligacion,
  type EstadoEfectivo,
  type EstadoVencimiento,
} from "./vencimientos";

export type Responsable = "NEGOCIO" | "ESTUDIO";
export const RESPONSABLES: readonly Responsable[] = ["NEGOCIO", "ESTUDIO"];
export const ETIQUETA_RESPONSABLE: Record<Responsable, string> = { NEGOCIO: "El negocio", ESTUDIO: "El estudio contable" };
export const esResponsable = (v: unknown): v is Responsable => v === "NEGOCIO" || v === "ESTUDIO";

/** Lo único que el estudio contable puede marcar desde su panel. */
export const ESTADOS_QUE_MARCA_EL_ESTUDIO = ["PRESENTADO", "PAGADO"] as const;
export type EstadoDelEstudio = (typeof ESTADOS_QUE_MARCA_EL_ESTUDIO)[number];
export const estudioPuedeMarcar = (v: unknown): v is EstadoDelEstudio => v === "PRESENTADO" || v === "PAGADO";

/**
 * Desde qué estados guardados el estudio puede pasar un vencimiento a `hacia` (la regla vive acá y
 * la usan el server action, vía el repo, y la page): de PENDIENTE o EN_CURSO a PRESENTADO o PAGADO,
 * y de PRESENTADO a PAGADO. Nunca «presentado» en una obligación que sólo se paga, ni «pagado»
 * sobre una que sólo se presenta y ya se presentó. Lo cerrado por el negocio (NO_CORRESPONDE,
 * SIN_SALDO, VERIFICADO, PAGADO) no se toca desde el estudio.
 */
export function desdeDondeMarcaElEstudio(hacia: EstadoDelEstudio, accion: AccionObligacion): readonly EstadoVencimiento[] {
  if (hacia === "PRESENTADO") return accion === "PAGO" ? [] : ["PENDIENTE", "EN_CURSO"];
  return accion === "PRESENTACION" ? ["PENDIENTE", "EN_CURSO"] : ["PENDIENTE", "EN_CURSO", "PRESENTADO"];
}

export const estudioPuedePasar = (desde: EstadoVencimiento, hacia: EstadoDelEstudio, accion: AccionObligacion): boolean =>
  desdeDondeMarcaElEstudio(hacia, accion).includes(desde);

/** Lo que la persona del negocio puede marcar desde el monitor (todo menos «vencido», que se calcula). */
export const ESTADOS_QUE_MARCA_EL_NEGOCIO: readonly EstadoVencimiento[] = ["EN_CURSO", "PRESENTADO", "PAGADO", "SIN_SALDO", "NO_CORRESPONDE", "PENDIENTE"];

export const ETIQUETA_ESTADO: Record<EstadoEfectivo, string> = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  PRESENTADO: "Presentado",
  PAGADO: "Pagado",
  SIN_SALDO: "Sin saldo a pagar",
  NO_CORRESPONDE: "No corresponde",
  VERIFICADO: "Verificado",
  VENCIDO: "Vencido",
};

/** Dónde cae cada fila en el monitor, en el orden en que se muestra. */
export type Situacion = "VENCIDO" | "VENCE_HOY" | "POR_VENCER" | "PROXIMO" | "CUMPLIDO" | "NO_APLICA";
export const SITUACIONES: readonly Situacion[] = ["VENCIDO", "VENCE_HOY", "POR_VENCER", "PROXIMO", "CUMPLIDO", "NO_APLICA"];
export const ETIQUETA_SITUACION: Record<Situacion, string> = {
  VENCIDO: "Vencido",
  VENCE_HOY: "Vence hoy",
  POR_VENCER: "Por vencer (7 días)",
  PROXIMO: "Más adelante",
  CUMPLIDO: "Cumplido",
  NO_APLICA: "No corresponde",
};
/** Días hacia adelante que cuentan como «por vencer». */
export const DIAS_POR_VENCER = 7;

export interface FilaVencimiento {
  id: string;
  obligacionId: string;
  codigo: string;
  nombre: string;
  organismo: string;
  jurisdiccion: string | null;
  accion: AccionObligacion;
  periodo: string;
  cuota: number;
  fechaVencimiento: Date;
  fechaPresentacion: Date | null;
  fechaPago: Date | null;
  estado: EstadoVencimiento;
}

export interface FilaMonitor extends FilaVencimiento {
  estadoMostrado: EstadoEfectivo;
  situacion: Situacion;
  /** Días civiles hasta el vencimiento (negativo: hace cuántos días venció). */
  diasRestantes: number;
  /** Presentado, sin pago, y la obligación también se paga. */
  faltaPago: boolean;
  responsable: Responsable;
}

const UN_DIA = 86_400_000;

/** Días civiles entre dos DATE (00:00 UTC). */
export function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((Date.parse(diaIso(hasta)) - Date.parse(diaIso(desde))) / UN_DIA);
}

/** Regla por defecto: con estudio en cartera, el estudio presenta y el negocio paga. */
export function responsablePorDefecto(accion: AccionObligacion, tieneEstudio: boolean): Responsable {
  if (!tieneEstudio) return "NEGOCIO";
  return accion === "PAGO" ? "NEGOCIO" : "ESTUDIO";
}

export interface EventoResponsable {
  entityId: string | null;
  changes: unknown;
}

/**
 * Responsable elegido por obligación, a partir de los eventos de `AuditLog` ordenados del más
 * nuevo al más viejo: gana el primero válido de cada obligación.
 */
export function responsablesDesdeEventos(eventos: readonly EventoResponsable[]): Map<string, Responsable> {
  const r = new Map<string, Responsable>();
  for (const e of eventos) {
    if (!e.entityId || r.has(e.entityId)) continue;
    const valor = (e.changes as { responsable?: unknown } | null)?.responsable;
    if (esResponsable(valor)) r.set(e.entityId, valor);
  }
  return r;
}

function situacionDe(estado: EstadoEfectivo, faltaPago: boolean, dias: number): Situacion {
  if (estado === "VENCIDO") return "VENCIDO";
  if (estado === "NO_CORRESPONDE") return "NO_APLICA";
  const abierto = estado === "PENDIENTE" || estado === "EN_CURSO" || faltaPago;
  if (!abierto) return "CUMPLIDO";
  if (dias === 0) return "VENCE_HOY";
  return dias <= DIAS_POR_VENCER ? "POR_VENCER" : "PROXIMO";
}

/** Una fila tal como la muestra el monitor. */
export function filaDelMonitor(
  f: FilaVencimiento,
  responsable: Responsable,
  ahora: Date = new Date(),
): FilaMonitor {
  const hoy = hoyEnArgentina(ahora);
  const dias = diasEntre(hoy, f.fechaVencimiento);
  const faltaPago = f.estado === "PRESENTADO" && f.accion !== "PRESENTACION" && !f.fechaPago;
  let estadoMostrado = estadoEfectivo(f, ahora);
  if (faltaPago && dias < 0) estadoMostrado = "VENCIDO";
  return { ...f, estadoMostrado, situacion: situacionDe(estadoMostrado, faltaPago, dias), diasRestantes: dias, faltaPago, responsable };
}

export interface Monitor {
  filas: FilaMonitor[];
  cuenta: Record<Situacion, number>;
}

/** Arma el monitor: estado calculado, responsable y orden (lo urgente arriba, por fecha). */
export function armarMonitor(
  filas: readonly FilaVencimiento[],
  opts: { tieneEstudio: boolean; responsables?: ReadonlyMap<string, Responsable>; ahora?: Date },
): Monitor {
  const ahora = opts.ahora ?? new Date();
  const out = filas.map((f) =>
    filaDelMonitor(f, opts.responsables?.get(f.obligacionId) ?? responsablePorDefecto(f.accion, opts.tieneEstudio), ahora),
  );
  const orden = (s: Situacion) => SITUACIONES.indexOf(s);
  out.sort(
    (a, b) =>
      orden(a.situacion) - orden(b.situacion) ||
      (a.situacion === "CUMPLIDO" ? b.fechaVencimiento.getTime() - a.fechaVencimiento.getTime() : a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime()) ||
      a.nombre.localeCompare(b.nombre, "es"),
  );
  const cuenta = Object.fromEntries(SITUACIONES.map((s) => [s, 0])) as Record<Situacion, number>;
  for (const f of out) cuenta[f.situacion]++;
  return { filas: out, cuenta };
}

const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** «lun 20/04/2026» de un DATE. */
export function fechaConDia(d: Date): string {
  const [a, m, dd] = diaIso(d).split("-");
  return `${DIAS_SEMANA[d.getUTCDay()]} ${dd}/${m}/${a}`;
}

/** «2026-03» → «03/2026»; «2026» queda; con cuota, «2026 · anticipo 2». */
export function periodoLegible(periodo: string, cuota: number): string {
  const p = /^\d{4}-\d{2}$/.test(periodo) ? `${periodo.slice(5)}/${periodo.slice(0, 4)}` : periodo;
  return cuota > 0 ? `${p} · anticipo ${cuota}` : p;
}

export function cuandoVence(dias: number): string {
  if (dias === 0) return "vence hoy";
  if (dias === 1) return "vence mañana";
  if (dias > 1) return `vence en ${dias} días`;
  return dias === -1 ? "venció ayer" : `venció hace ${-dias} días`;
}

/** Lo que hay que avisar: lo vencido, lo de hoy y lo que vence dentro de `anticipacion` días. */
export function avisosDelMonitor(m: Monitor, anticipacion = 3): FilaMonitor[] {
  return m.filas.filter(
    (f) => f.situacion === "VENCIDO" || f.situacion === "VENCE_HOY" || (f.situacion === "POR_VENCER" && f.diasRestantes <= anticipacion),
  );
}

/** Tope de renglones del aviso: con más, el enlace wa.me se vuelve tan largo que WhatsApp lo corta. */
export const RENGLONES_DEL_AVISO = 10;

const A_CARGO_DE: Record<Responsable, string> = { NEGOCIO: "a cargo del negocio", ESTUDIO: "a cargo del estudio contable" };

/** Texto del aviso, listo para WhatsApp o mail (sin importes: sólo qué, de qué período y cuándo). */
export function textoDelAviso(negocio: string, avisos: readonly FilaMonitor[]): string {
  if (avisos.length === 0) return "";
  const lineas = avisos.slice(0, RENGLONES_DEL_AVISO).map(
    (f) =>
      `• ${f.nombre} (${periodoLegible(f.periodo, f.cuota)}): ${cuandoVence(f.diasRestantes)}, ${fechaConDia(f.fechaVencimiento)}` +
      `${f.faltaPago ? " — falta el pago" : ""} · ${A_CARGO_DE[f.responsable]}`,
  );
  const resto = avisos.length - RENGLONES_DEL_AVISO;
  if (resto > 0) lineas.push(`y ${resto} más en Factoque.`);
  return [`Vencimientos de ${negocio} (Factoque):`, ...lineas].join("\n");
}

/** Enlace de WhatsApp (wa.me) con el texto armado; sin número, WhatsApp pregunta a quién mandarlo. */
export function enlaceWhatsApp(texto: string, telefono?: string | null): string {
  const numero = (telefono ?? "").replace(/\D/g, "");
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export function enlaceMail(asunto: string, texto: string, mail?: string | null): string {
  return `mailto:${encodeURIComponent(mail ?? "")}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`;
}

/**
 * Períodos a generar para ver los próximos vencimientos: el mes anterior (vence este mes), el mes en
 * curso (vence el que viene) y los años anterior y actual (anuales y anticipos).
 */
export function periodosParaGenerar(ahora: Date = new Date()): string[] {
  const [a, m] = diaIso(hoyEnArgentina(ahora)).split("-").map(Number);
  const mes = (anio: number, mm: number) => `${anio}-${String(mm).padStart(2, "0")}`;
  const anterior = m === 1 ? mes(a - 1, 12) : mes(a, m - 1);
  return [anterior, mes(a, m), String(a - 1), String(a)];
}
