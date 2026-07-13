# Migraciones preparadas — Gate 2 (NO aplicadas)

Carpeta **fuera** de `prisma/migrations/` a propósito: `prisma migrate deploy` no la mira. Contiene
cambios de schema **preparados pero no aplicados**, que tocan la DB de producción (Neon) y por tanto son
**Gate 2** (lo único irreversible — ver `CLAUDE.md` → *Autorización y gates* / ADR-018). Aplicarlos es
decisión del dueño (los corre el dueño con `psql "$DATABASE_URL" -f <archivo>`).

| Archivo | Qué agrega | Origen | Estado |
|---|---|---|---|
| `Torneo.sql` | Tabla `Torneo` — snapshot JSONB del estado del torneo, **scopeada por `tenantId` con su policy RLS** (reemplaza el `localStorage` de la demo WPE) | ADR-097 · vertical Torneos / WPE (FASE 2) | **Preparada, sin aplicar** |

Mientras no se apliquen, el vertical de torneos corre detrás del flag `TORNEOS_ENABLED` (default OFF):
el motor y la orquestación de persistencia existen y se testean con un store en memoria
(`src/plugins/torneos/persistence/memoria-store.ts`), pero **nada toca la DB**. El adaptador real
(`prisma-store.ts`) prueba la existencia de la tabla por `information_schema` **antes** de tocarla, así
que si el flag se prende sin haber aplicado la migración, falla con un error claro en vez de abortar una
transacción (lección `defensive-flag-schema-ahead`).

— Elaborado por GSG
