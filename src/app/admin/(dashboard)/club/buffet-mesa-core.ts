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
//   · El PIN de 2 dígitos se adivina en 100 intentos: con 5 PIN mal seguidos se espera 30 s (el mismo tope que el
//     vanilla usa para aprobar con PIN, `intentosPin`). En la jornada real, el bloqueo del club manda (otra sesión).
// La plata la decide el motor; acá se traduce cada toque y se arma el aviso. Este archivo lo importa SÓLO el buffet
// (su chunk aparte): la agenda no lo carga.

import { cargoManual, cuenta as cuentaDe, pesos, producto as productoDe, transferirCargo, usuarioPorPin, ventaMostrador } from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { productosParaCargar, type ProductoParaCargar } from "./buffet-core";
import { ETIQUETA_MEDIO, MEDIOS_CAJA, type MedioCaja } from "./cuenta-core";

// ───────────── mesa compleja ─────────────

export type AccionMesa =
  | { tipo: "pasarCargo"; cuentaId: string; itemIdx: number; aCuentaId: string; cant: number | null }
  | { tipo: "cargoManual"; cuentaId: string; concepto: string; monto: number; descuento: boolean; pin: string };

/** Las dos se deshacen, como en el vanilla (`pasarCargo` y `cargoManual` están en su `DESHACIBLES`). */
export const DESHACIBLE_MESA: Readonly<Record<AccionMesa["tipo"], boolean>> = { pasarCargo: true, cargoManual: true };

/** El desenlace, y si el PIN que se puso para un descuento NO es de un dueño (para el tope de intentos). */
export type DesenlaceMesa = Desenlace & { pinAjeno: boolean };

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
    if (!res.ok) return { ok: false, mensaje: res.motivo, pinAjeno: false };
    return { ok: true, mensaje: `${n} × ${item?.nombre ?? "cargo"} pasó a la cuenta de ${a?.titular ?? "la otra persona"}.`, pinAjeno: false };
  }
  const monto = Math.abs(Math.round(Number(accion.monto))) * (accion.descuento ? -1 : 1);
  if (!monto) return { ok: false, mensaje: "Poné el monto.", pinAjeno: false };
  let firma: Auth = auth;
  let pinAjeno = false;
  if (monto < 0) {
    if (!accion.pin.trim()) return { ok: false, mensaje: "Un descuento lo autoriza el dueño con su PIN: escribilo en «PIN del dueño».", pinAjeno: false };
    const q = quienFirma(estado, accion.pin, auth);
    firma = q.auth;
    pinAjeno = !q.esDuenio;
  }
  const res = cargoManual(estado, accion.cuentaId, { concepto: accion.concepto, monto }, firma, ahora);
  if (!res.ok) return { ok: false, mensaje: res.motivo, pinAjeno };
  return {
    ok: true,
    mensaje: monto < 0 ? `Descuento de ${pesos(-monto)} aplicado (lo autorizó ${res.item.por ?? "el dueño"}).` : `Cargo manual sumado: ${res.item.nombre} ${pesos(monto)}.`,
    pinAjeno: false,
  };
}

/** SÓLO DEMO: los PIN de ejemplo de los dueños, para poder probar un descuento (en la jornada real no se muestran). */
export function pinesDeEjemplo(estado: EstadoClub): { nombre: string; pin: string }[] {
  return estado.usuarios.filter((u) => u.rol === "duenio" && u.activo !== false && u.pin).map((u) => ({ nombre: u.nombre, pin: u.pin }));
}

// ───────────── tope de intentos del PIN ─────────────

export const INTENTOS_DE_PIN = 5;
export const ESPERA_DE_PIN_MS = 30_000;

export interface IntentosDePin {
  fallos: number;
  /** Hasta cuándo no se puede probar otro PIN (ms del reloj de este equipo); 0 = se puede. */
  hasta: number;
}

export const SIN_INTENTOS: IntentosDePin = { fallos: 0, hasta: 0 };

/** Anota un intento: uno bueno vuelve a cero; el quinto malo traba 30 s. Pura. */
export function anotarIntentoDePin(previo: IntentosDePin, bueno: boolean, ahoraMs: number): IntentosDePin {
  if (bueno) return SIN_INTENTOS;
  const fallos = previo.fallos + 1;
  return fallos >= INTENTOS_DE_PIN ? { fallos: 0, hasta: ahoraMs + ESPERA_DE_PIN_MS } : { fallos, hasta: previo.hasta };
}

/** Cuántos segundos faltan para poder probar otro PIN (0 = ya se puede). Pura. */
export function esperaDelPin(i: IntentosDePin, ahoraMs: number): number {
  return i.hasta > ahoraMs ? Math.ceil((i.hasta - ahoraMs) / 1000) : 0;
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
