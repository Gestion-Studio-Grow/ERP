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
//   · el BOTÓN DEL MOMENTO de cada turno (`botonesDelMomento`, bp-DISENO §2.2): lo que pasa cien veces al día (abrir,
//     cobrar la seña y abrir, +30 min, cobrar, cerrar, la mesa sigue, no vino, y «Cerrar la de X y abrir» si la cancha
//     sigue ocupada por el anterior) se hace desde la grilla, sin abrir la hoja;
//   · las MARCAS del turno: «nuevo» (primer turno de la ficha), «web» (vino del turnero), «fijo» y el punto rojo de
//     «debe» en TODOS los bloques (también en los de 60 min);
//   · «Buscar lugar» (`buscarLugar`, §3.2): una hora y una duración → una opción por cancha, primero las que entran a
//     esa hora y después lo más cerca;
//   · los días que se eligen arriba (ayer, hoy y los cinco que siguen: `diasDeLaAgenda`, como el vanilla);
//   · prender y apagar la luz de una cancha (`ponerLuz`; el motor la prende al abrir la cancha y la apaga al
//     cerrarla, al moverla o con el plan lluvia);
//   · y qué se puede reusar del armado anterior, para que React sólo vuelva a pintar el tramo que
//     cambió (`compartirAgenda`).
//
// La plata la lee del motor (`saldo`, `cuentaDelTurno`): no decide nada. El motor tiene un contador
// de ids de módulo, así que esto corre sólo en el navegador (y en los tests), nunca en el servidor.

import { ESTADOS, NOMBRE_DIA, TIPOS, alertas, validarHueco, cancha as canchaDe, checkIn, cobrarDeuda, cuantoEntra, cliente as clienteDe, cuentaDelTurno, diaSemana, hhmm, horarioDe, huecosLibres, minutosHasta, ocupantes, pesos, precioTurno, saldo, sumarDias, turnosJugados } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub, EstadoReserva, Fecha, Reserva } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import type { TipoMarca } from "@/components/ui/Marca";
import { opcionesCiclo } from "./ciclo-core";
import { ETIQUETA_MEDIO, MEDIOS_CAJA, canchaOcupada, senaSinPagar, type MedioCaja } from "./cuenta-core";

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
  /** Marca «nuevo»: es el primer turno de la ficha del titular (todavía no jugó ninguno: `turnosJugados === 0`). */
  nuevo: boolean;
  /** Marca «web»: el turno vino del turnero (`origen: "web"`). */
  web: boolean;
  /** El botón del momento (0, 1 o 2: «Cerrar» · «La mesa sigue»), según el estado y la hora (`botonesDelMomento`). */
  momento: BotonDelMomento[];
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
  /** Minutos seguidos libres desde esta franja (hasta el próximo turno, bloqueo o el cierre: `cuantoEntra`). */
  cuantoEntra: number;
  /** No entra un turno de la duración de siempre (`config.duracionTurno`): se pinta «+ 20:30 · 30 min» con trama. */
  corto: boolean;
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
  /** El día del título, como el club de hoy: «Sáb 17/10 (hoy)». */
  diaTitulo: string;
  /** «Horario de los sábados: 09:00 a 01:00». */
  horarioTexto: string;
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
    const nuevo = !!titular && (r.estado === "reservada" || r.estado === "en_cancha") && turnosJugados(estado, titular) === 0;
    const web = r.origen === "web";
    const momento = botonesDelMomento(estado, r, ahora);
    const horario = `${hhmm(r.inicio)}–${hhmm(r.inicio + r.duracion)}`;
    const jugadores = `${r.jugadores.length}/4`;
    const tipo = r.tipo === "turno" ? null : TIPOS[r.tipo];
    const nombreCancha = canchaDe(estado, r.canchaId)?.nombre ?? "";
    const etiqueta = [
      `${r.titular}, ${nombreCancha}, de ${hhmm(r.inicio)} a ${hhmm(r.inicio + r.duracion)}`,
      tipo,
      nuevo ? "cliente nuevo" : null,
      web ? "reservó por la web" : null,
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
    const celda = { id: r.id, columna, fila, alto, titular: r.titular, horario, jugadores, tipo, estado: r.estado, marca, senal, deudor, atencion, nuevo, web, momento, etiqueta };
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
      const entra = cuantoEntra(estado, fecha, c.id, m).minutos;
      libres.push({ id: `${c.id}@${m}`, canchaId: c.id, columna, fila: (m - abre) / paso, min: m, hora, etiqueta: `${c.nombre}, ${hora}, libre: reservar`, cuantoEntra: entra, corto: entra < estado.config.duracionTurno });
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

  const nombreDia = NOMBRE_DIA[diaSemana(fecha)];
  const diaTitulo = `${nombreDia.slice(0, 3)} ${Number(fecha.slice(8))}/${Number(fecha.slice(5, 7))}${fecha === ahora.fecha ? " (hoy)" : ""}`;
  const plural = nombreDia.toLowerCase().endsWith("s") ? nombreDia.toLowerCase() : `${nombreDia.toLowerCase()}s`;
  const horarioTexto = `Horario de los ${plural}: ${hhmm(abre)} a ${hhmm(cierra)}`;
  const vista: Omit<VistaAgenda, "firma"> = { fecha, canchas, paso, desde: abre, filas, horas, turnos, libres, bloqueos, ahora: filaAhora, resumen, diaTitulo, horarioTexto };
  return {
    ...vista,
    firma: [fecha, abre, cierra, paso, filaAhora, resumen, diaTitulo, canchas.map((c) => `${c.id}:${c.nombre}:${c.detalle}`).join(","), turnos.map((t) => t.firma).join("|"), libres.map((l) => `${l.id}:${l.cuantoEntra}`).join(","), bloqueos.map((b) => `${b.id}:${b.fila}:${b.alto}`).join(",")].join("#"),
  };
}

function firmaDe(c: Omit<CeldaTurno, "firma">): string {
  return [c.id, c.columna, c.fila, c.alto, c.titular, c.horario, c.jugadores, c.tipo, c.estado, c.marca.tipo, c.marca.texto, c.senal, c.deudor, c.atencion, c.nuevo, c.web, c.momento.map((b) => `${b.accion}:${b.texto}:${b.monto}${b.ocupada ? `:${b.ocupada.cerrarId}:${b.ocupada.aCuenta}:${b.ocupada.sena}:${b.etiqueta}` : ""}`).join(",")].join("¦");
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
    return v && v.fila === l.fila && v.etiqueta === l.etiqueta && v.cuantoEntra === l.cuantoEntra ? v : l;
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
  /** «Vie» · «Hoy» · «Dom» · «Lun»… */
  nombre: string;
  /** «Ayer» · «Hoy» · «Mañana» o null: lo que el lector oye antes del día. */
  cerca: string | null;
  /** «17/10». */
  ddmm: string;
  /** Para el lector de pantalla: «hoy, viernes 17/10». */
  etiqueta: string;
}

/** Cuántos días antes de hoy se pueden mirar en la agenda (el vanilla: ayer). */
export const DIAS_ANTES = 1;
/** Cuántos días después de hoy (el vanilla: hasta hoy + 5). */
export const DIAS_DESPUES = 5;

/** Un día de la agenda como se lee arriba (`i`: cuántos días desde hoy). */
function diaDeLaAgenda(hoy: Fecha, i: number): DiaDeLaAgenda {
  const fecha = sumarDias(hoy, i);
  const semana = NOMBRE_DIA[diaSemana(fecha)];
  const ddmm = `${Number(fecha.slice(8))}/${Number(fecha.slice(5, 7))}`;
  const cerca = i === -1 ? "Ayer" : i === 0 ? "Hoy" : i === 1 ? "Mañana" : null;
  // Como el club de hoy: «Vie · Hoy · Dom» (el nombre del día, salvo hoy). «Ayer» y «Mañana» quedan para el lector.
  return { fecha, nombre: i === 0 ? "Hoy" : semana.slice(0, 3), cerca, ddmm, etiqueta: `${cerca ? `${cerca}, ` : ""}${semana.toLowerCase()} ${ddmm}` };
}

/** Días entre dos fechas (`b - a`), sin depender de la zona horaria. */
const diasEntre = (a: Fecha, b: Fecha) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);

/**
 * Los días que se eligen arriba de la agenda: ayer, hoy y los cinco que siguen (los de `vistaAgenda` del vanilla,
 * `[-1, 0, 1, 2, 3, 4, 5]`). Ayer sirve para cobrar lo que quedó de anoche o revisar una falta; la grilla es la misma.
 * Con `elegido` (BP-013, el calendario): si cae fuera de esos 7 y dentro de la ventana (hasta `diasAdelante`, el mismo
 * número que el turnero), se suma al final como un botón más.
 */
export function diasDeLaAgenda(hoy: Fecha, elegido?: Fecha | null, diasAdelante = DIAS_ADELANTE_DE_FABRICA): DiaDeLaAgenda[] {
  const dias: DiaDeLaAgenda[] = [];
  for (let i = -DIAS_ANTES; i <= DIAS_DESPUES; i++) dias.push(diaDeLaAgenda(hoy, i));
  if (elegido && !dias.some((d) => d.fecha === elegido)) {
    const i = diasEntre(hoy, elegido);
    if (i > DIAS_DESPUES && i <= diasAdelante) dias.push(diaDeLaAgenda(hoy, i));
  }
  return dias;
}

/** Hasta cuántos días adelante se reserva si la configuración no dice otra cosa (el motor: `config.diasAdelante`). */
export const DIAS_ADELANTE_DE_FABRICA = 14;

/**
 * El calendario de la agenda (BP-013): desde hoy hasta hoy + `config.diasAdelante` (14: +13 sí, +15 no). `elegir`
 * dice si una fecha tipeada o elegida entra (null) o por qué no.
 */
export function calendarioDeLaAgenda(estado: EstadoClub, hoy: Fecha): { min: Fecha; max: Fecha; dias: number; texto: string } {
  const dias = Number.isInteger(estado.config.diasAdelante) && estado.config.diasAdelante > 0 ? estado.config.diasAdelante : DIAS_ADELANTE_DE_FABRICA;
  const max = sumarDias(hoy, dias);
  return { min: hoy, max, dias, texto: `Se reserva hasta el ${NOMBRE_DIA[diaSemana(max)].toLowerCase()} ${Number(max.slice(8))}/${Number(max.slice(5, 7))} (${dias} días).` };
}

/** ¿Esa fecha se puede elegir en el calendario? null si sí; si no, por qué (en criollo). */
export function fueraDelCalendario(cal: { min: Fecha; max: Fecha; texto: string }, fecha: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return "Elegí un día del calendario.";
  if (fecha < cal.min) return "Ese día ya pasó: para mirar ayer, tocá «Ayer».";
  if (fecha > cal.max) return `Todavía no se reserva para ese día. ${cal.texto}`;
  return null;
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

// ───────────── el menú rápido del turno (clic derecho o mantener apretado) ─────────────

export type OpcionDelMenu = {
  accion: "abrirCancha" | "cobrarSenaYAbrir" | "cerrarCancha" | "ver" | "mover" | "falta";
  texto: string;
  /** «Cobrar la seña y abrir»: el medio elegido en el segundo paso del menú (sin medio, el menú muestra los 4). */
  medio?: MedioCaja;
  /** «Marcar falta…»: va separada y en rojo, como el club de hoy (`class="peligro"`). */
  peligro?: boolean;
};

/**
 * Lo que ofrece el menú rápido sobre un turno, como el club de hoy (app.mjs `menuTurno`): abrir la cancha si llegan
 * hoy, cerrarla si no debe nada, cobrar (o ver) en su cuenta, y «Mover…» y «Marcar falta…», que abren los MISMOS
 * formularios de la cuenta del turno (CicloDelTurno). Cuándo se ofrecen lo dice `opcionesCiclo` (ciclo-core.ts), la
 * misma regla que muestra esos botones en la cuenta: mover mientras está reservado o en juego, la falta sólo
 * reservado (la tolerancia y a quién se cobra los decide el formulario con `previaFalta`). PURO.
 */
export function opcionesDelMenu(estado: EstadoClub, reservaId: string, hoy: Fecha): OpcionDelMenu[] {
  const r = estado.reservas.find((x) => x.id === reservaId);
  if (!r) return [];
  const s = saldo(r);
  const abierto = r.estado === "reservada" || r.estado === "en_cancha";
  const ciclo = opcionesCiclo(r);
  const out: OpcionDelMenu[] = [];
  // BP-005: con la seña sin pagar, «Cobrar la seña y abrir» (despliega los medios) en vez de «Abrir cancha».
  const sena = senaSinPagar(r);
  if (r.estado === "reservada" && r.fecha === hoy)
    out.push(sena === null ? { accion: "abrirCancha", texto: "Abrir cancha" } : { accion: "cobrarSenaYAbrir", texto: sena > 0 ? `Cobrar la seña y abrir · ${pesos(sena)}` : "Abrir cancha (seña cubierta)" });
  if (r.estado === "en_cancha" && s <= 0) out.push({ accion: "cerrarCancha", texto: "Cerrar cancha" });
  out.push({ accion: "ver", texto: abierto && s > 0 ? `Cobrar · ${pesos(s)}` : "Ver turno y cargos" });
  if (ciclo.mover) out.push({ accion: "mover", texto: "Mover…" });
  if (ciclo.falta) out.push({ accion: "falta", texto: "Marcar falta…", peligro: true });
  return out;
}

// ───────────── correr la grilla cuando el arrastre llega al borde ─────────────

/** Ancho de la franja del borde (px) donde el arrastre empieza a correr la grilla, y lo más rápido que la corre (px por cuadro). */
export const BORDE_ARRASTRE = { zona: 40, maxima: 18 } as const;

/**
 * Cuánto correr la grilla en un eje (px por cuadro, con signo) con el puntero en `pos` y la parte VISIBLE de la grilla
 * entre `desde` y `hasta` (arriba, debajo de la cabecera fija; a la izquierda, después de la columna de horas). Cero en
 * el medio; crece a medida que el puntero se mete en la franja del borde y es la máxima fuera de la grilla. Una grilla
 * más chica que dos franjas usa un tercio de su largo, para que siempre quede un medio quieto. PURO.
 */
export function velocidadAlBorde(pos: number, desde: number, hasta: number, borde: { zona: number; maxima: number } = BORDE_ARRASTRE): number {
  const largo = hasta - desde;
  if (!(largo > 0)) return 0;
  const zona = Math.min(borde.zona, largo / 3);
  const cuanto = (adentro: number) => Math.ceil(borde.maxima * Math.min(1, adentro / zona));
  if (pos < desde + zona) return -cuanto(desde + zona - pos);
  if (pos > hasta - zona) return cuanto(pos - (hasta - zona));
  return 0;
}

// ───────────── arrastrar y estirar un turno en la grilla ─────────────

export type PreviaArrastre =
  | { modo: "mover"; canchaId: string; columna: number; fila: number; alto: number; inicio: number; ok: boolean; motivo: string }
  | { modo: "estirar"; columna: number; fila: number; alto: number; minutos: number; ok: boolean; motivo: string };

/**
 * Dónde caería un turno arrastrado a (columna, fila) de la grilla, y si entra (el mismo control de solapes que «Mover»:
 * `validarHueco`). Para estirar, cuántos minutos se suman (en pasos de la grilla) y si el hueco de abajo está libre
 * (el de «Extender»). PURO.
 */
export function previaArrastre(
  estado: EstadoClub,
  vista: Pick<VistaAgenda, "canchas" | "paso" | "desde" | "filas" | "fecha">,
  reservaId: string,
  a: { modo: "mover"; columna: number; fila: number } | { modo: "estirar"; filas: number },
  ahora: Ahora,
): PreviaArrastre | null {
  const r = estado.reservas.find((x) => x.id === reservaId);
  if (!r || (r.estado !== "reservada" && r.estado !== "en_cancha")) return null;
  // Las mismas reglas del diálogo «Mover» (destinosParaMover, ciclo-core.ts): jugando, sólo otra cancha a la misma hora;
  // reservado, nunca a una hora en la que ya habría terminado. Y no se estira un turno reservado que ya terminó sin
  // jugarse (uno en cancha, sí: se quedan más tiempo). Las mismas reglas valida el motor en `mover` y `extender`.
  const yaTermino = r.estado === "reservada" && minutosHasta(ahora, r.fecha, r.inicio + r.duracion) <= 0;
  const alto = Math.max(1, Math.round(r.duracion / vista.paso));
  const columnaDe = vista.canchas.findIndex((c) => c.id === r.canchaId);
  const filaDe = Math.round((r.inicio - vista.desde) / vista.paso);
  if (a.modo === "estirar") {
    const minutos = Math.max(0, Math.round(a.filas)) * vista.paso;
    if (minutos === 0) return { modo: "estirar", columna: columnaDe, fila: filaDe, alto, minutos, ok: false, motivo: "" };
    const v = yaTermino ? { ok: false as const, motivo: "Ese turno ya terminó: no se puede alargar." } : validarHueco(estado, { canchaId: r.canchaId, fecha: r.fecha, inicio: r.inicio + r.duracion, duracion: minutos });
    return { modo: "estirar", columna: columnaDe, fila: filaDe, alto: alto + minutos / vista.paso, minutos, ok: v.ok, motivo: v.ok ? "" : v.motivo };
  }
  const columna = Math.min(Math.max(0, a.columna), vista.canchas.length - 1);
  const fila = Math.min(Math.max(0, a.fila), Math.max(0, vista.filas - alto));
  const canchaId = vista.canchas[columna].id;
  const inicio = vista.desde + fila * vista.paso;
  const igual = canchaId === r.canchaId && inicio === r.inicio;
  const v = igual
    ? { ok: false as const, motivo: "" }
    : r.estado === "en_cancha" && inicio !== r.inicio
      ? { ok: false as const, motivo: "Están jugando: sólo se puede pasar a otra cancha, a la misma hora." }
      : r.estado !== "en_cancha" && minutosHasta(ahora, r.fecha, inicio) + r.duracion <= 0
        ? { ok: false as const, motivo: "Esa hora ya pasó." }
        : validarHueco(estado, { canchaId, fecha: r.fecha, inicio, duracion: r.duracion }, r.id);
  return { modo: "mover", canchaId, columna, fila, alto, inicio, ok: v.ok, motivo: v.ok ? "" : v.motivo };
}

// ───────────── el botón del momento (bp-DISENO §1.1 principio 1, §2.2) ─────────────

/**
 * Lo que el turno pide AHORA, a un toque desde la grilla (sin abrir la hoja). La hoja queda para lo demás.
 *   · `abrir`: reservado, seña paga o no pedida, falta ≤ 15 min (o ya empezó, dentro de la tolerancia). Con `deuda`
 *     (el titular debe de antes) el bloque lleva el punto rojo y el toque pregunta «Cobrar ahora / Después».
 *   · `cobrarSenaYAbrir`: igual, con la seña sin pagar (`monto`: lo que falta de la seña; 0 = cubierta con pagos).
 *   · `extender`: en cancha y le quedan ≤ 10 min, si el hueco de después está libre: «+30 min · $7.000».
 *   · `cobrar`: en cancha, terminó (o termina y no se puede extender) y la cancha debe `monto`.
 *   · `cerrar` + `mesaSigue`: en cancha, terminó y está paga.
 *   · `noVino`: reservado y pasó la tolerancia (abre «Marcar falta» de la cuenta: titular o grupo, y el WhatsApp).
 *   · `cerrarYAbrir` (Tanda 2, integración de 2C + 2D): es la hora de abrir pero la cancha sigue ocupada por el anterior
 *     (`canchaOcupada` de cuenta-core): «Cerrar la de X y abrir» desde el bloque, con lo que debe X (sus medios o su
 *     cuenta corriente), la seña del que llega y «la mesa sigue», en UN comando «cierre». Sin entrar a la cuenta.
 */
export type AccionDelMomento = "abrir" | "cobrarSenaYAbrir" | "extender" | "cobrar" | "cerrar" | "mesaSigue" | "noVino" | "cerrarYAbrir";

export interface BotonDelMomento {
  accion: AccionDelMomento;
  /** Lo que se lee en el botón (corto: el bloque mide 140 px). */
  texto: string;
  /** La frase completa para el lector de pantalla («Cobrar la seña de $ 21.000 y abrir la cancha de Juan»). */
  etiqueta: string;
  /** La plata en juego: la seña, la extensión, lo que debe la cancha o la deuda de antes (0 si no hay). */
  monto: number;
  /** `extender`: cuántos minutos suma. */
  minutos?: number;
  /**
   * `cerrarYAbrir`: el turno que ocupa la cancha (se cierra), su titular, lo que debe (= `monto`), si puede ir a su cuenta
   * corriente, la seña sin pagar del que llega (lo que falta; 0 = cubierta con pagos; null = no pide) y quién llega.
   */
  ocupada?: { cerrarId: string; titular: string; debe: number; aCuenta: boolean; sena: number | null; llega: string };
}

/** Desde cuántos minutos antes del turno aparece «Abrir» (o lo que diga `minutosAntesParaEntrar`, si es menos). */
export const MINUTOS_PARA_ABRIR = 15;
/** Desde cuántos minutos antes del final aparece «+30 min». */
export const MINUTOS_PARA_EXTENDER = 10;
/** Lo que suma «+30 min». */
export const MINUTOS_DE_EXTENSION = 30;

/** El botón (o los dos) del momento para ese turno con ese reloj. PURO: sólo lee. */
export function botonesDelMomento(estado: EstadoClub, r: Reserva, ahora: Ahora): BotonDelMomento[] {
  const { politica } = estado.config;
  const quien = r.titular;
  if (r.estado === "reservada") {
    const falta = minutosHasta(ahora, r.fecha, r.inicio);
    const tolerancia = politica.toleranciaMin ?? 15;
    // Pasó la tolerancia (o el turno terminó sin jugarse): «No vino».
    if (falta < -tolerancia || falta + r.duracion <= 0) return [{ accion: "noVino", texto: "No vino", etiqueta: `${quien} no vino: marcar la falta`, monto: 0 }];
    const limite = politica.minutosAntesParaEntrar;
    const ventana = limite == null ? MINUTOS_PARA_ABRIR : Math.min(MINUTOS_PARA_ABRIR, limite);
    if (falta > ventana) return [];
    // La cancha sigue ocupada por el anterior: «Abrir» diría «sigue ocupada». Si este es el que sigue, «Cerrar la de X y
    // abrir» (un comando); si antes hay otro turno reservado, nada (se abre desde ese).
    const ocupada = canchaOcupada(estado, r);
    if (ocupada) {
      if (!ocupada.esElQueSigue) return [];
      const { cerrarId, titular, debe, aCuenta, sena: senaQueFalta } = ocupada;
      const extras = [debe > 0 ? `${titular} debe ${pesos(debe)}` : "", senaQueFalta ? `seña de ${quien} ${pesos(senaQueFalta)}` : ""].filter(Boolean).join("; ");
      return [
        {
          accion: "cerrarYAbrir",
          texto: "Cerrar y abrir",
          etiqueta: `${ocupada.cancha} sigue ocupada por ${titular}: cerrar la de ${titular} y abrir la de ${quien}${extras ? ` (${extras})` : ""}`,
          monto: debe,
          ocupada: { cerrarId, titular, debe, aCuenta, sena: senaQueFalta, llega: quien },
        },
      ];
    }
    const sena = senaSinPagar(r);
    if (sena !== null)
      return [{ accion: "cobrarSenaYAbrir", texto: sena > 0 ? "Seña y abrir" : "Abrir", etiqueta: sena > 0 ? `Cobrar la seña de ${pesos(sena)} y abrir la cancha de ${quien}` : `Abrir la cancha de ${quien} (la seña ya está cubierta)`, monto: sena }];
    const cl = r.clienteId ? clienteDe(estado, r.clienteId) : undefined;
    const deuda = cl && cl.deuda > 0 ? cl.deuda : 0;
    return [{ accion: "abrir", texto: "Abrir", etiqueta: `Abrir la cancha de ${quien}${deuda ? ` (debe ${pesos(deuda)} de antes)` : ""}`, monto: deuda }];
  }
  if (r.estado !== "en_cancha") return [];
  const fin = minutosHasta(ahora, r.fecha, r.inicio + r.duracion);
  if (fin > MINUTOS_PARA_EXTENDER) return [];
  const debe = saldo(r);
  if (fin > 0) {
    const hueco = { canchaId: r.canchaId, fecha: r.fecha, inicio: r.inicio + r.duracion, duracion: MINUTOS_DE_EXTENSION };
    if (validarHueco(estado, hueco).ok) {
      const precio = precioTurno(estado, hueco);
      return [{ accion: "extender", texto: `+${MINUTOS_DE_EXTENSION} min · ${pesos(precio)}`, etiqueta: `Extender ${MINUTOS_DE_EXTENSION} minutos el turno de ${quien} por ${pesos(precio)}`, monto: precio, minutos: MINUTOS_DE_EXTENSION }];
    }
    // No se puede extender (viene otro turno): que se vayan pagos.
    return debe > 0 ? [{ accion: "cobrar", texto: `Cobrar ${pesos(debe)}`, etiqueta: `Cobrar ${pesos(debe)} de la cancha de ${quien}`, monto: debe }] : [];
  }
  if (debe > 0) return [{ accion: "cobrar", texto: `Cobrar ${pesos(debe)}`, etiqueta: `Cobrar ${pesos(debe)} de la cancha de ${quien}`, monto: debe }];
  return [
    { accion: "cerrar", texto: "Cerrar", etiqueta: `Cerrar la cancha de ${quien}`, monto: 0 },
    { accion: "mesaSigue", texto: "La mesa sigue", etiqueta: `Cerrar la cancha de ${quien}: la mesa sigue en el buffet`, monto: 0 },
  ];
}

/**
 * «Abrir» de un turno cuyo titular debe de antes → «Cobrar ahora»: la deuda entera con un medio y la cancha abierta, en
 * UN comando (`abrirConDeuda`). O pasan las dos o ninguna: si la cancha no se puede abrir (temprano, ocupada, falta la
 * seña, ya abierta) no se cobra nada. Re-aplicado en otro puesto donde la deuda ya se cobró, abre sin cobrar dos veces.
 */
export function abrirCobrandoLaDeuda(estado: EstadoClub, reservaId: string, medio: MedioCaja, ahora: Ahora): Desenlace {
  const r = estado.reservas.find((x) => x.id === reservaId);
  if (!r) return { ok: false, mensaje: "No encuentro el turno." };
  if (r.estado === "en_cancha") return { ok: false, mensaje: "La cancha ya está abierta: no se cobró nada." };
  if (r.estado !== "reservada") return { ok: false, mensaje: `El turno está ${ESTADOS[r.estado].toLowerCase()}: no se cobró nada.` };
  if (senaSinPagar(r) !== null) return { ok: false, mensaje: "Falta la seña: usá «Cobrar la seña y abrir»." };
  if (!(MEDIOS_CAJA as readonly string[]).includes(medio)) return { ok: false, mensaje: "Elegí cómo paga (efectivo, Mercado Pago, transferencia o débito)." };
  const cl = r.clienteId ? clienteDe(estado, r.clienteId) : undefined;
  const deuda = cl && cl.deuda > 0 ? cl.deuda : 0;
  // Primero la cancha: si no se puede abrir, no se tocó nada. Después la deuda (ya validada: no puede fallar).
  const abierto = checkIn(estado, r.id, ahora);
  if (!abierto.ok) return { ok: false, mensaje: `${abierto.motivo} No se cobró nada.` };
  if (!cl || !deuda) return { ok: true, mensaje: "Cancha abierta y luz prendida (ya no debía nada)." };
  const cobro = cobrarDeuda(estado, cl.id, { medio }, ahora);
  if (!cobro.ok) return { ok: true, mensaje: `Cancha abierta. La deuda no se cobró: ${cobro.motivo}` };
  return { ok: true, mensaje: `Cobrados ${pesos(cobro.monto)} de la deuda de ${cl.nombre} (${ETIQUETA_MEDIO[medio]}). Cancha abierta y luz prendida.` };
}

// ───────────── «Buscar lugar» (bp-DISENO §3.2, Rec. 7) ─────────────

export interface LugarEncontrado {
  canchaId: string;
  cancha: string;
  inicio: number;
  duracion: number;
  precio: number;
  /** Entra justo a la hora pedida. */
  exacto: boolean;
  /** «Cancha 4 · 20:00 · $ 42.000» (con la hora siempre: si no es la pedida, se ve). */
  etiqueta: string;
}

/**
 * «Buscar lugar 20:00 · 90»: una opción por cancha — la que ENTRA a esa hora primero y, después, el hueco más cerca de
 * esa hora en cada una (a igual distancia, el de antes). Tocar una abre el alta armada. Nada que ya pasó (salvo la hora
 * pedida si todavía está en juego, como el alta) ni fuera de la ventana de reserva; las canchas en mantenimiento no.
 */
export function buscarLugar(estado: EstadoClub, pedido: { fecha: Fecha; inicio: number; duracion: number }, ahora: Ahora): { opciones: LugarEncontrado[]; aviso: string | null } {
  const { fecha, inicio, duracion } = pedido;
  const cal = calendarioDeLaAgenda(estado, ahora.fecha);
  if (fecha > cal.max) return { opciones: [], aviso: `Todavía no se reserva para ese día. ${cal.texto}` };
  if (fecha < ahora.fecha) return { opciones: [], aviso: "Ese día ya pasó." };
  const vale = (m: number) => minutosHasta(ahora, fecha, m) >= 0 || (m === inicio && minutosHasta(ahora, fecha, m) + duracion > 0);
  const opciones: (LugarEncontrado & { distancia: number; orden: number })[] = [];
  estado.canchas.forEach((c, orden) => {
    const libres = huecosLibres(estado, fecha, c.id, duracion).filter(vale);
    let mejor: number | undefined;
    for (const m of libres) if (mejor === undefined || Math.abs(m - inicio) < Math.abs(mejor - inicio)) mejor = m;
    if (mejor === undefined) return;
    const precio = precioTurno(estado, { canchaId: c.id, fecha, inicio: mejor, duracion });
    opciones.push({ canchaId: c.id, cancha: c.nombre, inicio: mejor, duracion, precio, exacto: mejor === inicio, etiqueta: `${c.nombre} · ${hhmm(mejor)} · ${pesos(precio)}`, distancia: Math.abs(mejor - inicio), orden });
  });
  opciones.sort((a, b) => Number(b.exacto) - Number(a.exacto) || a.distancia - b.distancia || a.inicio - b.inicio || a.orden - b.orden);
  const aviso = opciones.length === 0 ? `No queda lugar de ${duracion} min ese día.` : opciones[0].exacto ? null : `A las ${hhmm(inicio)} no entran ${duracion} min en ninguna cancha: esto es lo más cerca.`;
  return { opciones: opciones.map((o) => ({ canchaId: o.canchaId, cancha: o.cancha, inicio: o.inicio, duracion: o.duracion, precio: o.precio, exacto: o.exacto, etiqueta: o.etiqueta })), aviso };
}

/** Las horas para «Buscar lugar»: las de la grilla de ese día (cada `paso`), desde la apertura hasta el cierre. */
export function horasParaBuscar(estado: EstadoClub, fecha: Fecha): { min: number; texto: string }[] {
  const { abre, cierra } = horarioDe(estado, fecha);
  const out: { min: number; texto: string }[] = [];
  for (let m = abre; m < cierra; m += estado.config.paso) out.push({ min: m, texto: hhmm(m) });
  return out;
}

/** La hora que propone «Buscar lugar»: 20:00 (la que más se pide) si ese día está y no pasó; si no, el próximo paso. */
export function horaPorDefecto(estado: EstadoClub, fecha: Fecha, ahora: Ahora): number {
  const horas = horasParaBuscar(estado, fecha);
  const vigente = (m: number) => minutosHasta(ahora, fecha, m) >= 0;
  return (horas.find((h) => h.min === 20 * 60 && vigente(h.min)) ?? horas.find((h) => vigente(h.min)) ?? horas[0])?.min ?? 20 * 60;
}
