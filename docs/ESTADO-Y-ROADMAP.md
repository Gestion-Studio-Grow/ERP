# 🧭 GSG — ESTADO Y ROADMAP (documento de entrada)

> **Este es EL documento para retomar.** Foto actual + roadmap Fase 1–5 + semáforos + decisiones que esperan tu
> firma. Si abrís una sesión nueva, empezá **acá**. Para el detalle: `docs/ESTADO-ACTUAL.md` (foto operativa),
> `docs/estrategia/fundacional-DEFINITIVO-v2.md` (síntesis fundacional), `docs/estrategia/fundacional-index.md`
> (las 12+2 ADRs), `docs/PRACTICA-DE-GUARDADO.md` (que no se pierda nada).
>
> **Fecha:** 2026-07-11 · **Autor:** GSG (PMO) · **Regla:** si algo choca con el repo, gana el repo.

> **🆕 Consolidación 2026-07-11 — todo lo del día escrito como ADR-082…088** (INDEX `docs/adr/INDEX.md`,
> `adr:linkcheck` verde). Lo esencial:
> - **ADR-082 (la más importante):** gate de **render visual real** — *"lo cosmético para el cliente es
>   crítico"*. Ninguna página se publica sin verificar render (Chromium desktop+mobile, 4 temas, contraste AA
>   computado, touch, sin overflow); *"verificado por DOM" no es verificado*; si no se puede renderizar, el gate
>   **falla**. **Ya en `main`** (`scripts/qa/visual-*`, wired en `verify-gates.mjs`). Corrida inaugural: **324
>   defectos** corregidos por token.
> - **ADR-083:** **`main` auto-deploya a prod** (Vercel) — la doc decía lo contrario y era falso. **Migración
>   SIEMPRE antes del merge**; rollback = revert + redeploy.
> - **ADR-084/086/087/088:** cert fiscal por tenant (implementación), alta honesta+aceitada, ensayo/cutover de
>   RLS, y auditoría fiscal (estado SIMULADO + corrección: **TFactura = Tango/Axoft, un ERP**). ADR-085: imágenes
>   por IA como capacidad compartida (gratis por default).
> - **🔒 Los 2 bloqueos del dueño para encender ARCA real con >1 cliente:** (1) **branch de Neon** para el ensayo
>   RLS en vivo (la sesión no tiene `psql`/`neonctl`/`NEON_API_KEY`, ADR-087) y (2) **`FISCAL_MASTER_KEY`** +
>   aplicar la migración `TenantFiscalCredential` (ADR-084, Gate 2). Ambos son actos del dueño (ADR-041).
> - **📌 Numeración:** 081 **reservado** para el ADR de dropshipping (renumera al mergear `spec/dropshipping`).

---

## 1. Foto actual (una pantalla)

- **Repo:** `https://github.com/Gestion-Studio-Grow/ERP.git` (origin). **`main` real = `93eae5f`.**
- **Fundación consolidada** en la rama **`fundacion/consolidacion-diseno`** (sacada de `rf6x0m`, **en origin**),
  pendiente de **merge a `main` (Gate del dueño)**. Contiene ADR-060..073, síntesis DEFINITIVO v2, comercial/Mariano,
  diseño (ADR-072/073 + mockups MAGRA), y la ingesta del bundle de recuperación.
- **Prod:** CH Estética vivo en Vercel. **Incidente 2026-07-09 (resuelto):** CH cayó por `main` *schema-ahead* de
  su DB; mitigado con 2 hotfixes defensivos (`ad3202c`, `93eae5f`). **Causa raíz abierta:** aplicar migraciones §C
  (Gate 2) **antes** de cualquier deploy de `main` a CH.
- **Tenants:** 4 provisionados en Neon (CH, Magra, Shine, A Dos Manos), aislamiento verificado; solo CH deployado.
- **Producto:** dos líneas (**Comercio Micro** / **PyME-Empresa**) sobre motor compartido; motor del Micro **ya anda**
  (POS, caja, catálogo, facturación sandbox). Madurez del sistema ~**65%** (refactor, no reconstruir — ADR-063).

## 2. Semáforos

### 2.1 Núcleo transaccional — invariantes I1–I7 (ADR-064)
| | Invariante | Estado |
|---|---|---|
| I1 | Σ movimientos = saldo (reconstruible desde el ledger) | 🟡 parcial (falta test de reconciliación) |
| I2 | Comprobante ⇔ venta (1:1) | 🔴 **rojo** (falta dedupe por venta) |
| I3 | Stock nunca negativo sin autorización | 🟢 verde |
| I4 | Toda la plata pasa por la calculadora central | 🟡 parcial (calc repartidas) |
| I5 | Cobro parcial nunca sobre-cobra | 🟢 verde |
| I6 | Redondeo único EPSILON-safe | 🟢 verde |
| I7 | Venta al contado atómica (orden+stock+cobro+caja) | 🔴 **rojo** (caja en tx separada) |

**Resumen:** I3/I5/I6 🟢 · I1/I4 🟡 · **I2/I7 🔴**. Cerrar I2/I4/I7 = trabajo priorizado del núcleo (en curso en `rf6x0m`).

### 2.2 Seguridad
| Ítem | Estado |
|---|---|
| RLS pool shared-schema (línea base, ADR-062) | 🟢 cobertura estática 38/38 |
| RLS **enforced en vivo** en prod | 🟡 **A CONFIRMAR** — correr `prisma/rls/check-rls-live.mjs` |
| Aislamiento de tenant en crons async | 🟢 `reminders`+`arca-outbox` cerrados (`1036b2c`); webhook MP con TODO |
| Rol legacy `app_user` con `BYPASSRLS` | 🔴 revocar (`0002_app_role.sql` fuerza NOBYPASSRLS) |
| Rotación de secretos + **PITR** (ADR-067) | 🔴 pendiente (pre-cobros) |
| Credenciales fiscales por tenant (ADR-066) | 🟡 **implementado en rama** `seguridad/cert-por-tenant` (ADR-084: cifrado en sobre + guard CUIT↔cert); falta **aplicar migración + `FISCAL_MASTER_KEY`** (Gate 2, dueño). Hoy `main` usa **cert por env único** (Riesgo #1, ADR-088) |
| Gate de render visual (ADR-082) | 🟢 **en `main`** (`gate:visual` + `gate:visual:aa`, wired en `verify-gates.mjs`) — 324 defectos de la corrida inaugural corregidos por token |

### 2.3 Diseño (ADR-072 / ADR-073)
| Ítem | Estado |
|---|---|
| Norte Apple×SAP + backoffice "Fable" congelado + ⌘K | 🟢 decidido (ADR-072) |
| Personalización = config, nunca fork + Creative Grow | 🟢 decidido (ADR-073) |
| Challenge "todo se ve igual" + 3 direcciones + paleta MAGRA | 🟢 documentado (fuentes + mockups) |
| Assets HTML aprobados (Fable claro/oscuro, Editorial, Nítido) | 🔴 faltan (rutas destino en `docs/estrategia/diseno/README.md`) |
| Motor de theming rico (tokens extendidos + slots + CSS-dato) | 🟡 [SUPUESTO] no verificado en código |

## 3. Roadmap Fase 1 → 5

- **Fase 1 — Endurecer la base (EN CURSO):** cerrar I2/I4/I7, cerrar los 3 peros de aislamiento, **verificar RLS en
  vivo**. **Salida:** núcleo transaccional firmable por el consultor.
- **Fase 2 — Primer cliente en vivo:** salir con **Comercio Micro** (`docs/estrategia/resumen-ejecutivo-primer-cliente.md`,
  7 pasos); fábrica de tenants operable (dry-run + saga, ADR-065).
- **Fase 3 — Micro vendible + preset IA self-serve:** el alta se auto-sirve (ADR-058 P5 / ADR-034).
- **Fase 4 — Separación de bases + producto Empresa:** construir la separación de ADR-060 (Gate), DR/cumplimiento (ADR-067).
- **Fase 5 — Escala:** catálogo de módulos por rubro (ADR-054/055), analytics cross-tenant (ADR-027), canal de contadores.

## 4. ⛳ Decisiones que esperan tu firma

| # | Decisión | Tipo |
|---|---|---|
| 1 | **Merge `fundacion/consolidacion-diseno` → `main`** (coordinar con el WIP de núcleo de `rf6x0m`) | Gate |
| 2 | **Aplicar migraciones §C** (Gate 2) **antes** de deployar `main` a CH — causa raíz del incidente | Gate 2 |
| 3 | **Correr `check-rls-live.mjs`** + revocar `app_user` BYPASSRLS + rotar secretos + PITR | Seguridad |
| 4 | **Proteger `main` en GitHub** (branch protection) + **mirror/backup** (workflow ya listo, falta activar) | GitHub |
| 5 | Deploy de sitios Magra/Shine/ADM (Gate 1) + datos reales de Magra (Gate 2) | Gate 1/2 |
| 6 | ARCA real (cert + homologación + `ARCA_INVOICING_ENABLED`) — **requiere los 2 bloqueos:** (a) **`FISCAL_MASTER_KEY`** + aplicar migración `TenantFiscalCredential` (ADR-084), (b) **branch de Neon** para ensayo RLS en vivo + cutover (ADR-087) | Gate 4 |
| 7 | Aportar los 4 HTML de diseño que faltan (Fable claro/oscuro, Editorial, Nítido) | Material |
| 8 | Confirmar rol/pricing de Mariano y validar números comerciales | Comercial |

> **Ningún irreversible se corre solo.** Este documento + los runbooks son el guion; los Gates los abrís vos.

— Elaborado por GSG (PMO)
