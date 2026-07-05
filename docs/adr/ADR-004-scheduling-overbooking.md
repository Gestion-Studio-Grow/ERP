# ADR-004: Scheduling — Modelo de Datos y Prevención de Overbooking

**Estado:** Aceptado — **enmendado 2026-07-05** (mecanismo Fase 1 reconciliado con el código, ver Enmienda).
**Depende de:** ADR-001 (multi-tenant/RLS), ADR-003 (Scheduling como Capability nueva del Core)

---

## Enmienda 2026-07-05 — mecanismo real de Fase 1 (reconciliación con el código, ADR-023 F2)

> **Por qué esta enmienda:** este ADR recomendaba `EXCLUDE USING GIST` (Opción C, §4) como
> único mecanismo, afirmando que el overbooking se previene "en la base de datos, no en el
> código". **La auditoría ADR-023 (F2) encontró que ese constraint no existe en ninguna
> migración** — la prevención vivía solo en `assertSlotAvailable` (`booking-core.ts`), un
> check-then-insert en **ReadCommitted**, con una carrera TOCTOU real (dos reservas del mismo
> hueco leen ambas "libre" y ambas insertan). El ADR le mentía al código. Esta enmienda
> reconcilia: describe el mecanismo **realmente implementado** y deja GIST como objetivo futuro.
>
> **Mecanismo Fase 1 (implementado, 2026-07-05):** las transacciones de reserva corren en
> nivel **`Serializable` con reintentos**, vía `bookingTransaction` (`src/lib/rls.ts`), que
> envuelve las 4 rutas de alta/reprogramación de turno (`actions.ts` alta + reprogramación,
> `client-actions.ts` reprogramación pública, `waitlist-actions.ts` conversión de espera).
> Bajo Serializable, dos reservas concurrentes del mismo hueco hacen que Postgres aborte una
> con `serialization_failure` (SQLSTATE 40001 → Prisma `P2034`); el reintento re-corre
> `assertSlotAvailable`, que ahora ve el turno ya commiteado y falla con el error de negocio
> "ese horario ya no está disponible". La regla de choques (profesional + box + buffer +
> bloqueos + capacidad de recursos) sigue viviendo, sin duplicar, en `assertSlotAvailable`.
>
> **Costo/beneficio:** cierra la carrera hoy, con 1 tenant, **sin consumir storage** (encaja
> en el free plan de Neon). El único trade-off —degradación bajo alta concurrencia de
> escritura por reintentos— es irrelevante al volumen de un salón.
>
> **GIST sigue siendo el objetivo de Fase 2/mediano plazo** (Opción C, abajo): la garantía a
> nivel schema es superior porque no depende de que cada nueva ruta de escritura use el wrapper
> correcto. Se adopta cuando se toque el schema de `Appointment` con plan pago (habilita
> `btree_gist` + `EXCLUDE`), momento en que este ADR volverá a `Serializable` como red de
> respaldo y `EXCLUDE` como garantía primaria. Hasta entonces, **la disciplina es: toda ruta
> que cree o mueva un turno usa `bookingTransaction`, no `tenantTransaction` a secas.**

---

## 1. Problema a resolver
Dos clientes reservando el mismo profesional en el mismo horario, en simultáneo (web + presencial, o dos pestañas), no pueden terminar en dos turnos superpuestos. Esto tiene que resolverse **en la base de datos**, no en el código de la aplicación — si lo resolvés solo en la app, un segundo request concurrente que entra en el microsegundo exacto rompe la regla igual.

## 2. Alcance de V1 (Fase 1 del piloto)
- Un Turno tiene **un solo profesional/recurso**. Múltiples recursos por turno (ej. sala + profesional) queda para Fase 3 — no lo necesitás para demostrar el piloto y agrega complejidad de modelado que hoy no paga.
- Estados del turno: `reservado → confirmado → completado`, con salidas a `cancelado` y `no_show`.

```
reservado ──> confirmado ──> completado
    │              │
    └──> cancelado │
                    └──> no_show
```

## 3. Alternativas para evitar overbooking

| Alternativa | Descripción | Problema |
|---|---|---|
| A. Validar en el código antes de insertar (`SELECT` de conflictos, luego `INSERT`) | Lo más intuitivo | Race condition: dos requests pueden pasar el `SELECT` antes de que ninguno haga el `INSERT`. Necesita locking manual (`SELECT FOR UPDATE`) para ser confiable, lo cual es fácil de olvidar en el próximo endpoint que alguien escriba. |
| B. Lock optimista con reintentos | Reintentar si falla | Complejidad de manejo de reintentos en cada punto donde se crea un turno (API, importación masiva, Plugin de reservas online a futuro). |
| **C. Constraint de exclusión de PostgreSQL (`EXCLUDE USING GIST`)** | La base de datos rechaza el INSERT/UPDATE si se superpone un rango de tiempo para el mismo profesional | Ninguno — es la solución nativa de Postgres para este problema exacto. |

## 4. Recomendación: Opción C

Postgres tiene un tipo de constraint diseñado específicamente para esto. En vez de confiar en que cada lugar del código valide bien la superposición, la regla vive en el schema — igual que la Row-Level Security de ADR-001, es "seguridad por diseño en el motor", no por disciplina del programador.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE turno (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  cliente_party_id UUID NOT NULL,
  profesional_party_id UUID NOT NULL,
  producto_id UUID NOT NULL,
  rango TSTZRANGE NOT NULL,          -- [fecha_inicio, fecha_fin)
  estado TEXT NOT NULL DEFAULT 'reservado',
  canal_origen TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  EXCLUDE USING GIST (
    tenant_id WITH =,
    profesional_party_id WITH =,
    rango WITH &&
  ) WHERE (estado NOT IN ('cancelado', 'no_show'))
);
```

Esto le dice a Postgres: *"para el mismo tenant y el mismo profesional, ningún rango de tiempo puede superponerse con otro, salvo que uno de los dos esté cancelado o sea no-show"*. El intento de insertar un turno superpuesto falla directamente con un error de constraint — no hace falta ningún `SELECT FOR UPDATE` en la aplicación.

Nota importante: el `tenant_id` entra como parte del constraint, no solo como filtro de RLS. Esto es porque `EXCLUDE` no respeta políticas de RLS de la misma forma que un `SELECT` — hay que ser explícito.

## 5. Riesgos
- El equipo tiene que entender `TSTZRANGE` y `EXCLUDE USING GIST` — no es SQL del día a día. Vale la pena la curva de aprendizaje una sola vez versus mantener lógica de locking a mano en cada lugar donde se cree un turno (API REST, importación masiva futura, Plugin de reservas online).
- Si en Fase 3 agregás múltiples recursos por turno (profesional + sala), el constraint se duplica por cada tipo de recurso, o se modela como una tabla `turno_recurso` aparte con su propio `EXCLUDE`. Se resuelve en su momento, no ahora.

## 6. Qué dispara la Capability hacia afuera (conexión con ADR-002)
Cada cambio de estado de un Turno (`completado`, `cancelado`) publica un evento en el outbox:
- `TurnoCompletado` → dispara creación de Orden (ver ADR-003).
- `TurnoCreado` / `TurnoCancelado` → en Fase 3, un Plugin de WhatsApp los consume para mandar recordatorio/confirmación. No se construye el Plugin ahora, pero el evento sale desde el día 1 aunque nadie lo escuche todavía — así no hay que tocar Scheduling cuando llegue ese Plugin.
