---
id: ADR-091
nivel: fundacional
dominio: plataforma
depends_on: [ADR-070, ADR-041, ADR-029]
---

# ADR-091 — `main` auto-deploya a producción (la verdad operativa)

**Estado:** Aceptada (verdad de terreno verificada, 2026-07-11) · **Depende de:** ADR-070 (disciplina de release · preview→prod), ADR-041 (dos fases de credenciales · Gate 1 del dueño), ADR-029 (ruteo multi-tenant por hostname) · **Corrige:** la creencia documentada en `ESTADO-ACTUAL.md §2` / PD-2 de que el auto-publish estaba apagado.

> Numeración provisional — verificar colisión al mergear (regla de timestamps de CLAUDE.md aplicada a ADRs; otras sesiones podrían haber tomado números 081 en adelante).

## Contexto

La documentación afirmaba que el **auto-publish estaba apagado** (herencia de la etapa Netlify con `stop_builds`) y que el push a `main` iba a GitHub **sin publicar**. La política de gasto se apoyaba en eso.

**Verificado 2026-07-11:** en la plataforma actual (Vercel) el **push a `origin/main` dispara un deploy de producción**. La creencia anterior era falsa para el estado real del repo. Hoy hay **4 apps en vivo** servidas por hostname (ADR-029): `magra-erp`, `chestetica-erp`, `shinevelas-erp`, `adosmanos-erp`.

Esto ya nos mordió: el **incidente CH del 2026-07-09** fue `main` quedando **schema-ahead** de la DB de un tenant y deployándose, tirando la vidriera pública y `/admin/facturacion`.

## Decisión

1. **Tratar TODO push a `main` como un deploy real a producción.** No es un "guardar en GitHub": es publicar a 4 apps vivas.
2. **Migración SIEMPRE antes del merge.** `main` **nunca** puede quedar schema-ahead de la DB de un tenant. La secuencia es: aplicar la migración (Gate 2, acción del dueño) → recién entonces mergear el código que la necesita.
3. **Nada entra a `main` sin el Gate de Excelencia verde** (ADR-040), incluido el gate visual + AA (ADR-090).
4. **Disciplina de rama→entorno** (ADR-070): staging = rama del sprint; prod = `main`. Staging **nunca** apunta a `main`.
5. **Verificar las 4 apps (200) después de cada merge** que toque schema o superficie compartida.

## Consecuencias

**Habilita:** una regla de gasto y de riesgo **honesta** — sabemos que cada merge cuesta un deploy y puede romper prod, así que la disciplina de migración-primero y gate-verde deja de ser opcional.

**Corrige:** `ESTADO-ACTUAL.md §2` y toda mención de "push a main no publica / no gasta créditos" quedan **superadas** por este ADR. La política push-libre de CLAUDE.md ("autónomo hasta GitHub") se **reinterpreta**: como el push publica, el merge a `main` de cambios que tocan prod/superficie **requiere el criterio del Gate + migración-primero**, no es un push mecánico.

**Riesgo:** si alguien mergea asumiendo el viejo modelo ("no pasa nada, es solo GitHub"), rompe 4 apps. Por eso este ADR es fundacional y se cita en el HANDOFF del core.

— Elaborado por GSG · 2026-07-12
