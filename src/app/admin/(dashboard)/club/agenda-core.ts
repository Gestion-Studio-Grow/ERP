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
//   · qué turnos «necesitan atención» (los de una alerta urgente de la bandeja, sólo en la grilla de hoy, como el
//     vanilla con `conAlerta`);
//   · los días que se eligen arriba (ayer, hoy y los cinco que siguen: `diasDeLaAgenda`, como el vanilla);
//   · prender y apagar la luz de una cancha (`ponerLuz`; el motor la prende al abrir la cancha y la apaga al
//     cerrarla, al moverla o con el plan lluvia);
//   · y qué se puede reusar del armado anterior, para que React sólo vuelva a pintar el tramo que
//     cambió (`compartirAgenda`).
//
// La plata la lee del motor (`saldo`, `cuentaDelTurno`): no decide nada. El motor tiene un contador
// de ids de módulo, así que esto corre sólo en el navegador (y en los tests), nunca en el servidor.

import { ESTADOS, NOMBRE_DIA, TIPOS, alertas, cancha as canchaDe, cliente as clienteDe, cuentaDelTurno, diaSemana, hhmm, horarioDe, minutosHasta, ocupantes, pesos, saldo, sumarDias } from "@/lib/club/motor.mjs";
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
  /** Tiene una alerta urgente en la bandeja (sólo en la grilla de hoy). */
  atencion: boolean;
  /** Todo lo de arriba en una frase, para el lector de pantalla. */
  etiqueta: string;
  /** Lo que la hace distinta de su versión anterior (para reusar la celda si no cambió). */
  firma: string;
}

/** Una franja libre de una cancha: tocarla abre el alta de un turno desde esa hora. */
export interface FranjaLibre {
  /** `${canchaId}@${min}` — estable para el `key` y el memo. */
  id: string;
  canchaId: string;
  columna: number;
  fila: number;
  min: number;
  hora: string;
  etiqueta: string;
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
  /** Las franjas libres (sin turno ni bloqueo, que todavía no pasaron) donde se puede reservar. */
  libres: FranjaLibre[];
  /** Los bloqueos del día (mantenimiento, torneo): ocupan la cancha sin ser turnos. */
  bloqueos: { id: string; columna: number; fila: number; alto: number; motivo: string }[];
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

/** «Techada» / «Descubierta» sólo si el club tiene de las dos (Break Point: las 4 techadas). */
function detalleCancha(c: { cubierta: boolean; estado: string }, techoMixto: boolean): string {
  const partes = [techoMixto ? (c.cubierta ? "Techada" : "Descubierta") : "", c.estado === "mantenimiento" ? "en mantenimiento" : ""];
  return partes.filter(Boolean).join(" · ");
}

/** Arma la grilla del día `fecha` con el reloj `ahora`. */
export function armarAgenda(estado: EstadoClub, fecha: Fecha, ahora: Ahora): VistaAgenda {
  const { paso } = estado.config;
  const { abre, cierra } = horarioDe(estado, fecha);
  const filas = Math.max(1, Math.ceil((cierra - abre) / paso));
  const techoMixto = estado.canchas.some((c) => c.cubierta) && estado.canchas.some((c) => !c.cubierta);
  const canchas: ColumnaCancha[] = estado.canchas.map((c) => ({ id: c.id, nombre: c.nombre, detalle: detalleCancha(c, techoMixto) }));
  const columnaDe = new Map(canchas.map((c, i) => [c.id, i]));

  const horas: FilaHora[] = [];
  for (let m = abre; m < cierra; m += 60) horas.push({ fila: Math.round((m - abre) / paso), texto: hhmm(m) });

  // Los turnos con una alerta urgente (seña que no llega, la falta, la cancha que terminó y debe): sólo hoy.
  const urgentes = fecha === ahora.fecha ? new Set(alertas(estado, ahora).flatMap((a) => (a.nivel === "alta" && a.reservaId ? [a.reservaId] : []))) : null;
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
    const atencion = urgentes?.has(r.id) ?? false;
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
      atencion ? "necesita atención" : null,
    ]
      .filter(Boolean)
      .join(", ");
    if (r.estado === "en_cancha") enCancha++;
    if (senal) conSenal++;
    const celda = { id: r.id, columna, fila, alto, titular: r.titular, horario, jugadores, tipo, estado: r.estado, marca, senal, deudor, atencion, etiqueta };
    turnos.push({ ...celda, firma: firmaDe(celda) });
  }
  // Orden de lectura: cancha por cancha, de arriba hacia abajo (el mismo del Tab).
  turnos.sort((a, b) => a.columna - b.columna || a.fila - b.fila);

  // Franjas libres: no en mantenimiento, sin turno ni bloqueo encima, y que un turno de la duración de siempre
  // todavía no habría terminado (recepción puede cargar uno que se olvidó, como en el club vanilla).
  const libres: FranjaLibre[] = [];
  const bloqueos: VistaAgenda["bloqueos"] = [];
  estado.canchas.forEach((c, columna) => {
    const { reservas, bloqueos: bs } = ocupantes(estado, fecha, c.id);
    for (const b of bs) {
      if (b.canchaId !== c.id && b.canchaId !== "*") continue;
      const fila = Math.max(0, Math.floor((b.desde - abre) / paso));
      bloqueos.push({ id: `${b.id}@${c.id}`, columna, fila, alto: Math.max(1, Math.min(filas - fila, Math.round((b.hasta - b.desde) / paso))), motivo: b.motivo });
    }
    if (c.estado === "mantenimiento") return;
    for (let m = abre; m < cierra; m += paso) {
      if (minutosHasta(ahora, fecha, m) + estado.config.duracionTurno <= 0) continue;
      const tapa = (d: number, h: number) => m < h && m + paso > d;
      if (reservas.some((r) => tapa(r.inicio, r.inicio + r.duracion)) || bs.some((b) => tapa(b.desde, b.hasta))) continue;
      const hora = hhmm(m);
      libres.push({ id: `${c.id}@${m}`, canchaId: c.id, columna, fila: (m - abre) / paso, min: m, hora, etiqueta: `${c.nombre}, ${hora}, libre: reservar` });
    }
  });

  const minAhora = ahora.fecha === fecha ? ahora.min : null;
  const filaAhora = minAhora !== null && minAhora >= abre && minAhora <= cierra ? (minAhora - abre) / paso : null;

  const resumen = [
    turnos.length === 1 ? "1 turno" : `${turnos.length} turnos`,
    enCancha ? `${enCancha} en cancha` : null,
    conSenal ? (conSenal === 1 ? "1 para atender" : `${conSenal} para atender`) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const vista: Omit<VistaAgenda, "firma"> = { fecha, canchas, paso, desde: abre, filas, horas, turnos, libres, bloqueos, ahora: filaAhora, resumen };
  return {
    ...vista,
    firma: [fecha, abre, cierra, paso, filaAhora, resumen, canchas.map((c) => `${c.id}:${c.nombre}:${c.detalle}`).join(","), turnos.map((t) => t.firma).join("|"), libres.map((l) => l.id).join(","), bloqueos.map((b) => `${b.id}:${b.fila}:${b.alto}`).join(",")].join("#"),
  };
}

function firmaDe(c: Omit<CeldaTurno, "firma">): string {
  return [c.id, c.columna, c.fila, c.alto, c.titular, c.horario, c.jugadores, c.tipo, c.estado, c.marca.tipo, c.marca.texto, c.senal, c.deudor, c.atencion].join("¦");
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
  const libresViejas = new Map(previa.libres.map((l) => [l.id, l]));
  const libres = nueva.libres.map((l) => {
    const v = libresViejas.get(l.id);
    return v && v.fila === l.fila && v.etiqueta === l.etiqueta ? v : l;
  });
  const mismosLibres = libres.length === previa.libres.length && libres.every((l, i) => l === previa.libres[i]);
  return { ...nueva, turnos, canchas, horas, libres: mismosLibres ? previa.libres : libres };
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

/** Un botón de los días de arriba: la fecha y cómo se lee («Ayer», «Hoy», «Lun»…). */
export interface DiaDeLaAgenda {
  fecha: Fecha;
  /** «Ayer» · «Hoy» · «Mañana» · «Lun»… */
  nombre: string;
  /** «17/10». */
  ddmm: string;
  /** Para el lector de pantalla: «hoy, viernes 17/10». */
  etiqueta: string;
}

/** Cuántos días antes de hoy se pueden mirar en la agenda (el vanilla: ayer). */
export const DIAS_ANTES = 1;
/** Cuántos días después de hoy (el vanilla: hasta hoy + 5). */
export const DIAS_DESPUES = 5;

/**
 * Los días que se eligen arriba de la agenda: ayer, hoy y los cinco que siguen (los de `vistaAgenda` del vanilla,
 * `[-1, 0, 1, 2, 3, 4, 5]`). Ayer sirve para cobrar lo que quedó de anoche o revisar una falta; la grilla es la misma.
 */
export function diasDeLaAgenda(hoy: Fecha): DiaDeLaAgenda[] {
  const dias: DiaDeLaAgenda[] = [];
  for (let i = -DIAS_ANTES; i <= DIAS_DESPUES; i++) {
    const fecha = sumarDias(hoy, i);
    const semana = NOMBRE_DIA[diaSemana(fecha)];
    const ddmm = `${Number(fecha.slice(8))}/${Number(fecha.slice(5, 7))}`;
    const cerca = i === -1 ? "Ayer" : i === 0 ? "Hoy" : i === 1 ? "Mañana" : null;
    dias.push({ fecha, nombre: cerca ?? semana.slice(0, 3), ddmm, etiqueta: `${cerca ? `${cerca}, ` : ""}${semana.toLowerCase()} ${ddmm}` });
  }
  return dias;
}

/**
 * Prende o apaga la luz de una cancha (el botón de cada cancha, arriba de la grilla, y «Apagar» de la bandeja). El
 * motor no tiene una función para esto: el vanilla cambia `E.luces` en el lugar (app.mjs, acción `luz`), y acá se
 * hace lo mismo. El motor la prende solo al abrir la cancha y la apaga solo al cerrarla.
 */
export function ponerLuz(estado: EstadoClub, canchaId: string, prendida: boolean): { ok: boolean; mensaje: string } {
  const c = canchaDe(estado, canchaId);
  if (!c) return { ok: false, mensaje: "No encuentro la cancha." };
  if (!!estado.luces[canchaId] === prendida) return { ok: false, mensaje: `La luz de ${c.nombre} ya estaba ${prendida ? "prendida" : "apagada"}.` };
  estado.luces[canchaId] = prendida;
  return { ok: true, mensaje: `Luz de ${c.nombre} ${prendida ? "prendida" : "apagada"}.` };
}
