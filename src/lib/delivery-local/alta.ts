// ============================================================================
// DELIVERY LOCAL · LO QUE SUMA AL ALTA DEL PEDIDO — ubicación y forma de pago. PURA.
// ============================================================================
//
// `placeOnlineOrder` la llama sólo si el negocio tiene el delivery local (config.ts). Lee los campos
// nuevos del formulario y devuelve:
//   · `renglones`: van a la NOTA del pedido, delante de lo que escribió el cliente. Así la bandeja,
//     la hoja del cadete y el WhatsApp al repartidor los muestran sin tocar nada más.
//   · `auditoria`: el dato estructurado para la fila de auditoría del alta (AuditLog, con RLS).
// Sin migración: ni columna ni tabla nuevas. Un campo mal formado de PAGO frena el alta con un
// mensaje claro; una ubicación rara NO frena (la dirección escrita manda): se descarta y se avisa.

import type { ConfigDeliveryLocal } from "./config";
import { leerPago, renglonDePago, type MedioPreferido } from "./pago";
import { chequearRadio, leerUbicacion, renglonDeUbicacion, type Ubicacion } from "./ubicacion";

export type CamposDelForm = { get(nombre: string): unknown };

export type ExtrasDelAlta =
  | {
      ok: true;
      renglones: string[];
      auditoria: {
        ubicacion: (Ubicacion & { km: number | null; fueraDelRadio: boolean }) | null;
        pago: { medio: MedioPreferido; pagaCon: number | null } | null;
      };
    }
  | { ok: false; error: string };

export function extrasDelAlta(cfg: ConfigDeliveryLocal, form: CamposDelForm, envio: boolean): ExtrasDelAlta {
  // La aceptación de los términos se controla también acá: el navegador se puede saltear.
  if (form.get("aceptaTerminos") !== "on") return { ok: false, error: "Para mandar el pedido, aceptá los términos y la política de privacidad." };
  const pago = leerPago(form.get("medioPreferido"), form.get("pagaCon"), cfg.medios);
  if (!pago.ok) return { ok: false, error: pago.error };

  const renglones: string[] = [];
  let ubicacion: Extract<ExtrasDelAlta, { ok: true }>["auditoria"]["ubicacion"] = null;
  if (envio) {
    const u = leerUbicacion(form.get("ubicacionLat"), form.get("ubicacionLng"), form.get("ubicacionPrecision"));
    if (u.estado === "ok") {
      const d = chequearRadio(cfg.ubicacionDelLocal, u.ubicacion, cfg.radioKm);
      renglones.push(renglonDeUbicacion(u.ubicacion, d));
      ubicacion = {
        ...u.ubicacion,
        km: d.estado === "sin-dato" ? null : d.km,
        fueraDelRadio: d.estado === "fuera",
      };
    }
  }
  if (pago.medio) renglones.push(renglonDePago(pago.medio, pago.pagaCon));
  return {
    ok: true,
    renglones,
    auditoria: { ubicacion, pago: pago.medio ? { medio: pago.medio, pagaCon: pago.pagaCon } : null },
  };
}
