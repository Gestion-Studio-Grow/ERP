// ============================================================================
// EL CICLO DEL TURNO — mover, extender, falta, cancelar, interrumpir y devolver. PURO.
// ============================================================================
//
// Lo que le pasa a un turno después de darlo (REINGENIERIA.md §4, la matriz de eventualidades), con las reglas del
// motor y lo que la recepción tiene que ver ANTES de tocar:
//   · mover: sólo a huecos que el motor acepta (otra cancha u otra hora, misma duración);
//   · extender: si el hueco siguiente está libre, con lo que cuesta de más;
//   · no vino: pasada la tolerancia, se cobra el turno entero al titular o repartido en el grupo (va a la cuenta
//     corriente: es deuda, no fiado); «sin cargo» lo decide un dueño;
//   · cancelar: con tiempo (o si cancela el club) lo pagado vuelve como crédito —sin ficha, queda para devolver en
//     mano y sale de la caja al devolverlo—; tarde, la seña queda en suspenso hasta que se vuelva a vender el hueco;
//   · interrumpir (corte de luz, lesión, lluvia en juego): se reconoce sólo el tiempo no jugado;
//   · devolver en mano lo pendiente y cobrar la falta de alguien sin ficha.
// La plata la calcula el motor. Las previas se calculan sobre una COPIA del estado (lo que diría el motor si se
// hiciera), así lo que se anuncia es exactamente lo que va a pasar.
//
// Tanda 2D (reingeniería de Break Point): los cierres que encadenan dos cosas en UN comando («cierre», al final de la lista
// blanca de comandos-core.ts):
//   · «Cerrar la de X y abrir»: la cancha sigue ocupada por el turno anterior y llega el siguiente. Se cierra la de X
//     (cobrando lo que debe con un medio, o a su cuenta corriente; con «la mesa sigue», queda en Buffet) y se abre la del
//     que llega (cobrando antes lo que falte de su seña) — `cerrarYAbrirLaSiguiente` del motor, que mira todo antes de
//     tocar nada: o pasan las dos cosas o ninguna;
//   · «La mesa sigue · dividido»: cada jugador paga SU parte de la cancha con SU medio y la cancha queda libre; la mesa
//     sigue en Buffet con sus comensales (`cerrarCanchaYSeguir` con `porJugador`).
// Y después de una falta, el WhatsApp con lo que le quedó al titular en su cuenta (`avisoDeLaFalta`, BP-056).

import {
  ESTADOS,
  cancelar,
  cerrarCanchaYSeguir,
  cerrarYAbrirLaSiguiente,
  mensajeDeLaFalta,
  cancha as canchaDe,
  cliente as clienteDe,
  cobrado,
  cobrarFaltaSinFicha,
  extender,
  hhmm,
  interrumpir,
  liberarFijo,
  marcarDevuelto,
  marcarNoShow,
  minutosHasta,
  mover,
  pesos,
  precioTurno,
  reserva as reservaDe,
  saldo,
  validarHueco,
  horarioDe,
} from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub, Fecha, Reserva } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { ETIQUETA_MEDIO, MEDIOS_CAJA, type MedioCaja } from "./cuenta-core";
import { devolverAlLiberarDesdeLaGrilla } from "./canchas-core";
import { operadorDesdeAuth } from "./operador-del-club";

/** Los destinos posibles para mover el turno: cada cancha con sus horas libres (misma duración, sin pisarse). */
export function destinosParaMover(estado: EstadoClub, reservaId: string, ahora: Ahora): { canchaId: string; nombre: string; horas: { min: number; texto: string }[] }[] {
  const r = reservaDe(estado, reservaId);
  if (!r || !["reservada", "en_cancha"].includes(r.estado)) return [];
  const { paso } = estado.config;
  const { abre, cierra } = horarioDe(estado, r.fecha);
  return estado.canchas
    .filter((c) => c.estado !== "mantenimiento")
    .map((c) => {
      const horas: { min: number; texto: string }[] = [];
      // Jugando, sólo se cambia de cancha (misma hora); reservado, cualquier hora que todavía no terminó.
      const inicios = r.estado === "en_cancha" ? [r.inicio] : Array.from({ length: Math.floor((cierra - abre) / paso) }, (_, i) => abre + i * paso);
      for (const m of inicios) {
        if (c.id === r.canchaId && m === r.inicio) continue;
        if (r.estado !== "en_cancha" && minutosHasta(ahora, r.fecha, m) + r.duracion <= 0) continue;
        if (validarHueco(estado, { canchaId: c.id, fecha: r.fecha, inicio: m, duracion: r.duracion }, r.id).ok) horas.push({ min: m, texto: `${hhmm(m)} a ${hhmm(m + r.duracion)}` });
      }
      return { canchaId: c.id, nombre: c.nombre, horas };
    })
    .filter((d) => d.horas.length > 0);
}

/** Lo que sale extender: el precio del tramo nuevo (valle/pico), o por qué no se puede. */
export function previaExtender(estado: EstadoClub, reservaId: string, minutos: number): { ok: true; extra: number; hasta: string } | { ok: false; motivo: string } {
  const r = reservaDe(estado, reservaId);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  const hueco = { canchaId: r.canchaId, fecha: r.fecha, inicio: r.inicio + r.duracion, duracion: minutos };
  const v = validarHueco(estado, hueco);
  if (!v.ok) return { ok: false, motivo: `No se puede extender: ${v.motivo}` };
  return { ok: true, extra: precioTurno(estado, hueco), hasta: hhmm(r.inicio + r.duracion + minutos) };
}

/**
 * Lo que va a pasar si se cancela: lo dice el motor sobre una copia. `copia` la puede dar quien llama (la pantalla
 * usa `almacen.simular`, que la saca del texto del estado ya armado: PERFORMANCE-TERMINALES.md, ronda 3); si no,
 * se copia el estado acá.
 */
export function previaCancelar(estado: EstadoClub, reservaId: string, porClub: boolean, ahora: Ahora, copia: EstadoClub = structuredClone(estado)): { ok: true; texto: string; pagado: number } | { ok: false; motivo: string } {
  const r = reservaDe(copia, reservaId);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  const pagado = cobrado(r);
  const res = cancelar(copia, reservaId, { porClub }, ahora);
  if (!res.ok) return { ok: false, motivo: res.motivo };
  const texto =
    pagado === 0
      ? "No pagó nada: se libera el hueco y listo."
      : res.devuelto > 0
        ? `Lo pagado (${pesos(res.devuelto)}) vuelve como crédito a ${r.titular}.`
        : res.devolverEnMano > 0
          ? `No tiene ficha: hay que devolverle ${pesos(res.devolverEnMano)} en mano (sale de la caja al devolverlo).`
          : `Cancela con poco aviso: la seña (${pesos(pagado)}) queda en suspenso y vuelve sola si se vende el hueco.`;
  return { ok: true, texto, pagado };
}

/** Lo que se le cobra si no vino: el turno entero menos lo pagado, a quién va, o por qué todavía no. */
export function previaFalta(estado: EstadoClub, reservaId: string, cobrarA: "titular" | "grupo", ahora: Ahora, copia: EstadoClub = structuredClone(estado)): { ok: true; texto: string } | { ok: false; motivo: string } {
  const res = marcarNoShow(copia, reservaId, { cobrarA }, ahora);
  if (!res.ok) return { ok: false, motivo: res.motivo };
  const texto = res.cargos.length
    ? `Se cobra el turno: ${res.cargos.map((c) => `${c.nombre} ${pesos(c.monto)}${c.sinFicha ? " (sin ficha: queda anotado en el turno)" : ""}`).join(", ")}. Va a la cuenta corriente.`
    : "Ya estaba pago: queda la falta anotada, sin cargo.";
  return { ok: true, texto };
}

/** Cuánto se reconoce si se interrumpe ahora. */
export function previaInterrumpir(estado: EstadoClub, reservaId: string, ahora: Ahora, copia: EstadoClub = structuredClone(estado)): { ok: true; texto: string } | { ok: false; motivo: string } {
  const r = reservaDe(copia, reservaId);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  const pagado = cobrado(r);
  const res = interrumpir(copia, reservaId, "previa", ahora);
  if (!res.ok) return { ok: false, motivo: res.motivo };
  const excedente = Math.max(0, pagado - r.precio);
  const tieneFicha = !!(r.clienteId && clienteDe(copia, r.clienteId));
  const vuelta = excedente > 0 ? (tieneFicha ? ` Ya pagó de más: ${pesos(excedente)} vuelven como crédito.` : ` Ya pagó de más: hay que devolverle ${pesos(excedente)} en mano.`) : "";
  return { ok: true, texto: `Se reconocen ${pesos(res.credito)} por ${res.noJugados} min sin jugar: la cancha queda en ${pesos(r.precio)}.${vuelta}` };
}

export type AccionCiclo =
  | { tipo: "mover"; canchaId: string; inicio: number }
  | { tipo: "extender"; minutos: number }
  | { tipo: "falta"; cobrarA: "titular" | "grupo" | "nadie" }
  | { tipo: "cancelar"; porClub: boolean; motivo: string }
  | { tipo: "interrumpir"; motivo: string }
  | { tipo: "liberarFijo" }
  | { tipo: "devolver"; medio: MedioCaja }
  | { tipo: "cobrarFalta"; medio: MedioCaja };

export function ejecutarCiclo(estado: EstadoClub, reservaId: string, accion: AccionCiclo, ahora: Ahora, auth?: Auth): Desenlace {
  const r = reservaDe(estado, reservaId);
  if (!r) return { ok: false, mensaje: "No encuentro el turno." };
  const nombre = r.titular;
  const ofertas = (o: { titular: string }[]) => (o.length ? ` Le sirve a ${o.map((x) => x.titular).join(", ")} de la lista de espera.` : "");
  switch (accion.tipo) {
    case "mover": {
      const res = mover(estado, reservaId, { canchaId: accion.canchaId, inicio: accion.inicio }, ahora);
      return res.ok ? { ok: true, mensaje: `${nombre} pasó a ${canchaDe(estado, accion.canchaId)?.nombre ?? "la cancha"}, ${hhmm(accion.inicio)}.` } : { ok: false, mensaje: res.motivo };
    }
    case "extender": {
      const res = extender(estado, reservaId, accion.minutos, ahora);
      return res.ok ? { ok: true, mensaje: `Extendido ${accion.minutos} min hasta las ${hhmm(r.inicio + r.duracion)} (+${pesos(res.extra)}).` } : { ok: false, mensaje: res.motivo };
    }
    case "falta": {
      const res = marcarNoShow(estado, reservaId, { cobrarA: accion.cobrarA, auth: auth ?? null }, ahora);
      if (!res.ok) return { ok: false, mensaje: res.motivo };
      const cargos = res.cargos.length ? res.cargos.map((c) => `${c.nombre} ${pesos(c.monto)}`).join(", ") : "sin cargo";
      return { ok: true, mensaje: `Falta de ${nombre}: ${cargos}.${ofertas(res.ofertas as { titular: string }[])}` };
    }
    case "cancelar": {
      // «Cancela el club» devuelve todo aunque la cancelación sea tardía: es plata, la decide un dueño con su PIN (el
      // club de hoy no tenía esta opción; recepción cancela con la regla de siempre).
      if (accion.porClub && !operadorDesdeAuth(estado, auth ?? {}).esDuenio) return { ok: false, mensaje: "«Cancela el club» (devolver todo) lo decide un dueño: que entre con su PIN." };
      const res = cancelar(estado, reservaId, { porClub: accion.porClub, motivo: accion.motivo.trim() }, ahora);
      if (!res.ok) return { ok: false, mensaje: res.motivo };
      const plata = res.devuelto ? ` ${pesos(res.devuelto)} vuelven como crédito.` : res.devolverEnMano ? ` Hay que devolverle ${pesos(res.devolverEnMano)} en mano.` : res.enSuspenso ? " La seña queda en suspenso." : "";
      return { ok: true, mensaje: `Turno de ${nombre} cancelado.${plata}${ofertas(res.ofertas as { titular: string }[])}` };
    }
    case "interrumpir": {
      const res = interrumpir(estado, reservaId, accion.motivo.trim() || "corte", ahora);
      return res.ok ? { ok: true, mensaje: `Se reconocen ${pesos(res.credito)} a ${nombre} por ${res.noJugados} min sin jugar.` } : { ok: false, mensaje: res.motivo };
    }
    case "liberarFijo": {
      if (!r.fijoId) return { ok: false, mensaje: "Ese turno no es fijo." };
      const res = liberarFijo(estado, r.fijoId, r.fecha, ahora);
      if (!res.ok) return { ok: false, mensaje: res.motivo };
      // Dictamen v8, C4: si otro fijo esperaba esa fecha a éste, se le devuelve con la regla de la hoja (la antigüedad).
      const recuperan = devolverAlLiberarDesdeLaGrilla(estado, r.fijoId, r.fecha, ahora);
      return { ok: true, mensaje: `${nombre} no viene esta semana: el hueco queda libre y el fijo sigue.${recuperan}` };
    }
    case "devolver": {
      const res = marcarDevuelto(estado, reservaId, accion.medio, ahora);
      return res.ok ? { ok: true, mensaje: `Devueltos ${pesos(res.monto)} a ${nombre} (${ETIQUETA_MEDIO[accion.medio]}): salen de la caja.` } : { ok: false, mensaje: res.motivo };
    }
    case "cobrarFalta": {
      const res = cobrarFaltaSinFicha(estado, reservaId, accion.medio, ahora);
      return res.ok ? { ok: true, mensaje: `Cobrada la falta de ${nombre}: ${pesos(res.monto)}.` } : { ok: false, mensaje: res.motivo };
    }
  }
}

/** Qué se ofrece del ciclo para este turno, según su estado. */
export interface OpcionesCiclo {
  mover: boolean;
  extender: boolean;
  falta: boolean;
  cancelar: boolean;
  interrumpir: boolean;
  liberarFijo: boolean;
}

export function opcionesCiclo(r: Pick<Reserva, "estado" | "fijoId" | "interrumpido">): OpcionesCiclo {
  const reservada = r.estado === "reservada";
  const enCancha = r.estado === "en_cancha";
  return {
    mover: reservada || enCancha,
    extender: reservada || enCancha,
    falta: reservada,
    cancelar: reservada,
    interrumpir: enCancha && !r.interrumpido,
    liberarFijo: reservada && !!r.fijoId,
  };
}

/** Lo que no está en la grilla del día: cancelados, suspendidos y faltas, con lo que queda pendiente de plata. */
export interface FueraDeGrilla {
  id: string;
  texto: string;
  /** Hay que devolverle en mano (sin ficha). */
  devolver: number;
  /** Falta de alguien sin ficha, para cobrar cuando vuelva. */
  cobrarFalta: number;
}

export function fueraDeGrilla(estado: EstadoClub, fecha: Fecha): FueraDeGrilla[] {
  return estado.reservas
    .filter((r) => r.fecha === fecha && ["cancelada", "no_show", "suspendida"].includes(r.estado))
    .sort((a, b) => a.inicio - b.inicio)
    .map((r) => {
      const partes = [
        `${hhmm(r.inicio)} · ${canchaDe(estado, r.canchaId)?.nombre ?? ""} · ${r.titular} — ${ESTADOS[r.estado]}`,
        r.motivoCancelacion ? `(${r.motivoCancelacion})` : null,
        r.faltaCobrada ? `se cobró ${pesos(r.faltaCobrada)}` : null,
        r.senaEnSuspenso ? "seña en suspenso" : null,
      ].filter(Boolean);
      return { id: r.id, texto: partes.join(" "), devolver: r.devolucionPendiente ?? 0, cobrarFalta: r.deudaSinFicha ?? 0 };
    });
}

// Lo que hay que devolver o cobrar de CUALQUIER día (antes `devolucionesPendientes`, sin uso) es `plataPendiente` del
// motor, que también suma faltas sin ficha, señas vencidas y fiados: plata-pendiente-core.ts (Tanda 2B).

// ───────────── Tanda 2D: cerrar y abrir en un paso, «la mesa sigue · dividido» y el aviso de la falta ─────────────

/**
 * Los cierres de cancha que encadenan dos cosas (comando «cierre»). Los medios son de caja (sin créditos: con créditos se
 * cobra jugador por jugador en la cuenta, con su paso previo).
 */
export type AccionCierre =
  /**
   * «Cerrar la de X y abrir»: `cerrarId` es el turno que ocupa la cancha y `abrirId` el que llega. Lo que debe X se cobra
   * con `medio` (o va a su cuenta corriente con `aCuenta`); con `seguir`, su mesa sigue en Buffet. `medioSena`: con qué se
   * cobra lo que falte de la seña del que llega (obligatorio si la pide).
   */
  | { tipo: "cerrarYAbrir"; cerrarId: string; abrirId: string; medio?: MedioCaja | null; aCuenta?: boolean; seguir?: boolean; medioSena?: MedioCaja | null }
  /**
   * «La mesa sigue · dividido»: cada jugador (índice → medio) paga SU parte de la cancha con el suyo; `medio`, lo que no
   * es de nadie (se extendió después de que todos pagaron). La cancha queda libre y la mesa sigue en Buffet.
   */
  | { tipo: "mesaSigue"; reservaId: string; porJugador: Partial<Record<number, MedioCaja>>; medio?: MedioCaja | null };

/** Todos los medios que usa un cierre (para decidir si va sin internet: sólo si todos son efectivo). */
export function mediosDelCierre(a: AccionCierre): string[] {
  const m: (string | null | undefined)[] = a.tipo === "cerrarYAbrir" ? [a.aCuenta ? null : a.medio, a.medioSena] : [...Object.values(a.porJugador ?? {}), a.medio];
  return m.filter((x): x is string => typeof x === "string" && x !== "");
}

const esMedioDeCaja = (m: unknown): m is MedioCaja => typeof m === "string" && (MEDIOS_CAJA as readonly string[]).includes(m);
const ELIGE_MEDIO = "Elegí cómo paga (efectivo, Mercado Pago, transferencia o débito).";

/** « (cobrados $ 21.000 en Efectivo)» o, con varios medios, « (cobrados $ 21.000: Efectivo $ 7.000 · …)». */
function cobradosEn(total: number, porMedio: Partial<Record<string, number>>): string {
  if (!(total > 0)) return "";
  const usados = MEDIOS_CAJA.filter((m) => (porMedio[m] ?? 0) > 0);
  if (usados.length === 1) return ` (cobrados ${pesos(total)} en ${ETIQUETA_MEDIO[usados[0]]})`;
  return ` (cobrados ${pesos(total)}: ${usados.map((m) => `${ETIQUETA_MEDIO[m]} ${pesos(porMedio[m]!)}`).join(" · ")})`;
}

/** Corre un cierre sobre el estado (lo MUTA, como todo el motor). Nunca tira: si el motor dice que no, su motivo. */
export function ejecutarCierre(estado: EstadoClub, accion: AccionCierre, ahora: Ahora, auth?: Auth): Desenlace {
  const firma = auth?.usuarioId ? auth : null;
  if (accion.tipo === "cerrarYAbrir") {
    const x = reservaDe(estado, accion.cerrarId);
    const sig = reservaDe(estado, accion.abrirId);
    if (!x || !sig) return { ok: false, mensaje: "No encuentro el turno." };
    if (accion.medio != null && !esMedioDeCaja(accion.medio)) return { ok: false, mensaje: ELIGE_MEDIO };
    if (accion.medioSena != null && !esMedioDeCaja(accion.medioSena)) return { ok: false, mensaje: "Elegí con qué paga la seña (efectivo, Mercado Pago, transferencia o débito)." };
    const debe = Math.max(0, x.estado === "en_cancha" ? saldo(x) : 0);
    if (debe > 0 && !accion.aCuenta && !accion.medio) return { ok: false, mensaje: `Elegí cómo paga ${x.titular} los ${pesos(debe)} que debe de la cancha.` };
    const sena = sig.estado === "reservada" && sig.sena.monto > 0 && !sig.sena.pagada;
    if (sena && !accion.medioSena) return { ok: false, mensaje: `Elegí con qué paga ${sig.titular} la seña antes de abrir.` };
    const res = cerrarYAbrirLaSiguiente(
      estado,
      {
        cerrarId: x.id,
        abrirId: sig.id,
        medio: accion.medio ?? undefined,
        aCuenta: !!accion.aCuenta,
        seguir: !!accion.seguir,
        medioSena: sena ? accion.medioSena : null,
        auth: firma,
      },
      ahora,
    );
    if (!res.ok) {
      // El motor mira todo antes de tocar: si igual algo falló después de cerrar, se dice qué quedó hecho.
      const cerrada = (res as { cerrada?: unknown }).cerrada;
      return { ok: false, mensaje: cerrada ? `Se cerró la de ${x.titular}, pero no se pudo abrir la de ${sig.titular}: ${res.motivo}` : res.motivo };
    }
    const { cerrada, abierta } = res;
    const cobro = cerrada.cobradoCancha > 0 ? cobradosEn(cerrada.cobradoCancha, cerrada.porMedio) : accion.aCuenta && debe > 0 ? ` (${pesos(debe)} a su cuenta corriente)` : "";
    const mesa = accion.seguir ? " Su mesa sigue en Buffet." : "";
    const senaCobrada = abierta.cobrado > 0 && accion.medioSena ? ` Seña cobrada: ${pesos(abierta.cobrado)} (${ETIQUETA_MEDIO[accion.medioSena]}).` : "";
    return { ok: true, mensaje: `Cerrada la de ${x.titular}${cobro}.${mesa} Cancha abierta para ${sig.titular} y luz prendida.${senaCobrada}` };
  }
  // «La mesa sigue · dividido».
  const r = reservaDe(estado, accion.reservaId);
  if (!r) return { ok: false, mensaje: "No encuentro el turno." };
  const porJugador: Partial<Record<number, MedioCaja>> = {};
  for (const [k, m] of Object.entries(accion.porJugador ?? {})) {
    const idx = Number(k);
    if (!Number.isInteger(idx) || idx < 0 || idx >= r.jugadores.length) return { ok: false, mensaje: "Elegí el jugador." };
    if (!esMedioDeCaja(m)) return { ok: false, mensaje: `Elegí cómo paga ${r.jugadores[idx].nombre} (efectivo, Mercado Pago, transferencia o débito).` };
    porJugador[idx] = m;
  }
  if (accion.medio != null && !esMedioDeCaja(accion.medio)) return { ok: false, mensaje: ELIGE_MEDIO };
  const res = cerrarCanchaYSeguir(estado, r.id, { medio: accion.medio ?? undefined, porJugador, auth: firma }, ahora);
  if (!res.ok) return { ok: false, mensaje: res.motivo };
  const cobro = cobradosEn(res.cobradoCancha, res.porMedio);
  const n = r.jugadores.length;
  return { ok: true, mensaje: `Cancha cerrada y libre${cobro}. La mesa sigue en Buffet con ${n === 1 ? r.titular : `sus ${n}`}.` };
}

/**
 * BP-056 · Después de marcar la falta: el WhatsApp para el titular con lo que le quedó en su cuenta (el texto `falta` del
 * motor, `mensajeDeLaFalta`) y su celular. null si el turno no es una falta o fue sin cargo. Pura.
 */
export function avisoDeLaFalta(estado: EstadoClub, reservaId: string): { titular: string; texto: string; tel: string } | null {
  const texto = mensajeDeLaFalta(estado, reservaId);
  const r = reservaDe(estado, reservaId);
  if (!texto || !r) return null;
  const tel = (r.clienteId && clienteDe(estado, r.clienteId)?.tel) || "";
  return { titular: r.titular, texto, tel };
}
