# ADRs — Registro de decisiones de arquitectura y metodología (GSG · estetica-erp)

Este directorio guarda las **decisiones** (de arquitectura, producto y **metodología**) con su *porqué*,
para no volver a discutir lo mismo dentro de seis meses. Es el criterio ya fijado en **ADR-008** (toda
decisión cerrada se persiste como ADR; el repo es la memoria) y el punto de entrada de arquitectura del
proyecto.

- **Índice pegable (una línea por ADR):** [`INDEX.md`](./INDEX.md) — para pegar en una sesión nueva; el
  detalle de un ADR se abre solo si hace falta.
- **Marco de producto (leer antes de decidir):** [`../FUNDAMENTOS-Y-VISION.md`](../FUNDAMENTOS-Y-VISION.md).
- **Enmiendas a 001–008:** [`AMENDMENTS-revision-critica.md`](./AMENDMENTS-revision-critica.md).

---

## Convención de formato

**ADRs 028 en adelante** usan el formato estándar: **Contexto · Decisión · Consecuencias · Estado · Fecha**,
más un encabezado con `Estado`, `Fecha`, `Depende de` y `Relacionado` (referencias cruzadas). Los ADRs de
**metodología** referencian su **doc de fundamento vivo** (p. ej. `METODOLOGIA-SPRINT.md`,
`auditoria-sap-fiori.md`): el ADR fija la *decisión*, el doc mantiene el *detalle operativo*.

> **ADRs 001–027 (previos a la convención):** usan secciones numeradas equivalentes —*Problema* ≈ Contexto,
> *Alternativas*, *Decisión*, *Impacto* ≈ Consecuencias, *Estado*—. Se conservan tal cual (su razonamiento
> es denso y valioso); esta README y el `INDEX.md` los normalizan en estado y referencias cruzadas.

**Leyenda de estado:** *Aceptado — implementado* · *Aceptado — pendiente de implementación* (disparo
anotado) · *Aceptado — vigente* (norma/metodología) · *Aceptado — en reconversión*.

---

## Índice por tema

### 🏛️ Metodología y modelo de trabajo GSG
- **008** — Costo de tokens de Claude (semilla del método: un tema por thread, decisiones como ADR).
- **016** — Handoff persistido (cola de próximos pasos en el repo, no en el chat).
- **032** — Modelo de trabajo GSG: economía de modelos (Sonnet default / Opus alto juicio) + **Gate siempre Opus** + tope de 4 sesiones + prioridades P1/P2/P3.
- **039** — Metodología del `sprint`: FASE 0 obligatoria, 1 frente = 1 worktree = 1 sesión, PMO merge-master, cierre/backup.
- **040** — **Gate de Excelencia obligatorio** (SAP Fiori 7 ángulos + **ángulo argentino** + sello GSG + arquitectura + confiabilidad).
- **033** — Regla de copia exacta ↔ auditoría (el front replicado se respeta; el backoffice pasa el Gate completo).
- **043** — Estándar de marca GSG (sello en todo entregable, sin pisar la marca del cliente).
- **044** — **Argentinizar SAP** (lo mejor de SAP adaptado a la pyme argentina: criollo · ARCA · Mercado Pago · WhatsApp-first) — ángulo transversal de la auditoría.
- **045** — **Advisory Board + Challenger (contrarian)** — tesis/antítesis antes de adoptar un fundamento; nada se adopta sin pasar por el Challenger. Corre en Sonnet (ultra-ahorro).
- **046** — **De-sesgo / comportamiento humano por sector** — humano/criollo donde conviene (copy, ventas, WhatsApp, demos, atención, advisory); estándar/preciso donde no (código, tests, infra, fiscal, cálculos).
- **047** — **Rutina de retroalimentación** — 3 palancas (memoria · casos · skills/briefs) + 2 cadencias (cierre de sprint por célula · consolidación periódica con Advisory+Challenger).
- **048** — **Arquitecto de Solución** — rol ejecutivo con autoridad sobre lo **reversible** (decide/ejecuta, puertas Type 1/2); eleva lo **irreversible** al dueño. Charter en `docs/organizacion/`.

### 🔐 Multi-tenant, datos y aislamiento (RLS)
- **001** — Estrategia multi-tenant (shared schema + `tenant_id` + RLS).
- **015** — Resolución de tenant **fail-closed** (blinda antes del 2º tenant).
- **018** — Activación de RLS de Postgres (`SET LOCAL`, rol sin `BYPASSRLS`).
- **023** — Performance multi-tenant (RLS también enciende los índices) + techos del free plan.
- **029** — Ruteo por hostname (`TENANT_HOST_MAP`) para URLs `.vercel.app` gratis por tenant.

### 🧱 Core · Blueprints · Plugins · Fiscal/Pagos
- **002** — Core / Blueprint / Plugin (blueprints = config; plugins por eventos + outbox).
- **003** — Business capabilities del piloto "Servicios". · **006** — Motores de plataforma (4 MVP / 4 diferidos).
- **036** — Rubro retail `padel` + conversión segura de blueprint en prod.
- **022** — Plugin ARCA (facturación electrónica). · **024** — Disparadores de facturación + toggle + plugin Mercado Pago. · **025** — Ingesta de Mercado Pago + facturación masiva.

### 📅 Scheduling y capacidades del piloto
- **004** — Modelo de Scheduling (overbooking con `EXCLUDE USING GIST`). · **011** — Relevamiento con el cliente.
- **012** — Recordatorios/plantillas editables. · **013** — Precio diferencial vecino/a. · **014** — Seña obligatoria + cupones.

### 🏗️ Plataforma, stack, performance, API y analytics
- **005** — Stack técnico. · **007** — Análisis financiero. · **010** — Convergencia piloto → plataforma.
- **020** — Contrato de API pública del Core. · **021** — Consola de operación / super-admin.
- **026** — Harness de tests (`node:test` + `tsx`). · **027** — Analytics cross-tenant (benchmarking anónimo).

### 🎨 UX, RBAC, onboarding y preset
- **009** — UX metadata-driven, RBAC, onboarding. · **017** — Usuarios, roles y RBAC. · **019** — Onboarding / alta de tenant (provisioning).
- **034** — Generador de preset por IA (ingesta + "copiar exacto"). · **042** — Autorización del cliente antes de replicar su marca. · **035** — Consultor → Backoffice.

### 🚀 Entrega, demo y comercial
- **028** — Modelo de entrega (consolidado = tenant real; demo = app del flujo; fin de previews estáticos).
- **030** — Ciclo DEMO → VENTA → INVERSIÓN. · **031** — Demo navegable (backoffice sin password + toggle persistencia).
- **041** — Dos fases de credenciales. · **037** — WhatsApp CTA sin placeholder + helper único.

---

## Mapa de referencias cruzadas (clusters)

- **Multi-tenant & aislamiento:** 001 → 015 → 018 → 029 → 023 (RLS aísla *y* enciende performance).
- **Demo → venta → entrega:** 028 (qué es el entregable) ↔ 030 (cuándo se invierte) ↔ 031 (cómo es el demo) ↔ 041 (credenciales por fase) ↔ 029 (URL por tenant).
- **Preset, marca y Gate:** 034 (generar) → 042 (autorización) → 033 (copia exacta) → 043 (sello) → 040 (Gate) → **044 (Argentinizar SAP — ángulo argentino)** ; 035 (consultor → backoffice) alimenta el backoffice.
- **Modelo de trabajo GSG:** 008 (semilla) → 032 (modelos + concurrencia + prioridades) → 039 (sprint) → 040 (Gate) → 016 (handoff) → **045 (Advisory + Challenger)** → **047 (retroalimentación)** → **048 (Arquitecto de Solución)**.
- **Autoridad / decisión:** 048 (Arquitecto: ejecuta lo reversible, eleva lo irreversible) — se apoya en 041 (dos fases de credenciales) y en los gates de prod/Neon; 045 (Challenger) sigue filtrando el fundamento estratégico.
- **Comportamiento / voz de producto:** 044 (Argentinizar SAP) → **046 (de-sesgo humano por sector)** → 040 (Gate lo evalúa) ; 009 (UX criolla) · 037 (WhatsApp).
- **Fiscal / dinero:** 022 (ARCA) → 024 (disparadores + MP) → 025 (ingesta MP masiva).

---

*Convención vigente desde 2026-07-06 (ADR-028+). Mantener este README y `INDEX.md` sincronizados al sumar
un ADR nuevo — es parte de la Definición de terminado (ADR-008/016).*
