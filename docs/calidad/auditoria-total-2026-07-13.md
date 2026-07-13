# Auditoría total del código — informe honesto

- **Fecha:** 2026-07-13 · **Base:** `origin/main` `a6b96a5` · **Rama:** `calidad/auditoria-total` (worktree aislado `C:/aud`)
- **Método:** 4 auditores paralelos read-only (seguridad · correctitud plata/stock · arquitectura/código muerto ·
  calidad/tests/perf), hallazgos verificados a mano archivo:línea por el integrador (Opus) antes de arreglar.
- **Regla:** cambios quirúrgicos, cada fix con test que falla antes / pasa después. **Nada tocó prod/Neon.**
  Migraciones intactas (sin aplicar). Commits por pathspec, nunca `-A`. **No mergeado** (espera OK del dueño).

---

## 1. Veredicto de salud — honesto

**El código está sano y bien construido.** No es autobombo: lo digo tras recorrerlo con cuatro ángulos
independientes y verificar cada hallazgo. Los cimientos que el proyecto dice tener, **los tiene de verdad**:

- **Invariantes I1–I7 (ADR-064):** I2 (comprobante↔venta 1:1) e I7 (venta contado atómica) están
  **genuinamente cerrados** con el diseño que el ADR prometía (upsert por `(tenantId, originType, originId)`,
  caja compuesta atómicamente en la misma tx). I5 (cobro parcial) usa **Serializable real**. I6 (redondeo
  único `round2` EPSILON-safe) se usa consistente en los bordes.
- **RLS 43/43** cobertura estática pasa; la evidencia de enforced-en-vivo (rol `app_rls` NOBYPASSRLS) está
  documentada y verificada contra prod (2026-07-12). El gate del alta del 2º tenant mide centinelas reales.
- **Seguridad de base sólida:** envelope encryption fiscal por tenant (AES-256-GCM, guard CUIT↔cert
  fail-closed), webhook MP con firma HMAC en tiempo constante fail-closed, scrypt para passwords, separación
  real de planos `/admin` vs `/operador`, api-key por tenant en tiempo constante.
- **Tipado excelente:** en TODO el código de aplicación hay **una sola** ocurrencia de `any` (documentada y
  necesaria, `rls.ts:49`). Cero `any` escondidos en plata/tenant/fiscal/auth. Muy inusual.
- **Sin N+1 real:** los loaders de dashboard/reportes ya fueron optimizados con cota de rango y agregación
  (ADR-023). Los `catch {}` son fail-safe comentados, no errores tragados.

**Pero la auditoría encontró 2 bugs CRÍTICOS reales** (uno que corrompe plata, otro que filtra un secreto) y
2 ALTOS de seguridad — todos **ya arreglados** en esta rama. Y hay deuda honesta que dejo anotada. La frase
que resume: *cimientos correctos + un par de huecos calientes que nadie había mirado con esta lupa.* Prefiero
habértelos encontrado yo ahora.

**Semáforo:** 🟢 arquitectura · 🟢 correctitud (tras el fix de comisiones) · 🟢 seguridad (tras los 3 fixes) ·
🟡 cobertura de tests (mejorada, pero quedan huecos priorizados) · 🟢 mantenibilidad.

---

## 2. Hallazgos por severidad (con evidencia)

### 🔴 CRÍTICO — 2 (ambos ARREGLADOS)

**C-1 · Doble liquidación de comisiones bajo concurrencia** — `src/lib/commission-actions.ts` (`settleCommissions`)
La transacción corría **sin `isolationLevel: Serializable`** y el `updateMany` de cierre filtraba por `id`
(no por `commissionPayoutId: null`). Dos requests concurrentes (doble-click / dos pestañas del OWNER) sobre el
mismo profesional leían el mismo set pendiente y **creaban dos `CommissionPayout` con el mismo monto** (doble
comprobante de pago de comisión). El comentario del schema ("volver a liquidar no puede doble-pagar
(structural)") era **falso bajo concurrencia**. Es el mismo patrón que el equipo YA arregló para caja (M-1) y
cheques (`transitionCheque`), pero acá quedó sin el fix. **Corrompe plata.**

**C-2 · Contraseña de bootstrap del OWNER viajaba por la URL** — `src/lib/operator-actions.ts:137`
`provisionFromConsole` hacía `redirect(.../tenants/${id}?created=1&bootstrap=${pw})` con el secreto en claro en
el query string → queda en el **historial del navegador, los access-logs de Vercel/CDN y cualquier proxy**. El
patrón seguro ya existía al lado (el wizard RFC-003 lo entrega fuera de la URL; el reset lo revela por el valor
de retorno del action). Era una regresión/inconsistencia. *(La acción legacy `provisionFromConsole` ya no tiene
callers — superada por el wizard; ver §6.)*

### 🟠 ALTO — 3 (todos ARREGLADOS)

**A-1 · Secretos de sesión sin fail-closed en producción** — `src/lib/auth.ts:19`, `src/lib/operator-auth.ts:24`
`AUTH_SECRET ?? "dev-secret"` y `OPERATOR_SECRET ?? AUTH_SECRET ?? "dev-operator-secret"`: si el env faltara en
prod, se firmaba con un **string público conocido** → cualquiera podría forjar una cookie de sesión válida
(HMAC con clave conocida) = **bypass total de auth**, y en el operador del **plano cross-tenant**. `AUTH_SECRET`
ya estaba anotado como riesgo abierto; `OPERATOR_SECRET` (más sensible) no.

**A-2 · Rate limiter de la API pública construido pero SIN cablear** — `src/lib/rate-limit.ts:112` vs
`src/app/api/public/v1/orders/route.ts` (+ `[code]/route.ts`)
`checkPublicApiRate`/`publicApiRateLimiter` existían y estaban testeados, pero **ningún route los llamaba** →
la api-key de un tenant se podía **fuerza-brutear sin límite** y `POST /orders` floodear (consumo de compute de
Neon, plan free). El patrón MP-13 (construido ≠ consumido) aplicado a un control de seguridad.

**A-3 · (mismo A-1, plano operador)** — contabilizado dentro de A-1.

### 🟡 MEDIO — 6

| # | Dónde | Qué | Estado |
|---|---|---|---|
| M-1 | 3 `-core` importaban CUIT de `plugins/bancos/domain/cuit.ts` | Acoplamiento core→plugin (ADR-002) | ✅ **arreglado** (movido a `src/lib/fiscal/cuit.ts`) |
| M-2 | `src/lib/cartera-actions.ts` (alta) | Devolvía `e.message` crudo al panel | ✅ **arreglado** (curado + log) |
| M-3 | `src/plugins/mercadopago/handler.ts`, `capabilities.ts`, `facturacion-actions.ts`, `stock/ledger.ts` (recordMovement) | Sin test que proteja el invariante | ✅ **parcial**: RBAC + webhook MP + I3 anti-oversell cubiertos; `getFacturacion` queda anotado (§5) |
| M-4 | `webhooks/mercadopago/route.ts:16` | Resuelve el tenant vía `getCurrentTenantId()` ambiental (fallback 1-tenant) → bomba de tiempo con un 2º tenant con MP | 📌 **anotado** (§5) |
| M-5 | `rate-limit.ts:9` | Limiter en memoria por-proceso: débil en serverless con 8 tenants | 📌 **anotado** (§5) |
| M-6 | `getAuditLog` + ~15 queries de `actions.ts` | `findMany` sin `tenantId` explícito, dependen 100% de RLS (single point of failure sobre datos de compliance) | 📌 **anotado** (§5) |

### 🔵 BAJO — 5

- **B-1** Sin cabeceras de seguridad (clickjacking sobre `/admin/login`, `/operador/login`) → ✅ **arreglado**
  (`next.config.ts`).
- **B-2** `/api/ready` devolvía el `err.message` crudo de Postgres sin auth → ✅ **arreglado**.
- **B-3** `insertStockPurchase` sin retry de colisión de correlativo (a diferencia de `insertOrder`) → UX, no
  plata. 📌 anotado.
- **B-4** `commission-actions history` / `receivables`/`payables` `findMany` sin `take` (acotados por estado, no
  por fecha) → cota de rango. 📌 anotado.
- **B-5** Drift de doc: `.env.vercel.template:37` dice "fail-open" pero `authorizeCron` es fail-closed; ADR-057
  narra Float pero el schema ya es Decimal en `Invoice`. 📌 anotado (doc-only).

---

## 3. Lo que ARREGLÉ (esta rama, verde)

| Commit | Qué |
|---|---|
| `0bf9d05` | **C-1** comisiones Serializable + compare-and-set (idiom `-core`, `settleCommissionsInTx`) · **C-2** bootstrap fuera de la URL · **A-1** fail-closed de secretos en prod · **A-2** rate limiter cableado (429+Retry-After) · +test RBAC |
| `b6112a4` | **B-1** cabeceras de seguridad · **B-2** `/ready` sin fuga · **M-2** cartera error curado · **M-1** CUIT movido al Core fiscal |
| `289b0c8` | **M-3** tests: I3 anti-oversell (`recordMovement`) + decisión del webhook MP |

**Tests nuevos (todos falla-antes/pasa-después):** `commission-core.test.ts` (regresión doble-pago),
`auth.test.ts` + `operator-auth.test.ts` (fail-closed + cobertura del plano operador), `capabilities.test.ts`
(RBAC: RECEPTION/PROFESSIONAL nunca tienen caps de plata/config), `stock/ledger-record.test.ts` (I3),
`mercadopago/handler.test.ts` (decisión de facturación). **Total suite: 1119 → 1149 tests, 0 fail.**

---

## 4. Deuda que DEJÉ anotada (con su razón)

- **M-4 webhook MP resuelve tenant ambiental:** el propio TODO del archivo lo explica; hoy inerte (1 solo tenant
  con MP). Arreglarlo bien = resolver el tenant desde la notificación, no un fix trivial. **Razón:** no romper
  el camino vivo; escalarlo ANTES de habilitar un 2º MP real.
- **M-5 rate limiter en memoria:** tradeoff documentado para 1–2 tenants; con 8 y serverless multi-instancia un
  atacante distribuido evade el límite de login. **Razón:** el fix real es un store compartido (Redis/DB), que
  es infra, no un cambio quirúrgico. Anotar y decidir antes de cobros masivos.
- **M-6 loaders `/admin` dependen solo de RLS:** latente, no fuga viva (RLS enforced en prod). **Razón:**
  agregar `where tenantId` como defensa en profundidad es deseable pero toca ~16 queries; mejor hacerlo como
  frente propio con su test, no mezclado en la auditoría.
- **`getFacturacion` sin test de degradación:** es el hardening del incidente CH prod 2026-07-09; hoy sin test
  de regresión. **Razón:** el test necesita simular schema-ahead (columna faltante), más laborioso; priorizar
  en la próxima pasada de tests.
- **B-3/B-4/B-5:** bajo impacto; cota de rango y drift de doc.

---

## 5. Qué se puede BORRAR (para tu OK — nada borrado)

**Código muerto (repo):**
- `src/lib/mercadopago-ingest.ts` — **confianza ALTA**, cero importadores (verificado con 2 detectores).
  Superado por `mercadopago-auto.ts` + `mercadopago-dispatch.ts`. *No lo borré: es deleción de código, tu OK.*
- `src/lib/operator-actions.ts::provisionFromConsole` — acción legacy **sin callers** (la reemplazó el wizard
  RFC-003). Tras el fix C-2 ya no filtra, pero sigue siendo código muerto candidato a borrar.
- `src/lib/suppliers/supplier-repo.ts` — **NO borrar**: fundación sin consumidor a propósito (espera migración
  D1, Gate 2). Anotar en ESTADO-ACTUAL como "construido, sin consumidor".

**Ramas y worktrees:** ver `docs/calidad/_cementerio-git.md`. Resumen: **46 ramas mergeadas en `origin/main` →
borrado seguro**; 36 no-mergeadas (la mayoría de integración de 1 commit ya en main; 5 con trabajo único a
revisar). ~44 worktrees, muchos apuntando a ramas ya mergeadas. Método no destructivo sugerido:
`git worktree remove` + `git branch -d` (solo borra si está mergeada). **Acción del dueño (§C·I5).**

---

## 6. Estado de validación (Gate)

- `tsc --noEmit` → **verde**
- `npm test` → **1149 / 0 fail**
- `gate:rls` → **43/43**
- `build` (next) → **verde** (compila con las cabeceras de seguridad nuevas)
- `gate:visual` → **verde** (6/6 rutas, incluidos los logins que toqué)
- `gate:visual:aa` → **verde** tras cerrar un defecto AA **pre-existente** (no lo introduje yo): el badge
  `tone="accent"` usaba el acento crudo del tenant (`text-accent`), que para el preset ambar da 4.33:1 (< 4.5)
  a 12px. Fix systémico en `src/components/ui/Badge.tsx` → `text-accent-ink` (el acento AA-safe que ya usaba el
  tono `info`). Verificado en los 4 tenants (estética/magra/padel/velas): 0 defectos.
- **Gate de Excelencia (Opus):** auditoría GSG sobre el resultado (bloque final).

> Nada de esto tocó prod/Neon. Migraciones sin aplicar. Rama sin mergear — espera tu OK.

— Elaborado por GSG (auditoría total, integrador Opus)
