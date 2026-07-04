// Registro de conectores disponibles. Fase 1 (ADR-019): solo el stub de
// homologación. Cuando se cablee AfipSDK con credenciales, se registra acá y el
// Core lo toma por capacidad+namespace sin cambiar nada más (ADR-020 D2).
import { registrarConnector } from "../connector";
import { HomologacionConnector } from "./homologacion";

let inicializado = false;

export function ensureConnectors(): void {
  if (inicializado) return;
  registrarConnector(new HomologacionConnector());
  inicializado = true;
}
