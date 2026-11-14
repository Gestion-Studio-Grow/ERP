// ============================================================================
// EQUIPO DE AGENTES · proveedor de IA: interfaz y proveedor de GUION (03 §10).
// ============================================================================
// El motor recibe el proveedor POR PARÁMETRO. En producción hay dos rutas: la 1 (proveedor-claude,
// brief 1C, con clave propia e interruptor) y la 3 (sin modelo). El proveedor de guion es SÓLO para
// tests y la demo local de quien construye: devuelve respuestas fijas por caso, no sale a la red y
// FALLA si lo llaman con una transacción abierta (así el error se ve en CI, 03 §10).

import { getTenantStore } from "@/lib/tenant-context";
import type { DefHerramienta, Mensaje, ProveedorIA, RespuestaDelProveedor } from "./tipos";

export type { DefHerramienta, Llamada, Mensaje, ProveedorIA, RespuestaDelProveedor, UsoDeTokens } from "./tipos";

/** Un paso del guion: la respuesta fija, o una función que la arma mirando lo que recibió. */
export type PasoDeGuion =
  | RespuestaDelProveedor
  | ((p: { sistema: string; mensajes: Mensaje[]; herramientas: DefHerramienta[] }) => RespuestaDelProveedor | Promise<RespuestaDelProveedor>);

export interface ProveedorDeGuion extends ProveedorIA {
  /** Cuántas veces lo llamaron (los tests miran que no salga ninguna llamada de más). */
  readonly llamadas: number;
  /** Lo que recibió en cada llamada. */
  readonly recibido: { sistema: string; mensajes: Mensaje[]; herramientas: DefHerramienta[] }[];
}

export function proveedorDeGuion(pasos: readonly PasoDeGuion[]): ProveedorDeGuion {
  // Nunca en un despliegue: el motor publicado elige entre la ruta 1 y la ruta 3.
  if (process.env.VERCEL_ENV === "production") throw new Error("El proveedor de guion no existe en producción.");
  const recibido: { sistema: string; mensajes: Mensaje[]; herramientas: DefHerramienta[] }[] = [];
  let i = 0;
  return {
    id: "guion",
    get llamadas() {
      return i;
    },
    recibido,
    async turno(p) {
      if (getTenantStore()?.insideTx) throw new Error("Error de programación: el proveedor se llamó con una transacción abierta.");
      const paso = pasos[i++];
      recibido.push({ sistema: p.sistema, mensajes: structuredClone(p.mensajes), herramientas: p.herramientas });
      if (!paso) return { ok: false, motivo: "caida" };
      return typeof paso === "function" ? paso(p) : paso;
    },
  };
}
