# Nota técnica — Armador de presupuestos de viaje: fuente de datos, conectores y oferta capturada

**Tipo:** nota técnica (diseño + prueba de viabilidad), no ADR numerado — evita colisión de numeración
con la rama en paralelo. Si se adopta como decisión, se promueve a ADR con su número al mergear.
**Fecha:** 2026-09-09 · **Rama:** `claude/azimut-viajes-consolidacion-gfh9nv` · **Célula:** Ingeniero de
Backoffice (ejecución, Sonnet) · **Estado:** esqueleto vertical construido detrás de flag **OFF**, migración
**escrita y SIN aplicar** (Gate 2), sin deploy.
**Spec funcional que implementa:** `docs/producto/spec-armador-presupuestos-viaje.md` (backoffice-producto).
**Depende de:** ADR-002 (Core/Blueprint/Plugin) · ADR-017 (RBAC) · ADR-018 (RLS) · ADR-054 (catálogo de
módulos) · ADR-055 (variante: objeto se crea una vez y se asigna) · ADR-057 (dinero).

---

## 0. Calibración (ADR-052) — principios que guiaron esta pasada

- **Fuente de datos legítima o nada.** Sin scraping. Solo APIs con términos claros. Si sin contrato comercial
  no hay módulo viable, se dice con esas palabras.
- **Capability nativa del Core, no tabla del blueprint** (ADR-002 mecanismo B): "presupuesto de viaje con
  ofertas capturadas" es un concepto nuevo y reutilizable por cualquier agencia. El conector externo es la
  parte hexagonal (port + adapters), mismo molde que `src/plugins/pagos`.
- **Variante al pie (ADR-055):** la **oferta capturada** es objeto maestro con ABM propio; la **asignación**
  oferta→opción es la relación explícita con su ABM. Nunca "todas con todas".
- **`tenantId` en toda entidad**, predicado explícito y `tenantTransaction`; dinero `Decimal(14,2)` en DB,
  `number` + `round2` en memoria (ADR-057).
- **Invariante dura** — ningún precio sin `capturadoEn`, sin `unidad`, sin `vigenteHasta` ni sin `certeza`;
  ningún alojamiento sin `baseOcupacion` — defendida en tres capas: tipo, core y schema.
- **Reversible:** flag `VIAJES_ENABLED` OFF, migración sin aplicar, cero cambios en `docs/` ajenos. Zona
  de de-sesgo (ADR-046): código estándar y preciso; copy en criollo claro (ADR-080).

---

## 1. La fuente de datos — lo primero, antes que el código

### 1.1 Advertencia de método (honesta)

Esta sesión **no tiene herramienta de búsqueda web**: el set de herramientas de la célula es
Read/Grep/Glob/Bash/Edit/Write, y por Bash tanto `curl` como `fetch` de Node fueron bloqueados por la
política de egreso del entorno (403 del proxy; la denegación es de política, no se reintenta). El
coordinador informa que otros agentes de la sesión sí tienen `WebSearch`: **los ítems marcados
[C:media] o [verificar] deben confirmarse con ese agente** antes de una reunión. Lo que sigue es el estado
de las plataformas según el conocimiento del modelo (corte mediados de 2026) con **confianza explícita por
dato** ([C:alta/media/baja]) y, al final de §1.3, el **checklist de verificación con URL**. El diseño de
§2 NO depende de esos números: depende de tres hechos estructurales estables (§1.5).

### 1.2 Lo que se descarta y por qué

**Scrapear Booking / Kayak / Despegar / Google Flights: NO.** Viola términos de uso, se rompe con cada
cambio de HTML, termina en bloqueo de IP y —lo peor para una agencia— entrega precios que no se pueden
defender ante el cliente (sin id de oferta, sin vigencia). Fuera de la mesa. Lo mismo para cualquier "API de
Booking / Skyscanner" vendida en marketplaces (RapidAPI y similares) y SerpApi/Google Flights: scrapers no
autorizados, sin id ni vigencia, se rompen sin aviso y exponen a la agencia a bloqueo. No es una vía, es un
pasivo.

### 1.3 PREGUNTA CENTRAL DEL DUEÑO — ¿hay alguno GRATUITO, de AUTO-REGISTRO SIN REQUISITOS y ACTIVACIÓN INSTANTÁNEA?

**Respuesta corta: sí, para COTIZAR y DEMOSTRAR — no para VENDER.** Amadeus Self-Service (vuelos + hoteles)
y el sandbox de Hotelbeds APItude (hoteles) dan credenciales **al instante, gratis y sin hablar con nadie**.
Lo que esas credenciales devuelven son **tarifas públicas o de prueba**: sirven para armar el presupuesto,
demostrar el módulo y entrenar al operador, **no** son el precio neto que Azimut revende. El precio vendible
viene del **mayorista** (que es quien vende y factura; Azimut cobra comisión) — y eso llega por contrato,
portal B2B o carga manual con la misma invariante. Encaja exacto con **demo → venta → inversión**.

**Contexto del cliente que cambia la lectura:** Azimut Viajes es agencia real (califica donde piden
"agencia"), **no factura ni cobra**: el operador mayorista vende y factura, Azimut comisiona. Entonces el
módulo **no necesita emitir** (descarta la necesidad de Duffel/consolidador) y sí necesita **cotizar con
trazabilidad** y **cargar el precio del mayorista** con unidad + base + fecha de captura.

**Corrección a lo que se le dijo al dueño sobre bedbanks:** la afirmación "los bedbanks entregan precios
solo contra contrato firmado" es **cierta para PRODUCCIÓN y falsa para SANDBOX**. Hotelbeds APItude entrega
credenciales de **test** por auto-registro instantáneo (precios de prueba, no reservables); RateHawk da
acceso de agencia tras un alta simple con revisión humana. **[C:alta]** para Hotelbeds test, **[C:media]**
para los plazos de RateHawk.

**Matriz — las cinco preguntas por proveedor** (✅ = sí · ⛔ = no · ⚠️ = con condición):

| Proveedor | 1. ¿Cuenta uno mismo, sin comercial? | 2. ¿Credencial al instante o revisión humana? | 3. ¿Capa gratuita real? ¿Qué se puede hacer? | 4. ¿Qué separa sandbox de producción y qué exige cruzar? | 5. ¿Sirve para Argentina / vuelos desde AR? |
|---|---|---|---|---|---|
| **Amadeus Self-Service** | ✅ Registro web con email, se crea la app y listo **[C:alta]** | ✅ **Test: instantáneo** (API key + secret al crear la app). **Producción:** se pide desde el portal ("Get production key"): formulario + datos de facturación (tarjeta); revisión **~1–3 días hábiles**, sin contrato **[C:media-alta]** | ✅ **Test gratis** con cuota mensual por API (orden de **miles de llamadas/mes**) y rate limit (~10 req/s) **[C:media — verificar cifra]**. Producción: **cuota mensual gratuita chica** y después **pago por llamada (centavos de EUR)** **[C:media]**. Con la capa gratis: buscar y precificar vuelos (Flight Offers Search/Price), listar y cotizar hoteles (Hotel List/Search v3), autocompletar aeropuertos/ciudades | Test = **subconjunto** de aerolíneas/aeropuertos/hoteles, precios **cacheados/de prueba**, sin reserva real. Producción = contenido y precios **reales** (tarifas públicas GDS), pago por uso. **Cruzar: solo billing, sin IATA ni licencia** para buscar/cotizar. **Emitir** (Flight Create Orders) exige acuerdo con **consolidador IATA** — Azimut no lo necesita **[C:alta]** | ✅ Global, sin restricción geográfica de cuenta. **Salvedad argentina:** las low-cost (**Flybondi, JetSMART**) casi no están en GDS → cotización doméstica **incompleta**; Aerolíneas Argentinas e internacionales sí **[C:media-alta]** |
| **Hotelbeds APItude** (bedbank) | ✅ Registro en el portal de desarrolladores **[C:alta]** | ✅ **Test: instantáneo**. **Producción: revisión humana + contrato comercial** con account manager; requiere ser agencia registrada, con crédito/depósito; semanas **[C:alta]** | ✅ Sandbox gratis con **cuota de requests chica** **[C:media — verificar cifra]**: disponibilidad y precios de **hoteles de prueba**, reserva **simulada** | Sandbox = precios **de prueba**; producción = **tarifas netas B2B** reales. **Cruzar: contrato + condición de agencia + garantía** **[C:alta]** | ✅ Opera con agencias argentinas. Solo hoteles **[C:alta]** |
| **RateHawk / Emerging Travel Group** (bedbank) | ✅ Alta online como agencia **[C:media-alta]** | ⚠️ **Revisión humana** del alta (**1–3 días**); API se pide después, con clave de test primero **[C:media]** | ✅ Sin costo por request; margen sobre tarifa neta. Con cuenta aprobada: netas **reales** en el portal B2B (sin API) **[C:media]** | Test = precios de prueba; producción = netas reales con **prepago o crédito**; contrato más liviano que Hotelbeds **[C:media]** | ✅ Fuerte en LATAM; solo hoteles/traslados **[C:media-alta]** |
| **Duffel** | ✅ Registro web; modo test inmediato **[C:alta]** | ✅ Test instantáneo. **Live: verificación de empresa (KYB), días** **[C:media-alta]** | ✅ Test gratis e ilimitado. Live: búsqueda gratis, **cobra por orden emitida** **[C:media]** | Test = "Duffel Airways"; live = ofertas reales y **emisión** (Duffel es el IATA/merchant). Cruzar: KYB + **empresa en país soportado** + prepago | ⚠️ **Probable bloqueo:** la lista de países soportados históricamente **no incluye Argentina** **[C:media — verificar]**. Y Azimut **no emite** |
| **Kiwi.com Tequila** | ⛔ El alta self-serve **se cerró a nuevos partners (2024)** **[C:media-alta]** | — | — | — | ⛔ Descartado |
| **Travelpayouts** (afiliación) | ✅ Alta abierta e instantánea **[C:alta]** | ✅ Instantáneo **[C:alta]** | ✅ Gratis: precios **cacheados** (Aviasales/Hotellook), widgets y deep-links afiliados **[C:alta]** | No hay producción: todo es afiliación. Los precios **no son ofertas cotizables** (sin id reservable, sin vigencia) | ✅ Funciona en AR, pero **solo como referencia**, nunca como precio del presupuesto |
| **TravelgateX** (switch) | ⚠️ Registro online, onboarding por ventas **[C:media]** | ⚠️ Revisión; sandbox con proveedor demo **[C:media]** | ⚠️ Suscripción **[C:media]** | Producción = **tus** contratos conectados a través de TGX | ⛔ No es fuente: sin contratos previos no devuelve nada vendible |
| **Sabre Dev Studio** (mención) | ✅ Registro web para ambiente **CERT** **[C:media-alta]** | ✅ CERT instantáneo; producción exige **PCC** de agencia **[C:media]** | ✅ CERT gratis con límites | Producción = contrato GDS completo | ✅ GDS dominante en LATAM; alternativa a Amadeus si el mayorista opera Sabre |

**Checklist de verificación (15 minutos con `WebSearch` o navegador):** `developers.amadeus.com` →
*Pricing* y *Test vs Production* (cuota gratis mensual por API, precio por llamada, requisitos de la
production key) · `developer.hotelbeds.com` → registro → *My Apps* (key de test al instante; cuota del
sandbox) · `ratehawk.com` / `emergingtravel.com` → *Registro de agencia* (campos y plazo) y *API* ·
`duffel.com/docs` → *Supported countries* (¿Argentina?) · `tequila.kiwi.com` (¿alta cerrada?) ·
`travelgatex.com/pricing` · **Argentina:** Registro de Agentes de Viajes (Ministerio/Secretaría de Turismo,
Ley 18.829) → requisitos del legajo y fondo de garantía.

### 1.4 Los tres hechos estructurales (estables, no dependen de [verificar])

1. **Cotizar ≠ reservar.** Para **buscar y cotizar** existe una vía **self-serve y gratuita en sandbox**
   (Amadeus). Para **emitir/reservar** en producción hace falta un tercero con licencia (consolidador IATA o
   un merchant tipo Duffel). Azimut no emite: no lo necesita.
2. **Tarifa pública ≠ tarifa neta.** Amadeus/Duffel devuelven tarifas públicas. La agencia gana con la
   **tarifa neta** del mayorista/bedbank, y esa **solo llega por contrato de una agencia habilitada** (§1.6).
3. **Los mayoristas locales** (Ola, Juliá, Piamonte, etc.) operan por portal B2B y casi no exponen API
   pública. Por eso el módulo soporta **carga manual asistida** con la misma invariante: el operador copia
   el precio del portal y lo guarda con unidad + base + fecha de captura + vigencia + certeza.

### 1.5 Recomendación de arquitectura (con qué adapter arrancar)

**Arrancar con Amadeus Self-Service (ambiente test) + captura manual**, detrás del port
`ProveedorOfertas`: única opción que cubre vuelos y hoteles **sin contrato**, con sandbox gratis y
credenciales al instante; el módulo **cotiza**, no emite; el port deja Duffel (emisión) y Hotelbeds/RateHawk
(neta) como adapters futuros sin tocar el core. *Sin contrato NO hay tarifas netas ni emisión desde el ERP;
CON registro self-serve SÍ hay un módulo viable de cotización y armado.* Para Azimut (no factura, no emite)
es **exactamente el alcance que hace falta**.

### 1.6 CONSOLIDACIÓN pedida por el dueño — la operación REAL (no sandbox)

> Disciplina: cada afirmación lleva confianza. Donde el dato no es público, se dice **estimado** y se da el
> orden de magnitud. Lo legal-argentino requiere **una consulta de 30 minutos con contador o abogado de
> turismo** antes de decidir: acá está el mapa, no el dictamen.

#### 1.6.1 (VA PRIMERO) Qué pasa si Azimut NO tiene legajo EVT propio — el dato que define qué camino construir

**Marco argentino (Ley 18.829 y su reglamentación) [C:media-alta]:** para vender servicios turísticos al
público en Argentina hay que estar inscripto en el **Registro de Agentes de Viajes** (Ministerio/Secretaría
de Turismo) con un **legajo** (categorías EVT — Empresa de Viajes y Turismo —, Agencia de Turismo, Agencia
de Pasajes) y constituir un **fondo de garantía** (hoy típicamente un **seguro de caución**). Sin legajo, una
persona o empresa **no puede vender ni facturar** servicios turísticos a nombre propio.

**Lo que Azimut declara —"no vende ni factura; el mayorista vende y factura, yo cobro comisión"— es el
modelo de "agente comercial / vendedor freelance de un operador" [C:media]:** legalmente, quien vende es
el **operador (EVT) titular del legajo**; Azimut es un canal comercial que **prospecta, cotiza y arma** el
viaje y percibe una comisión del operador. Ese modelo existe y es común en el mercado argentino, con dos
matices que hay que confirmar con el contador: (a) la **factura de la comisión** que Azimut le emite al
operador (como monotributista o responsable inscripto — es un servicio comercial, no turístico), y (b) que
**toda comunicación al pasajero** deje claro quién es la agencia vendedora (el legajo del operador).

**Consecuencia para los bedbanks (la respuesta directa) [C:media-alta]:** Hotelbeds y RateHawk contratan
en producción con **empresas de turismo habilitadas** — piden razón social, CUIT/identificación fiscal y
**prueba de licencia de agencia** (en Argentina, el **número de legajo**). **Sin legajo propio, Azimut queda
excluida de contratar tarifas netas de bedbank a su nombre.** Hotelbeds: exclusión prácticamente segura
[C:alta] (verificación estricta + crédito). RateHawk: el alta online pide "tipo de negocio"; hay casos de
aceptación de agentes independientes en algunos mercados, pero para operar con prepago exigen empresa
registrada del rubro [C:baja-media] — no se puede prometer.

**Los caminos alternativos reales, de menor a mayor inversión:**

| Camino | Qué es | Qué obtiene Azimut | Qué construye el ERP | Costo / plazo |
|---|---|---|---|---|
| **A. Seguir como agente del mayorista (hoy)** | El operador con legajo vende, factura y contrata bedbanks; Azimut cotiza y arma, cobra comisión | Tarifa neta **vía el portal B2B del mayorista** (ya la tiene hoy); sin contratos propios | **Cotización orientativa por API** (Amadeus) + **captura manual con invariante** desde el portal del mayorista + armado por niveles/opciones + documento + **seguimiento de comisión** por pedido | **$0** de alta. Es lo que se construyó. Si el mayorista tiene **XML/API para agentes** (varios lo dan a pedido), se suma un adapter (1–2 sprints) |
| **B. Sub-agencia / franquicia bajo el legajo de una EVT** | Contrato formal con una EVT que "presta" su legajo (red de agentes, franquicia) | Acceso a los contratos de la EVT (bedbanks incluidos) **a través de ella**; a veces credenciales propias del portal B2B | Lo mismo que A + eventualmente el adapter del bedbank **con las credenciales de la EVT** (las pega ella, no Azimut) | Comisión compartida con la EVT (típicamente la EVT retiene un %); sin costo de alta; plazo: lo que tarde el acuerdo [C:media] |
| **C. Legajo EVT propio** | Azimut se inscribe en el Registro de Agentes de Viajes | Contratar bedbanks/consolidadores **a su nombre**; vender y facturar | Adapters Hotelbeds/RateHawk producción + emisión (Duffel/consolidador) — todo lo del port | Trámite: idoneidad del responsable (título o experiencia), domicilio comercial, **seguro de caución** (monto según categoría, del orden de **millones de ARS** anuales en prima [estimado, C:baja]), inscripción y habilitación: **2–6 meses** [C:baja-media] |

**Veredicto:** hoy Azimut es **camino A**. **El módulo que hay que construir es el de A** (y sirve igual en B
y C). Los adapters de bedbank en producción son **camino C** o **B con credenciales de la EVT** — es
**inversión post-venta**, nunca antes.

#### 1.6.2 Cómo se opera en PRODUCCIÓN, de verdad — Amadeus test → producción y la operación diaria

**El camino concreto [C:media-alta salvo donde se indica]:**
1. En `developers.amadeus.com`, con la app ya creada en test, ir a la app → **"Get production key"** /
   "Request production environment".
2. Formulario: **datos de la empresa** (razón social, domicilio, país), **contacto**, **descripción del uso**
   (qué APIs, para qué), y **datos de facturación**: tarjeta de crédito (o facturación a empresa) — sin
   contrato, sin IATA. [C:media-alta]
3. Revisión: Amadeus la procesa **entre 24 y 72 horas hábiles** [C:media]; no hay entrevista comercial para
   las APIs de búsqueda/precio.
4. Sale una **key de producción** distinta a la de test; misma forma de API, base `api.amadeus.com`
   (el adapter ya lo soporta: `AMADEUS_ENV=production`).
5. **Modelo de cobro:** **pago por llamada, mensual, a la tarjeta, en EUR**, con una **cuota gratuita mensual
   chica por API** (las primeras N llamadas del mes) y después un **precio unitario por request** del orden
   de **€0,02–0,04** para Flight Offers Search / Price / Hotel Search y menor para utilitarias (Airport &
   City Search) [C:media — verificar en Pricing]. **Sin abono mensual, sin mínimo, sin permanencia** [C:media-alta].
6. **Qué se puede con la key de producción:** buscar vuelos con **precios reales** (tarifa + tasas, con
   `lastTicketingDate`), re-precificar una oferta (Flight Offers Price), listar y cotizar hoteles con **precio
   público real**, geocodificar. **Qué NO:** **emitir** un pasaje (Flight Create Orders exige acuerdo con un
   consolidador IATA que Amadeus ayuda a conseguir [C:media-alta]); vender con esas tarifas (son públicas,
   no netas); reservar hoteles con tarifa neta (el contenido Self-Service es tarifa pública, la agencia sería
   "el que reserva con la tarjeta del pasajero" — para Azimut no aplica).

**Cómo queda la operación diaria real (camino A), paso a paso:**

| Paso | Quién | Qué consulta contra API | Qué carga a mano | Cómo lo guarda el módulo |
|---|---|---|---|---|
| 1. Llega el pedido por WhatsApp | Mostrador (RECEPTION) | — | Contacto, pasajeros, tramo(s), moneda de referencia, motivo | `SolicitudViaje` + `PresupuestoViaje` v1 con 3 niveles y 1 opción por nivel |
| 2. Vuelos internacionales | Mostrador | **Amadeus producción** (EZE→destino, fechas, pax) | — | `OfertaCapturadaViaje` `VUELO` · `POR_PERSONA` · `capturadoEn` = ahora · `vigenteHasta` = `lastTicketingDate` · certeza **verificada** · fuente "Buscador Amadeus (producción)" |
| 3. Vuelos domésticos / low-cost | Mostrador | Amadeus da Aerolíneas; **Flybondi/JetSMART no** | Precio del sitio de la low-cost | Captura **manual** `VUELO` · `POR_PERSONA` · certeza verificada · fuente = link |
| 4. Hotel — referencia | Mostrador | **Amadeus** (precio público, para saber "cuánto vale en la calle") | — | Captura como **estimada** (referencia), o no se captura |
| 5. Hotel — precio vendible | Mostrador | — | **Portal B2B del mayorista** (Ola/Juliá/...): tarifa neta, régimen, base | Captura **manual** `ALOJAMIENTO` · **unidad obligatoria** (por habitación total / por noche) · **base obligatoria** (doble/single/…) · vigencia del mayorista · certeza verificada · fuente "portal X" |
| 6. Otros (traslados, seguro, excursión) | Mostrador | — | Portal del mayorista / proveedor | Captura manual `OTRO` · `POR_TRAMO` o `POR_PERSONA` |
| 7. Armado | Mostrador | — | Asigna cada oferta a la opción (Económico/Intermedio/Alto · A/B/C) | `AsignacionOfertaViaje` con `baseAplicada`, pasajeros, cantidad → **precio por persona en doble / single ("No cotizado" si no hay single)** y confianza verde/ámbar/rojo |
| 8. Precio de venta y envío | **Dueño (OWNER)** | — | Markup / comisión esperada; envía por WhatsApp | (siguiente pasada) `PoliticaDeMarkup`, `DocumentoDePresupuesto` congelado, estado ENVIADO |
| 9. Reserva | Dueño | — | **Se reserva en el portal del mayorista** (fuera del ERP): el mayorista vende y factura | (siguiente pasada) `EventoDeSeguimiento` ACEPTADO + registro de la **comisión a cobrar** |
| 10. Vencimientos | Sistema | — | — | Cron diario: presupuestos con `vigenteHasta` vencido → VENCIDO; el operador recaptura |

**Dónde conviven las dos cosas:** en la **misma biblioteca de ofertas**, con la **misma invariante**. La
única diferencia entre una oferta de API y una manual es `proveedor`/`fuente`/`referenciaProveedor`; el
resto (unidad, base, captura, vigencia, certeza) es idéntico y **obligatorio en ambas**. El módulo no
distingue "de dónde vino" para calcular: distingue **cuánto confiar** (certeza + vigencia → confianza).

#### 1.6.3 Qué es exactamente un "alta de agencia" (RateHawk / Hotelbeds, producción, Argentina)

Para alguien que nunca lo hizo: es un **alta comercial B2B**, no un registro web. Piden **tres cosas**:
que seas una **empresa**, que seas **del rubro** (habilitada) y que puedas **pagar** (prepago o garantía).

| Ítem | Hotelbeds (HBX) [C:media-alta] | RateHawk / ETG [C:media] | Nota argentina |
|---|---|---|---|
| Cómo se inicia | "Become a client" en la web → **ejecutivo comercial** (LATAM/Argentina) | **Formulario online** de registro de agencia → **account manager** valida | Ambos terminan con una persona del otro lado |
| Documentación de la empresa | Constancia de inscripción / contrato social, **CUIT**, domicilio, contacto financiero | Razón social, país, **CUIT**, tipo de negocio (agencia / operador), contacto | Constancia de CUIT de ARCA; si es monotributista, lo mirarán con lupa |
| Prueba de habilitación | **Licencia de agencia** (en AR: **número de legajo** y certificado del Registro de Agentes de Viajes) | Idem (lo piden en el alta o en la validación) | **Sin legajo, acá se corta** (§1.6.1) |
| Forma de pago | **Prepago** (transferencia / tarjeta virtual) para empezar; **línea de crédito** tras evaluación, con **garantía bancaria o depósito** | **Prepago** (saldo) para empezar; crédito con historial | Pagos al exterior: el contador debe ver régimen cambiario / percepciones |
| Garantía o depósito | Prepago: **sin garantía**. Crédito: garantía **del orden de USD 5.000–20.000 para una agencia chica** **[estimado, C:baja]** | Prepago: **sin garantía** [C:media] | No hay cifra pública: se negocia |
| Volumen mínimo | No formal; las cuentas sin actividad se cierran **[C:baja]** | No formal [C:media] | — |
| Plazo real | **2–6 semanas** hasta credenciales de producción [C:media] | **1–3 días** el alta; API tras validación de la integración (1–2 semanas) [C:media] | — |
| Acceso API | Tras la cuenta comercial: **certificación técnica** de la integración en test (checklist) → credenciales de producción [C:media-alta] | Se pide al manager; clave de test → producción tras revisión [C:media] | El adapter por el port se hace **una vez**, con credenciales de quien firme (Azimut en C, la EVT en B) |
| Costo de alta | **$0** | **$0** | El costo es el **tiempo** y, en crédito, la garantía inmovilizada |

#### 1.6.4 Costos, a fondo

**Proveedores de datos / contenido** (moneda y fuente; **[E]** = estimado por no ser público):

| Proveedor | Alta | Abono / suscripción | Por request | Por reserva | Depósito / garantía | Mínimos y penalidades | Fuente / confianza |
|---|---|---|---|---|---|---|---|
| **Amadeus Self-Service** | $0 | $0 | **Test $0** (cuota mensual gratis por API). **Producción:** cuota gratis chica/mes + **~€0,02–0,04 por llamada** de búsqueda/precio; utilitarias más baratas | No aplica (no emite sin consolidador) | Ninguno | Sin mínimo ni permanencia; sin penalidad | Página *Pricing* de developers.amadeus.com **[C:media — verificar cifras]** |
| **Hotelbeds APItude** | $0 | $0 | $0 (el negocio es el margen sobre la neta) | Solo la tarifa neta; **penalidades de cancelación según política del hotel** | Prepago: $0 · Crédito: **USD 5–20k [E]** | Sin mínimo formal; cierre por inactividad [C:baja] | Términos comerciales no públicos **[C:media]** |
| **RateHawk / ETG** | $0 | $0 | $0 | Solo la neta; políticas de cancelación del hotel | Prepago (saldo) desde $0 | Sin mínimo [C:media] | Portal B2B / FAQ de agencias **[C:media]** |
| **Duffel** | $0 | $0 | Búsqueda $0 | **~USD 3 por orden de vuelo [E]** + % en Stays [C:baja] | Prepago (Duffel Balance) | — | duffel.com/pricing **[C:media]** · Argentina probablemente no soportada |
| **TravelgateX** | $0 | **Suscripción mensual (cientos de EUR) [E]** | — | — | — | Permanencia según plan [C:baja] | travelgatex.com/pricing **[C:baja]** |
| **Travelpayouts** | $0 | $0 | $0 | Revenue share de afiliado | — | — | **[C:alta]**, pero no aplica al modelo |
| **Mayorista local (XML si lo da)** | $0 | $0 | $0 | Comisión pactada | — | Puede exigir volumen para dar XML [C:baja] | Depende del mayorista |

**Costo mensual estimado del buscador en producción (Amadeus), escenario realista de Azimut:** 6 pedidos/día
× (2 búsquedas de vuelo + 1 de hotel = 2 llamadas) ≈ **24 llamadas/día ≈ 520/mes**, con caché de 15/30 min
que ahorra repeticiones. A €0,03/llamada: **€15–20/mes**; con el doble de uso, **€30–40/mes**. Con
`VIAJES_CUOTA_DIARIA=50`, el techo duro es 1.500 llamadas/mes ≈ **€45–60/mes** [E]. **Es ruido frente al
costo del operador.**

**Costo del ERP para la agencia:** el módulo entra en el empaquetado del producto (ADR-078: lista de
precios A·Comerciante $14.900–$89.900/mes); no hay costo técnico incremental relevante por tenant (<1% del
ticket, ADR-078); el costo real es **soporte**.

**Costo de NO integrar (lo que el módulo ataca):** cotizar a mano un presupuesto de 3 niveles × 3 opciones
implica hasta **9 combinaciones** de vuelo + hotel + extras, cada una con 5–10 minutos de pestañas, copiar,
convertir base y unidad, y calcular por persona: **45–90 minutos por presupuesto** [E, coherente con el
caso real del módulo]. A **20 presupuestos/semana**: **15–30 horas/semana ≈ 0,4–0,75 de un operador**, es
decir **ARS 500.000–1.100.000/mes** de tiempo de mostrador a un costo laboral de ~ARS 1,3–1,5 M/mes [E].
Con captura por buscador (1–2 min) + captura manual con invariante (2–3 min) + resumen automático por
opción, el mismo presupuesto baja a **15–25 minutos**: ahorro de **~2/3 del tiempo**. Y el **error del caso
real** (precio por habitación tratado como por persona = presupuesto duplicado) deja de ser posible: una
venta perdida por ese error vale más que un año de Amadeus en producción.

#### 1.6.5 Recomendación de CAMINO ÚNICO (con costo por paso)

| Cuándo | Qué hace Azimut / GSG | Costo | Qué se obtiene |
|---|---|---|---|
| **Esta semana** | (1) Registrar **Amadeus Self-Service test** (10 min, credenciales al instante) y **Hotelbeds APItude sandbox** (10 min). (2) Pegar `AMADEUS_CLIENT_ID/SECRET` en el entorno de demo (las pega el dueño), `VIAJES_PROVEEDOR=amadeus`, `AMADEUS_ENV=test`, `VIAJES_ENABLED=1`, asignar `presupuestos-viaje` + `buscador-ofertas-viaje` al tenant de Azimut. (3) **Azimut cotiza un pedido real** con el módulo: vuelos por buscador, hotel del mayorista por captura manual. (4) Confirmar con el contador el encuadre de **agente del mayorista** y preguntarle al mayorista si da **XML/API para agentes**. (5) Un agente con `WebSearch` verifica los [C:media] de §1.3/§1.6. | **$0** | Demo real con datos reales-de-prueba; validación del ahorro de tiempo; definición del camino (A confirmado) |
| **El mes que viene** | (1) **Amadeus a producción**: production key (tarjeta), `AMADEUS_ENV=production`, `VIAJES_CUOTA_DIARIA=50`. (2) **Gate 2**: aplicar la migración `20260909120000_add_viajes_presupuestos` (dueño) y cablear **caché + cuota persistidas** (mismos puertos). (3) Construir la **siguiente tajada de la spec**: markup/precio de venta (OWNER), documento congelado + envío por WhatsApp, seguimiento y cron de vencimiento. (4) Si el mayorista dio XML: adapter por el port. | **€15–60/mes** Amadeus [E] + horas de desarrollo GSG (2 sprints) | Cotización con precios reales; presupuesto enviable; comisión trazable |
| **Cuando haya venta** (Azimut compra el producto) | Decidir **B o C**: (B) acuerdo de sub-agencia con una EVT → adapter Hotelbeds/RateHawk con **sus** credenciales; (C) **legajo EVT propio** (2–6 meses, seguro de caución [E: millones de ARS/año]) → contratos propios de bedbank (prepago $0 / crédito con garantía USD 5–20k [E]) y, si quiere emitir, consolidador o Duffel (si soporta Argentina). | B: comisión compartida · C: caución + garantías [E] | Tarifa neta automática en el ERP; emisión desde el ERP (opcional) |

**En una línea:** *hoy Azimut es agente de un mayorista; el módulo que le sirve es cotización por API +
captura manual con invariante + armado + comisión — gratis para demostrar esta semana, ~€30/mes para
operar con precios reales el mes que viene; las tarifas netas automáticas y la emisión son inversión
post-venta y requieren legajo (propio o prestado).*

---

## 2. Diseño técnico

### 2.1 Capas

```
/admin/viajes (page + ViajesForms)          ← UI mínima, SAP Fiori (rol-based, a11y, criollo)
        │ useActionState
src/lib/viajes-actions.ts ("use server")    ← gate compuesto + validación + tenantTransaction + audit
        │
src/lib/viajes/glue.ts (server)             ← exigirViajes(cap) · proveedorParaTenant · loaders Prisma
src/lib/viajes/core.ts (PURO)               ← capturarOferta · asignación · precioPorPersona · resumirOpcion
        │ solo el port
src/plugins/ofertas-viaje/port.ts           ← ProveedorOfertas · OfertaVuelo/OfertaHotel · PrecioOferta
src/plugins/ofertas-viaje/cache.ts          ← ProveedorConCache (decorador): caché + cuota
src/plugins/ofertas-viaje/registry.ts       ← RegistroProveedoresOfertas (clave → fábrica)
src/plugins/ofertas-viaje/amadeus/adapter.ts← adapter REAL (OAuth2 + Flight Offers v2 + Hotel Search v3)
src/plugins/ofertas-viaje/stub.ts           ← adapter en memoria, determinístico (dev/test/demo)
```

**Regla de dependencias:** el core y las actions importan **solo el port**; los adapters importan del port,
nunca al revés. El resto del ERP no sabe de qué proveedor vino el dato: solo ve `proveedor`/`fuente` en la
oferta capturada, que se persisten para trazabilidad.

### 2.2 El port `ProveedorOfertas`

```ts
interface ProveedorOfertas {
  readonly clave: string;                                   // "amadeus" | "stub" …
  buscarVuelos(b: BusquedaVuelos): Promise<ResultadoBusqueda<OfertaVuelo>>;
  buscarHoteles(b: BusquedaHoteles): Promise<ResultadoBusqueda<OfertaHotel>>;
}
interface PrecioOferta {                 // monto, moneda, unidad y capturadoEn OBLIGATORIOS
  monto: number; moneda: Moneda;
  unidad: "POR_PERSONA" | "POR_HABITACION_NOCHE" | "POR_HABITACION_TOTAL" | "POR_TRAMO";
  baseOcupacion?: "SINGLE" | "DOBLE" | "TRIPLE" | "OTRA";   // obligatoria en alojamiento (lo exige el core)
  ocupacion?: number; noches?: number;
  capturadoEn: InstanteISO; vigenteHasta?: InstanteISO; incluyeImpuestos?: "SI" | "NO" | "PARCIAL";
}
```

Cada adapter **normaliza**: Amadeus vuelos → `POR_PERSONA` (precio del adulto en `travelerPricings`,
impuestos incluidos, `lastTicketingDate` → vigencia); Amadeus hoteles v3 → `POR_HABITACION_TOTAL` con base
derivada de `guests.adults` (2 → doble). Ofertas sin precio se **descartan**: nunca se inventa un precio.

### 2.3 Oferta capturada (objeto maestro) y asignación (relación) — la invariante

`capturarOferta(tipo, oferta, { ahora, certeza, fuente })` produce la `OfertaCapturadaViaje` (spec §3.3):

| Campo | Regla |
|---|---|
| `precio`, `moneda` | `round2`; ISO-4217 |
| `unidad` | **obligatoria**; enum cerrado |
| `baseOcupacion` (+ `ocupacion` si OTRA) | **obligatoria en alojamiento**; sin default silencioso |
| `noches` | obligatoria si `POR_HABITACION_NOCHE` |
| `capturadoEn` | **obligatoria**; no futura (+5 min tolerancia) |
| `vigenteHasta` | **obligatoria**: la del proveedor, o el default del tenant **marcado** (`vigenciaAsumida`) |
| `certeza` | **obligatoria**: VERIFICADA / ESTIMADA, sin default (API en vivo → verificada) |
| `fuente`, `capturadoPor` | obligatorias (auditoría) |

Se defiende en **tres capas**: el tipo, el core (`OfertaInvalidaError` con la lista de motivos) y el
schema (`NOT NULL` sin default en `capturadoEn`/`unidad`/`vigenteHasta`/`certeza`).

`AsignacionOfertaViaje` (spec §3.7) es la relación explícita con ABM propio: `pasajerosCubiertos`,
`baseAplicada` (puede diferir de la capturada), `suplementoSingle` (**explícito, prohibido inferirlo**),
`cantidad`. El core calcula por asignación:

- `costoTotalAsignacion`: por persona × pax; por habitación × ⌈pax / personas de la base⌉ (× noches si es
  por noche); por tramo × cantidad. **Test que cierra el caso real:** *hotel por habitación (doble) para 2 →
  600, NO 1200.*
- `precioPorPersona(…, "DOBLE" | "SINGLE")`: **`null` = "No cotizado"** cuando no se puede sin inferir
  (single desde doble sin suplemento; doble desde single).
- `resumirOpcion`: suma por persona en doble/single, costo total, vigencia mínima y **confianza**
  verde/ámbar/rojo (estimada o por vencer → ámbar; vencida o monedas mezcladas → rojo).

**Seguridad de la captura:** la action que captura desde el buscador **no acepta el precio desde el
navegador**: re-lee la oferta del caché del servidor por clave de búsqueda + referencia; si venció, pide
volver a buscar. La captura manual sí acepta el precio (es el operador declarándolo) y por eso exige
certeza + fuente.

### 2.4 Schema Prisma (aditivo, todo con `tenantId`, según spec §3)

`SolicitudViaje` (pedido: contacto, pasajeros, moneda de referencia, operador, `clientId?` → `Client` del
Core) · `TramoSolicitudViaje` · `PresupuestoViaje` (versión, estado spec §4, `vigenteHasta` derivado) ·
`NivelPresupuestoViaje` · `OpcionPresupuestoViaje` · **`OfertaCapturadaViaje`** (maestro, `Decimal(14,2)`,
baja lógica) · **`AsignacionOfertaViaje`** (relación, única por opción+oferta) · `ConsumoProveedorViaje`
(cuota) · `CacheBusquedaViaje` (caché por tenant). 8 enums. `gate:rls` pasa: **53 modelos** protegibles.
Migración `prisma/migrations/20260909120000_add_viajes_presupuestos/` (+ `rollback.sql`) generada por
`prisma migrate diff`, **sin tocar Neon**. Aplicarla es **Gate 2** del dueño; tras aplicar, re-ejecutar
`prisma/rls/0001_enable_rls.sql`. **Desvíos anotados respecto de la spec:** `tramoId` de la oferta es
opcional en v1 (biblioteca sin pedido); `PoliticaDeMarkup`, `DocumentoDePresupuesto` y `EventoDeSeguimiento`
quedan para la siguiente pasada (§4).

### 2.5 Server actions y rutas bajo `/admin`, con RBAC (spec §5)

- Capabilities nuevas **`quotes:read` · `quotes:manage` · `quotes:price` · `quotes:send` · `quotes:track`**.
  OWNER todas; **RECEPTION: read + manage + track** (arma y sigue, no pone precio ni envía); PROFESSIONAL
  ninguna.
- **Gate compuesto** `exigirViajes(cap)` en página y en TODAS las actions: (1) flag `VIAJES_ENABLED`, (2)
  `requireCapability(cap)`, (3) módulo `presupuestos-viaje` **asignado** (chequeo duro, independiente del
  flag del registry). El buscador exige además `buscador-ofertas-viaje` asignado. Flag OFF → **404**.
- Actions: `crearPedidoAction` (solicitud + presupuesto v1 + 3 niveles + 1 opción por nivel),
  `buscarOfertasAction`, `capturarDesdeBusquedaAction`, `capturarManualAction` (ambas con asignación
  opcional a una opción; recalculan `vigenteHasta` del presupuesto y pasan BORRADOR → EN_ARMADO). Errores
  **devueltos**, no lanzados; `tenantTransaction({ tenantId })`; `auditAdmin` en cada mutación; P2021/P2022
  → "falta aplicar la migración (paso del dueño)".

### 2.6 Caché y control de gasto

`claveBusqueda` = sha256 del JSON canónico; `ProveedorConCache`: **caché (15/30 min) → cuota diaria →
llamada**; búsqueda cacheada no consume cuota; cuota agotada frena **antes** de llamar; `maxResultados`
limita los `hotelIds` cotizados. **Límite honesto:** caché y cuota corren en memoria por proceso; en
serverless no son tope duro. Las tablas ya están en el schema y el puerto es el mismo: la versión Prisma se
cablea tras Gate 2 (§1.6.5, mes que viene).

### 2.7 Activación por tenant (ADR-054/055, spec §6)

Descriptores `presupuestos-viaje` (capability, `rubros: ["viajes"]`, dep `clients`, flag) y
`buscador-ofertas-viaje` (plugin, dep `presupuestos-viaje`, flag, `configSchema` con los secretos de
Amadeus). `resolverActivacion` los rechaza para `servicios`/`carniceria`/`generico`/`facturita` y los activa
solo para `viajes`. `filtrarPorFlagDeRollout` (`src/modules/rollout.ts`, primer consumidor del campo `flag`)
+ ítem de nav con `requiereAsignacion: true` (eje nuevo de `ShellItem`): visible **solo** con módulo
asignado **y** flag prendido. Sin esto, el gating legado mostraría el ítem a **todo** OWNER (DX-6).
**Encendido para Azimut:** blueprint `viajes` (config-only, pendiente §4) · `modules: [clients,
presupuestos-viaje, buscador-ofertas-viaje]` desde la consola · `VIAJES_ENABLED=1` · opcional
`VIAJES_PROVEEDOR=amadeus` + credenciales (las pega el dueño). Sin credenciales, el stub responde y **lo
dice en pantalla**.

---

## 3. Qué se construyó en esta pasada (esqueleto vertical, flag OFF)

| Pieza | Archivos |
|---|---|
| Port + registro + stub + caché/cuota + adapter Amadeus real | `src/plugins/ofertas-viaje/{port,registry,stub,cache,index}.ts`, `src/plugins/ofertas-viaje/amadeus/adapter.ts` |
| Core puro (captura, asignación, resumen) + flags | `src/lib/viajes/{core,flags}.ts` |
| Glue server + actions | `src/lib/viajes/glue.ts`, `src/lib/viajes-actions.ts` |
| Pantalla (bandeja + nuevo pedido + buscador + captura manual + biblioteca) | `src/app/admin/(dashboard)/viajes/{page,ViajesForms}.tsx` |
| Catálogo / RBAC / nav / rollout | `src/modules/descriptors/viajes.ts`, `src/modules/{catalog,rollout,nav-groups,index}.ts`, `src/lib/{capabilities,admin-nav-items}.ts`, `AdminShell.tsx`, `layout.tsx` |
| Schema + migración (sin aplicar) | `prisma/schema.prisma`, `prisma/migrations/20260909120000_add_viajes_presupuestos/{migration,rollback}.sql` |
| Tests | `core.test.ts`, `flags.test.ts`, `cache.test.ts`, `stub.test.ts`, `amadeus/adapter.test.ts`, `rollout.test.ts` (+ `operator-config.test.ts` con el plugin nuevo) |

**Vallas:** `tsc` ✅ · `npm test` ✅ · `gate:rls` ✅ · `next build` ✅ (`/admin/viajes` ƒ) · eslint ✅.
Con `VIAJES_ENABLED` sin setear el backoffice es **byte-idéntico** para CH/Magra/Shine/ADM.

---

## 4. Lo que falta (siguiente pasada, por orden — spec §2/§3.8–3.10/§4)

1. **Blueprint `viajes`** (config-only, ADR-002 §3): capabilities `clients` + `presupuestos-viaje`, branding,
   seed mínimo. Sin él el provisioning no siembra el rubro.
2. **ABM completo de la asignación** (editar base aplicada, pasajeros, suplemento single, desasignar) y de
   la biblioteca (`/admin/viajes/ofertas`: editar/baja lógica). Hoy solo alta con default.
3. **Precio de venta** (`PoliticaDeMarkup` + asignación, `quotes:price`), **documento congelado + envío**
   (`quotes:send`, WhatsApp-first), **seguimiento** (`quotes:track`) y **cron diario de vencimiento**.
4. **Caché + cuota persistidas** (Prisma) detrás de los mismos puertos; barrido de `expiraEn`.
5. Adapters **XML del mayorista** (si lo da), **Hotelbeds/RateHawk** (con credenciales de quien firme),
   **Duffel** (solo si emite y soporta Argentina).

---

## 5. Gate de Excelencia — autochequeo del frente (antes del Gate en Opus, ADR-040)

1. **SAP Fiori + argentino:** rol-based (`quotes:*` server-side + módulo asignado + flag; RECEPTION opera,
   OWNER precia/envía) ✅ · coherente (mismo molde que Caja/Cartera: `useActionState`, `Field`, `SubmitButton`,
   `PageHeader`, `SectionGroup`, `Badge`, `EmptyState`) ✅ · simple (pedido → capturar → asignar → resumen) ✅ ·
   adaptable (grids responsive, tokens, sin hex) ✅ · accesibilidad (labels reales, `role="alert"`/`status`,
   `caption` `sr-only`, `scope`, `aria-label` por nivel, `tabular-nums`) ✅ · consistencia (reusa `round2`,
   `fmtNumberAR`, `fmtDateTimeAr`) ✅ · argentino (voseo, "por persona en doble", USD/ARS/EUR, DD/MM/AAAA TZ
   Argentina, WhatsApp como canal del pedido) ✅.
2. **Sello GSG:** crédito en el footer del backoffice (ya existe); este doc firma; el commit lleva el trailer. ✅
3. **Arquitectura:** capas con regla de dependencias ✅ · objeto maestro + asignación (ADR-055) ✅ ·
   testabilidad (core puro, transporte inyectable, sin red ni DB) ✅ · multi-tenant (`tenantId` en 9 tablas,
   `tenantTransaction`, caché por tenant) ✅ · deuda anotada (§2.6, §4) ✅.
4. **Confiabilidad:** tsc+build+test verdes ✅ · errores devueltos; P2021 honesto ✅ · **no rompe prod**: flag
   OFF, migración sin aplicar, sin deploy, sin secretos ✅.

**N/A declarados:** copy de venta / WhatsApp saliente (zona humana ADR-046) llega con el documento (§4.3).

---

## 6. Las 3 cosas que más condicionan la viabilidad técnica

1. **Cotizar sí, vender/emitir no — hasta que haya legajo (propio o prestado).** Con Amadeus el ERP cotiza
   desde el día uno; **la tarifa neta y la emisión exigen una agencia habilitada** (§1.6.1). Si el cliente
   compra "tarifa neta automática", eso es camino B/C, no código.
2. **La invariante solo vale si TODAS las fuentes pasan por ella.** El módulo es viable porque la oferta
   capturada acepta cualquier origen —API, bedbank, portal del mayorista, mail— con la **misma** disciplina
   (unidad + base + captura + vigencia + certeza). Si alguna vez se permite "un precio suelto", vuelve el
   caso real.
3. **El control de gasto por request solo es tope duro con persistencia.** Antes de `AMADEUS_ENV=production`
   hace falta **Gate 2** (migración) y cablear `ConsumoProveedorViaje`/`CacheBusquedaViaje`. Hasta entonces:
   ambiente **test** y `VIAJES_CUOTA_DIARIA` bajo. El costo real igual es chico (€15–60/mes [E]); el riesgo
   es que se escape sin tope, no que sea caro.

— Elaborado por GSG
