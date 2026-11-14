# Relevo VOUCH-004 · PR #79 (vouchers: la plata de la administración no se factura sola)

Estado al 10/11/2026: la rama `claude/vouchers-no-facturar-pago-admin` está en HEAD 9e8cd67. El PR #79 sigue en DRAFT con «[NO PUBLICAR]». La migración `20261110120000_voucher_pagadores` está escrita y SIN aplicar (Gate 2).
ORQ-006 frenó la vuelta 5 por repriorización de la cola. Esto lo retoma una sesión nueva cuando le toque el turno a vouchers.

## Qué hay hecho (opción a: identificar por pagador)
- `BusinessSettings.voucherPagadores TEXT[]` guarda CUIT, CBU o CVU por negocio. Sólo lo carga OWNER (`vouchers:conciliar`). UI en `PagadoresDeLaAdministracion.tsx`.
- La regla pura está en `acreditacion-core.ts:318` (`pagadorDeLaAdministracion`) y se aplica en el claim (`bancos-glue.ts:747`) y en el clasificador de MP (`mercadopago-auto.ts:278`).
- Con la lista vacía queda el criterio de monto+fecha y se muestra un aviso en `vouchers/page.tsx:120`.
- Tests P-1..P-9 en `no-facturar-postgres.test.ts`. Zona 203/203, tsc 0.

## Certificación vuelta 4 (opción a): RECHAZA. ALTA con el CUIT cargado
1. **Gemelo por CSV de MP.** El aviso queda frenado por el pagador, pero la misma operación importada por CSV (misma `referencia`, contraparte con el nombre solo) se factura. Pasa sin pago registrado y con el aviso enganchado (`bancos-glue.ts:747`).
2. **Transferencia a cuenta bancaria.** Las plantillas Galicia, Santander, BBVA y Macro no tienen columna de contraparte (`templates.ts:61-88`). Si el CUIT viene en la descripción o en la referencia, el crédito se factura. Con el #75, que liquida al banco, este pasa a ser el camino principal. **ORQ-006 lo eleva al dueño.**
3. **Sólo el CBU cargado.** El aviso de MP trae el CUIT, así que se factura. La pantalla promete «con su CUIT o CBU» (`page.tsx:123`).
4. **Columna sin migrar.** Con prod sin migrar, guardar la Localización (upsert, aun con la fila existente) y el alta de negocio (`provisionTenant`) fallan con P2022. Causa: `@default([])` en `schema.prisma:498`. **Rompe prod si se publica antes de migrar.**

Menores:
- Falso positivo por dígitos concatenados en la contraparte (`acreditacion-core.ts:332`): BAJA, tiene salida.
- Administración persona física con DNI en MP: el formulario sólo acepta CUIL y no se frena (`http.ts:287`): MEDIA.

## Propuesta de vuelta 5 (una tanda, un gsg-ingeniero Opus alto, después una certificación)
- **H1:** en el claim, si `mov.referencia` coincide con una fila `mp:<ref>` frenada por vouchers (pagador, pendiente o enganche), el crédito va a revisión.
- **H2** (si el dueño no lo acepta como límite): aplicar `pagadorDeLaAdministracion` también a `descripcion` y `referencia`, buscando CUIT/CBU por token y no por dígitos concatenados. Eso cierra también el falso positivo.
- **H3:** exigir al menos un CUIT, o avisar que con un CBU solo no se reconocen los avisos de MP.
- **H4:** sacar `@default([])` del schema (queda el DEFAULT de la base), o `@ignore` con escritura por SQL crudo. Más un test con la columna borrada.
- Tests rojos primero. Después, recertificar los 29 caminos de abajo con el pagador cargado y sin cargar.

## Merge con el PR #75 (`claude/vouchers-decisiones-duenio`)
Da 4 conflictos: schema, `page.tsx`, `acreditacion-core.test` y `liquidacion-repo`. El de `liquidacion-repo` es de lógica: **hay que conservar `candadoDeAcreditacion`** (el lock por negocio que toma `confirmarAcreditacionMp`).

## Tabla de caminos (vuelta 6 del certificador)
S1 = CUIT cargado. S2 = lista vacía.
«Con dato» significa que el CUIT viene en `pagadorDoc`, `docNro` o `contraparte`. «Sin dato» significa que la fila no lo trae en esos campos.

| # | Camino | S1 | S2 |
|---|---|---|---|
| 1 | registro → crédito → claim | OK | OK |
| 2-3 | aviso o clasificador antes del registro | OK | ALTA (avisado) |
| 4 | cheque pendiente → aviso | OK | ALTA |
| 5 | cheque confirmado → crédito | OK | OK |
| 6 | gemelo CSV de MP | con dato: OK. Sin dato con la misma referencia: **ALTA (H1)** | ALTA |
| 7-9 | re-proceso del mapeo · pago en partes · crédito antes de la fecha | con dato: OK. Sin dato: límite del CSV | ALTA |
| 10 | más de 10 días | OK | límite |
| 11-16 | claims dobles, candados, carreras, re-aviso, re-importación | OK | OK |
| 17-19 | pagos y créditos iguales · venta legítima | BAJA (revisión y aprobación) | BAJA |
| 20-23 | no facturable · OTRO · permisos/RLS · cheque rechazado | OK | OK |
| 24 | transferencia a banco | con contraparte: OK. CUIT en la descripción: **ALTA (H2)** | límite |
| 25 | sólo el CBU cargado | **ALTA (H3)** | n/a |
| 26 | dígitos concatenados | BAJA | n/a |
| 27 | persona física con DNI | MEDIA | n/a |
| 28 | columna sin migrar | **P2022 (H4)** | igual |
| 29 | merge con #75 | conservar el candado | |

Las pruebas de los ataques (v3/v4/v5/v6 y los tests sin columna) quedaron en el scratchpad de la sesión, que se pierde. Los casos están descritos arriba para reescribirlos como tests rojos.
