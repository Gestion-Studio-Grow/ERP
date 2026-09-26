# Datos de volumen del laboratorio (QA Facturación a escala, vuelta 2 — 26/09/2026)

Sólo base `erp_lab` (Postgres local, 5433). Sólo el negocio de laboratorio **Ferretería El Tornillo SRL**
(`ferreteria-el-tornillo-srl`, plan «comerciante», Responsable Inscripto, puntos de venta 4 y 5, entra por
`http://tornillo-lab.localhost:3212/admin`). CH (`beauty-spa`) no se tocó. No existe `comerciante.localhost` en `TENANT_HOST_MAP`.

## Qué hay sembrado (`sembrar-volumen.mjs`, todo con id que empieza con `qavol-`)
La vuelta 2 deshizo la siembra de la vuelta 1 y volvió a sembrar. La siembra es determinística: mismas cifras que en la vuelta 1.
Único cambio: 2 de cada 3 envíos pendientes llevan `ivaPorProducto: true` (ENG-024), para que ARCA en modo prueba pueda autorizarlos.
| Qué | Cantidad |
|---|---|
| Fichas de clientes (con y sin CUIT o DNI, nombres con tildes, 15 % empresas RI) | 2.000 |
| Pedidos entregados (atan el comprobante a la ficha o a un nombre) | 3.127 |
| Comprobantes feb–sep 2026 (Factura A/B, 195 notas de crédito): 4.800 autorizados, 59 pendientes, 135 rechazados | 4.994 |
| Importación del banco + movimientos atados a comprobantes | 1 + 471 |
| Envíos a ARCA pendientes (outbox `InvoiceCreated`) | 59 |
Ejemplos para buscar: número `0005-00001685`, CUIT `30-71555888-9` (Ñandú Construcciones SRL), `Mónica Pérez` (DNI 27888999), nombre del banco `PERALTA CAROLINA`. Resumen: `qa-2/siembra-resultado.json`.
Usuarios de QA (los de la vuelta 1, `qa-1/usuarios-qa.mjs`, rol Dueño, clave = la común de la línea 5 de `lab/USUARIOS.md`): `qa.escala@tornillo.lab` y `qa.escala@dontito.lab` (Don Tito, el negocio B del aislamiento).

## Qué cambió el recorrido de la vuelta 2 (además de la siembra)
- Autorizar, 4 toques (3 en el diseño viejo a 1440, el primero con doble clic, y 1 en el nuevo a 390): 2 autorizados (`qavol-inv-04735`, PV 5, y `qavol-inv-04742`, PV 4; los dos con el número 1 y el CAE `STUB00000001` del ARCA de prueba) y 27 rechazados. Quedan 30 pendientes: 19 envíos trabados con «La base de datos no aceptó la operación (código P2002)» (hasta 4 intentos). Estado final: 4.802 autorizados, 30 pendientes, 162 rechazados.
- Links de cobro: 4 nuevos «QA escala viejo|nuevo 1440|390 …» de $12.345,67. Con los 4 de la vuelta 1, 8 filas de `AuditLog` con `entity='PaymentLink'` en Tornillo.
- «Facturar» en el rechazado `qavol-inv-04770`: la app lo frenó («Sólo se facturan las ventas cobradas o dejadas a cuenta»); sigue rechazado.
- Interruptor «Diseño nuevo» de Tornillo: se prendió y se apagó dos veces. Queda **apagado**, como estaba, y suma 4 filas en su historial.
- En CH y en Don Tito sólo se entró a mirar.
- Server de esta vuelta: `next start` en :3212 (PIDs 25284, 25310 y 25315; log `/tmp/fac-server-3212-2.log`). Se apaga con `kill 25315 25310 25284`.

## Cómo deshacer
```bash
LAB=/tmp/claude-0/-home-user-Factory-GSG/12bc8dd5-60d3-5e22-95c1-3816d17ad0a9/scratchpad/lab
cd /home/user/erp-facturacion
source $LAB/env-lab.sh
node .qa/facturacion-escala/sembrar-volumen.mjs --deshacer      # comprobantes, envíos, movimientos, pedidos y fichas qavol-
node .qa/facturacion-escala/qa-1/usuarios-qa.mjs --deshacer     # los dos usuarios de QA
# opcional, los 8 links de cobro de prueba (filas de auditoría del laboratorio):
psql "$LAB_OWNER_URL" -c "delete from \"AuditLog\" where \"tenantId\"='cmuig4ar2000ba17d167ragcn' and entity='PaymentLink' and changes->>'concepto' like 'QA escala %'"
```
**El deshacer de la vuelta 1 no funcionaba.** Desde la migración `20260925150000_comprobante_autorizado_inmutable` (aplicada en erp_lab el 25/09 a las 19:18 UTC, antes de la vuelta 1), un trigger impide borrar un comprobante con CAE: error 23001, «Un comprobante con CAE no se puede borrar: se anula con una nota de crédito». Ahora el deshacer apaga ese trigger sólo dentro de su propia transacción, con el rol dueño de la base (el dueño de la tabla). Las claves foráneas siguen activas y el trigger se vuelve a prender antes del commit; si algo falla, el rollback lo deja prendido.
Probado en esta vuelta: borró 4.994 comprobantes, 3.127 pedidos, 2.000 fichas, 471 movimientos, 1 importación y 59 envíos, y el trigger quedó prendido (`tgenabled = O`). Log: `qa-2/logs/deshacer-vuelta1.txt`.
El deshacer no corre fuera de `erp_lab` ni contra un servidor que no sea local, y sólo toca Tornillo.

## Para saber
- Tornillo y Don Tito están en la cartera del estudio contable de laboratorio (`estudio-lab`), que usa el otro equipo: el estudio ve estos comprobantes de prueba en Tornillo hasta que se deshaga la siembra.
