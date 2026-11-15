# 08 · Correcciones al dictamen 07 y segunda pasada

> El autor corrigió el texto y los briefs; `07-dictamen.md` queda como lo escribió la certificación.

| Hallazgo | Corrección | Dónde |
|---|---|---|
| **B1** la clave cambia entre exportes / cobro perdido | Base = `cuenta|fecha|importe` (sin leyenda, contraparte ni referencia) + ordinal; recuento por (cuenta, día, importe): `k = 0` nuevas, `m ≤ k` nada, `m > k` el excedente a «Para revisar» (`posible_repetido`), nunca solo. Tests C17, C18. | `02-diseno.md` §3, §2.3.3; `04` I2, I3; brief 1 |
| **B2** H1 no arreglado en la base | Filas nuevas con `hash = clave` sobre el único existente; `reglas.ts:147`/`:160` deduplican por clave; test en Postgres. | `02` §3, §7; brief 1 |
| **B3** MP automático por otro camino, tope 159 | En Factoque, una sola vía automática (`emitir-lote`); MP entra como movimiento; tope de `planFactoqueEnTx`. Sumado como **H7** (latente: hoy nadie llama a `guardarConfigFacturacionMP`). Test C20. | `01` H7; `03` §5.1; `04` I4; briefs 2a y 2b |
| **A1** revocación sin bloqueo | `SELECT … FOR SHARE` de la autorización viva en el paso 2. | `03` §5; `04` I8; brief 4 |
| **A2** WhatsApp como `RUTINA` | Todo archivo subido es `PEDIDO` con `solicitadoPor`; `RUTINA` sólo MP. Test C21. | `03` §2; brief 4 |
| **A3** `posible_duplicado` choca con I3 | Sólo contra facturas fuera del libro de cobros, cada una una vez; obligatorio para emitir solo. Test C22. | `02` §4 paso 5, §5; brief 2a |
| **A4** CSV de MP de menos / liquidación sin MP | Del CSV sólo el id, importe bruto; liquidación «no es venta» sólo con MP del período cargado (`falta_mp`). Test C19. | `02` §1.3, §2.1; `04` I4 |
| **M1** vencimiento y última fecha | Vencimiento = máx(cobro, factura); última factura creada y no rechazada (con pendientes). | `02` §4.1; brief 2a |
| **M2** achicar sin dónde guardarse | Tabla de frenos, vale el menor; despausar = ampliar. Test C23. | `03` §3.2; brief 4 |
| **M3** saldos al revés / sin saldo | Sentido detectado, por día; sin saldo, nivel 1. | `02` §2.3.2; `04` I12; brief 1 |
| **M4** `AgentePropuesta.clave` | `'factoque:' + clave del movimiento`. | `03` §5 paso 6; brief 4 |
| **M5** `referencia` → `mp:` | `mp:` sólo en cuentas de MP; sumado como **H8**. | `01` H8; `02` §3; brief 2b |
| **L1** citas | `:762` → `:766`; README creado; `requireTenantFacturita` (`facturita-actions.ts:59`) se exporta en la tanda 3. | `01`; `06` brief 3 |
| Tests que faltaban | C17-C24 agregados. C24: un rechazo de ARCA devuelve el lugar de los contadores. | `04` §3 |

Briefs después de corregir: 1.135 a 1.825 bytes (todos ≤ 2 KB).

## Segunda pasada

### Dictamen de la segunda pasada (certificador adversarial, 15/11/2026)

**Veredicto: NO CUMPLE.** La clave nueva cierra B1 en los casos pedidos, pero abre una doble factura sola (N1) y deja cobros perdidos sin aviso (N2-N4). Una simulación literal de §3 y §5 (scratchpad, `recuento-spec.mjs`) falla en los 4 casos. Briefs: 1135 a 1825 bytes (≤ 2048).

| id | resuelto | nota |
|---|---|---|
| B1 | parcial | Formato, Excel y mañana → día completo: sí. Ver N1-N4 y N6. |
| B2 | parcial | En Factoque, sí. En el producto A, H1 no tiene tanda (N5). |
| B3 | sí | El brief 2a debe pedir la guarda en `mercadopago-auto`. |
| A1 | sí | |
| A2 | parcial | 03 §2 sigue con `RUTINA` = «corte diario de lo ya cargado» (N7). |
| A3 | parcial | Cierra I3, pero saca la red contra el re-fechado (N1). C6 queda imposible. |
| A4 | parcial | `falta_mp` no tiene brief ni test. |
| M1 | parcial | 04 I10 sigue con «última autorizada». 02 §1.1 y 04 §4.2 siguen con vencimiento = cobro. |
| M2-M5, L1, tests | sí | |

**Hallazgos nuevos**

| id | sev. | Evidencia | Arreglo |
|---|---|---|---|
| N1 | bloq. | Un cobro con fecha D en un exporte y D+1 en otro da otra base y `k=0`, así que se emite. `posible_duplicado` ya no mira el libro (hoy `bancos-glue.ts:494` lo frena). **Doble factura sola.** | Con `k=0` y una fila igual a ±3 días que falta en el archivo → `posible_repetido`. Test C25. |
| N2 | bloq. | El archivo A corta a la mañana (Perez) y el B empieza a la tarde (Gomez), mismo importe: `m≤k`, no entra nada. **Cobro perdido sin aviso.** | En los días extremos, `m≤k` con saldo o contraparte distintos → revisar. Test C26. |
| N3 | alta | Dos cuentas del mismo banco y ult4 (pesos y dólares) se reconocen por plantilla como una: `m≤k`, perdido. La moneda no está en la base. | Cuenta = `CuentaExtracto.id`, única por CBU y moneda. Moneda en la base. |
| N4 | alta | La base lleva el importe sin signo: un débito y un crédito iguales dan `m≤k`. | Importe con signo. |
| N5 | alta | Las filas viejas (`fecha\|monto\|descripción`, `banco:<hash>`, sin cuenta) no cuentan en `k` ni chocan en el libro. | Declarar el alcance y contarlas en `k`. |
| N6 | alta | Las k se emparejan por leyenda, que según B1 cambia entre exportes. La tarjeta muestra otro cobro y la persona descarta el nuevo. | Emparejar por saldo. Si no hay, mostrar el grupo sin marcar cuál es nuevo. |
| N7 | alta | Una `RUTINA` sobre lo ya cargado emite archivos `PEDIDO` con el permiso del agente (contra C21). | La propuesta hereda el origen y `solicitadoPor`. |
| N8 | baja | El recuento no tiene candado por cuenta. | Tomar `extracto:<t>:<cuenta>`. |

## Vuelta 2 de correcciones (autor, 15/11/2026) · última vuelta según la norma

Cambio de fondo: la clave sola no puede ser estable en un extracto sin id por movimiento. **v3** (`02-diseno.md` §3):
cobertura por día con saldo de cierre; lo que cae en un día ya cargado **nunca sale solo**, y si el día no coincide
(o era parcial) decide una persona con las dos versiones a la vista.

| id | Corrección | Dónde |
|---|---|---|
| N1 re-fechado | Control ±3 días contra créditos cargados que faltan en el archivo nuevo (`posible_repetido`); `posible_duplicado` vuelve a mirar el libro para cobros que no están en el archivo. C25. | `02` §3.3, §5 |
| N2 día cortado | Primer y último día de cada archivo = parciales → caso (c), el día entero a revisar. C26. | `02` §3.2 |
| N3 cuentas iguales / dólares | Cuenta = `CuentaExtracto.id` única por CBU o banco + ult4 + moneda; no pesos → revisar. C27. | `02` §3.1 |
| N4 signo | Importe con signo en la base. C27. | `02` §3.1 |
| N5 filas viejas | Cuentan como cobertura (día parcial) y se busca `banco:<hash viejo>` en el libro. C28. | `02` §3.4 |
| N6 emparejar por leyenda | Por saldo; sin saldo, el grupo sin marcar cuál es nuevo. | `02` §3.2 |
| N7 `RUTINA` sobre archivos | La propuesta hereda origen y `solicitadoPor`; el corte diario sólo emite `RUTINA`. | `02` §3.6; `03` §2; brief 4 |
| N8 candado | `extracto:<tenant>:<cuenta>` en el recuento. | `02` §3.2; brief 1 |
| B2 en el producto A | El cambio de `reglas.ts` es del plugin compartido; el brief 2b lo prueba allá. | `02` §3.5; brief 2b |
| B3 guarda | La guarda en `mercadopago-auto` está en el brief 2a. | brief 2a |
| A4 `falta_mp` | En el brief 2a y en C6. | brief 2a; `04` C6 |
| M1 | I10, §1.1 y §4.2 de 04 con «última creada y no rechazada» y vencimiento = máx(cobro, factura). | `02` §1.1; `04` I10, §4 |

Briefs: 1.135 a 1.784 bytes. **Esta vuelta no tiene tercera certificación** (la norma permite 2 vueltas): la
certificación adversarial de la tanda 1, sobre el código de `cobertura-core.ts` con la simulación
`pruebas/recuento-spec-v2.mjs` del segundo certificador como punto de partida, es la que la cierra. Si vuelve a fallar,
se escala a Fable (política de modelos).
