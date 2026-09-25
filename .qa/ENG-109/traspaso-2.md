# ENG-109 · traspaso 2 (2026-09-25, porción 4)

Lo de `traspaso-1.md` punto 3 (lectura de formularios, `dinero/leer.ts`) ya lo había hecho la porción 3
(`leer-test.txt` 11/11). Esta porción hizo los puntos 2 y 1 (parcial).

## Hecho

- `src/lib/dinero/redondeo.ts`: `redondearAlPeso` (R1 y R7, un solo redondeo) y `porcentajeDe(base, %, "peso" | "centavo")`
  (R4): cuenta entera centavos × centésimos de punto, sin binario; el % vale con 2 decimales; si el producto no entra
  entero (bases > $9.000 M al 100 %) cae a binario con R7.
- Cupón en un solo cálculo: `venta-reglas.ts` `montoDeCupon` usa `porcentajeDe` con `UNIDAD_DEL_DESCUENTO_DE_CUPON = "peso"`
  (*provisional a confirmar*, D1-PLAN §7), tope en la base. `actions.ts` (bookAppointment) y `coupon-actions.ts`
  (checkCoupon) llaman a `montoDeCupon`; salió el `Math.round(... coupon.value / 100)` de ambos.
  Cambios de comportamiento: la venta y la tienda pasan del centavo al peso en cupones de %; en turnos (CH) sólo
  cambia lo que antes era un error: % > 100 ya no descuenta más que el precio y un valor negativo ya no sube el precio.
- Redondeos a mano 77 → 46 líneas (`grep-redondeos-src-4.txt`, patrón de D1-PLAN P0 c3): 16 archivos limpios de
  `src/lib` y `src/apps/kpis` delegan en el módulo; 8 líneas de porcentajes y cantidades marcadas `// no-es-plata:`.
- `src/lib/dinero/redondeos-locales.test.ts`: falla si aparece un redondeo a mano fuera de los 36 archivos
  pendientes (cada uno con su motivo en el test).

## Tests (en esta carpeta)

- `cupon-antes-de-implementar.txt`: 20 de 24 en rojo antes de implementar. `cupon-test.txt`: 25/25 después.
- `mutaciones-cupon.txt`: 5 mutaciones; todas detectadas (la del doble redondeo, tras agregar el caso de $100.000.000.004,95).
- `redondeos-locales-antes.txt` / `-despues.txt`: 499/499 en los 41 archivos de test vecinos, antes y después.
- `cupon-vecinos-test.txt`: 339/339 (vender, pedidos, tienda, órdenes, cupones, paridad-menu).
- `dinero-cupon-kpis-test.txt`: 105/105. `tsc-5.txt`: exit 0. `eslint-5.txt`: 0 avisos en los 29 archivos tocados.
- `npmtest-5.txt`: 3739 tests, 3733 pasan, 6 fallan: los rojos previos (pies pegados ×2 con el padre, xlsx ×4).

## Falta para cerrar ENG-109

1. **Plugins** (`plugins/bancos/domain/valores.ts:19`, `plugins/mercadopago/{http.ts:219,cobros/http.ts:92,stub.ts:44}`):
   extender DEC-011 (hoy sólo ARCA importa `@/lib/dinero/redondeo`) a bancos y mercadopago, con su test de frontera.
   OJO `valores.ts:145`: el hash usa `monto.toFixed(2)`; no cambiar el formato (duplica movimientos al reimportar).
2. **Pantallas y archivos sin commit de otras sesiones**: los 32 restantes de `PENDIENTES` en
   `src/lib/dinero/redondeos-locales.test.ts`. Esperan su corte (D1-PLAN §6.0). Al limpiar cada uno, sacarlo de la lista.
   `panel.generated.ts` se corrige en su generador. `stock/supplier-return.ts:102` va con P4 (M-D1-5).
3. Formulario de compras ($1,51 / $1,50) y vidrieras sin redondeo por renglón: después del corte (traspaso-1 punto 4).
4. **Decisión del dueño** (D1-PLAN §7): unidad del descuento de cupón de % (peso, provisional; o centavo: cambiar
   `UNIDAD_DEL_DESCUENTO_DE_CUPON` y el test que la fija).
5. A verificar: una venta sin conexión encolada con el código anterior (descuento al centavo) que llegue después
   del deploy — no encontré en `src/lib` una comparación del total mandado contra el recalculado; confirmar en
   `order-core.ts` antes del deploy.
6. HEALTH.md al cerrar el slice: sumar los tests de traspaso-1 y de este.

## Comandos

- `node --import tsx --test src/lib/dinero/*.test.ts src/lib/cupones/*.test.ts src/lib/round.test.ts`
- `npx tsc --noEmit -p .` · `npx eslint --max-warnings=0 <archivos>` · `npm test > npmtest.txt 2>&1`
