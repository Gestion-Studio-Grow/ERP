// ============================================================================
// CIERRE DEL MES — la lista de control que deja el mes listo para el contador. PURO.
// ============================================================================
//
// Lo que la dueña hace el día 1 o 2 para que la contadora pueda trabajar el 3 sin pedir
// nada por WhatsApp: revisar ocho pasos, congelar el mes y bajar el paquete.
//
//   1. Días cerrados en la caja        5. Compras con proveedor
//   2. Comprobantes con CAE            6. Comisiones liquidadas
//   3. Anuladas con nota de crédito    7. Recuento de stock
//   4. Extracto del banco importado    8. Paquete para el contador
//
// Cada paso sale de datos que YA existen (sin migrar) y termina en uno de tres estados:
// listo, pendiente (con qué hacer y el botón) o no aplica (el negocio no usa eso: una
// estética no cuenta stock, una carnicería no liquida comisiones). "No aplica" cuenta como
// listo: no hay nada que hacer. El paso 1 nunca "no aplica" (ver abajo).
//
// CONGELAR. Igual que el cierre del día (frontera-cierre.ts), el mes se congela con una fila
// de AuditLog (`entity: "CierreMes"`, `entityId: "AAAA-MM"`), porque congelar un mes que
// cuadra no produce ningún movimiento y tiene que quedar escrito igual. Tres reglas:
//   · no se congela un mes que no terminó;
//   · no se congela con días sin cerrar en la caja (paso 1 BLOQUEA). Ésa es la garantía de
//     que, congelado el mes, un gasto con fecha 15/08 se rechace: el libro de caja ya
//     rechaza todo lo fechado en un día cerrado, y el mes congelado tiene cerrados todos sus
//     días. La frontera del día no retrocede nunca, así que reabrir el mes no reabre la caja;
//   · los demás pasos pendientes no bloquean (un rechazo de ARCA de hace 20 días no se
//     arregla en el cierre), pero congelar con pendientes exige confirmarlo, y la lista de
//     lo que quedó pendiente queda escrita en la fila.
// REABRIR sólo lo puede hacer la dueña o el dueño (OWNER), y con un motivo escrito: queda en
// la auditoría y lo ve la contadora.
//
// EL PAQUETE es el último paso: se da por hecho cuando alguien lo descargó DESPUÉS de
// congelar (antes, es un borrador que puede cambiar). Cada descarga queda en la auditoría con
// quién la bajó ("descargado por").
//
// Sin Prisma ni servidor: lo importan la página, el número del botón, la cartera del
// contador (que está en un client component) y los tests.

import type { Role } from "@/lib/capabilities";
import {
  bordesDelMes,
  diaLegible,
  etiquetaDelMes,
  mesDelNegocio,
  mesVecino,
  nombreDelMes,
  type MesKey,
} from "@/lib/libros/fecha-fiscal";

// ── La fila de auditoría ─────────────────────────────────────────────────────

/** Entidad de AuditLog del cierre del mes. Exenta de la purga igual que "CierreDiario" (pedido afuera). */
export const CIERRE_MES_ENTITY = "CierreMes";
export const ACCION_CONGELAR = "cierre-mes.congelar";
export const ACCION_REABRIR = "cierre-mes.reabrir";
export const ACCION_PAQUETE = "cierre-mes.paquete";
/** Las únicas acciones que cuentan. Una fila con otra acción (forjada o vieja) se ignora. */
export const ACCIONES_CIERRE_MES = [ACCION_CONGELAR, ACCION_REABRIR, ACCION_PAQUETE] as const;

/** Una fila de AuditLog del cierre del mes, como la lee cualquiera de los tres consumidores. */
export interface RegistroCierre {
  action: string;
  createdAt: Date;
  changes: unknown;
}

/** Lo que se guarda en `changes` de cada fila. */
export interface CambiosCierre {
  /** Quién, como se lee: "Ana" o "Juan Pérez (Estudio Norte)". */
  por: string;
  /** Congelar: cuántos pasos estaban listos (de 8) y cuáles quedaron pendientes. */
  listos?: number;
  pendientes?: string[];
  /** Reabrir: por qué. */
  motivo?: string;
  /** Paquete: si se bajó con el mes sin congelar. */
  borrador?: boolean;
}

// Las consultas de auditoría del cierre, como objetos planos (sin Prisma de valor): las usan
// la pantalla, el número del botón y la cartera del contador, que corre en la transacción de
// OTRO negocio. Todas filtran por las acciones del cierre: una fila con `entity: "CierreMes"`
// y otra acción no decide nada.

/** Todas las filas del cierre de un mes, de la más vieja a la más nueva. */
export function consultaAuditoriaCierre(tenantId: string, mes: MesKey) {
  return {
    where: { tenantId, entity: CIERRE_MES_ENTITY, entityId: mes, action: { in: [...ACCIONES_CIERRE_MES] } },
    orderBy: { createdAt: "asc" as const },
    select: { action: true, createdAt: true, changes: true },
    take: 200,
  };
}

/** La última vez que se congeló o se reabrió el mes (decide si está congelado). */
export function consultaUltimoEstadoCierre(tenantId: string, mes: MesKey) {
  return {
    where: { tenantId, entity: CIERRE_MES_ENTITY, entityId: mes, action: { in: [ACCION_CONGELAR, ACCION_REABRIR] } },
    orderBy: { createdAt: "desc" as const },
    select: { action: true, createdAt: true, changes: true },
  };
}

/** La última descarga del paquete del mes. */
export function consultaUltimaDescarga(tenantId: string, mes: MesKey) {
  return {
    where: { tenantId, entity: CIERRE_MES_ENTITY, entityId: mes, action: ACCION_PAQUETE },
    orderBy: { createdAt: "desc" as const },
    select: { action: true, createdAt: true, changes: true },
  };
}

function cambios(c: unknown): Partial<CambiosCierre> {
  return c && typeof c === "object" ? (c as Partial<CambiosCierre>) : {};
}

export interface EstadoCierreMes {
  congelado: boolean;
  congeladoEl: Date | null;
  congeladoPor: string | null;
  /** Pasos listos cuando se congeló (de 8, sin contar el paquete, que es posterior). */
  listosAlCongelar: number | null;
  reabiertoEl: Date | null;
  reabiertoPor: string | null;
  motivoReapertura: string | null;
  ultimaDescarga: { el: Date; por: string } | null;
  /** Hubo una descarga después de la última vez que se congeló. */
  descargadoDespuesDeCongelar: boolean;
}

/**
 * El estado del mes leyendo sus filas de auditoría EN ORDEN. La última acción de congelar o
 * reabrir manda; las descargas se anotan aparte. Filas con otra acción se ignoran. PURA.
 */
export function estadoDesdeAuditoria(filas: readonly RegistroCierre[]): EstadoCierreMes {
  const e: EstadoCierreMes = {
    congelado: false,
    congeladoEl: null,
    congeladoPor: null,
    listosAlCongelar: null,
    reabiertoEl: null,
    reabiertoPor: null,
    motivoReapertura: null,
    ultimaDescarga: null,
    descargadoDespuesDeCongelar: false,
  };
  const ordenadas = [...filas]
    .filter((f) => (ACCIONES_CIERRE_MES as readonly string[]).includes(f?.action) && f.createdAt instanceof Date)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const f of ordenadas) {
    const c = cambios(f.changes);
    const por = typeof c.por === "string" && c.por.trim() ? c.por.trim() : "alguien del negocio";
    if (f.action === ACCION_CONGELAR) {
      e.congelado = true;
      e.congeladoEl = f.createdAt;
      e.congeladoPor = por;
      e.listosAlCongelar = typeof c.listos === "number" ? c.listos : null;
      e.descargadoDespuesDeCongelar = false;
    } else if (f.action === ACCION_REABRIR) {
      e.congelado = false;
      e.reabiertoEl = f.createdAt;
      e.reabiertoPor = por;
      e.motivoReapertura = typeof c.motivo === "string" ? c.motivo : null;
      e.descargadoDespuesDeCongelar = false;
    } else {
      e.ultimaDescarga = { el: f.createdAt, por };
      if (e.congelado) e.descargadoDespuesDeCongelar = true;
    }
  }
  return e;
}

// ── Los ocho pasos ───────────────────────────────────────────────────────────

export type PasoId =
  | "dias-cerrados"
  | "comprobantes-con-cae"
  | "anuladas-con-nota-de-credito"
  | "extracto-importado"
  | "compras-con-proveedor"
  | "comisiones-liquidadas"
  | "recuento"
  | "paquete";

export const PASOS: readonly { id: PasoId; titulo: string }[] = [
  { id: "dias-cerrados", titulo: "Días cerrados en la caja" },
  { id: "comprobantes-con-cae", titulo: "Comprobantes con CAE" },
  { id: "anuladas-con-nota-de-credito", titulo: "Ventas anuladas con nota de crédito" },
  { id: "extracto-importado", titulo: "Extracto del banco importado" },
  { id: "compras-con-proveedor", titulo: "Compras con proveedor" },
  { id: "comisiones-liquidadas", titulo: "Comisiones liquidadas" },
  { id: "recuento", titulo: "Recuento de stock" },
  { id: "paquete", titulo: "Paquete para el contador" },
];

export const TOTAL_PASOS = PASOS.length;

export type EstadoPaso = "listo" | "pendiente" | "no-aplica";

export interface Paso {
  id: PasoId;
  titulo: string;
  estado: EstadoPaso;
  /** Lo que se encontró, con el número. */
  detalle: string;
  /** Qué hacer y dónde, si está pendiente y hay pantalla para hacerlo. */
  accion?: { texto: string; href: string };
  /** Pendiente que NO deja congelar (sólo los días sin cerrar). */
  bloquea: boolean;
}

/** Lo que se lee de la base para evaluar los pasos (lectura.ts). */
export interface HechosCierreMes {
  mes: MesKey;
  caja: { usaCaja: boolean; cerradoHasta: string | null };
  comprobantes: { total: number; sinCae: number; rechazados: number };
  anuladasConFactura: number;
  /** `null` = el negocio no importa extractos (o la tabla no está en esta base). */
  extracto: { movimientosDelMes: number; ultimaFecha: string | null } | null;
  compras: { total: number; sinProveedor: number };
  /**
   * `null` = el negocio no liquida comisiones. `pendientes`: lo que la liquidación puede
   * liquidar hoy; `esperanSaldo`: turnos con saldo por cobrar, que se liquidan después
   * (comisiones.ts).
   */
  comisiones: { pendientes: number; esperanSaldo: number } | null;
  /** `null` = el negocio no controla stock. */
  recuento: { recuentosDelMes: number } | null;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function paso(id: PasoId, estado: EstadoPaso, detalle: string, extra: Partial<Pick<Paso, "accion" | "bloquea">> = {}): Paso {
  const titulo = PASOS.find((p) => p.id === id)!.titulo;
  return { id, titulo, estado, detalle, bloquea: false, ...extra };
}

/** "20260828" → "28/08/2026". */
function fiscalLegible(aaaammdd: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(aaaammdd);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : aaaammdd;
}

/** Los ocho pasos del mes, en orden. PURA. */
export function evaluarPasos(h: HechosCierreMes, estado: EstadoCierreMes): Paso[] {
  const b = bordesDelMes(h.mes);
  const mes = nombreDelMes(h.mes);
  const ultimo = diaLegible(b.ultimoDia);
  const pasos: Paso[] = [];

  // 1. Días cerrados. SIEMPRE aplica y BLOQUEA: el cierre del día es lo único que hace que
  //    el libro de caja rechace algo fechado en el mes (frontera-cierre.ts), así que un mes
  //    congelado sin la caja cerrada hasta el último día seguiría aceptando un gasto del 15.
  //    Aun sin movimientos en el mes hay que cerrar el último día (con $0): es un clic, y es
  //    lo que después impide cargar algo con fecha de ese mes.
  const cerrarUltimo = { texto: `Cerrar la caja hasta el ${ultimo}`, href: `/admin/caja/cierre?dia=${b.ultimoDia}` };
  if (h.caja.cerradoHasta && h.caja.cerradoHasta >= b.ultimoDia) {
    pasos.push(paso("dias-cerrados", "listo", `La caja está cerrada hasta el ${diaLegible(h.caja.cerradoHasta)}.`));
  } else if (!h.caja.usaCaja && !h.caja.cerradoHasta) {
    pasos.push(
      paso(
        "dias-cerrados",
        "pendiente",
        `No hubo movimientos de caja hasta el ${ultimo}: cerrá igual ese día (con $0), así nada se puede cargar después con fecha de ${mes}.`,
        { accion: cerrarUltimo, bloquea: true },
      ),
    );
  } else {
    pasos.push(
      paso(
        "dias-cerrados",
        "pendiente",
        h.caja.cerradoHasta
          ? `La caja está cerrada hasta el ${diaLegible(h.caja.cerradoHasta)}: falta cerrar hasta el ${ultimo}.`
          : `Nunca se cerró un día en la caja: falta cerrar hasta el ${ultimo}.`,
        { accion: cerrarUltimo, bloquea: true },
      ),
    );
  }

  // 2. Comprobantes con CAE.
  const { total, sinCae, rechazados } = h.comprobantes;
  if (total === 0) {
    pasos.push(paso("comprobantes-con-cae", "no-aplica", `No hay comprobantes con fecha de ${mes}.`));
  } else if (sinCae > 0 || rechazados > 0) {
    const partes = [
      sinCae > 0 ? `${plural(sinCae, "comprobante sigue", "comprobantes siguen")} sin CAE` : null,
      rechazados > 0 ? `${plural(rechazados, "rechazado", "rechazados")} por ARCA (revisá que se hayan vuelto a emitir)` : null,
    ].filter(Boolean);
    pasos.push(
      paso("comprobantes-con-cae", "pendiente", `${partes.join(" · ")}.`, {
        accion: { texto: "Revisar en Facturación", href: "/admin/facturacion" },
      }),
    );
  } else {
    pasos.push(paso("comprobantes-con-cae", "listo", `${plural(total, "comprobante", "comprobantes")}, ${total === 1 ? "con" : "todos con"} CAE.`));
  }

  // 3. Ventas anuladas con factura: la nota de crédito se emite en ARCA, fuera del sistema, y
  //    el sistema no tiene dónde registrarla (el índice 1 comprobante por venta impide
  //    colgarla de la venta sin migrar). Por eso el paso no se apaga solo: se dice, y congelar
  //    con pendientes confirmados es la salida.
  if (h.anuladasConFactura > 0) {
    pasos.push(
      paso(
        "anuladas-con-nota-de-credito",
        "pendiente",
        `${plural(h.anuladasConFactura, "venta anulada tiene", "ventas anuladas tienen")} factura y ninguna nota de crédito: emitila en ARCA (Comprobantes en línea) y pasale el número a tu contador. El sistema todavía no registra notas de crédito: si ya la emitiste, este paso sigue pendiente y podés congelar confirmándolo.`,
        { accion: { texto: "Verlas en el Libro IVA", href: `/admin/libros?mes=${h.mes}` } },
      ),
    );
  } else if (total === 0) {
    pasos.push(paso("anuladas-con-nota-de-credito", "no-aplica", `Sin comprobantes en ${mes}, no hay nada que compensar.`));
  } else {
    pasos.push(paso("anuladas-con-nota-de-credito", "listo", "Ninguna venta anulada quedó con factura."));
  }

  // 4. Extracto del banco.
  if (!h.extracto) {
    pasos.push(paso("extracto-importado", "no-aplica", "Tu negocio no importa extractos del banco."));
  } else if (h.extracto.movimientosDelMes === 0) {
    pasos.push(
      paso("extracto-importado", "pendiente", `No hay movimientos de ${mes} importados.`, {
        accion: { texto: "Importar el extracto", href: "/admin/facturacion/bancos" },
      }),
    );
  } else {
    pasos.push(
      paso(
        "extracto-importado",
        "listo",
        h.extracto.ultimaFecha
          ? `El extracto importado llega hasta el ${fiscalLegible(h.extracto.ultimaFecha)}.`
          : `${plural(h.extracto.movimientosDelMes, "movimiento importado", "movimientos importados")}.`,
      ),
    );
  }

  // 5. Compras con proveedor (sin proveedor, la contadora no puede pedir la factura).
  if (h.compras.total === 0) {
    pasos.push(paso("compras-con-proveedor", "no-aplica", `No hubo compras en ${mes}.`));
  } else if (h.compras.sinProveedor > 0) {
    pasos.push(
      paso(
        "compras-con-proveedor",
        "pendiente",
        `${plural(h.compras.sinProveedor, "compra no tiene", "compras no tienen")} proveedor elegido de la lista: pasale a tu contador de quién son.`,
        { accion: { texto: "Ver las compras", href: "/admin/compras" } },
      ),
    );
  } else {
    pasos.push(paso("compras-con-proveedor", "listo", `${plural(h.compras.total, "compra", "compras")}, ${h.compras.total === 1 ? "con" : "todas con"} proveedor.`));
  }

  // 6. Comisiones. Pendiente es sólo lo que "Liquidar comisiones" puede resolver; los turnos
  //    con saldo por cobrar se dicen aparte y no dejan el paso pendiente: no es algo que se
  //    arregle liquidando, sino cobrando (y ahí entran en la liquidación siguiente).
  if (!h.comisiones) {
    pasos.push(paso("comisiones-liquidadas", "no-aplica", "Tu negocio no liquida comisiones."));
  } else {
    const { pendientes, esperanSaldo } = h.comisiones;
    const conSaldo =
      esperanSaldo > 0
        ? ` ${plural(esperanSaldo, "turno más tiene", "turnos más tienen")} saldo por cobrar: su comisión se liquida cuando se cobre.`
        : "";
    if (pendientes > 0) {
      pasos.push(
        paso("comisiones-liquidadas", "pendiente", `${plural(pendientes, "turno", "turnos")} de ${mes} con la comisión sin liquidar.${conSaldo}`, {
          accion: { texto: "Liquidar comisiones", href: "/admin/reportes" },
        }),
      );
    } else {
      pasos.push(paso("comisiones-liquidadas", "listo", `Las comisiones de ${mes} están liquidadas.${conSaldo}`));
    }
  }

  // 7. Recuento de stock.
  if (!h.recuento) {
    pasos.push(paso("recuento", "no-aplica", "Tu negocio no controla stock."));
  } else if (h.recuento.recuentosDelMes === 0) {
    pasos.push(
      paso("recuento", "pendiente", `No se contó el stock en ${mes}: el stock valorizado del paquete sale de lo que dice el sistema.`, {
        accion: { texto: "Hacer el recuento", href: "/admin/ajustes/recuento" },
      }),
    );
  } else {
    pasos.push(paso("recuento", "listo", `${plural(h.recuento.recuentosDelMes, "producto contado", "productos contados")} en ${mes}.`));
  }

  // 8. Paquete: después de congelar.
  if (!estado.congelado) {
    pasos.push(paso("paquete", "pendiente", "Se descarga con el mes congelado: ésa es la versión final para tu contador. Antes, es un borrador."));
  } else if (estado.descargadoDespuesDeCongelar && estado.ultimaDescarga) {
    pasos.push(
      paso("paquete", "listo", `Descargado por ${estado.ultimaDescarga.por} el ${fechaCorta(estado.ultimaDescarga.el)}.`),
    );
  } else {
    pasos.push(paso("paquete", "pendiente", "El mes está congelado: falta descargar el paquete (o que lo baje tu contador desde su cartera)."));
  }

  return pasos;
}

/**
 * Saca el botón de un paso cuando lleva a una app que este negocio no puede abrir, y lo dice:
 * un pendiente no puede terminar en "App no disponible" (p. ej. el paso 3 manda al Libro IVA,
 * que es del módulo `libros`, y un negocio puede facturar sin tenerlo). `appQueFalta(href)`
 * devuelve el nombre de la app si NO se puede abrir, o `null`; lo decide la página con la
 * misma regla del menú (`motivoNoDisponible`). PURA.
 */
export function sinCallejones(pasos: readonly Paso[], appQueFalta: (href: string) => string | null): Paso[] {
  return pasos.map((p) => {
    if (!p.accion) return p;
    const falta = appQueFalta(p.accion.href);
    if (!falta) return p;
    return { ...p, accion: undefined, detalle: `${p.detalle} (${falta} no está habilitada en tu negocio: pedísela a GSG si la necesitás.)` };
  });
}

/** "03/09" en hora argentina. */
export function fechaCorta(d: Date): string {
  const partes = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
  }).formatToParts(d);
  const dia = partes.find((p) => p.type === "day")?.value ?? "";
  const m = partes.find((p) => p.type === "month")?.value ?? "";
  return `${dia.padStart(2, "0")}/${m.padStart(2, "0")}`;
}

/** Cuántos pasos están hechos (listo o no aplica). PURA. */
export function pasosListos(pasos: readonly Paso[]): number {
  return pasos.filter((p) => p.estado !== "pendiente").length;
}

// ── Congelar y reabrir ───────────────────────────────────────────────────────

/** ¿El mes ya terminó (se puede cerrar)? Sólo meses anteriores al mes en curso. PURA. */
export function mesCerrable(mes: MesKey, hoy: Date): boolean {
  return mes < mesDelNegocio(hoy);
}

/** El mes que toca cerrar hoy: el anterior al mes en curso. */
export function mesParaCerrar(hoy: Date): MesKey {
  return mesVecino(mesDelNegocio(hoy), -1);
}

export type Validacion = { ok: true } | { ok: false; error: string };

/** ¿Se puede congelar? Días cerrados obligatorio; el resto, confirmado. PURA. */
export function validarCongelar(input: {
  mes: MesKey;
  hoy: Date;
  pasos: readonly Paso[];
  estado: EstadoCierreMes;
  confirmaPendientes: boolean;
}): Validacion {
  const etiqueta = etiquetaDelMes(input.mes);
  if (!mesCerrable(input.mes, input.hoy)) {
    return { ok: false, error: `${capitalizar(etiqueta)} todavía no terminó: se cierra desde el día 1 del mes siguiente.` };
  }
  if (input.estado.congelado) return { ok: false, error: `${capitalizar(etiqueta)} ya está congelado.` };
  const bloqueante = input.pasos.find((p) => p.bloquea && p.estado === "pendiente");
  if (bloqueante) {
    return {
      ok: false,
      error: `${bloqueante.detalle} Cerrá esos días en la caja antes de congelar: sin eso, congelar el mes no congela la plata.`,
    };
  }
  const pendientes = pendientesAntesDeCongelar(input.pasos);
  if (pendientes.length > 0 && !input.confirmaPendientes) {
    return {
      ok: false,
      error: `${pendientes.length === 1 ? "Queda" : "Quedan"} ${plural(pendientes.length, "paso pendiente", "pasos pendientes")}. Si igual querés congelar, marcá que lo confirmás: queda anotado cuáles eran.`,
    };
  }
  return { ok: true };
}

/** Los pendientes que cuentan al congelar (el paquete va después, no se cuenta). PURA. */
export function pendientesAntesDeCongelar(pasos: readonly Paso[]): Paso[] {
  return pasos.filter((p) => p.estado === "pendiente" && p.id !== "paquete");
}

/** Motivo mínimo para reabrir: una frase, no una letra. */
export const MOTIVO_MINIMO = 10;

/** ¿Se puede reabrir? Sólo OWNER y con motivo. PURA. */
export function validarReabrir(input: { mes: MesKey; estado: EstadoCierreMes; role: Role; motivo: string | null | undefined }): Validacion {
  const etiqueta = capitalizar(etiquetaDelMes(input.mes));
  if (input.role !== "OWNER") return { ok: false, error: "Sólo la dueña o el dueño puede reabrir un mes cerrado." };
  if (!input.estado.congelado) return { ok: false, error: `${etiqueta} no está congelado: no hay nada que reabrir.` };
  const motivo = String(input.motivo ?? "").trim();
  if (motivo.length < MOTIVO_MINIMO) {
    return { ok: false, error: "Escribí por qué lo reabrís (una frase): queda en la auditoría y lo ve tu contador." };
  }
  return { ok: true };
}

export function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── El número del botón y la cartera del contador ────────────────────────────

/**
 * Desde qué día del mes siguiente un mes sin congelar pasa a "Para atender hoy". La dueña
 * cierra el 1 o el 2 y la contadora trabaja desde el 3. PROVISIONAL A CONFIRMAR con la
 * contadora de MAGRA.
 */
export const DIA_AVISO_CIERRE = 3;

export type DatoCierre =
  | { valor: string; detalle: string; alerta?: { valor: string; texto: string } };

/**
 * El número del botón de Cierre del mes, desde las filas de auditoría del mes anterior (una
 * sola consulta). Los "N de 8 pasos" salen de la foto que se guardó al congelar: calcular
 * los ocho pasos son once consultas, y el botón tiene una. Antes de congelar dice
 * "sin congelar". PURA.
 */
export function datoCierreDelMes(filas: readonly RegistroCierre[], hoy: Date, diaDelMes: number): DatoCierre {
  const mes = mesParaCerrar(hoy);
  const valor = capitalizar(nombreDelMes(mes));
  const e = estadoDesdeAuditoria(filas);
  if (!e.congelado) {
    const dato: DatoCierre = { valor, detalle: "sin congelar: entrá para ver qué falta" };
    if (diaDelMes >= DIA_AVISO_CIERRE) dato.alerta = { valor, texto: "sin cerrar" };
    return dato;
  }
  const listos = e.listosAlCongelar != null ? Math.min(TOTAL_PASOS, e.listosAlCongelar + (e.descargadoDespuesDeCongelar ? 1 : 0)) : null;
  const partes = [listos != null ? `${listos} de ${TOTAL_PASOS} pasos listos` : "congelado"];
  partes.push(
    e.descargadoDespuesDeCongelar && e.ultimaDescarga
      ? `paquete descargado por ${e.ultimaDescarga.por} el ${fechaCorta(e.ultimaDescarga.el)}`
      : "falta descargar el paquete",
  );
  return { valor, detalle: partes.join(" · ") };
}

/** El cierre de UN cliente, como lo ve el estudio contable. */
export interface CierreMesCliente {
  mes: MesKey;
  congelado: boolean;
  congeladoEl: string | null; // ISO: cruza al client component
  paquete: { el: string; por: string } | null;
}

/** El resumen de cierre de un cliente para la cartera. PURA. */
export function cierreMesCliente(mes: MesKey, filas: readonly RegistroCierre[]): CierreMesCliente {
  const e = estadoDesdeAuditoria(filas);
  return {
    mes,
    congelado: e.congelado,
    congeladoEl: e.congeladoEl ? e.congeladoEl.toISOString() : null,
    paquete: e.ultimaDescarga ? { el: e.ultimaDescarga.el.toISOString(), por: e.ultimaDescarga.por } : null,
  };
}
