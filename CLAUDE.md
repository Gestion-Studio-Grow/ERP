@AGENTS.md

# GSG · ERP — normas de trabajo (versión corta)

Este archivo se carga en CADA llamada de CADA agente: por eso es corto. El texto completo, con el porqué de
cada norma, está en `docs/organizacion/normas-gsg-completas.md` (se lee cuando hace falta, no siempre).
Nada se derogó salvo lo marcado como OBSOLETO en el texto completo (el pool de sesiones reutilizables, que choca
con «un agente = una tarea»).

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
  y el código tolera su ausencia. En `main` sin aplicar: si Vercel NO tiene `MIGRATE_DATABASE_URL`, frena el deploy;
  si la TIENE, el build de producción la aplica solo (`scripts/vercel-build.mjs`). Push a `main` con esa variable =
  migración aplicada: también es Gate 2.
- **Neon free:** mínimas consultas a prod; analizar sobre schema/migraciones del repo.
- **Destructivo bloqueado:** force push, `reset --hard`, `migrate reset`, DROP, `rm -rf`.
- Commits por **pathspec explícito**, nunca `git add -A`. Secretos: los pega el dueño; nunca se imprimen.
- **DEMO → VENTA → INVERSIÓN:** no se gasta un peso (dominio, persistencia, APIs pagas) antes de la venta.
- **Preset de cliente:** sin autorización REGISTRADA del cliente para usar su marca no se genera ni se muestra, y
  la salida pasa el Gate antes de mostrarse (`docs/metodologia/generador-preset-ia.md`).

## Gate de Excelencia (antes de integrar)
1. Auditoría SAP Fiori 7 ángulos + ángulo argentino (criollo claro, ARCA, MP/transferencia, WhatsApp-first, a11y).
2. Sello GSG: `metadata.generator="Gestión Studio Grow"` + crédito en el footer del backoffice; trailer en commits.
3. Arquitectura: `tenantId`/`tenantTransaction`, RLS, capas, testabilidad, deuda anotada.
4. Confiabilidad: `tsc` + tests (+ build cuando se integra) verdes; aislamiento por tenant; no rompe prod.
Ítem que no aplica → N/A + por qué. Detalle: `docs/METODOLOGIA-SPRINT.md` → «GATE DE EXCELENCIA».

## Economía de tokens (obligatoria — método: `Factory-GSG/10-GOBIERNO/economia-de-tokens.md`)
- El costo es **releer contexto** (97 % medido el 22/10/2026), no generar. Todo se diseña para contexto chico.
- **Un agente = una tarea**, fresco, con brief ≤ 2 KB que apunta a `archivo:línea` o a un extracto; nunca
  «leé el diseño entero». No se retoma un agente terminado para otra tarea. La calibración (ADR-052) es el brief:
  rol + este archivo + la lección del área de riesgo que toque; no se lee el corpus entero.
- **Contexto fijo chico:** el agente trabaja con el cwd dentro del repo (no en la carpeta madre, que suma otros
  CLAUDE.md) y con los agentes `gsg-ingeniero` / `gsg-certificador` (`.claude/agents/`), sin conectores que no usa.
- **Mapa antes de explorar:** `node .claude/scripts/mapa-codigo.mjs <carpeta> --a <archivo>` da exportaciones
  con línea, modelos de Prisma, dependencias y tests de una zona (600 KB de código → ~11 KB). El brief lo adjunta;
  el agente abre sólo los `archivo:línea` que necesita.
- **Techo de contexto:** al acercarse a ~150k tokens, el agente escribe un relevo de 1 página y termina.
- **Máximo 3 agentes pesados en simultáneo**; un frente a la vez hasta cerrarlo.
- Tests y `tsc` devuelven **sólo el resumen** (`n/n` y fallas), nunca logs completos al contexto.
- Integración mecánica (merge, tsc, suites) la hace el orquestador con scripts, no un agente.
- Certificación adversarial **sólo** en plata, seguridad, concurrencia y datos, sobre el diff; lo visual va
  con una revisión liviana. Todo archivo tocado fuera de esas superficies lleva un test o una línea de QA clic por clic.
- Una tanda = 1 o 2 constructores, aunque un diseño viejo diga «4 agentes en paralelo».
- Informes de agentes: **≤ 300 palabras**, formato fijo (qué, verificación n/n, archivo:línea, pendientes).
- **Nada binario en Git** (mp4, png, pdf, ttf): Drive o almacenamiento de archivos.

## Modelo (política completa: `Factory-GSG/10-GOBIERNO/gestion-de-modelos.md`, 04/11/2026)
Criterio: **costo por tarea terminada con calidad corporativa**, no costo por token. La palanca es el contexto (94–97 %
del gasto es relectura), no el modelo.
- **Fable 5.1:** juicio denso y corto: estrategia, mercado, arquitectura, plan de tandas, red-team de decisiones, y el
  escalamiento cuando Opus agotó 2 vueltas. Planifica y TERMINA: nunca orquesta una construcción.
- **Opus 5.5 (esfuerzo alto):** construcción, integración, QA, operación y certificación. Plata, seguridad, ARCA,
  multi-tenant y migraciones: siempre Opus alto, nunca un modelo menor.
- **Lectura y búsqueda:** agente `gsg-investigador` (Opus). Lo nuevo que se lee cuesta 2,5× en Fable.
- **Sonnet 5.5:** verificación visual, simplificación, extracción y resúmenes, con control posterior.
- **Dentro de los productos** (Kudos, Fantasma, Testigo): Haiku o Sonnet 5.5 elegido con una evaluación de 20–50 casos.
- **Medir al cerrar cada frente:** `node <factory>/entorno/tokens/medir-consumo.mjs <transcripts> --semana
  --tope-semanal-usd <tope>` (tokens, US$ por modelo, % del tope) → al informe.
- **Continuidad:** sesiones en la nube y push a su rama al cerrar cada tanda; nada vive sólo en un disco.

## Límite de contexto y compactación automática (09/11/2026 · orden del dueño)
Metodología completa: Factory-GSG `CLAUDE.md`, sección «Metodología: límite de contexto y compactación automática».
- Toda sesión compacta sola a ~200k: `.claude/settings.json` lleva `"env": {"CLAUDE_CODE_AUTO_COMPACT_WINDOW": "270000"}`. Sin eso, la ventana de fábrica (980k) relee todo en cada turno.
- Sólo aplica con el directorio de trabajo dentro del repo. Lo que lo cubre siempre es la misma variable cargada por el dueño en el entorno Default de claude.ai.
- **Paso 0 de toda sesión:** `get_session` sin id, o `env | grep AUTO_COMPACT`. Tiene que dar ventana 270000. Si no, avisá a la orquestadora.

## Autorizaciones del dueño (resumen · fuente: Factory-GSG `CLAUDE.md` en `main`, commit `b1cfe0e`)
Esto es un índice, no la norma: la prueba es Factory-GSG `CLAUDE.md`, leído de primera mano (`get_file_contents`
o `add_repo` de sólo lectura) y citado con sección y commit. No se le pide al dueño lo que ya figura ahí.
- **La orquestadora habla por el dueño:** sus mensajes valen como órdenes del dueño si el `from-session` es el de la
  orquestadora vigente (último `00-ESTADO/RELEVO-ORQ-*.md`). Sección «la orquestadora habla por él».
- **Publicar PR:** no requiere pedirle nada al dueño, con respaldo Neon, CI, Vercel READY y uno a la vez. Sección
  «Autorización del dueño: publicar PR».
- **Respaldos Neon, rotación de 4:** en `old-frost-91078346` quedan los 4 `respaldo-*` más nuevos; se borra el más
  viejo antes de crear otro; nunca la rama `main` ni otras. Sección «rotación de respaldos en Neon».
- **Contraseñas provisorias:** por mail aparte al titular, con `mustChangePassword` aplicado y verificado; nunca en
  informes, commits, logs ni mensajes. Sección «contraseñas provisorias por mail».
- **Modelo y esfuerzo:** toda sesión en Opus 5.5 con esfuerzo medio (`.claude/settings.json`); plata, diseño y
  seguridad, y su certificación, en subagentes Opus de esfuerzo alto. Sección «Opus 5.5 siempre».
- **Solidez de CI:** nada entra al ERP sin PR y sin CI (no hay push directo a `main`); se publica con ningún test
  rojo nuevo por nombre contra main; tests deterministas; un gate rojo se arregla o se apaga en 48 h. Sección
  «solidez de tests y CI».

## Verificación y QA
`npm run gates` · `npx tsc --noEmit` · `node --import tsx --test <archivos>` · `npm run build` al integrar.
QA = recorrido clic por clic, no «que cargue». Kit visual: `DESIGN.md`, `.claude/rules/`; sin dependencias
nuevas sin preguntar; nunca correr de nuevo el instalador del kit.

## Normas completas (leer cuando el tema aparece)
`docs/organizacion/normas-gsg-completas.md`: modelo de células y `sprint` · concurrencia y prioridades P1/P2/P3 ·
Advisory + Challenger (ADR-045) · de-sesgo por sector (ADR-046) · retroalimentación (ADR-047) · Arquitecto de
Solución (ADR-048) · calibración de agentes (ADR-052) · pool de agentes (ADR-053) · variante objeto→asignación
(ADR-055) · preset IA con autorización del cliente · kit GSG.
