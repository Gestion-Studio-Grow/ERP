---
id: ADR-062
nivel: fundacional
dominio: [Seguridad, Datos]
depends_on: [ADR-001, ADR-015, ADR-018, ADR-023]
---
# ADR-062: Multi-tenant Pool shared-schema + RLS como línea base NO negociable (+ realidad y gaps)

**Estado:** Aceptado — **reafirmación fundacional**. **No duplica** ADR-001/018: los **eleva a línea base no
negociable** y registra la **verdad de terreno** (qué está cableado y qué falta) para que no se dé por cerrado.
**Fecha:** 2026-07-10
**Depende de:** ADR-001 (shared schema + tenant_id + RLS), ADR-015 (resolución de tenant fail-closed),
ADR-018 (activación de RLS), ADR-023 (RLS también como palanca de performance)
**Relacionado:** ADR-060 (dos bases, RLS dentro de cada una), ADR-061 (seguridad = motor compartido),
ADR-021 (plano de plataforma), ADR-067 (DR/cumplimiento) · `docs/estrategia/frente-seguridad*` ·
`docs/estrategia/mapa-grounded-sistema-2026-07-09.md`

---

## Contexto

ADR-001 decidió el modelo (pool shared-schema + `tenant_id` + RLS) y ADR-018 el mecanismo (`SET LOCAL
app.current_tenant_id` por transacción + rol sin `BYPASSRLS`). El aislamiento **a nivel de aplicación** ya
funciona (toda query pasa por `getCurrentTenantId()`, fail-closed por ADR-015). Con dos productos en dos bases
(ADR-060), **cada base sigue siendo pool multi-tenant** → el aislamiento por RLS deja de ser "diferible" y pasa
a ser **la línea base de seguridad del producto**. Hace falta un ADR que lo declare **no negociable** y —sobre
todo— que **registre la realidad actual con sus gaps**, para no operar sobre el supuesto falso de que "RLS ya
está 100% cerrado".

## Decisión

**El aislamiento multi-tenant por RLS de Postgres (pool shared-schema) es la LÍNEA BASE de seguridad, no
negociable, en TODA base que sirva más de un tenant.** Ningún camino de datos del plano del tenant puede
depender solo del predicado de aplicación: RLS es el backstop dentro de la base.

**Invariante:** en una base con ≥2 tenants, RLS **enforced** + rol de app **sin `BYPASSRLS`** + `SET LOCAL`
por transacción es **condición de operación** (gate duro, ADR-018). Se **verifica** con `npm run gates`
(gate:rls) — sin drift — antes de cualquier release que toque datos.

### Verdad de terreno (2026-07-10) — cableado, con TRES gaps registrados
Según el ground-truth del repo (`mapa-grounded-sistema-2026-07-09.md`) y el frente de seguridad, RLS está
**cableado** (extensión de Prisma, GUC por transacción, gate:rls). Gaps abiertos a cerrar como trabajo, **no**
como supuesto resuelto:

1. **Verificar enforced EN VIVO por base.** Que el gate pase en CI no garantiza el estado productivo de cada
   base. Gap: **auditar en vivo** (por base de producto, ADR-060) que RLS está `ENABLED/FORCED` y que el rol
   de app corre `NOBYPASSRLS`. Es verificación, no diseño.
2. **Dos crons sin contexto de tenant.** Hay procesos programados que corren **fuera** de una transacción con
   `app.current_tenant_id` seteado → o evaden RLS o fallan-cerrado. Gap: **darles contexto explícito de tenant**
   (iterar por tenant con el GUC seteado) o correrlos por un rol/superficie de plataforma auditada (ADR-021),
   nunca con un rol que evada el aislamiento.
3. **Rol `app_user` con `BYPASSRLS`.** Si el rol de aplicación conserva `BYPASSRLS`, RLS es decorativo. Gap
   (rojo): **el rol de app debe ser `NOBYPASSRLS`**; `BYPASSRLS` queda reservado al plano de plataforma
   (migraciones/operador), separado del plano del tenant. Atado a rotar secretos/credenciales (frente seguridad).

> **Regla:** estos tres gaps son **bloqueantes previos a cobros/datos reales masivos**; se cierran y se
> re-verifican con `gate:rls` + auditoría en vivo por base. Hasta entonces, "RLS listo" es **falso**.

## Consecuencias

- **(+)** RLS deja de ser "diferible": con dos bases pool (ADR-060) es la barrera dura por defecto; el Gate lo
  chequea (ADR-040, ángulo seguridad).
- **(+)** Los gaps quedan **explícitos y accionables** (verificación en vivo, contexto de tenant en crons,
  `NOBYPASSRLS`), no enterrados en un supuesto de "ya está".
- **(+)** RLS es también **palanca de performance** (ADR-023): inyecta el predicado `tenantId` y enciende los
  índices compuestos.
- **(−)** Costo operativo: cada base de producto exige su auditoría de RLS en vivo y su set de crons con
  contexto; se paga por producto (ADR-060).
- **(−)** Los crons con contexto de tenant son más complejos (iterar por tenant) que un scan global — es el
  precio de no evadir el aislamiento.

## Alternativas descartadas

- **Confiar solo en el predicado de aplicación** (`getCurrentTenantId()` sin RLS). Funciona con 1 tenant
  (ADR-015) pero es una sola capa: un bug de query filtra datos entre tenants. Rechazada como línea base para
  bases con ≥2 tenants.
- **DB/schema dedicado por tenant** para evitar RLS. Máximo aislamiento pero rompe la economía del micro
  (ADR-001/007/060). Reservado a enterprise puntuales, no como default.
- **Dejar los crons con un rol `BYPASSRLS` "porque es interno".** Cómodo, pero cualquier proceso que evada RLS
  es una fuga potencial cross-tenant. Rechazada: contexto de tenant explícito o plano de plataforma auditado.

— Elaborado por GSG (Seguridad / Arquitecto de Solución — reafirmación fundacional; el cierre de los 3 gaps toca infra/roles = Gate del dueño)
