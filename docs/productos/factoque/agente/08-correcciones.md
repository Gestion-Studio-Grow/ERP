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

(La completa el agente verificador; ver abajo.)
