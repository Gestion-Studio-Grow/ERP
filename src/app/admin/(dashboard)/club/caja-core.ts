// ============================================================================
// LA CAJA DE 12 A 12 — el resumen del día de caja, los egresos y el cierre. PURO.
// ============================================================================
//
// Pedido del club: «de 12 a 12 cerramos caja diaria». Lo cobrado antes de las 12 es de la caja del día anterior
// (`diaDeCaja`); una caja se cierra una sola vez, con lo contado contra lo esperado y la diferencia a la vista; lo
// que se cobra después del cierre entra en la caja siguiente (`cajaAbierta`). Si quedó una caja con movimientos
// sin cerrar (la de la mañana, la de ayer), la pantalla lo avisa y deja cerrarla
// (`cajasConMovimientosSinCerrar`). Los créditos del cliente no entran a la caja.
//
// Las reglas son del motor; acá se arma lo que se ve y se traduce cada toque (caja-core.test.ts).

import { MEDIOS, cajaAbierta, cajasConMovimientosSinCerrar, cerrarCaja, egresoCaja, hhmm, pesos, resumenCaja } from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub, Fecha } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { MEDIOS_CAJA } from "./cuenta-core";

const ddmm = (f: Fecha) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;

export interface VistaCaja {
  /** El día de caja donde entra lo que se cobra ahora. */
  dia: Fecha;
  /** «Caja del 17/10 (de 12:00 del 17/10 a 12:00 del 18/10)». */
  titulo: string;
  porMedio: { medio: string; monto: number }[];
  fondo: number;
  ingresos: number;
  egresos: number;
  efectivoEsperado: number;
  /** Los últimos movimientos, del más nuevo al más viejo. */
  movimientos: { id: string; hora: string; concepto: string; medio: string; monto: number; tipo: "ingreso" | "egreso" }[];
  /** Cajas con movimientos que nadie cerró, distintas de la de hoy (para avisar en rojo y cerrarlas). */
  atrasadas: { dia: Fecha; texto: string; efectivoEsperado: number }[];
  /** Cierres hechos, del más nuevo al más viejo. */
  cierres: { dia: Fecha; texto: string; diferencia: number }[];
  firma: string;
}

export function armarCaja(estado: EstadoClub, ahora: Ahora, ultimos = 12): VistaCaja {
  const dia = cajaAbierta(estado, ahora);
  const r = resumenCaja(estado, dia);
  const corte = hhmm(estado.config.corteCaja ?? 0);
  const siguiente = new Date(`${dia}T12:00:00Z`);
  siguiente.setUTCDate(siguiente.getUTCDate() + 1);
  const manana = siguiente.toISOString().slice(0, 10);
  const atrasadas = cajasConMovimientosSinCerrar(estado)
    .filter((d) => d !== dia)
    .map((d) => {
      const x = resumenCaja(estado, d);
      return { dia: d, texto: `La caja del ${ddmm(d)} quedó sin cerrar (${x.movimientos} movimientos).`, efectivoEsperado: x.efectivoEsperado };
    });
  const vista: Omit<VistaCaja, "firma"> = {
    dia,
    titulo: `Caja del ${ddmm(dia)} (de ${corte} del ${ddmm(dia)} a ${corte} del ${ddmm(manana)})`,
    porMedio: MEDIOS_CAJA.map((m) => ({ medio: MEDIOS[m], monto: r.porMedio[m] ?? 0 })),
    fondo: estado.caja.fondo,
    ingresos: r.ingresos,
    egresos: r.egresos,
    efectivoEsperado: r.efectivoEsperado,
    // Del más nuevo al más viejo por la hora en que pasó (la madrugada pasa de 1440), no por el orden de carga.
    movimientos: r.lista
      .map((m, i) => ({ m, i, t: `${m.fecha ?? ""}|${String(m.min ?? 0).padStart(5, "0")}` }))
      .sort((a, b) => (a.t === b.t ? b.i - a.i : a.t < b.t ? 1 : -1))
      .slice(0, ultimos)
      .map(({ m }) => m)
      .map((m) => ({ id: m.id, hora: m.min != null ? hhmm(m.min) : "", concepto: m.concepto, medio: MEDIOS[m.medio], monto: m.monto, tipo: m.tipo })),
    atrasadas,
    cierres: estado.caja.cierres
      .slice()
      .reverse()
      .map((c) => ({
        dia: c.dia,
        texto: `${ddmm(c.dia)} · cerró ${c.responsable} · esperado ${pesos(c.esperado)} · contado ${pesos(c.contado)}`,
        diferencia: c.diferencia,
      })),
  };
  return { ...vista, firma: JSON.stringify(vista) };
}

export type AccionCaja = { tipo: "egreso"; monto: string; concepto: string } | { tipo: "cerrar"; contado: string; dia: Fecha | null };

/** El monto que tipea la persona: «12.500», «12500», «$ 12.500» → 12500. Vacío o inválido → NaN. */
export function leerMonto(texto: string): number {
  const limpio = texto.replace(/[$\s.]/g, "").replace(",", ".");
  return limpio === "" ? Number.NaN : Math.round(Number(limpio));
}

export function ejecutarCaja(estado: EstadoClub, accion: AccionCaja, ahora: Ahora, auth: Auth): Desenlace {
  if (accion.tipo === "egreso") {
    const monto = leerMonto(accion.monto);
    const res = egresoCaja(estado, { monto, concepto: accion.concepto, usuarioId: auth.usuarioId, pin: auth.pin }, ahora);
    return res.ok ? { ok: true, mensaje: `Egreso de ${pesos(monto)} (${accion.concepto.trim()}) anotado: sale del efectivo del cajón.` } : { ok: false, mensaje: res.motivo };
  }
  const contado = accion.contado.trim() === "" ? null : leerMonto(accion.contado);
  const res = cerrarCaja(estado, { contado, usuarioId: auth.usuarioId, pin: auth.pin, dia: accion.dia }, ahora);
  if (!res.ok) return { ok: false, mensaje: res.motivo };
  const d = res.cierre.diferencia;
  const dif = d === 0 ? "la caja cuadra" : d > 0 ? `sobran ${pesos(d)}` : `faltan ${pesos(-d)}`;
  return { ok: true, mensaje: `Caja del ${ddmm(res.cierre.dia)} cerrada: ${dif}.` };
}
