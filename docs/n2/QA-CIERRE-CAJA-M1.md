# QA · cierre de caja con M1 (D-C01 + Transferencia) — recorrido de punta a punta

Rama `n2/m1-caja-medios-dc01`, 29/10/2026. App de producción (`next build` + `next start`) en
`http://magra.localhost`, base local efímera (PGlite) con la semilla de MAGRA, RLS encendido.
Nada contra Neon ni Vercel. Usuario de la semilla (dueño). Capturas en `qa-cierre-m1/`.

## Tramo 1 · base de HOY (sin `N2_enums.sql`), diseño de siempre

| Paso | Qué se hizo | Qué se vio | Captura |
|---|---|---|---|
| 1 | Vender · Ojo de bife · Efectivo · Cobrar | Venta #3 cobrada $16.900 | `01-venta-efectivo.jpg` |
| 2 | Vender · Transferencia $33.800 · Cobrar | Venta #4 cobrada | `02-venta-transferencia.jpg` |
| 3 | Vender · Mercado Pago $16.900 | Venta #5 cobrada | — |
| 4 | Caja · egreso manual «Bolsas y papel» efectivo $1.000 | Efectivo 15.900 · MP/Transf. 50.700 · **Transferencia $0** (columna vacía, antes del arreglo) | `03-caja-antes-del-arreglo.jpg` |
| 5 | Cierre del día (clásico) | **F1**: ofrece la columna Transferencia con esperado 0 y MP/Transf. 50.700 | `04-cierre-clasico-con-transferencia-F1.jpg` |
| 6 | Contado: efectivo 15.500, MP 50.700 · «Cerrar el día» | Confirmación: faltan $400 en efectivo; MP cuadra | `05-cierre-clasico-confirmar.jpg` |
| 7 | Confirmar | Día 29 cerrado; diferencia asentada | `06-cierre-clasico-cerrado.jpg` |
| 8 | Libro de caja | Ajuste −$400 en efectivo; saldo $66.200 | `07-libro-con-ajuste.jpg` |
| 9 | Interruptor «diseño nuevo» encendido · hoja del día | Día cerrado, −$400 | `08-hoja-nueva-dia-cerrado.jpg` |
| 10 | Reabrir el 29 con motivo | La hoja nueva separa MP $16.900 y Transferencia $33.800 por el medio de origen | `09-hoja-nueva-separa-mp-transferencia.jpg` |

F1 se arregló en `39071384`: la clásica cuenta los medios del libro (sin Transferencia hasta el
paso 2.e) y las pantallas esconden Transferencia en 0. Se verifica en el tramo 2.

## Tramo 2 · con `N2_enums.sql` aplicada (base local), app recompilada con el arreglo

Misma base, después de aplicar el paquete (`CashMethod` = EFECTIVO, MP, TARJETA, TRANSFERENCIA) y
de reabrir el 29. Interruptor «mostrador-boutique» encendido en la base local para llegar al
Cuaderno: Vender de MAGRA (no boutique) no ofrece tarjeta por diseño (`vender/page.tsx:87`).

| Paso | Qué se hizo | Qué se vio | Captura |
|---|---|---|---|
| 11 | Vender › Cuaderno | Teclas Débito y Crédito; el protocolo dice «anotá DÉBITO o CRÉDITO y elegí Débito o Crédito» | `10-cuaderno-con-debito-credito.jpg` |
| 12 | 3 ventas: Lomo 1 kg Débito, Bife 2 kg Crédito, Asado 1 kg Transferencia · Cargar | Ventas #6 $18.900, #7 $31.800, #8 $11.500 | `11-cuaderno-tres-ventas.jpg` |
| 13 | Base: pedidos y libro | #6 `DEBITO`→`TARJETA` · #7 `CREDITO`→`TARJETA` · #8 `TRANSFERENCIA`→`TRANSFERENCIA` · la #4 (de antes) sigue en `MP` | — |
| 14 | Caja (diseño nuevo) | MP/Transf. 50.700 · Transferencia 11.500 · Tarjeta 50.700 · total 129.800 | `12-caja-con-paquete.jpg` |
| 15 | Cierre, hoja nueva | Separa por origen: MP 16.900 · Transferencia 45.300 (33.800 vieja + 11.500) · Tarjeta 50.700; contado exacto → «Cuadra», $0 | `13-hoja-nueva-contada-cuadra.jpg` |
| 16 | Deslizar para cerrar | «Día 29/10/2026 cerrado. No hubo diferencias.» | `14-hoja-nueva-cerrada.jpg` |
| 17 | Reabrir el 29 · apagar «diseño nuevo» · cierre de siempre | Muestra los 4 medios DEL LIBRO (Transferencia 11.500, MP/Transf. 50.700): lo mismo que cuenta `cerrarDia` | `15-clasica-con-paquete-confirmar.jpg` |
| 18 | Contado exacto · «Sí, cerrar el día» | Cerrado, los 4 cuadran; en la base no hay ningún ajuste (sólo el egreso manual) | `16-clasica-con-paquete-cerrada.jpg` |

### Lo que quedó a la vista
- **Texto del Cuaderno** decía «Lo cobrado con el posnet, con Tarjeta» con las teclas Débito/Crédito
  a la vista. Corregido en esta rama (`CargarCuaderno.tsx:227`).
- **«MP / Transf.» con el paquete** sigue juntando las transferencias de antes del paso 2.e, y la
  hoja nueva las muestra en Transferencia: los dos diseños cierran bien el MISMO día, pero cuentan
  distinto. Es la transición de **F2**, que decide el dueño (ver la nota de traspaso).
- No se recorrió el **día siguiente** (la fecha del negocio es el 29): el arrastre de saldos entre
  días con transferencias es F2 y está probado en `.m1/sonda/dos-dias.test.ts`, no en pantalla.
- No se bajaron los CSV desde la pantalla (descarga de archivos): el formato está cubierto por
  `libro-csv.test.ts` y `multilocal-core.test.ts`.
- F1 sin paquete (la clásica sin Transferencia) no se puede ver en esta base, que ya tiene el
  paquete (es irreversible): lo prueba `m1-transferencia-libro-postgres.test.ts` contra Postgres.
