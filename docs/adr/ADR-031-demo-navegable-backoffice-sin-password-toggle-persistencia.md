# ADR-031: Demo navegable — backoffice sin password + datos ficticios + toggle de persistencia (dos fases de credenciales)

**Estado:** Aceptado (2026-07-06) — implementado (fixtures del sandbox por rubro)
**Depende de:** ADR-018 (activación de RLS), ADR-015 (resolución fail-closed)
**Relacionado:** ADR-030 (ciclo demo→venta→inversión), ADR-035 (consultor→backoffice)

---

## Contexto
Para mostrarle el producto a un prospecto **sin fricción** no se puede exigir login ni cargar secretos;
pero la **operación real** sí necesita credenciales y aislamiento. Regla transversal: **el agente/operador
nunca toca secretos**; el secreto debe entrar **lo más tarde posible** y solo cuando hay algo real que
proteger.

## Decisión
1. **Backoffice accesible en DEMO SIN contraseña**, con **datos ficticios** (blueprint/preset del rubro),
   `force-static` / sin base → **cero secretos** (FASE 1). El prospecto navega el backoffice de verdad.
2. **Toggle de persistencia:** separa **demo** (no persiste, datos ficticios) de **operación real**
   (persiste). El mismo código sirve ambos modos.
3. **Dos fases de credenciales (regla que ordena todo):**
   - **FASE 1 — demo/pública:** **ninguna** credencial (`DATABASE_URL`, passwords, secretos).
   - **FASE 2 — datos reales:** recién ahí se cargan `DATABASE_URL` + `OPERATOR_DATABASE_URL` +
     passwords, con **RLS enforced**; y **los pega SIEMPRE el dueño, nunca el agente** (el operador solo
     carga lo NO secreto: `RLS_ENFORCEMENT=on`, `TENANT_HOST_MAP`).

## Consecuencias
- **(+)** Primer link navegable **ya**, sin esperar llaves; el secreto entra tarde y solo con datos reales
  → **menos manos sobre el secreto = menos superficie de fuga**.
- **(+)** Demo y producto son el mismo artefacto (coherente con ADR-028), diferenciados por el toggle.
- **(−)** El demo no refleja persistencia real; hay que ser explícito sobre qué es ficticio.
- **Toca:** `src/app/demo/*`, `scripts/provision-tenant.ts`, `.env.vercel.template`. Se apoya en RLS
  (ADR-018).

## Estado
**Aceptado — implementado** (fixtures del sandbox por rubro/familia, CONSULTOR→BACKOFFICE). Documentado en
`docs/metodologia/demo-publica-costo-cero.md` (FASE 1 / FASE 2).
