/**
 * Interpretación del CUIT que carga el OPERADOR en la ficha del tenant
 * (`/operador/tenants/[id]` → `setTenantArcaCuit`). PURO y testeable: separa la
 * decisión (limpiar / guardar / rechazar con motivo en criollo) de la server
 * action, que solo persiste y audita.
 *
 * Reusa la validación de dígito verificador del dominio (`cuitValido`, módulo 11,
 * mismo criterio que bancos/contador/facturita) — NO se revalida la forma a mano.
 */

import { cuitValido, normalizarCuit } from "@/plugins/bancos/domain/cuit";

export type CuitInput =
  | { accion: "limpiar" }
  | { accion: "set"; cuit: string }
  | { accion: "error"; motivo: string };

/**
 * Decide qué hacer con lo que pegó el operador:
 *  - vacío            → limpiar el CUIT del tenant (dato opcional, se puede corregir);
 *  - 11 dígitos + DV  → guardar el CUIT normalizado (solo números);
 *  - cualquier otra   → error con motivo claro (sin stack trace, criollo).
 * Tolera puntos/guiones/espacios (`normalizarCuit`).
 */
export function interpretarCuitInput(raw: string): CuitInput {
  const t = raw.trim();
  if (t === "") return { accion: "limpiar" };

  const cuit = normalizarCuit(t);
  if (cuit.length !== 11) {
    return {
      accion: "error",
      motivo:
        `El CUIT/CUIL tiene que tener 11 números y viniste con ${cuit.length}. ` +
        `Cargalo sin punto ni guión, tal cual figura en ARCA (ej: 20304050607).`,
    };
  }
  if (!cuitValido(cuit)) {
    return {
      accion: "error",
      motivo:
        `Ese CUIT/CUIL (${t}) no pasa el dígito verificador — está mal tipeado o es inventado. ` +
        `Revisá los números; es fácil que se cuele uno cambiado.`,
    };
  }
  return { accion: "set", cuit };
}
