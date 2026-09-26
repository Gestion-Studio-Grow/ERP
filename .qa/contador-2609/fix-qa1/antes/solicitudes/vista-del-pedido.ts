// Qué muestra la hoja de un pedido de alta (Soporte GSG). PURO: lo usa la pantalla del configurador.
//
// La regla que importa: si en ESTA pantalla acaba de salir bien el alta, se muestra «Pasale esto»
// aunque el servidor ya diga que el pedido está cerrado. Al crear el cliente la consola vuelve a
// armar la página (el pedido pasa a cerrado); si esa vuelta reemplazara la pantalla, la contraseña
// temporal del dueño —que se ve una sola vez— se perdería (hallazgo QA 26/09, paso 2).
import type { ResultadoConfigurador } from "./configurador.server";

export type VistaDelPedido = "pasale-esto" | "cerrado" | "formulario";

export function vistaDelPedido(cerrada: boolean, resultado: ResultadoConfigurador | null): VistaDelPedido {
  if (resultado?.ok) return "pasale-esto";
  return cerrada ? "cerrado" : "formulario";
}
