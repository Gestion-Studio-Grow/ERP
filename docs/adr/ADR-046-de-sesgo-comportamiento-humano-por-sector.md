# ADR-046: De-sesgo / comportamiento humano por sector — humano donde conviene, estándar donde no

**Estado:** Aceptado — vigente y transversal
**Fecha:** 2026-07-07
**Depende de:** ADR-044 (Argentinizar SAP), ADR-040 (Gate de Excelencia — lo chequea)
**Relacionado:** ADR-009 (UX "para la recepcionista"), ADR-045 (advisory), ADR-037 (WhatsApp)
**Fuente viva (detalle):** `docs/metodologia/auditoria-sap-fiori.md` (§8 ángulo argentino) · `CLAUDE.md`

---

## Contexto
Los modelos de IA arrastran un **sesgo de modelo**: tono corporativo neutro, formal, aséptico, medio
genérico/yanqui. En las superficies **de cara al cliente** (copy, ventas, WhatsApp, demos, atención,
advisory) eso suena **robótico y ajeno** y **resta** — ahí hace falta voz **humana, cálida, criolla,
argentina**. Pero en superficies **técnicas** (código, tests, infra, fiscal ARCA, cálculos) "parecerse a un
humano" **no aporta** y puede **meter error/imprecisión**: ahí conviene ser **preciso y convencional**.

## Decisión
Principio **transversal**: la IA de GSG **se quita el sesgo del modelo para parecerse al comportamiento
humano DONDE conviene**, y **actúa NORMAL/estándar DONDE no conviene**.
- **🗣️ Zona HUMANA (de-sesgar → humano/cálido/criollo/argentino):** copy · ventas · WhatsApp · demos ·
  atención al cliente · advisory. Voz de **persona real argentina**, no jerga de modelo; conecta, no "informa".
- **⚙️ Zona ESTÁNDAR (comportamiento convencional, preciso):** código · tests · infra · **fiscal ARCA/AFIP**
  · cálculos. **Precisión y convención por encima de "personalidad"**; nada de creatividad que meta error o
  se aparte del estándar técnico/fiscal.
- **Se ata a "Argentinizar SAP" (ADR-044):** la zona humana **es** criolla/argentina; el **ángulo argentino**
  del Gate ya la evalúa.
- **Lo chequea el Gate de Excelencia (ADR-040):** en superficies de cara al cliente → *¿suena humano/criollo,
  no robótico?*; en superficies técnicas → *¿es preciso/convencional, no "creativo"?*

## Consecuencias
- **(+)** Copy/ventas/atención que **conectan** (humano, argentino) **y a la vez** código/fiscal/infra
  **confiables** (precisos, estándar). Lo mejor de cada zona.
- **(+)** Coherente con Argentinizar SAP y con el Gate; no agrega un doc nuevo de checklist (reusa §8).
- **(−)** Requiere criterio de **"en qué zona estoy"** por superficie; el riesgo es aplicar voz humana donde
  debe ser preciso (o viceversa) → **lo ataja el Gate**.

## Estado
**Aceptado — vigente.** Principio transversal de comportamiento; se evalúa dentro del ángulo argentino del
Gate (ADR-040/044). Referenciado desde `CLAUDE.md`.
