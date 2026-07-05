# Modelo de adaptación a tenants — preventa por tipo de cliente

**Qué es este documento:** el análisis de **cómo cubrimos distintos tipos de cliente**
en la venta, segmentándolos **por su punto de partida digital** (qué tiene hoy), no por
su rubro. Responde: a cada tipo de prospecto, *¿qué le vendemos, qué le tocamos, cómo lo
relevamos y cómo se traduce en un tenant que le hace fit?*

**Cómo encaja con lo ya definido (no lo duplica):**
- **Rubro → blueprint:** qué catálogo/flujo trae el tenant. Ver `docs/ONBOARDING-TENANT.md`
  §2 (servicios / carnicería / **genérico comodín**) y el selector `resolveBlueprint()`.
- **Profundidad → tier:** Express / Asistida / Enterprise. Ver ONBOARDING §3.3.
- **Método de relevamiento → playbook:** `docs/preventa/playbook-lectura-redes-a-tenant.md`
  (leer la presencia digital y traducirla en un tenant a medida, 7 pasos).
- **Este doc agrega el eje que faltaba:** la **situación del cliente** — cuánto de su
  mundo digital ya existe y, por lo tanto, qué parte del producto le vendemos y armamos.

**Estado:** análisis de preventa (propuesta de producto/estrategia). Marcas: ✅ existe ·
⚠️ parcial/gap · 🔜 propuesto. Supuestos marcados **(Supuesto)**.

---

## 1. Una venta = tres ejes (rubro × situación × profundidad)

Un tenant no se define por una sola pregunta. Se define por tres, **ortogonales**:

| Eje | Pregunta | Resuelve | Dónde vive |
|---|---|---|---|
| **Rubro** | ¿Qué vende? | Qué **blueprint** (catálogo/flujo/marca base) o comodín | ONBOARDING §2 + selector |
| **Situación digital** | ¿Qué tiene hoy? (web, sistema, nada) | Qué **archetipo**: qué le vendemos y qué le tocamos | **este doc, §2** |
| **Profundidad** | ¿Cuánto hay que customizar/acompañar? | Qué **tier** (Express/Asistida/Enterprise) y precio | ONBOARDING §3.3-3.4 |

La misma carnicería puede ser "full + Asistida" o "backoffice-only + Express" según lo
que ya tenga. Por eso segmentar por rubro no alcanza: **el punto de partida define la
venta tanto como el rubro.**

---

## 2. Archetipos por punto de partida digital

Cuatro archetipos cubren el espectro. No son excluyentes de rubro ni de tier: se
**combinan** (§4).

| Archetipo | Señal en preventa | Qué le vendemos | Qué le tocamos | Tier típico |
|---|---|---|---|---|
| **A. Backoffice-only** | Ya tiene web/tienda hecha por agencia, prolija | El **motor**: pedidos/POS, stock, facturación (ARCA), cobro (MP), clientes, reportes | Solo el back; **la vidriera no se toca** | Asistida |
| **B. Full** | Web básica, Linktree, o sin web | **Front + back**: vidriera (blueprint del rubro o réplica) + backoffice | Todo el tenant | Express o Asistida |
| **C. ARCA standalone** | Monotributista que "solo quiere facturar" | El **plugin de facturación ARCA** acotado | Facturación + clientes; sin agenda/POS/vidriera | Express |
| **D. Migración** | Viene de otro sistema (Bistrosoft, planillas, WhatsApp manual) | Reemplazo **con paridad + traemos sus datos** | Back (+front si aplica) + import | Asistida/Enterprise |

### 2.A — Backoffice-only (ya tiene web de agencia)

- **Qué le vendemos.** El **motor operativo** que su linda web no tiene: toma de
  pedidos/POS (`Order`/`OrderItem`), stock, **facturación electrónica ARCA**
  (`src/plugins/arca` ✅), **cobro online MercadoPago** (`src/plugins/mercadopago` ✅),
  ficha de clientes y reportes. Su agencia sigue a cargo de la vidriera pública.
- **Cómo lo adaptamos.** Alta con el blueprint de su rubro (o comodín), con la
  **vidriera del tenant apagada/no publicada** — usa solo `/admin`. Dos formas de
  conectar su web al motor:
  1. **Desacoplado (hoy):** su web sigue como está; los pedidos entran por mostrador/
     WhatsApp cargados en el POS. Cero integración, valor inmediato.
  2. **Integrado (🔜):** su web empuja pedidos a la **API pública del Core** (ADR-020)
     — su front, nuestro back. Madurez del contrato por caso; se cablea en Asistida.
- **Relevamiento de preventa.** Leemos su web para el catálogo/modelo (playbook pasos
  2-3), pero el foco está en **la operación que su web no cubre**: cómo factura hoy,
  cómo cobra, cómo lleva stock, cómo procesa pedidos. Ahí está lo que vendemos.
- **Mapeo.** Blueprint del rubro/comodín · módulos = `orders/catalog/clients/reports` +
  plugins `arca`/`mercadopago` · **vidriera off** · tier Asistida. *(Cierre potente:
  el demo del front replicado, §3.)*

### 2.B — Full (web básica o sin web)

- **Qué le vendemos.** El paquete completo: **vidriera pública** (con su marca, catálogo
  y copy) **+ backoffice**. Es el caso "canónico" del producto.
- **Cómo lo adaptamos.** Alta con el blueprint del rubro y branding real; vidriera del
  tenant activa. Si el rubro no está modelado → **comodín genérico** + branding (nunca
  queda afuera, guardrail §4). Si tiene una web básica, la **superamos** replicándola
  mejorada como su vidriera.
- **Relevamiento de preventa.** El **playbook completo** (redes → identidad, modelo de
  venta, catálogo, marca/tono → tenant). Salida: análisis de redes + recipe de alta +
  demo a medida corriendo en local.
- **Mapeo.** Blueprint del rubro o comodín · branding del tenant (`--whatsapp`,
  `--city`, `--contact-note`, acento en `src/lib/branding.ts`) · tier Express si es
  estándar, Asistida si trae catálogo real/custom.

### 2.C — ARCA standalone (solo facturar)

- **Qué le vendemos.** **Solo facturación electrónica** como producto acotado — la
  **doble naturaleza** que ADR-022 le reconoce a `arca`: se vende standalone además de
  operar como plugin. Sin agenda, sin POS, sin vidriera. Entrada de bajo compromiso.
- **Cómo lo adaptamos.** Tenant mínimo: blueprint **genérico** con casi todo apagado
  (perfil "facturación"), o directamente clientes + facturas + ARCA. El monotributista
  emite comprobantes y lleva sus clientes; nada más hasta que quiera más.
- **Relevamiento de preventa.** Mínimo y **no de redes**: datos fiscales (CUIT, condición
  de IVA, punto de venta), tipos de comprobante. Rápido de calificar y de dar de alta.
- **Mapeo.** Comodín (perfil facturación) · módulo `facturación` + plugin `arca` · tier
  Express. **Camino de upsell natural** a Full/backoffice cuando el negocio crece
  (misma cuenta, se encienden módulos — no se rehace nada).

### 2.D — Migración (viene de otro sistema)

- **Qué le vendemos.** Reemplazo con **paridad** del sistema incumbente **+ traemos sus
  datos**, para que el cambio no duela. El gancho es "no perdés lo que ya cargaste".
- **Cómo lo adaptamos.** Alta normal + **importación** de lo que se pueda rescatar:
  - **Bistrosoft / software con export** → export de catálogo/clientes → import.
  - **Planillas (Excel/Sheets)** → normalizar a CSV → import.
  - **WhatsApp manual / cuaderno** → no hay export: carga guiada del catálogo, clientes
    se cargan sobre la marcha.
  - Herramienta: **importador CSV de clientes/catálogo** — hoy **diferido** (ADR-019
    §2.c, ⚠️) hasta tener una lista real; en Asistida se hace carga asistida mientras
    tanto.
- **Relevamiento de preventa.** Detectar el **incumbente** (playbook paso 6: seguir el
  link de "tienda/lista de precios" suele revelarlo — en magra fue Bistrosoft) y armar
  la **tabla de paridad** capacidad-por-capacidad, con los gaps críticos marcados
  honestos (ej. si falta algo del sistema viejo, se lista, no se promete de más).
- **Mapeo.** Blueprint del rubro/comodín · tier Asistida (o Enterprise si el volumen de
  datos/multi-sucursal lo exige) · trabajo extra = import + paridad.

---

## 3. El demo del front replicado como herramienta de preventa

**La jugada:** *"recreamos tu web y le enchufamos el backoffice que hoy no tenés"*. En
vez de mostrar un demo genérico, mostramos **su propio negocio corriendo en nuestra
plataforma** — su marca, su catálogo, su copy — con el motor (pedidos/stock/facturación/
cobro) funcionando por detrás. Es la capacidad de venta central del playbook, aplicada
como **cierre**.

- **Por qué cierra, sobre todo al archetipo A (con agencia):** el cliente que ya pagó
  una web linda ve, en su propia vidriera replicada, **todo lo que su web no hace**
  (cobrar, facturar, controlar stock, tomar pedidos ordenados). No competimos con su
  agencia: le vendemos **la parte que a la agencia no le toca**. Y si le gusta la
  réplica, tenemos también esa conversación.
- **Cómo se sirve — siempre como tenant NUESTRO.** La réplica es la **vidriera de un
  tenant** en nuestra plataforma (con su branding), servida desde nuestro entorno. Nunca
  tocamos ni alojamos el sitio productivo del cliente. En producción, el archetipo A
  mantiene su front y nosotros corremos el back (§2.A); la réplica es **demo**, no
  necesariamente el entregable.
- **Honestidad (regla de oro del playbook):** todo dato de la réplica va etiquetado
  **verificado / provisional / pedido al dueño**. Un demo a medida con datos inventados
  es peor que uno honesto con huecos marcados.
- **Costo cero (FUNDAMENTOS §5):** la réplica corre en **local/preview**, no se
  despliega a producción para una demo.

> El demo del front replicado es **transversal a los archetipos**: a A le muestra el
> back que le falta; a B, su futura vidriera; a D, la paridad con lo que ya tenía. Es la
> misma herramienta con tres ángulos de cierre.

---

## 4. Guardrail: adaptamos sobre lo existente, no desarrollo a medida ilimitado

**La regla que sostiene todo el modelo:** cubrimos a *cualquier* cliente **acomodándolo
sobre lo que ya existe** —blueprint del rubro, comodín genérico, config por tenant,
módulos activables, plugins (ARCA/MP)— **nunca** con un desarrollo a medida para uno
solo. Un fork por cliente está prohibido por FUNDAMENTOS §1 y ADR-002: multiplica el
mantenimiento por cliente y mata la economía del SaaS.

| Sí (adaptación) | No (a medida prohibido) |
|---|---|
| Elegir blueprint del rubro o caer al comodín | Escribir un sistema nuevo para un cliente |
| Config por tenant: branding, marca, catálogo, horarios | Hardcodear la identidad de un cliente en el código o el rubro |
| Encender/apagar módulos y plugins por tenant | Ramas de código `if (cliente === X)` |
| Importar sus datos (CSV/export) | Rehacer el modelo de datos por un caso |
| Replicar su vidriera como tenant (config + branding) | Alojar/mantener el sitio productivo del cliente |

**Cuándo se "gradúa" el esfuerzo (Supuesto):** si un rubro o una necesidad **se repite**
en varios clientes y la config no la cubre, recién ahí se modela —un **blueprint nuevo**
(una fila en el registro), un **módulo** o un **plugin** del Core, que **todos** los
tenants heredan. El trabajo se hace una vez y se cobra N veces; jamás al revés.

### Matriz de cobertura — por qué atendemos a "cualquier cliente"

Cualquier prospecto cae en una celda **rubro × archetipo**, y siempre hay un camino:

| | Servicios | Carnicería/Retail | Rubro no modelado |
|---|---|---|---|
| **Backoffice-only** | back sobre su web | back sobre su web | comodín + back |
| **Full** | blueprint servicios | blueprint carnicería | **comodín** + branding |
| **ARCA standalone** | perfil facturación | perfil facturación | perfil facturación |
| **Migración** | + import | + import (paridad Bistrosoft) | comodín + import |

No hay celda vacía: **el comodín cubre la columna "rubro no modelado"** y los archetipos
cubren las filas. Ese es el sentido literal de *"si tu negocio no está acá, lo
solucionamos"* — hay un encuadre para todos, sin construir a medida para ninguno.

---

## Resumen para el dueño

- **Segmentamos al cliente por lo que YA tiene, no solo por su rubro** — cuatro tipos:
  **backoffice-only** (tiene web de agencia), **full** (web básica o nada),
  **ARCA standalone** (solo facturar) y **migración** (viene de otro sistema).
- **Qué le vendemos a cada uno:** al de agencia, el **motor** (pedidos/stock/facturación/
  cobro) sin tocarle la vidriera; al full, **front + back**; al monotributista, **solo
  facturación ARCA** (con camino de upsell); al que migra, **reemplazo con paridad + le
  traemos sus datos**.
- **Cómo lo relevamos:** leemos su presencia digital (playbook de redes→tenant) y la
  traducimos en un tenant que le hace fit; en el que migra, además detectamos el sistema
  que reemplazamos y armamos la tabla de paridad.
- **El arma de cierre:** *"recreamos tu web y le enchufamos el back"* — su negocio
  corriendo en nuestra plataforma, servido siempre como **tenant nuestro** y en local
  (costo cero). Ideal para el cliente que ya tiene agencia.
- **Por qué cubrimos a cualquiera:** todo prospecto cae en una celda rubro × situación, y
  siempre hay camino — el **comodín genérico** tapa los rubros no modelados y los
  archetipos tapan las situaciones. Ninguna celda queda vacía.
- **El límite (guardrail):** siempre **adaptamos sobre lo existente** (blueprint/genérico/
  config/módulos/plugins), nunca desarrollo a medida para uno solo; si una necesidad se
  repite, se modela una vez para todos.
