@AGENTS.md

## Arranque de sesión — OBLIGATORIO SIEMPRE (regla de alto nivel)

**Toda sesión de trabajo sobre este proyecto debe EMPEZAR por revisar el estado del repo para una
gestión correcta del proyecto.** Es obligatorio siempre, en Claude Code (desktop) y en Dispatch
(móvil), se use o no el comando `sprint`. Antes de tocar nada, revisá como mínimo:

- **`docs/ESTADO-ACTUAL.md`** — la foto viva del sistema (main/prod, tenants, gates, migraciones,
  bugs conocidos, core→sesión). Si no existe o está desactualizada, **actualizala primero**.
- **`git status`** + tip de `main` y ramas/worktrees — WIP sin commitear y en qué estado está el árbol.
- **Migraciones pendientes** — `prisma/migrations/` vs lo aplicado (según docs; no golpear Neon),
  incluidas **colisiones de timestamp**.

Sin esa foto no se despacha ni se ejecuta nada. Cuando la sesión se abre con `sprint`, esto es su
**FASE 0 Exploración** (Paso 0 no salteable en `.claude/commands/sprint.md`); cuando no, igual aplica.

**Playbooks reutilizables (`docs/metodologia/`):** métodos probados con el *por qué* de cada paso; antes
de reinventar un flujo, fijate si ya hay receta. Índice en `docs/METODOLOGIA-SPRINT.md → Playbooks
operativos`. Obligatorios/transversales: **🤖 Generador de PRESET por IA**
(`docs/metodologia/generador-preset-ia.md`) — todo alta de cliente nuevo: **🔒 autorización primero**
(pedir y REGISTRAR el OK explícito del cliente para replicar su marca, como con Magra; sin ella no se
genera ni se muestra), luego **el cliente da su red social y/o web → los agentes extraen todo (rubro,
identidad, catálogo, ofertas, historia, contacto) y generan la preventa experta = el preset** (tenant+blueprint+branding+datos demo+probador). **Gate
bloqueante no negociable: generar → auditar por TODA la metodología (SAP + GSG + Arquitectura +
Confiabilidad) → recién ahí mostrar; sin Gate NO se muestra al cliente.** PoC: Break Point desde
Instagram, Magra desde su web; coordina con Célula 3 ·
**Demo pública a costo cero** (`docs/metodologia/demo-publica-costo-cero.md`).

**Estructura de la compañía — TRES unidades bajo Gestión Studio Grow (estudio paraguas):** (1) **ERP
multi-tenant** (producto SaaS core); (2) **Agencia Digital** (satélite del ERP: lo vende y le suma
features; `docs/sectores/agencia-digital.md`); (3) **Agencia Grow** (los **negocios propios del grupo**,
NO satélite del ERP; `docs/sectores/agencia-grow.md`). Regla: gira alrededor del ERP → Digital; negocio
propio del grupo → Grow. Ver `docs/ESTADO-ACTUAL.md §7`.

**Sesiones del sector AGENCIA DIGITAL — Fase 0 adicional (obligatoria):** si la sesión trabaja en el
sector Agencia Digital, **antes de nada leé `docs/sectores/agencia-digital/FUNDAMENTO.md`** — define
quién sos (Consultor Experto / Desarrollador / PMO del sector), qué tenés que hacer, con qué método y
con qué objetivo. Después seguí con el charter (`docs/sectores/agencia-digital.md`) y el último análisis
de mercado (`docs/sectores/agencia-digital/analisis-mercado/`).

**Sesiones de AGENCIA GROW — Fase 0 adicional (obligatoria):** si la sesión trabaja en negocios propios
del grupo (Panel del Dueño, cartera propia), **antes de nada leé `docs/sectores/agencia-grow.md`**.

## Política de modelos — ECONOMÍA por defecto (vigente)

**Modo por defecto ACTIVO: economía.** El default del proyecto es **Sonnet 5** (`claude-sonnet-5`, fijado
en `.claude/settings.json`): se usa para la **mayoría del trabajo** (implementación acotada, docs, UI de
rubro, tests, exploración, provisioning rutinario). **Opus 4.8** (`claude-opus-4-8`) se reserva **solo
para lo que lo amerita**: arquitectura/diseño de sistema, seguridad, dinero/fiscal, metodología/gobernanza,
auditorías de excelencia críticas y decisiones de alto juicio o riesgo (algo irreversible o que toca
prod/Neon/deploy). Criterio: *¿un error acá es caro/difícil de revertir o requiere criterio experto de
sistema?* Sí → Opus; no (la mayoría) → Sonnet. Comandos: **`/economia`** (default, Sonnet) y **`/boost`**
(todo en Opus, para sprints críticos) — ver `.claude/commands/economia.md` y `.claude/commands/boost.md`.
Coherente con la prioridad de **costo sobre velocidad** del dueño.

**🛡️ EXCEPCIÓN DURA, NO NEGOCIABLE:** la **Auditoría GSG** —el **Gate de Excelencia completo** (Auditoría
SAP Fiori en TODOS sus ángulos + sello/estándar GSG)— corre **SIEMPRE en Opus 4.8**, sin excepción,
**incluso en modo `economia`**. El resto puede ir en Sonnet 5, pero el control de calidad GSG **nunca se
degrada de modelo**: al llegar al paso de auditar/aprobar un entregable (incluidos los presets del
generador por IA), se escala a Opus para la auditoría. Auditar con un modelo degradado sería ahorrar
justo donde no se debe.

## Modo de trabajo autónomo

Las sesiones corren en modo autónomo. No usar `AskUserQuestion` ni ningún prompt/menú interactivo. Ante cualquier duda, asumir el criterio más simple y correcto, dejar el supuesto anotado y seguir sin frenar. Reportar todo por texto.

## Gate de Excelencia — OBLIGATORIO, NO SALTEABLE (regla de alto nivel)

**Ningún cambio se integra ni se pushea a `main` sin pasar el GATE DE EXCELENCIA.** Aplica a **toda
sesión/frente de ambos sectores**, desktop y móvil. Es adicional a "verde antes de commitear"
(tsc+build+test), no lo reemplaza. Son **4 bloques; los bloques 1 y 2 son OBLIGATORIOS SIN EXCEPCIÓN en
TODO desarrollo.** Checklist corto que cada frente tilda **antes de pushear**:

1. **🔎 AUDITORÍA SAP FIORI — completa y obligatoria (7 ángulos):** rol-based · coherente · simple ·
   adaptable (responsive + branding por tenant) · delightful/enterprise · **accesibilidad** (labels
   reales/ARIA/`role="alert"`/teclado/contraste) · **consistencia** (no duplica patrones existentes).
   Ningún cambio se integra sin pasarla. Fundamento: `docs/metodologia/auditoria-sap-fiori.md`.
2. **🏷️ SELLO DE MARCA GSG — obligatorio en todo entregable:** todo lo que sale lleva el ADN/nivel de
   Gestión Studio Grow. Sello verificable: app → `metadata.generator="Gestión Studio Grow"` + crédito
   discreto en el footer del **backoffice** (no en la vidriera del tenant); doc → firma "— Elaborado por
   GSG"; commit → trailer del equipo GSG. El tenant conserva SU marca visible; GSG es el sello de calidad
   detrás. Fundamento: `docs/metodologia/estandar-marca-gsg.md`.
3. **Excelencia Arquitectura:** capas/límites de dominio · testabilidad · escalabilidad multi-tenant
   (predicado `tenantId` / `tenantTransaction`) · seguridad/RLS (no evade aislamiento) · deuda anotada.
4. **Confiabilidad de Producción:** `tsc`+`build`+`test` verdes · aislamiento por tenant · manejo de
   errores · no rompe prod (schema = migración SIN aplicar, Gate 2).

Ítem que no aplica → **N/A + por qué**. Si no tilda los **4 bloques**, **no se integra**. Detalle completo
en `docs/METODOLOGIA-SPRINT.md` → "GATE DE EXCELENCIA" (checklist para el handoff de PR/commit).

## Autorización y gates (política push-libre)

- **Autónomo hasta GitHub:** código → build → `tsc`/verificación → **gate de excelencia** → commit → **push a `main` (GitHub)** sin re-preguntar. GitHub es el destino por defecto de todo el trabajo.
- **Gate 1 — deploy a producción/Netlify:** el auto-publish de Netlify está apagado (`stop_builds`), así que el push a `main` **no publica ni gasta créditos**. Publicar en producción requiere OK explícito de Maxi (*"deployá"*). Ver `docs/METODO-ROLES.md` §4.
- **Gate 2 — `prisma migrate deploy`:** cambiar la estructura de la DB de producción (Neon) se **pausa y se reporta**; no se corre solo. Es lo único irreversible.
- **Neon en PLAN GRATUITO — cuidá el consumo:** minimizá conexiones y queries contra la DB de prod, evitá operaciones pesadas / escaneos completos / benchmarks contra prod, cuidá el compute time y el límite de horas del plan free. Para análisis o pruebas, leé schema/migraciones del **repo** (`prisma/schema.prisma`, `prisma/migrations/`) en vez de golpear la base real salvo que sea imprescindible.
- **Destructivo bloqueado** por config (force push, `reset --hard`, `migrate reset`, DROP, `rm -rf`).

