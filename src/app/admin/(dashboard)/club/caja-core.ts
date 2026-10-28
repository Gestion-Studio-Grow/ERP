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
// Tanda B4: el cierre POR TURNO a ciegas (`armarTurno` no trae ningún importe esperado del turno abierto; `contarTurno`
// sella y recién ahí se ve), la firma de caja con PIN de 4 (D-16, provisional, `config.caja.largoPinFirma`) para cerrar
// el turno, el día, retirar a caja fuerte y anotar un egreso por categoría, y «Corregir medio» de un cobro del turno
// abierto. Sin internet sólo va contar y firmar un turno en efectivo (`cajaVaSinInternet`).
//
// Las reglas son del motor; acá se arma lo que se ve y se traduce cada toque (caja-core.test.ts).

import {
  pinDeEjemplo, MEDIOS, CATEGORIAS_EGRESO_CAJA, DENOMINACIONES, MEDIOS_CORREGIBLES, ajustarFondo, cajaAbierta, cajaCerrada, cajasConMovimientosSinCerrar, cerrarCaja, cerrarDiaCaja, cerrarTurnoCaja,
  contarTurnoCaja, corregirMedio, diaDeCaja, egresoCaja, egresoPorCategoria, hhmm, largoFirmaCaja, largoPin, pesos, pinDesactualizado, puede, resumenCaja, retiroCajaFuerte, turnoDeCajaAbierto,
  turnosDelDia, verificarFirma,
} from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub, EventoTurnoCerrado, Fecha, Sello } from "@/lib/club/motor.mjs";
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
  /** La clave del medio (para «Corregir medio»). */
  medioClave: string;
  /** Tanda B4: un cobro del turno abierto entre efectivo, MP y transferencia se puede corregir. */
  corregible: boolean;
  /** El rastro de las correcciones: «Efectivo → Mercado Pago · Caro 19:40 · se equivocó de botón». */
  rastro: string[];
  /** B4-C1: es del turno abierto (todavía no se contó): su importe va a ciegas para quien no firma (`movimientosALaVista`). */
  delTurnoAbierto: boolean;
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
  atrasadas: { dia: Fecha; texto: string; efectivoEsperado: number; porTurnos: boolean }[];
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
      // Un día que ya se trabaja por turnos se cierra contando su turno abierto y consolidando (`armarTurno` con el día).
      return { dia: d, texto: `La caja del ${ddmm(d)} quedó sin cerrar (${x.movimientos} movimientos).`, efectivoEsperado: x.efectivoEsperado, porTurnos: turnosDelDia(estado, d).length > 0 };
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
        medioClave: m.medio,
        corregible: m.tipo === "ingreso" && !m.turno && !cajaCerrada(estado, dia) && (MEDIOS_CORREGIBLES as readonly string[]).includes(m.medio),
        rastro: (m.correcciones ?? []).map((c) => `${MEDIOS[c.de as keyof typeof MEDIOS] ?? c.de} → ${MEDIOS[c.a as keyof typeof MEDIOS] ?? c.a} · ${c.quien}${c.min != null ? ` ${hhmm(c.min)}` : ""} · ${c.motivo}`),
        delTurnoAbierto: !m.turno && !cajaCerrada(estado, dia),
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
 * B4-C1, arqueo a ciegas: ¿quien opera puede FIRMAR el cierre de caja? Tiene el permiso `cerrarCaja` y su rol usa un PIN
 * del largo de firma (D-16, `largoFirmaCaja`). Con el largo provisional de 4, recepción (PIN de 2) opera pero no firma.
 */
export function puedeFirmarCierres(estado: EstadoClub, usuarioId: string | undefined): boolean {
  if (!usuarioId || !puede(estado, usuarioId, "cerrarCaja")) return false;
  const u = estado.usuarios.find((x) => x.id === usuarioId);
  return !!u && largoPin(u.rol) >= largoFirmaCaja(estado);
}

/** Un movimiento como se ve: `monto` null = a ciegas (se muestran hora, concepto y medio, nunca el importe). */
export type MovimientoALaVista = Omit<MovimientoVisto, "monto"> & { monto: number | null };

/**
 * B4-C1: la lista de movimientos sin los importes del turno abierto para quien no firma cierres. Si no, sumando la lista
 * se sacaría el esperado que la tarjeta ya le oculta. Los movimientos de turnos ya contados (o de una caja cerrada)
 * van con su importe: ese esperado ya se vio al contar. PURA.
 */
export function movimientosALaVista(movimientos: readonly MovimientoVisto[], veImportes: boolean): MovimientoALaVista[] {
  return movimientos.map((m) => (veImportes || !m.delTurnoAbierto ? m : { ...m, monto: null }));
}

/**
 * Los PIN de ejemplo de la demo, rotulados («Rober 11 · Majo 22 · …»), como el «¿Probando la demo?» del vanilla.
 * SÓLO para la demo: en la jornada real la pantalla no los muestra nunca.
 */
export function pinesDeEjemplo(estado: EstadoClub): string {
  return estado.usuarios
    .filter((u) => u.activo !== false && u.pin)
    .map((u) => `${u.nombre.split(" ")[0]} ${pinDeEjemplo(u)}`)
    .join(" · ");
}

// ── Tanda B4: el turno de caja (cierre a ciegas, firma, retiro, egreso por categoría, cierre del día) ─────────────

/** Los medios que se cuentan en el cierre del turno, en orden. */
export const MEDIOS_DEL_TURNO = MEDIOS_CAJA;
/** Las denominaciones que se cuentan billete por billete (el motor las valida). */
export const BILLETES: readonly number[] = DENOMINACIONES;
export const CATEGORIAS_EGRESO = CATEGORIAS_EGRESO_CAJA;

const hora = (s: Sello | null | undefined, dia: Fecha) => (s?.min != null ? `${s.fecha && s.fecha !== dia ? `${ddmm(s.fecha)} ` : ""}${hhmm(s.min)}` : "");

/** Una línea de «esperado / contado / diferencia» (sólo se muestra DESPUÉS de confirmar el conteo). */
export interface LineaDelArqueo {
  medio: string;
  clave: string;
  esperado: number;
  contado: number;
  diferencia: number;
}

/** El turno contado que espera su firma: acá recién se ve lo esperado. */
export interface TurnoParaFirmar {
  turnoId: string;
  numero: number;
  responsable: string;
  desdeHasta: string;
  lineas: LineaDelArqueo[];
  diferencia: number;
  /** Hay diferencia en algún medio: el motivo es obligatorio. */
  pideMotivo: boolean;
  billetes: { denominacion: string; cantidad: number }[];
  /** Los medios con movimientos (va en la acción: sin internet decide si se puede firmar). */
  medios: string[];
}

export interface VistaTurno {
  dia: Fecha;
  numero: number;
  /** «desde las 12:00» (o la hora en que cerró el turno anterior). */
  desde: string;
  /** Cuántos movimientos tiene el turno abierto (NO cuánto suman: el conteo es a ciegas). */
  movimientos: number;
  /** La huella de QUÉ movimientos tiene el turno abierto (sus ids): el conteo se aplica sólo a ese turno. */
  huella: string;
  /** Los medios que tuvieron movimientos (para saber qué contar y si va sin internet). */
  medios: string[];
  /** El turno contado que espera la firma (lo esperado recién se ve acá). */
  paraFirmar: TurnoParaFirmar | null;
  /** Los turnos del día, contados o firmados, del primero al último. */
  turnos: { numero: number; texto: string; diferencia: number; motivo: string; firmado: boolean }[];
  /** Se puede cerrar el día: hay turnos, todos firmados, y no queda un turno abierto con movimientos. */
  puedeCerrarDia: boolean;
  /** Largo del PIN que firma (D-16). */
  largoFirma: number;
  firma: string;
}

/** La huella de un conjunto de movimientos (FNV-1a de sus ids ordenados): corta, sin importes. */
export function huellaDeMovimientos(ids: readonly string[]): string {
  let h = 0x811c9dc5;
  for (const ch of [...ids].sort().join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${ids.length}-${h.toString(36)}`;
}

/**
 * El turno de caja para la pantalla, A CIEGAS: del turno abierto no sale ningún importe esperado. `diaElegido`: el de
 * una caja atrasada que se trabajó por turnos (si sigue abierta); si no, la caja abierta.
 */
export function armarTurno(estado: EstadoClub, ahora: Ahora, diaElegido: Fecha | null = null): VistaTurno {
  const dia = diaElegido && !cajaCerrada(estado, diaElegido) ? diaElegido : cajaAbierta(estado, ahora);
  const t = turnoDeCajaAbierto(estado, dia);
  const delDia = turnosDelDia(estado, dia);
  const p = t.pendienteDeFirma;
  const paraFirmar: TurnoParaFirmar | null = p
    ? {
        turnoId: p.id,
        numero: p.numero,
        responsable: p.responsable,
        desdeHasta: `de ${hora(p.desde, dia)} a ${hora(p.hasta, dia)}`,
        lineas: MEDIOS_DEL_TURNO.map((k) => ({ medio: MEDIOS[k], clave: k, esperado: p.esperado[k], contado: p.contado[k], diferencia: p.diferencias[k] })),
        diferencia: p.diferencia,
        pideMotivo: Object.values(p.diferencias).some((x) => x !== 0),
        billetes: Object.entries(p.billetes ?? {}).map(([denominacion, cantidad]) => ({ denominacion, cantidad })),
        medios: mediosDelTurnoContado(estado, p.id),
      }
    : null;
  const vista: Omit<VistaTurno, "firma"> = {
    dia,
    numero: t.numero,
    desde: hora(t.desde, dia),
    movimientos: t.movimientos.length,
    huella: huellaDeMovimientos(t.movimientos.map((m) => m.id)),
    medios: t.medios,
    paraFirmar,
    turnos: delDia.map((x) => ({
      numero: x.numero,
      texto: `Turno ${x.numero} · ${x.responsable} · ${hora(x.desde, dia)} a ${hora(x.hasta, dia)}${x.firma ? ` · firmó ${x.firma}` : " · falta firmar"}`,
      diferencia: x.diferencia,
      motivo: x.motivo ?? "",
      firmado: x.estado === "cerrado",
    })),
    puedeCerrarDia: delDia.length > 0 && delDia.every((x) => x.estado === "cerrado") && t.movimientos.length === 0 && !cajaCerrada(estado, dia),
    largoFirma: largoFirmaCaja(estado),
  };
  return { ...vista, firma: JSON.stringify(vista) };
}

/** Los medios con movimientos de un turno ya contado (lo que dice si su firma va sin internet). */
function mediosDelTurnoContado(estado: EstadoClub, turnoId: string): string[] {
  return MEDIOS_DEL_TURNO.filter((k) => estado.caja.movimientos.some((m) => m.turno === turnoId && m.medio === k));
}

/** Quiénes pueden firmar la caja: los usuarios activos con PIN y permiso de cierre (primero los dueños). */
export function firmantes(estado: EstadoClub): { id: string; nombre: string; duenio: boolean }[] {
  return estado.usuarios
    .filter((u) => u.activo !== false && u.pin && puede(estado, u.id, "cerrarCaja"))
    .map((u) => ({ id: u.id, nombre: u.nombre, duenio: u.rol === "duenio" }))
    .sort((a, b) => Number(b.duenio) - Number(a.duenio));
}

export type AccionCaja =
  | { tipo: "egreso"; monto: string; concepto: string; pin: string }
  /** Cierre de una caja SIN turnos (vieja o atrasada): firma de caja (D-16); `firmaId` vacío = quien opera. */
  | { tipo: "cerrar"; contado: string; dia: Fecha | null; pin: string; firmaId?: string | null }
  | { tipo: "fondo"; monto: string }
  /** Paso 1 del cierre del turno, A CIEGAS (sin PIN de firma): lo contado por medio y los billetes por denominación. */
  | { tipo: "contarTurno"; dia: Fecha | null; contado: Partial<Record<string, string>>; billetes: Record<string, string>; movimientos: number; medios: string[]; numero: number; huella: string }
  /** Paso 2: firma (PIN de firma) y motivo si no cuadró. `medios`: los del turno (sin internet, sólo efectivo). */
  | { tipo: "cerrarTurno"; turnoId: string; motivo: string; firmaId: string | null; pin: string; medios: string[] }
  | { tipo: "corregirMedio"; movimientoId: string; medio: string; motivo: string }
  | { tipo: "retiro"; monto: string; comprobante: string; firmaId: string | null; pin: string }
  | { tipo: "egresoCategoria"; monto: string; categoria: string; concepto: string; comprobante: string; firmaId: string | null; pin: string }
  | { tipo: "cerrarDia"; dia: Fecha | null; firmaId: string | null; pin: string };

/** Lo que piden firma de caja (PIN de firma, D-16). */
const CON_FIRMA = new Set<AccionCaja["tipo"]>(["cerrarTurno", "retiro", "egresoCategoria", "cerrarDia"]);

/** Sin internet, lo único que va de la caja es contar y firmar un turno que sólo tuvo efectivo (C7). */
export function cajaVaSinInternet(a: AccionCaja): boolean {
  if (a.tipo === "contarTurno") return a.medios.every((m) => m === "efectivo") && MEDIOS_DEL_TURNO.every((k) => k === "efectivo" || !String(a.contado[k] ?? "").trim() || leerMonto(String(a.contado[k])) === 0);
  if (a.tipo === "cerrarTurno") return a.medios.every((m) => m === "efectivo");
  return false;
}

/** El monto que tipea la persona: la regla común del club (montos-core.ts). Se re-exporta para quien lo importa de acá. */
export { leerMonto };

/**
 * Egreso y cierre van con el PIN TIPEADO (no el que el puesto tenga guardado): quien opera es `auth.usuarioId`, y el
 * motor valida su permiso y su PIN. Sin PIN no se llama al motor.
 */
/** Un dueño que todavía tiene el PIN viejo de 2 no opera la caja con él. */
export const PIN_VIEJO_CAJA = "Ese es tu PIN viejo. Para la caja, elegí tu PIN nuevo de 4 dígitos: tocá «Cambiar de usuario» y entrá con el viejo una última vez.";

/** Lo que devuelve la caja: el desenlace del PIN y, al firmar un turno, el evento armado (`caja.turno.cerrada@1`). */
export type DesenlaceCaja = DesenlaceConPin & { evento?: EventoTurnoCerrado; turnoId?: string };

const leerOpcional = (x: string) => (x.trim() === "" ? null : leerMonto(x));

/** Las acciones del turno que no llevan PIN (contar y corregir medio): opera quien está en el puesto. */
function sinFirma(estado: EstadoClub, accion: AccionCaja, ahora: Ahora, auth: Auth): DesenlaceCaja | null {
  if (accion.tipo === "contarTurno") {
    // Lo contado es de UN turno: si al re-aplicarse (sin internet, otro puesto) el turno abierto ya es otro —otro número
    // u otros movimientos, aunque sean la misma cantidad y los mismos medios—, se vuelve a contar.
    // Sin número ni huella (un comando armado a mano o de antes del arreglo de F3) no hay cómo saber de qué turno es:
    // no se aplica con la regla vieja (cantidad + medios), se vuelve a contar. Ningún puesto en producción mandó nunca
    // un `contarTurno` sin ellos: la caja por turnos todavía no llegó a `main`.
    if (!Number.isInteger(accion.numero) || typeof accion.huella !== "string" || !accion.huella)
      return { ok: false, mensaje: "Este conteo no dice de qué turno es: volvé a contar.", pin: null };
    const diaDelConteo = accion.dia && !cajaCerrada(estado, accion.dia) ? accion.dia : accion.dia ? null : cajaAbierta(estado, ahora);
    if (diaDelConteo) {
      const t = turnoDeCajaAbierto(estado, diaDelConteo);
      const otro = accion.numero !== t.numero || accion.huella !== huellaDeMovimientos(t.movimientos.map((m) => m.id));
      if (otro && !t.pendienteDeFirma) return { ok: false, mensaje: "Mientras contabas cambió la caja (se cerró ese turno o entró otro cobro): volvé a contar.", pin: null };
    }
    const contado = Object.fromEntries(Object.entries(accion.contado).map(([k, v]) => [k, v == null ? null : leerOpcional(v)]));
    const billetes = Object.fromEntries(Object.entries(accion.billetes).filter(([, v]) => String(v).trim() !== "").map(([k, v]) => [k, k === "monedas" ? leerMonto(String(v)) : Number(String(v).trim())]));
    const res = contarTurnoCaja(estado, { dia: accion.dia, contado, billetes, usuarioId: auth.usuarioId, esperados: { movimientos: accion.movimientos, medios: accion.medios as never } }, ahora);
    if (!res.ok) return { ok: false, mensaje: res.motivo, pin: null };
    const d = res.turno.diferencia;
    return { ok: true, mensaje: `Turno ${res.turno.numero} contado. ${d === 0 ? "Cuadra" : d > 0 ? `Sobran ${pesos(d)}` : `Faltan ${pesos(-d)}`}: ${d === 0 ? "falta la firma" : "escribí el motivo y firmá"}.`, pin: null, turnoId: res.turno.id };
  }
  if (accion.tipo === "corregirMedio") {
    const res = corregirMedio(estado, accion.movimientoId, { medio: accion.medio, motivo: accion.motivo, usuarioId: auth.usuarioId }, ahora);
    return res.ok ? { ok: true, mensaje: `Cobro corregido a ${MEDIOS[res.movimiento.medio]}: queda el rastro.`, pin: null } : { ok: false, mensaje: res.motivo, pin: null };
  }
  return null;
}

/**
 * `pin` dice qué pasó con el PIN tipeado, para el tope compartido del equipo (tope-de-pin.ts): "malo" si no es el de
 * quien opera (o es el viejo de un dueño), "bueno" si lo es (aunque después el motor diga que no por otra cosa), null
 * si no se llegó a mirar (el fondo, o sin PIN). En las acciones con firma de caja, el PIN es el de quien FIRMA
 * (`firmaId`, o quien opera).
 */
export function ejecutarCaja(estado: EstadoClub, accion: AccionCaja, ahora: Ahora, auth: Auth): DesenlaceCaja {
  if (accion.tipo === "fondo") {
    const n = accion.monto.trim() === "" ? null : leerMonto(accion.monto);
    const res = ajustarFondo(estado, n, auth, ahora);
    return res.ok ? { ok: true, mensaje: `Fondo de caja: ${pesos(estado.caja.fondo)}.`, pin: null } : { ok: false, mensaje: res.motivo, pin: null };
  }
  const libre = sinFirma(estado, accion, ahora, auth);
  if (libre) return libre;
  if (accion.tipo === "contarTurno" || accion.tipo === "corregirMedio") return { ok: false, mensaje: "No se pudo hacer.", pin: null };
  const pin = accion.pin.trim();
  if (!pin) {
    const que = accion.tipo === "egreso" || accion.tipo === "egresoCategoria" ? "el egreso" : accion.tipo === "retiro" ? "el retiro" : "el cierre de caja";
    return { ok: false, mensaje: CON_FIRMA.has(accion.tipo) ? `Falta la firma: PIN de ${largoFirmaCaja(estado)} dígitos de quien firma ${que}.` : `Poné tu PIN: ${que} queda a tu nombre.`, pin: null };
  }
  // Sin quién opera (o sin acceso) no hay PIN que evaluar: lo dice el motor y no cuenta como intento.
  // El egreso viejo no lleva firmaId: lo firma quien opera. Si llegara uno (petición armada a mano), se ignora, así no
  // se esquiva el chequeo de largo de firma apuntando a alguien que no existe o está de baja (D-16, B4-C4).
  const firmaId = accion.tipo !== "egreso" && "firmaId" in accion && accion.firmaId ? accion.firmaId : null;
  const quien = firmaId ?? auth.usuarioId ?? "";
  const activo = estado.usuarios.some((u) => u.id === quien && u.activo !== false);
  let resultado: DesenlaceConPin["pin"] = null;
  let duenio = false;
  let largoDelRol = 0;
  if (activo) {
    if (pinDesactualizado(estado, quien)) return { ok: false, mensaje: PIN_VIEJO_CAJA, pin: "malo" };
    const v = verificarFirma(estado, quien, pin);
    if (!v.ok) return { ok: false, mensaje: v.motivo, pin: "malo" };
    resultado = "bueno";
    duenio = v.usuario.rol === "duenio";
    largoDelRol = largoPin(v.usuario.rol);
  }
  const fallo = (motivo: string): DesenlaceCaja => ({ ok: false, mensaje: motivo, pin: resultado, duenio });
  const firma = { usuarioId: auth.usuarioId, firmaId, pin };
  // El egreso viejo y el cierre de una caja sin turnos también los FIRMA un PIN de firma (D-16, B4-C4): con el de 2 de
  // recepción se opera pero no se firma. (Las demás firmas las valida el motor con `firmarCaja`.)
  // Un firmaId que no es de alguien activo no firma: sin esto, el cierre viejo se salteaba el chequeo de largo.
  if (accion.tipo === "cerrar" && firmaId && !activo) return fallo("Quien firma no está activo en el club: que firme un dueño.");
  // Y firma por ROL, no por el largo del PIN que llega (CERT-B4 v5, F6): recepción con un PIN propio de 4 no firma.
  if ((accion.tipo === "egreso" || accion.tipo === "cerrar") && activo && (largoDelRol < largoFirmaCaja(estado) || pin.length < largoFirmaCaja(estado)))
    return fallo(`Esto lo firma un PIN de ${largoFirmaCaja(estado)} dígitos: con el PIN de ${Math.min(largoDelRol, pin.length)} se opera pero no se firma. Que firme un dueño.`);
  switch (accion.tipo) {
    case "egreso": {
      const monto = leerMonto(accion.monto);
      const res = egresoCaja(estado, { monto, concepto: accion.concepto, usuarioId: auth.usuarioId, pin }, ahora);
      return res.ok ? { ok: true, mensaje: `Egreso de ${pesos(monto)} (${accion.concepto.trim()}) anotado: sale del efectivo del cajón.`, pin: resultado, duenio } : fallo(res.motivo);
    }
    case "cerrar": {
      const contado = accion.contado.trim() === "" ? null : leerMonto(accion.contado);
      // Firma quien firma (`firmaId`) o quien opera: el motor le valida permiso y PIN, y queda como responsable.
      const res = cerrarCaja(estado, { contado, usuarioId: quien || auth.usuarioId, pin, dia: accion.dia }, ahora);
      if (!res.ok) return fallo(res.motivo);
      const d = res.cierre.diferencia;
      const dif = d === 0 ? "la caja cuadra" : d > 0 ? `sobran ${pesos(d)}` : `faltan ${pesos(-d)}`;
      return { ok: true, mensaje: `Caja del ${ddmm(res.cierre.dia)} cerrada: ${dif}.`, pin: resultado, duenio };
    }
    case "cerrarTurno": {
      // Lo que se firma tiene que ser lo que se vio: con otros medios (re-aplicado en otra base), no.
      const medios = mediosDelTurnoContado(estado, accion.turnoId);
      if ([...medios].sort().join() !== [...accion.medios].sort().join()) return fallo("El turno cambió desde que lo contaste: abrí el cierre de nuevo.");
      const res = cerrarTurnoCaja(estado, { turnoId: accion.turnoId, motivo: accion.motivo, ...firma }, ahora);
      if (!res.ok) return fallo(res.motivo);
      const d = res.turno.diferencia;
      return { ok: true, mensaje: `Turno ${res.turno.numero} cerrado por ${res.turno.responsable}, firmó ${res.turno.firma}: ${d === 0 ? "cuadra" : d > 0 ? `sobran ${pesos(d)}` : `faltan ${pesos(-d)}`}.`, pin: resultado, duenio, evento: res.evento, turnoId: res.turno.id };
    }
    case "retiro": {
      const monto = leerMonto(accion.monto);
      const res = retiroCajaFuerte(estado, { monto, comprobante: accion.comprobante, ...firma }, ahora);
      return res.ok ? { ok: true, mensaje: `Retiro a caja fuerte de ${pesos(monto)} anotado (firmó ${res.movimiento.firma}).`, pin: resultado, duenio } : fallo(res.motivo);
    }
    case "egresoCategoria": {
      const monto = leerMonto(accion.monto);
      const res = egresoPorCategoria(estado, { monto, categoria: accion.categoria, concepto: accion.concepto, comprobante: accion.comprobante, ...firma }, ahora);
      return res.ok ? { ok: true, mensaje: `Egreso de ${pesos(monto)} (${res.movimiento.concepto}) anotado: sale del efectivo del cajón.`, pin: resultado, duenio } : fallo(res.motivo);
    }
    case "cerrarDia": {
      const res = cerrarDiaCaja(estado, { dia: accion.dia, ...firma }, ahora);
      if (!res.ok) return fallo(res.motivo);
      const d = res.cierre.diferencia;
      return { ok: true, mensaje: `Caja del ${ddmm(res.cierre.dia)} cerrada con ${res.cierre.turnos?.length ?? 0} turnos: ${d === 0 ? "cuadra" : d > 0 ? `sobran ${pesos(d)}` : `faltan ${pesos(-d)}`}.`, pin: resultado, duenio };
    }
  }
}
