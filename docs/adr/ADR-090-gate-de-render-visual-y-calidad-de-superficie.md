---
id: ADR-090
nivel: fundacional
dominio: calidad
depends_on: [ADR-040, ADR-079, ADR-044]
---

# ADR-090 — Gate de render visual + calidad de superficie del cliente ("lo cosmético es crítico")

**Estado:** Aceptada (regla del dueño, 2026-07-12) · **Depende de:** ADR-040 (Gate de Excelencia obligatorio), ADR-079 (gate UX/UI de craft mundial, 7 lentes), ADR-044 (argentinizar SAP · contraste/accesibilidad) · **Relacionado:** ADR-069/072 (norte de diseño).

> Numeración provisional — verificar colisión al mergear (regla de timestamps de CLAUDE.md aplicada a ADRs; otras sesiones podrían haber tomado números 081 en adelante).

## Contexto

Teníamos **`tsc` + tests + build verdes** y aun así **el login estaba roto en producción**. La causa: "verificábamos" las pantallas por **DOM** (que el elemento exista en el árbol), no por **render real** (que la página se vea y funcione en un navegador). El DOM puede estar perfecto y la página verse rota o ilegible: CSS que no cargó, contraste bajo el umbral, layout colapsado, un control tapado.

La regla del dueño, textual:

> **"Lo que es cosmético para el cliente es crítico."**

Una corrida de gate visual sobre las superficies del cliente encontró **324 defectos**: **191 de contraste** + **133 de touch target**. Un hallazgo revelador: **`--text-faint` estaba por debajo de AA *por diseño*** — el token de "texto tenue" se había definido con un contraste insuficiente, así que cada uso "correcto" del token producía texto ilegible. No era un bug puntual sino una decisión de sistema mal calibrada.

Trampa documentada en el camino: **colisión `--spacing-*` ↔ `max-w-*` en Tailwind v4** — la escala de densidad (`--spacing`) hijackea `max-w-sm/md/lg/xl`, colapsando el layout a "una palabra por línea". Ante un layout roto, **sospechar de esto antes que de "el CSS no cargó"**.

## Decisión

1. **Ninguna página se publica sin RENDER REAL.** El gate levanta la app y la mira en un navegador headless (Playwright / preview), no solo inspecciona el DOM. Espera **salud http + css** (no solo que el puerto responda) antes de auditar.
2. **Gate visual + contraste AA son BLOQUEANTES** y se suman al Gate de Excelencia (ADR-040) y a las 7 lentes de ADR-079: si una página se ve rota o ilegible, **el gate falla** aunque `tsc`/tests/build estén verdes.
3. **Contraste AA sobre las 4 superficies tematizadas** (temas claro/oscuro, por tenant, DB-backed): el gate corre contra los temas reales, no contra un default. Los **tokens son la ley** — un token que produce texto bajo AA es un bug del token, no del uso.
4. **Touch targets**: pisos duros (44px) verificados en el render, no asumidos.
5. **La verificación es responsabilidad del que publica**, no del dueño: se comparte **evidencia** (screenshot/medición), nunca "andá y fijate".

## Consecuencias

**Habilita:** confianza real en "está verde" — verde ahora incluye "se ve y funciona"; detección temprana de regresiones cosméticas que antes llegaban a prod; una vara de calidad de superficie coherente con "argentinizar SAP" (claridad para la pyme, no jerga ni pantallas rotas).

**Costo / operación:** el gate visual es más lento que `tsc` (levanta app + navegador). Mata el árbol de procesos al terminar (evita zombies). El **lint de `main` ya venía rojo** por deuda pre-existente — el gate visual **no** depende del lint (son ejes distintos).

**Deuda:** los 324 defectos se trabajan por tanda; `--text-faint` y los tokens bajo AA se recalibran en el sistema de diseño (no parche por pantalla). El gate corre en runtime local con pglite para no golpear prod.

— Elaborado por GSG · 2026-07-12
