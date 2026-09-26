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

/**
 * Qué botón ofrece el configurador (PURO). La misma regla que el servidor:
 *   · el CUIT ya existe y ese negocio YA está en la cartera de este estudio → no hay nada que sumar;
 *   · el CUIT ya existe → «Sumar a la cartera», con la autorización del dueño;
 *   · hay parecidos SIN CUIT → hasta que Soporte no decida («Es otro» o «Es este»), no hay botón activo;
 *     «Es este» → «Cargarle el CUIT y sumarlo», con la misma autorización;
 *   · si no → «Crear el cliente».
 */
export type AccionDelPedido =
  | { tipo: "ya-en-cartera" }
  | { tipo: "sumar"; habilitado: boolean }
  | { tipo: "cargar-cuit"; tenantId: string; habilitado: boolean }
  | { tipo: "crear"; habilitado: boolean };

export function accionDelPedido(x: {
  yaExisten: readonly { enCartera: boolean }[];
  parecidos: readonly { id: string }[];
  /** "" (sin decidir), "otro" o "es:<id>". */
  duplicado: string;
  autorizaVinculo: boolean;
}): AccionDelPedido {
  if (x.yaExisten.length > 0) {
    if (x.yaExisten.every((t) => t.enCartera)) return { tipo: "ya-en-cartera" };
    return { tipo: "sumar", habilitado: x.autorizaVinculo };
  }
  if (x.duplicado.startsWith("es:")) {
    const id = x.duplicado.slice(3);
    if (x.parecidos.some((p) => p.id === id)) return { tipo: "cargar-cuit", tenantId: id, habilitado: x.autorizaVinculo };
  }
  if (x.parecidos.length > 0 && x.duplicado !== "otro") return { tipo: "crear", habilitado: false };
  return { tipo: "crear", habilitado: true };
}
