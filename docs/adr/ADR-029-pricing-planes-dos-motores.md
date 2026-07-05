# ADR-029 — Modelo de pricing y planes de los dos motores (agencia vs. producto) + mapeo a Feature Flags

**Estado:** Aceptado el **modelo** de pricing; los **números finales son gate de dueño** (los ratifica
Maxi) · **Fecha:** 2026-07-05 · **Origen:** sector Agencia Digital — charter §7.4 ("definir pricing de
cada motor, con su propio ADR"), nota de gobierno de `2026-07-05-pmo-propuesta-producto-1.md` §6
("cuánto sale el tier premium es una decisión de pricing → su propio ADR") y el punto abierto del
`docs/adr/INDEX.md` ("definición de planes/pricing y cómo se mapean a Feature Flags, ADR-006"). Rangos
de mercado tomados de `docs/sectores/agencia-digital/analisis-mercado/` (fechados 2026-07-05).

> **Marco:** válido dentro de `docs/FUNDAMENTOS-Y-VISION.md` (economía SaaS: se paga una vez, lo reciben
> todos) y se apoya en **ADR-006** (Feature Flags como motor de plataforma; Rules como config plana),
> **ADR-007** (análisis financiero de costos) y **ADR-028** (los dos motores del sector). No fija
> credenciales ni cobra nada; **no toca prod/Neon/deploy**. Los precios concretos son **provisionales
> hasta el OK del dueño** (ver "Gate de dueño").

## Contexto

El sector tiene **dos motores de ingreso** (ADR-028 §1, charter §1): el **motor de servicios** (agencia:
creativo, ads, contenido — ingreso por fee/proyecto/% de inversión) y el **motor de producto**
(software-para-ganancias: ERP SaaS, arca standalone, tier premium — ingreso recurrente por
suscripción). Los análisis de mercado ya arrojaron **rangos de precio y márgenes por plano geográfico**
(local Canning, CABA, online), pero esos números vivían dispersos en los informes, sin un lugar
canónico ni una **estructura de planes** que los ordene.

Además, hay una decisión estructural pendiente que el `INDEX.md` dejó anotada: **cómo se mapean los
planes a Feature Flags** (ADR-006). Sin ese mapeo, "vender un tier premium" degenera en ramas `if
(plan === 'premium')` desparramadas por el código — exactamente lo que el motor de Feature Flags de
ADR-006 existe para evitar. Este ADR fija **el modelo** (qué motores, qué planes, cómo se encienden),
no los pesos finales (esos los ratifica el dueño).

## Decisión

**Se adopta un modelo de pricing de dos motores con planes que se encienden por Feature Flags, y con
los números finales sujetos a ratificación del dueño.** Cuatro definiciones:

### 1. Motor de SERVICIOS (agencia) — pricing por retainer / proyecto / % de inversión
No es software, no lleva Feature Flags. Se cotiza por entregable y se factura como servicio. Estructura:

| Modalidad | Cuándo | Rango de referencia (mercado, `analisis-mercado/`) |
|---|---|---|
| **Retainer local** (SEO local + GBP + "agencia + ERP") | comercios de zona (Canning/sur) | **US$300–800/mes** · margen 60–80% (automatizable) |
| **Fee productizado CABA** (paquete SEO/GEO + vertical con ERP) | PyMES/verticales donde el ERP diferencia | **fee US$300–1.500/mes** · inversión gestionada $500k–1,5M/mes · GEO $200k–500k/mes · margen 60–75% |
| **% de inversión gestionada** | cuentas con pauta grande | sobre el spend, además del fee |

> **Doble monetización (canal → producto):** el retainer local es también el **canal** que convierte al
> comercio en **tenant del ERP** (segunda suscripción recurrente) — el canal se autofinancia
> (`FUNDAMENTO.md`, AVANCE §b.2). El fee de servicio y la suscripción de producto son **líneas
> separadas** en la cotización, no un bundle opaco.

### 2. Motor de PRODUCTO (software) — suscripción recurrente por planes
Ingreso recurrente con economía SaaS (`FUNDAMENTOS §1`). **Tres planes por tenant**, aditivos:

| Plan | Qué incluye | Feature flags que enciende | Referencia |
|---|---|---|---|
| **Base** | Core operativo del rubro (agenda/POS/clientes/catálogo/cobro/reportes v2) | ninguno extra — es el piso | suscripción mensual por tenant |
| **Premium ("Panel del Dueño")** | Base + insights automáticos single-tenant (`owner-insights.ts`, propuesta-producto #1) + comparativa de rubro cuando se active el benchmarking (ADR-027, gated) | `insights.owner_panel` (ON) · `insights.benchmark` (OFF hasta ≥5 tenants/cohorte, ADR-027) | upsell sobre Base — margen altísimo (el dato ya está) |
| **Vertical AI** (futuro) | Premium + "recepcionista/mostrador IA" sobre el Blueprint | `ai.vertical` (OFF) | pricing 2–3× (charter/AVANCE) — entra tras P1/P2 |

**Producto standalone aparte del ERP:** **arca facturador** para monotributistas (ADR-025) — suscripción
mensual por comercio **+ revenue-share con contadores** (modelo "contador socio", canal). No es un plan
del ERP: es un producto con su propio pricing, atado a su propio roadmap (ADR-025).

### 3. Los planes se encienden por Feature Flags (ADR-006), no por `if` de plan
El plan de un tenant es **un dato** (config plana, ADR-006 §Rules-como-config): un mapa
`plan → set de feature flags`. El código **nunca** pregunta `plan === 'premium'`; pregunta
`isFeatureEnabled(tenantId, 'insights.owner_panel')`. Consecuencias:

- Un flag se puede **prender por tenant** fuera de su plan (piloto, cortesía, cliente estratégico) sin
  tocar código ni pricing.
- El **teaser de venta** (ej. slot "Comparativa de rubro — disponible al activar benchmarking",
  propuesta-producto §2) es un flag en OFF que se ve como *coming-soon*, no una rama muerta.
- El mapeo `plan → flags` es **la** tabla de verdad del pricing en el producto; agregar un plan es
  agregar una fila, no un refactor.

### 4. Gate de dueño — los NÚMEROS finales los ratifica Maxi
Los rangos de arriba son **de mercado** (evidencia en `analisis-mercado/`), no precios fijados. Fijar el
peso/dólar final de cada plan/retainer es **decisión de negocio del dueño** (como el Gate 1/2 es del
dueño para deploy/DB). Este ADR fija **la estructura**; el dueño ratifica **los montos** y ahí se
congelan en una tabla de precios operativa (fuera de este ADR, editable sin ADR nuevo).

## Consecuencias

- ✅ El pricing deja de vivir disperso en los informes de mercado y pasa a ser una **estructura
  canónica** (dos motores, tres planes de producto, arca standalone), con los rangos citados a su
  fuente.
- ✅ **Mapeo a Feature Flags resuelto** (cierra el punto abierto del `INDEX.md`): los planes son datos
  sobre el motor de ADR-006, no ramas de código. Vender un tier = encender flags, no programar.
- ✅ **Separa canal de producto:** el fee de agencia y la suscripción del ERP son líneas distintas — el
  cliente ve qué paga por servicio y qué por software (evita el bundle opaco y respeta ADR-028: la
  Agencia es canal, el ERP es producto).
- 🚧 **Números provisionales hasta OK del dueño** (Gate de dueño §4). No se publica una lista de precios
  "oficial" desde este ADR.
- 🚧 **Depende de features aún no todas construidas:** el Panel del Dueño es propuesta-producto #1 (motor
  `owner-insights.ts` listo, falta pantalla — `/sesion-feature`); el benchmarking es ADR-027 (gated por
  masa); Vertical AI es futuro. El **plan Base es lo único vendible hoy** (asistido, alta operada
  ADR-019, hasta cerrar el gate del 2º tenant para self-serve — charter §5 P2).
- 🚧 **No implementa el mapeo `plan → flags` en código** — eso es una `/sesion-feature` sobre el motor de
  Feature Flags (ADR-006), no toca prod/DB si se hace con config plana. **No aplica migración, no
  despliega.**

## Alternativas descartadas

- ❌ **Un único bundle "agencia + software"** con precio cerrado — esconde el margen, mezcla canal y
  producto, y rompe la lectura de ADR-028 (la Agencia es canal del ERP, no lo mismo que el ERP).
- ❌ **Planes cableados con `if (plan === …)` en el código** — es deuda que ADR-006 existe para evitar;
  cada plan nuevo sería un refactor y cada excepción por tenant, imposible. Se usa Feature Flags.
- ❌ **Fijar los precios finales en este ADR** — es decisión de negocio del dueño (Gate de dueño). El
  ADR fija la estructura; el número es de Maxi y se congela aparte, editable sin ADR.
- ❌ **Cobrar el Panel del Dueño / benchmarking antes de construirlo** — el Premium se vende cuando el
  Panel esté con pantalla (propuesta-producto #1) y el benchmarking cuando pase su gate de masa
  (ADR-027). Vender humo quema el diferencial.

## Fuentes (rangos de mercado)

- `docs/sectores/agencia-digital/analisis-mercado/2026-07-05-geografia-caba-local-online.md` — tamaño,
  competencia, pricing y foco por plano (CABA / local / online).
- `docs/sectores/agencia-digital/analisis-mercado/2026-07-05-segmento-local-canning.md` — retainer local
  US$300–800/mes, hueco de agencia hiperlocal, SEO local como canal de tenants.
- `docs/sectores/agencia-digital/2026-07-05-AVANCE-consolidado.md` §b — tabla "dónde está la plata" por
  plano geográfico (pricing/margen) + las 3 fuentes de ingreso de mayor palanca.
- `docs/adr/ADR-006-motores-plataforma.md` — Feature Flags como motor; Rules/planes como config plana.
- `docs/adr/ADR-007-analisis-financiero.md` — costos de infraestructura por escala (piso del margen).

---

*Decisión de modelo de pricing. Los montos finales son gate de dueño (los ratifica Maxi). No implementa
código, no fija una lista de precios oficial, no aplica migración, no toca prod ni Neon ni deploys. El
mapeo `plan → feature flags` en código es una `/sesion-feature` posterior sobre ADR-006.*
