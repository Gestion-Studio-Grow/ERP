// ============================================================================
// EL TABLERO DEL DUEÑO — lo que espera su OK y cómo viene el club. PURO.
// ============================================================================
//
// Lo mismo que el Tablero del sistema de hoy (public/previews/breakpoint/club/app.mjs: `vistaTablero`,
// `aprobarCC`, `rechazarCC`, `otorgar`, `rechazarAcceso`); las cámaras de la demo van aparte (camaras-core.ts):
//   · NOVEDADES PARA AUTORIZAR: los pedidos de crédito (cuenta corriente o fiado, con el monto que el dueño puede
//     cambiar antes de autorizar) y los pedidos de acceso (el motor genera un PIN de 2 dígitos que se muestra UNA
//     sola vez: no va al aviso de abajo ni a «qué pasó hoy»);
//   · los indicadores del día, las canchas ahora, la ocupación de la semana (mapa de calor), la caja por medio, los
//     platos más vendidos y «qué pasó hoy».
// Las reglas son del motor; acá se arma lo que se ve y se traduce cada toque (tablero-core.test.ts).

import {
  MEDIOS,
  ROLES,
  NOMBRE_DIA,
  cliente as clienteDe,
  diaSemana,
  hhmm,
  kpis,
  mapaDeCalor,
  metricasPlatos,
  otorgarAcceso,
  pesos,
  rechazarAcceso,
  resolverCredito,
  saldo,
  sumarDias,
} from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub, Fecha, Rol } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { leerMonto } from "./caja-core";
import { MEDIOS_CAJA } from "./cuenta-core";

const ddmm = (f: Fecha) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;
const pct = (x: number) => `${Math.round(x * 100)} %`;
/** «vie 17/10». */
export const fechaCorta = (f: Fecha) => `${NOMBRE_DIA[diaSemana(f)].slice(0, 3).toLowerCase()} ${ddmm(f)}`;

export interface PedidoParaAutorizar {
  id: string;
  tipo: "cc" | "fiado";
  /** «Cuenta corriente» · «Fiado de hoy». */
  rotulo: string;
  pidio: string;
  cliente: string;
  monto: number;
  /** «cuenta corriente hasta $ 60.000» · «fiarle $ 22.100 (una vez, a su cuenta corriente)». */
  que: string;
  nota: string;
  /** Lo que ya debe el cliente (0 = nada): se avisa en rojo. */
  debe: number;
}

export interface AccesoPedido {
  id: string;
  nombre: string;
  cuando: string;
}

export interface Indicador {
  etiqueta: string;
  valor: string;
  detalle: string;
}

export interface CanchaAhora {
  id: string;
  nombre: string;
  /** El turno que se está jugando, o null. */
  juego: { titular: string; termina: string; avance: number; debe: number } | null;
  /** Sin juego: «Libre · próximo 20:00 Julieta» o «En mantenimiento». */
  libre: string;
  luzPrendida: boolean;
}

export interface VistaTablero {
  pedidos: PedidoParaAutorizar[];
  accesos: AccesoPedido[];
  indicadores: Indicador[];
  hora: string;
  canchas: CanchaAhora[];
  calor: { horas: string[]; filas: { fecha: Fecha; dia: string; valores: number[] }[] };
  caja: { neto: number; medios: { medio: string; monto: number; proporcion: number }[] };
  platos: { total: number; dias: number; filas: { plato: string; unidades: number; porDia: string; facturado: number; margen: number; participacion: number }[] };
  log: { hora: string; texto: string }[];
  firma: string;
}

/** Los pedidos de crédito que esperan a un dueño (lo que cuenta el aviso 🔔). */
export function pedidosDeCreditoPendientes(estado: EstadoClub): number {
  return estado.novedades.filter((n) => n.estado === "pendiente").length;
}

export function armarTablero(estado: EstadoClub, ahora: Ahora, cuantosLog = 40): VistaTablero {
  const hoy = ahora.fecha;
  const k = kpis(estado, hoy, ahora);
  const semana = Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i - 6));
  const calor = mapaDeCalor(estado, semana);
  const platos = metricasPlatos(estado, { desde: sumarDias(hoy, -6), hasta: hoy });
  const porMedio = MEDIOS_CAJA.map((m) => ({ medio: MEDIOS[m], monto: k.caja.porMedio[m] ?? 0 }));
  const maxMedio = Math.max(1, ...porMedio.map((m) => Math.abs(m.monto)));

  const pedidos = estado.novedades
    .filter((n) => n.estado === "pendiente")
    .map((n) => {
      const c = clienteDe(estado, n.clienteId);
      const fiado = n.tipo === "fiado";
      const monto = n.monto ?? n.limite;
      return {
        id: n.id,
        tipo: n.tipo,
        rotulo: fiado ? "Fiado de hoy" : "Cuenta corriente",
        pidio: n.pidio,
        cliente: c?.nombre ?? "",
        monto,
        que: fiado ? `fiarle ${pesos(monto)} (una vez, a su cuenta corriente)` : `cuenta corriente hasta ${pesos(monto)}`,
        nota: n.nota ?? "",
        debe: c?.deuda ?? 0,
      };
    });
  const accesos = estado.solicitudesAcceso
    .filter((s) => s.estado === "pendiente")
    .map((s) => ({ id: s.id, nombre: s.nombre, cuando: s.min != null ? `${s.fecha && s.fecha !== hoy ? `${ddmm(s.fecha)} ` : ""}${hhmm(s.min)}` : "" }));

  const canchas = estado.canchas.map((c) => {
    const r = estado.reservas.find((x) => x.fecha === hoy && x.canchaId === c.id && x.estado === "en_cancha");
    const prox = estado.reservas
      .filter((x) => x.fecha === hoy && x.canchaId === c.id && x.estado === "reservada" && x.inicio >= ahora.min - 30)
      .sort((a, b) => a.inicio - b.inicio)[0];
    return {
      id: c.id,
      nombre: c.nombre,
      juego: r
        ? { titular: r.titular, termina: hhmm(r.inicio + r.duracion), avance: Math.min(1, Math.max(0, (ahora.min - r.inicio) / r.duracion)), debe: Math.max(0, saldo(r)) }
        : null,
      libre: `${c.estado === "mantenimiento" ? "En mantenimiento" : "Libre"}${prox ? ` · próximo ${hhmm(prox.inicio)} ${prox.titular}` : ""}`,
      luzPrendida: !r && !!estado.luces[c.id],
    };
  });

  const vista: Omit<VistaTablero, "firma"> = {
    pedidos,
    accesos,
    hora: hhmm(ahora.min),
    indicadores: [
      { etiqueta: "Ocupación de hoy", valor: pct(k.ocupacion), detalle: `Pico ${pct(k.ocupacionPico)} · valle ${pct(k.ocupacionValle)}` },
      { etiqueta: "Canchas vendidas hoy", valor: pesos(k.vendido), detalle: `${k.turnos} turnos · ticket ${pesos(k.ticketPromedio)}` },
      { etiqueta: "Cobrado de canchas", valor: pesos(k.cobrado), detalle: `Falta cobrar de lo que ya se juega: ${pesos(k.porCobrar)}` },
      { etiqueta: "Buffet del día", valor: pesos(k.buffet), detalle: `${k.cuentasAbiertas} cuentas abiertas · ${pesos(k.cuentasAbiertasSaldo)}` },
      { etiqueta: "Cuentas corrientes", valor: pesos(k.deudaClientes), detalle: `Créditos emitidos ${pesos(k.creditos)}` },
      { etiqueta: "Le debemos a proveedores", valor: pesos(k.deudaProveedores), detalle: "Se ven en Proveedores" },
      { etiqueta: "Stock valorizado", valor: pesos(k.stockValorizado), detalle: `Faltas hoy: ${k.faltas} · cancelados: ${k.cancelados}` },
    ],
    canchas,
    calor: {
      horas: calor.horas.map((h) => String((h / 60) % 24)),
      filas: calor.filas.map((f) => ({ fecha: f.fecha, dia: fechaCorta(f.fecha), valores: f.valores })),
    },
    caja: { neto: k.caja.neto, medios: porMedio.map((m) => ({ ...m, proporcion: Math.max(0, m.monto) / maxMedio })) },
    platos: {
      total: platos.total,
      dias: platos.dias,
      filas: platos.filas.map((f) => ({
        plato: f.plato,
        unidades: f.unidades,
        porDia: f.porDia.toLocaleString("es-AR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
        facturado: f.facturado,
        margen: f.margen,
        participacion: f.participacion,
      })),
    },
    log: estado.log.slice(0, cuantosLog).map((l) => ({ hora: l.min != null ? hhmm(l.min) : "", texto: l.texto })),
  };
  return { ...vista, firma: JSON.stringify(vista) };
}

export type AccionTablero =
  | { tipo: "autorizar"; novedadId: string; monto: string }
  | { tipo: "rechazar"; novedadId: string }
  | { tipo: "otorgar"; solicitudId: string; rol: Rol }
  | { tipo: "rechazarAcceso"; solicitudId: string };

/** Con «otorgar», el PIN que generó el motor: la pantalla lo muestra UNA vez (no va en el mensaje del aviso). */
export interface DesenlaceTablero extends Desenlace {
  acceso?: { nombre: string; rol: string; pin: string };
}

export function ejecutarTablero(estado: EstadoClub, accion: AccionTablero, ahora: Ahora, auth: Auth): DesenlaceTablero {
  switch (accion.tipo) {
    case "autorizar": {
      const n = estado.novedades.find((x) => x.id === accion.novedadId);
      const monto = leerMonto(accion.monto);
      if (!(monto > 0)) return { ok: false, mensaje: n?.tipo === "fiado" ? "Poné cuánto se fía." : "Poné hasta cuánto le fiamos." };
      const r = resolverCredito(estado, accion.novedadId, { aprobar: true, monto }, auth, ahora);
      if (!r.ok) return { ok: false, mensaje: r.motivo };
      const nombre = n ? (clienteDe(estado, n.clienteId)?.nombre ?? "") : "";
      return {
        ok: true,
        mensaje: n?.tipo === "fiado" ? `Autorizado: se le fían ${pesos(monto)} a ${nombre}. Recepción ya lo puede pasar a su cuenta.` : `Cuenta corriente de ${nombre} habilitada hasta ${pesos(monto)}.`,
      };
    }
    case "rechazar": {
      const n = estado.novedades.find((x) => x.id === accion.novedadId);
      const r = resolverCredito(estado, accion.novedadId, { aprobar: false }, auth, ahora);
      return r.ok ? { ok: true, mensaje: `Pedido de ${n ? (clienteDe(estado, n.clienteId)?.nombre ?? "") : ""} rechazado.` } : { ok: false, mensaje: r.motivo };
    }
    case "otorgar": {
      const r = otorgarAcceso(estado, accion.solicitudId, { rol: accion.rol }, auth, ahora);
      if (!r.ok) return { ok: false, mensaje: r.motivo };
      return {
        ok: true,
        mensaje: `Acceso otorgado a ${r.usuario.nombre} (${ROLES[r.usuario.rol]}). Su PIN está arriba, en el Tablero: se muestra una sola vez.`,
        acceso: { nombre: r.usuario.nombre, rol: ROLES[r.usuario.rol], pin: r.pin },
      };
    }
    case "rechazarAcceso": {
      const s = estado.solicitudesAcceso.find((x) => x.id === accion.solicitudId);
      const r = rechazarAcceso(estado, accion.solicitudId, auth, ahora);
      return r.ok ? { ok: true, mensaje: `Pedido de acceso de ${s?.nombre ?? ""} rechazado.` } : { ok: false, mensaje: r.motivo };
    }
  }
}
