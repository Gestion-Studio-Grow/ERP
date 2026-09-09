# Canal mayorista de turismo en Argentina — cómo accede una agencia chica a tarifas de proveedores

**Fecha:** 9 de septiembre de 2026 · **Cliente:** Azimut Viajes (CABA) · **Pregunta:** ¿cómo hace una agencia argentina chica para conseguir acceso real a tarifas de mayoristas? (comercial y regulatorio; la integración técnica la resuelve otro frente).

**Método:** búsqueda web con fuente y fecha al lado de cada dato. Etiquetas: **[V]** verificado en fuente pública · **[E]** estimación propia (con el razonamiento) · **[NV]** no verificado / el proveedor no lo publica. Lo que ya sabíamos (sandbox de Hotelbeds/RateHawk/TravelgateX, test de Amadeus Self-Service, scrapear no es opción) no se repite.

---

## 0. Lo que decide, en diez líneas

1. **El "legajo EVT" estatal no existe más.** El DNU 70/2023 (art. 349) derogó la Ley 18.829 y desde el **29/12/2023** no hay habilitación nacional obligatoria para vender viajes: se eliminaron el Registro de Agentes de Viajes, el seguro de caución anual y la exigencia de idóneo estatal. **[V]** [Ladevi, 29/12/2023](https://argentina.ladevi.info/agencias-viajes/desde-hoy-dejan-existir-las-agencias-viajes-habilitadas-n60923) · [texto del art. 349](https://dnu702023.web.app/349) · [Allende & Brea, 1/3/2024](https://allende.com/reforma-argentina/desregulacion-economica/desregulacion-del-sector-turistico-01-03-2024/). FAEVYT presentó un amparo en enero 2024 y **lo levantó en marzo 2024** al crear su registro privado; no hay fallo que haya repuesto la ley. **[V]** [Ladevi, marzo 2024](https://argentina.ladevi.info/faevyt/faevyt-levanto-el-amparo-contra-el-dnu-javier-milei-n64149).
2. **Lo reemplazó el RNAV (Registro Nacional de Agencias de Viajes) de FAEVYT**: privado, **opcional, gratuito, online**, con número de legajo (las 5.300 agencias pre-2023 conservan el suyo; las nuevas reciben uno secuencial). **[V]** [Ladevi, marzo 2024](https://argentina.ladevi.info/faevyt/asi-funciona-el-registro-nacional-agencias-viajes-faevyt-n64122) · [Ámbito, marzo 2024](https://www.ambito.com/informacion-general/lanzan-el-registro-nacional-agencias-viajes-como-funciona-y-que-es-clave-evitar-estafas-n5966301).
3. **Costo real del RNAV hoy: ~$40.600 a ~$120.000 (marca INPI) + $0 de registro + el idóneo.** Tiempo: días si ya tenés marca e idóneo. El cuello de botella no es la plata, es **tener un Técnico/Licenciado en Turismo inscripto en el Registro de Idóneos**. Detalle en §1.
4. **Sin RNAV se puede vender legalmente** (no hay ley que lo prohíba a nivel nacional), pero **la responsabilidad frente al pasajero por Ley 24.240 es solidaria e igual**, cobres o no cobres vos. **[V]** §2.
5. **Los mayoristas argentinos no publican requisitos de alta ni ofrecen API "de mostrador"**: el alta es un formulario + contacto comercial; el XML lo dan a agencias con volumen (Ola lo tiene documentado por casos de integración; el resto, no publicado). §5.
6. **La vía barata a tarifas negociadas + tecnología es una red/plataforma B2B**: PriceAgencies (gratis), Tour Vector (fee mensual, ~9.000 productos de mayoristas argentinos), Grupales.com (gratis) y un consolidador aéreo. §3.
7. **Camino recomendado para Azimut:** inscribirse en el RNAV (o confirmar que ya está), TIDS de IATA (gratis), alta en 3–4 mayoristas + PriceAgencies, y evaluar Tour Vector como puente al XML. Sin idóneo: **sub-agencia con contrato de agencia escrito** bajo una EVT con RNAV mientras se consigue el idóneo. §7.

---

## 1. El "legajo EVT", a fondo (lo que era, lo que es hoy)

### 1.1 Lo que era hasta el 28/12/2023 (para entender qué te van a seguir pidiendo por inercia)

| Ítem | Régimen Ley 18.829 / Decreto 2182/72 | Fuente |
|---|---|---|
| Organismo | Ministerio/Secretaría de Turismo de la Nación (Registro de Agentes de Viajes) | [Ley 18.829, Infoleg](https://servicios.infoleg.gob.ar/infolegInternet/anexos/25000-29999/27128/norma.htm) **[V]** |
| Categorías | EVT (Empresa de Viajes y Turismo, la más amplia), AT (Agencia de Turismo), AP (Agencia de Pasajes) | [Decreto 2182/72](https://www.argentina.gob.ar/normativa/nacional/decreto-2182-1972-18905/texto) **[V]** |
| Fondo de garantía (caución anual) | EVT **$6.630.094** · AT $3.315.047 · AP $1.657.454 para localidades >500.001 hab. (valores Res. 661/2022, vigentes desde 1/1/2023; escalaban por tamaño de localidad) | [argentina.gob.ar, montos](https://www.argentina.gob.ar/turismoydeportes/agencias-de-viaje/montos-actualizados-de-polizas-de-seguros-de-caucion) · [Res. 661/2022](https://www.boletinoficial.gob.ar/detalleAviso/primera/278474/20221228) **[V]** |
| Prima de esa caución | ~3–5 % anual de la suma asegurada → **~$200.000–330.000/año** a valores 2023 | **[E]** tasa de mercado de caución 2025–26 según [segurosdecauciones.com.ar](https://segurosdecauciones.com.ar/cuanto-sale-seguro-caucion/) y [roomix](https://roomix.ai/blog/seguro-de-caucion-alquiler); aplicada a la suma EVT |
| Idóneo | Al menos un Técnico/Licenciado en Turismo inscripto en el Registro de Idóneos (delegado en FAEVYT desde Res. 763/92) | [FAEVYT, servicios](https://www.faevyt.org.ar/servicios/generales/287-generales.html) **[V]** |
| Local | Local comercial habilitado, exhibir razón social y N° de legajo | [Ley 18.829](https://servicios.infoleg.gob.ar/infolegInternet/anexos/25000-29999/27128/norma.htm) **[V]** |
| Hoy | **Todo eso está derogado a nivel nacional.** La Secretaría de Turismo, Ambiente y Deportes (desde el 6/12/2025 bajo Jefatura de Gabinete, Decreto 866/2025) **no otorga legajos** | [BO, Res. 270/2026](https://www.boletinoficial.gob.ar/detalleAviso/primera/340172/20260331) **[V]** |

### 1.2 Lo que es hoy: RNAV de FAEVYT (el "legajo" que te van a pedir)

| Ítem | Dato | Fuente |
|---|---|---|
| Quién lo otorga | FAEVYT (privado), con adhesión de **todas las provincias** desde abril 2026 (Córdoba fue la última); CABA adhirió en 2024, PBA en feb-2025 | [Continental, 15/4/2026](https://www.continental.com.ar/2026-04-15/faevyt-logro-unir-a-todo-el-pais-en-el-registro-nacional-de-agencias-de-viajes-150083/) · [CABA](https://turismo.buenosaires.gob.ar/es/turismo-noticias/la-ciudad-de-buenos-aires-adhiri%C3%B3-al-registro-nacional-de-agencias-de-faevyt) · [PBA, 20/2/2025](https://www.eldiariodeturismo.com.ar/2025/02/20/la-provincia-de-buenos-aires-se-adhiere-al-registro-nacional-de-agencias-de-viajes-rnav/) **[V]** |
| Costo | **$0** (no hace falta ser socio de FAEVYT ni de la regional) | [Ladevi, marzo 2024](https://argentina.ladevi.info/faevyt/asi-funciona-el-registro-nacional-agencias-viajes-faevyt-n64122) **[V]** |
| Requisitos | (a) constancia ARCA con actividad **791100** (minorista) y/o **791200** (mayorista); (b) **al menos un idóneo** inscripto en el Registro de Idóneos; (c) inscripción en el **Registro Nacional de Bases de Datos** (AAIP); (d) **marca registrada** (si no la tenés, 30 días para registrarla y acreditarlo) | [Ámbito, marzo 2024](https://www.ambito.com/informacion-general/lanzan-el-registro-nacional-agencias-viajes-como-funciona-y-que-es-clave-evitar-estafas-n5966301) · [Cipo360, 16/3/2024](https://www.cipo360.com.ar/noticias/2024/03/16/13517-como-inscribirse-y-cuales-son-los-requisitos-para-estar-en-regla-en-el-registro-de-agencias-de-viaje) **[V]** |
| Costo de (c) | **$0** — trámite online por TAD, sin arancel | [AAIP, argentina.gob.ar](https://www.argentina.gob.ar/registrar-bases-de-datos-personales-privadas) **[V]** |
| Costo de (d) | **100 UMAPI por clase = $40.569 en septiembre 2026** (UMAPI = $405,69, Res. INPI 75/2026, se actualiza por IPC). Con gestor: **desde ~$120.000**. Clase 39 (servicios de viajes). Si "registrada" se interpreta como *concedida*, el INPI tarda meses; en la práctica el RNAV acepta acreditar el trámite iniciado — **[NV]** confirmar con FAEVYT | [unamarca.com.ar, aranceles INPI](https://unamarca.com.ar/aranceles-inpi/) · [1Mark 2026](https://1mark.ar/knowledge/costo-registro-marca-2026) **[V]** |
| Costo de (b) | Si el titular tiene título terciario/universitario en Turismo: **$0 + trámite en FAEVYT** (Viamonte 640 10°, CABA). Si no: contratar un idóneo (práctica de mercado: honorario mensual **[E]** $150.000–400.000 según dedicación; no hay fuente pública) o cursar una tecnicatura (2–3 años). La vía "examen de idoneidad sin título" figura en argentina.gob.ar pero **[NV]** que se siga tomando post-DNU | [FAEVYT, Registro de Idóneos](https://www.faevyt.org.ar/servicios/generales/287-generales.html) · [argentina.gob.ar, examen](https://www.argentina.gob.ar/servicio/rendir-el-examen-de-idoneidad) |
| Seguro de caución | **No se exige** (FAEVYT no lo descarta a futuro) | [Ladevi, dic-2024](https://argentina.ladevi.info/agencias-viajes/a-un-ano-del-fin-las-agencias-viajes-faevyt-fortalece-su-registro-n77039) **[V]** |
| Renovación | Anual, **antes del 31/3**, con horas de capacitación vía Incatur | [Ladevi, dic-2024](https://argentina.ladevi.info/agencias-viajes/a-un-ano-del-fin-las-agencias-viajes-faevyt-fortalece-su-registro-n77039) **[V]** |
| Plazo | Autogestionable online; FAEVYT registraba "una agencia cada 8 horas" (2025). **[E]** días a 2 semanas si la documentación está completa | [Ladevi, 2025](https://argentina.ladevi.info/actualidad/cada-8-horas-faevyt-registra-una-nueva-agencia-viajes-n78855) |
| Tamaño | **+7.100 agencias** (ene-2026), **+7.300** (abr-2026); 1.199 altas nuevas en el primer año | [Report News, 9/1/2026](https://reportnews.la/blog/2026/01/09/el-rnav-supera-las-7-100-inscripciones/) · [Mensajero, mar-2025](https://mensajero.com.ar/actualidad/rnav-cumple-1-ano--1199-agencias-nuevas-y-casi-todas-las-provincias-adheridas_a67e2d105847492f6746d69c9) **[V]** |
| Extra: Sello de Calidad FAEVYT-SecTur (2026) | Gratis; requiere RNAV + registro en Incatur + carta compromiso + capacitación; para socias y no socias | [Ladevi, 2026](https://argentina.ladevi.info/actualidad/las-agencias-viajes-ya-pueden-obtener-el-sello-calidad-faevyt-sectur-requisitos-y-como-acceder-n102629) **[V]** |
| Provincias con exigencia propia | **Mendoza** (Emetur, Decreto 1725/24 + Res. 398/24): el RNAV es obligatorio para habilitar transporte turístico y para participar de acciones promocionales; trámites gratuitos. CABA tiene un Registro de Prestadores Turísticos **voluntario** | [MDZ, 25/9/2024](https://www.mdzol.com/sociedad/2024/9/25/el-emetur-regulo-las-agencias-de-viajes-tras-una-derogacion-clave-del-dnu-de-javier-milei-1154594.html) · [CABA, trámite](https://buenosaires.gob.ar/tramites/inscripcion-en-el-registro-de-prestadores-turisticos) **[V]** |

**Total RNAV para Azimut, escenario "tiene idóneo y marca": $0 y días. Escenario "sin marca": ~$40.600–120.000 y el plazo del INPI. Escenario "sin idóneo": es el único costo serio (honorario mensual o formación).**

### 1.3 Azimut, ¿tiene legajo?

No lo pude verificar públicamente: la búsqueda en el buscador del RNAV ([agenciasdeviajes.ar](https://www.agenciasdeviajes.ar/)) y en el de socios de FAEVYT/AVIABUE no devolvió resultados indexados para "Azimut". **[NV]** Hay que consultar directamente el buscador del RNAV por razón social/CUIT. Regla útil: **si Azimut tenía legajo estatal antes del 29/12/2023, ya está en el RNAV con el mismo número** sin trámite adicional (renovación anual pendiente). **[V]** [Ámbito](https://www.ambito.com/informacion-general/lanzan-el-registro-nacional-agencias-viajes-como-funciona-y-que-es-clave-evitar-estafas-n5966301).

---

## 2. El caso sin legajo — qué se puede hacer legalmente

**Marco:** al no existir ley nacional de agentes de viajes, **no hay actividad reservada ni "ejercicio ilegal"** a nivel nacional. Lo que sí rige: Ley 24.240 (consumidor), CCyC (contratos de agencia, franquicia, mandato), normas fiscales (ARCA) y, donde corresponda, normas provinciales (Mendoza). **[V]** [Palabras del Derecho, 2024](https://www.palabrasdelderecho.com.ar/articulo/4755/Nuevo-universo-de-las-agencias-de-viajes-a-la-luz-de-las-reformas-del-gobierno-de-Milei).

**Advertencia central para el modelo declarado de Azimut ("no cobro ni facturo, factura el operador"):** la Justicia trata a la agencia como **proveedor solidariamente responsable** con el mayorista y la aerolínea aunque se presente como "mera intermediaria"; hay condenas de +$10 millones en 2025 (Juzgado Federal N°1 de Córdoba). Es decir, el modelo alivia lo fiscal y el flujo de caja, **no** la responsabilidad ante el pasajero. **[V]** [Ladevi, 2025](https://argentina.ladevi.info/actualidad/responsabilidad-solidaria-condena-millonaria-una-agencia-viajes-y-una-aerolinea-un-viaje-frustrado-n95906) · [Justicia de Primera, 14/7/2024](https://justiciadeprimera.com/2024/07/14/agencias-de-viaje-y-responsabilidad-como-intermediarias/).

### 2.1 Las tres figuras

| Figura | ¿Es legal? | Cómo se formaliza | Qué se lleva el paraguas | ¿Da acceso a tarifas del mayorista? |
|---|---|---|---|---|
| **Sub-agencia / asesor independiente bajo una EVT con RNAV** ("host agency") | Sí. Post-DNU no hay prohibición de vender por cuenta de otra agencia. Encuadra como **contrato de agencia** del CCyC (arts. 1479–1501: promover negocios por cuenta de otro, de forma estable e independiente, sin relación laboral, por retribución; **debe ser escrito**). Nota: el art. 1501 excluía a las agencias de viajes "reguladas por leyes especiales"; con la 18.829 derogada esa exclusión pierde objeto — **[E]** interpretación, validar con abogado | Contrato escrito de agencia/comisión; la EVT factura al pasajero (o el mayorista por cuenta y orden), Azimut factura comisión a la EVT (monotributo o RI, IVA 21 %) | Modelo internacional: el asesor cobra ~10 % de la reserva y el host retiene entre 10 y 30 % de la comisión total **[E]** (fuente US, [Fora](https://www.foratravel.com/join/resources/beneficios-de-ser-agente-de-viajes)). En Argentina el único programa con nombre que encontré es **"Nómadas by Nomádica"** (Nomádica Viajes): sin relación de dependencia, ingreso por ventas, soporte operativo y capacitaciones de proveedores; **comisión no publicada [NV]** ([Nomádica](https://www.nomadicaviajes.com.ar/programa-n%C3%B3madas)) | **Indirecto**: usás el login B2B y las tarifas negociadas de la EVT paraguas; no tenés cuenta propia en el mayorista |
| **Franquicia de red** | Sí (contrato de franquicia, CCyC arts. 1512–1524) | Contrato de franquicia con canon de ingreso, regalías y territorio | Ver números en §3.2: **USD 10.000–30.000** de entrada + regalías | **Sí, directo**: la red tiene los acuerdos con mayoristas y sus herramientas; vos operás con el legajo/RNAV y la marca de la red |
| **Promotor / asesor independiente para una EVT** (freelance que solo capta) | Sí. Es la misma figura de agencia/comisión, con menos autonomía: capta y deriva, la EVT cierra y factura | Contrato de agencia o corretaje; comisión por venta cerrada | Comisión típica al promotor **[E]** 30–50 % de la comisión que cobra la EVT (no hay fuente pública argentina) | No: ni login ni tarifas propias |

**Nace un gremio para esta figura:** el **FACVE (Foro Argentino de Consultores y Empresas de Viajes)** renovó comisión directiva en junio 2025 y se enfoca en capacitación y representación de consultores de viajes. **[V]** [Aviación News, jun-2025](https://www.aviacionnews.com/2025/06/el-foro-argentino-de-consultores-y-empresas-de-viajes-facve-anuncio-de-su-nueva-comision-directiva/).

### 2.2 Encuadre fiscal del modelo "factura el operador, yo cobro comisión" (validar con contador)

- La RG (AFIP/ARCA) 1415 regula la emisión de comprobantes y contempla operaciones **por cuenta y orden de terceros**; el mayorista puede facturar al pasajero y Azimut factura su comisión al mayorista. **[V]** [RG 1415, texto](https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-1415-2003-81316/texto).
- Si en algún momento Azimut factura el viaje al pasajero, aplica el **art. 22 de la Ley de IVA** (servicios de turismo): se deducen de la base los pasajes exentos y los servicios prestados en el exterior si se discriminan en factura. **[V]** [Ley de IVA art. 22](https://leyes-ar.com/ley_de_impuesto_al_valor_agregado/22.htm).
- Actividad ARCA: **791100** minorista / **791200** mayorista (es requisito del RNAV, ver §1.2).

---

## 3. Redes, consorcios, plataformas y grupos de compra (con nombre propio)

### 3.1 Plataformas B2B y consorcios que hoy operan en Argentina

| Red / plataforma | Qué da | Qué exige | Costo | Herramienta / tarifas |
|---|---|---|---|---|
| **PriceAgencies Argentina** (unidad B2B de PriceTravel Holding; lanzada en Argentina en **mayo 2025**) | Plataforma de reservas: +500.000 hoteles con contratos exclusivos, armado dinámico de paquetes, cotizaciones, soporte 24/7; pago en efectivo en Argentina o tarjeta | Ser agencia de viajes (formulario de afiliación) **[NV]** si piden RNAV | **Gratis** ("membresía sin costo") | Sí: tarifas netas/exclusivas para afiliados. **[V]** [El Enviador, 13/5/2025](https://elenviador.com/2025/05/13/priceagencies-desembarca-en-argentina-una-nueva-era-para-las-agencias-de-viajes/) · [priceagencies.com.ar](https://www.priceagencies.com.ar/) |
| **Tour Vector** (Argentina) | Inventario de mayoristas argentinos en un solo sistema (**+9.000 productos**), web autoadministrable para la agencia, motor de reservas; en 2026 presentó módulo de "reservas inteligentes" con conectividad API, motor de autos (+50 rentadoras) y excursiones. Operadores integrados (según Ladevi): All Seasons, Eurovips, Grupo Ocho, Tip Travel, King Midas, Delfos, Atalaya, Cuarto Continente, Trayecto Uno; "Ola y Juliá en proceso" (nota antigua — **[NV]** estado 2026) | Demo + acuerdo comercial; onboarding en **72 hs** | **Fee mensual "muy accesible", no publicado [NV]** | Sí: las tarifas de cada mayorista, a través de la plataforma. **Es el puente más realista al XML de los mayoristas argentinos para una agencia chica.** [Ladevi](https://argentina.ladevi.info/negocios/tecnologia-tour-vector-consolida-su-liderazgo-innovacion-agencias-viajes-n90961) · [Report News, 14/8/2026](https://reportnews.la/blog/2026/08/14/tour-vector-presento-sus-soluciones-ante-mas-de-300-agencias/) · [tourvector.com](https://www.tourvector.com/) |
| **Grupales.com** | Operador mayorista de salidas grupales internacionales; "red comercial de +400 agencias" | Contacto (0810 333 6614 / consultas@grupales.com) | **Gratis** (es un mayorista que vende solo vía agencias) | Tarifas de sus salidas grupales, comisionadas. **[V]** [grupales.com](https://grupales.com/quienes-somos/) |
| **Consolidadores aéreos** — Viajes FAT (desde 1972), Tucano Tours, Grupo Ocho, Ticket Yachasma | Emisión de aéreos para agencias **no IATA** con tarifas negociadas; FAT tiene módulo web de consulta/reserva y anunció emisión automática | Alta como agencia; **[NV]** si piden RNAV | Sin costo fijo; margen/fee por ticket **[E]** | Sí (aéreo). [Ladevi, FAT](https://argentina.ladevi.info/negocios/viajes-fat-consolidacion-aerea-agencias-todo-el-pais-n97521) · [Grupo Ocho](https://www.grupo8.com.ar/texto/consolidadora) · [Tucano](https://www.tucanotours.com.ar/quienes_somos.php) **[V]** |
| **IATA TIDS** (código no emisor) | Identificador reconocido por aerolíneas, cadenas hoteleras, cruceros, rentadoras; permite cobrar comisiones de proveedores que lo exigen | Formulario online + documentación; revalidación anual | **Gratis** (IATA eliminó el arancel de alta y el anual) | No da tarifas por sí; abre puertas. [IATA TIDS](https://www.iata.org/en/services/travel-agency-program/tids/) **[V]** |
| **IATA GoLite** (acreditación de entrada) | Emitir en BSP con tarjeta del cliente o IATA EasyPay | Constancia ARCA, PCI DSS (o declaración de no uso de tarjetas), personal capacitado | **Sin garantía financiera** (oficial IATA). Arancel de solicitud: CHF 250 a 2.500 según nivel, cuota anual por volumen (fuente secundaria, feb-2025) **[E]** | Acceso directo a BSP. [IATA, ¿qué es GoLite?](https://portal.iata.org/faq/s/article/What-is-GoLite-Accreditation?language=en_US) · [resumen de fees](https://phptravels.com/blog/how-to-certify-as-an-iata-travel-agency). Ojo: los sitios tipo "Innovatur" hablan de aval de USD 10.000 — **contradice a IATA, descartado** |

No encontré en Argentina un "consorcio de gestión" al estilo español (grupo de compras que negocia por sus asociadas y les vende ERP): el rol lo cumplen **las redes de franquicias (§3.2)** y **las plataformas B2B de arriba**.

### 3.2 Redes de franquicia (números publicados)

| Red | Inversión / canon | Regalías | Condiciones | Fuente |
|---|---|---|---|---|
| **Travel Services** (31+ agencias) | Inversión **USD 10.000–15.000** (mobiliario + habilitación); canon de ingreso **desde USD 20.000** según locación (dato de otra nota, posiblemente incluye local) | Regalías por facturación + **0,5 %** publicidad | Población mínima 60.000, territorio exclusivo, 1–2 empleados; recupero desde 15 meses | [blog Travel Services, feb-2025](https://blog.travelservices.com.ar/2025/02/franquicias-de-agencias-de-viajes.html) · [iProfesional](https://www.iprofesional.com/negocios/405445-cuanto-hay-que-invertir-en-una-franquicia-de-agencia-de-viajes) **[V]** |
| **Almundo** (todas sus oficinas son franquicias desde 2024) | **~USD 30.000** | A consultar | Recupero 12–18 meses; dueños ganan USD 4.000–7.000/mes según la empresa | [iProfesional](https://www.iprofesional.com/negocios/441650-abrir-franquicia-de-agencia-de-viajes-almundo-cuesta-lo-mismo-que-auto-okm-barato) · [Ladevi](https://argentina.ladevi.info/almundo/almundo-invita-los-agentes-viajes-empoderarse-traves-sus-franquicias-n74325) **[V]** |
| **Feliz Viaje** (Córdoba) | **USD 13.950** total | **6 %** sobre rentabilidad + **4 %** publicidad sobre rentabilidad | Contrato 4 años, local 20 m², población mín. 20.000, capacitación 3 días en Córdoba, sin experiencia previa | [GAF Franquicias](https://www.gaf-franquicias.com/franquicia/Feliz-Viaje.html) · [felizviaje.tur.ar](https://felizviaje.tur.ar/sea-un-franquiciado/) **[V]** (fecha de la ficha no visible) |
| **One Trip** (Córdoba, relanzó franquicias en 2025) | Canon **no publicado [NV]**; software propio **USD 50/mes** | — | Margen promedio 13–15 %, recupero <1 año; acceso a la red de acuerdos con mayoristas | [iProfesional, oct-2025](https://www.iprofesional.com/negocios/439415-cuanto-cuesta-invertir-en-una-franquicia-one-trip-y-rentabilidad) **[V]** |
| **Lozada Viajes** (83 franquicias, 11 provincias) | Canon variable; cifras publicadas están en pesos de 2018 (**desactualizadas**) | Bonificadas el 1er año | Contrato 5 años | [Reportur, 2018](https://www.reportur.com/agencias/2018/07/29/lozada-viajes-quiere-llegar-200-franquicias-2022/) **[V]** dato viejo |

---

## 4. Las cámaras: FAEVYT, AVIABUE y regionales

| Ítem | Dato | Fuente |
|---|---|---|
| Estructura | FAEVYT = federación de **28 asociaciones regionales**, +1.800 socias. En CABA la regional es **AVIABUE** (fundada 1981, Viamonte 783 2°, socios@aviabue.org.ar) | [UN Tourism](https://www.untourism.int/affiliate-member-organization/535736) · [AVIABUE](http://www.aviabue.org.ar/quienes-somos.php) **[V]** |
| Cuota | **No publicada** por AVIABUE ni FAEVYT **[NV]**. Una regional (AAAVYT El Calafate) declara "sin costo de afiliación, cuota mínima mensual". **[E]** orden de magnitud de cuota mensual de cámara pyme en CABA: decenas de miles de pesos | [AAAVYT El Calafate](https://aaavytfte.com.ar/) |
| Qué da AVIABUE | Capacitación, asesoría legal en marcas a tarifa preferencial, **bonificación 36 meses de cuenta corriente en Banco Ciudad**, gestión de **reducción de retenciones de IIBB** por saldo a favor, novedades del sector | [AVIABUE beneficios](http://www.aviabue.org.ar/beneficios-socios.php) · [Turismo530](https://turismo530.com/alivio-fiscal-para-las-agencias-socias-de-aviabue/) **[V]** |
| Qué da FAEVYT | Registro de Idóneos, RNAV (para socias y no socias), Incatur (capacitación; 8.500 agencias capacitadas en un año), **Travel Sale** (2026: 115 agencias, +5.000 ofertas), Sello de Calidad, delegación oficial a ferias (acuerdo con la CAT: solo agencias RNAV) | [Ladevi, Sello](https://argentina.ladevi.info/actualidad/las-agencias-viajes-ya-pueden-obtener-el-sello-calidad-faevyt-sectur-requisitos-y-como-acceder-n102629) · [La Coplera, Travel Sale 2026](https://www.lacoplera.com.ar/single-post/travel-sale-2026-cerr%C3%B3-con-incrementos-de-ventas) · [Ladevi, FAEVYT-CAT](https://argentina.ladevi.info/faevyt/acuerdo-faevyt-y-cat-impulsa-el-registro-nacional-agencias-viajes-n67626) **[V]** |
| ¿Abre puertas con mayoristas? | **Indirectamente**: los mayoristas patrocinan y asisten a las capacitaciones y eventos de las regionales (es donde se consiguen los ejecutivos de cuenta), y el RNAV es la credencial que se pide. **No hay tarifas negociadas por la cámara** para sus socias. **[E]** conclusión sobre lo relevado | — |

**Conclusión §4:** para Azimut la cámara **no es la puerta a tarifas**; es networking, capacitación y el trámite de idóneo/RNAV. Si el presupuesto es corto, primero RNAV (gratis), después socio de AVIABUE.

---

## 5. Mayoristas argentinos, con nombre y apellido

Ningún mayorista publica sus requisitos de alta; en todos es "formulario + contacto comercial". Lo que se ve en la práctica del sector **[E]**: CUIT con actividad 7911xx, datos de la agencia y responsable, y cada vez más **número de RNAV** (la "constancia de legajo" que pedían antes). El acceso XML/API **nunca está en la web pública**; se negocia con el ejecutivo de cuenta y se otorga a agencias con volumen o con tecnología propia.

| Mayorista | Perfil | Alta de agencia | ¿Exige RNAV/legajo? | Portal B2B | XML / API |
|---|---|---|---|---|---|
| **OLA** (Rosario, familia Angeli, 8 sucursales, desde 1990) | Paquetes, hoteles (OLA Click), aéreos; el operador de mayor crecimiento | Formulario online exclusivo para agencias: [awsola.ola.com.ar/usuario/alta](https://awsola.ola.com.ar/usuario/alta); "convenio de alta de agencia" | **[NV]** (probable) | Sí ([ola.com.ar](https://www.ola.com.ar/)) | **Sí, XML documentado**: integraciones con Despegar, Garbarino Viajes, Turismo City, TTS Viajes (casos Ellecktra). Es el único mayorista argentino con XML públicamente acreditado. **[V]** [Ellecktra, caso OLA](https://ellecktra.com/casos/integracion-xml-ola-agencias/) |
| **Juliá Tours Argentina** (desde 1978) | Europa, Medio Oriente, América, Brasil, exóticos, receptivo | Vía web/ejecutivo | **[NV]** | Sí: "Reserva online" para agencias ([juliatours.com.ar](https://www.juliatours.com.ar/micrositio.php?id=189)) | **[NV]**; Tour Vector lo listaba "en proceso de integración" |
| **Free Way** (Córdoba/BA, "mayorista líder") | Paquetes, hoteles, aéreos, circuitos, disponibilidad online 24 hs | Registro online: [freeway.com.ar/registro](https://www.freeway.com.ar/registro/) | **[NV]** | Sí ([online.freeway.com.ar](https://online.freeway.com.ar/)) | **[NV]**; contacto de integraciones publicado: **plataformas@freeway.com.ar** |
| **Delfos** (Córdoba, +25 años, "hub aéreo del interior", sucursal BA) | Paquetes, aéreos, servicios | Portal [mas.delfos.tur.ar](https://mas.delfos.tur.ar/) · info@delfos.tur.ar · 0810-810-3353 | **[NV]** | Sí | **[NV]**; integrado en Tour Vector **[V]** |
| **Eurovips** (desde 1987) | Europa/Norte de África/Medio Oriente + otros | Red de "agencias asociadas" | **[NV]** | Sí | **[NV]**; integrado en Tour Vector **[V]** ([eurovips.com](https://eurovips.com/pages/agencias.html)) |
| **Tower Travel** (BA, Córdoba, Mendoza, Rosario, La Plata, Bahía Blanca, Neuquén) | Solo vende vía agencias ("Tower Partners"); Tower Incoming para receptivo | Alta como Tower Partner (agencias capacitadas) | **[NV]** | Sí | **[NV]** ([Jujuy Dice](https://www.jujuydice.com.ar/noticias/actualidad-9/quien-hace-posible-tu-viaje-el-rol-de-las-operadoras-mayoristas-y-por-que-tower-travel-se-diferencia-56100)) |
| **Juan Toselli International Tours** (Córdoba, +40 años; filial Toselli Tours en EE.UU.) | Multidestino | "Sistema de reservas online exclusivo para agencias" | **[NV]** | Sí ([juantoselli.com](https://www.juantoselli.com/en)) | **[NV]** |
| **Piamonte** (BA) | Salidas grupales y circuitos | Ejecutivo | **[NV]** | **[NV]** | **[NV]** |
| **TTS Viajes / Ticketya** | Minorista + mayorista (ISO 9001); Ticketya es su operadora propia de aéreos y paquetes para agencias | Ejecutivo | **[NV]** | Sí (intranet) | Consume XML de OLA (es cliente, no proveedor) **[V]** |
| **Grupales.com** | Salidas grupales internacionales, +400 agencias | Contacto directo | **[NV]** | Sí | **[NV]** |
| **Otros integrados en Tour Vector**: All Seasons, Grupo Ocho (también consolidadora aérea), Tip Travel, King Midas, Atalaya, Cuarto Continente, Trayecto Uno | — | Vía Tour Vector o directo | — | — | Vía Tour Vector **[V]** |

**Lectura para la automatización:** para una agencia chica, el camino con menos fricción a datos estructurados de mayoristas argentinos es **(1) OLA por XML** (hay antecedentes públicos y equipo de integraciones), **(2) Tour Vector** como agregador (un solo contrato, ~9.000 productos, API en su módulo nuevo — **[NV]** si exponen API a la agencia o solo a su web), y **(3) PriceAgencies** para hotelería con tarifas exclusivas (**[NV]** si tiene API; su matriz PriceTravel sí opera XML en LATAM). El resto hoy es portal B2B + copiar a mano.

---

## 6. La comparación que decide

Supuestos: agencia unipersonal en CABA, sin local, ventas ~USD 15.000–30.000/mes de producto (paquetes + aéreos), 2026. Comisiones de mercado **[E]**: paquetes/terrestre 10–12 %, cruceros 10–15 %, aéreo 0–1 % + fee de emisión (el debate "comisión vs. fee" sigue abierto: [Ladevi](https://argentina.ladevi.info/actualidad/comision-y-fee-un-debate-que-se-mantiene-abierto-las-agencias-viajes-n89893)).

| Vía | Costo de entrada | Tiempo hasta operar | Qué tarifas desbloquea | Margen que deja | Riesgo / observación |
|---|---|---|---|---|---|
| **A. RNAV propio ("legajo") + altas directas + TIDS** | **$0 a ~$120.000** (marca INPI) + idóneo (si no hay: honorario **[E]** $150–400k/mes) | **Días a 2 semanas** con idóneo y marca; **meses** si hay que conseguir idóneo | Todas las del canal: cuenta propia en OLA, Free Way, Delfos, Juliá, Tower, PriceAgencies; consolidador aéreo; XML de OLA si hay volumen | **100 % de la comisión** (10–12 % terrestre) | Responsabilidad solidaria propia (24.240). Es la vía más barata en plata; el idóneo es la única barrera real |
| **B. Franquicia de red** | **USD 10.000–30.000** + regalías (0,5 % a 6 %) | **1–3 meses** (contrato, capacitación, apertura) | Acuerdos y herramientas de la red (mayoristas, software, marca) | Comisión menos regalías; la red suele tener sobrecomisiones por volumen que compensan **[E]** | Pierde marca propia y exclusividad de territorio; recupero 12–18 meses según las redes. Sobredimensionado para Azimut |
| **C. Sub-agencia / asesor bajo EVT con RNAV** | **$0** (contrato escrito de agencia) | **Días** | Las de la EVT paraguas, vía su login; **sin cuenta propia** ni XML | **50–90 % de la comisión** según acuerdo **[E]** (el host retiene 10–30 % en modelos internacionales; en Argentina no hay tabla pública) | Dependencia total del paraguas (tarifas, tiempos, cobros); igual responsabilidad solidaria frente al pasajero. Buena **transición** mientras se consigue idóneo |
| **D. Solo APIs de tarifa pública** (Amadeus Self-Service, bedbanks en sandbox → producción con contrato) | USD 0 en test; producción exige contrato y, en bedbanks, volumen/garantía | Semanas en test; **meses** hasta producción real | Tarifa pública aérea (sin comisión) y hotelería de bedbank internacional | Aéreo: **fee al cliente**; hotel bedbank: markup 8–15 % **[E]** | No cubre el producto que vende una agencia argentina (paquetes de mayoristas locales en pesos/cuotas, grupales, cruceros con comisión). Complemento, no sustituto |

**Veredicto:** A domina en costo/beneficio; C es el puente si falta el idóneo; D complementa a A o C con datos estructurados; B solo si Azimut quisiera crecer con marca ajena.

---

## 7. Camino recomendado para Azimut

### Escenario 1 — Azimut TIENE legajo (pre-2023) o ya está en el RNAV

1. **Verificar y renovar el RNAV** (buscador en agenciasdeviajes.ar; renovación anual antes del 31/3 con capacitación Incatur). Costo $0. Semana 1.
2. **Sacar TIDS de IATA** (gratis, 3–5 días hábiles): abre comisiones de cadenas hoteleras, cruceros y rentadoras. Semana 1–2.
3. **Altas directas** en OLA (formulario online), Free Way (registro online), Delfos, Juliá Tours y Tower Partners; **PriceAgencies** (gratis) para hotelería con tarifa exclusiva; un **consolidador aéreo** (Viajes FAT o Grupo Ocho) para emitir sin IATA. Semanas 2–4. En cada alta, pedir explícitamente al ejecutivo: condiciones de comisión, **si existe XML/API y qué volumen piden** (con OLA hay antecedentes públicos).
4. **Evaluar Tour Vector** como agregador (demo, fee mensual a cotizar, alta en 72 hs): resuelve en un solo contrato el inventario de ~9 mayoristas locales; preguntar si el módulo nuevo expone API a la agencia (**[NV]**). Mes 2.
5. **Sello de Calidad FAEVYT-SecTur** (gratis) y, si hay presupuesto, socio de **AVIABUE** para networking con ejecutivos de mayoristas. Mes 2–3.
6. Con las cuentas activas y volumen mensual en 2–3 mayoristas, **negociar el XML de OLA** y reutilizar lo aprendido con el resto. Mes 3–6.
7. En paralelo, mantener el modelo "factura el operador, Azimut factura comisión" — pero **documentarlo por escrito con cada mayorista** (por cuenta y orden) y tener un contrato/condiciones con el pasajero que deje clara la intermediación: no elimina la solidaridad de la 24.240, pero acota daños e información.

### Escenario 2 — Azimut NO tiene legajo/RNAV

**Diagnóstico primero (día 1):** ¿el titular o alguien del equipo es Técnico/Licenciado en Turismo? Eso decide todo.

- **Si hay idóneo:** ir directo al Escenario 1 desde el paso 0: constancia ARCA con 791100, inscripción AAIP ($0, TAD), solicitud de marca en INPI ($40.569 por clase a sept-2026, o ~$120.000 con gestor), inscripción del idóneo en FAEVYT y alta en el RNAV. **Costo total ~$40.600–120.000; plazo ~2–4 semanas** (más lo que tarde el INPI en conceder, que el RNAV tolera con el trámite iniciado — confirmar).
- **Si NO hay idóneo (el caso probable de una agencia chica):**
  1. **Ahora (días):** firmar un **contrato de agencia escrito** (CCyC 1479 y ss.) con una EVT inscripta en el RNAV que actúe como paraguas: Azimut promueve y asesora, la EVT (o el mayorista por cuenta y orden) factura al pasajero, Azimut factura su comisión a la EVT. Negociar retención del paraguas ≤ 20–30 % de la comisión y acceso al login B2B de los mayoristas de la EVT. Candidatos: una agencia socia de AVIABUE con la que ya haya relación, o programas tipo "Nómadas by Nomádica". Sumar **TIDS** propio (gratis) y **PriceAgencies** (gratis; verificar si aceptan sin RNAV).
  2. **En paralelo (1–3 meses):** resolver el idóneo por la vía más barata: contratar un idóneo part-time (mercado, **[E]** $150–400k/mes) o convenir con un profesional que se inscriba como idóneo de Azimut; consultar a FAEVYT si sigue existiendo la vía de examen sin título (**[NV]**). Registrar marca y AAIP mientras tanto (los dos son independientes del idóneo).
  3. **Al tener idóneo:** alta en el RNAV ($0), migrar de sub-agencia a cuentas propias (Escenario 1, pasos 3–6). El contrato de agencia con el paraguas se rescinde con preaviso (CCyC prevé preaviso de un mes por año de vigencia).
- **Lo que no conviene:** pagar una franquicia (USD 10–30k) para conseguir "legajo" — el RNAV es gratis y la barrera real (idóneo) se resuelve por mucho menos; ni quedarse solo con APIs de tarifa pública, que no cubren el producto que Azimut vende.

**Costos totales estimados del Escenario 2 en 6 meses [E]:** $0 en registros + $40.600–120.000 de marca + idóneo (si se contrata) $900k–2,4M acumulado + Tour Vector (fee no publicado) — contra un ingreso por comisión de 10–12 % sobre ventas de USD 15–30k/mes.

---

## 8. Lo que queda por confirmar (pendientes concretos)

1. Si Azimut figura en el RNAV (buscador por CUIT/razón social en agenciasdeviajes.ar).
2. Si el RNAV acepta *solicitud* de marca (no concesión) dentro de los 30 días — consulta a FAEVYT.
3. Si FAEVYT sigue tomando examen de idoneidad para no titulados en 2026.
4. Fee mensual de Tour Vector y si expone API a la agencia (pedir demo).
5. Requisitos de alta y existencia de XML en Free Way (plataformas@freeway.com.ar), Delfos, Juliá, Tower, Toselli — una ronda de mails con la misma pregunta.
6. Si PriceAgencies Argentina y los consolidadores aéreos piden RNAV para afiliar.
7. Cuota social 2026 de AVIABUE (socios@aviabue.org.ar).

— Elaborado por GSG
