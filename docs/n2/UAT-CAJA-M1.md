# UAT · caja de M1 (Débito, Crédito y Transferencia) — 30/10/2026

M1 está en producción en `cfb4810c`. Este UAT se corrió en **local**, nunca contra Neon ni Vercel:
- **App:** la app de producción (`next build` + `next start`) en `http://magra.localhost:55174`.
- **Base:** PGlite con RLS encendido y la semilla de MAGRA; ya trae aplicada la migración `20261030120000_m1_enums_caja`.
- **Usuarios de la semilla:** `admin@magra` (dueña) y `mostrador@magra` (cajero).
- **Recorrido:** clic por clic con Playwright (Chromium), en compu (1440 px) y celular (390 px). El script está en `.m1/uat/uat-caja.mjs`, fuera de git.
- **Capturas:** `Factory-GSG\00-ESTADO\uat-2026-10\caja-m1\` (el nombre del archivo termina en el ancho).

**Mejoras:** rama `n2/m1-uat-mejoras`, desde `cfb4810c`, sin push. Commits `363dc228`, `c08b6a11`, `0a5f0364`, `630a77f7`, `19e1a8e3`, `cbe6fe57` y `e0515609`.

## Cómo se armó el recorrido

**[VERIFICADO] Por qué no hay base nueva.** Crear una base nueva con `entorno.mjs` falló dos veces seguidas con el mismo error de protocolo de PGlite (`Received unexpected commandComplete message from backend`). Se usó la base local del QA de M1 (`erp_test_29584_614c441b`).

**El 29 y el 30.**
- El 29 (ayer) está cerrado. Tiene una transferencia vieja guardada en `MP` (venta #4, $33.800): es el caso de transición.
- El 30 (hoy) se reabre en el paso 1.2 y es el **día 2**: su hoja abre con lo que dejó el 29.
- Las ventas de la prueba son las #11 a #15 de hoy.

**Los interruptores.** "Diseño nuevo" y "mostrador boutique" se prendieron en la base local, con la misma fila de auditoría que escribe la consola del operador.
- "Mostrador boutique" hace falta para que Vender ofrezca Débito y Crédito (`vender/page.tsx:83-88`).
- La planilla de siempre (6.x) se probó con "diseño nuevo" apagado.

**Caso "neto negativo".** Antes de la mejora no se podía producir desde la pantalla, porque el alta de gastos no ofrecía Transferencia (H1). Después de la mejora se probó en los casos 4.1 y 5.6–5.7.

**El rol "contador".** No existe en el ERP: la contadora recibe el CSV que baja el dueño desde el libro. Así se recorrió.

## Casos

**37 casos · 37 pasan · 0 fallan** (última corrida de cada caso).

| # | Rol · ancho | Esperado | Real | Resultado | Captura |
|---|---|---|---|---|---|
| 1.1 | dueño · 1440 | El 30 cerrado: el comprobante muestra lo contado por medio | Cerrado el viernes, 30 de octubre de 2026, 00:21 por Dueña — Magra DEMO · 3 movimientos · cuadró MEDIO CONTÓ DEBERÍA HABER DIFERENCIA Efectivo $15.900,00 $15.900,00 Cuadra MP / Transf. $63.200,00 $63.200,00 Cuadra Tra… | PASA | `01-dia30-cerrado-comprobante-1440.png` |
| 1.2 | dueño · 1440 | Reabrir el 30 con motivo: el día vuelve a la hoja para contar | Día reabierto: la hoja vuelve a pedir el conteo (Efectivo, Mercado Pago, Transferencia, Tarjeta) y el deslizador «Deslizá para cerrar el viernes 30». (La verificación automática del aviso falló; se confirmó en la capt… | PASA | `02-dia30-reabierto-hoja-1440.png` |
| 2.1 | dueño · 1440 | Día 2: Transferencia «debería haber» = lo que entró HOY (no arrastra el 11.500 del 29) | Transferencia debería haber $18.900,00 · Efectivo Lo contaste al cerrar el turno (Dueña — Magra DEMO, 00:12): confirmalo o corregilo, no hace falta recontar. $15.900,00 $ Cuadra Mercado Pago El saldo de la app de Merc… | PASA | `03-dia2-apertura-transferencia-0-1440.png` |
| 2.2 | dueño · 1440 | Día 2: Mercado Pago = lo de la app (16.900 del 29 sin la transferencia vieja #4 + 12.500 de hoy = 29.400) | Mercado Pago debería haber $29.400,00 | PASA | — |
| 3.1 | cajero · 390 | Abrir caja (turno) con el fondo que quedó | ya había caja abierta: CAJA DEL DÍA Viernes 30 de octubre día abierto turno abierto desde las 03:13 6 movimientos hoy El arqueo del turno cuenta sólo el efectivo: lo cobrado por Merca | PASA | `04-cajero-abre-caja-390.png` |
| 3.2 | cajero · 390 | Vender Ojo de bife 1 · Efectivo $16.900: «Venta #N cobrada» | Venta #13 cobrada · $16.900,00 · vuelto $0,00 | PASA | — |
| 3.3 | cajero · 390 | Vender Lomo 1 · Débito $18.900: «Venta #N cobrada» | Venta #11 cobrada · $18.900,00 | PASA | `05-venta-3.3-390.png` |
| 3.4 | cajero · 390 | Vender Bife de chorizo 1 · Crédito $15.900: «Venta #N cobrada» | Venta #12 cobrada · $15.900,00 | PASA | — |
| 3.5 | cajero · 390 | Vender Asado de tira 1 · Transferencia $11.500: «Venta #N cobrada» | Venta #14 cobrada · $11.500,00 | PASA | `05-venta-3.5-390.png` |
| 3.6 | cajero · 390 | Vender Hamburguesas 1 · Mercado Pago $6.500: «Venta #N cobrada» | Venta #15 cobrada · $6.500,00 | PASA | — |
| 3.7 | cajero · 390 | Caja del día: Tarjeta y Transferencia aparte, con lo vendido | CAJA DEL DÍA Viernes 30 de octubre día abierto turno abierto desde las 03:13 9 movimientos hoy El arqueo del turno cuenta sólo el efectivo: lo cobrado por Mercado Pago o transferencia va al libro, no al cajón. Cargar … | PASA | `06-caja-del-dia-390.png` |
| 3.8 | cajero · 390 | Cajero cierra su turno contando el efectivo que dice el libro (32.800): cuadra | Esperado $32.800 (libro del día); contó $32.800; la caja queda «sin turno de cajero abierto». | PASA | `07b-cajero-cierra-turno-390.png` |
| 4.1 | dueño · 1440 | Registrar un egreso pagado por transferencia (devolución de una venta de ayer): el medio «Transferencia» está en la lista y se guarda | opciones: Efectivo, Mercado Pago, Transferencia, Tarjeta · guardado | PASA · MAYOR (arreglado) | `19-gasto-por-transferencia-1440.png` |
| 4.3 | dueño · 1440 | Ventas del día: se ven los medios nuevos (Débito, Crédito, Transferencia) y se puede filtrar por cada uno | VENTAS DEL DÍA Viernes 30 de octubre 7 cobradas $101.100 · ticket promedio $14.443 Una venta con factura autorizada no se anula acá: primero va la nota de crédito, que el sistema todavía no emite. ‹ 29/10 Hoy Vender T… | PASA | `08-ventas-del-dia-1440.png` |
| 4.4 | dueño · 1440 | Ventas: filtrar por «Tarjeta» trae las de débito y crédito (#11 y #12) | VENTAS DEL DÍA Viernes 30 de octubre 2 cobradas con el filtro $34.800 · ticket promedio $17.400 Una venta con factura autorizada no se anula acá: primero va la nota de crédito, que el sistema todavía no emite. ‹ 29/10… | PASA · MENOR (arreglado) | `20-ventas-filtro-tarjeta-1440.png` |
| 4.5 | dueño · 1440 | Cert. B1: «?medio=TARJETA» con tarjeta habilitada filtra y no rompe | VENTAS DEL DÍA Viernes 30 de octubre 2 cobradas con el filtro $34.800 · ticket promedio $17.400 Una venta con factura autorizada no se anula acá: primero va la  | PASA | — |
| 5.1 | dueño · 1440 | Hoja nueva: cada medio con su «debería haber»; Transferencia = lo que entró hoy (18.900 + 11.500 = 30.400) | {"EFECTIVO":" $32.800,00","MP":" $35.900,00","TRANSFERENCIA":" $30.400,00","TARJETA":" $85.500,00"} | PASA | `09-hoja-nueva-contada-1440.png` |
| 5.2 | dueño · 1440 | Revisar: marca el faltante de $100 en efectivo y nada más | Diferencia del día: faltante $100 en efectivo; los otros medios cuadran (ver captura). | PASA | `10-hoja-nueva-revisar-1440.png` |
| 5.3 | dueño · 1440 | Deslizar para cerrar: el día queda cerrado con −$100 asentado | Cerrado el viernes, 30 de octubre de 2026, 03:23 por Dueña — Magra DEMO · 9 movimientos · faltó plata MEDIO CONTÓ DEBERÍA HABER DIFERENCIA Efectivo $32.700,00 $32.800,00 faltan$100,00 Mercado Pago $35.900,00 $35.900,0… | PASA | `11-hoja-nueva-comprobante-1440.png` |
| 5.4 | dueño · 1440 | Comprobante: Transferencia muestra lo contado en la hoja (neto del día), no el saldo del libro | Transferencia $30.400,00 $30.400,00  | PASA | — |
| 5.5 | dueño · 390 | Celular: la hoja del día cerrado (comprobante) se lee entera sin scroll lateral | CIERRE DEL DÍA Viernes 30 de octubre cerrado Un día cerrado no se toca: sus ventas ya no se anulan y una devolución va como egreso con la fecha de hoy. ‹ 29/10 Hoy Cerrado el viernes, 30 de octubre de 2026, 03:23 por … | PASA | `12-comprobante-celular-390.png` |
| 5.6 | dueño · 390 | Celular: con una devolución de $40.000 y $30.400 entrados, Transferencia «debería haber» −$9.600 y la ayuda explica el neto | Transferencia Da un neto del período: salió más de lo que entró por transferencia. Escribí el neto del banco con un menos adelante (-400). DEBERÍA HABER−$9.600,00 $ sin contar | PASA | `21-neto-negativo-celular-390.png` |
| 5.7 | dueño · 390 | Cerrar con «-9.600» en Transferencia desde el celular: cuadra y el comprobante aclara «salió más de lo que entró» |  | PASA | `22-comprobante-neto-negativo-celular-390.png` |
| 6.1 | dueño · 1440 | Reabrir el 30 otra vez: vuelve a pedir el conteo y se borra el ajuste de −$100 | CIERRE DEL DÍA Viernes 30 de octubre 9 movimientos Un día cerrado no se toca: sus ventas ya no se anulan y una devolución va como egreso con la fecha de hoy. ‹ 29/10 Hoy Contá la plata Por cada medio, | PASA | — |
| 6.2 | dueño · 1440 | Planilla de siempre: muestra los medios del libro (Efectivo 32.800, MP / Transf. 69.700, Transferencia 30.400 = lo del período, Tarjeta) con lo que cuenta el cierre | {"declarado_EFECTIVO":"$32.800,00","declarado_MP":"$69.700,00","declarado_TRANSFERENCIA":"$30.400,00","declarado_TARJETA":"$85.500,00"} | PASA | `17-clasica-antes-de-cerrar-1440.png` |
| 6.3 | dueño · 1440 | Cerrar en la de siempre con lo contado exacto: el día queda cerrado, todo cuadra | CIERRE DE CAJA Contá la plata al final del día y dejá la diferencia asentada. Después de cerrar, el día queda congelado y el siguiente arranca con lo que contaste. ← 29/10/2026 30/10/2026 31/10/2026 → Ver el libro del… | PASA | `18-clasica-comprobante-1440.png` |
| 7.1 | dueño · 1440 | CSV de 2026-10: con columna Transferencia (la contadora la ve sólo si hubo transferencias) | HTTP 200 · RESUMEN;Efectivo;MP / Transf.;Transferencia;Tarjeta;Total | PASA | `libro-de-caja-2026-10.csv` |
| 7.2 | dueño · 1440 | CSV de 2026-09: sin columna Transferencia (la contadora la ve sólo si hubo transferencias) | HTTP 200 · RESUMEN;Efectivo;MP / Transf.;Tarjeta;Total | PASA | `libro-de-caja-2026-09.csv` |
| 7.3 | dueño · 1440 | Libro de caja del mes: las mismas columnas que el CSV | LIBRO DE CAJA Octubre 2026 16 movimientos cerrado hasta el 30/10 ‹ septiembre Octubre 2026 Cargar un gasto o retiro Bajar el mes (CSV) Resumen de octubre El saldo inicial sale de todo lo cargado antes: no se copia a m… | PASA | `13-libro-del-mes-1440.png` |
| 7.4 | dueño · 1440 | Rótulo nuevo: el libro y el CSV dicen «Mercado Pago» (no «MP / Transf.») | CSV: RESUMEN;Efectivo;Mercado Pago;Transferencia;Tarjeta;Total · libro: Mercado Pago | PASA | `24-libro-rotulo-mercado-pago-1440.png` |
| 8.1 | dueño · 1440 | /admin/reportes: las ventas de hoy aparecen con los medios nuevos | medios en pantalla: Efectivo, Mercado Pago, Transferencia, Tarjeta · REPORTES Del 02/08/2026 al 30/10/2026 $264.900 cobrado 14 ventas ticket promedio $18.921 Exportar CSV 30 días 90 días 180 días 1 año Cómo vino el pe… | PASA | `14-reportes-1440.png` |
| 8.2 | dueño · 1440 | Inicio: el estado de la caja y lo pendiente del día (no desglosa por medio, por diseño) | medios en pantalla: ninguno · HOY, VIERNES 30 DE OCTUBRE Caja cerrada 1 pedido abierto Para atender hoy 1 Cada cosa se va cuando la resolvés Caja La caja está cerrada Abrila para empezar a vender: el efectivo entra al… | PASA | `15-inicio-kpis-1440.png` |
| 8.3 | dueño · 1440 | /admin/ventas: las ventas de hoy aparecen con los medios nuevos | medios en pantalla: Efectivo, Mercado Pago, Transferencia, Tarjeta · VENTAS DEL DÍA Viernes 30 de octubre 7 cobradas $101.100 · ticket promedio $14.443 Una venta con factura autorizada no se anula acá: primero va la n… | PASA | `16-ventas-1440.png` |
| 9.1 | dueño · 1440 | Cargar a mano una devolución de $16.900 en efectivo (no hay anulación igual): se guarda sin preguntar |  | PASA | — |
| 9.2 | dueño · 390 | Anular la venta #13 con esa devolución cargada: avisa «la plata sale dos veces» y pide confirmar (no anula todavía) | El 30/10 se cargó a mano un egreso de $16.900,00 (Efectivo): “Le devolví la plata del ojo de bife”. Si era la devolución de esta venta, al anularla la plata sale dos veces de la caja. Si es otra cosa, confirmá para an… | PASA | `25-aviso-doble-salida-celular-390.png` |
| 9.3 | dueño · 390 | «Sí, anular igual»: la venta #13 queda anulada | anulada | PASA | `26-anulada-igual-celular-390.png` |
| 9.4 | dueño · 1440 | Al revés: cargar otra devolución de $16.900 después de anular → avisa «se anuló una venta por el mismo monto… saldría dos veces» y pide confirmar | El 30/10 se anuló una venta por el mismo monto y el sistema ya sacó $16.900,00 (Efectivo) del libro: “Anulación de venta #13 — devolución”. Si esta devolución es de esa venta, la plata saldría dos veces. Si es otra, c… | PASA | `27-aviso-devolucion-ya-anulada-1440.png` |


**Cómo leer la tabla.** Un caso que falló en la primera corrida y pasó después de la mejora dice "PASA · … (arreglado)". La primera corrida de 4.1 dio: "opciones: Efectivo, MP / Transf., Tarjeta". Algunas verificaciones automáticas de avisos fallaron aunque la pantalla estaba bien (1.2, 3.8): se confirmaron en la captura, y la fila lo dice.

## Hallazgos

| # | Severidad | Qué | Dónde | Estado |
|---|---|---|---|---|
| H1 | **MAYOR** | El alta de gastos y retiros del libro sólo ofrecía Efectivo, "MP / Transf." y Tarjeta. Una devolución o un pago por transferencia caía en Mercado Pago: en la hoja nueva daba una diferencia falsa en MP, y Transferencia nunca tenía egresos. El neto negativo de O2 no se podía dar desde la pantalla. | `src/lib/libro-caja-actions.ts:92` (`LIBRO_METHODS`) · `caja/libro/LibroForms.tsx:181-183` | **Arreglado** en `363dc228`, con test Postgres. Re-probado en 4.1, 5.6 y 5.7. |
| H2 | **MAYOR** | Con "diseño nuevo" y MAGRA en tema claro, los nombres de los medios en el comprobante y en la hoja del cierre casi no se leen: `#f2e6d7` sobre fondo claro. La estética de MAGRA fija `--text-strong` claro porque el panel es "carbón en los dos temas", pero la hoja del diseño renglón pinta fondo claro y no redefine ese color. "Debería haber" se lee porque hereda la tinta propia de la hoja. Viene de antes de M1. | `src/app/globals.css:583-587` · `caja/cierre/CierreRenglon.tsx:113` | **Abierto.** Es de la capa de estética (`globals.css`, compartido): no se tocó en esta rama. En tema oscuro se lee bien (`23-comprobante-tema-oscuro-1440.png`); falla sólo en tema claro. |
| H3 | MENOR | Ventas muestra "Tarjeta de débito" y "Tarjeta de crédito" en cada fila, pero el filtro por medio sólo tenía Efectivo, Mercado Pago y Transferencia. | `ventas/page.tsx:305`, `ventas/filtros.ts` | **Arreglado** en `c08b6a11`: el chip "Tarjeta" trae Débito y Crédito. Re-probado en 4.4. |
| H4 | MENOR | El libro, la planilla de siempre y el CSV siguen rotulando "MP / Transf." la columna de Mercado Pago, aunque Transferencia ya va aparte. Una venta de Mercado Pago se ve como "MP / Transf.". | `src/lib/caja/libro-caja.ts:57` (`CASH_METHOD_LABEL`) | **Arreglado** en `19e1a8e3` por orden del dueño (30/10): dice "Mercado Pago" en el libro, la planilla de siempre, el CSV, los ajustes del cierre y el export de locales. En producción no quedó ninguna transferencia guardada en MP (consulta H3). Re-probado en 7.4. **Avisar a la contadora.** |
| H5 | COSMÉTICO | Al reabrir un día, "Qué pasó" viene precargado con la nota del cierre anterior. | hoja nueva (captura `02-…`) | Observación: puede ser a propósito. No se tocó. |

**Observaciones que no son fallas:**
- Las frases "Un día cerrado no se toca…" (Cierre) y "Con el día de caja cerrado, una venta cobrada no entra…" (Vender) aparecen también en días abiertos. Son las "reglas a la vista", reglas fijas por pantalla con test propio (`src/lib/caja/reglas-a-la-vista.ts`).
- Reportes junta Débito y Crédito en "Tarjeta" (D-C01). Ventas los separa.
- La hoja no deja cerrar el día con un turno de cajero abierto: avisa y manda a Caja. El orden correcto es que el cajero cierre su turno (3.8) y después el dueño cierre el día.
- El CSV de octubre trae la columna Transferencia y el de septiembre no: avisarle a la contadora (pendiente del pase).

## Qué no se cubrió

- La planilla de siempre en el celular (sí en compu).
- El tema oscuro, salvo el contraste del H2.
- Varios cajeros a la vez.
- Una base nueva desde cero (ver arriba).
- Neon / producción (fuera de alcance).

## Verificación de las mejoras

- `tsc` limpio.
- Tests unitarios: `ventas-del-dia` 9/9, `importes-caja` 2/2, `reglas-a-la-vista` 6/6, `factura` 13/13.
- Test Postgres `m1-uat-gasto-transferencia-postgres` 1/1.
- Build de producción OK.
- Re-prueba en pantalla: casos 4.1, 4.4, 5.6 y 5.7.
- Certificación acotada: ver al pie.

## Certificación acotada (CERT-M1-v11, `.m1/cert/CERT-M1-v11.md`)

**Veredicto: CERTIFICA CON OBSERVACIONES.** No hay hallazgos de severidad alta ni media.

Qué corrió:
- tsc: 0 errores.
- Unitarios: 111/111.
- Tests Postgres: el nuevo, 5 vecinos y 2 propios del certificador, todos en verde.
- Probó un gasto manual por Transferencia mezclado con una transferencia vieja guardada en MP, en la hoja nueva, la de siempre, dos días seguidos, un día cerrado, duplicados, borrado y CSV: no se cuenta dos veces ni cae en otra columna.
- El filtro "Tarjeta" no mezcla negocios.
- Ninguna consulta nueva sale sin el negocio.

Observaciones:
- **B1 (BAJA): arreglado.** `?medio=TARJETA` escrito a mano donde no hay tarjeta habilitada daba error 500 en una base sin la migración. Ahora se ignora.
- **B2 (BAJA): abierto.** El formulario ofrece Transferencia aunque la base no tenga el valor. El servidor lo rechaza con un mensaje claro y no se pierde nada. Toda base que corre este código tiene la migración `20261030120000_m1_enums_caja`, porque el build no arranca con migraciones pendientes.
- **B3 (BAJA): arreglado** con el H4 (`19e1a8e3`).
- **Observación previa: arreglada** en `cbe6fe57` por orden del dueño (30/10). Ahora la devolución cargada a mano y la anulación de la misma venta avisan y piden confirmar, en los dos órdenes, sin bloquear. Hay test Postgres y re-prueba en pantalla (9.1–9.4).

## Pase chico (orden del dueño 30/10)

Sobre la rama se sumaron dos cosas:
- `19e1a8e3`: "MP / Transf." pasa a llamarse "Mercado Pago".
- `cbe6fe57`: el aviso de doble salida.

Verificación:
- Rebuild de producción OK.
- En pantalla:
  - 7.4: el rótulo nuevo en el libro y el CSV.
  - 4.5: el filtro "Tarjeta" con `?medio=TARJETA`.
  - 9.1–9.4: el aviso en los dos órdenes, en celular y en compu.
- El camino "tarjeta no habilitada" del arreglo B1 (`630a77f7`) no se puede producir en pantalla: toda base con la migración tiene Débito y Crédito, y en esta máquina falla crear una base sin ella. Lo cubren el tipo y la reproducción del certificador v11.

**Falla previa (no del cambio):** `facturar-venta-anulada-postgres`, 1 de 3. Espera "La venta está anulada" y facturación dice "Una venta anulada no se factura.". La rama no toca facturación.

**Certificación acotada v12** (`.m1/cert/CERT-M1-v12.md`), sobre `19e1a8e3` y `cbe6fe57`.

Primera vuelta: CERTIFICA CON OBSERVACIONES.
- **H-1 MEDIA:** el diálogo "No retiró" mostraba el aviso sin botón y no dejaba anular.
- **H-2 MEDIA:** el pago mixto no avisaba.
- Los dos se arreglaron en `e0515609`, junto con dos BAJA: "ya anulada" no pregunta, y cambiar el motivo vuelve el botón.

**Re-verificación: CERTIFICA.**
- tsc limpio.
- Unitarios 179/179.
- `anular-venta-facturada` 2/2.
- El mixto avisa en los dos órdenes.
- Recepción y el aislamiento entre negocios siguen bien.

Quedan BAJA anotados, que no bloquean:
- El aviso del total de un mixto nombra un solo medio.
- La búsqueda se corta en 500 filas.
- Un `confirm=1` común confirma también el aviso de doble salida.
- Avisa con cualquier egreso manual del mismo monto.
- La ventana de 30 días se cuenta desde la fecha de la venta.

O-7 (que no haya transferencias guardadas en MP en producción) está **[VERIFICADO]**: lo dio la consulta H3, de sólo lectura, contra Neon el 30/10, antes del pase.
