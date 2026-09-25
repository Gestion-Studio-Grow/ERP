# Botones claros en Vender y el cobro del pedido (diseño nuevo «Renglón») — traspaso 25/09

Sin commit, sin push, sin deploy. Todo lo visual va SOLO bajo `data-diseno="renglon"` o detrás de `useDiseno()`; con la piel apagada (CH) el HTML queda igual.

## Hecho
- **Principal**: deshabilitada = sin relleno, raya punteada, tinta 2 (se lee) y dice qué falta: sin líneas «Cargá un producto para cobrar / para el pedido», con una línea sin peso «Falta el peso de X» (`src/app/admin/(dashboard)/vender/VenderForm.tsx:780`). El pedido cobrado dice el monto: «Registrar y cobrar $X» (`src/app/admin/(dashboard)/vender/VenderForm.tsx:791`). Hoja: `public/diseno/renglon.css:424`.
- **Elección**: Venta/Pedido en dos teclas del mismo ancho, la elegida llena con el acento y con tilde (`public/diseno/renglon.css:2092`). Medios de pago en grilla del mismo ancho (con «A cuenta», 2 × 2 en el celular), ícono arriba y palabra abajo, la elegida con el acento y el tilde en lugar del ícono (`public/diseno/renglon.css:2320`). El segmentado a lo ancho (cobro del pedido en el cajón) igual (`public/diseno/renglon.css:636`), con íconos en `src/app/admin/(dashboard)/pedidos/CobroDelPedido.tsx:101`.
- **Íconos**: `qr` (Mercado Pago en el mostrador) e `iconoDelMedio()` en `src/components/ui/Icono.tsx:132` (dos usos: Vender y el cobro del pedido).
- **Secundaria**: «+ Precio a mano · + Descuento · + Cliente» livianas, color de enlace, sin caja (`public/diseno/renglon.css:2272`).
- **Renglón del producto**: arriba nombre y «× Quitar» (nombre accesible «Quitar línea de <producto>», palabra visible desde 21 rem de ticket); abajo «PESO/CANTIDAD [campo] kg» y «SUBTOTAL $X» (`src/app/admin/(dashboard)/vender/VenderForm.tsx:1647`, hoja `public/diseno/renglon.css:2152`).
- **Casilla** «Ya está cobrado/Cobrado» con el acento, 22 px (`public/diseno/renglon.css:2372`).
- **Pie fijo**: con el ticket vacío ya no se fija (no tapa la fila de opcionales) (`src/app/admin/(dashboard)/vender/VenderForm.tsx:1756`); con líneas, el campo que recibe el foco se trae a la vista por encima del pie (`scroll-margin` + `scrollIntoView`, `src/app/admin/(dashboard)/vender/VenderForm.tsx:343`).
- Hoja regenerada: `node --import tsx src/design/hoja.ts` → versión `"3099f82f14"`.
- Test ajustado: `src/app/admin/(dashboard)/vender/vender-pantalla.test.ts:1947` (el nombre del «Quitar» también dice «Vacío»: la tecla se busca por el comienzo).

## Medido (capturas en .qa/botones/antes y .qa/botones/despues, 390 y 1440, claro y oscuro; medidas.json)
- 390 px: Venta/Pedido 163 × 44 cada una (antes 72 × 44 en bandeja gris); medios 107 × 56 los tres (antes 108 × 44, la elegida sólo con borde); Quitar 88 × 44 con palabra; Cobrar 332 × 48 «Cobrar $40.958,00»; 0 errores de consola.
- 1440 px: Venta/Pedido 208 × 36; medios 137 × 56; Cobrar 422 × 48.

## Verificaciones corridas
- `npx tsc --noEmit`: exit 0 (tsc.txt). ESLint de VenderForm.tsx, CobroDelPedido.tsx, Icono.tsx: exit 0 (eslint.txt).
- `src/design/hoja.test.ts`: 5/5 (hoja-test.txt). `formularios-del-pedido.test.ts` + `src/apps/paridad-menu.test.ts`: 10/10 (tests-vecinos-1.txt).
- `vender-pantalla.test.ts`: 55/56 la primera vez (localizador ambiguo, arriba), 56/56 después (vender-pantalla-2.txt). Incluye el de 412 px con la piel: ningún control del ticket menor a 44 × 44.
- `next build`: exit 0 (build.txt).

## Falta
- **Gate visual AA** (`npm run gate:visual:aa`) y el recorrido «CH apagado»: NO corridos (los corre el coordinador).
- **PosForm bajo el diseño nuevo** (sólo aparece en el cajón «Cobrar en el mostrador» de un negocio SIN «Trabaja por apps»; MAGRA usa Vender): sin tocar. Patrones pendientes: modo `src/app/admin/(dashboard)/pedidos/PosForm.tsx:326-339`, «×» sin nombre :440, «+ Agregar producto» :456, casilla :522, medios :532-560. Hacerlo con `useDiseno()` para no cambiar el HTML de CH.
- **CobrarPedidoForm.tsx**: sólo se usa en la vista de siempre (`src/app/admin/(dashboard)/pedidos/page.tsx:436`), no bajo el diseño nuevo: sin tocar a propósito (cambiarlo cambia CH).
- Captura del cobro del pedido en el cajón (CobroDelPedido) a 390/1440: no sacada.
