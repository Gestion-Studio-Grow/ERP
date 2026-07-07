# ADR-033: Regla de copia exacta ↔ auditoría — el front replicado se respeta; el backoffice pasa el Gate GSG completo

**Estado:** Aceptado (2026-07-06)
**Depende de:** Gate de Excelencia (`docs/METODOLOGIA-SPRINT.md`, `CLAUDE.md`)
**Relacionado:** ADR-034 (preset por IA / copiar exacto), ADR-028 (modelo de entrega)

---

## Contexto
Cuando el trabajo es una **réplica exacta de la vitrina de un cliente**, imponerle **nuestros** principios
de diseño (SAP Fiori) **rompería la fidelidad** — y la fidelidad **es el valor** que entregamos. Pero el
**backoffice** es **producto de GSG**, y ahí la excelencia es obligatoria. El Gate necesita saber en qué
modo aplica.

## Decisión
- **En RÉPLICA EXACTA del front del cliente**, la **Auditoría SAP Fiori + el sello GSG RESPETAN el diseño
  del front tal cual** — **no** le imponen nuestros principios. Los 7 ángulos se leen como **fidelidad al
  original + calidad técnica** (responsive no roto, CTAs/links, `alt`, a11y básica, performance), **no**
  como conformidad estética con GSG. **Aplica SOLO al FRONT** (la vitrina copiada).
- **El BACKOFFICE (producto GSG: `/admin`, `/operador`) NO tiene excepción:** pasa **SIEMPRE el Gate
  COMPLETO** (5 principios + accesibilidad + consistencia + sello GSG).
- **El sello GSG** en el front replicado va **solo en metadatos** (`metadata.generator`), **nunca visible**
  sobre la vitrina del cliente (no-colisión al extremo).

## Consecuencias
- **(+)** El cliente recibe **su identidad fiel** (copiar exacto = valor); GSG pone su excelencia **donde
  es suya** (el backoffice).
- **(−)** El auditor debe distinguir el **modo** (réplica vs producto GSG) antes de auditar; regla
  mnemotécnica: **front replicado → fiel al cliente; backoffice → estándar + sello GSG**.
- **Toca / documentado en:** `docs/metodologia/auditoria-sap-fiori.md` ("Excepción — réplica exacta") y
  `docs/metodologia/estandar-marca-gsg.md` ("Excepción en réplica exacta"). Enmienda el **alcance** del
  Gate descrito en `METODOLOGIA-SPRINT.md`/`CLAUDE.md`.

## Estado
**Aceptado.** Fundamento del proceso de copia exacta + auditoría, documentado en los dos docs del Gate.
