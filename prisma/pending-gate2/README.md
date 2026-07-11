# Migraciones preparadas — Gate 2 (NO aplicadas)

Carpeta **fuera** de `prisma/migrations/` a propósito: `prisma migrate deploy` no la mira. Contiene
cambios de schema **preparados pero no aplicados**, que tocan la DB de producción (Neon) y por tanto son
**Gate 2** (lo único irreversible — ver `CLAUDE.md` → *Autorización y gates* / ADR-018). Aplicarlos es
decisión del dueño.

| Archivo | Qué agrega | Origen | Estado |
|---|---|---|---|
| `ProvisioningRun.sql` | Tabla `ProvisioningRun` — persiste la saga de la fábrica de tenants (idempotencia entre procesos, reanudación, auditoría de plataforma) | ADR-074 · consola de operador (Fase 2) | **Preparada, sin aplicar — ya CABLEADA a un store vivo** |

Mientras no se aplique, la consola de operador funciona con la idempotencia de la saga **en memoria**
(`src/lib/provisioning/runtime.ts` → `sharedIdempotencyStore`, respaldado por `InMemoryIdempotencyStore`):
sobrevive entre requests del mismo proceso, se pierde al reiniciar. Suficiente para evitar un doble-submit;
no para reanudar entre procesos.

**Diferencia con Fase 1:** ahora `ProvisioningRunStore` (`src/lib/provisioning/idempotency-store.ts`) **ya
consume esta tabla** por SQL crudo. Es **resiliente**: si la tabla no existe (hoy) o la DB falla, DEGRADA a
in-memory sin romper el alta (la idempotencia es una optimización — el commit de ADR-019 ya es idempotente
por slug). Apenas se aplica el SQL (Gate 2), la persistencia entre procesos se enciende **sin re-deploy ni
cambio de código**. No requiere agregar modelo a `schema.prisma` (por eso no hay riesgo de deploy
schema-ahead, a diferencia de las otras 9 migraciones pendientes).

— Elaborado por GSG
