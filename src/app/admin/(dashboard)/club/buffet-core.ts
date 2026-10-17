// ============================================================================
// EL BUFFET — las mesas que siguen cargando y las cuentas de cargos. PURO.
// ============================================================================
//
// Pedido del club (14/10 y 15/10): la cancha y el buffet son DOS cuentas. Se termina el turno, se cobra la cancha
// y la mesa sigue: los cargos quedan abiertos («Mesas que siguen cargando») y se suman los que pidan. Cuando se van:
// cobrar y cerrar, o pasarlos a la cuenta corriente. Si el cliente no tiene cuenta corriente, recepción pide el OK
// del dueño para fiar (crédito con código, credito-core.ts).
//
// Acá se decide, sin pantalla (buffet-core.test.ts):
//   · qué cuentas hay abiertas y cuánto debe cada una (con lo que paga de otros, «a cargo de»);
//   · qué productos se ofrecen al cargar: el código del lector (interno o de fábrica) va directo; si no, se busca
//     por nombre o rubro, sólo lo vendible;
//   · y `ejecutarBuffet`, que traduce cada toque a la función del motor y arma el aviso.

import {
  abrirCuenta,
  ajustarCargo,
  buscarProductos,
  cancha as canchaDe,
  cargarEnCuenta,
  cerrarCuenta,
  cliente as clienteDe,
  cobrarCuentaYSusCargos,
  cuenta as cuentaDe,
  cuentasAbiertas,
  hhmm,
  mesasAbiertas,
  pesos,
  producto as productoDe,
  productoPorCodigo,
  puedeACuenta,
  saldoCuenta,
} from "@/lib/club/motor.mjs";
import type { Ahora, Auth, Cuenta, EstadoClub } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { ETIQUETA_MEDIO, type MedioCobro } from "./cuenta-core";

/** Intentos de código por pedido de crédito (los cuenta el motor: `aprobarPorCodigo`). */
export const INTENTOS_POR_PEDIDO = 5;

export interface ProductoParaCargar {
  id: string;
  nombre: string;
  precio: number;
  /** «quedan 3» · «sin tope» (plato o sin conteo). */
  stock: string;
}

/** Lo que tipea recepción o pasa el lector: si es un código exacto, ese producto; si no, la búsqueda (hasta 8). */
export function productosParaCargar(estado: EstadoClub, texto: string): { porCodigo: boolean; productos: ProductoParaCargar[] } {
  const q = texto.trim();
  const proyectar = (p: { id: string; nombre: string; precio: number; stock: number | null; alquiler?: boolean }): ProductoParaCargar => ({
    id: p.id,
    nombre: p.nombre,
    precio: p.precio,
    stock: p.stock == null ? "sin tope" : `quedan ${p.stock}${p.alquiler ? " para alquilar" : ""}`,
  });
  if (q) {
    const exacto = productoPorCodigo(estado, q);
    if (exacto.ok && exacto.producto.precio > 0) return { porCodigo: true, productos: [proyectar(exacto.producto)] };
  }
  const lista = buscarProductos(estado, q, { soloVendibles: true }).filter((p) => p.precio > 0);
  return { porCodigo: false, productos: lista.slice(0, 8).map(proyectar) };
}

export interface CargoDeCuenta {
  idx: number;
  nombre: string;
  cant: number;
  importe: number;
  /** Se puede restar (vuelve al stock); los manuales y los descuentos no se tocan desde acá. */
  ajustable: boolean;
}

export interface VistaCuentaBuffet {
  id: string;
  titular: string;
  /** «Mesa de Cancha 1 · 17:30» o «Sin turno». */
  origen: string;
  items: CargoDeCuenta[];
  /** Lo propio que debe. */
  saldo: number;
  /** Lo que se le cobra si paga: lo suyo + lo de las cuentas a su cargo. */
  aCobrar: number;
  /** «Los paga Ana» si sus cargos están a cargo de otra cuenta abierta. */
  pagaOtro: string | null;
  /** «+ lo de Tomás, Lucía» */
  pagaDe: string[];
  clienteId: string | null;
  creditos: number;
  /** ¿Puede pasar a su cuenta corriente lo que debe? Si no, por qué (y se ofrece pedir el OK para fiar). */
  aCuenta: { ok: true } | { ok: false; motivo: string; puedePedirFiado: boolean };
  /** El pedido de crédito que espera al dueño para este cliente: intentos que quedan y si está trabado. */
  pedidoPendiente: { id: string; tipo: "cc" | "fiado"; monto: number; quedan: number; trabado: string | null } | null;
  firma: string;
}

export interface VistaBuffet {
  /** Las mesas con la cancha cerrada que siguen cargando, de la más vieja a la más nueva. */
  mesas: { reservaId: string; titulo: string; saldo: number; cuentas: string[] }[];
  cuentas: VistaCuentaBuffet[];
  totalAbierto: number;
  firma: string;
}

function pagadorAbierto(estado: EstadoClub, c: Cuenta): Cuenta | null {
  const a = c.aCargoDe ? cuentaDe(estado, c.aCargoDe) : undefined;
  return a && a.estado === "abierta" ? a : null;
}

export function armarCuentaBuffet(estado: EstadoClub, c: Cuenta): VistaCuentaBuffet {
  const deps = estado.cuentas.filter((x) => x.estado === "abierta" && x.aCargoDe === c.id && x.id !== c.id);
  const saldo = Math.max(0, saldoCuenta(c));
  const aCobrar = saldo + deps.reduce((s, x) => s + Math.max(0, saldoCuenta(x)), 0);
  const r = c.reservaId ? estado.reservas.find((x) => x.id === c.reservaId) : undefined;
  const ficha = c.clienteId ? clienteDe(estado, c.clienteId) : undefined;
  const pagador = pagadorAbierto(estado, c);
  const p = puedeACuenta(ficha, aCobrar);
  const pendiente = c.clienteId ? estado.novedades.find((n) => n.estado === "pendiente" && n.clienteId === c.clienteId) : undefined;
  const aCuenta: VistaCuentaBuffet["aCuenta"] = !(aCobrar > 0) || p.ok ? { ok: true } : { ok: false, motivo: p.motivo, puedePedirFiado: !!ficha && !pendiente };
  const vista: Omit<VistaCuentaBuffet, "firma"> = {
    id: c.id,
    titular: c.titular,
    origen: r ? `Mesa de ${canchaDe(estado, r.canchaId)?.nombre ?? "cancha"} · ${hhmm(r.inicio)}` : "Sin turno",
    items: c.items.map((i, idx) => ({ idx, nombre: i.nombre, cant: i.cant, importe: i.cant * i.precioUnit, ajustable: !i.manual && i.precioUnit >= 0 })),
    saldo,
    aCobrar,
    pagaOtro: pagador ? pagador.titular : null,
    pagaDe: deps.map((x) => x.titular),
    clienteId: c.clienteId,
    creditos: ficha?.monedero ?? 0,
    aCuenta,
    pedidoPendiente: pendiente
      ? {
          id: pendiente.id,
          tipo: pendiente.tipo,
          monto: pendiente.monto,
          quedan: INTENTOS_POR_PEDIDO - (pendiente.intentos ?? 0),
          trabado: pendiente.bloqueadoHasta?.min != null ? `Trabado hasta las ${hhmm(pendiente.bloqueadoHasta.min)}` : null,
        }
      : null,
  };
  return { ...vista, firma: JSON.stringify(vista) };
}

export function armarBuffet(estado: EstadoClub): VistaBuffet {
  const mesas = mesasAbiertas(estado).map((m) => ({
    reservaId: m.reserva.id,
    titulo: `${m.reserva.titular} · ${canchaDe(estado, m.reserva.canchaId)?.nombre ?? ""} ${hhmm(m.reserva.inicio)}`,
    saldo: m.saldo,
    cuentas: m.cuentas.map((c) => c.id),
  }));
  const cuentas = cuentasAbiertas(estado).map((c) => armarCuentaBuffet(estado, c));
  const totalAbierto = cuentas.reduce((s, c) => s + c.saldo, 0);
  const vista: Omit<VistaBuffet, "firma"> = { mesas, cuentas, totalAbierto };
  return { ...vista, firma: [JSON.stringify(mesas), totalAbierto, cuentas.map((c) => c.firma).join("|")].join("#") };
}

/** Reusa las cuentas que no cambiaron (el memo de cada tarjeta no se repinta). */
export function compartirBuffet(previa: VistaBuffet | undefined, nueva: VistaBuffet): VistaBuffet {
  if (!previa) return nueva;
  if (previa.firma === nueva.firma) return previa;
  const viejas = new Map(previa.cuentas.map((c) => [c.id, c]));
  return { ...nueva, cuentas: nueva.cuentas.map((c) => (viejas.get(c.id)?.firma === c.firma ? viejas.get(c.id)! : c)) };
}

export type AccionBuffet =
  | { tipo: "abrir"; titular: string; clienteId: string | null }
  | { tipo: "cargar"; cuentaId: string; productoId: string; cant: number }
  | { tipo: "ajustar"; cuentaId: string; itemIdx: number; delta: 1 | -1 }
  | { tipo: "cobrar"; cuentaId: string; medio: MedioCobro }
  | { tipo: "aCuenta"; cuentaId: string }
  | { tipo: "cerrarEnCero"; cuentaId: string };

export function ejecutarBuffet(estado: EstadoClub, accion: AccionBuffet, ahora: Ahora, auth?: Auth): Desenlace {
  const conAuth = auth?.usuarioId ? auth : null;
  switch (accion.tipo) {
    case "abrir": {
      const res = abrirCuenta(estado, { clienteId: accion.clienteId, titular: accion.titular }, ahora);
      if (!res.ok) return { ok: false, mensaje: res.motivo };
      return { ok: true, mensaje: res.reusada ? `${res.cuenta.titular} ya tenía la cuenta abierta: seguís cargando ahí.` : `Cuenta abierta a nombre de ${res.cuenta.titular}.` };
    }
    case "cargar": {
      const p = productoDe(estado, accion.productoId);
      const res = cargarEnCuenta(estado, accion.cuentaId, accion.productoId, accion.cant, ahora);
      return res.ok ? { ok: true, mensaje: `${accion.cant} × ${p?.nombre ?? "producto"} a la cuenta de ${res.cuenta.titular}.` } : { ok: false, mensaje: res.motivo };
    }
    case "ajustar": {
      const res = ajustarCargo(estado, accion.cuentaId, accion.itemIdx, accion.delta, ahora, conAuth);
      return res.ok ? { ok: true, mensaje: accion.delta > 0 ? "Uno más." : "Uno menos (vuelve al stock)." } : { ok: false, mensaje: res.motivo };
    }
    case "cobrar": {
      const res = cobrarCuentaYSusCargos(estado, accion.cuentaId, { medio: accion.medio, ...(conAuth && { auth: conAuth }) }, ahora);
      if (!res.ok) return { ok: false, mensaje: res.motivo };
      const con = res.cubiertas.length ? `, con lo de ${res.cubiertas.join(", ")}` : "";
      return { ok: true, mensaje: `Cobrados ${pesos(res.monto)} (${ETIQUETA_MEDIO[accion.medio]})${con}. Cuenta cerrada.` };
    }
    case "aCuenta": {
      const c = cuentaDe(estado, accion.cuentaId);
      const total = c ? armarCuentaBuffet(estado, c).aCobrar : 0;
      const res = cerrarCuenta(estado, accion.cuentaId, { aCuenta: true }, ahora);
      return res.ok ? { ok: true, mensaje: `${pesos(total)} a la cuenta corriente de ${c?.titular ?? "el cliente"}. Cuenta cerrada.` } : { ok: false, mensaje: res.motivo };
    }
    case "cerrarEnCero": {
      const res = cerrarCuenta(estado, accion.cuentaId, {}, ahora);
      return res.ok ? { ok: true, mensaje: "Cuenta cerrada." } : { ok: false, mensaje: res.motivo };
    }
  }
}

/** El paso previo de «Créditos del cliente» para cobrar una cuenta del buffet (ver `confirmarCreditos`). */
export function confirmarCreditosCuenta(
  estado: EstadoClub,
  cuentaId: string,
): { ok: true; de: string; que: string; usa: number; creditos: number; quedan: number; cubreSena: false } | { ok: false; motivo: string } {
  const c = cuentaDe(estado, cuentaId);
  if (!c || c.estado !== "abierta") return { ok: false, motivo: "Esa cuenta no está abierta." };
  const ficha = c.clienteId ? clienteDe(estado, c.clienteId) : undefined;
  if (!ficha) return { ok: false, motivo: "Esa cuenta no tiene ficha de cliente: no tiene créditos para usar." };
  const usa = armarCuentaBuffet(estado, c).aCobrar;
  if (!(usa > 0)) return { ok: false, motivo: "No hay cargos para cobrar." };
  if (ficha.monedero < usa) return { ok: false, motivo: `${ficha.nombre} tiene ${pesos(ficha.monedero)} en créditos: no alcanza para ${pesos(usa)}.` };
  return { ok: true, de: ficha.nombre, que: `Los cargos de ${c.titular}`, usa, creditos: ficha.monedero, quedan: ficha.monedero - usa, cubreSena: false };
}
