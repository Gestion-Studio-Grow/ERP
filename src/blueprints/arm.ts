// Blueprint «ARM» — el negocio que es SÓLO el CRM comercial (GSG-CRM-017 y GSG-CRM-018 · V1, decisión del dueño del
// 16/11/2026). Busca, califica y asigna oportunidades a un negocio vinculado; no atiende, no cobra, no factura ni
// produce. Por eso no siembra nada: ni catálogo, ni productos, ni profesionales, ni caja.
//
// Lo que el negocio ve lo decide el panel cerrado del CRM (`panelCerrado` de «crm-comercial»,
// src/apps/catalogo/comercial.ts): el CRM y Usuarios, nada más. Este archivo sólo le da al vertical definición propia,
// para que el alta, la consola del operador y `getBlueprint` lo reconozcan en vez de caer al comodín.
// El id sale de `BLUEPRINT_ARM` (provisional a confirmar), la misma constante que usa el CRM.

import { BLUEPRINT_ARM } from "@/lib/crm-comercial/arm";
import type { Blueprint } from "./types";

export const armBlueprint: Blueprint = {
  id: BLUEPRINT_ARM,
  label: "CRM comercial (ARM)",
  description:
    "Negocio que es sólo el CRM comercial: consultas, prospectos y oportunidades que se asignan a un negocio vinculado. Sin caja, agenda, catálogo ni facturación.",
  // Lo que usa de verdad: la ficha de contactos y marcas del CRM.
  capabilities: ["clients:manage"],
  brandingDefaults: {
    shortLabel: "CRM comercial",
    contactNote: "Configurá acá los datos del negocio (nombre y contacto).",
  },
  // Idempotente por definición: no hay nada que sembrar.
  async seedCatalog() {
    return false;
  },
};
