> **Procedencia:** recuperado del bundle `_recuperacion_inbox_20260710` (2026-07-10), investigación fundacional del dueño. Incorporado sin alterar el contenido original.

---

# Inteligencia Competitiva & Taller de Innovación
## Mercado de ERP / Gestión sub-SAP-B1 en Argentina

**Preparado para:** Gestión Studio Grow (GSG)
**Productos de GSG:** "Comercio Micro" (kiosco, carnicería, gastronomía chica, estética/servicios, retail chico) y "PyME/Empresa" (empresas que no pueden pagar SAP Business One)
**Norte de diseño:** mixtura Apple (simpleza, deleite, rendimiento sin fricción) × SAP (profundidad, correctitud, rigor de empresa), con facturación electrónica ARCA (ex-AFIP) nativa
**Fecha:** 10 de julio de 2026
**Clasificación:** Decision-grade — para decisiones de producto y posicionamiento

---

## Nota metodológica y de confianza

Este documento se construyó con relevamiento web directo (búsqueda + lectura de fuentes públicas). Las fuentes se citan por URL al pie de cada ficha y sección. Reglas aplicadas:

- No se copió documentación propietaria textual; todo está sintetizado.
- Los precios en Argentina cambian con alta frecuencia por inflación y se publican habitualmente **más IVA (21%)**. Tipo de cambio referencial usado por los equipos de relevamiento: ~$1.200 ARS/USD.
- Los datos no confirmables con fuente pública directa están marcados **[SUPUESTO]** y requieren validación antes de decisiones irreversibles.
- Las cifras de precio de SAP, Tango (ERP completo) y Maxirest provienen en parte de comparadores/partners y no de tarifarios oficiales abiertos; se presentan como rangos.

---

# PARTE 1 — RELEVAMIENTO COMPETITIVO

Se agrupan los competidores en cinco capas, porque **no todos compiten en el mismo plano**. Esto es central para la tesis: GSG no enfrenta a "un" competidor integral, sino a un mosaico de soluciones parciales, cada una fuerte en una capa y ciega en las demás.

1. ERP de referencia superior (el techo que GSG evita): SAP B1, SAP Public Cloud.
2. Gestión/ERP local y gastronomía: Tango, Fudo, Bistrosoft, Maxirest.
3. Turnos/servicios: tuturno.io, AgendaPro, Booksy, Fresha, Calendly.
4. Facturación/contabilidad PyME: Colppy, Xubio, Alegra, Nubox, Defontana.
5. Pagos e infraestructura: Increase, Geopagos, Mercado Pago.

---

## Capa 1 — ERP de referencia (el techo del mercado)

### Ficha 1.1 — SAP Business One (SAP B1)

**Segmento objetivo.** PyMEs de 10–250 usuarios; base instalada mundial de +83.000 empresas. En Argentina se posiciona como el ERP "de entrada" de SAP para comercio, distribución y manufactura liviana. Implementaciones típicas de 3–6 meses vía partner.

**Módulos / capacidades.**
- **FI (Finanzas):** núcleo del producto. Contabilidad completa, multimoneda, mayor, CxC/CxP, conciliación bancaria, presupuestos, reporting financiero. Sólido para una sola entidad legal.
- **MM (Compras):** ciclo procure-to-pay completo (solicitudes manuales o por MRP, OC, recepción, factura de proveedor).
- **SD (Ventas):** order-to-cash; cotizaciones, verificación automática de stock, picking, CRM básico.
- **WM (Almacén):** inventario multi-depósito con bines, series/lotes en tiempo real. Robusto pero "básico" (no un WMS avanzado).
- **QM (Calidad):** sin módulo nativo dedicado; se cubre parcialmente con inventario/producción o add-ons de partner. [SUPUESTO]
- **HR (RRHH):** módulo básico de legajos; no es nómina/HCM completa. La liquidación de sueldos argentina se resuelve con software externo o add-on.
- **PM (Mantenimiento):** sin Plant Maintenance/EAM propio; existe módulo de Service (contratos, service calls) para postventa. [SUPUESTO para PM industrial]
- Extra: Producción y MRP multinivel (BOM, órdenes de producción).

**Modelo de precio (USD, rangos públicos; se vende solo vía partner).**
- Licencia perpetua on-premise: usuario Professional ≈ USD 2.700–3.213 (pago único); Limited ≈ USD 1.400–1.666. Más ~20% anual de mantenimiento.
- Suscripción cloud: ≈ USD 74–91/usuario/mes (algunas fuentes) hasta ≈ USD 108–219 (fuentes USA, single-tenant).
- Implementación con partner: sin cifra pública AR; proxy regional (Perú) USD 8.000 a 120.000+ según complejidad. [SUPUESTO para AR]

**Fortalezas.** Todo en un sistema con datos integrados; reporting muy valorado; inventario robusto en tiempo real; UI configurable por rol (mejor que ERPs legacy); ecosistema fuerte de partners en AR.

**Debilidades / quejas (G2, Capterra).** Caro para PyME; curva de aprendizaje pronunciada y alto costo de implementación; reportes de cuelgues/crashes con pérdida de trabajo; **multi-entidad legal deficiente** (cada entidad es una base separada → consolidación e intercompañía muy difíciles); integraciones a veces complicadas.

**UX.** Cliente de escritorio Windows tradicional (más pesado que un SaaS moderno), con Web Client/Fiori y app móvil añadidos. Intuitivo "dentro del mundo SAP", no tan moderno como un ERP cloud nativo.

**Integraciones (AR).** Facturación electrónica ARCA/AFIP **no nativa** — vía localización + add-ons de partner (genera CAE contra web services de ARCA). Mercado Pago/MercadoLibre vía conectores de partner.

**Qué NO hace bien / no cubre.** FE argentina no nativa (dependencia y costo de add-on en cada cambio normativo); nómina argentina no cubierta; sin QM/PM industriales nativos; consolidación multicompañía débil; costo total alto para la PyME chica.

*Fuentes:* [emerging-alliance](https://www.emerging-alliance.com/sap-business-one-pricing-explained-how-much-does-it-really-cost-in-2025/) · [erpresearch – B1 pricing](https://www.erpresearch.com/pricing/sap-business-one) · [Xamai](https://www.xamai.com/en/blog/cuanto-cuesta-sap) · [Tipalti – módulos](https://tipalti.com/blog/sap-business-one-modules/) · [G2 – reviews](https://www.g2.com/products/sap-business-one/reviews) · [Capterra](https://www.capterra.com/p/214667/SAP-Business-One/reviews/) · [H&CO Argentina](https://sap.hco.com/sap-business-one-ar/) · [foros consultoría SAP – FE AR](https://foros.consultoria-sap.com/t/facturacion-electronica-argentina/29857)

---

### Ficha 1.2 — SAP S/4HANA Cloud, Public Edition (GROW with SAP)

**Segmento objetivo.** ERP cloud SaaS multi-tenant para mid-market y subsidiarias de grandes empresas; típicamente desde ~200 empleados. Modelo "clean core" con mejores prácticas preconfiguradas y upgrades trimestrales automáticos.

**Módulos / capacidades (varían por edición).** FI/CO completo y moderno (punto fuerte); MM (Sourcing & Procurement); SD (order-to-cash); WM vía EWM embebido (logística compleja requiere SAP EWM en BTP); QM vía scope items (menos profundo que on-premise); HR solo Organizational Management básico (HCM completo requiere SuccessFactors, licencia aparte); PM básico (EAM avanzado requiere add-on).

**Modelo de precio (USD).** Suscripción por usuario/mes. ≈ USD 180–400/usuario/mes (baseline ~180); usuario professional full ≈ USD 1.800–2.200/año. Descuentos enterprise del 40–65% con volumen y compromisos plurianuales. Implementación AR vía partner, sin cifra pública. [SUPUESTO]

**Fortalezas.** UX Fiori moderna, web, por roles, con dashboards en tiempo real; upgrades automáticos (bajo TCO de mantenimiento); mejores prácticas preconfiguradas; analítica embebida (HANA).

**Debilidades / quejas.** Customización rígida ("clean core" limita ABAP/modificaciones); gaps funcionales vs Private/on-premise; migración compleja desde ECC customizado; menos flexibilidad para lógica industria-específica.

**UX.** Moderna: Fiori launchpad web, apps por rol, acceso móvil. Su punto más fuerte.

**Integraciones (AR).** FE ARCA/AFIP vía SAP Document and Reporting Compliance (Cloud Edition) + middleware/partners de localización (ej. Origen Technologies). Advertencia: la contingencia CAEA no está en el alcance estándar de la localización argentina. Mercado Pago: no nativo, requiere conector/BTP. [SUPUESTO]

**Qué NO hace bien / no cubre.** Sobredimensionado para PyME chica (pensado desde ~200 empleados; costo por usuario alto); FE AR depende de DRC + middleware con gaps de contingencia; nómina AR no cubierta sin SuccessFactors + partner; rigidez de customización; ecosistema local de partners menos maduro que el de B1. [SUPUESTO]

*Fuentes:* [erp-pilot](https://www.erp-pilot.com/erp/systems/sap-s4hana-public-cloud) · [erpresearch – pricing](https://www.erpresearch.com/pricing/sap-s4-hana-public-cloud) · [erpresearch – módulos](https://www.erpresearch.com/en-us/sap-s/4-hana-modules) · [G2 – S/4HANA Cloud](https://www.g2.com/products/sap-s-4hana-cloud/reviews) · [SAP Help – e-invoices AR](https://help.sap.com/docs/cloud-edition/sap-document-and-reporting-compliance-cloud-edition/e-invoices-sap-s-4hana-cloud-argentina) · [SAP Community – CAEA contingencia](https://community.sap.com/t5/financial-management-blog-posts-by-sap/important-communication-about-e-invoicing-and-contingency-argentina-caea/ba-p/14278430)

> **Lectura estratégica de la Capa 1:** SAP define el "techo" de rigor (FI/MM/SD profundos, multi-entidad, auditoría) pero paga ese rigor con costo, complejidad, UX pesada y **FE argentina no nativa**. GSG no debe competir aquí de frente: debe robar el *rigor conceptual* de SAP y entregarlo sin su fricción, con FE ARCA nativa como diferencial estructural.

---

## Capa 2 — Gestión local y gastronomía

### Ficha 2.1 — Tango (Axoft / grupo Softland)

**Segmento objetivo.** PyMEs y medianas de Argentina (comercio, servicios, industria, distribución). ERP horizontal, no gastronómico. Líneas por tamaño: Evo, Plus, XPlus, Gold; entrada con Tango Factura.

**Módulos.** ERP modular: Ventas (facturación, CxC, cobranzas, listas de precios), Compras (proveedores, OC, pagos, retenciones), Stock (multi-depósito, partidas), Contabilidad (asientos, balances, cierre), Sueldos con archivos AFIP. Sin POS gastronómico ni comandas de cocina.

**Precio.** Suscripción según categoría + módulos + usuarios. Tango Factura ~$171.906 + IVA/mes (mensual) o ~$137.524 + IVA/mes (anual). ERP desde ~$15.000/mes por módulos básicos; Tango Gestión completo desde ~$528.000/mes más implementación con consultor. [SUPUESTO: cifras de ERP completo de comparadores, no de tarifario oficial]

**Fortalezas.** Estándar de facto en gestión/contabilidad AR; muy usado por contadores/estudios; robusto en facturación, presupuestos y contabilidad; enorme base instalada y red de distribuidores; adaptado a normativa local.

**Debilidades / quejas.** Al crecer en stock/sucursales/logística "se le notan los límites operativos"; inconsistencias puntuales y soporte que "a veces queda corto"; costo total elevado (licencias + implementación + consultor); curva de aprendizaje.

**UX.** Históricamente desktop/Windows con estética clásica; hoy también cloud/web. Percibido como "empresarial/antiguo" frente a POS gastronómicos modernos.

**Integraciones.** FE AFIP/ARCA nativa; archivos AFIP (sueldos, retenciones).

**Qué NO hace bien / no cubre.** No es solución gastronómica (sin POS de salón, KDS, mesas, PedidosYa/Rappi); menos ágil en operación multisucursal de alto volumen en tiempo real; UX no deleitosa.

*Fuentes:* [axoft.com](https://www.axoft.com/tango/software-de-gestion/) · [comparasoftware – Tango Factura](https://www.comparasoftware.es/tango-factura) · [wynges – comparativa ERP](https://wynges.com/blog/comparativa-de-precios-cual-es-el-erp-mas-rentable-para-pymes-tango-softland-xubio-lider-sap-365-odoo-oracle-sage-infor/)

---

### Ficha 2.2 — Fudo

**Segmento objetivo.** Micro/pequeño/mediano gastronómico (restaurantes, bares, cafés) y cadenas (plan Multisucursal). Fuerte en AR y regional (BR, CL, CO, MX, PE, PY, UY).

**Capacidades.** POS 100% cloud. Base: ventas por mostrador, arqueos de caja, impresión de comandas, carta QR. Avanzado: inventario, recetas, clientes/proveedores, reportes. Pro: múltiples cajas/turnos, estado de resultados, inventario valorizado. **Módulos pagos aparte:** Facturación Electrónica, Gestión de Mesas, Monitor de Cocina (KDS), Delivery Apps, Ventas por Comensal, Balanzas, Recepcionista IA. App de camareros y tienda online incluidas.

**Precio (jun-2026, ARS/mes con impuestos).** Inicial $20.900, Avanzado $41.000, Pro $65.000, Multisucursal a consultar. Módulos: FE $13.500, Mesas $8.500, KDS $19.500, Delivery Apps $19.500, Ventas por Comensal $13.500, Balanzas $19.500, Recepcionista IA $55.000. Usuarios ilimitados. Descuentos 5/10/15%. Prueba gratis.

**Fortalezas.** Muy fácil de usar, UX moderna; usuarios ilimitados; app de camareros; delivery centralizado; soporte y capacitación gratis; actualizaciones automáticas; precio de entrada bajo.

**Debilidades / quejas.** El precio base "engaña": mesas, facturación y delivery son módulos pagos que elevan el costo final. 100% cloud → **si se cae internet, se cae el sistema** (confirmado en su FAQ). Reportes de aumentos sin aviso, demoras de soporte, inventario "complicado", falta de visibilidad de stock al tomar pedidos, casos fiscales complejos limitados. Rating ~3.5/5 en ComparaSoftware.

**UX.** La más moderna del rubro: web + app móvil, sin instalación local.

**Integraciones.** FE ARCA; delivery Rappi y PedidosYa (módulo); Mercado Pago como medio de pago; balanza Systel Croma; API general.

**Qué NO hace bien / no cubre.** Sin modo offline robusto; no es ERP/contabilidad completa; costo real crece por módulos; casos fiscales complejos limitados.

*Fuentes:* [fu.do/precios](https://fu.do/es-ar/precios/) · [PDF planes jun-2026](https://fu.do/assets/files/AR_FUDO_Planes-y-precios_JUN-26.pdf) · [comparasoftware – fudo](https://www.comparasoftware.com.ar/fudo)

---

### Ficha 2.3 — Bistrosoft

**Segmento objetivo.** Gastronómico PyME, comedores corporativos y multilocal (plan Premium). AR, México, España.

**Capacidades.** Web + Android. Licencia Web: comandas, facturación, 1 comandera, carta QR, estadísticas, mesas (hasta 20), stock. Avanzado: usuarios ilimitados, stock/costos/recetas, mesas ilimitadas, delivery. Premium: API, facturación masiva web, multilocal, centro de producción, tienda online. Licencias adicionales: Móvil, Salón, Cocina, Facturación, Web (reportes). Mesa de ayuda 24 hs.

**Precio (ARS/mes + IVA).** Web desde $36.000, Avanzado desde $66.000, Premium desde $96.000. Sin permanencia mínima. No incluye hardware. Ojo: **facturación incluida solo en Web**, no en Avanzado/Premium.

**Fortalezas.** Integral y moderna, fácil de usar; visión global; soporte 24 hs valorado; sin permanencia; buen ecosistema de pagos/delivery.

**Debilidades / quejas.** Fallas operativas y soporte que no las resuelve a tiempo (ej. "3 días perdiendo mesas"); confusión por facturación no incluida en planes superiores; precio de entrada más alto que competidores.

**UX.** Moderna; licencia web (Windows) + apps Android; doble pantalla touch.

**Integraciones.** Partners oficiales PedidosYa, Rappi, Mercado Pago y Contabilium (contabilidad/facturación). FE ARCA/AFIP vía módulo. API en Premium.

**Qué NO hace bien / no cubre.** No es ERP contable general (se apoya en Contabilium); facturación desagregada confusa; dependencia de soporte para incidencias en dispositivos; no publica precio "todo incluido".

*Fuentes:* [bistrosoft.com/ar/precios](https://bistrosoft.com/ar/precios/) · [comparasoftware – bistrosoft](https://www.comparasoftware.com.ar/bistrosoft)

---

### Ficha 2.4 — Maxirest (MaxiSistemas)

**Segmento objetivo.** Gastronómico de todo tamaño, de local único a grandes cadenas. AR, UY, PY. Uno de los más veteranos del rubro.

**Capacidades.** POS ("Adición") + Back Office. XPRESS: POS, caja, delivery/take away, menú digital, reservas online, monitor de cocina, pagos contactless, informes, monopuesto. PRO: todo XPRESS + back office (cajas, bancos, compras, stock, personal, analytics, multipuesto). Costos por receta, stock min/máx, cuentas corrientes, fidelización, call center de pedidos. Toma de pedidos desde celular/tablet/Clover.

**Precio.** Por cotización (XPRESS y PRO sin tarifa fija pública). Comunicación indica desde ~$11.996 + IVA/mes con implementación bonificada. [SUPUESTO: piso de nota comercial de terceros] Reviews mencionan cargo de mantenimiento (~$5.000/mes o ~$11.000 por arreglo de falla) [dato 2021, posiblemente desactualizado].

**Fortalezas.** Muy completa y madura, escalable a cadenas; fuerte back office (compras, bancos, stock, personal, analytics); muchas integraciones; adaptable a formatos gastronómicos; cumplimiento ARCA.

**Debilidades / quejas.** Rating bajo en ComparaSoftware (2.7/5; servicio al cliente 2.0). Quejas por política de mantenimiento/cobros ("te cobran por arreglar fallas de su sistema"), pocas actualizaciones, soporte lento, dificultad para dar de baja, estabilidad. Opiniones mixtas.

**UX.** Clásica/tradicional; puestos Windows (mono/multipuesto) + apps y hardware Clover. Menos moderna que Fudo/Bistrosoft.

**Integraciones.** Amplias: PedidosYa, Rappi, másDelivery, Waitry, Alax, Tucan, Habitué, Order Fast, Clover y Mercado Pago. FE ARCA.

**Qué NO hace bien / no cubre.** Reputación de soporte/posventa y modelo de cobros de mantenimiento es el punto flojo; UX menos moderna; poca transparencia de precios; no es ERP contable general.

*Fuentes:* [maxirest.com/planes](https://maxirest.com/planes) · [comparasoftware – maxirest](https://www.comparasoftware.com.ar/maxirest)

> **Lectura estratégica de la Capa 2:** Tango es rigor sin deleite ni verticalización operativa; Fudo/Bistrosoft son deleite y operación gastronómica sin profundidad contable-ERP; Maxirest es amplitud con UX vieja y mala reputación de soporte. Ninguno combina POS moderno + profundidad ERP + FE nativa + buen soporte. El costo real de todos crece por "módulos pagos", lo que abre una oportunidad de pricing transparente todo-incluido.

---

## Capa 3 — Turnos / servicios

### Ficha 3.1 — tuturno.io

**Segmento objetivo.** PyMEs/emprendimientos de servicios AR e hispanohablante: peluquería, barbería, estética, spa, uñas, tatuajes; con enfoque para salud (recetas/órdenes).

**Capacidades.** Reservas online ilimitadas, agenda dinámica, recordatorios email/WhatsApp, cobro de señas vía Mercado Pago, cupones, servicios recurrentes/por cupos, multi-sucursal. Plan alto: caja, informes de ventas/caja, liquidación de sueldos, stock de productos, roles, export a Excel, WhatsApp Marketing.

**Precio (por profesional/mes).** Básico USD 10, Profesional USD 16, Empresa USD 21 (con cupón referido -15% "de por vida"). Prueba 14 días. Facturación en USD (expuesta a TC/impuestos AR).

**Fortalezas.** Pensado nativamente para AR/LatAm; recordatorios WhatsApp incluidos; Mercado Pago integrado; buena reputación en Google; UX intuitiva; incluye stock y caja en plan alto (poco común).

**Debilidades / quejas.** Poco volumen de reviews independientes verificables; precio en dólares es la queja más señalada; el plan Básico no permite cobrar señas.

**UX.** Simple/intuitiva; recordatorios WhatsApp como diferencial diario.

**Integraciones.** Mercado Pago, WhatsApp, email. Google Calendar no confirmado. **FE ARCA/AFIP no confirmada.**

**Qué NO hace bien / no cubre.** Los planes públicos **no mencionan facturación electrónica legal ARCA** — probablemente no emite comprobantes fiscales. [SUPUESTO] Maneja stock/caja operativos pero no es ERP contable. Pocos reviews externos.

*Fuentes:* [tuturno.io/planes](https://www.tuturno.io/suscripciones/planes) · [tuturno.io](https://www.tuturno.io/)

---

### Ficha 3.2 — AgendaPro

**Segmento objetivo.** Líder LatAm en negocios de servicios: belleza, estética, spa/wellness, salud. Multi-sucursal. MX, CO, AR, CL (+20.000 negocios declarados).

**Capacidades.** Reservas online, recordatorios (WhatsApp/email/SMS), ficha de cliente, pagos online (Mercado Pago en AR), marketing, POS/venta de productos, inventario, gestión de personal/comisiones, reportes, marketplace de servicios.

**Precio.** Basic/Gold/Platinum (sin plan gratuito). Internacional ~USD 26–58/mes. AR desde ~$7.900/mes (incluye 50 mensajes); consultas online desde ~$10.900/mes.

**Fortalezas.** Cobertura amplia "todo en uno"; fuerte en LatAm; Capterra 4.8; soporte por chat ágil; Mercado Pago nativo AR.

**Debilidades / quejas.** Pago del propio servicio engorroso; recordatorios WhatsApp se cobran aparte y se envían por servicio (no por cliente); ficha clínica muy básica; falta feedback/reseñas de clientes; bugs tras updates; UI percibida como "plana".

**UX.** Panel todo-en-uno con reportes; app móvil (Business); chat ágil.

**Integraciones.** Mercado Pago (AR), Google Analytics, Meta Pixel. Google Calendar no confirmado. **FE fiscal ARCA/AFIP para el negocio no confirmada.** [SUPUESTO]

**Qué NO hace bien / no cubre.** Historia clínica robusta; WhatsApp no incluido (extra); FE fiscal ARCA no confirmada; sin contabilidad ERP; sin plan gratuito.

*Fuentes:* [Capterra – AgendaPro](https://www.capterra.com/p/218709/AgendaPro/) · [Planes AR](https://agendapro.com/ar/planes)

---

### Ficha 3.3 — Booksy

**Segmento objetivo.** Beauty/grooming, sobre todo profesionales independientes (barberos, peluqueros, manicura, lashes). Fuerte en EE.UU. y Europa vía marketplace de consumidores.

**Capacidades.** Reservas online, recordatorios, ficha de cliente, gestión de personal/agendas, pagos, POS, marketing (SMS/email), reportes, y exposición en marketplace (+35M consumidores).

**Precio.** Plano: USD 29,99/mes con todo incluido; USD 20/mes por staff adicional. Prueba 14 días. Procesamiento de pago aparte.

**Fortalezas.** Marketplace enorme de captación; muy fuerte en barbería/peluquería en EE.UU.; fácil; buen valor para un profesional solo.

**Debilidades / quejas.** Costo escala rápido en multi-staff/multi-local (USD 20 por staff extra); marketplace centrado en EE.UU./Europa, no en AR.

**UX.** App móvil pulida para el profesional; descubrimiento vía marketplace; onboarding sencillo.

**Integraciones.** Pagos/POS propios; app en español (listada en App Store AR). Sin evidencia de Mercado Pago ni FE ARCA.

**Qué NO hace bien / no cubre para AR.** Marketplace y densidad de reservas en EE.UU./Europa — poco valor de captación en AR. [SUPUESTO] No integra Mercado Pago ni factura en AR [SUPUESTO]; sin contabilidad/FE argentina; menos orientado a stock/ERP.

*Fuentes:* [biz.booksy.com/pricing](https://biz.booksy.com/en-us/pricing) · [Capterra – Booksy](https://www.capterra.com/p/142741/Booksy/)

---

### Ficha 3.4 — Fresha

**Segmento objetivo.** Salones de belleza, spa, estética, barbería, wellness; de profesional individual a múltiples sedes.

**Capacidades.** Reservas, agenda multi-usuario, ficha de cliente, POS integrado, pagos, inventario, marketing, comisiones/timesheets, reportes, marketplace.

**Precio.** Históricamente "sin suscripción" (gratis) hasta 2025; cambió a planes Independent/Team desde ~USD 9,95–19,95/mes por miembro (según región). Fees: ~20% sobre citas de clientes nuevos del marketplace; procesamiento ~1,29%–2,19%.

**Fortalezas.** Muy económico en base; funcionalidad completa (POS, inventario, pagos, marketing); interfaz limpia; marketplace de captación.

**Debilidades / quejas.** Gestión de pagos complicada (demoras, transferencias poco confiables); comisiones del marketplace disputadas; bugs de sincronización y dobles reservas; **soporte deficiente** (sin teléfono); molestia por cambios de pricing desde el "gratis".

**UX.** Diseño limpio, apto para principiantes; POS integrado.

**Integraciones.** Pagos y POS propios (Fresha Payments); marketplace propio. Sin evidencia de Mercado Pago ni FE ARCA.

**Qué NO hace bien / no cubre para AR.** No localizado para Argentina; pagos con tarjetas internacionales, sin Mercado Pago ni FE ARCA [SUPUESTO]; fees del marketplace encarecen/generan conflictos; soporte flojo; no es ERP contable argentino.

*Fuentes:* [fresha.com/pricing](https://www.fresha.com/pricing) · [Trustpilot – Fresha](https://www.trustpilot.com/review/fresha.com)

---

### Ficha 3.5 — Calendly

**Segmento objetivo.** Profesionales y equipos B2B (ventas, reclutamiento, CS, consultoría, freelancers). Scheduling genérico de reuniones — **no** vertical de belleza/salud presencial.

**Capacidades.** Agenda de citas/reuniones, tipos de evento, disponibilidad en tiempo real, recordatorios, round-robin (equipos), cobro por reunión, sync de calendarios y video. Sin POS, ficha de servicios, stock ni marketing de retención.

**Precio.** Free (1 tipo de evento). Standard USD 10/usuario/mes (anual). Teams USD 16 (anual). Enterprise desde ~USD 15.000/año.

**Fortalezas.** Estándar de facto para agendar reuniones; confiable y fácil; excelentes integraciones de calendario/video; cobros vía Stripe/PayPal sin fee de Calendly; rating ~4.7.

**Debilidades / quejas.** Caro para equipos; funciones fragmentadas por tier; enfocado a reuniones, no a operar un negocio presencial.

**UX.** Flujo de reserva mínimo sin fricción; el link de agenda es su mayor virtud.

**Integraciones.** Google Calendar, Outlook, Zoom; pagos con Stripe y PayPal. **No integra Mercado Pago.**

**Qué NO hace bien / no cubre.** No es plataforma de gestión de negocio de servicios (sin POS, ficha de belleza/salud, stock, fidelización, WhatsApp nativo); **no integra Mercado Pago ni factura en AR** (solo Stripe/PayPal); sin marketplace de captación. Inadecuado como turnos + caja + facturación para AR.

*Fuentes:* [calendly.com/pricing](https://calendly.com/pricing) · [Calendly Payments](https://calendly.com/payments)

> **Lectura estratégica de la Capa 3:** Es el whitespace más nítido del relevamiento. **Ninguno de los cinco confirma facturación electrónica legal ARCA ni contabilidad/ERP.** Solo AgendaPro y tuturno están localizados para AR con Mercado Pago y stock/caja operativos (no fiscal). Booksy/Fresha son productos US/EU. Calendly es scheduling B2B. El hueco: **turnos + Mercado Pago + FE ARCA + stock/caja/contabilidad en un solo producto**, que nadie cubre de forma confirmada. Aquí "Comercio Micro" (estética/servicios) puede ganar de entrada.

---

## Capa 4 — Facturación / contabilidad PyME

### Ficha 4.1 — Colppy (🇦🇷)

**Segmento y origen.** Argentino. PyMEs, comercios y especialmente contadores/estudios. Cloud contable-administrativo.

**Capacidades.** FE ARCA/AFIP (incl. Factura T turismo), CxC/CxP, tesorería multimoneda, stock en tiempo real, conciliación bancaria, libro de sueldos digital, retenciones/percepciones, reportes contables e impositivos (IVA digital, ajuste por inflación en planes altos).

**Precio (planes contadores, +IVA).** Contador Inicio ~$33.534, Independiente ~$72.157, Consultoras/Estudios ~$117.737/mes. Planes PyME sin cifra pública abierta. [SUPUESTO]

**Fortalezas.** Interfaz moderna; enfoque en el circuito contador-empresa; multimoneda; ajuste por inflación; app móvil con indicadores clave.

**Debilidades / quejas.** Escasez de reseñas verificables; soporte por mail 24–48 h en planes estándar; usuarios piden mejoras (TXT ret./perc., asignación de vendedores).

**UX.** 100% cloud + app móvil.

**Integraciones.** ARCA/AFIP, Mercado Pago. Menos ecosistema e-commerce que Xubio.

**Qué NO cubre bien.** No es ERP profundo (sin producción/MRP, sin multi-sucursal robusta ni POS presencial). Orientado a administración-contabilidad.

*Fuentes:* [colppy.com](https://colppy.com/) · [ComparaSoftware – Colppy](https://www.comparasoftware.com.ar/colppy)

---

### Ficha 4.2 — Xubio (🇦🇷, grupo Visma)

**Segmento y origen.** Argentino (parte de Visma desde 2023). +50.000 empresas y +6.000 estudios en AR, CO, MX. Emprendedores, PyMEs y contadores.

**Capacidades.** FE A/B/C/E (exportación de servicios, crédito MiPyme), compras/OC/despachos, stock (depósitos, ajustes), bancos (conciliación vía Excel o Interbanking, cheques), impuestos completos (IVA, SICORE, SIRE, RG 3685, ret./perc., SIFERE, ARBA), contabilidad con **ajuste por inflación**, sueldos (30–150 legajos, LSD), reportes de gestión (cubos/gráficos).

**Precio (planes Empresa, +IVA, débito bancario).** Gratis (10 comprob/mes, 1 usuario); Básico $94.900; Estándar $155.600; Avanzado $209.300; Pro $295.000/mes. Con otros medios de pago sube ~30%. Ajuste trimestral. Sin permanencia; prueba 14 días.

**Fortalezas.** Plan gratuito real; bajo costo de entrada; respaldo Visma; contabilidad + impuestos + ajuste por inflación muy completos para AR; API pública; app móvil.

**Debilidades / quejas.** "Se queda corto al crecer la empresa"; falta de ayuda en línea y mejora continua; conciliación bancaria no 100% automática (depende de Excel/Interbanking).

**UX.** Cloud + app iOS/Android.

**Integraciones.** MercadoLibre, Mercado Pago, MercadoShops, TiendaNube, WooCommerce, API, ARCA/AFIP.

**Qué NO cubre bien.** No es ERP de producción/manufactura ni multi-sucursal avanzada; sin POS presencial dedicado; profundidad operativa limitada frente a Tango/Defontana.

*Fuentes:* [Precios Empresas](https://xubio.com/ar/precios-empresas) · [Capterra – Xubio](https://www.capterra.com/p/209497/Xubio/)

---

### Ficha 4.3 — Alegra (🇨🇴, con presencia AR)

**Segmento y origen.** Colombiano; 13+ países. Emprendedores, autónomos y PyMEs. En AR es Proveedor Tecnológico Autorizado ante ARCA/AFIP.

**Capacidades.** FE (con **CAEA** para seguir facturando si cae AFIP), contabilidad, inventario ("bodegas"), ventas/compras, **POS** (producto aparte), reportes. Enterprise para +1.000 facturas/mes.

**Precio (Gestión AR, sin IVA).** Emprendedor $27.999 (2 usuarios, 100 fact/mes); PyME $40.999 (250 fact); Pro $68.999 (3 usuarios, 500 fact); Plus $109.999 (5 usuarios, 1.000 fact)/mes. Prueba 15 días; -10% anual; sin permanencia. POS aparte.

**Fortalezas.** Precios de entrada bajos y transparentes; UX moderna y simple; soporte 24/7; multipaís; POS en la suite; 4.7/5 en ComparaSoftware.

**Debilidades / quejas.** App móvil con errores (cambia sola tipo de facturación/fechas); críticas a demoras del soporte pese al 24/7; contabilidad menos "argentina-profunda" que Xubio/Colppy en regímenes provinciales. [SUPUESTO]

**UX.** Cloud + app + POS multidispositivo.

**Integraciones.** ARCA/AFIP, API para desarrolladores; ecosistema e-commerce/pagos según país. [SUPUESTO detalle AR]

**Qué NO cubre bien.** No es ERP profundo (sin producción/MRP); multi-sucursal y cadena de suministro limitadas.

*Fuentes:* [Precios Gestión AR](https://www.alegra.com/argentina/gestion/precios/) · [Trustpilot – Alegra](https://www.trustpilot.com/review/alegra.com)

---

### Ficha 4.4 — Nubox (🇨🇱)

**Segmento y origen.** Chileno. PyMEs, microempresas, emprendedores y contadores chilenos. Cloud contable + FE SII + remuneraciones. +14.000 clientes activos.

**Capacidades.** FE y boletas certificadas ante el **SII**, libro compras/ventas, declaración de IVA F29 conciliada con SII, contabilidad completa, remuneraciones (liquidaciones, finiquitos, AFP/Isapre-Fonasa/AFC), conciliación bancaria, reportes, cobranza.

**Precio (CLP/mes).** Pyme Básico $15.000; Pyme Completo $29.900 (contabilidad + remuneraciones, hasta 3 usuarios); Contador desde $49.900 (multi-empresa). Prueba gratis.

**Fortalezas.** Integración nativa con el SII; módulo de remuneraciones muy completo para ley chilena; implementación rápida (<1 semana); 100% cloud; fuerte en contadores multiempresa.

**Debilidades / quejas.** **Solo Chile** (no sirve para AR). Enfoque muy contable/técnico, "poco amigable para el que decide", sin dashboards ágiles. Soporte lento y fallas de sincronización con el SII.

**UX.** Cloud multidispositivo; app de remuneraciones.

**Integraciones.** SII, Previred, bancos, Mercado Público, GeoVictoria.

**Qué NO cubre bien.** No es ERP completo (sin inventario robusto, manufactura/MRP ni proyectos). **Irrelevante para AR salvo como referencia de diseño.**

*Fuentes:* [nubox.com](https://www.nubox.com/) · [ComparaSoftware CL](https://www.comparasoftware.cl/nuboxcontabilidad)

---

### Ficha 4.5 — Defontana (🇨🇱, ERP cloud)

**Segmento y origen.** Chileno. ERP cloud para PyMEs y medianas/grandes. +8.000 empresas en CL, MX, PE, CO. Cumplimiento fiscal nativo por país.

**Capacidades.** Suite ERP integral: contabilidad/finanzas, **inventario en tiempo real**, compras, ventas/pedidos, FE, CRM integrado, RRHH/remuneraciones, POS, análisis. Planes Génesis (PyME) y Sapiens (grandes).

**Precio.** Plan Emprendedor gratis permanente (1 usuario, hasta 20 DTE/mes). Excedente por UF; usuario/empresa adicional 1 UF. Planes Gold/Platinum/Black. Pago por transferencia/Webpay, hasta 12 cuotas.

**Fortalezas.** ERP verdaderamente integral 100% cloud (más profundo que Nubox/Xubio/Alegra); multipaís con cumplimiento local; modular; infraestructura AWS; CRM y RRHH nativos; plan gratuito de entrada.

**Debilidades / quejas.** Costo alto vs calidad de soporte; **caídas del servicio, lentitud, pérdida de tiempo**; capacitación deficiente; imposibilidad de facturar en incidentes; curva de aprendizaje.

**UX.** 100% cloud sin instalación.

**Integraciones.** FE por país (SII/SAT/SUNAT/DIAN), POS, CRM/RRHH internos. [SUPUESTO e-commerce/bancos vía módulos/partners]

**Qué NO cubre bien.** Su punto débil no es el alcance sino soporte/estabilidad y complejidad/precio; para producción/MRP avanzada puede quedar atrás de ERPs industriales. [SUPUESTO] **Presencia AR limitada actualmente** — es el referente más cercano al "sub-SAP-B1 integral" que GSG persigue.

*Fuentes:* [defontana.com/cl](https://www.defontana.com/cl) · [Capterra – Defontana](https://www.capterra.com/p/196372/Defontana-ERP/)

> **Lectura estratégica de la Capa 4:** Xubio y Colppy dominan la profundidad impositiva argentina (ajuste por inflación, SIFERE, ARBA, SICORE) pero "se quedan cortos" al crecer y carecen de POS presencial y operación en tiempo real. Alegra es simple y multipaís pero menos "argentino-profundo". Defontana es el único ERP integral, pero con soporte malo y poca presencia local. **El hueco central: profundidad impositiva argentina + operación en tiempo real (POS/stock/multi-sucursal) + UX deleitosa + soporte confiable, todo junto.** Es exactamente el territorio de "PyME/Empresa" de GSG.

---

## Capa 5 — Pagos e infraestructura

### Ficha 5.1 — Increase (increase.app)

**Qué es y segmento.** Fintech argentina de gestión, conciliación y cobranzas sobre los pagos con tarjeta que el comercio ya recibe. No es adquirente ni billetera. PyMEs medianas/grandes con alto volumen de tarjeta (+1.500 empresas LatAm).

**Capacidades.** Card (conciliación automática de ventas con tarjeta, detección de diferencias POS vs liquidado, contracargos, proyección de cobros, reportes Excel); Pay (cobranzas únicas/recurrentes con reintentos); Count (calculadora de costos finales). No hace adquirencia, QR, Point, cuenta/CVU ni liquidación de fondos.

**Precio.** No publica tarifas; modelo SaaS por suscripción/volumen. [SUPUESTO]

**Fortalezas.** Conciliación masiva muy rápida (~50.000 registros/minuto; ~80% de ahorro de tiempo); recupero por contracargos; visibilidad unificada multi-adquirente; APIs.

**Debilidades / quejas.** Sin cuerpo público de quejas. Depende de la calidad de datos de los adquirentes; controla, no cobra. [SUPUESTO]

**UX.** Dashboard con calendario de cobros; sección de contracargos accionable; reportes a Excel.

**Integraciones.** Portal de desarrolladores y API pública; se conecta a adquirentes/tarjetas. Integraciones ERP o ARCA no confirmadas. [SUPUESTO]

**Qué NO hace / no cubre.** No es ERP; no factura; no maneja stock; no procesa pagos ni liquida fondos. Es conciliación/reportería + cobranzas de tarjetas.

*Fuentes:* [increase.app](https://increase.app/) · [increase.app/productos/card](https://increase.app/productos/card/) · [developers.increase.app](https://developers.increase.app)

---

### Ficha 5.2 — Geopagos (geopagos.com)

**Qué es y segmento.** Fintech argentina de infraestructura de pagos B2B ("Adquirencia como Servicio", white-label). Vende tecnología para que bancos/adquirentes/PSPs/fintechs/retailers lancen aceptación de pagos — **no comercios individuales**. ~16 países; clientes: Getnet (Santander), BBVA, Itaú, Fiserv, Niubiz, Banco Estado. Levantó US$35M (2022).

**Capacidades.** Plataforma end-to-end de adquirencia white-label: todos los medios (crédito/débito, contactless, QR), captura en POS (mPOS/softPOS/apps), gestión de transacciones, liquidación y conciliación, visualización unificada. Producto "Geo Store" (e-commerce white-label).

**Precio.** B2B/enterprise (licenciamiento + fees), no publicado. No aplica comisión al comercio (no vende al comercio final). [SUPUESTO]

**Fortalezas.** Infraestructura probada multi-país; llave en mano; white-label; escalable; clientes de primer nivel; apuesta a IA.

**Debilidades / quejas.** Sin relación con el comercio final ni marca propia; depende de la ejecución del cliente adquirente. [SUPUESTO]

**UX.** La UX de cara al comercio la define cada cliente (white-label).

**Integraciones.** Vía APIs; se integra al stack del banco/adquirente. ARCA/ERP dependen de la implementación de cada cliente. [SUPUESTO]

**Qué NO hace / no cubre.** No es servicio para el comercio individual; no es ERP ni gestión; no factura ni maneja stock. Es el motor de adquirencia detrás de otras marcas.

*Fuentes:* [geopagos.com](https://geopagos.com/) · [La Nación – Geopagos](https://www.lanacion.com.ar/economia/IA/geopagos-de-pionera-en-tecnologia-en-el-punto-de-venta-a-referente-en-infraestructura-integral-para-nid19022026/)

---

### Ficha 5.3 — Mercado Pago (mercadopago.com.ar)

**Qué es y segmento.** Brazo fintech de MercadoLibre: ecosistema completo de pagos y finanzas, del consumidor al comercio. Emprendedores/cuentapropistas, PyMEs y grandes comercios. Jugador dominante en pagos digitales en AR.

**Capacidades.** QR interoperable (Transferencias 3.0) y QR propio; lectores Point (Bluetooth/Plus/Smart); link de pago, checkout online, cobros recurrentes; cuenta digital con CVU, cuenta remunerada, tarjeta prepaga/débito; préstamos a comercios (hasta $10M) y crédito al consumidor; liquidaciones configurables; reportería básica de ventas.

**Precio/comisiones (AR 2026, aprox., +IVA cuando aplica).** QR: saldo ~0,6%; débito ~0,6–1,2%; crédito ~2,99–4,49% según cuotas. Point presencial: débito ~3,25% + IVA con acreditación en el momento. Online: inmediata ~4,99% + IVA vs diferida a 14 días ~3,99% + IVA (a mayor plazo, menor comisión). Point sin alquiler ni mantenimiento; costo del lector variable. [SUPUESTO precios exactos, cambian seguido]

**Fortalezas.** Escala y aceptación masiva (efecto red); ecosistema todo-en-uno; QR interoperable; sin costos fijos en Point; acreditación inmediata; integración con MercadoLibre; APIs maduras.

**Debilidades / quejas.** Bloqueo de cuentas y dinero retenido (contracargos, verificaciones — pueden demorar 7+ días hábiles); soporte lento/impersonal; comisiones altas en acreditación inmediata; dependencia total de la plataforma.

**UX.** App muy pulida (cobrar, cuenta, rendimientos, tarjeta, préstamos); QR fácil; Point plug-and-play.

**Integraciones.** Sincroniza datos fiscales con ARCA/AFIP (condición/domicilio; CVU reportado); APIs/SDKs para e-commerce; terceros de facturación que se conectan a MP. [SUPUESTO ERPs vía partners]

**Qué NO hace / no cubre.** Es pagos + servicios financieros, **NO un ERP/gestión completo**. **NO emite FE ARCA por sí mismo** (reporta datos fiscales; requiere software de facturación externo integrado). **NO maneja stock/catálogo/inventario**; no es contabilidad ni administración integral.

*Fuentes:* [mercadopago.com.ar](https://www.mercadopago.com.ar/) · [Costo de Point](https://www.mercadopago.com.ar/ayuda/cuanto-cuesta-recibir-pagos-con-point_2779) · [Cuenta MP](https://www.mercadopago.com.ar/cuenta)

> **Lectura estratégica de la Capa 5:** Ninguno es ERP/gestión con FE + stock. Increase controla tarjetas (no cobra), Geopagos es infraestructura white-label (no vende al comercio), Mercado Pago cobra y da finanzas pero **no factura ni gestiona inventario**. Estos son **rieles sobre los que GSG debe integrarse, no competidores a derrotar**: Mercado Pago como medio de cobro nativo, e Increase como referencia de conciliación (o socio) para el producto Empresa.

---

# PARTE 2 — TALLER DE GAPS + INNOVACIÓN

## 2.1 Matriz de cobertura (capacidades × competidores)

Leyenda: ● cubre bien · ◐ parcial/con fricción · ○ no cubre o no confirmado. Foco: segmento AR sub-SAP-B1.

| Capacidad ↓ / Competidor → | SAP B1 | Tango | Fudo/Bistro | Maxirest | AgendaPro/tuturno | Xubio/Colppy | Alegra | Defontana | Mercado Pago |
|---|---|---|---|---|---|---|---|---|---|
| **FE ARCA nativa (no add-on)** | ○ | ● | ◐ | ◐ | ○ | ● | ● | ◐ | ○ |
| **Contabilidad + impuestos AR profundos** | ● | ● | ○ | ○ | ○ | ● | ◐ | ◐ | ○ |
| **Ajuste por inflación / SIFERE / ARBA** | ◐ | ● | ○ | ○ | ○ | ● | ◐ | ○ | ○ |
| **POS presencial moderno** | ◐ | ○ | ● | ● | ◐ | ○ | ◐ | ◐ | ◐ |
| **Stock/inventario en tiempo real** | ● | ◐ | ◐ | ● | ○ | ◐ | ◐ | ● | ○ |
| **Gestión de turnos/servicios** | ○ | ○ | ○ | ◐ | ● | ● | ○ | ○ | ○ |
| **Comandas/KDS/mesas (gastro)** | ○ | ○ | ● | ● | ○ | ○ | ○ | ○ | ○ |
| **Multi-sucursal robusta** | ● | ◐ | ◐ | ● | ◐ | ○ | ◐ | ● | ○ |
| **Multi-entidad / consolidación** | ◐ | ◐ | ○ | ○ | ○ | ○ | ○ | ◐ | ○ |
| **Nómina/sueldos AR** | ○ | ● | ○ | ○ | ◐ | ● | ○ | ◐ | ○ |
| **Cobros/medios de pago integrados** | ◐ | ◐ | ● | ● | ● | ◐ | ◐ | ◐ | ● |
| **Conciliación de tarjetas** | ◐ | ○ | ○ | ○ | ○ | ◐ | ○ | ◐ | ◐ |
| **Delivery (PedidosYa/Rappi)** | ○ | ○ | ● | ● | ○ | ○ | ○ | ○ | ○ |
| **UX moderna / deleite (Apple)** | ○ | ○ | ● | ○ | ◐ | ◐ | ● | ◐ | ● |
| **Rigor/profundidad de empresa (SAP)** | ● | ● | ○ | ◐ | ○ | ◐ | ◐ | ● | ○ |
| **Soporte confiable** | ◐ | ◐ | ◐ | ○ | ◐ | ◐ | ◐ | ○ | ○ |
| **Modo offline robusto** | ● | ● | ○ | ● | ○ | ○ | ○ | ○ | n/a |
| **Pricing transparente todo-incluido** | ○ | ○ | ○ | ○ | ◐ | ◐ | ● | ◐ | ● |
| **IA nativa en el flujo de trabajo** | ○ | ○ | ◐ | ○ | ○ | ○ | ○ | ○ | ○ |

### Whitespace que emerge de la matriz

Ninguna columna tiene ● simultáneamente en las tres filas fundacionales de GSG: **FE ARCA nativa + UX moderna/deleite + rigor de empresa**. Los patrones de vacío son claros:

1. **Nadie une profundidad impositiva AR + UX deleitosa + soporte confiable.** Los profundos (Tango, Xubio, Colppy) son grises/antiguos; los deleitosos (Fudo, Alegra) son superficiales en contabilidad.
2. **Nadie une turnos/servicios + FE ARCA fiscal + caja/stock.** La Capa 3 entera factura "operativo" pero no fiscal. Whitespace directo para "Comercio Micro" (estética/servicios).
3. **La columna de IA nativa está casi vacía.** Solo asoma en "Recepcionista IA" de Fudo y en la retórica de Geopagos. Es el diferencial más grande disponible hoy.
4. **Pricing: todos crecen por módulos pagos.** Un pricing transparente todo-incluido es un ángulo de posicionamiento inmediato.
5. **Offline robusto + cloud moderno rara vez coexisten.** Los modernos (Fudo, AgendaPro) mueren sin internet; los offline (Tango, Maxirest) son viejos. En AR (conectividad irregular), esto es un gap operativo real.

---

## 2.2 Oportunidades priorizadas no cubiertas (por producto)

Prioridad: **P0** (fundacional, define el producto), **P1** (alto valor diferencial), **P2** (relevante, segunda ola).

### Producto "Comercio Micro" (kiosco, carnicería, gastronomía chica, estética/servicios, retail chico)

- **[P0] POS moderno con FE ARCA nativa + cobro integrado (QR/Point Mercado Pago) en un solo flujo.** Hoy el micro-comerciante combina Fudo/POS + un facturador + Mercado Pago suelto. Unificar venta → factura → cobro en una pantalla, con deleite Apple, no existe bien resuelto en el segmento micro.
- **[P0] Turnos + caja + FE fiscal para estética/servicios.** Gap confirmado: AgendaPro/tuturno no facturan legalmente ARCA. Una peluquería/estética que reserva, cobra la seña por Mercado Pago **y emite la factura fiscal** desde el mismo turno es whitespace directo.
- **[P1] Modo offline-first real.** Que la venta y la comanda no se caigan cuando se corta internet (dolor confirmado en Fudo), sincronizando al reconectar. Rigor SAP (correctitud transaccional) con simpleza Apple.
- **[P1] Pricing transparente todo-incluido.** FE, mesas, delivery y KDS incluidos, no como módulos pagos que "engañan" (queja explícita contra Fudo). Ángulo de honestidad como marca.
- **[P1] Alta y catálogo sin fricción (por foto/código de barras/detección de marca).** El micro no quiere cargar 300 SKUs a mano. Ver §2.3.
- **[P2] Balanza/carnicería y recetas/costos por rubro.** Verticales micro específicas (carnicería con balanza, gastronomía con recetas) con plantillas listas.
- **[P2] Delivery (PedidosYa/Rappi) integrado** para gastronomía chica, sin saltar de pantalla.

### Producto "PyME/Empresa" (los que no pueden pagar SAP B1)

- **[P0] ERP integral con FE ARCA nativa + profundidad impositiva argentina (ajuste por inflación, SIFERE, ARBA, SICORE, ret./perc.).** Combinar la profundidad de Xubio/Colppy con la operación en tiempo real (stock/POS/multi-sucursal) que ellos no tienen, y con UX moderna. Es el corazón del producto.
- **[P0] Multi-sucursal y multi-entidad bien resueltas.** Debilidad explícita de SAP B1 (consolidación difícil) y de Xubio/Colppy (multi-sucursal débil). Un grupo económico PyME argentino no tiene hoy buena opción sub-SAP.
- **[P1] Conciliación automática de tarjetas y bancos.** El dolor que Increase monetiza. Integrarlo nativo (o vía partnership con Increase) es valor inmediato para el que factura mucho con tarjeta.
- **[P1] Compras/MM y ventas/SD con rigor, sin la pesadez de SAP.** Order-to-cash y procure-to-pay completos, con la correctitud de SAP y la ligereza de un SaaS moderno.
- **[P1] Soporte confiable como diferencial.** Queja transversal (Defontana, Maxirest, Mercado Pago, Fudo). En un mercado con soporte malo, la confiabilidad de soporte es diferenciación real.
- **[P2] Nómina/sueldos AR nativa.** SAP no la cubre; Tango/Xubio sí. Para el producto Empresa es tabla-de-apuestas de mediano plazo.
- **[P2] Producción/MRP liviano** para manufactura PyME (nadie sub-SAP lo hace bien).

---

## 2.3 Apuestas de innovación AI-native

La columna "IA nativa" de la matriz está casi vacía: es el terreno donde GSG puede ganar sin pelear feature-por-feature con incumbentes. Cada apuesta se evalúa por la **mixtura Apple×SAP** (¿aporta simpleza/deleite y/o profundidad/rigor?) y por **esfuerzo/valor**.

| # | Apuesta AI-native | Apple (simpleza/deleite) | SAP (profundidad/rigor) | Esfuerzo | Valor | Producto |
|---|---|---|---|---|---|---|
| A | **Alta de producto por foto / detección de marca-código** (cámara → producto, precio sugerido, catálogo poblado) | Alto | Medio | Medio | Alto | Micro + Empresa |
| B | **Carga de catálogo y lista de precios por foto de remito/lista del proveedor** (OCR + extracción estructurada) | Alto | Alto | Medio | Alto | Micro + Empresa |
| C | **Conciliación automática de tarjetas/bancos con IA** (matching, detección de diferencias y contracargos) | Medio | Alto | Alto | Alto | Empresa |
| D | **Asistente de stock/reposición** (predice quiebres, sugiere compra por histórico y estacionalidad) | Alto | Alto | Medio | Alto | Micro + Empresa |
| E | **Asistente de venta/mostrador** (upsell, combos, "quién compró esto también llevó…") | Alto | Bajo | Bajo | Medio | Micro |
| F | **Insights en lenguaje natural** ("¿cómo vendí este mes vs el pasado?", alertas proactivas de caja/margen) | Alto | Medio | Bajo | Alto | Micro + Empresa |
| G | **Copiloto fiscal/contable ARCA** (explica qué factura emitir, alerta vencimientos, arma percepciones, responde "¿esto lleva IVA?") | Alto | Alto | Alto | Alto | Micro + Empresa |
| H | **Onboarding conversacional** (alta del negocio hablando/por foto del CUIT y ARCA; configura rubro, alícuotas y catálogo base) | Alto | Medio | Medio | Alto | Micro |
| I | **Recepcionista/agenda IA para servicios** (reserva por WhatsApp, reprograma, confirma, cobra seña) | Alto | Bajo | Medio | Medio | Micro (servicios) |
| J | **Detección de anomalías/fraude y errores de carga** (montos raros, duplicados, márgenes negativos) | Medio | Alto | Medio | Medio | Empresa |
| K | **Cierre contable asistido** (sugerencia de asientos, borrador de balance, ajuste por inflación explicado) | Medio | Alto | Alto | Alto | Empresa |

Notas de evaluación: A, B, D y F son de mejor relación esfuerzo/valor (aprovechan modelos multimodales listos, con dolor claro). G y C son los de mayor valor y rigor, pero mayor esfuerzo (requieren corrección impositiva/financiera verificable — aquí el "rigor SAP" es no-negociable: un copiloto fiscal que se equivoca destruye confianza). E y H son quick wins de deleite.

---

## 2.4 Top 7 apuestas recomendadas

1. **Alta/catálogo por foto (A + B).** Elimina el trabajo más odiado del onboarding (cargar productos y precios). Deleite Apple inmediato, con rigor en la estructura de datos. Aplica a ambos productos y baja drásticamente el time-to-value — la principal barrera de adopción en micro.
2. **Copiloto fiscal/contable ARCA (G).** Es la encarnación pura de Apple×SAP: convierte la complejidad impositiva argentina (donde Tango/Xubio son fuertes pero áridos) en una conversación simple. Ningún competidor lo tiene. Máxima defensibilidad si se ejecuta con corrección verificable.
3. **Insights + alertas proactivas en lenguaje natural (F).** Bajo esfuerzo, alto deleite; ataca la queja de que Xubio/Nubox son "para el contador, no para el que decide". Convierte datos en decisiones sin dashboards.
4. **Asistente de stock/reposición predictivo (D).** Resuelve un dolor real (quiebres y sobre-stock) que ningún competidor sub-SAP aborda con IA. Rigor operativo + simpleza de recomendación.
5. **Conciliación automática de tarjetas/bancos (C).** Para "PyME/Empresa": captura el valor que Increase monetiza aparte, integrado en el ERP. Diferencial fuerte para comercios con alto volumen de tarjeta; evaluar build vs partnership con Increase.
6. **Onboarding conversacional por CUIT/ARCA (H).** El primer "momento de deleite": el negocio queda configurado (rubro, alícuotas, catálogo base) en minutos, hablando o sacando una foto. Define la primera impresión de marca.
7. **Recepcionista/agenda IA para servicios (I) + FE fiscal.** Para "Comercio Micro" en estética/servicios: reserva por WhatsApp, cobra seña por Mercado Pago y **emite factura ARCA** — exactamente el gap que AgendaPro/tuturno no cierran.

**Por qué ganarían (una línea cada una):**
(1) Nadie más elimina la fricción de carga con cámara → adopción más rápida del segmento. (2) Es el único "traductor" de la complejidad ARCA a lenguaje simple, con rigor. (3) Da valor de decisión al dueño, no solo al contador. (4) Convierte el stock de tarea en recomendación proactiva. (5) Integra un dolor caro (conciliación) que hoy se paga aparte. (6) Gana el primer minuto de la relación con el usuario. (7) Cierra el único circuito completo (turno + cobro + factura) que el mercado de servicios no tiene.

---

# RESUMEN EJECUTIVO

El mercado argentino de gestión/ERP por debajo de SAP Business One está **fragmentado en capas que no se hablan**: SAP fija el techo de rigor pero es caro, pesado y sin FE ARCA nativa; Tango tiene profundidad contable con UX de los 2000; Fudo/Bistrosoft/Maxirest resuelven la operación gastronómica pero no la contabilidad; AgendaPro/tuturno agendan servicios pero **no facturan fiscalmente**; Xubio/Colppy dominan los impuestos argentinos pero "se quedan cortos" al crecer y no operan en tiempo real; Alegra es simple pero poco profundo; Defontana es el único ERP integral pero con soporte malo y poca presencia local; y Mercado Pago cobra pero no factura ni gestiona stock. **En ninguna columna coexisten FE ARCA nativa + UX deleitosa + rigor de empresa** — que es exactamente el norte Apple×SAP de GSG.

El hueco de mercado, por producto, es concreto. En **"Comercio Micro"**: unir POS moderno + FE ARCA nativa + cobro Mercado Pago + turnos/caja para servicios en un solo flujo, con pricing todo-incluido honesto y modo offline real — nadie lo hace bien hoy. En **"PyME/Empresa"**: combinar la profundidad impositiva argentina (ajuste por inflación, SIFERE, ARBA) con operación en tiempo real (stock, multi-sucursal, multi-entidad) y UX moderna, cubriendo el vacío entre Xubio (poco profundo al crecer) y SAP B1 (caro y pesado). Sobre ambos, **la columna de IA nativa está casi vacía**: es la palanca de diferenciación más grande y menos disputada.

**Diferenciaciones con las que GSG puede ganar:**

*Comercio Micro:* (1) el único que factura ARCA de verdad dentro de un POS/turnos deleitoso; (2) alta de catálogo y onboarding por foto/voz (time-to-value en minutos); (3) pricing transparente todo-incluido + offline-first; (4) circuito completo turno → cobro → factura para servicios.

*PyME/Empresa:* (1) profundidad impositiva AR de Tango/Xubio con UX y rendimiento de un SaaS moderno; (2) multi-sucursal/multi-entidad bien resueltas (el punto ciego de SAP B1 y de los locales); (3) copiloto fiscal/contable ARCA y conciliación automática de tarjetas/bancos como IA nativa; (4) soporte confiable como promesa de marca en un mercado donde el soporte es la queja transversal.

La estrategia no es superar a SAP en rigor ni a Fudo en deleite por separado, sino **ser el primero en entregar ambos a la vez, con IA nativa y FE ARCA en el núcleo** — un territorio que el relevamiento muestra vacante.

---

*Documento preparado con relevamiento web público (jul-2026). Ítems [SUPUESTO] pendientes de validación: precios exactos de SAP en AR, tarifario abierto de Tango ERP completo y de Maxirest, FE fiscal de AgendaPro/tuturno/Booksy/Fresha, precios de Increase/Geopagos, y tarifas vigentes de Mercado Pago Point. Se recomienda confirmar estos puntos con fuentes primarias antes de decisiones de pricing o de partnership.*
