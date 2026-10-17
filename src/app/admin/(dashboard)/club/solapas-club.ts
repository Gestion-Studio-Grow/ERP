// ============================================================================
// SOLAPAS QUE SUMA LA SESIÓN DEL CLUB — el punto de enganche para colgar pantallas nuevas.
// ============================================================================
//
// La recepción (ClubDemo.tsx) arma sus solapas de fábrica (Agenda, Fijos y espera, Mantenimiento y
// lluvia, Buffet, Caja) y después agrega las de esta lista, en este orden. Para sumar una pantalla
// (Clientes, Tablero del dueño, Proveedores, Stock, Novedades, Configuración…) alcanza con un archivo
// nuevo en esta carpeta y una entrada acá: ClubDemo no se toca.
//
// Cada solapa baja en su propio chunk (`cargar` es un `import()` dinámico) y se precarga cuando el
// navegador queda libre, igual que las de fábrica. Recibe el almacén (el estado vivo del club: se lee
// con `almacen.estado()` y se cambia SÓLO con `almacen.aplicar`, así «Deshacer», el guardado y los
// avisos funcionan solos), el día elegido en la agenda, el rol del panel y `onVerTurno` para abrir la
// cuenta de un turno en la Agenda.
//
// `soloDuenos`: la solapa no se muestra a quien no es OWNER (p. ej. Configuración o el Tablero).
// Ojo: esconder no es seguridad; lo sensible lo sigue validando el motor (PIN / autorización).

import type { ComponentType } from "react";
import type { Fecha } from "@/lib/club/motor.mjs";
import type { Almacen, RolDelPanel } from "./almacen";

export interface PropsDeSolapa {
  almacen: Almacen;
  dia: Fecha;
  rol: RolDelPanel;
  onVerTurno: (reservaId: string) => void;
}

export interface SolapaDelClub {
  /** Único, en minúsculas y sin espacios (va en ids del DOM): «clientes», «tablero»… */
  id: string;
  etiqueta: string;
  cargar: () => Promise<{ default: ComponentType<PropsDeSolapa> }>;
  soloDuenos?: boolean;
}

export const SOLAPAS_DEL_CLUB: readonly SolapaDelClub[] = [
  { id: "clientes", etiqueta: "Clientes", cargar: () => import("./ClientesDelClub") },
  { id: "tablero", etiqueta: "Tablero", cargar: () => import("./TableroDelDuenio"), soloDuenos: true },
];
