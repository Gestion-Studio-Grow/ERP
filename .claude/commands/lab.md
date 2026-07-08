---
description: Frente GSG Lab — carga el contexto y el pipeline del lab, abre el hub de demos como Artifact de Claude (bajo /lab) y sigue el procedimiento canónico del laboratorio.
---

Sos una sesión del frente **GSG Lab** (Laboratorio de Negocios Digitales). Alias: `/gsg-lab`. Al invocar `/lab`:

## (a) Cargá el CONTEXTO y el PIPELINE del lab (FASE 0 del lab)
Leé, en este orden, la fuente de verdad del repo (no de memoria):
1. **`celula-negocios-digitales/PROCEDIMIENTO-LAB.md`** — el procedimiento canónico completo (pipeline, caza,
   filtro de costo, estándar de demo, 2 listas, radar/status).
2. `celula-negocios-digitales/GSG-LAB.md` — constitución + roster + invariantes + enfoque desregulación.
3. `celula-negocios-digitales/MOTOR-SPRINT-CICLICO.md` — motor cíclico + fuente primaria de vetas + pipeline.
4. `celula-negocios-digitales/PORTFOLIO-Y-RECOMENDACION.md` + `STATUS-NEGOCIOS.md` — las **2 listas** (alto
   beneficio + sustentables costo-0/bajo).
5. Anexo `docs/estrategia/prompts-arranque-gsg-lab.md` + preámbulo genérico `docs/estrategia/prompts-arranque-sprint.md`.
Después **calibrá (ADR-052)**: 3–5 bullets de principios + zona de de-sesgo (ADR-046).

## (b) Abrí la APP — el HUB de demos como Artifact de Claude
El **hub navegable de GSG Lab** enlaza los demos bajo `/lab` (Plantillería, Postora, y cualquiera nuevo) y se
abre como **Artifact de Claude** (página privada en claude.ai). Cómo se dispara:
- **Si ya hay un hub publicado** (URL de artifact conocida en el repo/handoff): **redeployá a ESA misma URL**
  (tool `Artifact` con el parámetro `url`), no crees uno nuevo — así conserva su dirección.
- **Si no existe todavía:** **generá el hub** — escribí un `hub-lab.html` autocontenido (índice navegable con
  **una tarjeta por producto** → cada tarjeta abre su **demo funcional completa**; badge de estado por producto:
  🟢 listo · 🟡 en curso · 🔵 seleccionado sin construir · 🔴 espera §C) y publicalo con la tool **`Artifact`**
  (`file_path` = ese html, `favicon` 🧪, título "GSG Lab — Hub de demos"). Queda **privado por defecto**; el
  dueño decide compartir.
- **Estándar de producto (no negociable):** cada demo del hub es **funcional completa end-to-end** y vive
  **bajo `/lab/<producto>`**, **nunca en URL suelta** (ADR-028/029/030/031). El Artifact es la **superficie de
  revisión rápida**; la app real sirve las demos bajo `/lab`.
- **Honestidad:** el hub muestra SOLO lo que existe de verdad en el repo; lo no construido va como 🔵/🔴, no
  como demo falsa.

## (c) Seguí el PROCEDIMIENTO CANÓNICO del lab
**Pipeline:** Generar → Rankear (2 listas) → **SELECCIONAR (decisión del dueño, Accountable RACI ADR-049)** →
construir **demo funcional completa bajo `/lab`** → **Gate de Excelencia (ADR-040)** → publicar (**deploy = §C
del dueño**). **Enfoque de caza:** oportunidades en las **desregulaciones** (Boletín Oficial + Ministerio de
Desregulación) como fuente primaria de vetas. **Filtro de costo:** solo costo-0 real o bajo costo (construir Y
operar). **Status** con `/status`.

Nada se publica/deploya, ni se cargan secretos, ni se cobra, sin **§C del dueño**. Reversible se ejecuta; lo
irreversible se **eleva**. — Elaborado por GSG.
