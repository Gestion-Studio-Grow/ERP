// ============================================================================
// LA CUENTA DEL TURNO — cómo se arma lo que ve recepción al tocar un turno. PURO.
// ============================================================================
//
// La cuenta del turno en UN solo lugar (pedido del club, validado con el dueño): arriba los totales
// (la cancha, los cargos, lo que falta cobrar), una fila por jugador con lo suyo y su botón «Cobrar
// $X», y los cierres: «Cobrar todo», «Cobrar la cancha y cerrarla · la mesa sigue» y, con la cancha
// cerrada, «Cobrar y cerrar los cargos». «A cargo de» para la cancha y para los cargos: el que
// invita paga lo del otro.
//
// Es el mismo comportamiento que `resumenTurno`/`verReserva` del club vanilla
// (public/previews/breakpoint/club/app.mjs), sin el HTML. Acá se decide sin pantalla
// (cuenta-core.test.ts):
//   · qué dice cada fila (cancha ✔ / cancha → Ana / cancha $X · cargos $Y → Ana · + cargos de…);
//   · qué opciones tiene cada «a cargo de» (las mismas que acepta el motor: no se encadena, no se
//     reasigna a quien ya pagó);
//   · qué cierres se ofrecen y por cuánto;
//   · y `ejecutar`, que traduce lo que tocó la persona a la función del motor y arma el aviso.
//
// Ola 1 de paridad (el «Cuenta de la cancha» de `verReserva` del vanilla): sumar un jugador (por nombre o con su
// ficha, hasta 4), la nota del turno, cobrar una parte de la cancha (un monto), cobrarle a un jugador SÓLO su parte
// de la cancha (`cobrarParte`) y cerrar la cancha pasando lo que falta a la cuenta corriente (`finalizar`).
//
// Paridad del UAT del torneo: con la cancha cerrada y la mesa siguiendo se siguen sumando cargos (`sumarCargo`, el
// motor decide), y cada jugador que debe sus cargos tiene en la misma cuenta del turno lo de `verCuenta` del vanilla:
// pasarlos a su cuenta corriente si le da, o «Pedir OK para fiar» (pedido → código del dueño → aprobado).
//
// La plata la calcula el motor (`cuentaDelTurno`, `partesCancha`, `cobrarJugador`…): la pantalla
// nunca suma por su cuenta.

import {
  MEDIOS,
  ESTADOS,
  TIPOS,
  asignarCargoCancha,
  asignarCargoCargos,
  cancha as canchaDe,
  checkIn,
  cerrarCanchaYSeguir,
  cobrado,
  consumoJugador,
  producto as productoDe,
  registrarPago,
  cerrarCargosDelTurno,
  cerrarCuenta,
  saldoCuenta,
  buscarClientes,
  cliente as clienteDe,
  cobrarParte,
  finalizar,
  puedeACuenta,
  sumarJugador,
  cobrarJugador,
  cobrarTodoElTurno,
  cuentaDelTurno,
  hhmm,
  partesCancha,
  pesos,
  reserva as reservaDe,
  saldo,
  crearFijo,
  diaSemana,
  NOMBRE_DIA,
} from "@/lib/club/motor.mjs";
import type { Ahora, Auth, Cliente, Cuenta, EstadoClub, EstadoReserva, Medio, Resultado } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { bajarFijos } from "./canchas-core";

export type { Desenlace };

/** Los medios que entran a la caja (los créditos del cliente llegan con la rebanada del crédito). */
export const MEDIOS_CAJA = ["efectivo", "mercadopago", "transferencia", "debito"] as const satisfies readonly Medio[];
export type MedioCaja = (typeof MEDIOS_CAJA)[number];

/** Los de caja más los créditos del cliente (no entran a la caja: se descuentan de su saldo a favor). */
export type MedioCobro = MedioCaja | "monedero";

export const ETIQUETA_MEDIO: Readonly<Record<MedioCobro, string>> = {
  efectivo: MEDIOS.efectivo,
  mercadopago: MEDIOS.mercadopago,
  transferencia: MEDIOS.transferencia,
  debito: MEDIOS.debito,
  monedero: "Créditos del cliente",
};

export interface Opcion {
  valor: string;
  etiqueta: string;
}

/** Un «a cargo de»: el valor elegido ("" = paga lo suyo) y entre qué se puede elegir. */
export interface ACargoDe {
  elegido: string;
  opciones: Opcion[];
}

export interface CargoDeLaLista {
  nombre: string;
  cant: number;
  importe: number;
}

export interface FilaJugador {
  idx: number;
  nombre: string;
  /** «cancha $ 10.500 · cargos $ 4.000 → Ana» — lo que tiene pendiente, o «nada pendiente». */
  detalle: string;
  /** Lo que se le cobra si se le cobra a él: su parte de la cancha y sus cargos, con lo de los que invita. */
  aPagar: number;
  /** Si no paga nada porque lo paga otro: «lo paga Ana»; si está al día, «al día». */
  situacion: string | null;
  /** El titular de la ficha tiene saldo deudor en su cuenta corriente. */
  deudor: boolean;
  /** Créditos (saldo a favor) de su ficha; 0 sin ficha. */
  creditos: number;
  /** «A cargo de» para su parte de la cancha (null: no se puede cambiar ahora). */
  cancha: ACargoDe | null;
  /** «A cargo de» para sus cargos (null: no tiene cuenta abierta o no hay otra a quién pasarlos). */
  cargos: (ACargoDe & { cuentaId: string }) | null;
  /**
   * «Sólo la cancha $X»: su parte de la cancha (con la de los que invita) sin sus cargos. null si no debe cancha o si
   * no tiene cargos (sería el mismo monto que «Cobrar $X»: un botón repetido).
   */
  soloCancha: number | null;
  /**
   * Sus cargos (con los que paga de otros), si los debe y los paga él: pasarlos a su cuenta corriente (`aCuenta`) o,
   * si no le da, pedir el OK del dueño para fiar (`pedirFiado`, con ficha y sin otro pedido esperando) o el pedido
   * que ya espera al dueño (`pedidoId`). null si no debe cargos propios.
   */
  credito: { cuentaId: string; monto: number; aCuenta: boolean; motivo: string | null; pedirFiado: boolean; pedidoId: string | null } | null;
  /** Sus cargos de la cuenta abierta. */
  items: CargoDeLaLista[];
}

export interface VistaCuenta {
  reservaId: string;
  titular: string;
  /** «Cancha 1 · 17:30–19:00 · Turno · En cancha». */
  descripcion: string;
  estado: EstadoReserva;
  /** La cancha sigue abierta (reservada o en cancha). */
  abierto: boolean;
  /** La cancha ya se cerró pero la mesa sigue cargando. */
  mesaAbierta: boolean;
  /** La nota del turno (la que se cargó al darlo, o la que dejó un corte), o null. */
  notas: string | null;
  /** ¿Se puede sumar un jugador? (la cancha sigue abierta y son menos de 4). */
  sumarJugador: boolean;
  /** ¿Se ofrece sumar un cargo del buffet? Con la cancha abierta o, ya cerrada, mientras la mesa siga. */
  sumarCargo: boolean;
  /**
   * Lo que falta de la cancha con la cancha abierta (null si ya está paga o cerrada): el monto que se sugiere para
   * cobrar una parte (lo que falta de la seña, si la pide; si no, todo) y si se puede pasar a cuenta corriente.
   */
  cancha: { saldo: number; sugerido: number; aCuenta: { ok: true } | { ok: false; motivo: string } } | null;
  totales: { cancha: number; cargos: number; pendiente: number };
  sena: { monto: number; pagada: boolean } | null;
  /** Créditos del titular (para la seña con créditos); 0 sin ficha. */
  creditosTitular: number;
  jugadores: FilaJugador[];
  /** «No se cobra acá: los cargos de X ($…) los paga Y en su mesa.» */
  deOtraMesa: string | null;
  cierres: {
    /** «Cobrar todo $X», o null si no debe nada. */
    cobrarTodo: number | null;
    /** «Cobrar la seña $X»: reservado, con seña sin pagar. */
    cobrarSena: number | null;
    /** «Abrir la cancha»: el turno está reservado y llega la gente. */
    abrirCancha: boolean;
    /** «Hacer fijo»: el mismo día de la semana, hora y cancha, desde la semana que viene (o null si no corresponde). */
    hacerFijo: string | null;
    /** «Cerrar la cancha», como el club de hoy: en juego y sin nada pendiente (sin dejar una mesa en Buffet). */
    cerrarCancha: boolean;
    /** «Cobrar la cancha $X y cerrarla · la mesa sigue» (monto 0 = «Cerrar la cancha · la mesa sigue»). */
    cerrarYSeguir: number | null;
    /** «Cobrar y cerrar los cargos $X» con la cancha ya cerrada (monto 0 = «Cerrar los cargos»). */
    cerrarCargos: number | null;
    /** «Cargos a cuenta corriente»: con la cancha cerrada y cargos por cobrar. */
    cargosACuenta: boolean;
  };
  firma: string;
}

const ABIERTO: ReadonlySet<EstadoReserva> = new Set(["reservada", "en_cancha"]);
const SIN_CUENTA: ReadonlySet<EstadoReserva> = new Set(["cancelada", "suspendida", "no_show"]);

/** Arma la cuenta del turno, o null si el turno no existe o no lleva cuenta (cancelado, suspendido, no vino). */
export function armarCuenta(estado: EstadoClub, reservaId: string): VistaCuenta | null {
  const r = reservaDe(estado, reservaId);
  if (!r || SIN_CUENTA.has(r.estado)) return null;
  const t = cuentaDelTurno(estado, reservaId);
  if (!t.ok) return null;
  const abierto = ABIERTO.has(r.estado);
  const partes = partesCancha(r);
  const saldoCancha = saldo(r);
  const nombre = (k: number | null | undefined) => (k == null ? "" : (r.jugadores[k]?.nombre ?? ""));

  // Cuentas de cargos de los jugadores de ESTE turno que pueden pagar las de otro (no están a cargo de nadie).
  const cuentasQuePagan = t.jugadores.flatMap((j) => (j.cuenta && !j.cargos.aCargoDe ? [{ id: j.cuenta.id, titular: j.cuenta.titular }] : []));

  const jugadores: FilaJugador[] = t.jugadores.map((j) => {
    const p = j.cancha;
    const piezas: string[] = [];
    if (abierto) piezas.push(p.pago ? "cancha ✔" : p.aCargoDe != null ? `cancha → ${nombre(p.aCargoDe)}` : `cancha ${pesos(p.aPagar)}`);
    if (j.cargos.saldo) piezas.push(`cargos ${pesos(j.cargos.saldo)}${j.cargos.aCargoDeNombre ? ` → ${j.cargos.aCargoDeNombre}` : ""}`);
    if (j.cargos.deOtros) piezas.push(`+ cargos de ${j.cargos.aSuCargo.join(", ")} ${pesos(j.cargos.deOtros)}`);
    const quienPaga = j.cargos.aCargoDeNombre ?? (p.aCargoDe != null ? nombre(p.aCargoDe) : null);

    // «A cargo de» de la cancha: mientras la cancha deba y él no haya pagado. Se ofrecen los que no
    // pagaron y no están a cargo de otro (el motor rechaza encadenar).
    const puedeCancha = abierto && saldoCancha > 0 && r.jugadores.length > 1 && !partes[j.idx].pago;
    const cancha: ACargoDe | null = puedeCancha
      ? {
          elegido: p.aCargoDe != null ? String(p.aCargoDe) : "",
          opciones: [
            { valor: "", etiqueta: "Paga su parte" },
            ...r.jugadores.flatMap((x, k) => (k !== j.idx && !partes[k].pago && partes[k].aCargoDe == null ? [{ valor: String(k), etiqueta: `A cargo de ${x.nombre}` }] : [])),
          ],
        }
      : null;

    const otras = j.cuenta ? cuentasQuePagan.filter((c) => c.id !== j.cuenta!.id) : [];
    const cargos =
      j.cuenta && otras.length
        ? {
            cuentaId: j.cuenta.id,
            elegido: j.cargos.aCargoDe ?? "",
            opciones: [{ valor: "", etiqueta: "Paga sus cargos" }, ...otras.map((c) => ({ valor: c.id, etiqueta: `Sus cargos los paga ${c.titular}` }))],
          }
        : null;

    const items = (j.cuenta?.items ?? []).map((i) => ({ nombre: i.nombre, cant: i.cant, importe: i.cant * i.precioUnit }));
    const ficha = j.clienteId ? clienteDe(estado, j.clienteId) : undefined;
    const credito = creditoDeLosCargos(estado, j.cuenta, ficha);
    return {
      idx: j.idx,
      nombre: j.nombre,
      detalle: piezas.join(" · ") || "nada pendiente",
      aPagar: j.aPagar,
      situacion: j.aPagar > 0 ? null : quienPaga ? `lo paga ${quienPaga}` : "al día",
      deudor: (ficha?.deuda ?? 0) > 0,
      creditos: ficha?.monedero ?? 0,
      cancha,
      cargos,
      soloCancha: abierto && p.aPagar > 0 && j.aPagar > p.aPagar ? p.aPagar : null,
      credito,
      items,
    };
  });

  const T = t.totales;
  const cerrarYSeguir = abierto && r.estado === "en_cancha" ? T.cancha : null;
  const cerrarCargos = t.mesaAbierta ? T.cargos : null;
  const deOtraMesa = t.deOtraMesa.length
    ? `No se cobra acá: ${t.deOtraMesa.map((x) => `los cargos de ${x.titular} (${pesos(x.saldo)}) los paga ${x.paga} en su mesa`).join(" · ")}.`
    : null;
  const nombreCancha = canchaDe(estado, r.canchaId)?.nombre ?? "";
  const vista: Omit<VistaCuenta, "firma"> = {
    reservaId: r.id,
    titular: r.titular,
    descripcion: [nombreCancha, `${hhmm(r.inicio)}–${hhmm(r.inicio + r.duracion)}`, TIPOS[r.tipo], ESTADOS[r.estado]].join(" · "),
    estado: r.estado,
    abierto,
    mesaAbierta: t.mesaAbierta,
    notas: r.notas?.trim() ? r.notas.trim() : null,
    sumarJugador: abierto && r.jugadores.length < 4,
    sumarCargo: abierto || t.mesaAbierta,
    cancha:
      abierto && saldoCancha > 0
        ? (() => {
            const p = puedeACuenta(r.clienteId ? clienteDe(estado, r.clienteId) : undefined, saldoCancha);
            return { saldo: saldoCancha, sugerido: senaPendiente(r) ?? saldoCancha, aCuenta: p.ok ? { ok: true as const } : { ok: false as const, motivo: p.motivo } };
          })()
        : null,
    totales: { cancha: T.cancha, cargos: T.cargos, pendiente: T.pendiente },
    sena: r.sena.monto > 0 ? { monto: r.sena.monto, pagada: r.sena.pagada } : null,
    creditosTitular: (r.clienteId ? clienteDe(estado, r.clienteId)?.monedero : 0) ?? 0,
    jugadores,
    deOtraMesa,
    cierres: {
      cobrarTodo: T.pendiente > 0 ? T.pendiente : null,
      cobrarSena: senaPendiente(r),
      abrirCancha: r.estado === "reservada",
      cerrarCancha: abierto && r.estado === "en_cancha" && T.pendiente === 0,
      hacerFijo: r.tipo === "turno" && !r.fijoId && abierto ? `${NOMBRE_DIA[diaSemana(r.fecha)].toLowerCase()} ${hhmm(r.inicio)}` : null,
      cerrarYSeguir,
      cerrarCargos,
      cargosACuenta: cerrarCargos !== null && T.cargos > 0,
    },
  };
  return { ...vista, firma: JSON.stringify(vista) };
}

/**
 * Lo que debe una cuenta de cargos que paga lo suyo (su saldo y el de las cuentas a su cargo, como `aCobrarDe` del
 * buffet y `pedirFiado`) y cómo se puede cerrar a crédito. null si no debe o si sus cargos los paga otro.
 */
function creditoDeLosCargos(estado: EstadoClub, cta: Cuenta | null, ficha: Cliente | undefined): FilaJugador["credito"] {
  if (!cta || cta.estado !== "abierta") return null;
  const pagador = cta.aCargoDe ? estado.cuentas.find((x) => x.id === cta.aCargoDe && x.estado === "abierta") : undefined;
  if (pagador) return null;
  const deps = estado.cuentas.filter((x) => x.estado === "abierta" && x.aCargoDe === cta.id && x.id !== cta.id);
  const monto = Math.max(0, saldoCuenta(cta)) + deps.reduce((s, x) => s + Math.max(0, saldoCuenta(x)), 0);
  if (!(monto > 0)) return null;
  const p = puedeACuenta(ficha, monto);
  const pedido = ficha ? estado.novedades.find((n) => n.estado === "pendiente" && n.clienteId === ficha.id) : undefined;
  return { cuentaId: cta.id, monto, aCuenta: p.ok, motivo: p.ok ? null : p.motivo, pedirFiado: !p.ok && !!ficha && !pedido, pedidoId: pedido?.id ?? null };
}

/** Lo que falta de la seña de un turno reservado (null si no pide o ya está pagada). */
function senaPendiente(r: { estado: EstadoReserva; sena: { monto: number; pagada: boolean }; pagos: { monto: number }[] }): number | null {
  if (r.estado !== "reservada" || !(r.sena.monto > 0) || r.sena.pagada) return null;
  const falta = r.sena.monto - r.pagos.reduce((s, p) => s + p.monto, 0);
  return falta > 0 ? falta : null;
}

/** Lo que se puede tocar en la cuenta del turno. */
export type AccionCuenta =
  | { tipo: "cobrarTodo"; medio: MedioCaja }
  | { tipo: "cobrarJugador"; idx: number; medio: MedioCobro }
  | { tipo: "cobrarSena"; medio: MedioCobro }
  | { tipo: "cerrarYSeguir"; medio: MedioCaja }
  | { tipo: "cerrarCancha" }
  | { tipo: "hacerFijo" }
  | { tipo: "cerrarCargos"; medio: MedioCaja }
  | { tipo: "cargosACuenta" }
  | { tipo: "abrirCancha" }
  | { tipo: "aCargoCancha"; idx: number; de: string }
  | { tipo: "aCargoCargos"; cuentaId: string; de: string }
  | { tipo: "cargo"; idx: number; productoId: string; cant: number; modo: "cuenta" | "cobrar"; medio: MedioCaja }
  | { tipo: "sumarJugador"; nombre: string; clienteId: string | null }
  | { tipo: "cobrarCancha"; monto: number; medio: MedioCobro }
  | { tipo: "cobrarParte"; idx: number; medio: MedioCobro }
  | { tipo: "canchaACuenta" }
  | { tipo: "cargosACuentaDe"; cuentaId: string };

/**
 * Qué acción del club vanilla es cada una (`data-a` de app.mjs): con eso se decide qué se deshace (`DESHACIBLE`) y
 * el test lo compara contra el `DESHACIBLES` del vanilla.
 */
export const EN_EL_VANILLA: Readonly<Record<AccionCuenta["tipo"], string>> = {
  cobrarTodo: "cobrarTodo",
  cobrarJugador: "cobrarJugador",
  cobrarSena: "pagar",
  cerrarYSeguir: "cerrarYSeguir",
  cerrarCancha: "finalizar",
  hacerFijo: "nuevoFijo",
  cerrarCargos: "cerrarCargos",
  cargosACuenta: "cerrarCargosCC",
  abrirCancha: "checkin",
  aCargoCancha: "aCargo",
  aCargoCargos: "aCargoCargos",
  cargo: "consumo",
  sumarJugador: "sumarJugador",
  cobrarCancha: "pagar",
  cobrarParte: "cobrarParte",
  canchaACuenta: "aCuenta",
  cargosACuentaDe: "cerrarCuenta",
};

/**
 * Las acciones que se pueden deshacer: las mismas que en el `DESHACIBLES` del club vanilla (app.mjs:24). Los «a cargo
 * de» no están: se vuelven atrás eligiendo de nuevo en el mismo selector (y, como en el vanilla, una acción que no se
 * deshace suelta la foto de la anterior).
 */
export const DESHACIBLE: Readonly<Record<AccionCuenta["tipo"], boolean>> = {
  cobrarTodo: true,
  cobrarJugador: true,
  cobrarSena: true,
  cerrarYSeguir: true,
  cerrarCancha: true,
  hacerFijo: false,
  cerrarCargos: true,
  cargosACuenta: true,
  abrirCancha: true,
  aCargoCancha: false,
  aCargoCargos: false,
  cargo: true,
  sumarJugador: true,
  cobrarCancha: true,
  cobrarParte: true,
  canchaACuenta: true,
  cargosACuentaDe: true,
};

/**
 * Ejecuta la acción sobre el estado (lo MUTA, como todo el motor) y devuelve el aviso. Nunca tira:
 * si el motor dice que no, el aviso es su motivo, en criollo.
 */
export function ejecutar(estado: EstadoClub, reservaId: string, accion: AccionCuenta, ahora: Ahora, auth?: Auth): Desenlace {
  const falla = (r: { motivo: string }): Desenlace => ({ ok: false, mensaje: r.motivo });
  const conAuth = auth?.usuarioId ? { auth } : {};
  switch (accion.tipo) {
    case "cobrarTodo": {
      const res = cobrarTodoElTurno(estado, reservaId, { medio: accion.medio, ...conAuth }, ahora);
      return res.ok ? { ok: true, mensaje: `Cobrado todo el turno: ${pesos(res.total)} (${ETIQUETA_MEDIO[accion.medio]}).` } : falla(res);
    }
    case "cobrarJugador": {
      const t = cuentaDelTurno(estado, reservaId);
      const quien = t.ok ? t.jugadores[accion.idx]?.nombre : undefined;
      const res = cobrarJugador(estado, reservaId, accion.idx, { medio: accion.medio, ...conAuth }, ahora);
      if (!res.ok) return falla(res);
      const desglose = res.cancha && res.cargos ? ` (cancha ${pesos(res.cancha)} + cargos ${pesos(res.cargos)})` : "";
      const con = res.cubiertos.length ? `, con lo de ${res.cubiertos.join(", ")}` : "";
      const medio = accion.medio === "monedero" ? " con sus créditos" : "";
      return { ok: true, mensaje: `Cobrado ${pesos(res.total)} a ${quien ?? "el jugador"}${medio}${desglose}${con}.` };
    }
    case "cobrarSena": {
      const r = reservaDe(estado, reservaId);
      const falta = r ? senaPendiente(r) : null;
      if (!r || falta === null) return { ok: false, mensaje: "Ese turno no tiene seña para cobrar." };
      const res = registrarPago(estado, reservaId, { medio: accion.medio, monto: falta, ...conAuth }, ahora);
      return res.ok ? { ok: true, mensaje: `Seña cobrada: ${pesos(falta)}${accion.medio === "monedero" ? " con créditos" : ""}. Ya se puede abrir la cancha.` } : falla(res);
    }
    case "cerrarYSeguir": {
      const res = cerrarCanchaYSeguir(estado, reservaId, { medio: accion.medio, ...conAuth }, ahora);
      if (!res.ok) return falla(res);
      const cobro = res.cobradoCancha ? ` (cobrados ${pesos(res.cobradoCancha)})` : "";
      const mesa = " La mesa sigue en Buffet → Mesas y se cobra cuando se van.";
      return { ok: true, mensaje: `Cancha cerrada y libre${cobro}.${mesa}` };
    }
    case "cerrarCancha": {
      const res = finalizar(estado, reservaId, {}, ahora);
      if (!res.ok) return falla(res);
      const n = res.cuentasAbiertas.length;
      return { ok: true, mensaje: `Cancha cerrada.${n ? ` Quedan ${n} cuenta${n > 1 ? "s" : ""} de buffet abierta${n > 1 ? "s" : ""}.` : ""}` };
    }
    case "hacerFijo": {
      // El turno pasa a ser el primero del fijo (así no se baja dos veces) y los próximos se bajan a la agenda.
      const r = reservaDe(estado, reservaId);
      if (!r || r.tipo !== "turno" || r.fijoId) return { ok: false, mensaje: "Ese turno no se puede hacer fijo." };
      const f = crearFijo(estado, { clienteId: r.clienteId ?? null, canchaId: r.canchaId, dia: diaSemana(r.fecha), inicio: r.inicio, duracion: r.duracion, titular: r.titular });
      r.tipo = "fijo";
      r.fijoId = f.id;
      const bajada = bajarFijos(estado, ahora.fecha);
      return { ok: true, mensaje: `Turno fijo de ${r.titular} los ${NOMBRE_DIA[f.dia].toLowerCase()} a las ${hhmm(r.inicio)}. ${bajada.mensaje}` };
    }
    case "cerrarCargos": {
      const res = cerrarCargosDelTurno(estado, reservaId, { medio: accion.medio, ...conAuth }, ahora);
      return res.ok ? { ok: true, mensaje: `Cargos cerrados${res.cobrado ? `: cobrados ${pesos(res.cobrado)}` : ""}.` } : falla(res);
    }
    case "cargosACuenta": {
      const res = cerrarCargosDelTurno(estado, reservaId, { aCuenta: true, ...conAuth }, ahora);
      return res.ok
        ? { ok: true, mensaje: `${pesos(res.aCuentaCorriente)} a cuenta corriente. Mesa cerrada.` }
        : { ok: false, mensaje: `${res.motivo} Si no tiene cuenta corriente, pedí el OK para fiar en Buffet.` };
    }
    case "abrirCancha":
      return resultado(checkIn(estado, reservaId, ahora), "Cancha abierta y luz prendida.");
    case "aCargoCancha":
      return resultado(
        asignarCargoCancha(estado, reservaId, accion.idx, accion.de === "" ? null : Number(accion.de), ahora),
        accion.de === "" ? "Paga su propia parte de la cancha." : "Listo: esa parte de la cancha la paga otro jugador.",
      );
    case "aCargoCargos":
      return resultado(
        asignarCargoCargos(estado, accion.cuentaId, accion.de === "" ? null : accion.de, ahora),
        accion.de === "" ? "Paga sus propios cargos." : "Listo: esos cargos los paga otro jugador.",
      );
    case "cargo": {
      const t = cuentaDelTurno(estado, reservaId);
      const quien = t.ok ? t.jugadores[accion.idx]?.nombre : "el jugador";
      const p = productoDe(estado, accion.productoId);
      const res = consumoJugador(estado, reservaId, accion.idx, accion.productoId, accion.cant, { modo: accion.modo, medio: accion.medio }, ahora);
      if (!res.ok) return falla(res);
      const que = `${accion.cant} × ${p?.nombre ?? "producto"}`;
      return {
        ok: true,
        mensaje: accion.modo === "cobrar" ? `${que} para ${quien}: cobrado ${pesos(accion.cant * (p?.precio ?? 0))} (${ETIQUETA_MEDIO[accion.medio]}).` : `${que} a la cuenta de ${quien}.`,
      };
    }
    case "sumarJugador": {
      const r = reservaDe(estado, reservaId);
      if (!r) return { ok: false, mensaje: "No encuentro el turno." };
      if (!ABIERTO.has(r.estado)) return { ok: false, mensaje: "La cancha de ese turno ya está cerrada: no se suman jugadores." };
      if (accion.clienteId && r.jugadores.some((j) => j.clienteId === accion.clienteId)) return { ok: false, mensaje: "Esa ficha ya juega en este turno." };
      const res = sumarJugador(estado, reservaId, accion.nombre, accion.clienteId);
      if (!res.ok) return falla(res);
      const nuevo = r.jugadores[r.jugadores.length - 1]?.nombre ?? "el jugador";
      return { ok: true, mensaje: accion.clienteId ? `${nuevo} sumado al turno con su ficha.` : `${nuevo} sumado al turno.` };
    }
    case "cobrarCancha": {
      const r = reservaDe(estado, reservaId);
      const senaAntes = r?.sena.pagada ?? false;
      const monto = Math.round(Number(accion.monto));
      const res = registrarPago(estado, reservaId, { medio: accion.medio, monto, ...conAuth }, ahora);
      if (!res.ok) return falla(res);
      const con = accion.medio === "monedero" ? " con créditos" : ` (${ETIQUETA_MEDIO[accion.medio]})`;
      const queda = res.saldo > 0 ? ` A la cancha le quedan ${pesos(res.saldo)}.` : " La cancha quedó paga.";
      const sena = !senaAntes && r?.sena.pagada ? " Seña pagada: ya se puede abrir la cancha." : "";
      return { ok: true, mensaje: `Cobrado ${pesos(monto)} de cancha${con}.${queda}${sena}` };
    }
    case "cobrarParte": {
      const r = reservaDe(estado, reservaId);
      const quien = r?.jugadores[accion.idx]?.nombre ?? "el jugador";
      const res = cobrarParte(estado, reservaId, accion.idx, { medio: accion.medio, ...conAuth }, ahora);
      if (!res.ok) return falla(res);
      const con = res.cubiertos.length ? ` (incluye la parte de ${res.cubiertos.join(", ")})` : "";
      const medio = accion.medio === "monedero" ? " con sus créditos" : "";
      return { ok: true, mensaje: `Cobrada la parte de la cancha de ${quien}${medio}: ${pesos(res.monto)}${con}. Sus cargos siguen en su cuenta.` };
    }
    case "canchaACuenta": {
      const r = reservaDe(estado, reservaId);
      const debe = r ? saldo(r) : 0;
      const res = finalizar(estado, reservaId, { aCuenta: true }, ahora);
      if (!res.ok) return falla(res);
      const mesa = res.cuentasAbiertas.length ? " La mesa sigue abierta y se cobra cuando se van." : "";
      return { ok: true, mensaje: `Cancha cerrada: ${pesos(debe)} a la cuenta corriente de ${r?.titular ?? "el titular"}.${mesa}` };
    }
    case "cargosACuentaDe": {
      // Los cargos de UN jugador (con los que paga de otros) a su cuenta corriente: con cuenta corriente con margen o
      // con un fiado aprobado por el dueño. Lo decide el motor (`cerrarCuenta` + `puedeACuenta`).
      const cta = estado.cuentas.find((x) => x.id === accion.cuentaId);
      const monto = cta ? (creditoDeLosCargos(estado, cta, cta.clienteId ? clienteDe(estado, cta.clienteId) : undefined)?.monto ?? 0) : 0;
      const res = cerrarCuenta(estado, accion.cuentaId, { aCuenta: true }, ahora);
      return res.ok ? { ok: true, mensaje: `${pesos(monto)} a la cuenta corriente de ${cta?.titular ?? "el cliente"}. Sus cargos quedaron cerrados.` } : falla(res);
    }
  }
}

/** Una ficha que se puede sumar al turno, con lo que conviene saber al elegirla. */
export interface FichaParaSumar {
  id: string;
  nombre: string;
  /** «ficha · cuenta corriente · créditos $ 5.000». */
  detalle: string;
}

/**
 * Las fichas que coinciden con lo que se tipea para sumar un jugador (desde 2 letras, hasta 5, sin las que ya juegan
 * en el turno), como el buscador de «Sumar jugador» del vanilla. Puro.
 */
export function fichasParaSumar(estado: EstadoClub, reservaId: string, texto: string): FichaParaSumar[] {
  const r = reservaDe(estado, reservaId);
  if (!r || texto.trim().length < 2) return [];
  const juegan = new Set(r.jugadores.map((j) => j.clienteId).filter(Boolean));
  return buscarClientes(estado, texto)
    .filter((c) => !juegan.has(c.id))
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      detalle: ["ficha", c.cc.habilitada ? "cuenta corriente" : null, c.monedero ? `créditos ${pesos(c.monedero)}` : null].filter(Boolean).join(" · "),
    }));
}

/**
 * El paso previo de «Créditos del cliente» (validado por el dueño): ANTES de descontar se ve de quién son, cuánto
 * se usa, qué cubre (si queda pagada la seña) y con cuánto queda. Si no le alcanzan, lo dice y no se ofrece. Los
 * créditos nunca quedan negativos: la confirmación sólo existe si `quedan >= 0`.
 */
export type ConfirmacionCreditos =
  | { ok: true; de: string; que: string; usa: number; creditos: number; quedan: number; cubreSena: boolean }
  | { ok: false; motivo: string };

/** Los cobros que se pueden hacer con créditos del cliente (siempre con el paso previo). */
export type CobroConCreditos =
  | { tipo: "cobrarJugador"; idx: number }
  | { tipo: "cobrarSena" }
  | { tipo: "cobrarCancha"; monto: number }
  | { tipo: "cobrarParte"; idx: number };

export function confirmarCreditos(estado: EstadoClub, reservaId: string, accion: CobroConCreditos): ConfirmacionCreditos {
  const r = reservaDe(estado, reservaId);
  if (!r) return { ok: false, motivo: "No encuentro el turno." };
  let clienteId: string | null | undefined;
  let usa: number;
  let que: string;
  if (accion.tipo === "cobrarSena") {
    clienteId = r.clienteId;
    usa = senaPendiente(r) ?? 0;
    que = "Seña de la cancha";
  } else if (accion.tipo === "cobrarCancha") {
    clienteId = r.clienteId;
    usa = Math.round(Number(accion.monto));
    if (usa > saldo(r)) return { ok: false, motivo: `Está cobrando de más: a la cancha le quedan ${pesos(saldo(r))}.` };
    que = r.estado === "reservada" && r.sena.monto > 0 && !r.sena.pagada && cobrado(r) + usa >= r.sena.monto ? "Seña de la cancha" : "Cancha";
  } else if (accion.tipo === "cobrarParte") {
    const j = r.jugadores[accion.idx];
    if (!j) return { ok: false, motivo: "Elegí el jugador." };
    // Como el vanilla: sin ficha propia, los créditos del titular.
    clienteId = j.clienteId ?? r.clienteId;
    usa = partesCancha(r)[accion.idx]?.aPagar ?? 0;
    que = `La parte de la cancha de ${j.nombre}`;
  } else {
    const t = cuentaDelTurno(estado, reservaId);
    const j = t.ok ? t.jugadores[accion.idx] : undefined;
    if (!j) return { ok: false, motivo: "Elegí el jugador." };
    clienteId = j.clienteId;
    usa = j.aPagar;
    que = `Todo lo de ${j.nombre}`;
  }
  const c = clienteId ? clienteDe(estado, clienteId) : undefined;
  if (!c) return { ok: false, motivo: "Ese jugador no tiene ficha de cliente: no tiene créditos para usar." };
  if (!(usa > 0)) return { ok: false, motivo: "No hay nada para cobrar." };
  if (c.monedero < usa) return { ok: false, motivo: `${c.nombre} tiene ${pesos(c.monedero)} en créditos: no alcanza para ${pesos(usa)}.` };
  const cubreSena = r.estado === "reservada" && r.sena.monto > 0 && !r.sena.pagada && cobrado(r) + Math.min(usa, saldo(r)) >= r.sena.monto;
  return { ok: true, de: c.nombre, que, usa, creditos: c.monedero, quedan: c.monedero - usa, cubreSena };
}

function resultado(res: Resultado, mensaje: string): Desenlace {
  return res.ok ? { ok: true, mensaje } : { ok: false, mensaje: res.motivo };
}

/** El texto de cada cierre, con su monto (los botones dicen el verbo y la plata). */
export function textoCierre(cual: "cobrarTodo" | "cerrarYSeguir" | "cerrarCargos", monto: number): string {
  if (cual === "cobrarTodo") return `Cobrar todo ${pesos(monto)}`;
  if (cual === "cerrarYSeguir") return monto > 0 ? `Cobrar la cancha ${pesos(monto)} y cerrarla · la mesa sigue` : "Cerrar la cancha · la mesa sigue";
  return monto > 0 ? `Cobrar y cerrar los cargos ${pesos(monto)}` : "Cerrar la mesa";
}

/**
 * Reusa lo que no cambió de la cuenta anterior: la vista entera si la firma es la misma y, si no, cada fila de
 * jugador que quedó igual (el `memo` de esa fila no se vuelve a pintar).
 */
export function compartirCuenta(previa: VistaCuenta | null | undefined, nueva: VistaCuenta | null): VistaCuenta | null {
  if (!previa || !nueva || previa.reservaId !== nueva.reservaId) return nueva;
  if (previa.firma === nueva.firma) return previa;
  const jugadores = nueva.jugadores.map((j, i) => {
    const v = previa.jugadores[i];
    return v && JSON.stringify(v) === JSON.stringify(j) ? v : j;
  });
  return { ...nueva, jugadores };
}

/**
 * Al tocar «Sí, usar $X de créditos» se vuelve a calcular: si entre que se mostró la confirmación y el toque cambió
 * el monto (un «Deshacer», una extensión, otro cobro) o ya no alcanzan, NO se cobra lo viejo: se vuelve a pedir la
 * confirmación con el monto nuevo, o se dice por qué no. Pura.
 */
export type Revision<D> = { tipo: "seguir" } | { tipo: "otra"; datos: D } | { tipo: "no"; motivo: string };

export function revisarConfirmacion<D extends { usa: number; creditos: number; quedan: number }>(mostrada: D, ahora: ({ ok: true } & D) | { ok: false; motivo: string }): Revision<D> {
  if (!ahora.ok) return { tipo: "no", motivo: ahora.motivo };
  if (ahora.usa === mostrada.usa && ahora.creditos === mostrada.creditos && ahora.quedan === mostrada.quedan) return { tipo: "seguir" };
  const { ok: _ok, ...datos } = ahora;
  void _ok;
  return { tipo: "otra", datos: datos as unknown as D };
}
