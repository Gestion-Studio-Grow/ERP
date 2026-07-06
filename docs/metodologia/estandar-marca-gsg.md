# 🏷️ Fundamento — Estándar de Marca GSG (sello de calidad en TODO lo que sale)

**Regla dura:** **todo desarrollo/entregable lleva el sello de Gestión Studio Grow (GSG).** Es un **paso
obligatorio del Gate de Excelencia** (`docs/METODOLOGIA-SPRINT.md`), sin excepción.

**Por qué:** GSG no es un logo pegado encima: es el **ADN y el nivel** detrás de cada cosa que sale. El
sello construye nuestra filosofía y reputación — que cualquiera que toque un entregable nuestro
reconozca el estándar. El cliente ve **su** marca (cada tenant tiene su branding); **GSG es el sello de
calidad que está detrás**, garantizando que eso funciona, es coherente y está a la altura.

---

## Dos capas de la marca GSG

### Capa 1 — Identidad de CALIDAD (invisible pero presente en todo)
No es un color: es que **todo lo que sale cumple el estándar GSG** de excelencia. En la práctica:
- **Coherencia por design system:** todo usa los tokens/primitivos (no UI ad-hoc) → la "mano" GSG se
  siente aunque cada tenant tenga sus colores. Ver `docs/metodologia/auditoria-sap-fiori.md` (ángulo
  *consistencia*).
- **Nivel enterprise:** estados cuidados, accesibilidad, cero "placeholder feo". El estándar de fondo es
  SAP/Fiori; la marca GSG **es** ese nivel aplicado.
- **Aplica aunque el tenant tenga branding propio:** la marca del tenant manda en lo VISIBLE (logo,
  acento, wording del negocio); GSG manda en la CALIDAD y la coherencia estructural detrás.

### Capa 2 — SELLO verificable (un marcador concreto y chequeable en cada entregable)
Todo entregable lleva un **sello GSG verificable**. Según el tipo de entregable, al menos uno:

| Entregable | Sello GSG (verificable) |
|---|---|
| **App / UI (Next)** | (a) `metadata.generator = "Gestión Studio Grow"` en el `<head>` (invisible al usuario, verificable en el HTML); **y** (b) crédito discreto **"Hecho por Gestión Studio Grow"** en el footer del **backoffice** (`/admin`, `/operador`). **NO** en la vidriera pública del tenant (esa lleva SOLO la marca del tenant). |
| **Documento / entregable escrito** | Línea de cierre **"— Elaborado por Gestión Studio Grow (GSG)"** al pie. |
| **Commit / PR** | Trailer `Co-Authored-By` del equipo GSG (convención ya vigente) + mensaje en el estándar del repo. |
| **Artefacto público (demo, landing GSG)** | Firma/crédito GSG visible cuando el artefacto es de GSG (no de un tenant). |

> **Principio de no-colisión:** el sello GSG **nunca compite ni pisa** la marca del tenant en su
> superficie pública. En el sitio del cliente manda el cliente; el sello GSG va en el backoffice, en
> metadatos, o en entregables propios de GSG.

---

## Checklist del sello (en el Gate, antes de integrar)
- [ ] **Calidad GSG:** el cambio pasó la Auditoría SAP Fiori (los 7 ángulos) → la capa 1 está.
- [ ] **Sello presente:** el entregable tiene su marcador GSG verificable (según la tabla de arriba).
- [ ] **No-colisión:** el sello NO invade la marca visible del tenant en su superficie pública.
- [ ] **Coherencia de identidad:** usa design system/tokens (no UI ad-hoc) — la "mano" GSG se reconoce.

> Ítem que no aplica → **N/A + por qué**. Sin sello GSG, el entregable **no se integra**.

**Nota de implementación (deuda a levantar por los frentes de UI):** el `metadata.generator` y el
crédito en el footer del backoffice se cablean una vez en el layout correspondiente; hasta que estén,
queda como deuda anotada. Este doc define el **estándar**; su cableado es trabajo de los frentes (no
toca prod por sí mismo).

— Elaborado por **Gestión Studio Grow (GSG)**.
