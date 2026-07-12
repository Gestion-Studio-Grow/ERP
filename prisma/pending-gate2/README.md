# Migraciones preparadas — Gate 2 (NO aplicadas)

Carpeta **fuera** de `prisma/migrations/` a propósito: `prisma migrate deploy` no la mira. Contiene
cambios de schema **preparados pero no aplicados**, que tocan la DB de producción (Neon) y por tanto son
**Gate 2** (lo único irreversible — ver `CLAUDE.md` → *Autorización y gates* / ADR-018). Aplicarlos es
decisión del dueño.

| Archivo | Qué agrega | Origen | Estado |
|---|---|---|---|
| `ProvisioningRun.sql` | Tabla `ProvisioningRun` — persiste la saga de la fábrica de tenants (idempotencia entre procesos, reanudación, auditoría de plataforma) | ADR-074 "Próxima iteración" · consola de operador (Fase 2) | **Preparada, sin aplicar** |
| `CarniceriaRubro.sql` | `Product.category` + `Product.cost` (nullable) · tabla `ProductBatch` (lotes/envasado al vacío: fecha envasado, vencimiento, peso variable, trazabilidad, FEFO) · tablas `ProcessingRun`/`ProcessingOutput` (despiece con rendimiento y merma) · enums `BatchStatus`/`ProcessingStatus` | Rubro carnicería MAGRA · `docs/preventa/magra/backoffice-carniceria-spec.md` | **Preparada, sin aplicar** · ⚠️ requiere sumar RLS de las 3 tablas de-tenant al aplicar |

Mientras no se aplique, la consola de operador funciona con la idempotencia de la saga **en memoria**
(`src/lib/provisioning/runtime.ts` → `sharedIdempotencyStore`): sobrevive entre requests del mismo
proceso, se pierde al reiniciar. Suficiente para evitar un doble-submit; no para reanudar entre procesos.

— Elaborado por GSG
