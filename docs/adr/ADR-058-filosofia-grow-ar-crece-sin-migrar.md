# ADR-058: Filosofía de producto GROW-AR — un Core, dos motores, crecé sin migrar

**Estado:** Aceptado — **fundamento de producto** (mixtura, no reemplazo). Sintetiza en una sola
filosofía tres capas que hasta hoy vivían sueltas: **(a)** lo que construimos esta línea de trabajo
(modelo de scope items en dos perfiles lite/enterprise + fundación de módulos), **(b)** la **visión GSG**
ya vigente (`FUNDAMENTOS-Y-VISION.md`: un Core, tenant por cliente, Blueprint por rubro, Plugin
transversal, la promesa) y **(c)** la **referencia SAP** — GROW, Fiori, S/4HANA Cloud **Public Edition** —
adaptada, no copiada.
**Fecha:** 2026-07-08
**Depende de:** ADR-001 (multi-tenant), ADR-002 (Core/Blueprint/Plugin), ADR-044 (Argentinizar SAP),
ADR-054 (catálogo de módulos), ADR-055 (variante: objeto maestro + ABM de asignación)
**Relacionado:** ADR-006 (simple-y-correcto), ADR-030 (DEMO→VENTA→INVERSIÓN), ADR-034 (preset por IA),
ADR-040 (Gate), ADR-046 (de-sesgo), ADR-057 (dinero) · `docs/estrategia/costos-por-segmento.md`
**Actualiza:** `docs/FUNDAMENTOS-Y-VISION.md` (nueva §11 que baja esta filosofía al criterio rector)

---

## Contexto

El producto ya tenía una visión clara (`FUNDAMENTOS-Y-VISION.md`): **un Core multi-tenant estilo SAP
Public Cloud**, cada cliente un tenant, el rubro por Blueprint, lo transversal por Plugin, sin fork.
Sobre esa base, esta línea de trabajo agregó dos piezas que **todavía no estaban unidas en una filosofía**:

1. **El modelo de dos perfiles (lite ↔ enterprise) para un mismo proceso.** Estudiando los *scope items*
   de SAP S/4HANA Cloud Public Edition (ej.: el BPD **J59 Accounts Receivable**), vimos que SAP entrega
   **procesos de mejor práctica que se ACTIVAN, no se programan**. Lo adaptamos a nuestra realidad: el
   comerciante chico necesita el **mismo proceso en versión mínima**, y la empresa mediana la **versión
   completa** — pero es el **mismo proceso**, no dos productos. De ahí el modelo de **un `ScopeItem` con
   `perfiles.{lite, enterprise}`** e invariante **`enterprise ⊇ lite`** (upgrade **aditivo**).

2. **La fundación de módulos** (ADR-054/055): el catálogo de capacidades activables por tenant, con la
   variante (objeto maestro + ABM de asignación) como principio anti-"a todos con todo".

3. **La realidad de costo y confiabilidad** (`costos-por-segmento.md`): los tres segmentos cierran en
   pesos; el cuello no es el server, es la **mano de obra humana** — lo que empuja a que el producto sea
   **auto-servible** (activar > implementar a mano) para que escale.

Faltaba el paraguas: **¿cuál es la filosofía que mezcla nuestra visión, lo que construimos, y lo mejor de
SAP (GROW / Fiori / Public Cloud) — sin volvernos ni "SAP a secas" ni "otro software más"?**

## Decisión — la filosofía GROW-AR

> **Una línea:** *un solo Core, dos motores (comerciante ↔ empresa), y **crecés sin migrar**: el mismo
> tenant, el mismo proceso, se enciende más profundo a medida que tu negocio crece — lo mejor de SAP,
> argentinizado.*

Se adopta como **fundamento de producto** la síntesis **GROW-AR** ("GROW argentino"), con **cinco
principios** que mezclan las tres capas:

### P1 · Activar, no programar (de SAP Public Cloud → nuestro catálogo)
El valor se entrega **encendiendo capacidades de mejor práctica que ya existen en el Core**, no
desarrollando a medida. Es exactamente el modelo *scope item* de SAP Public Cloud, aterrizado en nuestra
**fundación de módulos** (ADR-054) y **Blueprints** (ADR-002). Refuerza el guardrail anti-consultora de
`FUNDAMENTOS §2`: *"lo solucionamos" = te acomodamos sobre lo que ya existe*.

### P2 · Dos motores sobre un mismo proceso (lo que construimos esta línea)
Cada proceso (facturación, cuentas a cobrar, caja, catálogo…) existe como **un `ScopeItem` con dos
perfiles**: **`lite`** (el comerciante, lo mínimo que resuelve) y **`enterprise`** (la empresa mediana, el
proceso completo). El perfil es **ortogonal al rubro** (Blueprint) y al aislamiento (ADR-001): un mismo
Blueprint corre en lite o enterprise; un mismo perfil aplica a muchos rubros. **No son dos productos ni
dos códigos** — es un motor con dos regímenes.

### P3 · Crecé sin migrar (la promesa nueva, invariante dura)
**`enterprise ⊇ lite`**: subir de perfil es **aditivo** — se **encienden** pasos/campos/controles, nunca
se reescribe ni se migra de sistema. El comerciante que crece **no cambia de ERP**: crece dentro del mismo
tenant. Esto es lo que SAP GROW promete al mid-market (adopción rápida, camino de crecimiento) llevado a la
pyme argentina: **empezás mínimo y escalás sin dolor de migración**. Es también la forma sana de cumplir la
promesa de marca (`FUNDAMENTOS §2`) sin caer en desarrollo a medida.

### P4 · Argentinizado y humano donde corresponde (Fiori + ADR-044/046)
Tomamos el **rigor enterprise y el lenguaje de diseño Fiori** (rol-based, coherente, accesible) pero
**argentinizado** (ADR-044): criollo claro, fiscal ARCA/AFIP, Mercado Pago/transferencia, WhatsApp-first,
bolsillo de la pyme. Y **de-sesgo por zona** (ADR-046): humano/cálido en venta·demo·atención, estándar y
preciso en código·fiscal·cálculos. *Lo mejor de SAP, hablando como argentino.*

### P5 · Personalización ASIMÉTRICA por perfil — preset-IA al micro, estándar-con-carácter a la pyme
La experiencia hiper-personalizada (`FUNDAMENTOS §5`) sigue siendo **de producto, no de discurso**, pero
**la dosis de personalización es DISTINTA por perfil** (decisión del dueño, 2026-07-08):

- **Micro / comerciante (`lite`) → MÁXIMA personalización, vía preset-IA.** El **preset por IA** (ADR-034)
  es el motor: ingesta de marca del cliente → cada negocio arranca sintiéndose **suyo** (branding, catálogo,
  identidad extraídos por IA). La personalización **vende el volumen self-serve** y es lo que hace el alta
  auto-servible — condición para que el costo cierre (activar a escala, no configurar a mano).
- **Pyme / empresa (`enterprise`) → se ESTANDARIZA, menos personalización, para DAR CARÁCTER.** Menos
  configuración a medida y más **producto opinado y consistente**. Estandarizar tiene triple ganancia:
  **(a)** baja la mano de obra por cliente (el cuello real, `costos §4`); **(b)** refuerza el **anti-rechazo
  enterprise** (un producto opinado y sólido lee "serio/plataforma", no "juguete que se configura", ADR-059
  D8); **(c)** le da **carácter de marca** — identidad fuerte que el cliente adopta, no una plantilla vacía
  que tiene que llenar. El preset-IA acá se usa poco o nada; la pyme entra a un estándar con personalidad.

> **En una línea:** *al comerciante lo enamoramos haciéndolo sentir único (preset-IA); a la empresa la
> convencemos con un producto estándar de carácter fuerte.* Es coherente con `enterprise ⊇ lite`: el estándar
> enterprise no quita nada del lite, solo cambia **cuánto se personaliza el alta**, no qué se puede hacer.

## Cómo se mezcla (mapa explícito de la mixtura)

| Capa | Qué aportó | Cómo queda en GROW-AR |
|---|---|---|
| **SAP Public Cloud** | scope items = mejor práctica **activable** | P1: activar, no programar (fundación de módulos ADR-054) |
| **SAP GROW** (mid-market) | adopción rápida + camino de crecimiento | P3: crecé sin migrar (`enterprise ⊇ lite`) |
| **SAP Fiori** | lenguaje de diseño rol-based/accesible | P4: rigor Fiori **argentinizado** (ADR-044), lo chequea el Gate (ADR-040) |
| **Visión GSG** | un Core, tenant/Blueprint/Plugin, la promesa, hiper-personalización | Base intacta (`FUNDAMENTOS §1-§6`); P2/P5 la extienden |
| **Lo que construimos** | dos perfiles lite/enterprise + variante (ADR-055) | P2: dos motores sobre un mismo proceso |
| **Realidad de costo** | el cuello es la mano de obra, no el server | P5: auto-servible por diseño (preset IA) para que escale |

## Consecuencias

- **(+)** Un relato único que **no descarta nada**: la visión GSG queda de base, SAP entra como *cómo*
  (activar/crecer/Fiori) argentinizado, y lo que construimos (dos perfiles) es el motor.
- **(+)** El **segmento micro y el pyme comparten producto** (mismo Core, distinto perfil) → una sola base
  para mantener, coherente con la economía de `costos-por-segmento.md`.
- **(+)** "Crecé sin migrar" es un **diferencial vendible** y a la vez una **regla de arquitectura**
  (invariante `enterprise ⊇ lite`), no solo marketing.
- **(−)** Obliga a diseñar cada `ScopeItem` con la **disciplina del invariante aditivo** — un perfil
  enterprise no puede *quitar* lo que el lite hace. Es trabajo de diseño extra por proceso (asumido; es la
  garantía de "sin migrar").
- **(−)** El modelo de dos perfiles es **fundamento documentado, no construido**: hoy existe la fundación
  de módulos (ADR-054); el **ABM de `ScopeItem` con perfiles** es reingeniería posterior (definir ≠
  construir, como ADR-055). Este ADR fija el *marco*, no entrega código.

## Alcance de este ADR (definir ≠ construir)

Este ADR **adopta la filosofía y actualiza el criterio rector** (`FUNDAMENTOS §11`). **No** implementa el
motor de perfiles ni migra módulos — eso es una `/sesion-feature`/reingeniería posterior, con su Gate. Lo
inmediato y reversible es **documental**: este ADR + la nueva §11 de FUNDAMENTOS + la fila en INDEX.

— Elaborado por GSG (PMO / Arquitecto de Solución — reversible, doc-only)
