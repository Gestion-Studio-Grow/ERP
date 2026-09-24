// ¿Este negocio ve el Inicio por apps? Sí si tiene prendido el interruptor "Trabaja por apps"
// (src/cambios/interruptores.ts), que se prende y se apaga por negocio desde la consola de GSG, sin
// deploy. Lo leen la página del Inicio, el layout (para el buscador con Ctrl/⌘K) y las pantallas que
// cambian con el modelo por apps; todas comparten UNA lectura por request con el gate por módulo
// (src/apps/contexto.server.ts), porque las dos pasan por `interruptoresDelNegocio`.
//
// Reemplaza a la variable de deploy APPS_INICIO, que se retiró: quedaba una segunda palanca que
// podía prender a CH sin su OK. Si la lectura falla, queda apagado: el Inicio de siempre, que nunca
// deja a nadie sin Inicio.

import "server-only";
import { enInicioPorAppsDelNegocio } from "@/cambios/interruptores.server";

export const enInicioPorApps = enInicioPorAppsDelNegocio;
