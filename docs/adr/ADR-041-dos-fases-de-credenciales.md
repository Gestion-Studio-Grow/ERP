---
id: ADR-041
nivel: evolutiva
dominio: [Seguridad]
depends_on: [ADR-018]
---
# ADR-041: Dos fases de credenciales — demo sin secretos → datos reales con secretos que carga el dueño

**Estado:** Aceptado — vigente (principio de seguridad)
**Fecha:** 2026-07-06
**Depende de:** ADR-018 (RLS enforced para datos reales)
**Relacionado:** ADR-031 (demo navegable — lo aplica), ADR-030 (inversión post-venta), ADR-028 (modelo de entrega)
**Fuente viva (detalle):** `docs/metodologia/demo-publica-costo-cero.md` → "FUNDAMENTO — credenciales en dos fases"

---

## Contexto
Mostrar el producto a un prospecto **sin fricción** exige **no** pedir secretos; pero **operar datos
reales** exige credenciales y aislamiento. Y hay una regla de custodia: **el agente/operador nunca debe
ver ni escribir un secreto** de un cliente (connection strings, passwords). Se necesita ordenar *cuándo* y
*quién* introduce el secreto.

## Decisión
El secreto entra **lo más tarde posible** y **solo cuando hay algo real que proteger**. Dos fases nítidas
que no se mezclan:
- **FASE 1 — demo/pública (sin datos reales): CERO credenciales.** Ni `DATABASE_URL`, ni passwords, ni
  secretos. El `/demo` es `force-static`, no toca base ni login → primer link vivo sin esperar a nadie.
- **FASE 2 — datos reales (operación de un tenant): recién ahí los secretos.** `DATABASE_URL` (rol
  `app_rls`), `OPERATOR_DATABASE_URL`, `AUTH_SECRET`, `OPERATOR_SECRET`, `OPERATOR_PASSWORD`, con **RLS
  enforced**. **Los pega SIEMPRE el dueño**, en su cuenta; **nunca el agente**. El operador/agente solo
  carga lo **no secreto** (`RLS_ENFORCEMENT=on`, `TENANT_HOST_MAP`) y deja la plantilla
  (`.env.vercel.template`, nombres sin valores).

## Consecuencias
- **(+)** **Menos manos sobre el secreto = menos superficie de fuga**; cero fricción para demostrar; el
  secreto nunca pasa por el chat ni por el repo.
- **(−)** El demo no persiste (es la contracara buscada de "sin secretos"); hay que ser explícito sobre qué
  es ficticio.
- **Aplicado por:** ADR-031 (demo con toggle de persistencia) y ADR-030 (la FASE 2 es parte de la
  inversión post-venta).

## Estado
**Aceptado — vigente.** Principio de seguridad transversal de GSG; detalle en el playbook de demo a costo
cero.
