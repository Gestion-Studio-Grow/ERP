---
tipo: indice
generado: true
tags: [brain/indice, brain/metodologia]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🧰 Metodología — índice de playbooks y del Gate

> Recetas probadas del repo. **Antes de reinventar un flujo, fijate si ya hay una.** Esto es el
> índice: cada línea enlaza al playbook completo, que es donde está el método y su porqué.
> 🔒 = la norma lo marca obligatorio.

**El checklist del Gate, tildable:** [GATE-CHECKLIST.md](GATE-CHECKLIST.md) — copia literal de la fuente.

## Playbooks

- 🔒 **[Fundamento — Auditoría SAP Fiori + Ángulo Argentino ("Argentinizar SAP") (OBLIGATORIA, todos los ángulos)](../../docs/metodologia/auditoria-sap-fiori.md)** — ningún desarrollo se integra a `main` sin pasar la Auditoría SAP Fiori completa. Sin excepción, para todo frente/sector, desktop y móvil. Es un paso obligatorio del Gate de Excelencia […]
- **[Checklist de extracción — fuente por fuente + fallbacks ante muros conocidos](../../docs/metodologia/checklist-extraccion.md)** — que cualquier agente de extracción trabaje en el mismo orden y no redescubra los muros que ya conocemos. Cada muro tiene un fallback concreto y una provenance de salida. La regla madre: cuando una […]
- **[Método "COPIAR EXACTO" — replicar la vidriera real de un cliente, fiel al píxel](../../docs/metodologia/copiar-exacto-vidriera.md)**
- 🔒 **[Playbook — Demo pública a COSTO CERO (una URL viva por negocio)](../../docs/metodologia/demo-publica-costo-cero.md)** — el método probado para tener, en el día, una demo pública y navegable de cada negocio —cada uno con su propia URL— sin gastar un peso: sin dominio propio, sin plan pago de base de datos ni de […]
- **[️ Fundamento — Estándar de Marca GSG (sello de calidad en TODO lo que sale)](../../docs/metodologia/estandar-marca-gsg.md)** — todo desarrollo/entregable lleva el sello de Gestión Studio Grow (GSG). Es un paso obligatorio del Gate de Excelencia (`docs/METODOLOGIA-SPRINT.md`), sin excepción.
- **[Regla — Verificación de RENDER REAL antes de publicar (Gate visual)](../../docs/metodologia/gate-visual-render.md)**
- 🔒 **[Fundamento — GENERADOR DE PRESET POR IA (preventa/onboarding en minutos)](../../docs/metodologia/generador-preset-ia.md)** — la metodología transversal que eleva la adaptación manual de preventa (la que hicimos a mano con Magra: leer sus redes → armar tenant + blueprint) a un flujo donde la IA GENERA el preset del cliente […]
- **[Gobernanza del conocimiento (ADR/grafo) — ganchos al Gate y la retro](../../docs/metodologia/gobernanza-conocimiento-adr.md)** — los ganchos de gobernanza que mantienen VIVO el grafo de ADRs y evitan que el índice/dependencias deriven (RFC-001 §4 Etapa 1, riesgo R5). Atados a rituales que YA existen —el Gate (ADR-040) y la […]
- **[Material de Marca — schema (contrato de salida de la extracción)](../../docs/metodologia/material-de-marca-schema.md)**
- **[Metodología de SPRINT — 5 equipos disparados desde el móvil](../../docs/METODOLOGIA-SPRINT.md)** — el modelo canónico con el que Maxi dispara un sprint desde el móvil (Dispatch/Cowork) y el frente de IA lo ejecuta como 5 equipos en paralelo, cada uno en su git worktree aislado, todos sobre Gestión […]

## Registro de casos (6) — entrenamiento de la célula de extracción

- **[Registro de casos — entrenamiento constante de la célula de Extracción](../../docs/metodologia/registro-casos/README.md)** — el dueño ordenó entrenar este equipo caso a caso. Este directorio es la memoria operativa de la extracción: cada prospecto real deja una entrada con qué se extrajo, qué falló y qué se corrigió, y de […]
- **[Caso: A Dos Manos Pádel](../../docs/metodologia/registro-casos/adosmanos.md)**
- **[Caso: Break Point Pádel](../../docs/metodologia/registro-casos/breakpoint.md)**
- **[Caso: CH Estética](../../docs/metodologia/registro-casos/chestetica.md)**
- **[Heurísticas aprendidas — rollup del registro de casos](../../docs/metodologia/registro-casos/heuristicas-aprendidas.md)** — la destilación de los casos reales en reglas reutilizables. Cuando una heurística acá se vuelve estable, se promueve a `docs/metodologia/checklist-extraccion.md §3` (que es lo que el agente lee al […]
- **[Caso: MAGRA Meat Market](../../docs/metodologia/registro-casos/magra.md)**

---

Derivado de `docs/metodologia/` + `docs/METODOLOGIA-SPRINT.md` por `npm run brain`.
