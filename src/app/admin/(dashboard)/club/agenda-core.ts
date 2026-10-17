// ============================================================================
// LA AGENDA DE CANCHAS DEL DÍA — cómo se arma la grilla. PURO (sin DOM ni React).
// ============================================================================
//
// La recepción del club trabaja parada, con la tablet en el mostrador y gente esperando: abre la
// agenda para saber QUÉ CANCHA ESTÁ OCUPADA y QUIÉN DEBE. Por eso cada turno dice una sola señal, y
// sólo si pide acción (falta la seña, debe la cancha, la mesa sigue abierta): lo que está bien no se
// anuncia. Es la misma regla de `senalReserva` del club vanilla (public/previews/breakpoint/club).
//
// Acá se decide, sin pantalla (agenda-core.test.ts):
//   · las columnas (canchas) y las filas (franjas de `config.paso` minutos entre la apertura y el
//     cierre de ESE día, `horarioDe`; la madrugada pasa de 1440);
//   · cada turno como un tramo: en qué columna, desde qué fila y cuántas ocupa, con su marca de
//     estado (forma + palabra) y el texto completo para el lector de pantalla;
//   · la raya de «ahora»;
//   · a qué turno se va con las flechas (la grilla se recorre con el teclado);
//   · y qué se puede reusar del armado anterior, para que React sólo vuelva a pintar el tramo que
//     cambió (`compartirAgenda`).
//
// La plata la lee del motor (`saldo`, `cuentaDelTurno`): no decide nada. El motor tiene un contador
// de ids de módulo, así que esto corre sólo en el navegador (y en los tests), nunca en el servidor.

import { ESTADOS, TIPOS, cancha as canchaDe, cliente as clienteDe, cuentaDelTurno, hhmm, horarioDe, pesos, saldo } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub, EstadoReserva, Fecha, Reserva } from "@/lib/club/motor.mjs";
import type { TipoMarca } from "@/components/ui/Marca";

/** Los estados que ocupan la cancha en la grilla (lo cancelado, suspendido o la falta van aparte). */
const EN_GRILLA: ReadonlySet<EstadoReserva> = new Set(["reservada", "en_cancha", "finalizada"]);

export interface ColumnaCancha {
  id: string;
  nombre: string;
  /** «Techada» · «Descubierta» · «en mantenimiento». */
  detalle: string;
}

export interface FilaHora {
  /** Fila de la grilla, desde 0. */
  fila: number;
  texto: string;
}

/** Un turno tal como lo pinta la grilla: sólo primitivos, para que el memo compare barato. */
export interface CeldaTurno {
  id: string;
  /** Columna de la cancha, desde 0. */
  columna: number;
  /** Fila donde empieza, desde 0. */
  fila: number;
  /** Cuántas filas ocupa (al menos 1). */
  alto: number;
  titular: string;
  /** «17:30–19:00». */
  horario: string;
  /** «4/4». */
  jugadores: string;
  /** «Turno fijo», «Clase», «Partido abierto» (null para el turno común). */
  tipo: string | null;
  estado: EstadoReserva;
  marca: { tipo: TipoMarca; texto: string };
  /** La única señal que pide acción, o null. */
  senal: string | null;
  /** El titular tiene saldo deudor en su cuenta corriente. */
  deudor: boolean;
  /** Todo lo de arriba en una frase, para el lector de pantalla. */
  etiqueta: string;
  /** Lo que la hace distinta de su versión anterior (para reusar la celda si no cambió). */
  firma: string;
}

export interface VistaAgenda {
  fecha: Fecha;
  canchas: ColumnaCancha[];
  paso: number;
  /** Minutos del día donde empieza la grilla (la apertura). */
  desde: number;
  filas: number;
  horas: FilaHora[];
  turnos: CeldaTurno[];
  /** Fila (con decimales) donde va la raya de «ahora», o null si cae afuera del horario. */
  ahora: number | null;
  /** «12 turnos · 3 en cancha · 2 deben» — la línea de estado. */
  resumen: string;
  firma: string;
}

/** Lo que cobra el turno antes de dar la cancha, lo que debe en juego o la mesa que sigue: UNA señal. */
export function senalDelTurno(estado: EstadoClub, r: Reserva): string | null {
  const s = saldo(r);
  if (r.estado === "reservada" && r.sena.monto > 0 && !r.sena.pagada) return `falta seña ${pesos(r.sena.monto)}`;
  if (r.estado === "en_cancha" && s > 0) return `debe ${pesos(s)}`;
  if (r.estado === "finalizada") {
    const t = cuentaDelTurno(estado, r.id);
    if (t.ok && t.totales.cargos > 0) return `mesa ${pesos(t.totales.cargos)}`;
  }
  return null;
}

/**
 * La marca (forma + palabra) del turno: el estado se lee sin depender del color. La palabra es el estado
 * (corta, entra en la celda); si hay señal, la forma es la de «pide acción» y la señal dice cuánto.
 */
export function marcaDelTurno(r: Reserva, senal: string | null): { tipo: TipoMarca; texto: string } {
  const texto = ESTADOS[r.estado];
  if (senal) return { tipo: "atencion", texto };
  switch (r.estado) {
    case "reservada":
      return { tipo: "pendiente", texto };
    case "en_cancha":
      return { tipo: "medias", texto };
    case "finalizada":
      return { tipo: "hecho", texto };
    default:
      return { tipo: "anulado", texto };
  }
}

function detalleCancha(c: { cubierta: boolean; estado: string }): string {
  const tipo = c.cubierta ? "Techada" : "Descubierta";
  return c.estado === "mantenimiento" ? `${tipo} · en mantenimiento` : tipo;
}

/** Arma la grilla del día `fecha` con el reloj `ahora`. */
export function armarAgenda(estado: EstadoClub, fecha: Fecha, ahora: Ahora): VistaAgenda {
  const { paso } = estado.config;
  const { abre, cierra } = horarioDe(estado, fecha);
  const filas = Math.max(1, Math.ceil((cierra - abre) / paso));
  const canchas: ColumnaCancha[] = estado.canchas.map((c) => ({ id: c.id, nombre: c.nombre, detalle: detalleCancha(c) }));
  const columnaDe = new Map(canchas.map((c, i) => [c.id, i]));

  const horas: FilaHora[] = [];
  for (let m = abre; m < cierra; m += 60) horas.push({ fila: Math.round((m - abre) / paso), texto: hhmm(m) });

  const turnos: CeldaTurno[] = [];
  let enCancha = 0;
  let conSenal = 0;
  for (const r of estado.reservas) {
    if (r.fecha !== fecha || !EN_GRILLA.has(r.estado)) continue;
    const columna = columnaDe.get(r.canchaId);
    if (columna === undefined) continue;
    const fila = Math.max(0, Math.floor((r.inicio - abre) / paso));
    const alto = Math.max(1, Math.min(filas - fila, Math.round(r.duracion / paso)));
    const senal = senalDelTurno(estado, r);
    const marca = marcaDelTurno(r, senal);
    const titular = r.clienteId ? clienteDe(estado, r.clienteId) : undefined;
    const deudor = (titular?.deuda ?? 0) > 0;
    const horario = `${hhmm(r.inicio)}–${hhmm(r.inicio + r.duracion)}`;
    const jugadores = `${r.jugadores.length}/4`;
    const tipo = r.tipo === "turno" ? null : TIPOS[r.tipo];
    const nombreCancha = canchaDe(estado, r.canchaId)?.nombre ?? "";
    const etiqueta = [
      `${r.titular}, ${nombreCancha}, de ${hhmm(r.inicio)} a ${hhmm(r.inicio + r.duracion)}`,
      tipo,
      `${r.jugadores.length} de 4 jugadores`,
      marca.texto,
      senal,
      deudor ? `tiene saldo deudor de ${pesos(titular?.deuda ?? 0)}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    if (r.estado === "en_cancha") enCancha++;
    if (senal) conSenal++;
    const celda = { id: r.id, columna, fila, alto, titular: r.titular, horario, jugadores, tipo, estado: r.estado, marca, senal, deudor, etiqueta };
    turnos.push({ ...celda, firma: firmaDe(celda) });
  }
  // Orden de lectura: cancha por cancha, de arriba hacia abajo (el mismo del Tab).
  turnos.sort((a, b) => a.columna - b.columna || a.fila - b.fila);

  const minAhora = ahora.fecha === fecha ? ahora.min : null;
  const filaAhora = minAhora !== null && minAhora >= abre && minAhora <= cierra ? (minAhora - abre) / paso : null;

  const resumen = [
    turnos.length === 1 ? "1 turno" : `${turnos.length} turnos`,
    enCancha ? `${enCancha} en cancha` : null,
    conSenal ? (conSenal === 1 ? "1 para atender" : `${conSenal} para atender`) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const vista: Omit<VistaAgenda, "firma"> = { fecha, canchas, paso, desde: abre, filas, horas, turnos, ahora: filaAhora, resumen };
  return {
    ...vista,
    firma: [fecha, abre, cierra, paso, filaAhora, resumen, canchas.map((c) => `${c.id}:${c.nombre}:${c.detalle}`).join(","), turnos.map((t) => t.firma).join("|")].join("#"),
  };
}

function firmaDe(c: Omit<CeldaTurno, "firma">): string {
  return [c.id, c.columna, c.fila, c.alto, c.titular, c.horario, c.jugadores, c.tipo, c.estado, c.marca.tipo, c.marca.texto, c.senal, c.deudor].join("¦");
}

/**
 * Reusa lo que no cambió del armado anterior: si la grilla entera es igual, devuelve la MISMA vista
 * (React no vuelve a pintar la agenda); si no, la nueva con las celdas que no cambiaron como el
 * MISMO objeto (el memo de cada tramo no se vuelve a pintar).
 */
export function compartirAgenda(previa: VistaAgenda | null, nueva: VistaAgenda): VistaAgenda {
  if (!previa) return nueva;
  if (previa.firma === nueva.firma) return previa;
  const viejas = new Map(previa.turnos.map((t) => [t.id, t]));
  const turnos = nueva.turnos.map((t) => {
    const v = viejas.get(t.id);
    return v && v.firma === t.firma ? v : t;
  });
  const canchas = previa.canchas.length === nueva.canchas.length && previa.canchas.every((c, i) => c.id === nueva.canchas[i].id && c.nombre === nueva.canchas[i].nombre && c.detalle === nueva.canchas[i].detalle) ? previa.canchas : nueva.canchas;
  const horas = previa.desde === nueva.desde && previa.filas === nueva.filas && previa.paso === nueva.paso ? previa.horas : nueva.horas;
  return { ...nueva, turnos, canchas, horas };
}

export type Direccion = "arriba" | "abajo" | "izquierda" | "derecha";

/**
 * A qué turno se va con las flechas desde `id`: ↑/↓ el anterior o el siguiente de la MISMA cancha;
 * ←/→ el de la cancha de al lado que se superpone con su horario (o el más cercano), salteando las
 * canchas vacías. null si no hay a dónde ir.
 */
export function vecino(turnos: readonly Pick<CeldaTurno, "id" | "columna" | "fila" | "alto">[], id: string, dir: Direccion): string | null {
  const actual = turnos.find((t) => t.id === id);
  if (!actual) return null;
  if (dir === "arriba" || dir === "abajo") {
    const misma = turnos.filter((t) => t.columna === actual.columna).sort((a, b) => a.fila - b.fila);
    const i = misma.findIndex((t) => t.id === id);
    return misma[dir === "arriba" ? i - 1 : i + 1]?.id ?? null;
  }
  const paso = dir === "izquierda" ? -1 : 1;
  const columnas = [...new Set(turnos.map((t) => t.columna))].sort((a, b) => a - b);
  const candidatas = columnas.filter((c) => (paso < 0 ? c < actual.columna : c > actual.columna));
  const columna = paso < 0 ? candidatas.at(-1) : candidatas[0];
  if (columna === undefined) return null;
  const centro = actual.fila + actual.alto / 2;
  let mejor: { id: string; distancia: number; fila: number } | null = null;
  for (const t of turnos) {
    if (t.columna !== columna) continue;
    const distancia = centro >= t.fila && centro < t.fila + t.alto ? 0 : Math.min(Math.abs(t.fila - centro), Math.abs(t.fila + t.alto - centro));
    if (!mejor || distancia < mejor.distancia || (distancia === mejor.distancia && t.fila < mejor.fila)) mejor = { id: t.id, distancia, fila: t.fila };
  }
  return mejor?.id ?? null;
}
