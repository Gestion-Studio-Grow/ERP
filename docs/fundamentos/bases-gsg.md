# Bases y fundamentos de GSG (Gestión Studio Grow)

**Qué es este documento:** las bases de marca/compañía de GSG — misión, columna vertebral, visión,
valores y posicionamiento. Es el nivel *por encima* de `docs/FUNDAMENTOS-Y-VISION.md` (que fija la
promesa y las reglas del **producto** estetica-erp); este documento fija quién es GSG como compañía,
antes de cualquier feature. Consolidado con los dueños en sesión de Advisory Board, 2026-07-06.

---

## 1. Misión

> **Llevar la potencia de un ERP de clase mundial a cualquier pyme argentina, sin importar su rubro
> o su tamaño, con la cercanía y el trato humano que las plataformas grandes no ofrecen.**

GSG existe porque hoy esa potencia (SAP, y equivalentes) está reservada a quien puede pagar una
implementación de meses y un equipo de consultoría propio. GSG achica esa distancia sin renunciar a la
profundidad — la "argentiniza" (§4).

## 2. Columna vertebral — lo que NO cambia nunca

Confirmado y pulido con los dueños. Estos tres pilares valen para **los tres segmentos de mercado**
(§5 y `docs/estrategia/roadmap-gsg.md`) — cambia el precio, el canal y la profundidad de módulos; esto no:

1. **Un solo Core, nunca fork.** Una sola base de código para todos los tenants; cada mejora se paga
   una vez y la reciben todos. Forkear por cliente o por rubro es una violación del modelo, no una
   opción de diseño (`docs/FUNDAMENTOS-Y-VISION.md §1`).
2. **Cercanía y soporte humano.** El diferencial frente a un SAP o un Salesforce distante: GSG se
   involucra en el negocio real del cliente (el Generador de Preset por IA parte de la marca y los
   datos reales de cada tenant, no de una plantilla genérica).
3. **Nadie queda afuera por su rubro o su tamaño.** Sostenido técnicamente por el Blueprint genérico/
   comodín (cualquier negocio opera desde el día uno) y, a nivel de negocio, por la segmentación en
   tres tiers (§5) — la pyme más chica y la empresa grande tienen, cada una, un producto GSG a su medida.

## 3. Visión — foco: profundidad local antes que expansión regional

**Ambición confirmada por los dueños:** profundizar los **tres segmentos del mercado argentino**
(BAJA / MEDIANO / GRANDE — ver roadmap) antes de mirar expansión geográfica. La razón de fondo, tal
como la planteó el dueño: **lo que se mide como "segmento de mercado" a nivel local (tipo de
contribuyente fiscal argentino) no es el mismo criterio que a nivel regional** — son, en los hechos,
**productos distintos**. Mezclarlos prematuramente diluye el foco.

- **Ahora (2026-2027):** ganar los tres segmentos locales con un producto por tier, medido contra el
  sistema fiscal argentino real (AFIP/ARCA).
- **Más adelante (sin fecha aún — abierto):** una eventual expansión regional (Uruguay, Chile, etc.)
  se trata como **otra línea de producto**, con su propia segmentación y su propio roadmap — no se
  negocia ni se diseña en este ciclo.

## 4. Posicionamiento — "argentinizar SAP"

**Eje único, confirmado por los dueños — no se compite en múltiples frentes a la vez:**

> **GSG es SAP + adaptabilidad argentina.** La potencia y la lógica de suite integrada de SAP (§ el
> "todo" de la propuesta de valor, no piezas sueltas — ver roadmap de producto), llevada a la realidad
> fiscal, cultural y de soporte de la pyme y la empresa argentina.

**Activo estratégico diferencial (y no un simple eslogan de marketing):** el dueño de GSG **implementa
personalmente SAP Public Cloud Finance en mercado grande** en su práctica profesional — es decir, GSG
no imita SAP desde afuera: tiene **know-how real de implementación enterprise S/4HANA / Public Cloud**
adentro de la casa. Esto es un activo de credibilidad concreto, sobre todo para el segmento GRANDE
(§ roadmap): GSG no vende "una promesa de SAP corporation-lite", vende la experiencia real de quien ya
implementó SAP en ese nivel, aplicada — a escala y precio argentino — a la pyme y a la empresa local.

Frente a los demás faros de referencia (Salesforce, Shopify, Toast, Tiendanube), GSG no compite en su
mismo terreno (todos ellos horizontales o de nicho vertical global); compite en la combinación
**profundidad de suite tipo SAP + ejecución y costo argentinos**, que ningún jugador global ni
ninguna consultora SAP local resuelve hoy para la pyme chica.

## 5. Público objetivo — reformulado por tipo de contribuyente fiscal

**Decisión clave de los dueños:** la segmentación de público objetivo, a nivel local, **no es por
tamaño de facturación en abstracto ni por rubro** — es por **tipo de contribuyente fiscal argentino**,
porque ese estatus es lo que realmente determina qué necesita el negocio (régimen de facturación,
percepciones/retenciones, reporting). Tres tiers:

| Tier | Estatus fiscal (mapeo, a confirmar con un contador) | Perfil |
|---|---|---|
| **BAJA** | Monotributo / Responsable Inscripto chico sin agentes de retención | Los 4 clientes actuales (estética, carnicería, velas, pádel) |
| **MEDIANO** | Responsable Inscripto (IVA general) | Pyme mediana, backoffice completo, camino a multi-sucursal |
| **GRANDE** | Agente de Retención/Percepción — "Grandes Contribuyentes" (AFIP/ARCA) | Empresa argentina con régimen de información avanzado |

Detalle de propuesta de valor, módulos y pricing/canal por tier: `docs/estrategia/roadmap-gsg.md`.

## 6. Valores — candidatos derivados (⚠️ provisional, a confirmar explícitamente por los dueños)

No se preguntaron ni se confirmaron como lista cerrada en esta ronda. Se derivan, como punto de
partida, de los principios operativos que **ya rigen** GSG en la práctica (`CLAUDE.md`,
`docs/organizacion/factory-reforzada.md`) — quedan marcados como candidatos, no como cierre:

- **Rigor** — el Gate de Excelencia (auditoría SAP Fiori en 7 ángulos) no se saltea nunca.
- **Cercanía** — soporte humano real, no ticket-bot (§2).
- **Costo-consciencia** — "costo manda sobre velocidad"; se economiza donde no duele.
- **Inclusión** — nadie afuera por rubro ni por tamaño (§2).
- **Ejecución disciplinada** — "Sonnet ejecuta, Opus decide": el juicio caro se reserva, el volumen se
  delega, sin bajar el estándar de control.

## 7. Cómo opera GSG — la factory de agentes: pool compartido + exposición deliberada

**Pilar permanente de cómo GSG mueve su fuerza de agentes** (junto a "argentinizar SAP", el Gate de
Excelencia, el de-sesgo por sector y el ciclo DEMO→VENTA→INVERSIÓN):

> **Los agentes son un POOL que se entrena exponiéndose a toda la estructura. Reutilizamos y ROTAMOS a
> propósito —no solo para ahorrar— para AMPLIAR su entrenamiento y BAJAR el sesgo genérico: más contextos =
> agente más completo. Al prestarse a otra estructura, calibran con el destino y devuelven el aprendizaje a
> la memoria; al cerrar, vuelven a su asignación de origen (no se re-parenta ni se duplica).**

- **Exposición deliberada (objetivo, no solo permiso):** la rotación cross-estructura es un fin **buscado**
  —un mecanismo de **mejora continua** del agente—, no algo que apenas se tolera.
- **Reúso antes de crear:** antes de instanciar un agente nuevo se verifica si el **pool** ya lo cubre
  (evita duplicados y respeta el tope de concurrencia).
- **Exposición acumulada:** se lleva un **registro ligero** de en qué nodos ejecutó/entrenó cada agente,
  para **rotarlos con criterio** y detectar **quién necesita más exposición**.
- **Circula el conocimiento:** cada cruce vuelca su aprendizaje a la **memoria de lecciones** (retro), así
  ninguna experiencia queda encapsulada en una división.

El **"cómo" detallado** (préstamo/retorno, calibración cross-estructura, registro de exposición) vive en
**`docs/adr/ADR-053`** (+ ADR-052 calibración, ADR-047 retro). Este documento fija el **pilar**; el ADR, la mecánica.

---

*Fuentes de referencia externas usadas para contrastar (no para copiar): SAP (misión/propósito,
segmentación Business One vs S/4HANA), Salesforce (valores operativos, ediciones por ARPU), Shopify
(Basic vs Plus), Tiendanube (Nube vs Evolución, foco regional post-consolidación local).*
