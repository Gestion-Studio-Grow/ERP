// ¿Quien carga o borra un asiento MANUAL del libro de caja puede tocar la caja? Lógica pura.
//
// El asiento manual se engancha a la sesión de caja abierta y mueve el efectivo esperado del arqueo:
// es manejar la caja, no vender. Por eso exige `cash:manage` EFECTIVO (rol + matriz de permisos,
// casilla 8), además del `orders:manage` de siempre. Vender sigue sin exigirla (certificación M2).

import { permisoEfectivo, type UsuarioConPermisos } from "@/lib/capabilities";

export const SIN_CAJA = "No tenés habilitado manejar la caja: los ingresos y egresos a mano los carga quien la maneja.";

/** El motivo del rechazo, o `null` si puede. */
export function motivoSinCaja(user: UsuarioConPermisos): string | null {
  return permisoEfectivo(user, "cash:manage") ? null : SIN_CAJA;
}
