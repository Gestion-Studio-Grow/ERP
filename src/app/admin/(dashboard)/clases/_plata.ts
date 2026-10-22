// ============================================================================
// UN SOLO FORMATO DE PESOS EN EL PANEL DEL PROFE (O-7 de la CERT T2+T3).
// ============================================================================
//
// Donde la cifra va sola, <Plata sinCentavos> del kit («$25.000», cifras tabulares). Donde va
// adentro de un texto (el detalle de una fila, un aviso, el resumen de «Agendar»), este texto, que
// es EXACTAMENTE el que lee <Plata> (`partirCifra`): así no conviven «$ 25.000» y «$25.000» en la
// misma pantalla. Los WhatsApp al alumno siguen con `pesos()` del motor: no se mezclan con esto.

import { partirCifra } from "@/components/ui/display-core";

/** «$25.000»: el texto de <Plata sinCentavos> para meter adentro de una frase. */
export const plataTexto = (n: number): string => partirCifra(Number(n) || 0, "plata", true).texto;
