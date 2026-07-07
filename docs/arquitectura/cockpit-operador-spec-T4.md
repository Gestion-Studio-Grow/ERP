# Spec — COCKPIT OPERADOR (rediseño de la consola, T4)

> **Estado:** **ESPECIFICACIÓN** para **T4** (rediseño de la consola operador, Balde B — Opus). **NO se
> construye ahora** (estamos en T2): esto es doc-only para revisión del dueño. Anexo de T4.
> **Marco:** es el **plano de control (control-plane / super-admin, ADR-021)**, separado del plano del
> tenant. **Read-only puro** (cero escrituras) y **Neon-free-consciente**.

---

## 0. Principios rectores (innegociables)
1. **Control-plane, NO datos de negocio.** El cockpit muestra **salud/operación** (¿anda?, ¿está caído?,
   ¿hay alertas?), **nunca** datos de negocio de un tenant. El operador ve el **estado del sistema**, no la
   agenda ni las ventas de un cliente (aislamiento ADR-018/021).
2. **Read-only puro.** Cero escrituras a prod/Neon. Todos los widgets **leen** de fuentes de solo lectura;
   ninguna acción del cockpit muta estado (las acciones irreversibles siguen siendo del dueño, §Gates).
3. **Neon-free-consciente.** Nada de streaming pesado ni polling agresivo contra Neon: métricas **por
   snapshot periódico + cache**, no consultas por segundo (cuidar compute del plan free).
4. **Sello GSG + criollo.** `metadata.generator` + crédito GSG en el footer del backoffice; wording criollo
   ("¿Anda todo?", "Necesita tu ojo", "Caído"), pasa el **Gate** (SAP Fiori + ángulo argentino, ADR-040/044).

---

## 1. Widgets — datos, fuente (read-only), cadencia y aislamiento

| # | Widget | Qué muestra | Fuente (read-only) | Tiempo-real vs periódico | Aislamiento |
|---|---|---|---|---|---|
| **W1** | **Mapa de tenants (estado en vivo)** | grilla/mapa de tenants con semáforo **🟢 sano / 🟡 atención / 🔴 caído** | **health-check por tenant** (endpoint `/api/health` extendido → up/degraded/down + `TENANT_HOST_MAP`) + **metadata** de la tabla `Tenant` (subdomain, activo) — **sin filas de negocio** | **near-real-time:** poll cada **15–30 s** (o SSE si se justifica) | solo **meta+salud** del control-plane; nunca datos del tenant |
| **W2** | **Diagrama de arquitectura (salud de componentes)** | app · DB (Neon) · deploy (Vercel) · cron · plugins (ARCA/MP/WhatsApp) coloreados por salud | **health agregado** por componente (checks de `/api/health` + estado de deploy + `cron last-run`); estático el layout, **overlay** de color en vivo | **periódico:** poll **30–60 s** | señales de salud, no datos |
| **W3** | **Estado de la DB (Neon) en tiempo real** | conexiones activas · latencia · **locks** · salud general | **Neon monitoring API** (read-only) **o** `pg_stat_activity`/`pg_locks` vía **rol de solo-lectura del control-plane**, en **snapshot cacheado** | **periódico:** snapshot **30–60 s** (no por segundo → Neon free) | vistas de sistema (pg_stat), **cero** tablas de negocio |
| **W4** | **Diagrama de flujo del trabajo** | el flujo canónico **PMO → Dueño → Arquitecto → Dispatch** (ADR-049) + estado del sprint/olas | **derivado del repo/docs** (`ESTADO-FRENTES.md`, `## Sprint activo`, `git log`) — build-time o poll suave | **periódico / on-demand:** al abrir + cada **60 s** | doc/estado, sin datos |
| **W5** | **Panel de información crítica** | **alertas · errores · ítems que requieren atención del dueño** (gates pendientes, migraciones sin aplicar, rojos de seguridad) | **agregación de errores** (logs, `level=error`) + **gates pendientes** (`ESTADO-ACTUAL.md`: Gate 1/Gate 2, secretos a rotar) + flags de retro (ADR-047) | **near-real-time:** poll **15–30 s** / SSE para alertas | señales de operación, no datos |
| **W6** | **Plan / Roadmap EN VIVO** | **estado del bloque de reingeniería T1–T5** (avance/estado de cada tarea) + **roadmap por horizontes** (tiers/hitos), **al día sin pedirlo** | **docs del repo (read-only):** `docs/estrategia/plan-ventana-*.md` (Balde A/B, T1–T5) + `docs/estrategia/roadmap-gsg.md` (§3 tiers / §6 catálogo, horizontes/hitos) + **estado de sesiones** (`docs/ESTADO-FRENTES.md` · `## Sprint activo` · `git log`) | **periódico:** poll **60 s** / **on-change** (al commitear docs) | **doc/estado del repo**, sin datos de negocio |

**Regla de fuentes:** todo widget consume **endpoints de salud/monitoreo** o **docs del repo**; **ninguno**
consulta tablas de negocio de un tenant. Donde haya que tocar Neon (W3), es **rol read-only del
control-plane** + **snapshot cacheado**, nunca el rol de la app ni por-fila de negocio.

## 2. Tiempo-real vs periódico (resumen)
- **Near-real-time (15–30 s, poll o SSE):** W1 (tenants), W5 (alertas críticas). Es lo que el dueño mira "¿anda?".
- **Periódico (30–60 s, snapshot + cache):** W2 (arquitectura), W3 (Neon), W4 (flujo), **W6 (plan/roadmap en vivo — poll 60 s / on-change de docs; el dueño ve el plan al día sin pedirlo)**.
- **Nada de sub-segundo ni websockets permanentes contra Neon** — el costo no lo justifica (plan free).
  Un **worker/endpoint de snapshot** cachea las métricas y el cockpit lee el cache.

## 3. Enfoque 3D sin inflar el bundle
- **Default: CSS 3D + SVG (cero dependencias).** `transform: perspective()/rotateX/Y`, capas con `z` y
  sombras para **profundidad visual**; los diagramas (W2/W4) en **SVG** con capas → se ve "tablero de
  mando 3D" sin librería. Alineado con la **economía de deps** (ADR-008/026: preferir cero deps nuevas).
- **Si se necesita 3D real (WebGL):** **lazy + code-split SOLO en la ruta `/cockpit`** (dynamic import de
  `react-three-fiber`/three) → **no toca el bundle principal** del backoffice; se carga solo si el operador
  entra al cockpit. Nunca en el bundle común.
- **Presupuesto:** el cockpit **no** debe subir el bundle del resto del backoffice; su peso vive detrás de
  su ruta (code-splitting). Medir con el build antes de aceptar.

## 4. Aislamiento multi-tenant / RLS
- El cockpit es el **plano super-admin (ADR-021)**: **audiencia y autorización distintas** del `/admin` del
  tenant; **no reusa** la sesión ni el rol de DB del tenant.
- **Rol de DB propio, de solo lectura**, para W3 (monitoreo) — **sin `BYPASSRLS`** sobre datos de negocio;
  solo vistas de sistema (`pg_stat_*`) y **metadata** agregada. **Jamás** lee filas de un tenant.
- **RBAC (ADR-017):** acceso **solo dueño/operador**; el cockpit **no** expone ningún dato que un tenant no
  debería ver de otro — porque **no muestra datos de negocio de ninguno**, solo su **estado**.
- **Cero escrituras:** el cockpit **observa**; publicar/deployar/migrar/rotar secretos siguen siendo **acción
  del dueño** (Gate 1/Gate 2, ADR-041/048). El panel W5 **señala** lo pendiente; **no lo ejecuta**.

## 5. Lo que el Cockpit NO hace (no-goals)
- No muestra datos de negocio (agenda, ventas, clientes) de ningún tenant.
- No ejecuta acciones irreversibles (no deploya, no migra, no toca secretos) — solo **eleva/señala**.
- No consulta Neon por segundo; no abre websockets permanentes contra la DB.
- No suma dependencias al bundle común (el 3D pesado va lazy/code-split).

## 6. Para revisión del dueño
- **Alcance de widgets** (W1–W5) y sus **fuentes read-only**.
- **Cadencias** (near-real-time vs periódico) y el **presupuesto de Neon** (snapshot + cache).
- **Enfoque 3D:** ¿arrancamos con **CSS 3D + SVG** (cero deps) y dejamos WebGL lazy como opción?
- **Construcción = T4 (Opus, reingeniería, Balde B).** Hoy solo esta spec. Al aprobarse, se abre el ADR de
  implementación (rol de DB read-only + endpoints de salud) y se construye.

*Spec de arquitectura (anexo T4). Read-only, control-plane. No toca prod ni datos de negocio.*
