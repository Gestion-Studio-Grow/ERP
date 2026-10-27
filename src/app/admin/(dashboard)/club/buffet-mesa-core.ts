// ============================================================================
// LA MESA COMPLEJA Y LA VENTA DE MOSTRADOR — pasar cargos, cargar a mano, descontar con PIN del dueño. PURO.
// ============================================================================
//
// Ola 1 de paridad con el club vanilla (public/previews/breakpoint/club/app.mjs):
//   · «Mesa compleja» (`mesaCompleja` + `pasarCargo` / `cargoManual`): cada cargo se pasa, entero o en parte, a la
//     cuenta de quien lo paga (`transferirCargo`), y lo que no está en la lista se carga a mano (`cargoManual`). Un
//     DESCUENTO (monto negativo) lo firma un dueño con SU PIN, aunque quien esté en el mostrador sea recepción: la
//     pantalla busca de quién es el PIN (`usuarioPorPin`) y el motor lo valida (permiso «configurar» + PIN). Nunca
//     deja la cuenta por debajo de lo que ya se pagó (ni en negativo).
//   · «Venta rápida» (`mostrador` + `cobrarMostrador`): un carrito que se cobra y se cierra en el acto
//     (`ventaMostrador`), sin cuenta a nombre de nadie y sin créditos.
//   · El PIN del descuento pasa por el tope compartido de TODO PIN del equipo (el del bloqueo: tope-de-pin.ts). Acá
//     sólo se dice qué pasó con el PIN (`pin`: "bueno" | "malo" | null); contarlo es de la pantalla.
//   · El PIN VIEJO de un dueño (el de 2 del piloto, antes de elegir el de 4: `pinDesactualizado`) no firma: se rechaza
//     y cuenta como intento malo (hallazgo del Gate del vanilla, 18/10).
//   · «Mesas que siguen» (Tanda 2D de la reingeniería de Break Point): la mesa de un turno con la cancha cerrada vive EN
//     Buffet con sus comensales (los jugadores del turno, `mesasDelBuffet`): lo que lleva cada uno, su cobro con su medio
//     y el cierre de la mesa. Se arma con la MISMA cuenta del turno (`armarCuenta`) y se toca con sus acciones (comando
//     «cuenta»): sumar un plato a un comensal, cobrarle lo suyo, cobrar todo y cerrar, o a cuenta corriente. Sin salir de
//     Buffet (antes «Ver la cuenta» saltaba a la Agenda).
// La plata la decide el motor; acá se traduce cada toque y se arma el aviso. Este archivo lo importa SÓLO el buffet
// (su chunk aparte): la agenda no lo carga.

import { pinDeEjemplo, cargoManual, cancha as canchaDe, cuenta as cuentaDe, hhmm, mesasAbiertas, pesos, pinDesactualizado, producto as productoDe, transferirCargo, usuarioPorPin, ventaMostrador } from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { productosParaCargar, type ProductoParaCargar } from "./buffet-core";
import { ETIQUETA_MEDIO, MEDIOS_CAJA, armarCuenta, type MedioCaja } from "./cuenta-core";
import type { DesenlaceConPin } from "./tope-de-pin";

// ───────────── mesa compleja ─────────────

/** Lo que se le dice a un dueño que firma un descuento con el PIN viejo. */
export const PIN_VIEJO = "Ese es tu PIN viejo. Para firmar, elegí tu PIN nuevo de 4 dígitos: tocá «Cambiar de usuario» y entrá con el viejo una última vez.";

export type AccionMesa =
  | { tipo: "pasarCargo"; cuentaId: string; itemIdx: number; aCuentaId: string; cant: number | null }
  | { tipo: "cargoManual"; cuentaId: string; concepto: string; monto: number; descuento: boolean; pin: string };

/** Las dos se deshacen, como en el vanilla (`pasarCargo` y `cargoManual` están en su `DESHACIBLES`). */
export const DESHACIBLE_MESA: Readonly<Record<AccionMesa["tipo"], boolean>> = { pasarCargo: true, cargoManual: true };

/**
 * El desenlace y qué pasó con el PIN de un descuento, para el tope de intentos: "bueno" (es de un dueño), "malo" (no
 * es de un dueño) o null (no se llegó a mirar: no era descuento, o faltaba el monto, el PIN o el concepto).
 */
export type DesenlaceMesa = DesenlaceConPin;

/**
 * Quién firma un descuento (como `cargoManual` del vanilla): si el PIN es de un dueño, ese dueño; si no, quien opera
 * con ese PIN (y el motor dice que no: «Un descuento lo autoriza el dueño con su PIN» o «PIN incorrecto»).
 */
export function quienFirma(estado: EstadoClub, pin: string, auth: Auth): { auth: Auth; esDuenio: boolean } {
  const firma = usuarioPorPin(estado, pin);
  if (firma?.ok && firma.usuario.rol === "duenio") return { auth: { usuarioId: firma.usuario.id, pin: pin.trim() }, esDuenio: true };
  return { auth: { ...auth, pin: pin.trim() }, esDuenio: false };
}

export function ejecutarMesa(estado: EstadoClub, accion: AccionMesa, ahora: Ahora, auth: Auth): DesenlaceMesa {
  if (accion.tipo === "pasarCargo") {
    const de = cuentaDe(estado, accion.cuentaId);
    const a = cuentaDe(estado, accion.aCuentaId);
    const item = de?.items[accion.itemIdx];
    const n = accion.cant ?? item?.cant ?? 0;
    const res = transferirCargo(estado, accion.cuentaId, accion.itemIdx, accion.aCuentaId, accion.cant, ahora, auth.usuarioId ? auth : null);
    if (!res.ok) return { ok: false, mensaje: res.motivo, pin: null };
    return { ok: true, mensaje: `${n} × ${item?.nombre ?? "cargo"} pasó a la cuenta de ${a?.titular ?? "la otra persona"}.`, pin: null };
  }
  const monto = Math.abs(Math.round(Number(accion.monto))) * (accion.descuento ? -1 : 1);
  if (!monto) return { ok: false, mensaje: "Poné el monto.", pin: null };
  let firma: Auth = auth;
  let pin: DesenlaceMesa["pin"] = null;
  if (monto < 0) {
    if (!accion.pin.trim()) return { ok: false, mensaje: "Un descuento lo autoriza el dueño con su PIN: escribilo en «PIN del dueño».", pin: null };
    // Sin concepto el motor dice que no antes de mirar el PIN: tampoco se cuenta como intento.
    if (!accion.concepto.trim()) return { ok: false, mensaje: "Escribí el concepto del cargo.", pin: null };
    const q = quienFirma(estado, accion.pin, auth);
    if (q.esDuenio && pinDesactualizado(estado, q.auth.usuarioId ?? "")) return { ok: false, mensaje: PIN_VIEJO, pin: "malo" };
    firma = q.auth;
    pin = q.esDuenio ? "bueno" : "malo";
  }
  const res = cargoManual(estado, accion.cuentaId, { concepto: accion.concepto, monto }, firma, ahora);
  // Un descuento lo firma un dueño: un PIN bueno acá siempre es de un dueño (vuelve el tope a cero, SEC-5).
  const duenio = pin === "bueno";
  if (!res.ok) return { ok: false, mensaje: res.motivo, pin, duenio };
  return {
    ok: true,
    mensaje: monto < 0 ? `Descuento de ${pesos(-monto)} aplicado (lo autorizó ${res.item.por ?? "el dueño"}).` : `Cargo manual sumado: ${res.item.nombre} ${pesos(monto)}.`,
    pin,
    duenio,
  };
}

/** SÓLO DEMO: los PIN de ejemplo de los dueños, para poder probar un descuento (en la jornada real no se muestran). */
export function pinesDeEjemplo(estado: EstadoClub): { nombre: string; pin: string }[] {
  return estado.usuarios.filter((u) => u.rol === "duenio" && u.activo !== false && u.pin).map((u) => ({ nombre: u.nombre, pin: pinDeEjemplo(u) }));
}

// ───────────── venta rápida de mostrador ─────────────

/** El carrito: producto → cantidad (sólo cantidades > 0). */
export type Carrito = Readonly<Record<string, number>>;

/** Suma o resta uno (o `delta`) de un producto; en cero sale del carrito. Devuelve un carrito nuevo. Pura. */
export function sumarAlCarrito(carrito: Carrito, productoId: string, delta: number): Carrito {
  const n = Math.max(0, (carrito[productoId] ?? 0) + Math.round(delta));
  const { [productoId]: _fuera, ...resto } = carrito;
  void _fuera;
  return n > 0 ? { ...resto, [productoId]: n } : resto;
}

export interface LineaDelCarrito {
  id: string;
  nombre: string;
  cant: number;
  importe: number;
}

/** Lo que se ve del carrito (con el precio de lista de ahora). El total que se cobra lo calcula el motor. */
export function armarCarrito(estado: EstadoClub, carrito: Carrito): { lineas: LineaDelCarrito[]; total: number } {
  const lineas = Object.entries(carrito).flatMap(([id, cant]) => {
    const p = productoDe(estado, id);
    return p ? [{ id, nombre: p.nombre, cant, importe: cant * p.precio }] : [];
  });
  return { lineas, total: lineas.reduce((s, l) => s + l.importe, 0) };
}

/** Lo que se ofrece en el mostrador: lo de `productosParaCargar` menos lo de alquiler (va a la cuenta de un jugador). */
export function productosParaMostrador(estado: EstadoClub, texto: string): { porCodigo: boolean; productos: ProductoParaCargar[] } {
  const r = productosParaCargar(estado, texto);
  return { porCodigo: r.porCodigo, productos: r.productos.filter((p) => !productoDe(estado, p.id)?.alquiler) };
}

/** La venta se deshace, como en el vanilla (`cobrarMostrador` está en su `DESHACIBLES`). */
export const VENTA_DESHACIBLE = true;

/** Cobra el carrito en el acto (`ventaMostrador`). Sólo medios de caja: con créditos se usa una cuenta a nombre del cliente. */
export function venderEnMostrador(estado: EstadoClub, carrito: Carrito, medio: MedioCaja, ahora: Ahora): Desenlace {
  if (!(MEDIOS_CAJA as readonly string[]).includes(medio)) return { ok: false, mensaje: "Elegí cómo paga (efectivo, Mercado Pago, transferencia o débito)." };
  const items = Object.entries(carrito)
    .filter(([, cant]) => cant > 0)
    .map(([productoId, cant]) => ({ productoId, cant }));
  const res = ventaMostrador(estado, items, medio, ahora);
  if (!res.ok) return { ok: false, mensaje: res.motivo };
  return { ok: true, mensaje: `Venta cobrada: ${pesos(res.total)} (${ETIQUETA_MEDIO[medio]}).` };
}

// ───────────── mesas que siguen (Tanda 2D) ─────────────

/** Un comensal de la mesa: un jugador del turno, con lo que lleva y lo que se le cobra si paga lo suyo. */
export interface ComensalDeLaMesa {
  idx: number;
  nombre: string;
  /** Lo suyo (y lo de los que invita), o 0. */
  aPagar: number;
  /** «lo paga Ana» / «al día» si no se le cobra nada. */
  situacion: string | null;
  /** Lo que lleva en su cuenta («2 × Milanesa»). */
  lleva: string[];
}

export interface MesaDelBuffet {
  reservaId: string;
  /** «Mesa de Martín Ríos». */
  titulo: string;
  /** «Cancha 1 · 17:30 · 4 comensales». */
  detalle: string;
  comensales: ComensalDeLaMesa[];
  /** Lo que falta cobrar en la mesa. */
  total: number;
  /** Se puede pasar a cuenta corriente (hay cargos por cobrar). */
  aCuentaCorriente: boolean;
  /** Las cuentas abiertas de la mesa (en «Cuentas abiertas» no se repiten: van dentro de la mesa). */
  cuentas: string[];
  firma: string;
}

/**
 * La mesa de un turno con la cancha cerrada, con sus comensales (los jugadores del turno, también los que todavía no
 * cargaron nada), armada con la cuenta del turno: lo que debe cada uno sale de `cuentaDelTurno` del motor. null si la mesa
 * ya se cerró o la cancha sigue en juego. Pura.
 */
export function mesaDelBuffet(estado: EstadoClub, reservaId: string): MesaDelBuffet | null {
  const v = armarCuenta(estado, reservaId);
  if (!v || !v.mesaAbierta) return null;
  const r = estado.reservas.find((x) => x.id === reservaId)!;
  const n = v.jugadores.length;
  const cuentas = estado.cuentas.filter((c) => c.estado === "abierta" && c.reservaId === reservaId).map((c) => c.id);
  const sinFirma: Omit<MesaDelBuffet, "firma"> = {
    reservaId,
    titulo: `Mesa de ${v.titular}`,
    detalle: `${canchaDe(estado, r.canchaId)?.nombre ?? "Cancha"} · ${hhmm(r.inicio)} · ${n} ${n === 1 ? "comensal" : "comensales"}`,
    comensales: v.jugadores.map((j) => ({ idx: j.idx, nombre: j.nombre, aPagar: j.aPagar, situacion: j.situacion, lleva: j.items.map((i) => `${i.cant} × ${i.nombre}`) })),
    total: v.totales.pendiente,
    aCuentaCorriente: v.cierres.cargosACuenta,
    cuentas,
  };
  return { ...sinFirma, firma: JSON.stringify(sinFirma) };
}

/** Las mesas que siguen, de la más vieja a la más nueva (las de `mesasAbiertas` del motor). Pura. */
export function mesasDelBuffet(estado: EstadoClub): MesaDelBuffet[] {
  return mesasAbiertas(estado).flatMap((m) => {
    const mesa = mesaDelBuffet(estado, m.reserva.id);
    return mesa ? [mesa] : [];
  });
}

/** Reusa las mesas que no cambiaron (cada una es un `memo`: cargar en una no repinta las otras). */
export function compartirMesas(previas: MesaDelBuffet[] | undefined, nuevas: MesaDelBuffet[]): MesaDelBuffet[] {
  if (!previas) return nuevas;
  const viejas = new Map(previas.map((m) => [m.reservaId, m]));
  const lista = nuevas.map((m) => (viejas.get(m.reservaId)?.firma === m.firma ? viejas.get(m.reservaId)! : m));
  return lista.length === previas.length && lista.every((m, i) => m === previas[i]) ? previas : lista;
}

/** «Cobrar todo $X y cerrar la mesa» / «Cerrar la mesa» (sin nada por cobrar). */
export function textoCerrarMesa(total: number): string {
  return total > 0 ? `Cobrar todo ${pesos(total)} y cerrar la mesa` : "Cerrar la mesa";
}
