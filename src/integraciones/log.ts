// El logger de la suite de integraciones: el del Core (src/lib/logger.ts) envuelto por la
// redacción (redaccion.ts). Todo archivo de src/integraciones loguea por acá; ninguno usa
// `console` ni importa el logger del Core directo (lo verifica redaccion.test.ts).
//
// Sólo servidor: el logger del Core arrastra el contexto de request (AsyncLocalStorage).

import { logger } from "@/lib/logger";
import { getRequestContext } from "@/lib/request-context";
import { crearLoggerSeguro, type ClavesARedactar, type LoggerBase } from "./redaccion";

// El contexto del request también pasa por la redacción (setRequestContext acepta cualquier clave).
export const logIntegraciones = crearLoggerSeguro(logger, getRequestContext);

/**
 * El logger de UN conector: además de la lista general, tapa las claves propias de su
 * payload (`conector.redaccion`: el `from` de WhatsApp, por ejemplo). Las credenciales no
 * dependen de esto: validarConector exige que se tapen también con `logIntegraciones`.
 */
export function logDelConector(redaccion: ClavesARedactar | undefined): LoggerBase {
  return crearLoggerSeguro(logger, getRequestContext, redaccion);
}
