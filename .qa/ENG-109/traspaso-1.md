# ENG-109 · traspaso 1 (2026-09-25)

## Hecho en esta parte

- `src/lib/dinero/redondeo.ts` (nuevo, sin importaciones): `centavosDe`, `redondearAlCentavo`,
  `sumarAlCentavo`, `admiteCentavos`, `textoAlCentavo`. Regla: medio centavo hacia arriba y lejos
  del cero (R1), un `number` vale sus 15 cifras (`toPrecision(15)`, R7), suma de renglones
  redondeando cada uno (R3). `textoAlCentavo` tira `RangeError` con NaN, infinito o |x| ≥ 10^13.
  Lo que no es número pasa sin cambios por las otras tres (como `Math.round`).
- `src/lib/round.ts`: `round2` ahora es `redondearAlCentavo` (re-export). Sus 224 llamadas redondean
  bien sin tocarlas. ADR-057 §2 derogado, como dice ADR-100.
- `src/lib/fiscal.ts:17-19`: `redondear` sale del módulo.
- `src/plugins/arca/afip/soap.ts`: `fmt` = `textoAlCentavo`; ImpIVA = `sumarAlCentavo` de los
  `AlicIva.Importe` (antes, suma en double y después `toFixed`).
- `src/plugins/arca/domain/validacion.ts`: rechaza total, neto, base o importe que no sean importes
  (así un NaN termina en `ComprobanteInvalidoError`, rechazo definitivo, y no en un error de armado
  que la cola reintenta). Las sumas se comparan como viajan (`sumarAlCentavo`). Los mensajes usan
  la regla. La tolerancia de 0,01 queda como estaba (la saca PF).
- `src/lib/libros/csv-ar.ts:85` `pesosCsv`: usa `textoAlCentavo`. Con NaN tira en vez de escribir "NaN".
- `src/lib/fiscal/decidir-comprobante.ts:457`: `aCentavos = centavosDe`, y los comentarios de las
  líneas 43-46 y 453-456. Su test (`decidir-comprobante.test.ts`, bloque "el importe se decide con 2
  decimales") calcula "viaja" con el módulo y afirma explícitamente que 9.999.999,995 y 599.999,995
  ahora suben. Los diffs exactos están en `decidir-comprobante.diff` y `decidir-comprobante.test.diff`.
- DEC-011 en `docs/agent/DECISIONS.md`: el plugin ARCA importa del Core sólo `@/lib/dinero/redondeo`,
  y un test lo vigila.

## Tests (todo en esta carpeta)

- `redondeo-test.txt`: 22/22 (redondeo + round). El barrido de 10^8 x,xx5 de [0; 1e6) tarda 13,5 s y
  da 0 hacia abajo. Con la regla anterior, en [0; 1e5): 587.189 hacia abajo (la misma cifra de la auditoría).
- `soap-test.txt` 30/30 · `validacion-test.txt` 27/27 · `libros-test.txt` 32/32 · `decidir-test.txt` 65/65 ·
  `decision-y-envio-test.txt` 2/2.
- `mutaciones.txt`: 11 mutaciones (la regla, las 15 cifras, el −0, `fmt` con `toFixed`, la suma de IVA en
  double, `aCentavos` viejo, `round2` viejo, la guarda de NaN, `pesosCsv` viejo, el borde 10^13): las 11 las
  detecta un test.
- `npmtest.txt`: 3661 tests, 3655 pasan y 6 fallan. Los 6 son rojos previos de la lista: pies pegados ×2
  más el test padre, y xlsx ×4. 0 salteados. Caja en el navegador pasó en esta corrida.
- `tsc.txt`: exit 0. `eslint-sin-soap.txt`: 0 avisos. En `soap.ts:77` queda 1 aviso (`_traXml`), que ya
  estaba en HEAD (`eslint-soap-en-HEAD.txt`). Quitar el parámetro rompe `soap.test.ts:498`, así que lo dejé.
- `grep-camino-fiscal.txt`: 0 redondeos a mano en el camino fiscal. Lo vigila el test "en el camino de la
  plata fiscal…" de `redondeo.test.ts`.
- `grep-redondeos-src.txt`: con el patrón de D1-PLAN P0 c3 quedan 78 líneas en 58 archivos de todo `src`,
  y 19 de esos archivos tienen cambios sin commit de otras sesiones.

## Falta para cerrar ENG-109 (criterios del BACKLOG)

1. **Redondeos locales = 0 en todo `src`** (criterio 2): las 78 líneas de `grep-redondeos-src.txt`. Primero
   los archivos limpios. Los 19 con cambios de otra sesión esperan su corte (D1-PLAN §6.0). Incluye la copia
   `plugins/bancos/domain/valores.ts:19` (`redondear2`). Para pasarla al módulo hay que extender DEC-011 al
   plugin bancos. OJO con `valores.ts:145`: el hash del movimiento usa `monto.toFixed(2)`. Ahí no se toca el
   formato, porque cambiar el hash duplica movimientos al reimportar.
2. **Cupón** (criterio 3): un solo cálculo para `src/lib/actions.ts:342` y `src/lib/coupon-actions.ts:144`
   (peso entero, con `Math.round`) y `src/lib/venta-reglas.ts:455` (centavo). La unidad la decide el dueño
   (D1-PLAN §7). Mientras tanto va peso entero, *provisional a confirmar*. Cambia lo que ven las clientas de
   CH en turnos. Los tres archivos están limpios en git.
3. **Lecturas de formularios** ("12.500" se lee 12,5): `src/lib/actions.ts:738` y `:1058`,
   `src/lib/cobros-actions.ts:63`, `src/lib/catalog-actions.ts:164` y `:199`. Todas limpias en git. Hace falta
   `leerImporte` (D1-PLAN §3.1, `dinero/leer.ts`) y que `pos-peso.ts:227-229` y `:323` deleguen en él.
4. Formulario de compras ($1,51 en pantalla, $1,50 grabado) y vidrieras que suman sin redondear por renglón.
   Son pantallas del rediseño: van después del corte.
5. HEALTH.md: no lo actualicé porque el slice no cerró. Al cerrarlo hay que sumar los tests de este traspaso.

## Comandos

- `node --import tsx --test src/lib/dinero/*.test.ts src/lib/round.test.ts`
- `node --import tsx --test src/plugins/arca/afip/soap.test.ts src/plugins/arca/domain/validacion.test.ts src/lib/libros/*.test.ts src/lib/fiscal/decidir-comprobante.test.ts`
- `npx tsc --noEmit -p .` · `npx eslint --max-warnings=0 <archivos>` · `npm test > npmtest.txt 2>&1`
