---
id: ADR-070
nivel: fundacional
dominio: [Operaciones, Plataforma]
depends_on: [ADR-029, ADR-039, ADR-040]
---
# ADR-070: Disciplina de release — un solo deploy para todos los tenants, pipeline preview→prod con gates, fix del mapeo rama→entorno

**Estado:** Aceptado — **fundamento de operaciones/release**. Deriva del motor compartido (ADR-061): un solo
código, un solo deploy por producto sirve a todos sus tenants.
**Fecha:** 2026-07-10
**Depende de:** ADR-029 (ruteo multi-tenant por hostname), ADR-039 (metodología del sprint: worktrees, un
merge-master), ADR-040 (Gate de Excelencia)
**Relacionado:** ADR-061 (motor compartido), ADR-060 (un deploy por producto/base), ADR-041 (Gate 1 deploy lo
aprueba el dueño), ADR-030 (DEMO→VENTA) · `docs/runbooks/deploy-vercel.md` · `docs/runbooks/deploy-staging-multitenant-piloto.md`

---

## Contexto

Con un **motor invisible compartido** (ADR-061) y multi-tenant por hostname (ADR-029), **todos los tenants de
un producto corren el MISMO código**: no hay build por cliente. Eso exige una **disciplina de release** clara —
un solo artefacto, promovido con gates— y expone un **bug de proceso** detectado en la operación: el entorno de
**staging apuntaba a `main`** en lugar de a la **rama del sprint**, de modo que "staging" no probaba lo que se
iba a integrar, sino lo ya integrado. Sin disciplina, el deploy multi-tenant amplifica cualquier error a todos
los tenants a la vez.

## Decisión

1. **Un solo deploy para todos los tenants (por producto).** El motor compartido (ADR-061) se despliega **una
   vez por producto/base** (ADR-060) y sirve a **todos** sus tenants por hostname (ADR-029). **No** hay deploy
   por tenant; la diferencia entre tenants es **datos/config**, no artefacto. Un fix o una regresión llega a
   todos a la vez → el Gate (ADR-040) es la barrera antes de promover.
2. **Pipeline preview → prod con gates.** Todo cambio pasa por **preview** (entorno efímero por rama/PR, datos
   de QA, flags de QA) donde corre el **Gate de Excelencia** (tsc+build+test verdes, gate:rls sin drift,
   auditoría SAP+GSG, ADR-040). **Solo tras el Gate** se promueve a **prod**, y la promoción a prod es **Gate 1
   del dueño** (ADR-041: el push a `main` no publica; publicar lo autoriza el dueño).
3. **Fix del mapeo rama→entorno (regla dura).** **Cada entorno apunta a la rama correcta**: **preview/staging →
   la rama del sprint/PR** (lo que se está por integrar), **prod → `main`** (lo ya integrado y gateado).
   Staging **nunca** apunta a `main` (probaría lo viejo). Es config de proyecto (Vercel), no código.
4. **Config de deploy versionada** en runbooks (`deploy-vercel.md`, `deploy-staging-multitenant-piloto.md`):
   variables, `TENANT_HOST_MAP`/`APP_BASE_DOMAIN` (ADR-029), y el mapeo rama→entorno quedan **documentados**,
   no en la cabeza de quien deployó.

> **En una línea:** *un artefacto por producto sirve a todos los tenants; se promueve preview→prod solo pasando
> el Gate; y cada entorno mira su rama correcta —staging la del sprint, prod `main`— nunca al revés.*

## Consecuencias

- **(+)** **Consistencia y costo:** un solo build por producto (no N por tenant) → simple de mantener y barato,
  coherente con ADR-061/007.
- **(+)** El **Gate como barrera única** antes de que un cambio toque a todos los tenants → el blast radius del
  deploy compartido se controla en un solo punto.
- **(+)** Staging **prueba de verdad lo que se va a integrar** (rama del sprint) → menos sorpresas en prod;
  cierra el bug de proceso detectado.
- **(−)** Un deploy compartido significa que **una regresión afecta a todos** los tenants del producto → sube la
  exigencia del Gate y de los previews (no se puede "romper solo un cliente"). Asumido: es el precio del motor
  compartido.
- **(−)** Requiere **rigor de config por entorno** (rama→entorno correcto, variables por entorno) — se mitiga
  versionando la config en runbooks y con el Gate 1 del dueño para prod.

## Alternativas descartadas

- **Un deploy por tenant.** Aislaría el blast radius por cliente, pero **rompe el motor compartido** (N builds,
  N pipelines) y no escala (ADR-061/007). Rechazada: la diferencia es config, no artefacto.
- **Deploy directo a prod sin preview/Gate** (push-to-prod). Rápido pero con deploy compartido es jugar a la
  ruleta con todos los tenants. Rechazada: preview + Gate + Gate 1 del dueño (ADR-040/041).
- **Dejar staging apuntando a `main`** ("total, es parecido"). Es justo el bug: staging probaría lo ya
  integrado, no lo que viene. Rechazada explícitamente.

— Elaborado por GSG (Arquitecto de Solución / Release — fundamento; el deploy a prod es Gate 1 del dueño, ADR-041)
