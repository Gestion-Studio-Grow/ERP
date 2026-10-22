@AGENTS.md

# GSG · ERP — normas de trabajo (versión corta)

Este archivo se carga en CADA llamada de CADA agente: por eso es corto. El texto completo, con el porqué de
cada norma, está en `docs/organizacion/normas-gsg-completas.md` (se lee cuando hace falta, no siempre).
Nada de lo que está acá abajo se derogó: sólo se resumió.

## Arranque (obligatorio)
- `npm run brain` → `brain/000-MAPA.md` (mapa derivado, barato). Lo que el mapa no trae: `docs/ESTADO-ACTUAL.md`.
- `git status` + tip de `main` y worktrees; migraciones de `prisma/migrations/` contra lo aplicado (según docs,
  sin golpear Neon), con colisiones de timestamp.
- Antes de tocar Prod/Deploy · Datos/DB · Multi-tenant · Seguridad: `docs/lecciones-aprendidas/registro.md`.
- Sectores: Agencia Digital → `docs/sectores/agencia-digital/FUNDAMENTO.md`; Agencia Grow → `docs/sectores/agencia-grow.md`.

## Autonomía
- Modo autónomo: **nada de `AskUserQuestion`** ni menús. Ante la duda, el criterio más simple y correcto,
  anotado, y seguir. Un dato faltante → placeholder «provisional a confirmar».
- Lo REVERSIBLE (código, docs, cableado, refactor tras flag) se decide y ejecuta; lo IRREVERSIBLE (deploy,
  Neon/DB, migraciones, secretos, permisos, marca de cliente, gasto) se arma y se eleva al dueño (ADR-048).

## Gates (no negociables)
- **Push a `main` = deploy a producción** (Vercel `erp-ch` construye cada push): sólo con orden del dueño.
- **Gate 2:** `prisma migrate deploy` a Neon se pausa y se reporta. Migraciones se escriben SIN aplicar, aditivas,
  y el código tolera su ausencia. Una migración en `main` sin aplicar frena todo deploy (`scripts/vercel-build.mjs`).
- **Neon free:** mínimas consultas a prod; analizar sobre schema/migraciones del repo.
- **Destructivo bloqueado:** force push, `reset --hard`, `migrate reset`, DROP, `rm -rf`.
- Commits por **pathspec explícito**, nunca `git add -A`. Secretos: los pega el dueño; nunca se imprimen.
- **DEMO → VENTA → INVERSIÓN:** no se gasta un peso (dominio, persistencia, APIs pagas) antes de la venta.

## Gate de Excelencia (antes de integrar)
1. Auditoría SAP Fiori 7 ángulos + ángulo argentino (criollo claro, ARCA, MP/transferencia, WhatsApp-first, a11y).
2. Sello GSG: `metadata.generator="Gestión Studio Grow"` + crédito en el footer del backoffice; trailer en commits.
3. Arquitectura: `tenantId`/`tenantTransaction`, RLS, capas, testabilidad, deuda anotada.
4. Confiabilidad: `tsc` + tests (+ build cuando se integra) verdes; aislamiento por tenant; no rompe prod.
Ítem que no aplica → N/A + por qué. Detalle: `docs/METODOLOGIA-SPRINT.md` → «GATE DE EXCELENCIA».

## Economía de tokens (obligatoria — método: `Factory-GSG/10-GOBIERNO/economia-de-tokens.md`)
- El costo es **releer contexto** (97 % medido el 22/10/2026), no generar. Todo se diseña para contexto chico.
- **Un agente = una tarea**, fresco, con brief ≤ 2 KB que apunta a `archivo:línea` o a un extracto; nunca
  «leé el diseño entero». No se retoma un agente terminado para otra tarea.
- **Techo de contexto:** al acercarse a ~150k tokens, el agente escribe un relevo de 1 página y termina.
- **Máximo 3 agentes pesados en simultáneo**; un frente a la vez hasta cerrarlo.
- Tests y `tsc` devuelven **sólo el resumen** (`n/n` y fallas), nunca logs completos al contexto.
- Integración mecánica (merge, tsc, suites) la hace el orquestador con scripts, no un agente.
- Certificación adversarial **sólo** en plata, seguridad, concurrencia y datos, sobre el diff; lo visual va
  con una revisión liviana.
- Informes de agentes: **≤ 300 palabras**, formato fijo (qué, verificación n/n, archivo:línea, pendientes).
- **Nada binario en Git** (mp4, png, pdf, ttf): Drive o almacenamiento de archivos.

## Modelo
Decisión del dueño (2026-09-23): Opus 5.5 en sesiones, células, subagentes y workflows. Detalle y
excepciones en las normas completas.

## Verificación y QA
`npm run gates` · `npx tsc --noEmit` · `node --import tsx --test <archivos>` · `npm run build` al integrar.
QA = recorrido clic por clic, no «que cargue». Kit visual: `DESIGN.md`, `.claude/rules/`; sin dependencias
nuevas sin preguntar; nunca correr de nuevo el instalador del kit.

## Normas completas (leer cuando el tema aparece)
`docs/organizacion/normas-gsg-completas.md`: modelo de células y `sprint` · concurrencia y prioridades P1/P2/P3 ·
Advisory + Challenger (ADR-045) · de-sesgo por sector (ADR-046) · retroalimentación (ADR-047) · Arquitecto de
Solución (ADR-048) · calibración de agentes (ADR-052) · pool de agentes (ADR-053) · variante objeto→asignación
(ADR-055) · preset IA con autorización del cliente · kit GSG.
