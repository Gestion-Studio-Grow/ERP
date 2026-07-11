> **Procedencia:** recuperado del bundle `_recuperacion_inbox_20260710` (2026-07-10), investigación fundacional del dueño. Incorporado sin alterar el contenido original.

---

# Apéndice — Datos Crudos de Investigación (respaldo)
## GSG · Inteligencia Competitiva ERP/Gestión Argentina · relevamiento jul-2026

> Este archivo preserva las fichas tal como las devolvieron los cinco equipos de relevamiento, con detalle adicional y todas las fuentes. Es material de respaldo del documento principal `GSG_Inteligencia_Competitiva_ERP_Argentina.md`. Ítems marcados **[SUPUESTO]** no fueron confirmados con fuente pública directa.

---

# BLOQUE 1 — SAP Business One y SAP S/4HANA Cloud Public Edition

## SAP Business One (SAP B1)

**Segmento:** ERP de SAP para PyMEs, típicamente 10–250 usuarios. Base instalada +83.000 empresas mundial. En AR/LatAm es el ERP "de entrada" para comercio, distribución y manufactura liviana; implementaciones 3–6 meses.

**Módulos:**
- FI (Finanzas): núcleo. Contabilidad completa, multimoneda, mayor, CxC/CxP, conciliación bancaria, presupuestos, reporting. Sólido para una entidad legal.
- MM (Compras): procure-to-pay completo; solicitudes manuales o por MRP, OC, recepción, factura de proveedor.
- SD (Ventas): order-to-cash; cotizaciones, verificación de stock al convertir a pedido, picking, CRM básico.
- WM (Almacén): inventario multi-depósito, bines, series/lotes en tiempo real. Robusto pero "básico" (no WMS avanzado).
- QM (Calidad): sin módulo nativo dedicado como en S/4HANA; se cubre parcial vía inventario/producción o add-ons. [SUPUESTO]
- HR (RRHH): módulo básico de legajos. No es nómina/HCM completa; liquidación de sueldos AR con software externo/add-on.
- PM (Mantenimiento): sin Plant Maintenance/EAM propio; hay módulo Service (contratos, service calls) para postventa. [SUPUESTO para PM industrial]
- Extra: Producción y MRP multinivel (BOM, órdenes de producción).

**Precio (USD, rangos públicos; solo vía partner):**
- Licencia perpetua on-premise: Professional ≈ USD 2.700–3.213 por usuario (pago único); Limited ≈ USD 1.400–1.666. Más ~20% anual de mantenimiento.
- Suscripción cloud: ≈ USD 74–91/usuario/mes (Xamai) hasta ≈ USD 108–219 (fuentes USA, multi vs single-tenant).
- Implementación con partner: sin cifra pública AR. Proxy regional (Perú): USD 8.000 a 120.000+. [SUPUESTO para AR]

**Fortalezas:** todo en un sistema con datos integrados; reporting muy valorado; inventario robusto en tiempo real; UI configurable por rol; ecosistema fuerte de partners AR (SEIDOR, H&CO, etc.).

**Debilidades/quejas (G2, Capterra):** caro para PyME; curva de aprendizaje y costos de implementación altos; cuelgues/crashes con pérdida de trabajo y errores de back-end; multi-entidad legal deficiente (cada entidad = base separada → consolidación e intercompañía muy difíciles); integraciones a veces complicadas.

**UX:** cliente de escritorio Windows tradicional (más pesado que SaaS moderno), con Web Client/Fiori y app móvil añadidos. Intuitivo dentro del mundo SAP, no tan moderno como ERP cloud nativo.

**Integraciones (AR):** FE ARCA/AFIP no nativa — vía localización + add-ons de partner (genera CAE contra web services de ARCA). Mercado Pago/MercadoLibre vía conectores de partner (sincroniza catálogo, stock, pedidos, pagos). APIs/SDK para e-commerce, envíos, CRM.

**Qué NO cubre para PyME AR:** FE argentina no nativa (costo/mantenimiento de add-on en cada cambio normativo); liquidación de sueldos AR no cubierta; sin QM/PM industriales nativos; multicompañía/consolidación débil; costo total alto para PyME chica.

*Fuentes:* emerging-alliance.com/sap-business-one-pricing-explained · erpresearch.com/pricing/sap-business-one · xamai.com/en/blog/cuanto-cuesta-sap · hco.com/insights/sap-business-one-pricing-costs-usa · synavos.com · tipalti.com/blog/sap-business-one-modules · en.wikipedia.org/wiki/SAP_Business_One · erpresearch.com/en-us/sap-b1 · synesisintl.com/blog/sap-business-one-features-modules-guide.html · blog.nbs-us.com/what-are-the-modules-in-sap-b1 · g2.com/products/sap-business-one/reviews · capterra.com/p/214667/SAP-Business-One/reviews · sap.hco.com/sap-business-one-ar · foros.consultoria-sap.com/t/facturacion-electronica-argentina/29857 · pasarelasdepagos.com/landing/sap-business-one · visualkgroup.com (implementación Perú)

## SAP S/4HANA Cloud, Public Edition (GROW with SAP)

**Segmento:** ERP cloud SaaS multi-tenant (GROW with SAP), mid-market y subsidiarias de grandes empresas; típicamente desde ~200 empleados. Modelo "clean core", mejores prácticas preconfiguradas, upgrades trimestrales automáticos.

**Módulos (varían por edición):** FI/CO completo y moderno (punto fuerte); MM (Sourcing & Procurement); SD (order-to-cash); WM vía EWM embebido (logística compleja requiere SAP EWM en BTP); QM vía scope items (menos profundo que on-premise); HR solo Organizational Management básico (HCM completo = SuccessFactors, licencia aparte); PM básico (EAM avanzado = add-on).

**Precio (USD):** suscripción por usuario/mes. ≈ USD 180–400/usuario/mes (baseline ~180); professional full ≈ USD 1.800–2.200/año. Descuentos enterprise 40–65% con volumen y compromisos plurianuales. Nota: hay ambigüedad entre fuentes FUE vs per-user. Implementación AR vía partner, sin cifra pública. [SUPUESTO]

**Fortalezas:** UX Fiori moderna, web, por roles, dashboards en tiempo real; upgrades automáticos (bajo TCO); mejores prácticas preconfiguradas; analítica embebida HANA.

**Debilidades/quejas (G2, diginomica):** customización rígida ("clean core" limita ABAP/modificaciones); gaps funcionales vs Private/on-premise; migración compleja desde ECC customizado; menos flexibilidad industria-específica.

**UX:** moderna — Fiori launchpad web, apps por rol, "Pages"/"Apps" personalizables, móvil. Su punto más fuerte.

**Integraciones (AR):** FE ARCA/AFIP vía SAP Document and Reporting Compliance (Cloud Edition) + middleware/partners (ej. Origen Technologies). La contingencia CAEA NO está en el alcance estándar de la localización AR. Mercado Pago: no nativo, requiere conector/BTP. [SUPUESTO]

**Qué NO cubre para PyME AR:** sobredimensionado para PyME chica (desde ~200 empleados; USD 180–400/mes/usuario); FE AR depende de DRC + middleware con gaps de contingencia (CAEA); nómina AR no cubierta sin SuccessFactors + partner; rigidez de customización; menor ecosistema de partners local que B1. [SUPUESTO]

*Fuentes:* erp-pilot.com/erp/systems/sap-s4hana-public-cloud · erpresearch.com/pricing/sap-s4-hana-public-cloud · blog.nbs-us.com/what-is-an-fue-when-buying-s/4hana-cloud · redresscompliance.com · king-ict.com · erpresearch.com/en-us/sap-s/4-hana-modules · tipalti.com/blog/sap-s4hana-modules · silvertouchinc.com · pathlock.com/blog/sap-modules-list · g2.com/products/sap-s-4hana-cloud/reviews · diginomica.com/state-sap-s4hana-cloud · help.sap.com/docs/cloud-edition/.../e-invoices-sap-s-4hana-cloud-argentina · community.sap.com/.../electronic-invoicing-in-sap-s-4hana-cloud-public-edition · sap.com/.../origen-technologies-inc-argentina · community.sap.com/.../caea (contingencia)

---

# BLOQUE 2 — Tango, Fudo, Bistrosoft, Maxirest

## Tango (Axoft / grupo Softland)

**Segmento:** PyMEs y medianas AR (comercio, servicios, industria, distribución). ERP horizontal, no gastronómico. Líneas: Evo, Plus, XPlus, Gold; entrada Tango Factura.

**Módulos:** Ventas (facturación, CxC, cobranzas, listas de precios), Compras (proveedores, OC, pagos, retenciones), Stock (multi-depósito, partidas), Contabilidad (asientos, balances, cierre), Sueldos con archivos AFIP. Sin POS gastronómico ni comandas.

**Precio:** suscripción según categoría + módulos + usuarios. Tango Factura ~$171.906 + IVA/mes (mensual) o ~$137.524 + IVA/mes (anual). ERP desde ~$15.000/mes por módulos básicos; Tango Gestión completo desde ~$528.000/mes + implementación con consultor. [SUPUESTO: cifras de ERP completo de comparadores wynges/comparasoftware, no de tarifario oficial Axoft]

**Fortalezas:** estándar de facto en gestión/contabilidad AR; muy usado por contadores/estudios; robusto en facturación, presupuestos, contabilidad; enorme base instalada y red de distribuidores; adaptado a normativa local.

**Debilidades/quejas:** al crecer en stock/sucursales/logística "se le notan los límites operativos"; inconsistencias puntuales; soporte que "a veces queda corto"; costo total elevado; curva de aprendizaje.

**UX:** históricamente desktop/Windows clásico; hoy también cloud/web (Tango Factura y Tango en la nube). Percibido como "empresarial/antiguo".

**Integraciones:** FE AFIP/ARCA nativa; archivos AFIP (sueldos, retenciones).

**Qué NO cubre:** no gastronómico (sin POS salón, KDS, mesas, PedidosYa/Rappi); menos ágil en multisucursal de alto volumen en tiempo real.

*Fuentes:* comparasoftware.es/tango-factura · axoft.com/tango/software-de-gestion · wynges.com/blog/comparativa-de-precios... · wynges.com/blog/top-10-software...

## Fudo

**Segmento:** micro/pequeño/mediano gastronómico y cadenas (Multisucursal). Fuerte en AR y regional (BR, CL, CO, MX, PE, PY, UY).

**Capacidades:** POS 100% cloud. Base: ventas mostrador, arqueos de caja, comandas, carta QR. Avanzado: inventario, recetas, clientes/proveedores, reportes. Pro: múltiples cajas/turnos, estado de resultados, inventario valorizado. Módulos pagos aparte: FE, Gestión de Mesas, Monitor de Cocina (KDS), Delivery Apps, Ventas por Comensal, Balanzas, Recepcionista IA. App de camareros y tienda online incluidas.

**Precio (jun-2026, ARS/mes con impuestos):** Inicial $20.900, Avanzado $41.000, Pro $65.000, Multisucursal a consultar. Módulos: FE $13.500, Mesas $8.500, KDS $19.500, Delivery Apps $19.500, Ventas por Comensal $13.500, Balanzas $19.500, Recepcionista IA $55.000. Usuarios ilimitados. Descuentos 5/10/15% (suscripción/semestral/anual). Prueba gratis. Medios de pago: tarjetas, Mercado Pago, Pago Fácil, Rapipago.

**Fortalezas:** muy fácil de usar y UX moderna; usuarios ilimitados; app de camareros; delivery centralizado; soporte y capacitación gratis; actualizaciones automáticas; precio de entrada bajo.

**Debilidades/quejas:** precio base "engaña" (mesas, facturación, delivery son módulos pagos); 100% cloud → si se cae internet se cae el sistema (confirmado en FAQ); aumentos sin aviso; demoras de soporte; inventario "complicado"; falta visibilidad de stock al tomar pedidos; casos fiscales complejos limitados. Rating ~3.5/5 ComparaSoftware.

**UX:** la más moderna del rubro; web + app móvil, sin instalación local.

**Integraciones:** FE ARCA; delivery Rappi y PedidosYa; Mercado Pago; balanza Systel Croma; API general.

**Qué NO cubre:** sin modo offline robusto; no ERP/contabilidad completa; costo real crece por módulos.

*Fuentes:* fu.do/es-ar/precios · fu.do/assets/files/AR_FUDO_Planes-y-precios_JUN-26.pdf · comparasoftware.com.ar/fudo · ganapan.com.ar/blog/ganapan-alternativa-fudo...

## Bistrosoft

**Segmento:** gastronómico PyME, comedores corporativos y multilocal (Premium). AR, México, España.

**Capacidades:** web + Android. Licencia Web: comandas, facturación, 1 comandera, carta QR, estadísticas, mesas (hasta 20), stock. Avanzado: usuarios ilimitados, stock/costos/recetas, mesas ilimitadas, delivery + propio. Premium: API, facturación masiva web, multilocal, centro de producción, tienda online. Licencias adicionales: Móvil, Salón, Cocina, Facturación, Web. Doble pantalla touch; mesa de ayuda 24 hs.

**Precio (ARS/mes + IVA):** Web desde $36.000, Avanzado desde $66.000, Premium desde $96.000. Sin permanencia mínima. No incluye hardware (comodato opcional CABA/GBA). Facturación incluida SOLO en licencia Web, no en Avanzado/Premium.

**Fortalezas:** integral y moderna, fácil; visión global; soporte 24 hs valorado; sin permanencia; buen ecosistema de pagos/delivery.

**Debilidades/quejas:** fallas operativas y soporte que no resuelve a tiempo (ej. "3 días perdiendo mesas porque no logran que los productos sean visibles en la tablet"); confusión por facturación no incluida en planes altos; precio de entrada más alto.

**UX:** moderna; licencia web (Windows) + apps Android; doble pantalla touch; reportes vía Bistro Web.

**Integraciones:** partners oficiales PedidosYa, Rappi, Mercado Pago y Contabilium (contabilidad/facturación). FE ARCA/AFIP vía módulo. API en Premium.

**Qué NO cubre:** no ERP contable general (se apoya en Contabilium); facturación desagregada confusa; dependencia de soporte para incidencias en dispositivos; no publica precio "todo incluido".

*Fuentes:* bistrosoft.com/ar/precios · comparasoftware.com.ar/bistrosoft · tpvhosteleria.org/bistrosoft

## Maxirest (MaxiSistemas)

**Segmento:** gastronómico de todo tamaño, de local único a grandes cadenas. AR, UY, PY. De los más veteranos del rubro.

**Capacidades:** POS ("Adición") + Back Office. XPRESS: POS, caja, delivery/take away, menú digital, reservas online, monitor de cocina, pagos contactless, informes, monopuesto. PRO: + back office (cajas, bancos, compras, stock, personal, analytics, multipuesto). Costos por receta, stock min/máx, cuentas corrientes, órdenes de pago, fidelización/geomarketing, call center de pedidos. Toma de pedidos desde celular/tablet/Clover.

**Precio:** por cotización (XPRESS/PRO sin tarifa fija pública). Comunicación indica desde ~$11.996 + IVA/mes con implementación bonificada. [SUPUESTO: piso de nota comercial de terceros] Reviews mencionan mantenimiento ~$5.000/mes o ~$11.000 por arreglo de falla [dato 2021, posiblemente desactualizado].

**Fortalezas:** muy completa y madura, escalable a cadenas; fuerte back office; muchas integraciones; adaptable a formatos gastronómicos; cumplimiento ARCA.

**Debilidades/quejas:** rating bajo ComparaSoftware (2.7/5; servicio al cliente 2.0). Quejas por política de mantenimiento/cobros ("te cobran por arreglar fallas de su sistema"), pocas actualizaciones, soporte lento, dificultad para dar de baja, estabilidad. Opiniones mixtas.

**UX:** clásica/tradicional; puestos Windows (mono/multipuesto) + apps y hardware Clover. Menos moderna que Fudo/Bistrosoft.

**Integraciones:** amplias — PedidosYa, Rappi, másDelivery, Waitry, Alax, Tucan, Habitué, Order Fast, Clover y Mercado Pago. FE ARCA.

**Qué NO cubre:** reputación de soporte/posventa y modelo de cobros de mantenimiento es lo más flojo; UX menos moderna; poca transparencia de precios; no ERP contable general.

*Fuentes:* maxirest.com/planes · comparasoftware.com.ar/maxirest · sistemasdefacturacionygestion.com.ar/restaurantes/maxirest-gastronomico

---

# BLOQUE 3 — Turnos/servicios: tuturno.io, AgendaPro, Booksy, Fresha, Calendly

## tuturno.io

**Segmento:** PyMEs/emprendimientos de servicios AR e hispanohablante: peluquería, barbería, estética, spa, uñas, cejas/pestañas, maquillaje, tatuajes; enfoque salud (recetas/órdenes).

**Capacidades:** reservas online ilimitadas, agenda dinámica, recordatorios email/WhatsApp, cobro de señas vía Mercado Pago, bloqueo de agenda, cupones, servicios recurrentes/por cupos, rotación de sucursales. Plan alto: caja, informes de ventas/caja, liquidación de sueldos, stock de productos, roles (admin/cajero), export a Excel, WhatsApp Marketing.

**Precio (por profesional/mes):** Básico USD 10, Profesional USD 16, Empresa USD 21 (cupón referido -15% "de por vida"). Prueba 14 días. Facturación en USD.

**Fortalezas:** nativo AR/LatAm; recordatorios WhatsApp incluidos; Mercado Pago integrado; buena reputación Google (~180+ opiniones); UX intuitiva; incluye stock y caja en plan alto.

**Debilidades/quejas:** poco volumen de reviews independientes verificables (opiniones mayormente en su sitio/Google, sesgo); precio en dólares es la queja principal; Básico no permite cobrar señas.

**Integraciones:** Mercado Pago, WhatsApp, email. Google Calendar no confirmado. FE ARCA/AFIP no confirmada.

**Qué NO cubre:** planes públicos no mencionan FE legal ARCA — probablemente no emite comprobantes fiscales [SUPUESTO]; stock/caja operativos pero no ERP contable; pocos reviews externos.

*Fuentes:* tuturno.io/suscripciones/planes · tuturno.io

## AgendaPro

**Segmento:** líder LatAm servicios: belleza, estética, spa/wellness, salud. Multi-sucursal. MX, CO, AR, CL (+20.000 negocios).

**Capacidades:** reservas online, recordatorios (WhatsApp/email/SMS), ficha de cliente, pagos online (Mercado Pago AR), marketing, POS/venta de productos, inventario, gestión de personal/comisiones, reportes, marketplace de servicios.

**Precio:** Basic/Gold/Platinum (sin gratuito). Internacional ~USD 26–58/mes. AR desde ~$7.900/mes (50 mensajes); consultas online desde ~$10.900/mes.

**Fortalezas:** cobertura amplia "todo en uno"; fuerte en LatAm; Capterra 4.8; chat ágil; Mercado Pago nativo AR.

**Debilidades/quejas (Capterra/Software Advice):** pago del propio servicio engorroso (no guarda tarjeta, demoras); recordatorios WhatsApp se cobran aparte y por servicio (no por cliente); ficha clínica muy básica; falta reseñas/feedback de clientes; bugs tras updates; UI "plana".

**Integraciones:** Mercado Pago (AR), Google Analytics, Meta Pixel. Google Calendar no confirmado [SUPUESTO]. FE fiscal ARCA para el negocio no confirmada [SUPUESTO].

**Qué NO cubre:** historia clínica robusta; WhatsApp no incluido (extra); FE fiscal no confirmada; sin contabilidad ERP; sin gratuito.

*Fuentes:* capterra.com/p/218709/AgendaPro · agendapro.com/ar/planes · agendapro.com/ar/peluqueria/software-para-peluquerias

## Booksy

**Segmento:** beauty/grooming, profesionales independientes (barberos, peluqueros, manicura, lashes). Fuerte EE.UU./Europa vía marketplace (+35M consumidores).

**Capacidades:** reservas, recordatorios, ficha de cliente, gestión de personal/agendas, pagos, POS, marketing (SMS/email), reportes, marketplace.

**Precio:** plano USD 29,99/mes todo incluido; USD 20/mes por staff adicional. Prueba 14 días. Procesamiento aparte.

**Fortalezas:** marketplace enorme de captación; muy fuerte en barbería/peluquería EE.UU.; fácil; buen valor para profesional solo; app orientada a privacidad.

**Debilidades/quejas:** costo escala rápido en multi-staff/multi-local; marketplace centrado EE.UU./Europa, no AR.

**Integraciones:** pagos/POS propios; app en español (App Store AR). Sin evidencia de Mercado Pago ni FE ARCA.

**Qué NO cubre para AR:** marketplace/densidad en EE.UU./Europa, poco valor de captación AR [SUPUESTO]; no integra Mercado Pago ni factura AR [SUPUESTO]; sin contabilidad/FE argentina; menos orientado a stock/ERP; pensado para pagos con tarjeta estilo US.

*Fuentes:* biz.booksy.com/en-us/pricing · capterra.com/p/142741/Booksy · support.booksy.com (idioma/país)

## Fresha

**Segmento:** salones de belleza, spa, estética, barbería, wellness; de profesional individual a múltiples sedes.

**Capacidades:** reservas, agenda multi-usuario, ficha de cliente, POS integrado, pagos, inventario, marketing (campañas, referidos, descuentos), comisiones/timesheets, reportes, marketplace.

**Precio:** históricamente gratis hasta 2025; cambió a planes Independent/Team desde ~USD 9,95–19,95/mes por miembro (según región). Fees: ~20% sobre citas de clientes nuevos del marketplace; ~2,19% + USD 0,20 en reservas de nuevos; procesamiento ~1,29%–2,19%.

**Fortalezas:** muy económico en base; funcionalidad completa (POS, inventario, pagos, marketing); interfaz limpia; marketplace de captación.

**Debilidades/quejas (Trustpilot/Software Advice):** gestión de pagos complicada (demoras de verificación, datos bancarios, transferencias poco confiables); comisiones del marketplace disputadas (20% por clientes que no vinieron por la plataforma); bugs de sincronización y dobles reservas; soporte deficiente (sin teléfono, respuestas lentas); molestia por cambios de pricing desde el "gratis".

**Integraciones:** pagos y POS propios (Fresha Payments); marketplace propio. Sin evidencia de Mercado Pago ni FE ARCA.

**Qué NO cubre para AR:** no localizado para Argentina; pagos con tarjetas internacionales, sin Mercado Pago ni FE ARCA [SUPUESTO]; fees del marketplace encarecen/generan conflictos; soporte flojo; no ERP contable argentino.

*Fuentes:* fresha.com/pricing · trustpilot.com/review/fresha.com · softwareadvice.com/retail/shedul-profile/reviews

## Calendly

**Segmento:** profesionales y equipos B2B (ventas, reclutamiento, CS, consultoría, freelancers). Scheduling genérico de reuniones — no vertical belleza/salud presencial.

**Capacidades:** agenda de citas/reuniones, tipos de evento, disponibilidad en tiempo real, recordatorios, round-robin (equipos), cobro por reunión, sync de calendarios y video. Sin POS, ficha de servicios, stock, marketing de retención.

**Precio:** Free (1 tipo de evento). Standard USD 10/usuario/mes (anual) o 12 (mensual). Teams USD 16 (anual) o 20 (mensual). Enterprise desde ~USD 15.000/año.

**Fortalezas:** estándar de facto para agendar reuniones; confiable y fácil; el link "ya lo conocen"; excelentes integraciones de calendario/video; cobros vía Stripe/PayPal sin fee de Calendly; rating ~4.7.

**Debilidades/quejas:** caro para equipos; funciones fragmentadas por tier; enfocado a reuniones, no a operar negocio presencial.

**Integraciones:** Google Calendar, Outlook (hasta 6 calendarios en pagos), Zoom; pagos con Stripe y PayPal (multi-moneda). No integra Mercado Pago.

**Qué NO cubre:** no plataforma de gestión de servicios (sin POS, ficha belleza/salud, stock, fidelización, WhatsApp nativo); no integra Mercado Pago ni factura AR (solo Stripe/PayPal); sin marketplace de captación.

*Fuentes:* calendly.com/pricing · calendly.com/payments · calendly.com/integration/stripe

**Conclusión transversal Bloque 3:** ninguno confirma FE legal ARCA ni contabilidad/ERP. Solo AgendaPro y tuturno localizados AR con Mercado Pago y stock/caja operativos (no fiscal). Booksy/Fresha son US/EU. Calendly es scheduling B2B. Hueco: turnos + Mercado Pago + FE ARCA + stock/contabilidad en un solo producto.

---

# BLOQUE 4 — Facturación/contabilidad: Colppy, Xubio, Alegra, Nubox, Defontana

*(TC ~$1.200 ARS/USD; UF CLP ~$39.000. Precios AR habitualmente +IVA 21%.)*

## Colppy (🇦🇷)
- **Segmento/origen:** argentino. PyMEs, comercios, especialmente contadores/estudios. Cloud contable-administrativo.
- **Capacidades:** FE ARCA/AFIP (incl. Factura T turismo), CxC/CxP, tesorería multimoneda, stock en tiempo real, conciliación bancaria, libro de sueldos digital, retenciones/percepciones, reportes contables/impositivos (IVA digital, ajuste por inflación en planes altos).
- **Precio (contadores, +IVA):** Contador Inicio ~$33.534, Independiente ~$72.157, Consultoras/Estudios ~$117.737/mes. Planes PyME sin cifra pública abierta [SUPUESTO].
- **Fortalezas:** interfaz moderna; circuito contador-empresa; multimoneda; ajuste por inflación; app móvil con indicadores.
- **Debilidades:** escasez de reseñas verificables; soporte por mail 24–48 h; usuarios piden mejoras (TXT ret./perc., asignación de vendedores).
- **Integraciones:** ARCA/AFIP, Mercado Pago. Menos e-commerce que Xubio.
- **Qué NO cubre:** no ERP profundo (sin producción/MRP, multi-sucursal robusta ni POS presencial).
- *Fuentes:* colppy.com · colppy.com/planes-y-precios-pymes · comparasoftware.com.ar/colppy · integraciones.colppy.com/facturacion-con-mercado-pago

## Xubio (🇦🇷, grupo Visma)
- **Segmento/origen:** argentino (Visma desde 2023). +50.000 empresas, +6.000 estudios AR/CO/MX. Emprendedores, PyMEs, contadores.
- **Capacidades:** FE A/B/C/E (exportación de servicios, crédito MiPyme), compras/OC/despachos, stock (depósitos, ajustes), bancos (conciliación vía Excel o Interbanking, cheques), impuestos completos (IVA, SICORE, SIRE, RG 3685, ret./perc., SIFERE, ARBA), contabilidad con ajuste por inflación, sueldos (30–150 legajos, LSD), reportes de gestión (cubos/gráficos), gestor de tareas.
- **Precio (Empresa, +IVA, débito bancario):** Gratis (10 comprob/mes, 1 usuario); Básico $94.900; Estándar $155.600; Avanzado $209.300; Pro $295.000/mes. Otros medios de pago +~30%. Ajuste trimestral (ene/abr/jul/oct). Sin permanencia; prueba 14 días.
- **Fortalezas:** plan gratuito real; bajo costo de entrada; respaldo Visma; contabilidad + impuestos + ajuste por inflación muy completos; API pública; app móvil.
- **Debilidades:** "se queda corto al crecer la empresa"; falta ayuda en línea y mejora continua; conciliación bancaria no 100% automática.
- **Integraciones:** MercadoLibre, Mercado Pago, MercadoShops, TiendaNube, WooCommerce, API, ARCA/AFIP.
- **Qué NO cubre:** no ERP de producción/manufactura ni multi-sucursal avanzada; sin POS presencial dedicado; profundidad operativa limitada vs Tango/Defontana.
- *Fuentes:* xubio.com/ar/precios-empresas · xubio.com · capterra.com/p/209497/Xubio · comparasoftware.com/xubio

## Alegra (🇨🇴, presencia AR)
- **Segmento/origen:** colombiano; 13+ países. Emprendedores, autónomos, PyMEs. En AR Proveedor Tecnológico Autorizado ante ARCA/AFIP.
- **Capacidades:** FE (con CAEA para seguir facturando si cae AFIP), contabilidad, inventario ("bodegas"), ventas/compras, POS (producto aparte), reportes. Enterprise +1.000 fact/mes.
- **Precio (Gestión AR, sin IVA):** Emprendedor $27.999 (2 usuarios, 100 fact/mes); PyME $40.999 (250 fact); Pro $68.999 (3 usuarios, 500 fact); Plus $109.999 (5 usuarios, 1.000 fact)/mes. Prueba 15 días; -10% anual; sin permanencia. POS aparte.
- **Fortalezas:** precios de entrada bajos y transparentes; UX moderna y simple; soporte 24/7; multipaís; POS en suite; 4.7/5 ComparaSoftware.
- **Debilidades:** app móvil con errores (cambia sola tipo de facturación/fechas); críticas a demoras del soporte; contabilidad menos "argentina-profunda" en regímenes provinciales [SUPUESTO].
- **Integraciones:** ARCA/AFIP, API; ecosistema e-commerce/pagos según país [SUPUESTO detalle AR].
- **Qué NO cubre:** no ERP profundo (sin producción/MRP); multi-sucursal y cadena de suministro limitadas.
- *Fuentes:* alegra.com/argentina/gestion/precios · alegra.com/argentina/enterprise · alegra.com/community/t/problemas-en-facturacion/1898 · trustpilot.com/review/alegra.com

## Nubox (🇨🇱)
- **Segmento/origen:** chileno. PyMEs, microempresas, emprendedores y contadores CL. Cloud contable + FE SII + remuneraciones. +14.000 clientes activos.
- **Capacidades:** FE y boletas certificadas SII, libro compras/ventas, declaración IVA F29 conciliada con SII, contabilidad completa, remuneraciones (liquidaciones, finiquitos, AFP/Isapre-Fonasa/AFC), conciliación bancaria, reportes, cobranza.
- **Precio (CLP/mes):** Pyme Básico $15.000; Pyme Completo $29.900 (contabilidad + remuneraciones, hasta 3 usuarios); Contador desde $49.900 (multi-empresa). Prueba gratis.
- **Fortalezas:** integración nativa SII; remuneraciones muy completas (ley chilena); implementación <1 semana; 100% cloud; fuerte en contadores multiempresa.
- **Debilidades:** SOLO Chile (no sirve AR). Enfoque muy contable/técnico, "poco amigable para el que decide"; soporte lento; fallas de sincronización con SII (reclamos.cl).
- **Integraciones:** SII, Previred, bancos, Mercado Público, GeoVictoria.
- **Qué NO cubre:** no ERP completo (sin inventario robusto, manufactura/MRP ni proyectos). Irrelevante AR salvo como referencia de diseño.
- *Fuentes:* nubox.com · guiadesoftware.com/software/nubox · comparasoftware.cl/nuboxcontabilidad · reclamos.cl/nubox

## Defontana (🇨🇱, ERP cloud)
- **Segmento/origen:** chileno. ERP cloud PyMEs y medianas/grandes. +8.000 empresas CL/MX/PE/CO. Cumplimiento fiscal nativo por país.
- **Capacidades:** suite ERP integral — contabilidad/finanzas, inventario en tiempo real, compras, ventas/pedidos, FE, CRM integrado, RRHH/remuneraciones, POS, análisis. Planes Génesis (PyME) y Sapiens (grandes).
- **Precio:** Emprendedor gratis permanente (1 usuario, hasta 20 DTE/mes o $5M facturación). Excedente por UF; usuario/empresa adicional 1 UF. Planes Gold/Platinum/Black. Transferencia/Webpay, hasta 12 cuotas.
- **Fortalezas:** ERP verdaderamente integral 100% cloud (más profundo que Nubox/Xubio/Alegra); multipaís con cumplimiento local; modular; AWS; CRM y RRHH nativos; plan gratuito de entrada.
- **Debilidades:** costo alto vs calidad de soporte; caídas del servicio, lentitud, pérdida de tiempo; capacitación deficiente; imposibilidad de facturar en incidentes; curva de aprendizaje.
- **Integraciones:** FE por país (SII/SAT/SUNAT/DIAN), POS, CRM/RRHH internos. [SUPUESTO e-commerce/bancos vía módulos/partners]
- **Qué NO cubre:** punto débil no es alcance sino soporte/estabilidad y complejidad/precio; producción/MRP avanzada puede quedar atrás de ERPs industriales [SUPUESTO]. Presencia AR limitada. Referente más cercano al "sub-SAP-B1 integral".
- *Fuentes:* defontana.com/cl · defontana.com/cl/productos/erp · defontana.com/cl/valorpyme · capterra.com/p/196372/Defontana-ERP · guiadesoftware.com/software/defontana

**Síntesis Bloque 4:** más argentino-profundo en impuestos: Xubio y Colppy. Más simple/barato multipaís: Alegra (POS incluido). Contabilidad+remuneraciones CL: Nubox (no exporta AR). Único ERP integral: Defontana (a costa de precio, complejidad, soporte). Ninguno fuerte en producción/MRP industrial; POS presencial robusto solo Alegra y Defontana.

---

# BLOQUE 5 — Pagos: Increase, Geopagos, Mercado Pago

## Increase (increase.app)
- **Qué es:** fintech AR (~2015). Plataforma SaaS/API de gestión, conciliación y cobranzas sobre pagos con tarjeta que el comercio ya recibe. No adquirente ni billetera. Segmento: PyMEs medianas/grandes con alto volumen de tarjeta. +1.500 empresas LatAm.
- **Capacidades:** Card (conciliación automática de ventas con tarjeta, detección de diferencias POS vs liquidado, contracargos, proyección de cobros en calendario, reportes Excel, multi-sucursal/multi-usuario); Pay (cobranzas únicas/recurrentes con reintentos y notificaciones); Count (calculadora de costos finales: comisiones, aranceles, retenciones). NO hace adquirencia, QR, Point, cuenta/CVU ni liquidación de fondos.
- **Precio:** no publica; SaaS por suscripción/volumen; "crear cuenta gratis" de entrada [SUPUESTO].
- **Fortalezas:** conciliación masiva muy rápida (~50.000 registros/minuto; ~80% ahorro de tiempo); recupero por contracargos; visibilidad unificada multi-tarjeta/multi-adquirente; APIs.
- **Debilidades:** sin cuerpo público de quejas; depende de datos de adquirentes; controla, no cobra [SUPUESTO].
- **UX:** dashboard con calendario de cobros; sección de contracargos accionable; reportes a Excel; ayuda en Notion.
- **Integraciones:** portal de desarrolladores y API pública (developers.increase.app); se conecta a adquirentes/tarjetas. ERP/ARCA no confirmadas [SUPUESTO].
- **Qué NO cubre:** no ERP; no factura; no maneja stock; no procesa pagos ni liquida fondos.
- *Fuentes:* increase.app · increase.app/productos/card · increase.app/ar/que-es-increaseconciliacion · developers.increase.app · bbva.com/es/innovacion/increase... · tynmagazine.com/increaseconciliacion...

## Geopagos (geopagos.com)
- **Qué es:** fintech AR de infraestructura de pagos B2B ("Adquirencia como Servicio", white-label). Vende tecnología para que bancos/adquirentes/PSPs/fintechs/retailers lancen aceptación de pagos — NO comercios individuales. ~16 países. Clientes: Getnet (Santander), BBVA, Itaú, Fiserv, BAC Credomatic, Niubiz (PE), Banco Estado (CL). Levantó US$35M (2022).
- **Capacidades:** plataforma end-to-end de adquirencia white-label: todos los medios (crédito/débito, contactless, QR), captura en POS (mPOS/softPOS/apps), gestión de transacciones, liquidación y conciliación, visualización unificada. Producto "Geo Store" (e-commerce white-label).
- **Precio:** B2B/enterprise (licenciamiento + fees), no publicado. No aplica comisión al comercio [SUPUESTO].
- **Fortalezas:** infraestructura probada multi-país; llave en mano; white-label; escalable; clientes de primer nivel; apuesta a IA.
- **Debilidades:** sin relación con comercio final ni marca propia; depende de ejecución del cliente adquirente [SUPUESTO].
- **Integraciones:** vía APIs; se integra al stack del banco/adquirente. ARCA/ERP dependen de la implementación de cada cliente [SUPUESTO].
- **Qué NO cubre:** no servicio para comercio individual; no ERP ni gestión; no factura ni maneja stock. Es el motor de adquirencia detrás de otras marcas.
- *Fuentes:* geopagos.com · geopagos.com/partners · en.geopagos.com/tienda-geo · lanacion.com.ar/economia/IA/geopagos... · techcrunch.com/2022/08/04/geopagos-ventur · camarafintech.org/la-adquirencia-como-servicio...

## Mercado Pago (mercadopago.com.ar)
- **Qué es:** brazo fintech de MercadoLibre; ecosistema completo de pagos y finanzas, del consumidor al comercio. Emprendedores/cuentapropistas, PyMEs, grandes comercios. Dominante en pagos digitales AR.
- **Capacidades:** QR interoperable (Transferencias 3.0 BCRA) y QR propio; lectores Point (Bluetooth/Plus/Smart, con contactless/chip/banda/QR/impresora); link de pago, checkout online, botón de pago, cobros recurrentes; cuenta digital con CVU, cuenta remunerada (rendimientos ~13% anual [SUPUESTO]), tarjeta prepaga/débito; préstamos a comercios (hasta $10M; adelanto de liquidaciones) y crédito al consumidor; liquidaciones/acreditaciones configurables; reportería básica de ventas.
- **Precio/comisiones (AR 2026, aprox., +IVA cuando aplica):** QR saldo ~0,6%; débito ~0,6–1,2%; crédito ~2,99–4,49% según cuotas. Point presencial: débito ~3,25% + IVA con acreditación en el momento; crédito varía por plazo. Online: inmediata ~4,99% + IVA vs diferida a 14 días ~3,99% + IVA (tramos 7/14/30 días). Point sin alquiler ni mantenimiento; costo del lector variable (Smart histórico ~$3.999 en lanzamiento; listados 2026 ~$60.000 [SUPUESTO, cambia seguido]).
- **Fortalezas:** escala y aceptación masiva (efecto red); ecosistema todo-en-uno (cobros + cuenta + crédito + rendimientos); QR interoperable; sin costos fijos en Point; acreditación inmediata; integración con MercadoLibre; APIs maduras.
- **Debilidades:** bloqueo de cuentas y dinero retenido (contracargos, reclamos, verificaciones/revisión fiscal — ~7 días hábiles o más); soporte lento/impersonal; comisiones altas en acreditación inmediata; dependencia total de la plataforma.
- **UX:** app muy pulida (cobrar, gestionar, rendimientos, tarjeta, préstamos); QR fácil; Point plug-and-play.
- **Integraciones:** sincroniza datos fiscales con ARCA/AFIP (condición/domicilio, CVU reportado); APIs/SDKs para e-commerce (checkout, plugins); terceros de facturación que se conectan a MP. ERPs vía terceros/partners [SUPUESTO].
- **Qué NO cubre:** es pagos + servicios financieros, NO ERP/gestión completo. NO emite FE ARCA por sí mismo (reporta datos fiscales; requiere software de facturación externo integrado). NO maneja stock/catálogo/inventario; no es contabilidad ni administración integral.
- *Fuentes:* mercadopago.com.ar · mercadopago.com.ar/herramientas-para-vender/cobrar-con-qr · .../lectores-point · mercadopago.com.ar/ayuda/cuanto-cuesta-recibir-pagos-con-point_2779 · mercadopago.com.ar/cuenta · mercadopago.com.ar/ayuda/25869 · ambito.com/.../mercado-pago-ofrece-prestamos-10-millones · iproup.com/.../cuenta-de-mercado-pago-inhabilitada

**Síntesis Bloque 5:** ninguno es ERP/gestión con FE + stock. Increase controla tarjetas (no cobra), Geopagos es infraestructura white-label (no vende al comercio), Mercado Pago cobra y da finanzas pero no factura ni gestiona inventario. Son rieles sobre los que GSG debe integrarse: Mercado Pago como cobro nativo, Increase como referencia/socio de conciliación para el producto Empresa.

---

*Fin del apéndice de datos crudos. Respaldo del relevamiento jul-2026. El análisis, matriz de gaps, oportunidades y apuestas de innovación están en el documento principal `GSG_Inteligencia_Competitiva_ERP_Argentina.md`.*
