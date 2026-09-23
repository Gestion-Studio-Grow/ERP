// ============================================================================
// CATÁLOGO DE APPS — Mis locales (marca con varios locales).
// ============================================================================
//
// Vacío en la ola 1: el módulo `multilocal` y sus apps (Mis locales, Ventas por local,
// Cajas de los locales, Stock por local) llegan en la ola 2. El archivo existe desde ya
// para que ese frente sume sus apps acá sin tocar el registro, que se congela en esta ola.
//
// Toda app de este archivo lee datos de OTRO negocio: lleva `moduloDuro: true` (exige el
// módulo aun con el gate apagado) y su página y sus actions llaman a `exigirCasa()`.
// Esconderla no alcanza; un test del registro lo exige.

import type { AppDescriptor } from "../contract";

export const APPS_LOCALES = [] as const satisfies readonly AppDescriptor[];
