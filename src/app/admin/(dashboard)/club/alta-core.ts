// ============================================================================
// DAR UN TURNO — el alta desde la agenda. PURO.
// ============================================================================
//
// Recepción toca una franja libre (o «+ Turno») y carga: la cancha, la hora, cuánto dura y a nombre de quién. La
// pantalla sólo ofrece horarios que el motor acepta (`huecosLibres`: no se pisa con otro turno ni con un bloqueo,
// dentro del horario del día y alineado a la grilla) y muestra, ANTES de reservar, el precio (valle/pico integrado
// minuto a minuto por `precioTurno`) y si pide seña (`requiereSena`: reincidentes, con deuda, sin ficha). Reservar
// es `crearReserva`, que vuelve a validar todo: la pantalla propone, el motor decide.
//
// Titular nuevo con teléfono («para darlo de alta», como el vanilla app.mjs:1662 y :1680-1681): al reservar se le da de
// alta la ficha (`altaCliente`) y el turno queda atado a ella. El teléfono se compara con la clave de siempre
// (`normalizarTelefono`): si ya hay una ficha con ese número escrito de otra forma, se usa ésa y no se duplica. Si el
// turno no se puede reservar, la ficha recién dada de alta no queda.
//
// LA SEÑA SE DECIDE UNA VEZ (reingeniería BP, 1A · BP-001): la previa mira al titular como va a quedar —la ficha
// elegida, la que ya tiene ese teléfono o una ficha NUEVA (0 turnos jugados: con `senaNuevos`, «cliente nuevo»)— y
// `reservar` le pasa esa misma decisión a `crearReserva` (`conSena`). Antes la ficha se creaba antes de reservar y el
// motor la veía limpia: la previa decía «pide seña» y el turno quedaba sin seña.
//
// LA HORA NO SE TOCA (BP-010…012): si en esa cancha y a esa hora no entra la duración, la previa lo dice
// («A las 20:30 en Cancha 2 entran 30 min (Beto juega 21:00)»), «Reservar» queda apagado y `alternativas` ofrece
// otra cancha a la misma hora, el siguiente hueco en esa cancha, una duración menor acá y anotarlo en espera.

import { altaCliente, anotarEspera, buscarClientes, cancha as canchaDe, cliente as clienteDe, crearFijo, crearReserva, cuantoEntra, diaSemana, franjaDe, hhmm, horarioDe, huecosLibres, materializarFijos, minutosHasta, montoSena, motivoSena, NOMBRE_DIA, pesos, precioTurno, sumarDias, validarHueco } from "@/lib/club/motor.mjs";
import type { Ahora, Cliente, CorteDelHueco, EstadoClub, Fecha, TipoReserva } from "@/lib/club/motor.mjs";
import { normalizarTelefono } from "@/lib/clientes/telefono";
import type { Desenlace } from "./almacen";
import { otroFijoQuePisa } from "./canchas-core";

export const DURACIONES = [60, 90, 120] as const;
export const TIPOS_ALTA: readonly { valor: Extract<TipoReserva, "turno" | "clase" | "abierto">; etiqueta: string }[] = [
  { valor: "turno", etiqueta: "Turno" },
  { valor: "clase", etiqueta: "Clase" },
  { valor: "abierto", etiqueta: "Partido abierto" },
];

/**
 * «Llegó por»: por dónde pidió el turno, con las opciones exactas del «Nuevo turno» del club de hoy (club.html, `#f-origen`).
 * El valor es el que guarda el vanilla (`reserva.origen`); «mostrador» es el de fábrica, como en el motor (`crearReserva`).
 * «web», «fijo» y «lista de espera» no se ofrecen: esos turnos los da el sistema, no recepción.
 */
export const ORIGENES_ALTA = [
  { valor: "mostrador", etiqueta: "Mostrador" },
  { valor: "whatsapp", etiqueta: "WhatsApp" },
  { valor: "teléfono", etiqueta: "Teléfono" },
  { valor: "instagram", etiqueta: "Instagram" },
] as const;
export type OrigenAlta = (typeof ORIGENES_ALTA)[number]["valor"];
export const ORIGEN_DE_FABRICA: OrigenAlta = "mostrador";

export interface DatosAlta {
  canchaId: string;
  fecha: Fecha;
  inicio: number;
  duracion: number;
  tipo: "turno" | "clase" | "abierto";
  titular: string;
  clienteId: string | null;
  /** Los demás jugadores, separados por coma (hasta 3). */
  otros: string;
  /** Sin ficha: el teléfono para darlo de alta al reservar (vacío = el turno queda sin ficha). */
  tel?: string;
  /** «Llegó por» (vacío = «mostrador», el de fábrica del motor). */
  origen?: OrigenAlta;
  /**
   * «Fijo semanal» (Tanda 3C, Rec. 12): sólo con «Turno». El turno queda como el primero de un fijo de ese día y hora
   * (`fijo.desde` = este día) y las próximas `SEMANAS_DEL_FIJO` fechas se bajan a la grilla en el acto (la que choca,
   * no se pisa: lo dijo la previa, `previaFijoSemanal`).
   */
  fijo?: boolean;
}

/** Cuántas semanas siguientes se bajan a la grilla al dar un turno como «Fijo semanal» (y muestra la previa). */
export const SEMANAS_DEL_FIJO = 4;

export interface FechaDelFijo {
  fecha: Fecha;
  entra: boolean;
  /** «30/10 ✔» o «6/11 · se pisa con Beto (20:00–21:30)». */
  texto: string;
}

/**
 * La previa del interruptor «Fijo semanal»: las próximas `SEMANAS_DEL_FIJO` fechas del mismo día, hora, cancha y
 * duración, y si entran. Mira lo que hay en la grilla (`validarHueco`) Y los otros fijos que todavía no se bajaron
 * (un fijo de otro que juega ese día a esa hora también choca). PURA: no toca el estado.
 */
export function previaFijoSemanal(estado: EstadoClub, d: Pick<DatosAlta, "canchaId" | "fecha" | "inicio" | "duracion">): FechaDelFijo[] {
  return Array.from({ length: SEMANAS_DEL_FIJO }, (_, i) => sumarDias(d.fecha, 7 * (i + 1))).map((fecha) => {
    const dd = `${Number(fecha.slice(8))}/${Number(fecha.slice(5, 7))}`;
    const v = validarHueco(estado, { canchaId: d.canchaId, fecha, inicio: d.inicio, duracion: d.duracion });
    if (!v.ok) return { fecha, entra: false, texto: `${dd} · ${v.motivo.replace(/\.$/, "").replace(/^Se pisa/, "se pisa")}` };
    const otro = otroFijoQuePisa(estado, { canchaId: d.canchaId, fecha, inicio: d.inicio, duracion: d.duracion });
    if (otro) return { fecha, entra: false, texto: `${dd} · se pisa con el fijo de ${otro.titular} (${hhmm(otro.inicio)})` };
    return { fecha, entra: true, texto: `${dd} ✔` };
  });
}

/** Lo mínimo para que un teléfono sirva (área + número argentino: 10; se aceptan 8 para fijos del interior viejos). */
const DIGITOS_MINIMOS = 8;

/**
 * La ficha del titular nuevo: la que ya tiene ese teléfono (escrito como sea) o una nueva. Pura salvo el alta.
 * Devuelve también si se creó (para sacarla si el turno no se puede reservar).
 */
export function fichaPorTelefono(estado: EstadoClub, nombre: string, tel: string): { ok: true; clienteId: string; nueva: boolean } | { ok: false; motivo: string } {
  const clave = normalizarTelefono(tel);
  if (clave.length < DIGITOS_MINIMOS) return { ok: false, motivo: "Revisá el teléfono: le faltan números (con el código de área, ej. 11 5555-0001)." };
  const ya = fichaConTelefono(estado, tel);
  if (ya) return { ok: true, clienteId: ya.id, nueva: false };
  const alta = altaCliente(estado, { nombre, tel: tel.trim() });
  return alta.ok ? { ok: true, clienteId: alta.cliente.id, nueva: true } : { ok: false, motivo: alta.motivo };
}

/** La ficha activa que ya tiene ese teléfono (escrito como sea), sin dar nada de alta. PURA. */
function fichaConTelefono(estado: EstadoClub, tel: string): Cliente | undefined {
  const clave = normalizarTelefono(tel);
  if (clave.length < DIGITOS_MINIMOS) return undefined;
  return estado.clientes.find((c) => c.activo !== false && normalizarTelefono(c.tel) === clave);
}

/** Id de la ficha que todavía no existe (sólo para mirar la seña de un titular nuevo; nunca se guarda). */
const FICHA_POR_DAR = "__ficha-nueva__";

/**
 * La seña de este alta, decidida UNA vez: con la ficha elegida, con la que ya tiene ese teléfono, o —titular nuevo con
 * teléfono— como la ficha nueva que va a quedar (0 turnos jugados, sin faltas ni deuda). Sin teléfono, sin ficha. PURA:
 * la ficha nueva se mira sobre una vista del estado, no se agrega.
 */
export function senaDelAlta(estado: EstadoClub, d: Pick<DatosAlta, "tipo" | "clienteId"> & Partial<Pick<DatosAlta, "tel" | "titular">>): { pide: boolean; motivo: string | null } {
  let clienteId = d.clienteId;
  let vista = estado;
  if (!clienteId && d.tel?.trim() && normalizarTelefono(d.tel).length >= DIGITOS_MINIMOS) {
    const ya = fichaConTelefono(estado, d.tel);
    if (ya) clienteId = ya.id;
    else {
      const nueva = { id: FICHA_POR_DAR, nombre: d.titular?.trim() ?? "", tel: d.tel.trim(), nivel: "", strikes: 0, monedero: 0, deuda: 0, activo: true, cc: { habilitada: false, limite: 0 }, movCC: [], fiados: [] } as unknown as Cliente;
      vista = { ...estado, clientes: [...estado.clientes, nueva] };
      clienteId = FICHA_POR_DAR;
    }
  }
  const motivo = motivoSena(vista, clienteId, d.tipo);
  return { pide: motivo !== null, motivo };
}

/** Hasta qué día se puede dar un turno (`config.diasAdelante` desde hoy, inclusive). */
export function ventanaDeReserva(estado: EstadoClub, ahora: Ahora): { dias: number; hasta: Fecha } {
  const dias = estado.config.diasAdelante ?? 14;
  return { dias, hasta: sumarDias(ahora.fecha, dias) };
}

const fechaLinda = (f: Fecha) => `${NOMBRE_DIA[diaSemana(f)].slice(0, 3).toLowerCase()} ${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;

/** Por qué ese día queda fuera de la ventana de reserva (o `null`). */
function fueraDeVentana(estado: EstadoClub, fecha: Fecha, ahora: Ahora | undefined): string | null {
  if (!ahora) return null;
  const { dias, hasta } = ventanaDeReserva(estado, ahora);
  return fecha > hasta ? `Los turnos se dan hasta ${dias} días adelante (hasta el ${fechaLinda(hasta)}).` : null;
}

/** La regla del motor para el mostrador (`crearReserva`): un turno ya pasó si terminó (se puede cargar uno en juego). */
const yaPaso = (ahora: Ahora | undefined, fecha: Fecha, inicio: number, duracion: number) => !!ahora && minutosHasta(ahora, fecha, inicio) + duracion <= 0;
/** Lo que dice el motor al reservar un horario que ya pasó (H3 de la cert: la previa lo dice antes de tocar «Reservar»). */
export const YA_PASO = "Ese horario ya pasó.";

/** Los horarios libres de una cancha para esa duración, que todavía no pasaron. */
export function horariosLibres(estado: EstadoClub, fecha: Fecha, canchaId: string, duracion: number, ahora: Ahora): { min: number; texto: string }[] {
  return huecosLibres(estado, fecha, canchaId, duracion)
    .filter((m) => minutosHasta(ahora, fecha, m) + duracion > 0)
    .map((m) => ({ min: m, texto: `${hhmm(m)} a ${hhmm(m + duracion)}` }));
}

/**
 * Cada horario de la grilla de ese día en esa cancha (que todavía no pasó), con si entra la duración y cuánto entra.
 * La hora elegida (`elegida`) está siempre, aunque ya no entre: la lista no la cambia por atrás.
 */
export function horariosDelDia(estado: EstadoClub, fecha: Fecha, canchaId: string, duracion: number, ahora: Ahora, elegida: number | null = null): { min: number; texto: string; entra: boolean; cuanto: number }[] {
  const { paso } = estado.config;
  const { abre, cierra } = horarioDe(estado, fecha);
  const out: { min: number; texto: string; entra: boolean; cuanto: number }[] = [];
  for (let m = abre; m < cierra; m += paso) {
    const pasada = yaPaso(ahora, fecha, m, duracion);
    if (m !== elegida && pasada) continue;
    const cuanto = cuantoEntra(estado, fecha, canchaId, m).minutos;
    // La elegida que ya pasó (el alta quedó abierta) queda en la lista, pero dice que pasó: no se puede reservar.
    if (pasada) {
      out.push({ min: m, entra: false, cuanto, texto: `${hhmm(m)} · ya pasó` });
      continue;
    }
    const entra = validarHueco(estado, { canchaId, fecha, inicio: m, duracion }).ok;
    out.push({ min: m, entra, cuanto, texto: entra ? `${hhmm(m)} a ${hhmm(m + duracion)}` : cuanto >= paso ? `${hhmm(m)} · entran ${cuanto} min` : `${hhmm(m)} · ocupado` });
  }
  if (elegida !== null && !out.some((h) => h.min === elegida)) out.push({ min: elegida, texto: `${hhmm(elegida)} · fuera de horario`, entra: false, cuanto: 0 });
  return out.sort((a, b) => a.min - b.min);
}

export type Previa =
  | { ok: true; precio: number; franja: "pico" | "valle"; pideSena: boolean; sena: number; motivoSena: string | null; texto: string }
  | { ok: false; motivo: string };

/**
 * Lo que va a costar y si pide seña (con el monto y por qué), antes de reservar, o por qué no se puede. La seña es la
 * de `senaDelAlta` y el monto el de `montoSena`: los mismos que va a guardar `reservar`.
 */
export function previaDelTurno(
  estado: EstadoClub,
  d: Pick<DatosAlta, "canchaId" | "fecha" | "inicio" | "duracion" | "tipo" | "clienteId"> & Partial<Pick<DatosAlta, "tel" | "titular">>,
  ahora?: Ahora,
): Previa {
  const ventana = fueraDeVentana(estado, d.fecha, ahora);
  if (ventana) return { ok: false, motivo: ventana };
  if (yaPaso(ahora, d.fecha, d.inicio, d.duracion)) return { ok: false, motivo: YA_PASO };
  const v = validarHueco(estado, d);
  if (!v.ok) return { ok: false, motivo: motivoDelHueco(estado, d) ?? v.motivo };
  const precio = precioTurno(estado, d);
  const franja = franjaDe(estado, d.fecha, d.inicio);
  const { pide, motivo } = senaDelAlta(estado, d);
  const sena = pide ? montoSena(estado, precio) : 0;
  // «pide seña (50 %): $ 21.000, cliente nuevo» — el porcentaje primero, como siempre; después el monto y por qué.
  const texto = `${pesos(precio)} · ${franja === "pico" ? "horario pico" : "horario valle"}${pide ? ` · pide seña (${estado.config.politica.senaPct} %): ${pesos(sena)}${motivo ? `, ${motivo}` : ""}` : " · sin seña"}`;
  return { ok: true, precio, franja, pideSena: pide, sena, motivoSena: motivo, texto };
}

/** Qué corta el hueco, dicho como en el mostrador: «Beto juega 21:00», «cierra 00:00», «bloqueada: clase». */
function quienCorta(corte: CorteDelHueco): string {
  if (corte.tipo === "turno") return `${corte.reserva.titular} juega ${hhmm(corte.reserva.inicio)}`;
  if (corte.tipo === "bloqueo") return `bloqueada desde las ${hhmm(corte.bloqueo.desde)}: ${corte.bloqueo.motivo}`;
  return `cierra ${hhmm(corte.min)}`;
}

/** «A las 20:30 en Cancha 2 entran 30 min (Beto juega 21:00).» — sólo si a esa hora hay lugar pero no alcanza. */
function motivoDelHueco(estado: EstadoClub, d: Pick<DatosAlta, "canchaId" | "fecha" | "inicio" | "duracion">): string | null {
  const { minutos, hasta } = cuantoEntra(estado, d.fecha, d.canchaId, d.inicio);
  if (!(minutos > 0 && minutos < d.duracion) || !hasta) return null;
  return `A las ${hhmm(d.inicio)} en ${canchaDe(estado, d.canchaId)?.nombre ?? "esa cancha"} entran ${minutos} min (${quienCorta(hasta)}).`;
}

/** Una salida de un toque cuando no entra: dejar el alta armada en esa cancha, hora y duración. */
export interface Alternativa {
  canchaId: string;
  inicio: number;
  duracion: number;
  precio: number;
  /** «Cancha 4 · 20:30 · 90 min · $ 42.000», «Cancha 2 · 22:30 · …», «60 min acá · $ 28.000». */
  etiqueta: string;
  tipo: "otraCancha" | "siguienteHueco" | "menosTiempo";
}

export interface Alternativas {
  entra: boolean;
  /** Minutos libres desde esa hora en esa cancha (0 si ya está ocupado). */
  cuantoEntra: number;
  /** El aviso en criollo cuando no entra (o `null`). */
  aviso: string | null;
  /** Hasta 3, en este orden: otra cancha a la misma hora, el siguiente hueco acá, menos tiempo acá. */
  opciones: Alternativa[];
  /** Para «Anotar en espera» con el día, la franja y la duración ya tomados (`anotarEspera`). */
  espera: { fecha: Fecha; desde: number; hasta: number; duracion: number };
}

const MAX_OPCIONES = 3;

/**
 * Si en esa cancha, a esa hora, entra esa duración; y si no, qué se puede ofrecer sin mover nada por atrás. PURA.
 * La hora pedida se respeta: la otra cancha es A ESA HORA; el siguiente hueco es en ESA cancha; la duración menor es
 * acá (una de `DURACIONES` que entre). Lo que ya pasó o queda fuera de la ventana de reserva no se ofrece.
 */
export function alternativas(estado: EstadoClub, d: Pick<DatosAlta, "canchaId" | "fecha" | "inicio" | "duracion">, ahora: Ahora): Alternativas {
  const { paso } = estado.config;
  const cuanto = cuantoEntra(estado, d.fecha, d.canchaId, d.inicio).minutos;
  const espera = { fecha: d.fecha, desde: d.inicio, hasta: d.inicio + 2 * paso, duracion: d.duracion };
  const ventana = fueraDeVentana(estado, d.fecha, ahora);
  if (ventana) return { entra: false, cuantoEntra: cuanto, aviso: ventana, opciones: [], espera };
  const v = validarHueco(estado, d);
  const pasada = yaPaso(ahora, d.fecha, d.inicio, d.duracion);
  if (v.ok && !pasada) return { entra: true, cuantoEntra: cuanto, aviso: null, opciones: [], espera };
  const entra = false;
  // Ya pasó: se dice eso (y se ofrece lo que todavía está a tiempo: el siguiente hueco acá u otra cancha).
  const aviso = pasada || v.ok ? YA_PASO : (motivoDelHueco(estado, d) ?? v.motivo);
  const vigente = (inicio: number, duracion: number) => minutosHasta(ahora, d.fecha, inicio) + duracion > 0;
  const nombre = (id: string) => canchaDe(estado, id)?.nombre ?? id;
  const armar = (canchaId: string, inicio: number, duracion: number, tipo: Alternativa["tipo"]): Alternativa => {
    const precio = precioTurno(estado, { canchaId, fecha: d.fecha, inicio, duracion });
    const etiqueta = tipo === "menosTiempo" ? `${duracion} min acá · ${pesos(precio)}` : `${nombre(canchaId)} · ${hhmm(inicio)} · ${duracion} min · ${pesos(precio)}`;
    return { canchaId, inicio, duracion, precio, etiqueta, tipo };
  };
  // Otras canchas a la misma hora: primero las del mismo tipo (techada/descubierta), después el resto, en su orden.
  const pedida = canchaDe(estado, d.canchaId);
  const otras = estado.canchas
    .filter((c) => c.id !== d.canchaId && vigente(d.inicio, d.duracion) && validarHueco(estado, { ...d, canchaId: c.id }).ok)
    .sort((a, b) => Number(b.cubierta === pedida?.cubierta) - Number(a.cubierta === pedida?.cubierta));
  const opciones: Alternativa[] = [];
  if (otras[0]) opciones.push(armar(otras[0].id, d.inicio, d.duracion, "otraCancha"));
  const siguiente = huecosLibres(estado, d.fecha, d.canchaId, d.duracion, d.inicio + paso).find((m) => m > d.inicio && vigente(m, d.duracion));
  if (siguiente !== undefined) opciones.push(armar(d.canchaId, siguiente, d.duracion, "siguienteHueco"));
  const menor = [...DURACIONES].reverse().find((x) => x < d.duracion && x <= cuanto && vigente(d.inicio, x) && validarHueco(estado, { ...d, duracion: x }).ok);
  if (menor) opciones.push(armar(d.canchaId, d.inicio, menor, "menosTiempo"));
  // Si sobra lugar, más canchas a la misma hora.
  for (const c of otras.slice(1)) if (opciones.length < MAX_OPCIONES) opciones.push(armar(c.id, d.inicio, d.duracion, "otraCancha"));
  return { entra, cuantoEntra: cuanto, aviso, opciones: opciones.slice(0, MAX_OPCIONES), espera };
}

/** Fichas que coinciden con lo que se tipea (hasta 5), para atar el turno a un cliente. */
export function clientesQueCoinciden(estado: EstadoClub, texto: string): { id: string; nombre: string; detalle: string }[] {
  if (texto.trim().length < 2) return [];
  return buscarClientes(estado, texto)
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      detalle: [c.deuda > 0 ? `debe ${pesos(c.deuda)}` : null, c.monedero > 0 ? `créditos ${pesos(c.monedero)}` : null, c.strikes > 0 ? `${c.strikes} falta${c.strikes > 1 ? "s" : ""}` : null]
        .filter(Boolean)
        .join(" · "),
    }));
}

/**
 * «Anotar en espera» desde el alta que no entra: el día, la franja y la duración ya tomados del alta (`alternativas`).
 * Hace falta a nombre de quién; la ficha o el teléfono, si están, viajan para avisarle.
 */
export function anotarEnEsperaDesdeAlta(estado: EstadoClub, d: { titular: string; clienteId: string | null; tel?: string; espera: Alternativas["espera"] }, ahora: Ahora): Desenlace {
  const titular = d.titular.trim();
  if (!titular) return { ok: false, mensaje: "¿A nombre de quién lo anoto en la espera?" };
  const tel = d.clienteId ? (clienteDe(estado, d.clienteId)?.tel ?? "") : (d.tel?.trim() ?? "");
  anotarEspera(estado, { titular, clienteId: d.clienteId, tel, fecha: d.espera.fecha, desde: d.espera.desde, hasta: d.espera.hasta, duracion: d.espera.duracion }, ahora);
  return { ok: true, mensaje: `${titular} quedó en la lista de espera: ${fechaLinda(d.espera.fecha)}, de ${hhmm(d.espera.desde)} a ${hhmm(d.espera.hasta)}, ${d.espera.duracion} min.` };
}

/** Reserva el turno. Devuelve el aviso y el id del turno nuevo (para abrir su cuenta). */
export function reservar(estado: EstadoClub, d: DatosAlta, ahora: Ahora): Desenlace & { reservaId?: string } {
  const ventana = fueraDeVentana(estado, d.fecha, ahora);
  if (ventana) return { ok: false, mensaje: ventana };
  // La seña se decide ANTES de dar de alta la ficha (con la ficha nueva mirada como «nueva»): es la de la previa.
  const { pide: conSena } = senaDelAlta(estado, { ...d, tel: d.clienteId ? "" : d.tel });
  const otros = d.otros
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 3);
  const titular = d.titular.trim();
  let clienteId = d.clienteId;
  let ficha: { id: string; nueva: boolean } | null = null;
  if (!clienteId && titular && d.tel?.trim()) {
    const f = fichaPorTelefono(estado, titular, d.tel);
    if (!f.ok) return { ok: false, mensaje: f.motivo };
    clienteId = f.clienteId;
    ficha = { id: f.clienteId, nueva: f.nueva };
  }
  const res = crearReserva(
    estado,
    {
      canchaId: d.canchaId,
      fecha: d.fecha,
      inicio: d.inicio,
      duracion: d.duracion,
      tipo: d.tipo,
      clienteId,
      titular,
      jugadores: titular ? [clienteId ? { nombre: titular, clienteId } : titular, ...otros] : undefined,
      origen: d.origen ?? ORIGEN_DE_FABRICA,
      conSena,
    },
    ahora,
  );
  if (!res.ok) {
    // La ficha que se dio de alta para este turno no queda si el turno no se reservó.
    if (ficha?.nueva) estado.clientes = estado.clientes.filter((c) => c.id !== ficha.id);
    return { ok: false, mensaje: res.motivo };
  }
  const r = res.reserva;
  // «Fijo semanal»: este turno es el primero del fijo (así no se baja dos veces) y las semanas siguientes van a la grilla.
  let fijo = "";
  if (d.fijo && d.tipo === "turno") {
    const f = crearFijo(estado, { clienteId: clienteId ?? null, canchaId: d.canchaId, dia: diaSemana(d.fecha), inicio: d.inicio, duracion: d.duracion, titular: r.titular, desde: d.fecha });
    r.fijoId = f.id;
    const quedaron: string[] = [];
    const chocaron: string[] = [];
    for (let i = 1; i <= SEMANAS_DEL_FIJO; i++) {
      const fecha = sumarDias(d.fecha, 7 * i);
      const dd = `${Number(fecha.slice(8))}/${Number(fecha.slice(5, 7))}`;
      const choque = materializarFijos(estado, fecha).find((c) => c.fijo.id === f.id);
      (choque ? chocaron : quedaron).push(dd);
    }
    fijo = ` Fijo los ${NOMBRE_DIA[f.dia].toLowerCase()} a las ${hhmm(f.inicio)}${quedaron.length ? `: ${quedaron.join(", ")} en la grilla` : ""}${chocaron.length ? `; ${chocaron.join(", ")} no entró (está ocupado)` : ""}.`;
  }
  const sena = r.sena.monto > 0 ? ` Pide seña de ${pesos(r.sena.monto)}${r.ref ? ` (código ${r.ref} para la transferencia)` : ""}.` : "";
  const liberadas = res.liberadas.length ? ` Se liberó la seña de ${res.liberadas.map((x) => x.cliente).join(", ")}: vuelve como crédito.` : "";
  return {
    ok: true,
    reservaId: r.id,
    mensaje: `Turno de ${r.titular} en ${canchaDe(estado, r.canchaId)?.nombre ?? "la cancha"}, ${hhmm(r.inicio)} a ${hhmm(r.inicio + r.duracion)}: ${pesos(r.precio)}.${sena}${liberadas}${fijo}${
      ficha ? (ficha.nueva ? ` ${r.titular} quedó dado de alta como cliente.` : ` Ya había una ficha con ese teléfono (${clienteDe(estado, ficha.id)?.nombre ?? r.titular}): el turno quedó atado a ella.`) : ""
    }`,
  };
}
