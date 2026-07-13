// ============================================================================
// MOTOR WPE — envoltorio tipado (NO reescribe el motor: lo re-expone).
// ============================================================================
//
// `torneo-engine.js` es una COPIA VERBATIM (byte-a-byte, SHA verificado) del motor
// probado del repo `circuito-wpe`: JS puro ES2018, UMD, sin dependencias, 76 tests
// determinísticos (./tests). Regla dura: **no se toca**. Este archivo solo lo importa
// con su tipado (`torneo-engine.d.ts`) y lo re-exporta como superficie del plugin, para
// que el resto del ERP (persistencia, consola, API) lo consuma con tipos sin conocer el
// detalle del UMD.
//
// El motor es PURO respecto de la DB/red: toda función recibe y devuelve objetos planos.
// La persistencia (snapshot JSONB por tenant + RLS) vive en `../persistence`, encima del
// motor, nunca dentro de él (ADR-097: el motor es núcleo-librería; el ERP es la plataforma).

import motor from "./torneo-engine.js";

export default motor;

// Re-export de tipos para consumidores del ERP (se borran en runtime).
export type {
  MotorWPE,
  Torneo,
  Config,
  Pareja,
  Jugador,
  Sede,
  Dia,
  Partido,
  Resultado,
  EntradaPartido,
  Zona,
  FilaTabla,
  Llave,
  RondaLlave,
  Stats,
  EstadoTorneo,
  ResultadoMutacion,
  ResultadoValidacion,
} from "./torneo-engine.js";
