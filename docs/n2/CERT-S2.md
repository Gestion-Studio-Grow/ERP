# Dictamen de certificación — Tanda S2 (paquete Gate 2 nivel 2)

Diff: `a48c3f0..n2/s2-paquete-gate2` (tip 433b718) · Riesgo: datos · Vuelta 1 · Fecha 2026-10-28.
Todo se corrió en el Postgres 16 local (localhost:5433), en bases efímeras propias. Nada contra Neon.

## Veredicto: CON OBSERVACIONES (sin fallas alta/media)

## Verificación ejecutada
- Suite del repo `src/lib/schema-probe/*.test.ts` con GATE2_PG_URL local: **14/14**.
- Test adversarial `adversarial-s2.test.mjs` (esta carpeta): **9/9**:
  - FK compuestas: la suscripción, la plantilla, el PagoExterno y la entrega NO pueden apuntar a la conexión, al evento o a la suscripción de OTRO negocio; monto negativo rechazado.
  - RLS con un rol sin bypass: sin negocio no se ve ninguna de las 6 tablas nuevas; con A no inserta en B.
  - Plata: 8 INSERT concurrentes del mismo payment_id dan 1 fila; 8 UPDATE `aplicadoEn IS NULL` concurrentes dan 1 cobro aplicado; el mismo payment_id en otro negocio no choca.
  - `OutboxEvent.version`=1 en las filas existentes; la `clave` deduplica por negocio.
  - La reversa de enums nombra TODAS las columnas que usan `PaymentMethod`/`UserRole` (consultado en pg_attribute).
  - `check-rls-live.mjs` sale con 0 después del paquete (paso 3 del runbook).
  - El paquete aplicado de nuevo con datos cargados no toca ninguna fila.
- `tsc --noEmit` (copia en el scratchpad, `prisma generate` en cada estado): **0 errores** con `// N2:` comentado y **0** con `// N2:` descomentado.
- C1–C6, revisados en los archivos: aditivos, IF NOT EXISTS y guardas DO, reversa al pie, tandas declaradas; ADD VALUE en pasos separados y sin BEGIN; decisión PagoExterno escrita en N2_pagos.sql:9-31; runbook con branch/pg_dump, orden 1-7, check-rls-live, humo (login, Vender, Agenda), reversa por archivo y quién avisa a quién.

## Fallas
1. **Baja**: `EntregaWebhook_tenantId_outboxEventId_fkey ON DELETE RESTRICT` (N2_hub.sql:128). Cuando el hub registre entregas, el reseteo de go-live (`src/lib/reset-golive-db.ts:167`, `outboxEvent.deleteMany`) y cualquier purga del outbox fallan por FK. Falla cerrada (la tx vuelve atrás), sin daño a los datos. Test: `adversarial-s2.test.mjs` › «vecino (reset-golive / purga de outbox)». Arreglo: anotarlo como deuda de P3. Opciones: sumar EntregaWebhook (y PagoExterno/ClubReservaIndice) al plan de `reset-golive`, o usar `ON DELETE SET NULL` en esa FK.

## Observaciones (sin test, no bloquean)
- `probe.ts` `olvidar()` con una consulta en vuelo: el `finally` viejo puede borrar del mapa `enVuelo` la promesa nueva, y el `cache.set` viejo repone el valor anterior a `olvidar`. Sólo afecta a tests y a un endpoint de operador.
- Enums: cuando M1 o M6 escriban TARJETA/REPARTIDOR/ENCARGADO, un cliente Prisma generado sin esos valores falla al LEER esas filas. M1 y M6 tienen que encender `// N2-enum:` y desplegar ANTES de escribir el primer valor.
- C7: el «sin diferencias» se mide como un diff igual a la línea de base (CarniceriaRubro queda fuera de schema.prisma). Además exige descomentar `// N2-enum:`, que rompe tsc a propósito (está documentado).
- ApiKey con RLS: buscar por prefijo antes de conocer el negocio no encuentra nada con el rol de la app. Está anotado como deuda de P4 (N2_hub.sql:38-40).
