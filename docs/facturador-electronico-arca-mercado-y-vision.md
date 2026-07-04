# Facturador electrónico con ARCA — mercado y visión de producto

**Uso interno** (founders/equipo), no para el cliente. Relevado el 2026-07-04 desde
la web pública de cada competidor (no de memoria — estándar de sesión de negocio).
Objetivo: decidir si "facturador electrónico propio con conexión a ARCA" es una
línea de producto que abrimos, y **cómo** se para frente a lo que ya existe. Las
decisiones estructurales que dispara van como handoff a `/sesion-arquitectura`
(ver §6), no se resuelven acá.

> **Contexto en nuestra arquitectura.** Esto no arranca de cero: los ADR ya
> conciben **ARCA como Plugin** que hace *solo* la autorización fiscal (el CAE),
> mientras el Core es dueño de la Factura y del cálculo de impuestos.
> - `InvoiceCreated` (Core, vía outbox) → **Plugin ARCA** → comando
>   `RegisterFiscalDocument(invoiceId, cae, vencimientoCae)` de vuelta al Core
>   (ADR-002).
> - La Factura del piloto hoy es un **documento interno sin CAE**; el CAE real es
>   Fase 2 (ADR-003 §Factura, ADR-006 Tax Engine diferido).
> - "Diseño detallado del Plugin ARCA" ya figura como próximo paso en
>   `docs/PROXIMOS-PASOS.md`.
>
> El pedido "abrir un tenant/producto facturador propio" se traduce, en esta
> arquitectura, en tres preguntas concretas: (a) ¿el conector con ARCA lo
> **construimos** (WS propios) o lo **compramos** (API de un tercero)?; (b) ¿el
> facturador es un **vertical/tenant propio** o vive embebido en nuestros
> verticales?; (c) ¿qué alcance de comprobantes es el mínimo viable? Las tres son
> arquitectura → §6.

---

## 1. Cómo funciona ARCA por debajo (el terreno común a todos)

Todo producto de este mercado, incluido lo que construyamos nosotros, termina
hablando con los mismos web services de ARCA (ex AFIP):

- **WSAA** — autenticación: se firma un ticket con el **certificado digital** del
  contribuyente y se obtiene un token con vencimiento.
- **WSFEv1** (`wsfev1`) — factura electrónica: emite comprobantes **A / B / C / M**
  (con y sin detalle de ítems), devuelve el **CAE** (Código de Autorización
  Electrónico) y su vencimiento; soporta CAEA para alto volumen.
- El **CAE vence** (típicamente ~10 días hábiles), la **numeración es correlativa
  por punto de venta**, y hay reglas de contingencia. Manejar esto bien es el 80%
  del trabajo real de un facturador — no es "pegarle a un endpoint".

**Lo que esto implica para nosotros:** homologación en el entorno de testing de
ARCA, manejo de certificados por tenant, y mantenimiento ante cambios normativos
(que ocurren seguido). Es exactamente la carga que los jugadores API-first venden
como servicio (ver §2.C).

Fuentes: [ARCA — Web Services de factura electrónica](https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp) ·
[ARCA — Factura electrónica](https://www.afip.gob.ar/fe/).

---

## 2. El mercado, en tres segmentos

El mercado argentino está **partido en tres**, y cada segmento compite por cosas
distintas. Entender esta partición es lo que define dónde nos paramos.

### A. Facturadores oficiales gratuitos de ARCA — el piso

El competidor gratis contra el que todos se miden.

| Producto | Qué es | Límite duro |
|---|---|---|
| **Comprobantes en Línea** | Web con clave fiscal, cargás y emitís con CAE | Manual, **5–10 min por comprobante**, no conecta stock ni contabilidad |
| **Facturador Móvil / Simplificado** | App; admin de clientes, productos, plantillas | Monotributo; **tope $500.000 por operación** |

**Lectura:** son gratis y 100% legales, pero **lentos y aislados**. El dolor que
monetiza todo el resto del mercado es *volumen + integración*: nadie paga por
"emitir una factura", pagan por no perder 10 minutos y por que la factura salga
sola desde donde ya trabajan.

Fuentes: [facturador.afip.gob.ar](https://facturador.afip.gob.ar/) ·
[ARCA — Facturador Móvil](https://www.afip.gob.ar/facturadormovil/).

### B. SaaS de facturación + gestión (PyME / monotributo) — el océano rojo

Jugadores maduros, muchos con **plan gratis de entrada** y respaldo de estudio
contable. Precios en ARS/mes, casi todos **+ IVA**.

| Producto | Precio de entrada | Enfoque |
|---|---|---|
| **Xubio** | Gratis (10 fact/mes) · PyME desde ~$3.500 | Facturación + libro IVA + reportes contables |
| **TusFacturasApp** | Desde ~$13.200 · planes por volumen (5 / 100 / 1.000 / 3.000 comprobantes) | Facturación + stock, presupuestos, remitos, abonos recurrentes; homologado ARCA desde 2015, respaldo contable |
| **Colppy** | Desde ~$5.000 | Contabilidad completa, cobranzas, conciliación — **orientado a estudios contables** |
| **Contabilium** | (no publica lista) | Contabilidad + CRM/ventas integrado |
| **Alegra / YoFacturo** | Rango similar, + IVA | Regionales / emergentes, misma propuesta |

**Lectura:** este segmento está **saturado y con incumbentes de 10+ años**.
Compiten en features contables y en precio. Entrar de frente como "otro SaaS de
facturación genérico" es pelear en desventaja: ellos ya tienen homologación
madura, respaldo de estudio contable y plan gratis. **No es acá donde ganamos.**

Fuentes: [rql — Cuánto cuesta un software de facturación 2026](https://ecosystem.rqlsistemas.com.ar/blog/cuanto-cuesta-software-facturacion-argentina-2026) ·
[TusFacturasApp — Tarifas](https://www.tusfacturas.app/tarifas-tusfacturas-todos-los-planes.html) ·
[Contabilium — Sistema de facturación](https://contabilium.com/blog/sistema-facturacion-electronica/).

### C. API-first / para integradores — el segmento que nos importa

El más cercano a nuestra visión: no venden una pantalla, venden **la capa que
convierte "quiero facturar" en un CAE**, para que otro producto la embeba.

| Producto | Propuesta |
|---|---|
| **TusFacturas API** | "By developers, for developers", JSON, homologada ARCA desde 2015, sandbox gratis, soporte técnico + contable, actualización semanal ante cambios normativos |
| **AfipSDK** | +100k descargas desde 2017, el SDK preferido de devs; A/B/C/E/MiPyME, exportación, turismo, CAE + QR |
| **iFactura / Sistemas360 / facturap.ar / ARCA API** | APIs REST (algunas sin SOAP, algunas gratis) para ecommerce (MercadoLibre, WooCommerce, Tienda Nube) |
| **Facturante** (Linkside SA) | Facturación + API con partnerships fuertes: Mercado Pago, Tienda Nube, Bejerman/Thomson Reuters |

**Lectura clave para nuestra decisión:** este segmento **ya resolvió la parte
fea** (WSAA/WSFE, certificados, homologación, cambios normativos) y la vende como
commodity. Eso nos abre un **build-vs-buy** real para el Plugin ARCA: en vez de
construir la integración fiscal desde cero, podemos consumir una de estas APIs por
debajo del plugin y llegar a producción sin cargar con la homologación ni el
mantenimiento normativo. Ver §5.

Fuentes: [TusFacturas — API para desarrolladores](https://developers.tusfacturas.app/) ·
[AfipSDK — API de factura electrónica](https://afipsdk.com/api-factura-electronica/) ·
[Facturante](https://web.facturante.com/) ·
[iFactura — API](https://www.ifactura.com.ar/api/).

---

## 3. Dónde ganamos (diferencial defendible)

No competimos en el eje "más features contables" ni en "más barato" — ahí perdemos
(§4). Ganamos en un eje que el mercado tiene **descubierto**:

- **Facturación que aparece sola en el flujo operativo, no en una pantalla de
  contabilidad.** El mercado está partido entre *gratis pero manual* (ARCA) y
  *potente pero para el contador* (Colppy/Contabilium). Nuestra tesis de producto
  (ADR-009: "diseño para la recepcionista, no para el ERP") cae justo en el hueco:
  cobrás el turno → la factura con CAE sale sola, cero pantalla fiscal. Es la
  continuación natural de lo que ya construimos (precio congelado, seña, cupones).
- **Multi-tenant real desde el diseño.** La mayoría de estos productos son
  una-cuenta-una-empresa. Nuestro Core ya es multi-tenant con aislamiento
  (ADR-001/015, RLS en gate previo al 2º tenant por ADR-018). Eso habilita
  escenarios que ellos no dan barato: un mismo operador facturando para varios
  puntos de venta / razones sociales con aislamiento fuerte.
- **Facturador propio = sin costo por comprobante de un tercero, a escala.** Los
  verticales que abramos (estética hoy, los que sigan) facturan **dentro** de
  nuestro producto. Si a volumen construimos el conector propio (§5), el margen es
  nuestro en vez de pagarle a TusFacturas/AfipSDK por comprobante.
- **Integración operativa, no solo fiscal.** El CAE es el final de una cadena que
  ya tenemos entera (agenda → orden → pago → factura). Un facturador suelto
  arranca de la factura; nosotros arrancamos del turno.

---

## 4. Dónde perdemos (honesto — no llevar esto al cliente)

- **No estamos homologados.** WSFE exige certificado, entorno de testing y
  homologación por tipo de comprobante. TusFacturas (2015) y AfipSDK (2017) llevan
  ~una década de madurez y **actualización semanal ante cambios normativos**. Eso
  hoy no lo tenemos y es caro de sostener.
- **Sin respaldo de estudio contable.** TusFacturas y Colppy lo pregonan como
  garantía comercial. Nosotros no tenemos esa figura.
- **Tax Engine diferido (ADR-006).** No hay libro IVA, retenciones/percepciones,
  Convenio Multilateral ni régimen de información. El segmento B lo tiene de fábrica.
- **Economía de facturador puro es adversa.** Bajo ticket, alto volumen, y con un
  **gratis oficial abajo** y **Xubio con plan gratis**. Competir en precio como app
  suelta es perder. Nuestro diferencial **no es precio, es integración** — si no hay
  integración, no hay caso.
- **Alcance de comprobantes = trabajo real.** A/B/C/M/E, notas de crédito/débito,
  MiPyME (FCE), turismo, exportación: cada uno es homologación aparte. El mínimo
  viable es **B/C para monotributo y servicios** (lo que el piloto necesita),
  no "el facturador completo".

---

## 5. Recomendación de negocio: Buy primero, Build a escala

La conclusión comercial del relevamiento es clara y tiene una consecuencia directa
sobre el roadmap del Plugin ARCA (Fase 2):

1. **No abrir un facturador horizontal que compita de frente con el segmento B.**
   Es un océano rojo con incumbentes de 10 años, gratis oficial abajo y contables
   arriba. Ahí no tenemos ventaja.
2. **Sí abrir el facturador como capacidad embebida en nuestros verticales**, donde
   el diferencial (§3) es defendible. El "producto propio facturador" es esto: el
   Core factura y el Plugin ARCA le pone el CAE, dentro de nuestro producto.
3. **Para el conector con ARCA: comprar antes que construir.** Usar **TusFacturas
   API o AfipSDK** como el motor del Plugin ARCA nos lleva a producción sin cargar
   con homologación ni mantenimiento normativo — que es justo lo que el segmento C
   vende como commodity. El contrato del plugin (ADR-002: evento `InvoiceCreated` →
   `RegisterFiscalDocument`) queda **igual**: el tercero es un detalle de
   implementación *detrás* del plugin, reemplazable. Evaluar **construir** el
   conector WSFE propio recién cuando el volumen haga que el costo-por-comprobante
   del tercero supere el costo de sostener la integración nosotros.

Esto **no desvía** el foco del piloto: acelera la Fase 2 (CAE real) y mantiene la
opción de internalizar más adelante sin reescribir el Core.

---

## 6. Handoff a arquitectura (no se decide en esta sesión)

Esta es una sesión de negocio: relevó el mercado y fijó la visión. Las decisiones
estructurales que dispara van a `/sesion-arquitectura`, con el material de acá como
insumo. Se agregan a `docs/PROXIMOS-PASOS.md`:

- **`/sesion-arquitectura Plugin ARCA: contrato de eventos/comandos + build-vs-buy del conector`**
  — retoma el "Diseño detallado del Plugin ARCA" que ya estaba en la cola y le suma
  la dimensión de este relevamiento: definir el contrato concreto
  (`InvoiceCreated` → `RegisterFiscalDocument`, manejo de CAE/vencimiento/errores de
  ARCA, idempotencia por AMD) **y** decidir el conector inicial (TusFacturas API vs
  AfipSDK vs WS propios) como implementación reemplazable detrás del plugin.
- **Alcance mínimo de comprobantes**: acordar que el MVP fiscal es **B/C
  monotributo/servicios**, no el facturador completo — para no sub-dimensionar la
  homologación ni sobre-construir.
- **Modelo de tenant/vertical**: si el facturador se ofreciera como vertical propio
  (no solo embebido en estética), eso toca provisioning de tenants (hoy inexistente,
  ya listado en próximos pasos del INDEX). Se menciona como marco, no se decide acá.

---

## 7. Uso de este documento

Insumo para la sesión de arquitectura del Plugin ARCA y para la conversación de
founders sobre si abrimos esto como línea. **No** es material de venta al cliente
(las brechas de §4 son internas). Actualizar si cambia la oferta pública de los
competidores relevados o si se toma la decisión build-vs-buy de §5.
