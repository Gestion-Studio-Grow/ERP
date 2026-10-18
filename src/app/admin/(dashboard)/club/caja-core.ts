// ============================================================================
// LA CAJA DE 12 A 12 — el resumen del día de caja, el fondo, los movimientos, los egresos y el cierre. PURO.
// ============================================================================
//
// Pedido del club: «de 12 a 12 cerramos caja diaria». Lo cobrado antes de las 12 es de la caja del día anterior
// (`diaDeCaja`); una caja se cierra una sola vez, con lo contado contra lo esperado y la diferencia a la vista; lo
// que se cobra después del cierre entra en la caja siguiente (`cajaAbierta`). Si quedó una caja con movimientos
// sin cerrar (la de la mañana, la de ayer), la pantalla lo avisa y deja cerrarla
// (`cajasConMovimientosSinCerrar`). Los créditos del cliente no entran a la caja.
//
// Como en el club vanilla (app.mjs, `vistaCaja`, `egresoDialogo`, `cierreCajaDialogo`):
//   · el FONDO (el cambio del cajón) lo ajusta quien puede configurar —un dueño— (`ajustarFondo`);
//   · los MOVIMIENTOS del día de caja, todos, con hora, concepto, quién, medio, ingreso o egreso;
//   · el EGRESO y el CIERRE piden el PIN de quien opera, y lo valida el motor (`egresoCaja`, `cerrarCaja`: permiso +
//     PIN). La sesión del ERP es el puesto; el PIN es la persona (PARIDAD-REACT.md, «Login y PIN conviven»). El PIN
//     VIEJO de un dueño (`pinDesactualizado`: el de 2 del piloto, antes de elegir el de 4) no sirve para la caja.
//
// Las reglas son del motor; acá se arma lo que se ve y se traduce cada toque (caja-core.test.ts).

import { MEDIOS, ajustarFondo, cajaAbierta, cajaCerrada, cajasConMovimientosSinCerrar, cerrarCaja, diaDeCaja, egresoCaja, hhmm, pesos, pinDesactualizado, puede, resumenCaja, verificarFirma } from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub, Fecha } from "@/lib/club/motor.mjs";
import type { DesenlaceConPin } from "./tope-de-pin";
import { MEDIOS_CAJA } from "./cuenta-core";
import { leerMonto } from "./montos-core";

const ddmm = (f: Fecha) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;

/** De a cuántos movimientos se muestran (el resto, con «Ver más»). */
export const MOVIMIENTOS_POR_PAGINA = 40;

export interface MovimientoVisto {
  id: string;
  /** «19:40», o «16/10 11:20» si es de otra fecha (la mañana, antes del corte). */
  hora: string;
  concepto: string;
  /** Quién lo anotó (egresos), o "" si lo cobró el sistema. */
  quien: string;
  medio: string;
  monto: number;
  tipo: "ingreso" | "egreso";
}

/** El cierre de la caja de hoy: se puede cerrar, ya se cerró, o se cierra la siguiente (lo cobrado después). */
export type CierreDeHoy = { tipo: "abierta" } | { tipo: "siguiente"; dia: Fecha; texto: string } | { tipo: "cerrada"; texto: string };

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
  /** Los movimientos de esta caja, del más nuevo al más viejo (los primeros `cuantos`). */
  movimientos: MovimientoVisto[];
  /** Cuántos movimientos tiene la caja en total. */
  totalMovimientos: number;
  cierreDeHoy: CierreDeHoy;
  /** Cajas con movimientos que nadie cerró, distintas de la de hoy (para avisar en rojo y cerrarlas). */
  atrasadas: { dia: Fecha; texto: string; efectivoEsperado: number }[];
  /** Cierres hechos, del más nuevo al más viejo. */
  cierres: { dia: Fecha; texto: string; diferencia: number }[];
  firma: string;
}

export function armarCaja(estado: EstadoClub, ahora: Ahora, cuantos = MOVIMIENTOS_POR_PAGINA): VistaCaja {
  const dia = cajaAbierta(estado, ahora);
  const hoy = diaDeCaja(estado, ahora.fecha, ahora.min);
  const r = resumenCaja(estado, dia);
  const corte = hhmm(estado.config.corteCaja ?? 0);
  const siguiente = new Date(`${dia}T12:00:00Z`);
  siguiente.setUTCDate(siguiente.getUTCDate() + 1);
  const manana = siguiente.toISOString().slice(0, 10);
  const sinCerrar = cajasConMovimientosSinCerrar(estado);
  const atrasadas = sinCerrar
    .filter((d) => d !== dia)
    .map((d) => {
      const x = resumenCaja(estado, d);
      return { dia: d, texto: `La caja del ${ddmm(d)} quedó sin cerrar (${x.movimientos} movimientos).`, efectivoEsperado: x.efectivoEsperado };
    });
  // Como el vanilla: si la de hoy ya se cerró y lo cobrado después quedó en la siguiente, esa se puede cerrar igual.
  const cierreDeHoy: CierreDeHoy = !cajaCerrada(estado, hoy)
    ? { tipo: "abierta" }
    : sinCerrar.includes(dia)
      ? { tipo: "siguiente", dia, texto: `La caja de hoy ya se cerró. Lo cobrado después quedó en la caja del ${ddmm(dia)}: la podés cerrar igual.` }
      : { tipo: "cerrada", texto: `La caja de hoy ya está cerrada (se cierra una sola vez). Lo que se cobre desde ahora entra en la caja del ${ddmm(dia)}.` };
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
      .slice(0, Math.max(0, cuantos))
      .map(({ m }) => ({
        id: m.id,
        hora: `${m.fecha && m.fecha !== dia ? `${ddmm(m.fecha)} ` : ""}${m.min != null ? hhmm(m.min) : ""}`.trim(),
        concepto: m.concepto,
        quien: m.usuario ?? "",
        medio: MEDIOS[m.medio],
        monto: m.monto,
        tipo: m.tipo,
      })),
    totalMovimientos: r.movimientos,
    cierreDeHoy,
    atrasadas,
    cierres: estado.caja.cierres
      .slice()
      .reverse()
      .map((c) => ({
        dia: c.dia,
        texto: `${ddmm(c.dia)} · cerró ${c.responsable}${c.min != null ? ` a las ${hhmm(c.min)}` : ""} · esperado ${pesos(c.esperado)} · contado ${pesos(c.contado)}`,
        diferencia: c.diferencia,
      })),
  };
  return { ...vista, firma: JSON.stringify(vista) };
}

/** ¿Quien opera puede ajustar el fondo? (El permiso `configurar`: los dueños.) */
export function puedeAjustarFondo(estado: EstadoClub, usuarioId: string | undefined): boolean {
  return !!usuarioId && puede(estado, usuarioId, "configurar");
}

/**
 * Los PIN de ejemplo de la demo, rotulados («Rober 11 · Majo 22 · …»), como el «¿Probando la demo?» del vanilla.
 * SÓLO para la demo: en la jornada real la pantalla no los muestra nunca.
 */
export function pinesDeEjemplo(estado: EstadoClub): string {
  return estado.usuarios
    .filter((u) => u.activo !== false && u.pin)
    .map((u) => `${u.nombre.split(" ")[0]} ${u.pin}`)
    .join(" · ");
}

export type AccionCaja =
  | { tipo: "egreso"; monto: string; concepto: string; pin: string }
  | { tipo: "cerrar"; contado: string; dia: Fecha | null; pin: string }
  | { tipo: "fondo"; monto: string };

/** El monto que tipea la persona: la regla común del club (montos-core.ts). Se re-exporta para quien lo importa de acá. */
export { leerMonto };

/**
 * Egreso y cierre van con el PIN TIPEADO (no el que el puesto tenga guardado): quien opera es `auth.usuarioId`, y el
 * motor valida su permiso y su PIN. Sin PIN no se llama al motor.
 */
/** Un dueño que todavía tiene el PIN viejo de 2 no opera la caja con él. */
export const PIN_VIEJO_CAJA = "Ese es tu PIN viejo. Para la caja, elegí tu PIN nuevo de 4 dígitos: tocá «Cambiar de usuario» y entrá con el viejo una última vez.";

/**
 * `pin` dice qué pasó con el PIN tipeado, para el tope compartido del equipo (tope-de-pin.ts): "malo" si no es el de
 * quien opera (o es el viejo de un dueño), "bueno" si lo es (aunque después el motor diga que no por otra cosa), null
 * si no se llegó a mirar (el fondo, o sin PIN).
 */
export function ejecutarCaja(estado: EstadoClub, accion: AccionCaja, ahora: Ahora, auth: Auth): DesenlaceConPin {
  if (accion.tipo === "fondo") {
    const n = accion.monto.trim() === "" ? null : leerMonto(accion.monto);
    const res = ajustarFondo(estado, n, auth, ahora);
    return res.ok ? { ok: true, mensaje: `Fondo de caja: ${pesos(estado.caja.fondo)}.`, pin: null } : { ok: false, mensaje: res.motivo, pin: null };
  }
  const pin = accion.pin.trim();
  if (!pin) return { ok: false, mensaje: accion.tipo === "egreso" ? "Poné tu PIN: el egreso queda a tu nombre." : "Poné tu PIN: el cierre de caja queda a tu nombre.", pin: null };
  // Sin quién opera (o sin acceso) no hay PIN que evaluar: lo dice el motor y no cuenta como intento.
  const quien = auth.usuarioId ?? "";
  const activo = estado.usuarios.some((u) => u.id === quien && u.activo !== false);
  let resultado: DesenlaceConPin["pin"] = null;
  let duenio = false;
  if (activo) {
    if (pinDesactualizado(estado, quien)) return { ok: false, mensaje: PIN_VIEJO_CAJA, pin: "malo" };
    const v = verificarFirma(estado, quien, pin);
    if (!v.ok) return { ok: false, mensaje: v.motivo, pin: "malo" };
    resultado = "bueno";
    duenio = v.usuario.rol === "duenio";
  }
  if (accion.tipo === "egreso") {
    const monto = leerMonto(accion.monto);
    const res = egresoCaja(estado, { monto, concepto: accion.concepto, usuarioId: auth.usuarioId, pin }, ahora);
    return res.ok ? { ok: true, mensaje: `Egreso de ${pesos(monto)} (${accion.concepto.trim()}) anotado: sale del efectivo del cajón.`, pin: resultado, duenio } : { ok: false, mensaje: res.motivo, pin: resultado, duenio };
  }
  const contado = accion.contado.trim() === "" ? null : leerMonto(accion.contado);
  const res = cerrarCaja(estado, { contado, usuarioId: auth.usuarioId, pin, dia: accion.dia }, ahora);
  if (!res.ok) return { ok: false, mensaje: res.motivo, pin: resultado, duenio };
  const d = res.cierre.diferencia;
  const dif = d === 0 ? "la caja cuadra" : d > 0 ? `sobran ${pesos(d)}` : `faltan ${pesos(-d)}`;
  return { ok: true, mensaje: `Caja del ${ddmm(res.cierre.dia)} cerrada: ${dif}.`, pin: resultado, duenio };
}
