---
id: ADR-095
nivel: fundacional
dominio: producto
depends_on: [ADR-074, ADR-065, ADR-019]
---

# ADR-095 — Fábrica de altas: estado honesto (los stubs mentían; ahora no)

**Estado:** Aceptada (2026-07-12) · **Depende de:** ADR-074 (`provisionTenant` como saga), ADR-065 (fábrica de tenants + módulos), ADR-019 (onboarding / alta de tenant, el core que no se reinventa) · **Relacionado:** ADR-021 (consola de operador), ADR-034 (preset-IA como motor de alta del micro).

> Numeración provisional — verificar colisión al mergear (regla de timestamps de CLAUDE.md aplicada a ADRs; otras sesiones podrían haber tomado números 081 en adelante).

## Contexto

La fábrica de altas (ADR-074, saga sobre el core de ADR-019) se había entregado con **efectos externos stubbeados** (host/DNS, invitación por email) y **sin persistir la saga**. El problema no era el stub — es válido diferir efectos reales (ADR-030) — sino que la **UI y los mensajes daban por hecho lo que no pasaba**: el wizard "confirmaba" pasos que eran no-op, dando una sensación de alta completa que no existía. Los stubs **mentían** sobre el estado real.

Esto encaja con la regla de cierre de ADR-071: **"nada se marca listo sin ARTEFACTO + EVIDENCIA."** Un stub que dice "hecho" sin hacer nada viola esa regla.

## Decisión

1. **Efectos externos HONESTOS:** el alta declara explícitamente qué es real (commit de DB, transaccional, reusa ADR-019) y qué está **stubbeado/diferido** (host/DNS, invitación) — la UI **no** afirma que un paso stubbeado se completó. Un dry-run se muestra como dry-run; un commit auditado se muestra como tal.
2. **`edicion → profile` en el alta:** el alta persiste el perfil (Comercio/Empresa) derivado de la edición, no lo simula.
3. **Idempotencia persistente:** se persiste la corrida de la saga (`ProvisioningRun`) **por SQL crudo, NO en `schema.prisma`** — decisión deliberada para **no repetir el schema-ahead** que nos mordió con CH (mantener el schema de Prisma alineado con lo aplicado, y llevar la tabla de auditoría de provisioning fuera del modelo de negocio hasta que amerite migración formal).
4. **La consola interna es `/operador/(console)`, no `/admin`** (plano de plataforma, ADR-021), y vive en **su propia app `gsg-erp`** (`https://gsg-erp.vercel.app/operador/login`, verificado 2026-07-12; `/operador/alta` gateada 307→login). `gsg-erp` es además el tenant propio de GSG. El alta se opera desde ahí.
5. **No es greenfield:** el provisioning **ya existe** (ADR-019 core + ADR-021 consola + RFC-003) — se construye **encima**, no se reinventa.

## Consecuencias

**Habilita:** confiar en lo que la consola de alta dice — el estado mostrado es el estado real; con el gate del 2º tenant cumplido (ADR-092), el alta de clientes reales queda destrabada de verdad.

**Deuda / diferido con criterio:** los efectos reales (DNS/host/email) se encienden POST-venta (ADR-030), acción del dueño; la saga persistida por SQL crudo se formaliza a migración cuando el volumen de altas lo justifique. Runbook de RLS para el 2º tenant disponible.

**Lección (a la retro, ADR-047):** un stub es legítimo; **un stub que miente sobre el estado, no.** El honesto dice "esto todavía no pasa"; el que engaña dice "listo".

— Elaborado por GSG · 2026-07-12
