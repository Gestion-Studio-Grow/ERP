# ENG-109 · traspaso 3 (2026-09-25, porción 5: correcciones de la revisión, vuelta 1)

## Hecho (cada punto con su test rojo antes y verde después)

1. **Núcleo sin tocar.** `src/lib/fiscal/decidir-comprobante.ts` y su test volvieron a como los dejó su frente
   (`patch -R` de `decidir-comprobante.diff` / `.test.diff`; lo revertido está en `v2-nucleo-revertido.diff`).
   La coherencia decisión = envío ya no depende del núcleo: `plugins/arca/domain/validacion.ts` rechaza importes
   con más de 2 decimales y exige neto y total exactos en centavos (DEC-012). Rojo: `v2-nucleo-revertido-test.txt`
   (2 fallas con el núcleo original) y `v2-validacion-antes.txt` (3 fallas). Verde: `v2-decision-y-envio-test.txt`.
   Barrido: 40 M de cobros armados por `calcularImpuestos` (RI y monotributo, $0,01 a $200.000): 0 rechazados
   (`v2-core-contra-validacion.txt`). El parche del núcleo queda como propuesta (necesita_fuera).
2. **Tolerancia de validación:** neto y total exactos; IVA de renglón contra base × alícuota con 1 centavo, medido
   en centavos enteros. Mutaciones: 4 de 4 detectadas; la de la tolerancia del IVA sobrevivía hasta sumar el caso 100 @ 21 % = 21,02 (`v2-mutaciones-validacion.txt`).
3. **Cupón de 100 % o más = compra entera** (`venta-reglas.ts` montoDeCupon); tope en la compra también debajo del
   100 % (99 % de $0,60 = $0,60). Mutaciones: 3 de 3 detectadas; la del tope sobrevivía hasta sumar ese caso (`v2-mutaciones-cupon.txt`).
4. **CH declarado:** test que fija 29 % de $750 = $218 (antes $217). Medido: 13.704 de 30 M combinaciones enteras
   cambian, siempre $1 (`v2-cupon-turnos-viejo-vs-nuevo.txt`). Escrito en BACKLOG (ENG-109).
5. **Guardia de redondeos** ampliada: `toFixed(2)` suelto, `Math.round(100 * x)`, `Math.round(…) / 100`,
   `Number.EPSILON`. Límite escrito en el test. Limpiados `caja/libro-csv.ts` (4,185 salía 4,18) y
   `catalogo/planilla-core.ts`. 53 líneas en 41 archivos (`v2-grep-redondeos-src.txt`), cada uno con motivo.
6. `soap.ts:77` sin la advertencia `_traXml` (el test usa el signer por su contrato `TraSigner`).
7. ADR-057 marcado «Reemplazado por ADR-100».
8. Test de cupones: barre todo `src` (>500 archivos, mutación detectada en `v2-cupon-mutacion-barrido.txt`); los
   tres que leen código dicen «(lectura del código)».
9. `invoice-core.ts`: el IVA guardado es `sumarAlCentavo` de los renglones (lo mismo que viaja como ImpIVA).
10. `porcentajeDe`: JSDoc dice que no sirve para alícuotas de IIBB ni coeficientes del CM.
11. BACKLOG: ENG-311 (CbtesAsoc en NC), ENG-312 (IVA 10,5 % carne, magra), ENG-313 (export que no cae por una
    fila), ENG-314 (display-core del rediseño).

## Evidencia
- Suite ENG-109: 331/331 (`v2-suite-eng109.txt`). tsc exit 0 (`v2-tsc.txt`). eslint exit 0 (`v2-eslint.txt`,
  `v2-eslint-2.txt`, `v2-eslint-soap.txt`).
- `npm test` (`v2-npmtest.txt`, antes de sumar los 2 últimos tests, que están en la suite): 3761, 3755 pasan,
  6 fallan = rojos previos (pies pegados ×2, xlsx ×4).

## Falta para cerrar ENG-109
- Lo de `traspaso-2.md` §Falta 1-6 sigue igual (plugins bancos/mercadopago con DEC-011, pantallas del corte,
  compras y vidrieras, decisión del dueño sobre la unidad del cupón, venta sin conexión, HEALTH.md).
- Ejecutar `bookAppointment` y `checkCoupon` en vivo necesita un arnés con sesión y headers: no existe.
