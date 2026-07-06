# Devs — Avance: router WhatsApp + tendencias del Panel del Dueño (2026-07-05)

**Autor:** Equipo Desarrolladores (sector Agencia) · **Base:** FUNDAMENTO §2 (palancas #1 y #2),
AVANCE consolidado, propuesta PMO producto #1 · **No toca prod, Neon ni deploy.** Código nuevo de
lógica pura + tests, verificado en aislamiento y commiteado a `main`.

---

## Qué construí (dos incrementos de producto, ambos código real)

### 1. `src/lib/wa-intent.ts` — cerebro del comercio conversacional WhatsApp (palanca #2)

Router **determinista** que convierte un mensaje entrante del cliente en español (AR) en una
**intención estructurada cableable al ERP** + entidades. Es la **capa reusable independiente del
proveedor** de WhatsApp (Meta/Twilio/360dialog) — se construye y testea HOY sin esperar al proveedor
ni tocar el Core.

- **Intenciones:** `BOOK` (reservar), `RESCHEDULE`, `CANCEL`, `PRICE`, `HOURS`, `PAY`, `INVOICE`,
  `HUMAN` (handoff), `GREETING`, `AFFIRM`/`DENY` (confirmación en flujo), `UNKNOWN`.
- **`suggestedAction`** mapea cada intención a acciones que **YA existen**: `createAppointment` /
  `rescheduleAppointment` / `cancelAppointment` / lista de servicios / plugin **Mercado Pago**
  (`mercadopago:createPreference`) / plugin **ARCA** (`arca:emitInvoice`) / `handoff`. El router no
  ejecuta nada: sólo clasifica y sugiere. La ejecución es la capa 3 (dispatcher, otra sesión).
- **Extracción de entidades:** fecha relativa/absoluta ("hoy", "mañana", "pasado mañana", día de la
  semana → próxima ocurrencia, `dd/mm` a futuro), hora ("a las 3 de la tarde"→`15:00`, "15hs",
  "15:30", "y media"), y **servicio** matcheado contra el catálogo del tenant (con alias y límite de
  palabra para evitar falsos positivos). El catálogo lo inyecta el dispatcher; el router no conoce
  ningún catálogo.
- **Sin LLM** (determinista, barato, explicable, testeable — mismo criterio que el Panel del Dueño y
  ADR-026), **sin DB**, **sin red**, **cero deps**, **puro** (`now` inyectado para resolver fechas).
- **Confianza 0..1** heurística para que el bot decida si actúa solo o pide confirmación / escala a
  humano. Ante la duda, `UNKNOWN`/`HUMAN` → nunca deja al cliente sin respuesta.

**Verificación:** `src/lib/wa-intent.test.ts` — **32 tests en verde**, `tsc` limpio.

### 2. `src/lib/owner-trends.ts` — tendencias multi-período del Panel del Dueño (palanca #1)

El motor actual (`owner-insights.ts`) compara contra **un** período previo. Este añade la lectura que
la spec del PMO nombra pero el motor no podía dar: **"tu ticket viene plano hace 3 meses"** — que
exige mirar una **serie** de períodos, no un par.

- Dada la serie de una métrica (viejo→nuevo), clasifica **dirección** (`up`/`down`/`flat`/`volatile`),
  cuenta la **racha** final consistente ("hace N períodos"), calcula el **cambio punta a punta** y la
  **pendiente media**, y arma la **narrativa en lenguaje llano** con **sentimiento** según la
  dirección "buena" de cada métrica (subir el ticket = bueno; subir el no-show = malo).
- `analyzeTrends(...)` corre varias métricas y ordena por accionabilidad (lo malo primero).
- Mismo criterio: **puro, determinista, sin LLM, sin DB, cero deps, single-tenant** (no cruza tenants
  — eso sigue siendo ADR-027). Complementa a `owner-insights.ts` sin tocarlo: la pantalla del Panel
  puede pintar insights puntuales **+** tendencias.

**Verificación:** `src/lib/owner-trends.test.ts` — **12 tests en verde**, `tsc` limpio.

---

## Cómo se conecta (handoff a las próximas sesiones)

- **Panel del Dueño (pantalla):** cuando se cablee `/admin/reportes` (o una pantalla propia de
  insights), la Server Action puede traer los KPIs del período actual **+** una serie de los últimos
  N períodos (query read-only range-bounded, Neon-safe) y pintar `generateOwnerInsights(...)` +
  `analyzeTrends(...)`. La lógica ya está lista y testeada; falta sólo la capa de pantalla + su
  preview. *(Nota de método: la pantalla se hace en su `/sesion-feature`; no la incluí acá para no
  chocar con el WIP de otras sesiones en el working tree compartido.)*
- **WhatsApp conversacional:** faltan la **capa 1** (adaptador del proveedor: webhook → texto) y la
  **capa 3** (dispatcher que ejecuta `suggestedAction` contra las Server Actions del ERP + un router
  de conversación con estado para los flujos multi-turno). El `wa-intent` se enchufa sin cambios.
- **Decisión estructural pendiente:** elegir proveedor de WhatsApp (Meta Cloud API vs. 360dialog vs.
  Twilio) es un **ADR** propio — lo dispara el PMO cuando priorice la palanca #2.

## Disciplina cumplida

- `tsc` limpio sobre mis archivos + **44 tests nuevos en verde** (32 + 12), corridos en aislamiento.
- **Cero deps nuevas, cero migraciones, no toqué prod/Neon/deploy.** Sin `git add -A`: commit por
  pathspec (working tree compartido con otras sesiones).
- Coordinación por el repo (FUNDAMENTO §3): este doc + los módulos quedan en `main` para que el PMO
  integre y secuencie las capas que faltan.
