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
  cerrarCargosDelTurno,
  cliente as clienteDe,
  cobrarJugador,
  cobrarTodoElTurno,
  cuentaDelTurno,
  hhmm,
  partesCancha,
  pesos,
  reserva as reservaDe,
  saldo,
} from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub, EstadoReserva, Medio, Resultado } from "@/lib/club/motor.mjs";

/** Los medios que entran a la caja (los créditos del cliente llegan con la rebanada del crédito). */
export const MEDIOS_CAJA = ["efectivo", "mercadopago", "transferencia", "debito"] as const satisfies readonly Medio[];
export type MedioCaja = (typeof MEDIOS_CAJA)[number];

export const ETIQUETA_MEDIO: Readonly<Record<MedioCaja, string>> = {
  efectivo: MEDIOS.efectivo,
  mercadopago: MEDIOS.mercadopago,
  transferencia: MEDIOS.transferencia,
  debito: MEDIOS.debito,
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
  /** «A cargo de» para su parte de la cancha (null: no se puede cambiar ahora). */
  cancha: ACargoDe | null;
  /** «A cargo de» para sus cargos (null: no tiene cuenta abierta o no hay otra a quién pasarlos). */
  cargos: (ACargoDe & { cuentaId: string }) | null;
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
  totales: { cancha: number; cargos: number; pendiente: number };
  sena: { monto: number; pagada: boolean } | null;
  jugadores: FilaJugador[];
  /** «No se cobra acá: los cargos de X ($…) los paga Y en su mesa.» */
  deOtraMesa: string | null;
  cierres: {
    /** «Cobrar todo $X», o null si no debe nada. */
    cobrarTodo: number | null;
    /** «Abrir la cancha»: el turno está reservado y llega la gente. */
    abrirCancha: boolean;
    /** «Cobrar la cancha $X y cerrarla · la mesa sigue» (monto 0 = «Cerrar la cancha · la mesa sigue»). */
    cerrarYSeguir: number | null;
    /** «Cobrar y cerrar los cargos $X» con la cancha ya cerrada (monto 0 = «Cerrar los cargos»). */
    cerrarCargos: number | null;
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
    return {
      idx: j.idx,
      nombre: j.nombre,
      detalle: piezas.join(" · ") || "nada pendiente",
      aPagar: j.aPagar,
      situacion: j.aPagar > 0 ? null : quienPaga ? `lo paga ${quienPaga}` : "al día",
      deudor: (ficha?.deuda ?? 0) > 0,
      cancha,
      cargos,
      items,
    };
  });

  const T = t.totales;
  const cerrarYSeguir = abierto && r.estado === "en_cancha" ? T.cancha : null;
  const cerrarCargos = !abierto && t.mesa.length > 0 ? T.cargos : null;
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
    totales: { cancha: T.cancha, cargos: T.cargos, pendiente: T.pendiente },
    sena: r.sena.monto > 0 ? { monto: r.sena.monto, pagada: r.sena.pagada } : null,
    jugadores,
    deOtraMesa,
    cierres: {
      cobrarTodo: T.pendiente > 0 ? T.pendiente : null,
      abrirCancha: r.estado === "reservada",
      cerrarYSeguir,
      cerrarCargos,
    },
  };
  return { ...vista, firma: JSON.stringify(vista) };
}

/** Lo que se puede tocar en la cuenta del turno. */
export type AccionCuenta =
  | { tipo: "cobrarTodo"; medio: MedioCaja }
  | { tipo: "cobrarJugador"; idx: number; medio: MedioCaja }
  | { tipo: "cerrarYSeguir"; medio: MedioCaja }
  | { tipo: "cerrarCargos"; medio: MedioCaja }
  | { tipo: "abrirCancha" }
  | { tipo: "aCargoCancha"; idx: number; de: string }
  | { tipo: "aCargoCargos"; cuentaId: string; de: string };

/** El resultado de una acción, listo para la pantalla: el aviso y si salió bien. */
export interface Desenlace {
  ok: boolean;
  mensaje: string;
}

/**
 * Ejecuta la acción sobre el estado (lo MUTA, como todo el motor) y devuelve el aviso. Nunca tira:
 * si el motor dice que no, el aviso es su motivo, en criollo.
 */
export function ejecutar(estado: EstadoClub, reservaId: string, accion: AccionCuenta, ahora: Ahora): Desenlace {
  const falla = (r: { motivo: string }): Desenlace => ({ ok: false, mensaje: r.motivo });
  switch (accion.tipo) {
    case "cobrarTodo": {
      const res = cobrarTodoElTurno(estado, reservaId, { medio: accion.medio }, ahora);
      return res.ok ? { ok: true, mensaje: `Cobrado todo el turno: ${pesos(res.total)} (${ETIQUETA_MEDIO[accion.medio]}).` } : falla(res);
    }
    case "cobrarJugador": {
      const t = cuentaDelTurno(estado, reservaId);
      const quien = t.ok ? t.jugadores[accion.idx]?.nombre : undefined;
      const res = cobrarJugador(estado, reservaId, accion.idx, { medio: accion.medio }, ahora);
      if (!res.ok) return falla(res);
      const desglose = res.cancha && res.cargos ? ` (cancha ${pesos(res.cancha)} + cargos ${pesos(res.cargos)})` : "";
      const con = res.cubiertos.length ? `, con lo de ${res.cubiertos.join(", ")}` : "";
      return { ok: true, mensaje: `Cobrado ${pesos(res.total)} a ${quien ?? "el jugador"}${desglose}${con}.` };
    }
    case "cerrarYSeguir": {
      const res = cerrarCanchaYSeguir(estado, reservaId, { medio: accion.medio }, ahora);
      if (!res.ok) return falla(res);
      const cobro = res.cobradoCancha ? ` (cobrados ${pesos(res.cobradoCancha)})` : "";
      const mesa = res.cuentasAbiertas.length ? " La mesa sigue abierta y se cobra cuando se van." : "";
      return { ok: true, mensaje: `Cancha cerrada y libre${cobro}.${mesa}` };
    }
    case "cerrarCargos": {
      const res = cerrarCargosDelTurno(estado, reservaId, { medio: accion.medio }, ahora);
      return res.ok ? { ok: true, mensaje: `Cargos cerrados${res.cobrado ? `: cobrados ${pesos(res.cobrado)}` : ""}.` } : falla(res);
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
  }
}

function resultado(res: Resultado, mensaje: string): Desenlace {
  return res.ok ? { ok: true, mensaje } : { ok: false, mensaje: res.motivo };
}

/** El texto de cada cierre, con su monto (los botones dicen el verbo y la plata). */
export function textoCierre(cual: "cobrarTodo" | "cerrarYSeguir" | "cerrarCargos", monto: number): string {
  if (cual === "cobrarTodo") return `Cobrar todo ${pesos(monto)}`;
  if (cual === "cerrarYSeguir") return monto > 0 ? `Cobrar la cancha ${pesos(monto)} y cerrarla · la mesa sigue` : "Cerrar la cancha · la mesa sigue";
  return monto > 0 ? `Cobrar y cerrar los cargos ${pesos(monto)}` : "Cerrar los cargos";
}
