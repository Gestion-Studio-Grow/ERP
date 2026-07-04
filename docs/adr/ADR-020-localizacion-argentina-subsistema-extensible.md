# ADR-020: Localización fiscal argentina como subsistema extensible (no "el plugin ARCA")

**Estado:** Aceptado — pendiente de implementación (2026-07-04)
**Depende de:** ADR-002 (familia de plugins + comando público), ADR-006 (Tax Engine en el Core; el plugin solo hace I/O externo), ADR-019 (Plugin ARCA — emisión con CAE), ADR-001 (todo nace con `tenantId`).
**Generaliza:** ADR-019 pasa de "el Plugin ARCA" a **primer módulo** de este subsistema. No cambia ninguna de sus decisiones.
**No autoriza construir** nada más allá del alcance de ADR-019 (B/C). Fija el *frame* para que todo lo demás sea additivo; cada módulo se dispara por demanda real (ADR-006).

**Insumos:** `docs/adr/ADR-019-plugin-arca-contrato-y-conector.md`, `docs/diseno-producto-middleware-fiscal.md`.

---

## 1. Problema

ADR-019 resolvió **emisión de comprobantes** (WSFEv1, B/C, CAE). Pero "localización argentina" es un subsistema mucho mayor: padrón/constancia de inscripción, FCE MiPyME, exportación, ingesta de "Mis Comprobantes", regímenes informativos (Libro IVA Digital, CITI, retenciones), y todo el **eje provincial** de Ingresos Brutos + Convenio Multilateral (ARBA, AGIP, API… + COMARB), que ni siquiera es ARCA.

Si el frame queda como "el Plugin ARCA que emite facturas", cada obligación nueva —validar un CUIT contra padrón, bajar Mis Comprobantes para el producto de contadores, calcular una percepción de IIBB de ARBA— sería **re-arquitectura**: nuevo naming, nueva forma de config, nueva integración desde cero. El pedido es dejar la herramienta **escalada para toda la localización** sin caer en construirla toda ahora (lo que ADR-006 prohíbe por especulativo).

La tensión a resolver: **fijar una estructura que haga aditiva toda la superficie fiscal argentina, a costo cero hoy, sin construir un solo módulo de más.**

## 2. La superficie real (verificada, no de memoria)

Dos ejes, con naturalezas distintas — y esa diferencia es lo que la arquitectura tiene que reflejar:

### Eje Nacional — ARCA (todos los WS cuelgan de **WSAA**: firma con certificado → token por servicio)
- **Emisión:** `WSFEv1` (A/B/C/M sin detalle), `WSMTXCA` (A/B con detalle), `WSFEXv1` (exportación, tipo E).
- **FCE MiPyME:** `WSFECRED` (factura de crédito electrónica, RG4367).
- **Padrón / consulta:** constancia de inscripción y condición fiscal (padrón A5/A13/WSPUC) — necesario para facturar A y para validar receptores.
- **Ingesta:** "Mis Comprobantes" (emitidos/recibidos) — **el corazón del producto para contadores**.
- **Regímenes informativos:** Libro IVA Digital, CITI, retenciones (SICORE/SIRE).
- **Por rubro (largo plazo):** Carta de Porte / CTG (agro), remito electrónico.

### Eje Provincial — Ingresos Brutos + Convenio Multilateral (**~24 fiscos + COMARB**, fragmentado)
- **Fiscos:** ARBA (Bs As), AGIP (CABA), API (Santa Fe), y el resto. Cada uno su padrón de alícuotas y su régimen.
- **Convenio Multilateral:** coeficiente unificado, presentación en **SIFERE Web** (COMARB).
- **Regímenes de recaudación:** SIRCAR (ret./perc. de convenio), SIRCREB (bancaria), SIRPEI (importación); padrones de riesgo fiscal por provincia.

**Diferencia clave:** el eje nacional es **un CUIT, un WSAA, un proveedor** (homogéneo). El provincial es **N jurisdicciones heterogéneas, sin WS unificado, y con mucho cálculo** (coeficientes, alícuotas por padrón). Meterlos en el mismo saco es el error a evitar.

Fuentes: [ARCA — WS de factura electrónica](https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp) · [AGIP — Convenio Multilateral](https://www.agip.gob.ar/impuestos/convenio-multilateral) · [ARBA — regímenes de recaudación](https://www.arba.gov.ar/Informacion/Agentes/Recaudacion/regimenes.asp).

## 3. Alternativas evaluadas

- **A. Dejar ADR-019 como "el Plugin ARCA".** Costo cero hoy. Pero el naming, la config y el conector presuponen "emitir facturas"; agregar padrón/ingesta/IIBB obliga a re-abrir la estructura cada vez. El encajonamiento es silencioso: no duele hasta el 2º módulo, y ahí duele caro. **Descartada.**
- **B. Construir la localización completa ahora.** Cubre todo, pero es exactamente el trabajo especulativo que ADR-006 evita: enorme, sin demanda concreta (el piloto solo necesita B/C), y el eje provincial es un pozo sin fondo. **Descartada.**
- **C. Frame extensible ahora, construcción aditiva por demanda** *(elegida)*. No construye ningún módulo nuevo. Fija cuatro cosas que hacen que agregar cualquier capacidad futura sea "registrar un módulo", no "re-arquitecturar", y documenta el mapa completo para que la superficie sea legible. ADR-019 queda como el primer módulo de esa estructura.

## 4. Decisión

Se adopta **C**. Cuatro piezas estructurales + un mapa. Ninguna implica construir más que ADR-019.

### D1 — Subsistema "Localización AR" como familia de plugins (ADR-002), con dos namespaces
No existe "el Plugin ARCA" como cosa única: existe el **subsistema de Localización AR**, con dos namespaces de conectores por su naturaleza distinta:
- **`ar.nacional`** (ARCA): comparten WSAA/certificado por CUIT.
- **`ar.provincial`** (IIBB/CM): un conector por fisco + COMARB, heterogéneos.
El Core habla con capacidades, no con "ARCA". Esto evita que la fragmentación provincial contamine el camino nacional.

### D2 — Conector como **registro de capacidades**, no una función fija
La interfaz `FiscalConnector` de ADR-019 se generaliza: un conector **declara** qué capacidades soporta, y el Core pide **por capacidad**, no por proveedor. Capacidades (vocabulario inicial, additivo):
`emitir-comprobante` · `consultar-padron` · `ingestar-comprobantes` · `emitir-fce` · `presentar-regimen-informativo` · `consultar-alicuota-provincial`.
AfipSDK (ADR-019) declara varias nacionales (`emitir-comprobante`, y a futuro `consultar-padron`, `ingestar-comprobantes`); los fiscos provinciales serán conectores aparte que declaran las suyas. Agregar una capacidad = registrarla, no rehacer la interfaz. El contrato de resultado sigue siendo el de ADR-019: un **comando público idempotente** del Core es la única puerta de escritura del plugin.

### D3 — `TenantFiscalConfig` extensible (nacional + N provinciales)
La config fiscal por tenant de ADR-019 se diseña **para crecer**, no como columnas fijas:
- **Identidad nacional:** CUIT, condición IVA, punto(s) de venta, referencia a credencial ARCA.
- **Jurisdicciones provinciales (0..N):** por cada una — IIBB local vs Convenio Multilateral, nº de inscripción, y referencia a su padrón/credencial. Modelada como **relación** (`TenantJurisdiccion`), no como campos sueltos, porque un tenant puede sumar provincias con el tiempo.
Esto es lo que hace el diseño **multi-CUIT y multi-jurisdicción** natural — el mismo mecanismo sirve a la estética (un CUIT, una provincia) y a un cliente de estudio con Convenio Multilateral en cinco provincias, **sin caso especial**.

### D4 — La línea del Tax Engine (ADR-006) se vuelve crítica y se refuerza
A esta escala, la regla de ADR-006 deja de ser matiz y pasa a ser estructural: **todo lo que calcula vive en el Core** (IVA, percepciones, retenciones, IIBB local, coeficiente unificado de Convenio Multilateral); **los conectores solo hacen I/O externo** (autorizar, consultar padrón, presentar, ingestar). Sin esta línea, la complejidad provincial —que es 90% cálculo— se derramaría en las integraciones y las volvería inmantenibles. Un conector nunca calcula un impuesto; a lo sumo **consulta un dato** (una alícuota de padrón) que el Core usa para calcular.

### D5 — Mapa de capacidades por fases (el "escalado" documentado)
Superficie completa, legible, cada módulo disparado por demanda real (no se construye hasta el disparador):

| Fase | Capacidad | Namespace | Disparador |
|---|---|---|---|
| **1 (ADR-019)** | Emisión B/C (WSFEv1) | `ar.nacional` | Piloto estética / Fase 2 — **en curso** |
| **2** | Consultar padrón (constancia/condición IVA) | `ar.nacional` | Facturar A (receptor RI) y validar CUIT en el producto contador |
| **2** | Ingestar "Mis Comprobantes" | `ar.nacional` | Producto para estudios contables (tras gate de validación) |
| **3** | Emisión con detalle (WSMTXCA) / Notas C/D | `ar.nacional` | Rubros con detalle de ítems / devoluciones |
| **3** | FCE MiPyME (WSFECRED) | `ar.nacional` | Clientes que operan factura de crédito |
| **4** | Percepciones/retenciones + padrón de alícuotas (ARBA/AGIP/API) | `ar.provincial` | Primer cliente con agente de recaudación / IIBB relevante |
| **4** | Convenio Multilateral (coef. unificado, SIFERE) | `ar.provincial` | Primer cliente multi-jurisdicción |
| **5** | Regímenes informativos (Libro IVA Digital, CITI) | `ar.nacional` | Producto contador maduro |
| **5** | Exportación (WSFEXv1) / Carta de Porte / remito | `ar.nacional` | Rubro que lo requiera |

## 5. Impacto

- **ADRs que toca:** **enmienda de naming/frame** sobre ADR-019 — su "Plugin ARCA" pasa a ser "primer módulo (`emitir-comprobante`) del subsistema de Localización AR". Sus decisiones técnicas (FiscalDocument, outbox+comando idempotente, B3, AfipSDK, config por tenant) quedan **intactas**; solo se generaliza la interfaz a capacidades (D2) y la config a extensible (D3). **Refuerza ADR-006** (la línea cálculo-en-Core / I/O-en-plugin pasa a ser estructural). No toca RLS (ADR-001/010).
- **Código (cuando se implemente ADR-019, en `/sesion-feature`):** nacer ya con la forma extensible — `FiscalConnector` con capacidades declaradas (aunque haya una sola), `TenantFiscalConfig` + `TenantJurisdiccion` como relación (aunque arranque con una jurisdicción), y el namespace `ar.nacional` explícito. **Costo marginal ~cero** hacerlo bien desde el primer módulo; costo alto retrofitearlo después. Ese es todo el "trabajo" que este ADR agrega: una forma, no un módulo.
- **Migración:** ninguna adicional a la de ADR-019 (solo que sus tablas nazcan con la forma extensible).
- **BACKLOG:** no invalida ítems; documenta la superficie fiscal como roadmap legible.
- **Anti-especulación (explícito):** este ADR **no** autoriza construir Fase 2+ del mapa. Cada fila se abre con su disparador. Lo único que se adopta hoy es la *forma*, para que abrir cada fila sea aditivo.

## 6. Decisión final

Se acepta **C**: "Localización AR" es un subsistema extensible con dos namespaces (nacional/provincial), conector como registro de capacidades, config fiscal por tenant extensible a N jurisdicciones, y la línea Tax-Engine-en-Core reforzada como estructural. ADR-019 es su primer módulo y se implementa naciendo con esta forma. Nada más se construye hasta su disparador. Así la herramienta queda **escalada para toda la localización argentina** sin pagar por lo que todavía no se usa.
