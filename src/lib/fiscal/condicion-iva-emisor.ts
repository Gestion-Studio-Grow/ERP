/**
 * Condición frente al IVA del EMISOR (`Tenant.arcaCondicionIva`), cargada desde la ficha del operador.
 * Hasta ahora sólo se escribía en el alta por el configurador (solicitudes/configurador.server.ts:602):
 * un negocio ya creado no tenía cómo cargarla y sin ella no sale ninguna factura
 * (`construirPerfilFiscal`) ni pasa a real (`precondicionesDelPase`). PURO.
 */
export const CONDICIONES_DEL_EMISOR = {
  RESPONSABLE_INSCRIPTO: "Responsable inscripto",
  MONOTRIBUTO: "Monotributo",
  EXENTO: "Exento",
} as const;

export type CondicionDelEmisor = keyof typeof CONDICIONES_DEL_EMISOR;

export type CondicionInterpretada =
  | { accion: "set"; condicion: CondicionDelEmisor }
  | { accion: "clear" }
  | { accion: "error"; motivo: string };

export function interpretarCondicionIva(raw: unknown, enReal: boolean): CondicionInterpretada {
  if (enReal) {
    return {
      accion: "error",
      motivo:
        "El negocio ya factura en real: cambiar la condición cambia la letra de las facturas. Volvelo a pruebas primero (Pase a facturación real).",
    };
  }
  const v = typeof raw === "string" ? raw.trim() : "";
  if (v === "") return { accion: "clear" };
  if (Object.hasOwn(CONDICIONES_DEL_EMISOR, v)) return { accion: "set", condicion: v as CondicionDelEmisor };
  return { accion: "error", motivo: "Elegí Responsable inscripto, Monotributo o Exento." };
}
