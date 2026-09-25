// ============================================================================
// DISEÑO NUEVO — la decisión del servidor, pura (sin base ni pedido).
// ============================================================================
//
// `disenoNuevo()` (diseno.server.ts) le pasa la lectura real de los interruptores del negocio
// (src/cambios/interruptores.server.ts); los tests, lecturas que fallan, filas forjadas y estados
// armados a mano. Lo que decide:
//   · prendido SÓLO si la última fila VÁLIDA de `diseno-nuevo` (de la consola, por el canal del
//     operador) dice "encender": la regla es la de `estadoDesdeFilas`, no se repite acá;
//   · cualquier error de la lectura (o un estado sin el interruptor) = APAGADO: el diseño de
//     siempre, que es lo seguro para CH y para cualquier negocio.

import { disenoNuevoPrendido, type EstadoInterruptores } from "@/cambios/interruptores-core";

export async function leerDisenoNuevoCon(
  leer: () => Promise<EstadoInterruptores>,
  avisar?: (error: unknown) => void,
): Promise<boolean> {
  try {
    return disenoNuevoPrendido(await leer()) === true;
  } catch (error) {
    avisar?.(error);
    return false;
  }
}
