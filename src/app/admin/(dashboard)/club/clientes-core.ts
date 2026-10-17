// ============================================================================
// LOS CLIENTES DEL CLUB — la lista, la ficha y su cuenta corriente. PURO.
// ============================================================================
//
// Lo mismo que la solapa Clientes del sistema de hoy (public/previews/breakpoint/club/app.mjs: `vistaClientes`,
// `fichaCliente`, `altaClienteDialogo` y las acciones `ccPedir`, `ccGuardar`, `ccCortar`, `cobrarDeuda`):
//   · la lista con buscador (nombre o teléfono), los que deben primero y en rojo, sus créditos y sus faltas;
//   · el alta (nombre, teléfono, nivel) sin repetir teléfono (lo controla el motor);
//   · la ficha: editar, dar de baja (sólo sin deuda ni cargos abiertos en el buffet), las novedades por WhatsApp;
//   · la CUENTA CORRIENTE: el dueño la habilita, le cambia el límite o la corta; recepción pide la autorización y
//     ve «Esperando al dueño» con el código de 6 letras que le manda (como el fiado del buffet, credito-core.ts);
//     el estado de cuenta con el saldo corrido, cobrar la deuda con su medio y recordarla por WhatsApp.
// Las reglas son del motor; acá se arma lo que se ve y se traduce cada toque (clientes-core.test.ts).

import {
  altaCliente,
  aprobarPorCodigo,
  bajaCliente,
  bajaNovedades,
  buscarClientes,
  cliente as clienteDe,
  cobrarDeuda,
  configurarCC,
  editarCliente,
  estadoDeCuenta,
  hhmm,
  linkWhatsApp,
  mensajeWhatsApp,
  pesos,
  solicitarCC,
} from "@/lib/club/motor.mjs";
import type { Ahora, Auth, Cliente, EstadoClub, Fecha } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { trabadoHasta } from "./buffet-core";
import { leerMonto } from "./caja-core";
import { INTENTOS_POR_PEDIDO, mensajeParaElDuenio } from "./credito-core";
import { ETIQUETA_MEDIO, type MedioCaja } from "./cuenta-core";
import { enlaceWhatsApp, type EnlaceWhatsApp, type ModoDelClub } from "./whatsapp-core";

const ddmm = (f: Fecha) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;

/** El límite que se propone cuando todavía no hay ninguno (el del sistema de hoy). */
export const LIMITE_SUGERIDO = 50000;

export type EstadoCC = { tipo: "habilitada"; limite: number } | { tipo: "pedida" } | { tipo: "no" };

export interface FilaCliente {
  id: string;
  nombre: string;
  tel: string;
  nivel: string;
  deuda: number;
  creditos: number;
  faltas: number;
  cc: EstadoCC;
}

export interface VistaClientes {
  filas: FilaCliente[];
  /** Cuántos clientes activos hay en total (sin filtrar). */
  total: number;
  firma: string;
}

const pedidoDe = (estado: EstadoClub, clienteId: string) => estado.novedades.find((n) => n.estado === "pendiente" && n.clienteId === clienteId) ?? null;

function estadoCC(estado: EstadoClub, c: Cliente): EstadoCC {
  if (c.cc.habilitada) return { tipo: "habilitada", limite: c.cc.limite };
  return pedidoDe(estado, c.id) ? { tipo: "pedida" } : { tipo: "no" };
}

/** La lista: los que deben primero (de mayor a menor), después por nombre. */
export function armarClientes(estado: EstadoClub, texto: string): VistaClientes {
  const filas = buscarClientes(estado, texto)
    .slice()
    .sort((a, b) => b.deuda - a.deuda || a.nombre.localeCompare(b.nombre, "es"))
    .map((c) => ({ id: c.id, nombre: c.nombre, tel: c.tel, nivel: c.nivel, deuda: c.deuda, creditos: c.monedero, faltas: c.strikes, cc: estadoCC(estado, c) }));
  const vista = { filas, total: estado.clientes.filter((c) => c.activo !== false).length };
  return { ...vista, firma: JSON.stringify(vista) };
}

/** «Hasta $ 50.000» · «Pedida» · «No». */
export function textoCC(cc: EstadoCC): string {
  return cc.tipo === "habilitada" ? `Hasta ${pesos(cc.limite)}` : cc.tipo === "pedida" ? "Pedida al dueño" : "Sin cuenta corriente";
}

export interface VistaPedidoCC {
  id: string;
  tipo: "cc" | "fiado";
  monto: number;
  pidio: string;
  /** «cuenta corriente hasta $ 60.000» · «fiarle $ 22.100». */
  que: string;
  /** El texto para mandarle al dueño por WhatsApp y su link (sin número: el celular del dueño se carga en Configuración). */
  mensaje: string;
  linkWhatsApp: string;
  quedan: number;
  trabado: string | null;
}

export interface MovimientoDeCuenta {
  cuando: string;
  concepto: string;
  importe: number;
  saldo: number;
}

export interface VistaFicha {
  id: string;
  nombre: string;
  tel: string;
  nivel: string;
  faltas: number;
  creditos: number;
  deuda: number;
  cc: { habilitada: boolean; limite: number };
  /** El pedido de crédito que espera al dueño (si hay). */
  pedido: VistaPedidoCC | null;
  /** Del más viejo al más nuevo, con el saldo corrido. */
  movimientos: MovimientoDeCuenta[];
  /** Si se puede dar de baja y, si no, por qué (lo vuelve a controlar el motor). */
  baja: { puede: true } | { puede: false; motivo: string };
  recibeNovedades: boolean;
  /** «Recordar por WhatsApp» la deuda (null si no debe). Sin teléfono, el link va sin número. */
  /** En la demo, sin número (los teléfonos de ejemplo podrían ser de alguien real). */
  recordarDeuda: EnlaceWhatsApp | null;
  firma: string;
}

export function armarFicha(estado: EstadoClub, clienteId: string, ahora: Ahora, modo: ModoDelClub): VistaFicha | null {
  const c = clienteDe(estado, clienteId);
  if (!c || c.activo === false) return null;
  const ec = estadoDeCuenta(estado, clienteId);
  const n = pedidoDe(estado, clienteId);
  const conCargos = estado.cuentas.some((x) => x.clienteId === clienteId && x.estado === "abierta");
  const pedido: VistaPedidoCC | null = n
    ? {
        id: n.id,
        tipo: n.tipo,
        monto: n.monto ?? n.limite,
        pidio: n.pidio,
        que: n.tipo === "fiado" ? `fiarle ${pesos(n.monto)}` : `cuenta corriente hasta ${pesos(n.monto ?? n.limite)}`,
        mensaje: mensajeParaElDuenio(estado, n.id) ?? "",
        linkWhatsApp: linkWhatsApp("", mensajeParaElDuenio(estado, n.id) ?? ""),
        quedan: INTENTOS_POR_PEDIDO - (n.intentos ?? 0),
        trabado: trabadoHasta(n.bloqueadoHasta, ahora),
      }
    : null;
  const vista: Omit<VistaFicha, "firma"> = {
    id: c.id,
    nombre: c.nombre,
    tel: c.tel,
    nivel: c.nivel,
    faltas: c.strikes,
    creditos: c.monedero,
    deuda: c.deuda,
    cc: { ...c.cc },
    pedido,
    movimientos: ec.ok
      ? ec.movimientos.map((m) => ({
          cuando: `${m.fecha ? ddmm(m.fecha) : ""}${m.min != null ? ` ${hhmm(m.min)}` : ""}`.trim(),
          concepto: m.concepto,
          importe: m.importe,
          saldo: m.saldo,
        }))
      : [],
    baja:
      c.deuda > 0
        ? { puede: false, motivo: `Debe ${pesos(c.deuda)}: para darlo de baja, primero tiene que saldar la cuenta.` }
        : conCargos
          ? { puede: false, motivo: "Tiene cargos abiertos en el buffet: primero se cierran." }
          : { puede: true },
    recibeNovedades: c.aceptaNovedades !== false,
    recordarDeuda: c.deuda > 0 ? enlaceWhatsApp(c.tel, mensajeWhatsApp("deuda", { nombre: c.nombre.split(" ")[0], monto: pesos(c.deuda) }), modo) : null,
  };
  return { ...vista, firma: JSON.stringify(vista) };
}

export type AccionClientes =
  | { tipo: "alta"; nombre: string; tel: string; nivel: string }
  | { tipo: "editar"; clienteId: string; nombre: string; tel: string; nivel: string }
  | { tipo: "baja"; clienteId: string }
  | { tipo: "novedades"; clienteId: string; recibe: boolean }
  /** Sólo un dueño: habilitar o cambiar el límite (`habilitada: true`) o cortar. */
  | { tipo: "configurarCC"; clienteId: string; habilitada: boolean; limite: string }
  /** Recepción: pedir la autorización al dueño. */
  | { tipo: "pedirCC"; clienteId: string; limite: string; nota: string }
  /** Recepción tipea el código que le mandó el dueño (con el monto que aprobó). */
  | { tipo: "aprobarCodigo"; novedadId: string; codigo: string; monto: string }
  | { tipo: "cobrarDeuda"; clienteId: string; medio: MedioCaja; monto: string };

/** El desenlace, con el id del cliente nuevo cuando es un alta (la pantalla abre su ficha). */
export interface DesenlaceClientes extends Desenlace {
  clienteId?: string;
}

const falla = (r: { motivo: string }): DesenlaceClientes => ({ ok: false, mensaje: r.motivo });
const nombreDe = (estado: EstadoClub, id: string) => clienteDe(estado, id)?.nombre ?? "el cliente";

export function ejecutarClientes(estado: EstadoClub, accion: AccionClientes, ahora: Ahora, auth: Auth): DesenlaceClientes {
  switch (accion.tipo) {
    case "alta": {
      const r = altaCliente(estado, { nombre: accion.nombre, tel: accion.tel, nivel: accion.nivel.trim() }, ahora);
      return r.ok ? { ok: true, mensaje: `Listo: ${r.cliente.nombre} ya es cliente del club.`, clienteId: r.cliente.id } : falla(r);
    }
    case "editar": {
      const tel = accion.tel.trim();
      const digitos = tel.replace(/\D/g, "");
      // El alta no deja repetir teléfono; la edición tampoco (el motor sólo lo mira en el alta).
      if (digitos && estado.clientes.some((c) => c.id !== accion.clienteId && c.activo !== false && c.tel.replace(/\D/g, "") === digitos))
        return { ok: false, mensaje: "Ya hay otro cliente con ese teléfono." };
      const r = editarCliente(estado, accion.clienteId, { nombre: accion.nombre, tel, nivel: accion.nivel }, ahora);
      return r.ok ? { ok: true, mensaje: `Ficha de ${r.cliente.nombre} guardada.` } : falla(r);
    }
    case "baja": {
      const nombre = nombreDe(estado, accion.clienteId);
      const r = bajaCliente(estado, accion.clienteId, ahora);
      return r.ok ? { ok: true, mensaje: `${nombre} quedó dado de baja. Su historia queda guardada.` } : falla(r);
    }
    case "novedades": {
      const r = bajaNovedades(estado, accion.clienteId, ahora, accion.recibe);
      const nombre = nombreDe(estado, accion.clienteId);
      return r.ok ? { ok: true, mensaje: accion.recibe ? `${nombre} vuelve a recibir novedades por WhatsApp.` : `${nombre} no recibe más novedades por WhatsApp.` } : falla(r);
    }
    case "configurarCC": {
      const limite = accion.habilitada ? leerMonto(accion.limite) : undefined;
      if (accion.habilitada && !(Number(limite) > 0)) return { ok: false, mensaje: "Poné hasta cuánto le fiamos." };
      const r = configurarCC(estado, accion.clienteId, { habilitada: accion.habilitada, limite }, auth, ahora);
      const nombre = nombreDe(estado, accion.clienteId);
      return r.ok
        ? { ok: true, mensaje: accion.habilitada ? `Cuenta corriente de ${nombre}: hasta ${pesos(limite!)}.` : `Cuenta corriente de ${nombre} cortada: no se le suma más.` }
        : falla(r);
    }
    case "pedirCC": {
      const limite = leerMonto(accion.limite);
      if (!(limite > 0)) return { ok: false, mensaje: "Poné hasta cuánto le fiamos." };
      const r = solicitarCC(estado, accion.clienteId, { limite, nota: accion.nota.trim() }, auth, ahora);
      return r.ok
        ? { ok: true, mensaje: `Pedido enviado: cuenta corriente para ${nombreDe(estado, accion.clienteId)} hasta ${pesos(limite)}. Avisale al dueño por WhatsApp.` }
        : falla(r);
    }
    case "aprobarCodigo": {
      const monto = accion.monto.trim() === "" ? undefined : leerMonto(accion.monto);
      const fiado = estado.novedades.find((n) => n.id === accion.novedadId)?.tipo === "fiado";
      const r = aprobarPorCodigo(estado, accion.novedadId, { codigo: accion.codigo, monto }, auth, ahora);
      if (!r.ok) return falla(r);
      return {
        ok: true,
        mensaje: fiado ? `Aprobado por ${r.aprobo}: ya podés pasar ${pesos(r.monto)} a su cuenta corriente.` : `Aprobado por ${r.aprobo}: cuenta corriente habilitada hasta ${pesos(r.monto)}.`,
      };
    }
    case "cobrarDeuda": {
      const monto = accion.monto.trim() === "" ? undefined : leerMonto(accion.monto);
      if (monto !== undefined && !(monto > 0)) return { ok: false, mensaje: "El monto tiene que ser mayor a cero." };
      const r = cobrarDeuda(estado, accion.clienteId, { medio: accion.medio, monto }, ahora);
      return r.ok
        ? { ok: true, mensaje: `Cobrado ${pesos(r.monto)} de la cuenta de ${nombreDe(estado, accion.clienteId)} (${ETIQUETA_MEDIO[accion.medio]}). Saldo: ${pesos(r.saldo)}.` }
        : falla(r);
    }
  }
}
