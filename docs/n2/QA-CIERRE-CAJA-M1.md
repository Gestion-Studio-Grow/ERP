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

### Lo que quedó a la vista (tramo 2)
- **Texto del Cuaderno** decía «Lo cobrado con el posnet, con Tarjeta» con las teclas Débito/Crédito
  a la vista. Corregido en esta rama (`CargarCuaderno.tsx:227`).
- **«MP / Transf.» con el paquete** sigue juntando las transferencias de antes del paso 2.e, y la
  hoja nueva las muestra en Transferencia: los dos diseños cierran bien el MISMO día, pero cuentan
  distinto. Es la transición de **F2**, que decide el dueño (ver la nota de traspaso).
- El **día siguiente** se recorrió en el tramo 3 (F2).
- No se bajaron los CSV desde la pantalla (descarga de archivos): el formato está cubierto por
  `libro-csv.test.ts` y `multilocal-core.test.ts`.
- F1 sin paquete (la clásica sin Transferencia) no se puede ver en esta base, que ya tiene el
  paquete (es irreversible): lo prueba `m1-transferencia-libro-postgres.test.ts` contra Postgres.

## Tramo 3 · F2 — el día siguiente (30/10), Transferencia = lo que entró en el período

Decisión del dueño (29/10): en el cierre, la Transferencia es lo que ENTRÓ en el período, no un
saldo; no arrastra y no hay corte único. Commits `f74f41dc` (F2), `50f008cf` (cert v8 H1/H2) y
`9fa93a23` (cert v9 O1). Misma base local (con el paquete), app recompilada, el 30/10 pasada la
medianoche: un día 2 real, sin tocar fechas. Interruptor «diseño nuevo» encendido otra vez.

Antes del día: libro MP 50.700 (16.900 de Mercado Pago + 33.800 de transferencias de antes del
paquete) · TRANSFERENCIA 11.500 · Efectivo 15.900 · Tarjeta 50.700.

| Paso | Qué se hizo | Qué se vio | Captura |
|---|---|---|---|
| 19 | Caja › abrir turno con fondo 15.900 · Vender › Lomo 1 kg › **Transferencia** | Venta #9 $18.900; en la base `TRANSFERENCIA`→`TRANSFERENCIA` | `17-d30-venta-transferencia.jpg` |
| 20 | Vender › Vacío 1 kg › **Mercado Pago** | Venta #10 $12.500 → `MP` | — |
| 21 | Caja | MP/Transf. y Transferencia sin «al abrir»: entró 12.500 y 18.900 | `18-d30-caja.jpg` |
| 22 | Cerrar el turno contando 15.900 | Cuadra | — |
| 23 | Cierre del día (hoja nueva) | **Mercado Pago abre en 16.900** (lo de la app: sin los 33.800 de transferencias viejas) y debería haber 29.400. **Transferencia sin saldo al abrir**: entró 18.900, debería haber 18.900. Ayuda: «Lo que entró por transferencia al banco desde el último cierre (no el saldo)» | `19-d30-hoja-nueva-f2.jpg` |
| 24 | Contado: MP 29.400 (la app) · Transferencia 18.900 (el banco hoy) | Las tres columnas «Cuadra», diferencia $0 | `20-d30-contado-cuadra.jpg` |
| 25 | Deslizar para cerrar | «Día 30/10/2026 cerrado. No hubo diferencias.» En la base: 0 ajustes | `21-d30-comprobante-antes-del-arreglo.jpg` |

**Hallazgo del recorrido (arreglado en `9fa93a23`):** el comprobante del día cerrado decía «Contó
$63.200» en «MP / Transf.» y «$30.400» en Transferencia: los saldos del libro (`porMedio`), no lo
que se tipeó. Lo mismo encontró el certificador v9 (O1). Ahora `cerrarDia` guarda siempre la hoja
(`porColumna` + `hoja`) y el comprobante se lee de ahí.


Con `9fa93a23` (app recompilada), el mismo 30/10:

| Paso | Qué se hizo | Qué se vio | Captura |
|---|---|---|---|
| 26 | Cierre del 30 (hoja nueva, ya cerrado) | El comprobante dice lo contado: Mercado Pago 29.400 sobre 29.400 · Transferencia 18.900 sobre 18.900 | `22-d30-comprobante-hoja-nueva-O1.jpg` |
| 27 | Reabrir el 30 con motivo · apagar «diseño nuevo» · cierre de siempre | **H1 (cert v8) arreglado:** Transferencia abre en $0 y debería haber $18.900 (no los 30.400 del libro); «MP / Transf.» sigue siendo el saldo junto, 63.200; el Total suma lo que se muestra | `23-d30-clasica-transferencia-del-periodo.jpg` |
| 28 | Contado exacto (15.900 · 63.200 · 18.900) · «Cerrar el día» | Confirmación: los tres «Cuadra» | `24-d30-clasica-confirmar.jpg` |
| 29 | «Sí, cerrar el día» | Comprobante: «Transferencia: contó $ 18.900 sobre $ 18.900 · cuadra». En la base: 0 ajustes; la fila guarda `hoja: "siempre"` y `porColumna` | `25-d30-clasica-cerrada.jpg` |

### Lo que quedó a la vista (tramo 3)
- **O2 (cert v9), sin resolver — decisión:** un día en que se paga por transferencia más de lo que
  entra, Transferencia «debería haber» da negativo y no se puede tipear un negativo; con 0 se
  asentaría un sobrante que no existe. No se recorrió en pantalla (está en `cert9-unit`).
- **H3 (cert v8), `[A VALIDAR]` en Neon (sólo lectura):** si un negocio cerró en la de siempre
  declarando en «MP / Transf.» sólo el saldo de la app, al pasar a la hoja nueva el primer día
  puede dar una diferencia falsa en Mercado Pago. Acá no pasa (MAGRA local declaró el saldo junto).
- Tarjeta sigue como saldo (se liquida a días): no es parte de F2.
