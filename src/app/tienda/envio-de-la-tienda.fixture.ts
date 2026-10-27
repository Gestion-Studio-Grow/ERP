// Envíos de ejemplo para los tests de la tienda (reingeniería Magra 1H): los valores del diseño
// (magra-DISENO.md §2.3), provisionales a confirmar con Mariano. Sólo datos: sin Prisma.

import type { ConfigEnvios, ZonaDeEnvio } from "@/lib/envios/modelo";

export const BARRIOS: ZonaDeEnvio = { id: "barrios", nombre: "Canning – barrios cerrados", costo: 4000, gratisDesde: 60000, franjas: ["L-S 11-13", "L-S 17-19"] };
export const EZEIZA: ZonaDeEnvio = { id: "ezeiza", nombre: "Ezeiza / Monte Grande", costo: 6000, gratisDesde: null, franjas: ["Ma, Vi 17-19"] };
export const CONFIG_MAGRA: ConfigEnvios = {
  retiroEnLocal: true,
  horarioRetiro: "Lun a sáb 9–19",
  pedidoMinimoEnvio: 20000,
  zonas: [BARRIOS, EZEIZA],
  franjasRetiro: [],
  tiendaPausada: null,
};
