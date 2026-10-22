# Runbook — Rollback de un release (suite de facturación)

**Para:** dueño (las acciones de Vercel y Neon son suyas). **Zona:** estándar.
**Regla de oro:** primero **dejar de hacer daño**, después entender. El código se vuelve atrás en un
clic; los datos y lo que ya salió a ARCA, no.

## 0. ¿Qué tipo de rollback?

| Qué pasó | Qué se hace | Reversible |
|---|---|---|
| El deploy nuevo rompe pantallas o da 500 | **A. Rollback de app** (Vercel, instantáneo) | Sí |
| La facturación emite mal / duplica / rechaza todo | **B. Kill-switch** de facturación (+ A si es código) | Sí |
| Un solo negocio con problema por una funcionalidad nueva | **C. Apagar el flag** de ese negocio | Sí |
| Una migración dejó la base mal | **D. Restaurar Neon** (branch de backup / PITR) | Con pérdida de lo posterior |
| Facturas mal emitidas en ARCA | **E. Notas de crédito** (fiscal, no técnico) | No: se compensan |

## A. Rollback de app (Vercel)

1. Vercel → `erp-ch` → **Deployments** → el último deploy de Production que andaba bien (el anterior al
   del release; el commit está en el reporte de `release:preparar`).
2. ⋯ → **Promote to Production** (o «Instant Rollback» desde la pestaña del deploy actual). No recompila:
   sirve el build viejo al instante.
3. Verificar: `npm run release:smoke -- https://<dominio> --commit <sha-del-deploy-bueno>`.
4. **Ojo con las migraciones:** si el release migró la base, el código viejo corre contra la base nueva.
   Las migraciones de este repo son **aditivas** (columnas y tablas nuevas, ver `prisma/lote-deploy.txt`),
   así que el código viejo sigue andando. Si una migración no fuera aditiva, **no** hacer A sin mirar D.
5. **Ojo con el siguiente push a `main`:** vuelve a publicar. Antes de pushear de nuevo, revertir el
   commit malo en `main` (`git revert`, por PR, con el Gate) o arreglarlo.

## B. Kill-switch de la facturación

Ver [incidentes.md §La palanca de emergencia](incidentes.md#la-palanca-de-emergencia-kill-switch):
`ARCA_INVOICING_ENABLED=false` en Production + Redeploy. Las ventas se siguen cobrando; las facturas
quedan pendientes y salen cuando se vuelve a prender.

Para volver de **ARCA real a homologación** en toda la plataforma: `ARCA_MODO=homologacion` + Redeploy.
Desde ese momento ninguna factura sale con validez fiscal (runbook `arca-homologacion.md §5`).

## C. Apagar una funcionalidad para un negocio

Ver [flags.md](flags.md): sacar el slug del negocio de `FACTURACION_FLAGS` + Redeploy. No toca datos.

## D. Restaurar la base (Neon) — Gate 2, sólo el dueño

1. **Antes** de cada release con migraciones se crea un branch de backup (paso humano 1 del checklist).
2. Si la base quedó mal: Neon → Branches → el branch `backup-pre-<versión>` → **Restore** sobre `main`, o
   **Time Travel / PITR** al minuto previo al deploy (la ventana del plan free es corta: por eso el branch).
3. Todo lo escrito después del backup (ventas, facturas) **se pierde** de la base, pero lo que ya se
   autorizó en ARCA **existe** en ARCA: hay que reconciliar a mano antes de volver a facturar
   (riesgo de duplicar números). Mantener el kill-switch (B) abajo hasta reconciliar.
4. Si el build quedó con una migración fallida (P3009): `docs/runbooks/migracion-caja-neon.md` §«Si el
   build dice P3009». No cancelar un build que está migrando.

## E. Facturas mal emitidas

No hay rollback técnico: una factura autorizada se anula con **nota de crédito** por el mismo importe. Lo
decide el contador del negocio. El sistema no borra comprobantes autorizados, y nadie debe hacerlo en Neon.

## Después

- Smoke verde contra producción.
- Una entrada en `docs/lecciones-aprendidas/registro.md` (ADR-047).
- Si el release se vuelve a intentar: `npm run release:preparar` de nuevo, desde cero.

— Elaborado por GSG (Plataforma, publicación y mantenimiento)
