# 🎨 Catálogo de assets de diseño — plantillas de referencia GSG

> **Qué es:** el inventario vivo de las **plantillas de diseño aprobadas** que materializan el enfoque de
> **[ADR-072](../../adr/ADR-072-enfoque-de-diseno.md)** (Apple×SAP · sistema tematizable · backoffice "Fable"
> congelado). Cada asset tiene **rol** (backoffice / frontend), **estado** (aprobado-congelado / referencia) y
> **ubicación** (ruta real en el repo, o "pendiente de aportar" con su carpeta destino).
>
> **Regla:** el backoffice **Fable** (claro + oscuro) está **CONGELADO** (ADR-072 §3) — no se toca sin un ADR
> que lo reemplace. Los frontends son **referencia** re-tematizable por `--accent` + ficha de marca (RFC-004).
>
> **Carpeta canónica de los HTML de referencia:** `docs/estrategia/diseno/assets/`.

---

## Estado de verificación (2026-07-10)

Se buscaron los 6 HTML por nombre y por keyword en toda la rama fundacional. **La mayoría NO está commiteada
con el nombre/rol que el dueño describe.** Leyenda: ✅ en repo (ruta confirmada) · ⚠️ candidato parcial en otra
ruta (a confirmar que es EL aprobado) · 🔴 falta (pendiente de aportar).

| # | Asset | Rol | Estado aprobación | En el repo | Ruta / carpeta destino |
|---|---|---|---|---|---|
| 1 | **Backoffice Fable — claro** | Backoffice | ✅ **APROBADO · CONGELADO** | 🔴 **falta** | → `docs/estrategia/diseno/assets/fable-backoffice-claro.html` |
| 2 | **Backoffice Fable — oscuro** | Backoffice | ✅ **APROBADO · CONGELADO** | 🔴 **falta** | → `docs/estrategia/diseno/assets/fable-backoffice-oscuro.html` |
| 3 | **Tema A "Editorial" (Almacén Nuevo)** | Frontend/tienda | Referencia | 🔴 **falta** | → `docs/estrategia/diseno/assets/frontend-tema-a-editorial.html` |
| 4 | **Tema B "Nítido" (Bazar Central)** | Frontend/tienda | Referencia | 🔴 **falta** | → `docs/estrategia/diseno/assets/frontend-tema-b-nitido.html` |
| 5 | **Front MAGRA — "Esto no es una carnicería"** | Frontend/tienda | Referencia | ⚠️ **candidato** | `docs/artefactos/magra-preview.html` · `ch-estetica-mockups/magra-front-claro.html` |
| 6 | **Réplica MAGRA — "Boutique de carnes envasadas al vacío · Canning"** | Frontend/tienda | Referencia | ⚠️ **candidato** | `ch-estetica-mockups/magra-back-oscuro.html` (a confirmar) |

---

## 🔴 Faltan (pendiente de aportar por el dueño / equipo de diseño)

Estos HTML **no están en el repo** y el dueño ofreció conseguirlos. Al recibirlos, van a la carpeta canónica
`docs/estrategia/diseno/assets/` con el nombre de la columna "Ruta destino":

1. **`fable-backoffice-claro.html`** — el backoffice Fable variante clara (ganadora, congelada).
2. **`fable-backoffice-oscuro.html`** — el backoffice Fable variante oscura (ganadora, congelada).
3. **`frontend-tema-a-editorial.html`** — Tema A "Editorial", ejemplificado con "Almacén Nuevo".
4. **`frontend-tema-b-nitido.html`** — Tema B "Nítido", ejemplificado con "Bazar Central".

> **Nota (búsqueda):** "Fable", "Almacén Nuevo" y "Bazar Central" dan **0 coincidencias** como plantillas HTML en
> la rama fundacional (`be99865`). "Fable" solo aparece en `docs/metricas/costo-uso-factory.md` (refiere al
> modelo, no al backoffice). Por eso 1–4 se catalogan como faltantes.

## ⚠️ Candidatos MAGRA a confirmar (existen, pero hay que validar que son LOS aprobados)

- **Front MAGRA:** `docs/artefactos/magra-preview.html` contiene el copy **"Esto no es una carnicería"** →
  candidato fuerte al asset #5. También `ch-estetica-mockups/magra-front-claro.html`.
- **Réplica MAGRA (backoffice/boutique):** `ch-estetica-mockups/magra-back-oscuro.html` es el candidato al #6;
  el copy "Boutique de carnes envasadas al vacío · Canning" vive hoy como **texto** en
  `docs/metodologia/registro-casos/magra.md` y `docs/metodologia/material-de-marca-schema.md`, no como HTML de
  réplica confirmado.

**Acción:** el dueño confirma si estos candidatos son los aprobados (y si hay que **moverlos/renombrarlos** a
`docs/estrategia/diseno/assets/`) o si aporta los HTML definitivos. Hasta esa confirmación quedan como
**candidatos**, no como assets aprobados.

## Mockups históricos relacionados (no son los 6 aprobados)

Existen en `ch-estetica-mockups/` otros HTML de exploración (temas `1-ledger`, `2-atelier`, `3-nocturne`,
`4-horizon`, `5-grid`, variantes `nocturne-*`). Son **exploraciones previas de CH**, útiles como historia de
diseño, **no** el set aprobado de ADR-072. No confundir.

---

## Cómo se usa este catálogo

- **Antes de diseñar una pantalla nueva:** mirá el asset de su rol (backoffice → Fable; tienda → Tema A/B o la
  ficha del tenant) y respetá tokens + norte Apple×SAP (ADR-072). No inventes un patrón por pantalla.
- **Al aprobar un asset nuevo:** se agrega una fila acá con estado y ruta, y —si cambia el patrón de backoffice—
  **requiere un ADR** (ADR-072 §3, Fable congelado).
- **El Gate de Excelencia (ADR-040)** audita las pantallas contra estos assets y contra ADR-072.

— Elaborado por GSG (Diseño & Marca)
