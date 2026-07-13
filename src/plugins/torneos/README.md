# Torneos — vertical WPE dentro del ERP (ADR-097)

Unifica el **Circuito WPE** (motor de torneos de pádel) con la infraestructura del ERP: mismo repo, misma
base, mismo pipeline, mismo aislamiento por tenant. **No es un injerto**: encaja en el modelo
**núcleo + plugins** (ADR-002/054) como un vertical de primera parte. Decisión: ADR-097.

## Anatomía

```
torneos/
  engine/
    torneo-engine.js      ← MOTOR, copia VERBATIM del repo circuito-wpe (SHA verificado). NO SE TOCA.
    torneo-engine.d.ts    ← tipado de su superficie (default export = el objeto `api` del UMD).
    index.ts              ← envoltorio tipado: re-expone el motor con tipos, sin reescribirlo.
    tests/                ← los 76 tests del motor, byte-idénticos (.mjs). Corren en el CI del ERP.
  persistence/            ← FASE 2: snapshot JSONB por tenant (reemplaza el localStorage de la demo).
    store.ts              ← puerto `TorneoStore` + errores.
    aplicar.ts            ← orquestación "persiste SOLO si ok" + wrappers de las mutaciones del motor.
    memoria-store.ts      ← fake en memoria (tests) — round-trip serializar/deserializar como el real.
    prisma-store.ts       ← adaptador real (SQL crudo, tenant-scoped, guard schema-ahead). Gate 2.
    flag.ts               ← TORNEOS_ENABLED (rollout reversible, default OFF).
  module.ts               ← ModuleDescriptor (catálogo ADR-054). DEFINIDO, no cableado aún (FASE 3).
```

## Principios (ADR-097)

1. **El motor es núcleo-librería, el ERP es la plataforma.** El motor (`engine/`) es JS puro
   determinístico, sin dependencias, con sus 76 tests. Corre en Node tal cual. **Se envuelve, no se
   toca** — cualquier cambio de comportamiento va contra el repo `circuito-wpe`, no acá.
2. **Persistencia encima, nunca dentro.** El motor no sabe de DB: recibe y devuelve objetos planos con
   `serializar()`/`deserializar()`. La persistencia (`persistence/`) vive por fuera y guarda el snapshot.
3. **Empezá simple:** un snapshot **JSONB por torneo**, sin normalizar a tablas relacionales. Se
   normaliza recién si aparece una query que lo pida (ranking cross-torneo), no antes.
4. **Aislamiento por tenant de fábrica:** la tabla `Torneo` lleva `tenantId` + policy RLS (Gate 2). El
   adaptador corre dentro de `tenantTransaction` con predicado explícito (belt-and-suspenders, ADR-018).
5. **Reversible:** todo detrás de `TORNEOS_ENABLED` (default OFF). Nada toca la DB hasta Gate 2.

## Estado

- **FASE 1 (motor como librería):** ✅ engine + 76 tests corriendo en el CI del ERP.
- **FASE 2 (persistencia Neon):** ✅ orquestación + store en memoria testeados; adaptador real + migración
  `prisma/pending-gate2/Torneo.sql` **preparados, sin aplicar** (Gate 2).
- **FASE 3+ (superficie web, backoffice en la consola, app Expo, corte de la demo vieja):** planificado
  (ver ADR-097 §Fases). **NO ejecutado.** La demo `circuito-wpe.vercel.app` sigue intacta.

— Elaborado por GSG
