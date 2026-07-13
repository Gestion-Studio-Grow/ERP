# 🚧 GUARDARRAÍLES DUROS — las reglas que NINGÚN agente puede romper

> **Qué es:** la **destilación de una página** de las lecciones que ya pagamos con incidentes. No es teoría:
> cada regla nació de algo que se rompió. Es la versión **operativa y verificable** de
> `docs/lecciones-aprendidas/registro.md` — el registro tiene el relato completo (síntoma→causa→fix); este
> archivo tiene solo **la regla y su ancla**, para que **se lea en 30 segundos y no se pueda ignorar**.
>
> **Dónde vive cableado (por eso "se lee solo"):** (1) la **arranque obligatorio de CLAUDE.md** lo nombra;
> (2) el **charter genérico** (`docs/organizacion/charter-generico-agente.md`) lo mete en el Paso 0 de TODO
> agente; (3) los **3 validadores** (`auditoria-gsg-gate`, `challenger`, `verificador-visual`) lo embeben en
> su definición. Un agente que corre YA tiene estas reglas en contexto — no depende de que alguien las
> recuerde.
>
> **Regla sobre las reglas:** si una regla de acá choca con una intuición cómoda, **gana la regla**. Si algo
> no está acá pero huele a irreversible, **se trata como irreversible** (ADR-048).

---

## 🔎 VERIFICACIÓN — la más cara (pagada en producción)

- **G-V1 · "Verificado por DOM" NO es verificado.** Un login roto llegó a **prod** con `tsc` + **929 tests**
  + `build` en **verde**. Verde de vallas ≠ funciona. → **Ninguna página se publica sin RENDER REAL**
  (Chromium/Playwright) **+ screenshot** que alguien mira. Dueño: **`verificador-visual`**. Ancla: **MP-16**.
- **G-V2 · Si el entorno NO puede sacar el screenshot, el gate FALLA — NO se saltea.** "No pude renderizar"
  es un **rechazo**, nunca un "pasó igual". Ancla: **MP-16**.
- **G-V3 · Lo que el cliente ve ES producto, no cosmética. No existe el "defecto visual menor".** (Regla
  textual del dueño.) Un overflow, un contraste pobre, un layout colapsado = bug bloqueante. Ancla: **DX-8**.
- **G-V4 · Trampa conocida Tailwind v4:** la escala de densidad `--spacing-*` **hijackea** `max-w-sm/md/lg/…`
  → colapso "una palabra por línea". Ante ese síntoma, sospechar de ESTO **antes** que de "no cargó el CSS".
  Ancla: **DX-8**.
- **G-V5 · Verificar POR ENTIDAD, no en agregado.** Que una sección "cargue" no prueba que su dato/relación
  sea real (3 profesionales con el mismo catálogo = front que miente sin ningún error). Ancla: **DX-6/DX-7**.

## 🚀 PRODUCCIÓN — irreversible, se eleva al dueño

- **G-P1 · `push a main` = DEPLOY a producción.** No es teoría: verificado 2026-07-11, el push a `origin/main`
  dispara el deploy de prod. Tratar **todo** push a main como publicación real. Ancla: **PD-2**, memoria
  `push-main-auto-deploya-vercel`.
- **G-P2 · Migración SIEMPRE antes del merge.** El schema nuevo se mergea **con** su migración lista; nunca
  "schema ahora, migración después" (el incidente de CH del 09-07 fue exactamente eso). El `migrate deploy`
  a Neon (**Gate 2**) requiere **OK explícito del dueño nombrando la base de producción**. Ancla: **DB-3/PD-2**.
- **G-P3 · Toda tabla nueva con `tenantId` necesita su policy de RLS en el MISMO release** (cobertura 43/43,
  no 42/43). Ancla: **MT-5/SEC-2**.
- **G-P4 · Clientes reales PRE-PROD cargando datos:** un reset futuro es **solo transaccional, NUNCA**
  maestros/servicios. Ancla: **DB-1/DX-7**.
- **G-P5 · Fix de dato de prod:** script versionado, **dry-run con diff campo-por-campo → `--apply` → re-dry-run
  a 0 cambios**, scope por `tenantId` de UN tenant; lo no confirmado se **desactiva**, no se borra. Ancla: **DX-7**.

## 🛡️ DATOS Y SEGURIDAD — I1–I7 no se rompen

- **G-D1 · Las 3 guardas de concurrencia ya están en la DB** (`Order.idempotencyKey`, `CashMovement` único,
  `Invoice.mpPaymentId`). **No reintroducir esas carreras** (check-then-insert no es atómico; la exclusión la
  impone la BD). Ancla: **DB-4**, invariantes I1–I7.
- **G-D2 · NUNCA apuntar `DATABASE_URL` al rol legacy `app_user`** (tiene `BYPASSRLS` → RLS deja de valer). La
  app conecta **siempre** con `app_rls` (NOBYPASSRLS). Ancla: **SEC-2**, memoria `rls-prod-real-a3-latente`.
- **G-D3 · El agente NUNCA toca secretos:** no los expone, no los loguea, no los pega. Los pega el dueño
  (FASE 2). Si un secreto se expuso, **se ROTA** de inmediato; el repo lleva solo la **plantilla**. Ancla: **SEC-1**.
- **G-D4 · Toda query lleva predicado `tenantId`; prohibido `findFirst` sin `where`** (leak cross-tenant
  silencioso); RLS como backstop, no como única defensa. Ancla: **MT-1/MT-3**.
- **G-D5 · NUNCA seed/`deleteMany` sin scope contra prod** (Neon es producción real). Destructivo bloqueado
  por config. Ancla: **DB-1**.

## 🔧 PROCESO — árbol compartido, worktrees, Gate

- **G-M1 · Commit por PATHSPEC, NUNCA `git add -A`.** El árbol se comparte entre sesiones; `-A` arrastra WIP
  ajeno. Ancla: **MP-2**, memoria `worktree-compartido-colision`.
- **G-M2 · Worktree AISLADO en RUTA CORTA** (`C:/wt-*`). El `MAX_PATH` de Windows rompe el build de Turbopack
  en rutas profundas; además `npm install` real por worktree (no junction de `node_modules`). Ancla: **MP-6**,
  memoria `worktree-fresco-setup-build`.
- **G-M3 · Gate de Excelencia OBLIGATORIO antes de `main`** (los 4 bloques; 1 y 2 sin excepción). La Auditoría
  GSG corre **SIEMPRE en Opus**, aunque la ejecución haya sido Sonnet. Ancla: **ADR-040**, CLAUDE.md.
- **G-M4 · Nada de fundamento se adopta sin pasar el Challenger** (tesis→antítesis→síntesis del dueño). Ancla:
  **ADR-045**.
- **G-M5 · Ante incongruencia entre sesiones: gana la sesión de los productos NUEVOS**; lo viejo duplicado se
  **obsoleta**, no se deja conviviendo. Ancla: **MP-10/MP-12**.
- **G-M6 · Desviarse de un ADR aceptado exige rastro de autoridad en el repo** (nota fechada), no una cita
  verbal. Sin rastro, el Gate lo trata como observación a elevar. Ancla: **MP-15**.

---

*Si tocás un área de riesgo (Prod/Deploy · Datos/DB · Multi-tenant · Seguridad · lo que el cliente ve), leé
la entrada completa en `registro.md` por el ancla. — Elaborado por **Gestión Studio Grow (GSG)**.*
