# docs/arquitectura — Frente de Excelencia en Arquitectura

Frente **continuo** (no tarea puntual) del sector ERP: detectar → analizar → mejorar la arquitectura
del Core multi-tenant sin romper nada, con vallas (tsc/tests/build) antes de integrar y coordinando
con el PMO todo lo que toque cimientos.

## Documentos
- **[MAPA.md](./MAPA.md)** — foto estructural: capas, acoplamientos (hubs/hojas), god-files, límites de
  dominio y riesgos vivos con evidencia. La foto de **diseño** (complementa `ESTADO-ACTUAL.md`, que es la de **operación**).
- **[BACKLOG-MEJORAS.md](./BACKLOG-MEJORAS.md)** — mejoras priorizadas por impacto×(1/riesgo), con dueño y secuencia.

## Marco de evaluación
Se mide contra: separación de capas · límites de dominio (ADR-002/020) · testabilidad (ADR-026) ·
escalabilidad multi-tenant y RLS (ADR-001/018/023) · seguridad/aislamiento (línea roja, FUNDAMENTOS §3)
· mantenibilidad · y los principios de excelencia estilo **SAP/Fiori**: rol-based, coherente, simple,
adaptable, robusto enterprise. La visión rectora es `docs/FUNDAMENTOS-Y-VISION.md`; las decisiones, `docs/adr/`.

## Relación con otros docs (sin duplicar)
- `docs/ESTADO-ACTUAL.md` — estado operativo (main/prod/gates/tenants/migraciones). Este frente **no** lo reemplaza.
- `docs/PROXIMOS-PASOS.md` — cola de handoff de features. El backlog de acá es **deuda/mejora estructural**, no features.
- `docs/adr/` — decisiones. Cuando una mejora de acá exige decidir (ej. Float→Decimal), se promueve a ADR.

## Método de cada tanda
1. **DETECTAR** — relevamiento estático (exploradores read-only sobre `main`), delta desde la última foto.
2. **ANALIZAR** — evaluar contra el marco de arriba; clasificar por severidad y por si toca cimientos.
3. **MEJORAR** — implementar lo seguro (verde antes de commitear); lo grande/compartido → proponer y **secuenciar con PMO**.
4. **DOCUMENTAR** — actualizar MAPA + BACKLOG; ADR si corresponde. Reportar "qué detecté, qué analicé, qué mejoré".

## Bitácora
- **2026-07-06 — Iteración 1:** relevamiento inicial (3 exploradores: capas/acoplamientos · tenancy/RLS/seguridad ·
  testabilidad/deuda). Creados MAPA + BACKLOG. Mejora implementada: **M1 parte (a)** — dedup de las 4 copias
  idénticas de `round2` en `src/lib/round.ts` (cero cambio de conducta) + `round.test.ts`. La unificación
  POS↔fiscal en EPSILON (parte b / R4) se **eleva al PMO** por ser cambio de comportamiento de dinero. Sin
  tocar el WIP sin commitear de `main`.
