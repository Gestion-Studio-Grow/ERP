"use client";

// LAS SOLAPAS DEL MOSTRADOR, DIFERIDAS EN EL NAVEGADOR (Magra · tanda perf, P-2).
//
// `MostradorTabs` trae el POS de siempre (`PosForm`, 656 líneas) y el alta de turno
// (`NewAppointmentForm`): sólo los dibujan la bandeja y Vender de un negocio de servicios (CH) o
// sin boutique. Con `next/dynamic` del lado del cliente su código no entra en el JS de la pantalla
// del boutique; donde se dibujan, se arman en el servidor igual que antes (mismo HTML).
import dynamic from "next/dynamic";

export const MostradorTabsDiferido = dynamic(() => import("../MostradorTabs"));
