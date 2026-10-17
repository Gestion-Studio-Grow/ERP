// ============================================================================
// RESPALDOS DE EJEMPLO DEL CLUB — armados con el motor, sin un solo dato real.
// ============================================================================
//
// Dos estados para probar la persistencia del club (BP-3, docs/producto/PLAN-TERMINALES-MOSTRADOR.md):
//
//   · `armarDiaDeTorneo()`: un sábado de torneo en 4 canchas, con todo lo que pasa en una jornada de verdad —
//     seña del día anterior (cae en la caja de ayer: la caja corre de 12 a 12), cancha cobrada entera, por
//     jugador, con créditos (monedero, que NO entra a la caja), «cobrar la cancha y cerrarla · la mesa sigue»,
//     venta de mostrador, un egreso con PIN, el cierre de la caja del día y algo cobrado DESPUÉS del cierre (que
//     queda en la caja siguiente, sin cerrar), una mesa que sigue abierta y un turno de mañana.
//     De acá sale `respaldo-ejemplo.json` (pasado por el anonimizador, ver `scripts/club/anonimizar-respaldo.ts`).
//   · `armarMesCargado()`: lo que pesa la foto con un mes de club lleno (para medir y fijar la cadencia).
//
// Todo pasa por las funciones del motor (src/lib/club/motor.mjs): si una regla de plata cambia, el ejemplo sigue
// siendo lo que el motor hace de verdad. Es determinista (azar con semilla y contador de ids reiniciado): armarlo
// dos veces da el mismo texto.
//
// — Elaborado por GSG

/* eslint-disable @typescript-eslint/no-explicit-any -- el motor vanilla no tiene tipos (como motor-club.test.ts) */
import * as Motor from "../../../public/previews/breakpoint/club/motor.mjs";

const M: any = Motor;

type Ahora = { fecha: string; min: number };
type EstadoClub = any;
type FotoEstado = any;
type Medio = string;
type Reserva = any;

/** El sábado del ejemplo. */
export const HOY_TORNEO = "2026-10-17";
/** Cuándo se «guardó» el respaldo de ejemplo (ms epoch, fijo para que el archivo no cambie). */
export const GUARDADO_TORNEO = Date.UTC(2026, 9, 18, 3, 40); // 00:40 del domingo en Argentina

/** Usuarios ficticios del ejemplo (los PIN son de ejemplo y se usan en los tests). */
export const USUARIOS_EJEMPLO = [
  { id: "u-duenio-1", nombre: "Dueño Uno", rol: "duenio" as const, pin: "11", activo: true },
  { id: "u-duenio-2", nombre: "Dueña Dos", rol: "duenio" as const, pin: "22", activo: true },
  { id: "u-recep-1", nombre: "Recepción Tarde", rol: "recepcion" as const, pin: "33", activo: true },
];
const DUENIO = { usuarioId: "u-duenio-1", pin: "11" };

const NOMBRES = ["Ana", "Beto", "Caro", "Dani", "Eli", "Fede", "Gabi", "Hugo", "Ine", "Juan", "Kari", "Leo", "Majo", "Nico", "Oli", "Pablo"];

function azar(semilla: number) {
  let s = semilla;
  return () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
}

function exigir<R extends { ok: boolean }>(r: R, que: string): Extract<R, { ok: true }> {
  if (!r.ok) throw new Error(`armar respaldo: ${que}: ${(r as { motivo?: string }).motivo ?? "falló"}`);
  return r as Extract<R, { ok: true }>;
}

const en = (fecha: string, min: number): Ahora => ({ fecha, min });

/** Un club recién armado con clientes ficticios (tel 54911000000NN, inventados a propósito). */
function clubDeEjemplo(nClientes: number, stockInicial: number): EstadoClub {
  // `crearClubReal` reinicia el contador de ids: así los ids del ejemplo no dependen de lo que corrió antes.
  M.crearClubReal(HOY_TORNEO);
  const e = M.crearEstado({
    config: M.CONFIG_DEMO,
    canchas: M.CANCHAS_DEMO,
    clientes: Array.from({ length: nClientes }, (_, i) => ({
      id: `k${i + 1}`,
      nombre: `${NOMBRES[i % NOMBRES.length]} ${String.fromCharCode(65 + Math.floor(i / NOMBRES.length) % 26)}.`,
      tel: `54911000000${String(i + 1).padStart(2, "0")}`,
      monedero: i === 2 ? 20000 : 0,
      cc: i === 3 ? { habilitada: true, limite: 100000 } : undefined,
    })),
    productos: M.PRODUCTOS_DEMO.map((p: any) => (p.stock != null && !p.alquiler ? { ...p, stock: Math.max(p.stock, stockInicial) } : p)),
    usuarios: USUARIOS_EJEMPLO,
  });
  e.config.cobro = { ...e.config.cobro, alias: "club.ejemplo.ficticio" };
  e.caja.fondo = 30000;
  return e;
}

function turnoDeCuatro(e: EstadoClub, fecha: string, canchaId: string, inicio: number, primero: number, tipo: Reserva["tipo"], reservadoA: Ahora): Reserva {
  const ids = [0, 1, 2, 3].map((k) => `k${((primero + k) % e.clientes.length) + 1}`);
  const jugadores = ids.map((id) => ({ nombre: M.cliente(e, id)!.nombre, clienteId: id }));
  return exigir(
    M.crearReserva(e, { canchaId, fecha, inicio, tipo, clienteId: ids[0], jugadores: jugadores as never, origen: "mostrador" }, reservadoA),
    `reservar ${canchaId} ${fecha} ${M.hhmm(inicio)}`,
  ).reserva;
}

/** Paga la seña (si el motor la pidió) y abre la cancha. */
function abrir(e: EstadoClub, r: Reserva, ahora: Ahora, medioSena: Medio = "transferencia") {
  if (r.sena.monto > 0 && !r.sena.pagada) exigir(M.registrarPago(e, r.id, { medio: medioSena, monto: r.sena.monto - M.cobrado(r) }, ahora), "seña");
  exigir(M.checkIn(e, r.id, ahora), `abrir ${r.canchaId} ${M.hhmm(r.inicio)}`);
}

/** Cobrar no cierra la cancha: se cierra al terminar (si el camino de cobro no la cerró ya). */
function cerrarSiSigue(e: EstadoClub, r: Reserva, ahora: Ahora) {
  if (r.estado === "en_cancha") exigir(M.finalizar(e, r.id, {}, ahora), `cerrar ${r.canchaId} ${M.hhmm(r.inicio)}`);
}

/**
 * El sábado de torneo. Devuelve el sobre v1 completo, como lo descarga «Descargar respaldo»
 * (`{ v, estado, secuencia, usuario, guardado }`).
 */
export function armarDiaDeTorneo(): FotoEstado & { usuario: string; guardado: number } {
  const e = clubDeEjemplo(16, 120);
  const hoy = HOY_TORNEO;
  const ayer = M.sumarDias(hoy, -1);
  const manana = M.sumarDias(hoy, 1);
  const rnd = azar(1710);
  const MEDIOS: Medio[] = ["efectivo", "mercadopago", "transferencia", "debito"];
  const medio = () => MEDIOS[Math.floor(rnd() * MEDIOS.length)];
  const bebidas = ["p2", "p9", "p10", "p3"];
  const platos = ["k-mila", "k-hamb", "k-empa", "k-pica"];

  // Las parejas se anotan el viernes a la mañana; las de la noche dejan la seña ese mismo viernes a las 10 (caja
  // del jueves, porque la caja corre de 12 a 12).
  const reservadoA = en(ayer, 9 * 60);
  const turnos: Reserva[] = [];
  let pareja = 0;
  for (let inicio = 9 * 60; inicio + 90 <= 22 * 60 + 30; inicio += 90) {
    for (const c of e.canchas) {
      const r = turnoDeCuatro(e, hoy, c.id, inicio, pareja, "torneo", reservadoA);
      pareja += 2;
      if (inicio >= 19 * 60 + 30 && c.id === "c1") exigir(M.registrarPago(e, r.id, { medio: "transferencia", monto: Math.round(r.precio / 2) }, en(ayer, 10 * 60)), "seña del viernes");
      turnos.push(r);
    }
  }

  let camino = 0;
  for (const r of turnos) {
    // El último turno de la cancha 4 queda en juego, con la mesa abierta (lo que se ve a la medianoche).
    const enJuego = r === turnos[turnos.length - 1];
    abrir(e, r, en(hoy, r.inicio - 5));
    const cargos = 1 + Math.floor(rnd() * 5);
    for (let k = 0; k < cargos; k++) {
      const prod = rnd() < 0.7 ? bebidas[Math.floor(rnd() * bebidas.length)] : platos[Math.floor(rnd() * platos.length)];
      exigir(M.consumoJugador(e, r.id, Math.floor(rnd() * 4), prod, 1 + Math.floor(rnd() * 2), {}, en(hoy, r.inicio + 40)), "cargo del buffet");
    }
    if (enJuego) continue;
    const fin = en(hoy, r.inicio + 90);
    const paso = camino++ % 4;
    if (paso === 0) exigir(M.cobrarTodoElTurno(e, r.id, { medio: medio() }, fin), "cobrar todo");
    else if (paso === 1) {
      // Cada jugador paga lo suyo; la ficha con créditos (k3) paga con el monedero, que no entra a la caja.
      for (let i = 0; i < 4; i++) {
        const j = M.cuentaDelTurno(e, r.id);
        if (!j.ok || !(j.jugadores[i]?.aPagar > 0)) continue;
        const conCreditos = j.jugadores[i].clienteId === "k3" && (M.cliente(e, "k3")?.monedero ?? 0) >= j.jugadores[i].aPagar;
        exigir(M.cobrarJugador(e, r.id, i, { medio: conCreditos ? "monedero" : medio() }, fin), "cobrar a un jugador");
      }
    } else if (paso === 2) {
      exigir(M.cerrarCanchaYSeguir(e, r.id, { medio: medio() }, fin), "cerrar la cancha, la mesa sigue");
      if (M.cuentaDelTurno(e, r.id).ok && M.mesasAbiertas(e).some((m: any) => m.reserva.id === r.id)) {
        exigir(M.cerrarCargosDelTurno(e, r.id, { medio: medio() }, en(hoy, r.inicio + 120)), "cerrar la mesa");
      }
    } else exigir(M.cobrarTodoElTurno(e, r.id, { medio: "efectivo" }, fin), "cobrar todo en efectivo");
    cerrarSiSigue(e, r, fin);
  }

  // Mostrador: agua y una pala de alquiler sin turno; hielo pagado de la caja (egreso con PIN del dueño).
  exigir(M.ventaMostrador(e, [{ productoId: "p2", cant: 6 }, { productoId: "p1", cant: 1 }], "mercadopago", en(hoy, 17 * 60)), "venta de mostrador");
  exigir(M.egresoCaja(e, { monto: 8500, concepto: "Hielo para el buffet", ...DUENIO }, en(hoy, 18 * 60)), "egreso");

  // Cierre de la caja del sábado a las 23:50 con el efectivo justo; después, una gaseosa a las 00:30 entra en la
  // caja siguiente (la del domingo), que queda SIN cerrar.
  const diaCaja = M.cajaAbierta(e, en(hoy, 23 * 60 + 50));
  exigir(M.cerrarCaja(e, { contado: M.resumenCaja(e, diaCaja).efectivoEsperado, ...DUENIO }, en(hoy, 23 * 60 + 50)), "cierre de caja");
  exigir(M.ventaMostrador(e, [{ productoId: "p10", cant: 1 }], "efectivo", en(hoy, 24 * 60 + 30)), "venta después del cierre");

  // El turno de mañana (reservado, sin cobrar).
  turnoDeCuatro(e, manana, "c2", 18 * 60, 5, "turno", en(hoy, 23 * 60));

  return { v: M.VERSION_ESTADO, estado: e, secuencia: M.secuenciaIds(), usuario: "u-recep-1", guardado: GUARDADO_TORNEO };
}

/**
 * Un club lleno durante `dias` días hasta `hasta` (excluido): 4 canchas, turnos de 90' de punta a punta (85% de
 * ocupación), cada uno con buffet y cobrado por uno de los caminos, y la caja de cada día cerrada. Para medir.
 */
export function armarMesCargado(hasta = HOY_TORNEO, dias = 30): FotoEstado & { usuario: string; guardado: number } {
  const e = clubDeEjemplo(120, 1_000_000);
  const rnd = azar(3003);
  const MEDIOS: Medio[] = ["efectivo", "mercadopago", "transferencia", "debito"];
  const productos = ["p2", "p9", "p10", "p3", "k-mila", "k-hamb", "k-empa", "k-pica"];
  let pareja = 0;
  for (let d = -dias; d < 0; d++) {
    const fecha = M.sumarDias(hasta, d);
    const { abre, cierra } = M.horarioDe(e, fecha);
    for (let inicio = abre; inicio + 90 <= cierra; inicio += 90) {
      for (const c of e.canchas) {
        if (rnd() > 0.85) continue;
        const r = turnoDeCuatro(e, fecha, c.id, inicio, (pareja += 3), "turno", en(fecha, inicio - 120));
        abrir(e, r, en(fecha, inicio - 5), MEDIOS[Math.floor(rnd() * 4)]);
        for (let k = Math.floor(rnd() * 5); k > 0; k--) {
          exigir(M.consumoJugador(e, r.id, Math.floor(rnd() * 4), productos[Math.floor(rnd() * productos.length)], 1, {}, en(fecha, inicio + 45)), "cargo");
        }
        exigir(M.cobrarTodoElTurno(e, r.id, { medio: MEDIOS[Math.floor(rnd() * 4)] }, en(fecha, inicio + 90)), "cobrar");
        cerrarSiSigue(e, r, en(fecha, inicio + 90));
      }
    }
    // La caja del día se cierra antes del corte del día siguiente (11:30 del otro día: madrugada incluida).
    const cierre = en(M.sumarDias(fecha, 1), 11 * 60 + 30);
    const dia = M.cajaAbierta(e, cierre);
    if (M.resumenCaja(e, dia).movimientos > 0) exigir(M.cerrarCaja(e, { contado: M.resumenCaja(e, dia).efectivoEsperado, ...DUENIO }, cierre), "cierre del día");
  }
  return { v: M.VERSION_ESTADO, estado: e, secuencia: M.secuenciaIds(), usuario: "u-recep-1", guardado: Date.UTC(2026, 9, 17, 15) };
}
