# Alta de tenant — auditoría honesta + qué se aceitó (Fase 2)

> **Objetivo del frente:** dejar el proceso de alta (`/operador/alta` → fábrica ADR-074 → core ADR-019)
> **confiable para dar de alta un cliente real**, sin sorpresas. Este doc es la **auditoría brutalmente
> honesta** del estado, lo que se aceitó en esta iteración, las migraciones preparadas, y **qué falta
> todavía** para el go-live real. Rama `fase2/aceitar-alta` (base `origin/main` 4e0c056, que YA tiene la
> consola de alta). Sin merge, sin deploy, sin aplicar migraciones.

---

## TL;DR — ¿está listo para un cliente real HOY?

**No del todo — pero se acortó la distancia y lo que falta ya está mapeado y en gran parte cableado.** El
**bloqueante duro** para un cliente real nuevo sigue siendo **el gate RLS** (no se puede crear el 2º tenant
hasta activar aislamiento): eso es correcto y su runbook quedó escrito
([`levantar-gate-rls-2do-tenant.md`](levantar-gate-rls-2do-tenant.md)). Lo demás que "rompía" el alta
(efectos externos que mentían, idempotencia volátil, edición que se perdía) **se aceitó**.

---

## PASO 1 — Auditoría: qué rompía / fricción, ANTES de esta iteración

| # | Hallazgo | Severidad | Qué pasaba de verdad |
|---|---|---|---|
| A | **HostBinder e Inviter eran STUBS no-op** | 🔴 Alta | La saga marcaba `host.bound=true` e `invited.sent=true` **sin hacer nada**: el tenant quedaba **sin link resuelto y sin invitación al dueño**, pero el alta decía "ACTIVE / todo OK". Mentía. |
| B | **Idempotencia solo in-memory** | 🟠 Media | `sharedIdempotencyStore` vivía en `globalThis`. Un doble-submit **tras reiniciar el proceso** (deploy, crash, scale-to-zero de Vercel) **re-ejecutaba la saga**. La tabla `ProvisioningRun` estaba en `pending-gate2/` como idea futura, sin consumir. |
| C | **`edicion → Tenant.profile` no se persistía** | 🟠 Media | El committer transportaba la edición Comercio/Empresa pero **no la escribía**: el tenant nacía siempre en `profile=lite` (default), perdiendo la elección del operador. Deuda anotada en `adr019Committer`. |
| D | **Reintento tras fallo quedaba "pegado"** | 🟠 Media | La saga cacheaba **también** el `FAILED_COMPENSATED`. Un reintento con el mismo slug devolvía el **fallo cacheado para siempre** en vez de re-ejecutar → "reintentar sin duplicar" no funcionaba entre requests del mismo proceso. |
| E | **El operador no veía qué quedó a medias** | 🟠 Media | Si un efecto externo se saltaba, no había forma de saber qué faltaba rematar a mano. |
| F | **Gate RLS bloquea el 2º tenant** | 🟡 Por diseño | Correcto (ADR-018/MT-3), pero significa que **hoy no se puede dar de alta un cliente real nuevo** sin antes levantar RLS. Faltaba el runbook exacto. |
| G | **Credenciales fiscales (CUIT/ARCA) no se recolectan** | 🟡 Por diseño | Correcto que no se pidan en el wizard (son secretos, los pega el dueño), pero no estaba dicho **cuándo/cómo** se cargan → el operador no sabía que faltaba. |
| H | **Cobertura de blueprints por rubro** | 🟡 Info | Hay servicios/genérico + familias (agenda, oficios, gastronomía) + retail (carnicería, verdulería, dietética, kiosco, fiambrería, indumentaria, pádel, velas). Falta relevar qué le falta a un rubro para estar "vendible" (ver abajo). |

---

## PASO 2 — Qué se aceitó (esta iteración)

Todo reversible, con tests, `tsc`/suite/build en verde. Commits chicos.

### A → Efectos externos REALES, gateados por credenciales y HONESTOS
- Nuevos adaptadores `VercelHostBinder` (Vercel Domains API) y `EmailInviter` (Resend) en
  `src/lib/provisioning/external-adapters.ts`. **Gateados por env** (SEC-1: los secretos los pega el dueño):
  - **Configurado** (env presente) → hace la llamada real (liga el subdominio / manda el email).
  - **No configurado** → se **salta honestamente**: `bound/sent=false` + `note`, y la saga lo junta como
    **followup** (pendiente manual). El alta igual queda ACTIVE (el tenant existe y opera). **Ya no miente.**
  - **Fallo real** (el servicio rechazó) → lanza → **compensación**.
- El puerto (`HostBinder`/`Inviter`) ahora devuelve `{bound|sent, note}` en vez de `void` → la saga
  distingue **hecho** vs **saltado** vs **falló**. Compensación **precisa**: solo deshace lo que se aplicó
  de verdad (un paso saltado no se intenta "des-hacer").
- **Para encenderlo real** (post-venta): el dueño pega `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` +
  `APP_BASE_DOMAIN` (host) y `RESEND_API_KEY` + `INVITE_EMAIL_FROM` (email). Cero cambio de código.

### B → Idempotencia PERSISTENTE (ProvisioningRun), resiliente
- `ProvisioningRunStore` (`src/lib/provisioning/idempotency-store.ts`) lee/escribe la tabla `ProvisioningRun`
  por **SQL crudo** (sin modelo Prisma → **cero riesgo de deploy schema-ahead**, a diferencia del incidente
  CH del 2026-07-09).
- **Resiliente:** si la tabla no existe (hoy, Gate 2 sin aplicar) o la DB falla, **degrada a in-memory** y
  avisa una vez — **no rompe el alta**. La idempotencia es una optimización (el commit de ADR-019 ya es
  idempotente por slug), así que degradar nunca corrompe datos.
- Apenas el dueño aplica el SQL (Gate 2), **persiste entre procesos automáticamente, sin re-deploy**.

### C → `edicion → Tenant.profile` se persiste (deuda cerrada)
- `provisionTenant` (core ADR-019) acepta `platform.profile` y lo escribe **solo al crear** (como el resto
  de la metadata de plataforma; en re-provisioning no se pisa).
- `adr019Committer` mapea `edicion` → `profile` con `editionToProfile` (`comercio→lite`, `empresa→enterprise`).

### D → Reintento seguro
- La saga cachea como terminal **solo un alta ACTIVE**. Un `FAILED_COMPENSATED` **no** se short-circuitea:
  reintentar re-ejecuta (commit idempotente por slug + externos ya compensados) → "reintentar sin duplicar"
  funciona de verdad, también entre procesos (con la tabla aplicada).

### E → El operador ve qué quedó a medias
- El wizard (`ResultPanel`) muestra la lista de **followups** (pendientes manuales) cuando un efecto externo
  se saltó, y el commit los registra en el log estructurado (`hostBound`/`invited`/`followups`).

### G → Flujo de credenciales fiscales, explícito
- El wizard **no** recolecta CUIT/certificado ARCA (correcto: son secretos, no van en un form). Ahora, si el
  rubro factura con ARCA, el resultado **avisa** que hay que cargarlos aparte (post-alta, con secretos del
  dueño). El "cómo" queda documentado (ver "Credenciales fiscales" abajo).

---

## Migraciones preparadas (NO aplicadas — Gate 2)

| Archivo | Qué | Estado |
|---|---|---|
| `prisma/pending-gate2/ProvisioningRun.sql` | Tabla de persistencia de la saga (idempotencia entre procesos + auditoría de plataforma) | **Preparada, sin aplicar — ya cableada al store vivo** (degrada a in-memory hasta que se aplique) |

Aplicar (cuando el dueño autorice): `psql "$OPERATOR_DATABASE_URL" -f prisma/pending-gate2/ProvisioningRun.sql`
(idempotente). No requiere cambio de código ni re-deploy: el store la detecta y deja de degradar.

> Las otras 9 migraciones pendientes (inventario/fiscal, ESTADO §5) y el backstop RLS (`prisma/rls/`) son
> aparte y siguen siendo Gate 2.

---

## PASO 3 — Levantar el gate RLS (para el 2º tenant)

Runbook ejecutable completo en **[`levantar-gate-rls-2do-tenant.md`](levantar-gate-rls-2do-tenant.md)**.
Resumen del orden: ensayo en branch de Neon (`0001_enable_rls` + `0002_app_role` + `verify-rls` 4/4) →
cablear la app a `app_rls` + `runInTenantContext`/`tenantTransaction` + crons con contexto → aplicar a prod
(Gate 2, dueño) → `check-rls-live` 38/38 sin drift + `app_rls` sin BYPASSRLS → recién ahí, alta del 2º tenant.

---

## Credenciales fiscales (CUIT + certificado ARCA) — flujo correcto

1. **En el alta:** NO se recolectan. El wizard crea el tenant + OWNER + catálogo + módulos. Si el rubro
   factura con ARCA, el resultado lo recuerda.
2. **Post-alta, aparte:** el dueño carga el **CUIT** y el **certificado ARCA por tenant** (cifrado —
   envelope encryption, `TenantFiscalCredential`, guard CUIT↔cert fail-closed). Los secretos los pega el
   dueño (SEC-1 / ADR-041), nunca el agente ni un form.
3. **Encender la emisión:** flag `ARCA_INVOICING_ENABLED` + homologación (runbook
   `docs/runbooks/encender-arca-real.md`). Hasta entonces, ARCA queda en sandbox/simulado.

> **Nota honesta:** la vertical de facturación ARCA está **simulada/stub** en `main` (sin tenant real
> facturando); la migración `TenantFiscalCredential` está **sin aplicar**. El alta deja el tenant listo para
> operar; **facturar de verdad es un frente aparte** con su propio Gate.

---

## Cobertura de blueprints por rubro — ¿alcanza para vender?

**Hay razonable amplitud** (servicios, genérico-comodín, y familias retail/agenda/oficios/gastronomía). El
comodín `generico` garantiza que **ningún rubro falla** el alta (cae a un set mínimo funcional, nunca `[]`).

**Qué necesita un rubro para estar "vendible" (no solo "no roto"):**
1. **Catálogo semilla realista** (`seedCatalog`) con los objetos típicos del rubro — no genérico.
2. **Set de módulos LITE curado** (`presets-meta.ts`) que muestre solo lo que ese rubro usa (nav limpia).
3. **Acento + tema sugeridos** coherentes con el rubro.
4. **Wording** del backoffice adaptado (retail ya tiene `wording.ts`).

**Recomendación (no ejecutada acá — es contenido, no plomería):** al vender un rubro nuevo, correr el
**Generador de PRESET por IA** (ingesta de la marca real del cliente) en vez de agregar un blueprint a mano —
es el camino canónico de onboarding (CLAUDE.md → generador-preset-ia). Un blueprint nuevo se justifica solo
si el rubro se repite.

---

## Qué falta para dar de alta un cliente real con confianza (honesto)

| Bloqueante | Dueño de la acción | Estado |
|---|---|---|
| **Levantar RLS** (2º tenant) | Dueño (Gate 2) — runbook listo | 🔴 **Bloqueante duro.** Sin esto, `provisionTenant` aborta el alta de cualquier tenant nuevo. |
| Cablear la app a `app_rls` + contexto de tenant + crons | Frente Plataforma (reversible) + Gate 2 | 🟠 Escrito pero apagado (`tenant-context.ts`/`rls.ts`) — hay que cablearlo y re-ensayar. |
| Pegar secretos de host/email (para que host+invite sean reales) | Dueño (SEC-1) | 🟠 Adaptadores listos; sin secretos, se saltan y dejan followup (alta igual queda ACTIVE). |
| Aplicar `ProvisioningRun.sql` (idempotencia persistente) | Dueño (Gate 2) | 🟢 Opcional para el go-live (degrada seguro); recomendado antes de tráfico real. |
| Credenciales fiscales por tenant (si factura) | Dueño (Gate 2) | 🟠 Frente aparte; el alta ya deja el tenant operable sin esto. |
| Datos reales del cliente (branding/catálogo) | Dueño + Adaptador | 🟠 El alta siembra catálogo de ejemplo; el real se carga con el patrón DX-7 (dry-run→apply). |

**En una línea:** *el motor del alta quedó honesto, idempotente y auditable; lo que falta para el cliente
real es acción del dueño (levantar RLS + pegar secretos + aplicar migraciones), no más plomería del alta.*

— Elaborado por GSG
