// La letra de las vidrieras de «Pedí Local» cuya marca la pide (marca.ts → `letra`). Hoy, Manrope
// para Bitácora Café (la de su menú en Fudo; OFL). La baja Next en el build y la sirve desde nuestro
// dominio: nada de Google en el navegador del cliente y ningún binario en Git. `preload: false`:
// este módulo viaja con /tienda de TODOS los negocios y sólo la usa el que la pide; el @font-face
// sin uso no descarga nada, y el respaldo con métricas ajustadas deja el CLS en 0 mientras llega.

import { Manrope } from "next/font/google";

export const manrope = Manrope({ subsets: ["latin"], display: "swap", preload: false, variable: "--pl-manrope" });
