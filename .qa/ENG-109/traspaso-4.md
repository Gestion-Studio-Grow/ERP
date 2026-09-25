# ENG-109 · traspaso 4 (2026-09-25, porción 6: correcciones de la revisión, vuelta 2)

## Hecho (rojo antes, verde después)
1. **El cupón ya no cambia la venta ni la tienda de CH.** `venta-reglas.ts`: `UNIDAD_DEL_DESCUENTO_DE_CUPON`
   = { turno: "peso", venta: "centavo" } (DEC-013); `montoDeCupon(tipo, valor, base, camino = "venta")`.
   Medido contra HEAD (`v3-cupon-head-vs-ahora.txt`, script `v3-medir-cupon.ts`): venta 0 de 700.000 con
   precios enteros, 364.530 de 198 M con centavos (medio centavo, +$0,01); turnos 13.704 de 30 M (+$1).
   Pesar y ajustar vuelve a la cuenta de antes (salvo el medio centavo).
2. **Un cupón que no descuenta nada no se gasta.** `aplicarCupon` rechaza con `sinDescuento` (descuento
   redondeado 0 o valor 0). La reserva usa `cupones/cupon-de-reserva.ts` (`cuponDeLaReserva`, fuera del
   "use server"), `checkCoupon` usa `aplicarCupon` camino "turno" y la vista previa de la tienda muestra
   el motivo. Test EJECUTADO contra Postgres con RLS y la Server Action real
   (`cupon-de-reserva-postgres.test.ts`): vista previa = reserva, 5 % de $9 no gasta el uso, cupón en 0
   no gasta, A no usa ni gasta el cupón de B. Rojo: `v3-cupon-antes.txt` (7 fallas). Verde: `v3-suite.txt`.
   Mutaciones 6 de 6 detectadas (`v3-mutaciones-cupon.txt`).
3. `plugins/arca/domain/comprobante.ts` `totalIva` suma al centavo (`v3-totaliva-antes/despues.txt`).
4. Docs: CODEMAP fila Plata (decidir-comprobante NO usa la regla; la garantía es DEC-012), DEC-013,
   BACKLOG ENG-109 (cambio visible medido), ENG-315 (percepciones/exento), ENG-316 (letra vs condición).

## Evidencia
tsc exit 0 (`v3-tsc.txt`, `v3-tsc-2.txt`); eslint exit 0 (`v3-eslint.txt`, `v3-eslint-2.txt`);
npm test (`v3-npmtest.txt`): 3766, 3760 pasan, 6 fallan = rojos previos (pies pegados ×2, xlsx ×4).

## Falta para cerrar ENG-109
- Decisión del dueño: UNA unidad para el cupón (hasta entonces turnos y venta difieren a propósito).
- Redondeos a mano: 53 líneas en 41 archivos (pantallas del rediseño, plugins con DEC-011, núcleo fiscal).
- En el alta de la tienda (`order-core.ts` aplicarCuponEnTx → `rechazoPublicoDelCupon`) un cupón sin
  descuento se muestra como "no existe" y suma al freno; sólo alcanzable con bolsas de menos de ~$0,50.
- `decidir-comprobante.ts:43-46,453-456`: comentario desactualizado (núcleo ajeno, ver necesita_fuera).
- HEALTH.md al cerrar el slice.
