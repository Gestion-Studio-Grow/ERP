// Adónde lleva el botón de una app en el Inicio. Casi siempre, a su pantalla (`app.ruta`). La
// excepción es la app cuyo número cuenta un recorte de su pantalla: el tile abre la pantalla con
// ESE recorte puesto, para que el número y la lista coincidan (regla 8: el where es el de la
// pantalla). Hoy, la Auditoría: "24 acciones hoy" abre la Auditoría filtrada a hoy.
//
// Puro. Lo usa Tile.tsx (server) y lo prueba href-del-tile.test.ts.

import type { AppDescriptor } from "@/apps/contract";
import { filtrosDeHoy, hrefAuditoria } from "../auditoria/filtros";

export function hrefDelTile(app: Pick<AppDescriptor, "id" | "ruta">, hoy: string, conNumero: boolean): string {
  if (conNumero && app.id === "auditoria") return hrefAuditoria(filtrosDeHoy(hoy));
  return app.ruta;
}
