# ADR-029: Ruteo multi-tenant por hostname (`TENANT_HOST_MAP`) para URLs `.vercel.app` gratis por tenant

**Estado:** Aceptado (2026-07-06) — implementado en `src/lib/tenant.ts`, cubierto por tests
**Fecha:** 2026-07-06
**Depende de:** ADR-001 (multi-tenant), ADR-015 (resolución de tenant fail-closed)
**Relacionado:** ADR-028 (modelo de entrega), ADR-031 (demo navegable)

---

## Contexto
Vercel regala URLs planas `<algo>.vercel.app`, pero **no son subdominios de un dominio común** → el ruteo
por subdominio (`APP_BASE_DOMAIN`) **no las reconoce**. Se necesita **una URL gratis por tenant** (para
demos y consolidados) sin comprar dominio propio y sin fragmentar en N proyectos de Vercel.

## Decisión
Ruteo multi-tenant **por hostname exacto** vía la env `TENANT_HOST_MAP="host1=sub1;host2=sub2;…"`.
`getCurrentTenantId()` mira **primero** el mapa exacto de hostname; si no matchea, **cae al método de
subdominio de siempre** (intacto, para el día del dominio propio). En el **deploy demo**, `APP_BASE_DOMAIN`
va **VACÍO** y el ruteo lo hace el mapa. **Un solo proyecto Vercel + N dominios `.vercel.app`** (Hobby
permite hasta 50).

## Consecuencias
- **(+)** Cada negocio tiene **su URL gratis hoy**, sin dominio propio ni fragmentar deploys/variables.
- **(+)** **No rompe el camino de dominio propio**: mañana se setea `APP_BASE_DOMAIN` y el mapa se puede
  quitar; el método de subdominio queda intacto.
- **(+)** Preserva el **fail-closed** de ADR-015: la home pelada del proyecto con >1 tenant y sin entrada
  en el mapa cae a **500 a propósito** (no adivina a quién servir).
- **(−)** El mapa se configura a mano por tenant y los dominios se agregan en Vercel (acción del dueño).
- **Toca:** `src/lib/tenant.ts` (`normalizeHost` / `hostMapSubdomain`), `src/lib/tenant.test.ts`,
  `.env.vercel.template`.

## Estado
**Aceptado — implementado.** Cubierto por tests (`chestetica-erp`, `magra-erp`, `shinevelas-erp`,
`adosmanos-erp`). Documentado en `docs/metodologia/demo-publica-costo-cero.md §2`. Refuerza ADR-015/ADR-001.
