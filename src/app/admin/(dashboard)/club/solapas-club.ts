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
  /** Lleva a otra solapa (p. ej. «proveedores», «stock»); si esa solapa no está para este rol, no hace nada. */
  irASolapa: (id: string) => void;
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
  // Sólo dueños, como el vanilla: recepción carga los remitos desde la Caja («Registrar un remito»).
  { id: "proveedores", etiqueta: "Proveedores", cargar: () => import("./ProveedoresDelClub"), soloDuenos: true },
  // «stock» es el id al que lleva la bandeja «Para resolver ahora» (bandeja-core.ts): no se cambia.
  { id: "stock", etiqueta: "Stock", cargar: () => import("./StockDelClub"), soloDuenos: true },
  // «configuracion» es el id al que lleva la cinta cuando lo guardado se llena (archivar días cerrados): no se cambia.
  { id: "configuracion", etiqueta: "Configuración", cargar: () => import("./ConfiguracionDelClub"), soloDuenos: true },
];

// ============================================================================
// PIEZAS GLOBALES — lo que va UNA vez en la recepción, por encima de las solapas.
// ============================================================================
//
// Para lo que no es una solapa sino parte del shell: el bloqueo con PIN y el cambio de operador, un aviso fijo, un
// atajo de teclado global… ClubDemo las monta una sola vez, arriba de la cinta y de las solapas, cada una en su
// propio chunk (`cargar` es un `import()` dinámico), y las pide apenas baja la recepción (no espera a que el
// navegador quede libre: un bloqueo tiene que estar antes que el primer toque). Cada una va en su propio Suspense,
// sin esqueleto: mientras baja no ocupa lugar.
//
// Reciben el almacén, el rol e `irASolapa` (para llevar a una solapa, como tocarla). Lo que hacen pasa por el almacén: `cambiarOperador` / `operador` /
// `suscribirOperador` para el PIN (no despiertan a las pantallas), `estadoDelGuardado` / `suscribirGuardado` para
// la jornada, y `ejecutar` / `aplicar` para tocar el estado.

export interface PropsDePieza {
  almacen: Almacen;
  rol: RolDelPanel;
  /**
   * Lleva a una solapa (p. ej. «tablero» desde el aviso del dueño). Es lo mismo que tocarla: «Deshacer» se olvida.
   * Un id que no está (no existe, o es `soloDuenos` y quien mira no es OWNER) no hace nada.
   */
  irASolapa: (id: string) => void;
}

export interface PiezaGlobalDelClub {
  /** Único, en minúsculas y sin espacios: «bloqueo», «atajos»… */
  id: string;
  cargar: () => Promise<{ default: ComponentType<PropsDePieza> }>;
}

export const PIEZAS_GLOBALES_DEL_CLUB: readonly PiezaGlobalDelClub[] = [
  // El aviso 🔔 del dueño: pedidos de crédito esperando su OK, con el botón que lleva al Tablero.
  { id: "aviso-del-duenio", cargar: () => import("./aviso-del-duenio").then((m) => ({ default: m.AvisoDelDuenio })) },
];
