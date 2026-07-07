// 📊 Datos del Lab Influencers — acumulativo por ronda.
// Cada corrida del motor (ver README.md) APPENDEA sus propuestas acá; nunca pisa rondas previas.
// Regla de costos (dueño): lo que puede hacer la IA cuesta $0 y NO se contempla;
// costoHumanoUSD/horasHumanas cubren solo trabajo humano + infra paga.
window.LAB_DATA = {
  "celula": "Lab Influencers & Creadores — GSG",
  "segmentoObjetivo": "influencers · community managers · creativos (Argentina / LATAM hispano)",
  "rondas": [
    {
      "n": 1,
      "fecha": "2026-07-07",
      "agentes": 5,
      "ideasGeneradas": 35,
      "propuestasCompletas": 35,
      "nota": "Primera ronda: 5 lentes generan, mejora v2 (lente cruzada) + mejora v3 (validación AR + score). Sonnet."
    },
    {
      "n": 2,
      "fecha": "2026-07-07",
      "agentes": 5,
      "ideasGeneradas": 30,
      "propuestasCompletas": 29,
      "nota": "Segunda ronda con anti-duplicados (35 títulos de R1 excluidos). 29 nuevas, 1 descartadas por solaparse. Sonnet."
    }
  ],
  "oportunidades": [
    {
      "id": "r1-48719d6f",
      "ronda": 1,
      "autor": "Creativo",
      "autorKey": "creativo",
      "v1": {
        "titulo": "Facturación automática de canjes y sponsoreos (ARCA sin drama)"
      },
      "mejoraV2": "Se precisó el flujo operativo (webhook automático para MP, carga manual de 30s para canje/transferencia) en vez de dejarlo genérico; se acotó el desarrollo nuevo a solo 2 piezas concretas (clasificador + UI) marcando explícitamente que el core fiscal no se toca; se sacó el humo del \"panel simple\" reemplazándolo por los 3 estados concretos; se mantuvo pero se ató mejor la distribución vía contadores-socio como canal, no como feature del producto.",
      "mejoraV3": "Se validó que el dolor es real y pagable (monotributista de contenido en blanco parcial que ya paga contador) pero se bajó el score de impacto respecto de v2: el universo de creadores que factura formalmente en Argentina es más chico de lo que sonaba, así que el techo de negocio es nicho, no masivo. Se recortó el MVP a webhook MP + carga manual + panel de 3 estados, dejando afuera cualquier reporte o integración contable adicional para la primera versión vendible. Se ajustaron horas/costo a un desarrollo realmente chico (clasificador + vista) dado que el core fiscal ya existe y no se toca.",
      "final": {
        "titulo": "Facturación automática de canjes y sponsoreos (Plugin ARCA para creadores)",
        "segmento": "influencers",
        "dolor": "El monotributista de contenido (influencer/CM/creativo) cobra sponsoreos por MP, transferencia o canje y no factura por desconocimiento fiscal o lo anota mal en un Excel; cada trimestre se le complica la recategorización con ARCA/AFIP y paga a un contador para ordenar algo que podría venir ordenado desde el momento del cobro.",
        "categoriaDolor": "cobros_facturacion",
        "descripcion": "Producto vertical sobre el Plugin ARCA existente: cada cobro por Mercado Pago dispara automáticamente la Factura C (idempotente por payment_id); los cobros fuera de MP (transferencia, canje) se cargan a mano en menos de un minuto eligiendo tipo y monto. El influencer/creativo ve solo 3 estados —cobrado / facturado / pendiente— sin jerga contable. Se distribuye vía contadores que ya atienden monotributistas de este rubro, como valor agregado a su cartera, no como producto que el creador busca comprar solo.",
        "solucion": "Se reutiliza el Plugin ARCA tal cual (webhook MP + idempotencia por payment_id + emisión de Factura C) y se agregan solo dos piezas: (1) un clasificador de tipo de ingreso (sponsoreo / canje valorizado / venta propia) con carga manual de 30 segundos para lo que no pasa por MP, y (2) una vista simplificada de 3 estados (cobrado/facturado/pendiente) sin lenguaje contable. Se vende vía revenue-share con contadores que ya atienden monotributistas de este rubro, como feature de su cartera.",
        "encajeGSG": "Reutiliza 100% el Plugin ARCA standalone (ADR-022/025), la integración de Mercado Pago y el modelo de contador-socio ya pensado para Agencia Digital; lo único nuevo es un clasificador de 3 tipos de ingreso y una capa de UI que oculta el vocabulario contable — es un preset/blueprint vertical del mismo producto P1, no un desarrollo nuevo de cero.",
        "mejorasAplicadas": "Se validó que el dolor es real y pagable (monotributista de contenido en blanco parcial que ya paga contador) pero se bajó el score de impacto respecto de v2: el universo de creadores que factura formalmente en Argentina es más chico de lo que sonaba, así que el techo de negocio es nicho, no masivo. Se recortó el MVP a webhook MP + carga manual + panel de 3 estados, dejando afuera cualquier reporte o integración contable adicional para la primera versión vendible. Se ajustaron horas/costo a un desarrollo realmente chico (clasificador + vista) dado que el core fiscal ya existe y no se toca.",
        "impacto": 6,
        "confianza": 7,
        "esfuerzo": 4,
        "horasHumanas": 45,
        "costoHumanoUSD": 900,
        "pctAutomatizableIA": 80,
        "tiempoMVPdias": 10
      }
    },
    {
      "id": "r1-eb77424c",
      "ronda": 1,
      "autor": "Creativo",
      "autorKey": "creativo",
      "v1": {
        "titulo": "El 'contrato en 2 minutos' para canjes y sponsoreos por WhatsApp"
      },
      "mejoraV2": "Concreté el mecanismo de \"firma\" (respuesta \"Confirmo\" logueada con timestamp/hash, no firma digital notarial) para no vender de más y evitar expectativa legal falsa; especifiqué el parser de campos (5 campos fijos) y el flujo de confirmación en 2 taps del influencer antes de enviar a la marca; até explícitamente el disparo del recordatorio de cobro a la confirmación de la marca; agregué el link de cobro Mercado Pago opcional como extensión de encaje; aclaré que la página de acuerdo corre sobre la infraestructura de storefront ya existente en vez de requerir un sistema nuevo de documentos.",
      "mejoraV3": "Recorté el MVP a un solo template fijo (sin variantes por rubro) y moví el link de cobro Mercado Pago a fase post-MVP para bajar esfuerzo/tiempo de entrega; ajusté los scores a la baja porque el dolor es real pero la disposición a pagar por esta feature aislada (fuera de un ERP más completo) es incierta en este segmento de bajo ticket.",
      "final": {
        "titulo": "Acuerdo Flash: contrato WhatsApp-to-confirmación para canjes y sponsoreos, con cobro y recordatorio automático",
        "segmento": "influencers",
        "dolor": "Marcas chicas/medianas cierran sponsoreos por WhatsApp sin nada escrito: el influencer no tiene claro entregable, fecha ni forma de cobro, y si la marca no paga o cambia de último momento no hay ningún respaldo — nadie de este segmento usa un contrato PDF porque \"es mucho quilombo\" para $50.000.",
        "categoriaDolor": "gestion_clientes_marcas",
        "descripcion": "Un asistente sobre WhatsApp Business del influencer arma, a partir de un chat pegado o dictado, un acuerdo corto de 5 campos (entregable, fecha de entrega, monto, fecha de cobro, medio de cobro). El influencer confirma/edita en 2 taps, se genera una página pública versionada con timestamp/hash (sin firma notarial) y se manda a la marca para que responda \"Confirmo\" — esa respuesta queda logueada como aceptación mínima, suficiente para reclamar por WhatsApp o Defensa del Consumidor, dejando explícito que no es un contrato con validez notarial.",
        "solucion": "MVP acotado a lo mínimo vendible: (1) una plantilla fija de acuerdo (sin variantes por rubro en el MVP, eso queda para v2), (2) parser IA que extrae los 5 campos de texto pegado, (3) una página pública liviana con el resumen + estado pendiente/confirmado sobre la misma infra de storefront, (4) el \"Confirmo\" dispara el recordatorio de cobro ya existente en el core. El link de cobro Mercado Pago queda como opcional post-MVP, no bloquea el lanzamiento inicial — reduce el esfuerzo de la primera versión sin perder el gancho principal (el respaldo con timestamp).",
        "encajeGSG": "Reutiliza motor conversacional WhatsApp, storefronts públicos por tenant y módulo de recordatorios ya existentes en el core del ERP. Costo incremental real: una plantilla + un parser IA (costo $0) + una vista pública liviana reusando componentes de storefront. Cero infraestructura nueva, cero servicio externo de firma digital.",
        "mejorasAplicadas": "Recorté el MVP a un solo template fijo (sin variantes por rubro) y moví el link de cobro Mercado Pago a fase post-MVP para bajar esfuerzo/tiempo de entrega; ajusté los scores a la baja porque el dolor es real pero la disposición a pagar por esta feature aislada (fuera de un ERP más completo) es incierta en este segmento de bajo ticket.",
        "impacto": 5,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 12,
        "costoHumanoUSD": 250,
        "pctAutomatizableIA": 85,
        "tiempoMVPdias": 5
      }
    },
    {
      "id": "r1-314dbff8",
      "ronda": 1,
      "autor": "Creativo",
      "autorKey": "creativo",
      "v1": {
        "titulo": "El 'estado de cuenta de marcas' — quién me debe qué"
      },
      "mejoraV2": "Concreté el recordatorio: pasa de \"aviso de texto\" a mensaje accionable con link de pago MP y comprobante ARCA adjunto, que es lo que realmente acorta el ciclo de cobro y es la parte que un CM/influencer paga sin dudar. Agregué la vista semáforo (UI, no dato nuevo) para priorizar visualmente qué marca apretar primero — encaja con mi lente de diseño (qué compra el ojo). Until now el encaje mencionaba WhatsApp y MP por separado; los until conecté explícitamente en la misma pieza de solución para eliminar la ambigüedad de \"recordatorio automático\" genérico.",
      "mejoraV3": "Recorté el MVP a lo mínimo vendible (alta marca + carga trabajo + recordatorio accionable + semáforo), sacando comisiones y reportes avanzados de esta vuelta para bajar esfuerzo real. Puntué con más cautela la confianza: el dolor es real pero falta validar en cliente piloto que la marca efectivamente paga por el link en WhatsApp sin fricción (KYC/monto mínimo de MP). Ajusté horas humanas e infra a lo que realmente no cubre la IA: configuración de blueprint, prueba con marca real, revisión de la plantilla de mensaje y QA del semáforo — no la codificación en sí.",
      "final": {
        "categoriaDolor": "cobros_facturacion",
        "segmento": "influencers",
        "titulo": "Cuenta corriente de marcas — quién me debe qué, con cobro accionable por WhatsApp",
        "dolor": "El influencer/CM que labura con 5-10 marcas a la vez pierde el hilo de quién pagó, cuánto debe y a quién recordarle — todo desperdigado entre WhatsApp, mail y transferencias sueltas — y cuando por fin reclama, lo hace a mano, sin link de pago ni comprobante, lo que alarga el cobro y lo deja parado como amateur frente a la marca.",
        "descripcion": "Panel tipo \"cuenta corriente\" (mismo patrón que clientes del ERP, aplicado a marcas/sponsors) que muestra de un vistazo: marca, trabajo pactado, monto, estado de cobro (pendiente/parcial/cobrado) y vencimiento. Vista semáforo (verde/amarillo/rojo por antigüedad de deuda) para priorizar en 5 segundos con qué marca hay que ser más firme. El recordatorio automático por WhatsApp no es un texto suelto: trae el link de cobro de Mercado Pago ya generado y, si aplica, el comprobante ARCA adjunto, para que la marca pague en el mismo mensaje sin ida y vuelta.",
        "solucion": "Blueprint \"creador de contenido\" sobre el ERP core: cliente=marca/sponsor, venta=trabajo pactado (canje/posteo/reel/evento), reusando el estado de cobro parcial/total ya existente. El recordatorio se dispara desde el motor de recordatorios actual con una plantilla de mensaje que arma el link MP + adjunta comprobante ARCA cuando corresponde. La vista semáforo es una regla de color por días de atraso sobre la cuenta corriente existente, cero modelo de datos nuevo. MVP acotado a: alta de marca, carga de trabajo/monto, disparo manual+automático del recordatorio accionable, y el semáforo — sin tocar comisiones ni reportes avanzados en esta primera vuelta.",
        "encajeGSG": "Reusa íntegramente clientes, cobros (parcial/total), recordatorios, Mercado Pago y facturación ARCA — todos módulos ya construidos en el ERP core; solo agrega un blueprint de rubro + una plantilla de mensaje + una capa de color en la UI. El generador de preset por IA puede precargar las marcas del influencer desde su Instagram al dar de alta el tenant, mismo mecanismo que Break Point/Magra.",
        "mejorasAplicadas": "Recorté el MVP a lo mínimo vendible (alta marca + carga trabajo + recordatorio accionable + semáforo), sacando comisiones y reportes avanzados de esta vuelta para bajar esfuerzo real. Puntué con más cautela la confianza: el dolor es real pero falta validar en cliente piloto que la marca efectivamente paga por el link en WhatsApp sin fricción (KYC/monto mínimo de MP). Ajusté horas humanas e infra a lo que realmente no cubre la IA: configuración de blueprint, prueba con marca real, revisión de la plantilla de mensaje y QA del semáforo — no la codificación en sí.",
        "impacto": 7,
        "confianza": 7,
        "esfuerzo": 4,
        "horasHumanas": 14,
        "costoHumanoUSD": 230,
        "pctAutomatizableIA": 90,
        "tiempoMVPdias": 6
      }
    },
    {
      "id": "r1-36cba9d1",
      "ronda": 1,
      "autor": "Creativo",
      "autorKey": "creativo",
      "v1": {
        "titulo": "Media kit vivo — el 'storefront' del influencer"
      },
      "mejoraV2": "Se ató la tarifa a la realidad argentina (pesos + nota de ajuste por inflación en vez de precios fijos que quedan viejos), se conectó \"casos de éxito\" al módulo de reseñas ya existente para que no sea carga manual, se precisó el CTA de WhatsApp con mensaje precargado (igual al de reservas), y se agregó el paso de Gate + autorización del cliente antes de publicar el preset generado por IA.",
      "mejoraV3": "Se mantiene la tarifa en pesos con nota de ajuste por inflación, casos de éxito conectados a reseñas reales, CTA de WhatsApp igual al de reservas, y Gate + autorización del cliente antes de publicar el preset. En esta pasada se bajó la confianza y el impacto para reflejar honestamente que el segmento ya usa alternativas gratis (Linktree/Beacons) y que el diferencial (datos vivos + tarifas en pesos) debe demostrarse en la demo, no darse por vendido.",
      "final": {
        "titulo": "Media kit vivo — el \"storefront\" del influencer",
        "segmento": "influencers",
        "dolor": "Cuando una marca pide el media kit, el creador manda un PDF de Canva desactualizado (métricas viejas, a veces en USD sin ajustar por inflación), lo edita a mano por cada cliente y no sabe si la marca lo llegó a abrir antes de cotizar.",
        "categoriaDolor": "entregables_visuales",
        "descripcion": "Storefront público tipo \"media kit vivo\" (branding propio, mobile-first) que muestra perfil, audiencia por red, tarifas en pesos con nota de ajuste por inflación, casos de éxito y un botón \"Cotizame\" que abre WhatsApp con mensaje precargado. Reemplaza el PDF estático por un link único que se actualiza solo con los datos que ya viven en el ERP del creador. El dolor es real pero de payabilidad moderada: existen alternativas gratis/baratas ya instaladas en el segmento (Linktree, Beacons, Stan Store), así que la propuesta de valor diferencial (datos vivos del ERP, tarifas en pesos, WhatsApp-first) tiene que quedar bien explícita para justificar el paso desde lo gratuito.",
        "solucion": "MVP acotado: 1 blueprint nuevo \"media kit\" sobre el storefront premium existente, remapeo de catálogo→paquetes de contenido, reseñas del ERP→casos de éxito (sin carga manual), botón WhatsApp con el mismo deep-link que reservas, y alta inicial vía Generador de Preset por IA desde el Instagram del creador, con Gate de Excelencia + autorización del cliente antes de publicar.",
        "encajeGSG": "Reusa 3 piezas ya construidas: motor de branding/storefront premium, módulo de reseñas del ERP (evita carga manual de casos de éxito) y Generador de Preset por IA para el alta inicial desde redes — desarrollo incremental sobre el producto P3 de Agencia Digital, no un producto nuevo.",
        "mejorasAplicadas": "Se mantiene la tarifa en pesos con nota de ajuste por inflación, casos de éxito conectados a reseñas reales, CTA de WhatsApp igual al de reservas, y Gate + autorización del cliente antes de publicar el preset. En esta pasada se bajó la confianza y el impacto para reflejar honestamente que el segmento ya usa alternativas gratis (Linktree/Beacons) y que el diferencial (datos vivos + tarifas en pesos) debe demostrarse en la demo, no darse por vendido.",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 24,
        "costoHumanoUSD": 300,
        "pctAutomatizableIA": 75,
        "tiempoMVPdias": 6
      }
    },
    {
      "id": "r1-6cd5607b",
      "ronda": 1,
      "autor": "Creativo",
      "autorKey": "creativo",
      "v1": {
        "titulo": "Calendario editorial + aprobación de marca en un solo link"
      },
      "mejoraV2": "Se agregó el mecanismo de \"aprobado por defecto\" ante silencio del cliente (elimina el cuello de botella real: el cliente que no responde y frena todo) y un log de auditoría explícito como entregable concreto para blindar al CM en reclamos. Se recategorizó a \"gestión de clientes/marcas\" (más preciso que \"organización/agenda\", que es el motor subyacente, no el dolor). Se precisó el encaje señalando qué pieza existente del ERP resuelve el link sin login (storefront/probador) en vez de dejarlo implícito.",
      "mejoraV3": "Se validó el dolor como real pero de impacto moderado (retención/eficiencia del CM, no un driver directo de venta nueva) y se ajustó el score de impacto a la baja en consecuencia. Se recortó el MVP al mínimo vendible: link firmado + estados + recordatorio + \"aprobado por defecto\" + historial de solo lectura, dejando fuera cualquier UI de configuración avanzada de políticas para una v2. Se recalibraron horas humanas y costo a lo que realmente exige revisión humana (QA de flujos de WhatsApp, validación del link firmado, prueba con un cliente piloto), no la construcción en sí que hace la IA.",
      "final": {
        "categoriaDolor": "gestion_clientes_marcas",
        "confianza": 7,
        "costoHumanoUSD": 220,
        "descripcion": "Portal por cliente (link público firmado, sin login ni app) donde el CM sube las piezas de la semana; el cliente aprueba o pide cambios con un tap desde el celu, resuelto vía WhatsApp, y cada acción queda registrada con timestamp y autor en un historial inmutable. Si el cliente no responde en X horas sale un recordatorio automático; si el silencio persiste, se aplica \"aprobado por defecto\" según la política que configuró el CM, evitando que un cliente frene el cronograma. Blinda al CM ante reclamos de \"esto no lo aprobé\" y ordena la semana de pauta de 6-8 cuentas en un solo lugar.",
        "dolor": "El CM administra varias cuentas de clientes a la vez y pierde horas por semana persiguiendo aprobaciones dispersas en WhatsApp/mail, sin registro de quién aprobó qué ni cuándo, lo que genera re-trabajos y discusiones que le cuestan horas facturables y a veces el cliente.",
        "encajeGSG": "Reusa el motor de agenda/estados y el sistema de recordatorios WhatsApp multi-tenant ya en producción (solo cambia vocabulario vía blueprint: turno→pieza, profesional/cliente→marca) y el mecanismo de storefront/probador público para el link firmado sin login, evitando construir autenticación de clientes desde cero. El RBAC existente separa la vista del CM (todas las marcas) de la del cliente (solo la suya).",
        "esfuerzo": 4,
        "horasHumanas": 18,
        "impacto": 6,
        "mejorasAplicadas": "Se validó el dolor como real pero de impacto moderado (retención/eficiencia del CM, no un driver directo de venta nueva) y se ajustó el score de impacto a la baja en consecuencia. Se recortó el MVP al mínimo vendible: link firmado + estados + recordatorio + \"aprobado por defecto\" + historial de solo lectura, dejando fuera cualquier UI de configuración avanzada de políticas para una v2. Se recalibraron horas humanas y costo a lo que realmente exige revisión humana (QA de flujos de WhatsApp, validación del link firmado, prueba con un cliente piloto), no la construcción en sí que hace la IA.",
        "pctAutomatizableIA": 85,
        "segmento": "community_managers",
        "solucion": "Nuevo blueprint sobre el motor de agenda/turnos existente: cada \"turno\" pasa a ser una \"pieza\" con estados pendiente/aprobado/rechazado/aprobado_por_defecto, y \"profesional/cliente\" se remapea a \"marca\". Se reutiliza el motor de recordatorios WhatsApp para el aviso de pendiente y el escalamiento por silencio, y el RBAC para separar la vista del CM (todas las marcas) de la del cliente (solo la suya, vía link firmado sin cuenta de usuario). El historial de aprobaciones es un log de auditoría simple (quién, qué pieza, qué acción, cuándo) en una vista de solo lectura por marca.",
        "tiempoMVPdias": 6,
        "titulo": "Portal de aprobación de contenido con trazabilidad (link único, sin login)"
      }
    },
    {
      "id": "r1-e3883d31",
      "ronda": 1,
      "autor": "Creativo",
      "autorKey": "creativo",
      "v1": {
        "titulo": "Reporte mensual de resultados armado solo (para no perder el cliente)"
      },
      "mejoraV2": "Se concretó el mecanismo técnico (cron + endpoint sobre el motor de dashboards existente, no un \"módulo nuevo\" genérico), se especificó de dónde salen las métricas (tablas ya pobladas por MP/storefront/WhatsApp del propio ERP, evitando integraciones externas de entrada), se acotó el costo humano real a la configuración inicial por cliente, y se reforzó el encaje como upsell del ERP hacia el segmento en vez de una feature aislada.",
      "mejoraV3": "Se corrigió el sobre-optimismo del v2: no todas las métricas \"se conectan\" solas (Instagram/TikTok no tienen API gratuita abierta para esto), así que el MVP admite carga manual de 2-3 campos en vez de asumir integración automática total. Se acotó el MVP a una sola plantilla sin conectores externos en la v1, y se bajó la confianza/impacto reflejando que el segmento puro de \"solo redes sin storefring\" tiene menor encaje directo con el ERP que el de CMs que administran el negocio completo del cliente.",
      "final": {
        "categoriaDolor": "reportes_metricas",
        "titulo": "Reporte mensual de resultados automático, con branding del cliente y envío por WhatsApp",
        "segmento": "community_managers",
        "dolor": "El CM freelance arriesga la renovación mensual porque arma el reporte de resultados a mano (PowerPoint la noche antes, o no lo entrega), lo que erosiona la confianza del cliente justo en el momento de decidir si sigue pagando.",
        "descripcion": "Módulo dentro del ERP que el día 1 de cada mes genera automáticamente, por cliente, un PDF/página con el branding de ESE cliente (logo, colores, tenant), las métricas que ya viven en el ERP (ventas storefront/MP, leads/mensajes WhatsApp) o que el CM carga a mano si son de redes externas (Instagram/TikTok no tienen API abierta gratuita para esto), un comparativo vs. mes anterior y 3-4 conclusiones en criollo redactadas por IA. El CM recibe el link/PDF listo el día 1 para reenviar por WhatsApp, sin trabajo manual nocturno. MVP acotado: 1 plantilla de reporte, métricas nativas del ERP + 2-3 campos manuales opcionales, sin conectores a APIs de redes en la v1.",
        "solucion": "Endpoint + cron mensual sobre el motor de dashboards ya existente: vista \"reporte de cliente\" que reutiliza el branding por tenant, lee las tablas ya pobladas (ventas MP, storefront) y campos manuales cargados por el CM para métricas de redes (alcance, seguidores, engagement) que el ERP no captura nativamente, calcula el delta vs. mes anterior y llama a un preset de IA para el resumen ejecutivo en tono humano/criollo (costo $0, ADR-046). El cron dispara el envío por WhatsApp (integración ya activa) al CM para que reenvíe con un tap. Costo humano real: construir el template + los 2-3 campos manuales + la integración de envío; después corre solo.",
        "encajeGSG": "Reutiliza tres piezas ya existentes: (1) motor de dashboards/métricas multi-tenant, (2) branding por tenant (reporte con la cara del cliente del CM), (3) integración WhatsApp-first para la entrega. Único componente nuevo real: generación de copy por IA (costo $0). Encaja como upsell natural del ERP hacia CMs que ya administran el storefront/POS de sus clientes, donde los datos server-side ya están listos; para CMs cuyo trabajo es 100% redes sociales sin storefront, el valor cae a \"planilla con branding + copy IA\", más módico pero igual vendible como diferencial vs. Canva/Looker Studio manual.",
        "mejorasAplicadas": "Se corrigió el sobre-optimismo del v2: no todas las métricas \"se conectan\" solas (Instagram/TikTok no tienen API gratuita abierta para esto), así que el MVP admite carga manual de 2-3 campos en vez de asumir integración automática total. Se acotó el MVP a una sola plantilla sin conectores externos en la v1, y se bajó la confianza/impacto reflejando que el segmento puro de \"solo redes sin storefring\" tiene menor encaje directo con el ERP que el de CMs que administran el negocio completo del cliente.",
        "impacto": 6,
        "confianza": 7,
        "esfuerzo": 4,
        "horasHumanas": 32,
        "costoHumanoUSD": 700,
        "pctAutomatizableIA": 80,
        "tiempoMVPdias": 10
      }
    },
    {
      "id": "r1-b56139f5",
      "ronda": 1,
      "autor": "Creativo",
      "autorKey": "creativo",
      "v1": {
        "titulo": "Cobro de asesorías/mentorías 1 a 1 con reserva y seña automática"
      },
      "mejoraV2": "Se afiló el dolor con la consecuencia concreta (hora perdida sin costo para quien falta) en vez de describir solo el síntoma. Se precisó la solución: no es \"reusar el módulo tal cual\" sino identificar el único delta real de desarrollo (vista pública de booking simplificada + regla de bloqueo por seña), separándolo de lo que ya está 100% hecho. Se agregó la política de cancelación/no-devolución como mecanismo de filtro de compromiso, y se aclaró que el storefront de este blueprint es una página de disponibilidad, no la vidriera de catálogo genérica.",
      "mejoraV3": "Se validó que el dolor es real y pagable: es el mismo patrón que Calendly+depósito, ya probado en el mercado, con el plus local de Mercado Pago y WhatsApp. Se recortó el MVP al mínimo vendible (vista de booking + regla de bloqueo, sin tocar el resto de la plataforma) y se puntuó con honestidad: impacto y confianza buenos pero no máximos porque el subsegmento (creativos que venden asesorías 1:1, no todo CM/influencer) es más chico que el total del target.",
      "final": {
        "categoriaDolor": "organizacion_agenda",
        "titulo": "Booking 1:1 con seña automática por Mercado Pago (blueprint \"Asesoría\")",
        "segmento": "creativos",
        "dolor": "El freelancer que vende asesorías 1:1 (edición, estrategia, coaching de marca) coordina turnos a mano por WhatsApp, no cobra seña y sufre ausentismo: cada \"vengo y no aviso\" es una hora de trabajo perdida sin costo para quien faltó.",
        "descripcion": "Link de reserva público con nombre/foto del freelancer, tipo de sesión, precio y duración, donde el cliente ve horarios libres en tiempo real y paga una seña por Mercado Pago para confirmar — sin eso el turno no se bloquea. La reserva confirmada cae directo en la agenda del ERP y sale un recordatorio automático por WhatsApp 24hs antes a ambas partes. Si el cliente cancela fuera de ventana, la seña queda como política visible (no devuelta), filtrando a quien no tiene intención real de venir. Todo se ve en una sola pantalla de agenda diaria, sin cruzar chats.",
        "solucion": "Blueprint nuevo \"Asesoría/Mentoría\" sobre el módulo de agenda+turnos existente (rubro estética): tipos de sesión configurables (duración/precio), cobro de seña vía Mercado Pago ya integrado, recordatorio automático por WhatsApp con el mismo motor, y storefront público minimalista de una sola página (sin carrito/catálogo) mostrando disponibilidad y botón de reserva. Único desarrollo real: la vista pública de booking simplificada y la regla configurable \"sin seña no hay reserva/no-show\".",
        "encajeGSG": "Reusa agenda/turnos, checkout de Mercado Pago y motor de recordatorios WhatsApp del rubro estética ya construidos, vía un blueprint nuevo — cero infraestructura nueva. El delta real es la vista pública liviana de booking (recorte del storefront existente) y la regla de bloqueo por seña, ambos configuración de tenant, no features nuevas de plataforma.",
        "mejorasAplicadas": "Se validó que el dolor es real y pagable: es el mismo patrón que Calendly+depósito, ya probado en el mercado, con el plus local de Mercado Pago y WhatsApp. Se recortó el MVP al mínimo vendible (vista de booking + regla de bloqueo, sin tocar el resto de la plataforma) y se puntuó con honestidad: impacto y confianza buenos pero no máximos porque el subsegmento (creativos que venden asesorías 1:1, no todo CM/influencer) es más chico que el total del target.",
        "impacto": 7,
        "confianza": 7,
        "esfuerzo": 4,
        "horasHumanas": 18,
        "costoHumanoUSD": 200,
        "pctAutomatizableIA": 85,
        "tiempoMVPdias": 6
      }
    },
    {
      "id": "r1-cb871644",
      "ronda": 1,
      "autor": "Creativo",
      "autorKey": "creativo",
      "v1": {
        "titulo": "Tienda de presets, plantillas y recursos digitales con cobro automático"
      },
      "mejoraV2": "Se sumó la fricción específica argentina (transferencia + confirmación manual, cobro de madrugada) y el detalle de que el creativo no tiene visibilidad de qué vendió. Se concretó el mecanismo de entrega (link firmado con expiración/límite de descargas + WhatsApp opcional, no solo \"link\"). Se acotó el encaje: un solo campo nuevo en el modelo de catálogo + un disparador post-webhook, dejando explícito que ARCA queda fuera del MVP para no sumar alcance innecesario.",
      "mejoraV3": "Validado el dolor como real y pagable en Argentina (ticket bajo pero fricción alta de transferencia manual). Se ajustó el impacto a moderado (6, no alto) porque el ticket promedio es chico y ya existen alternativas genéricas (Hotmart, Payhip) — el diferencial real es MP+ARS+WhatsApp, no la categoría en sí. Esfuerzo y horas afinados a un MVP mínimo vendible (1 campo + 1 disparador), sin sumar alcance de facturación.",
      "final": {
        "categoriaDolor": "venta_captacion",
        "confianza": 7,
        "costoHumanoUSD": 650,
        "descripcion": "Mini-tienda digital (storefront + catálogo del ERP) donde el creativo carga presets/LUTs/plantillas una sola vez con foto, precio y archivo/link de entrega. El cobro corre por Mercado Pago (checkout ya integrado); al confirmarse el pago vía webhook se dispara automáticamente el envío del archivo o un link firmado con expiración/límite de descargas por email (WhatsApp opcional). El creativo ve sus ventas en el panel existente del ERP, sin estar despierto ni confirmando transferencias a mano.",
        "dolor": "El creativo vende presets/LUTs/plantillas por DM de Instagram, cobra por transferencia/alias y tiene que estar disponible para mandar el archivo a mano — pierde ventas fuera de horario y no tiene registro ordenado de qué vendió.",
        "encajeGSG": "Reuso casi total: storefront público por tenant + catálogo + checkout MP con webhook + panel de ventas ya construidos. Único desarrollo real: campo \"tipo de producto = digital\" (sin stock físico) en el modelo de catálogo y el disparador de entrega post-webhook (archivo adjunto o link firmado). Mismo patrón que dar de alta un blueprint de rubro nuevo, no una feature desde cero. ARCA queda fuera del MVP.",
        "esfuerzo": 3,
        "horasHumanas": 35,
        "impacto": 6,
        "mejorasAplicadas": "Validado el dolor como real y pagable en Argentina (ticket bajo pero fricción alta de transferencia manual). Se ajustó el impacto a moderado (6, no alto) porque el ticket promedio es chico y ya existen alternativas genéricas (Hotmart, Payhip) — el diferencial real es MP+ARS+WhatsApp, no la categoría en sí. Esfuerzo y horas afinados a un MVP mínimo vendible (1 campo + 1 disparador), sin sumar alcance de facturación.",
        "pctAutomatizableIA": 80,
        "segmento": "creativos",
        "solucion": "Producto \"digital\" en el catálogo (sin stock físico, con archivo/link de entrega adjunto). El webhook de pago confirmado de MP dispara el envío automático de un link firmado con expiración/límite de descargas por email, con WhatsApp como canal opcional. Ventas visibles en el panel existente del ERP, sin backoffice nuevo.",
        "tiempoMVPdias": 8,
        "titulo": "Tienda digital de presets y recursos con cobro por Mercado Pago y entrega automática"
      }
    },
    {
      "id": "r1-c54de215",
      "ronda": 1,
      "autor": "Creativo",
      "autorKey": "creativo",
      "v1": {
        "titulo": "El 'buscador de marcas por vencer' — pipeline de renovación de sponsoreos"
      },
      "mejoraV2": "Se concretó el \"cuándo\" (recordatorio por N días desde última transacción) y el criterio de prioridad (monto/resultado), se aclaró que no compite con el CRM de la marca sino que es la agenda de venta del influencer, se acotó el cambio de schema a un solo campo de estado para bajar el costo de implementación, y se eliminó lenguaje vago (\"montaña rusa de ingresos\") por una descripción operativa verificable.",
      "mejoraV3": "Validado el dolor como real pero de monetización indirecta (ayuda a vender más, no se cobra por sí solo aparte del plan del ERP), por lo que se ajustaron los scores a la baja respecto de v2 para no inflar impacto/confianza. Se confirmó el MVP acotado (1 campo de estado + 1 regla de recordatorio + 1 botón de WhatsApp) como el más chico vendible, sin agregar alcance nuevo.",
      "final": {
        "titulo": "Pipeline de reactivación de marcas — CRM de renovación de sponsoreos",
        "segmento": "transversal",
        "dolor": "El influencer/CM freelance pierde renovaciones de marcas que ya lo contrataron porque no hace seguimiento sistemático: la info de \"quién pagó, cuánto y cuándo\" vive dispersa en chats viejos que nadie relee, y volver a ofrecerle a una marca conocida (con precio de referencia y relación previa) es más fácil de cerrar que un cliente nuevo, pero nadie dispara ese contacto a tiempo.",
        "categoriaDolor": "venta_captacion",
        "descripcion": "Pipeline de \"marcas trabajadas\" con estado (activa/pausada/a reactivar), monto y fecha del último acuerdo, y resultado de esa campaña. El sistema dispara un recordatorio automático a los N días de inactividad (\"Marca X, último trabajo hace 90 días, ¿retomamos?\"), ordenado por prioridad de reactivación (mayor monto o mejor resultado primero), con un botón que arma el mensaje de WhatsApp listo para copiar y enviar. No reemplaza el CRM de la marca: es la agenda de venta propia del influencer sobre sus contactos-marca.",
        "solucion": "Reusar el módulo de clientes (entidad \"marca\" = cliente), el historial de transacciones/servicios (fecha y monto del último sponsoreo) y el motor de recordatorios del ERP, sumando un campo de estado de pipeline y una regla de recordatorio por antigüedad de última transacción (mismo patrón que \"cliente inactivo\"). El copy del mensaje sale del preset de tono argentino ya usado en reseñas/recordatorios (ADR-046, zona humana). Es reconfiguración de datos + una regla de negocio, no un módulo nuevo.",
        "encajeGSG": "100% sobre entidades ya existentes del ERP (clientes, transacciones, recordatorios WhatsApp-first), sin tocar schema más allá de un campo de estado. Generación de mensajes = IA a costo $0; el único gasto real es UI del pipeline y la regla de disparo, sobre infraestructura ya pagada — no suma servicio nuevo ni dependencia externa.",
        "mejorasAplicadas": "Validado el dolor como real pero de monetización indirecta (ayuda a vender más, no se cobra por sí solo aparte del plan del ERP), por lo que se ajustaron los scores a la baja respecto de v2 para no inflar impacto/confianza. Se confirmó el MVP acotado (1 campo de estado + 1 regla de recordatorio + 1 botón de WhatsApp) como el más chico vendible, sin agregar alcance nuevo.",
        "impacto": 6,
        "confianza": 7,
        "esfuerzo": 3,
        "horasHumanas": 14,
        "costoHumanoUSD": 120,
        "pctAutomatizableIA": 70,
        "tiempoMVPdias": 4
      }
    },
    {
      "id": "r1-c435c328",
      "ronda": 1,
      "autor": "Analítico",
      "autorKey": "analitico",
      "v1": {
        "titulo": "Cobrador de brandeos con factura ARCA automática"
      },
      "mejoraV2": "Concreté el dolor con el detalle real del rubro (split 50/50, comprobante que hoy solo tienen las agencias, no los freelancers sueltos) y agregué el ángulo de diseño que faltaba: la pieza nueva de UI es la plantilla de invoice con cara de media kit/marca personal (no un link de cobro genérico), porque quien lo recibe es la marca y el creador necesita verse profesional. Ajusté el encaje para dejar explícito que no hay desarrollo de dominio nuevo, solo theming reutilizado.",
      "mejoraV3": "Ajusté el scoring a un nivel más honesto: bajé confianza porque el segmento es mayormente informal y puede resistir pagar/adoptar una herramienta de compliance aunque el dolor sea real; subí ligeramente esfuerzo por el trabajo de UI de la plantilla invoice (no es solo reskin trivial, necesita verse \"media kit\" creíble) y sumé horas de configuración del job de recordatorio WhatsApp con el tono administrativo correcto. Costo humano ajustado a ~380 USD de trabajo de diseño/config, sin inflar el resto.",
      "final": {
        "categoriaDolor": "cobros_facturacion",
        "confianza": 6,
        "costoHumanoUSD": 380,
        "descripcion": "Invoice-link profesional para brandeos: la marca ve un documento con cara de media kit (logo/foto del influencer, detalle del entregable, split 50/50 anticipo-contra entrega) en vez de un link de MP pelado. Al confirmarse el pago de cada tramo se dispara automáticamente la factura ARCA monotributo y un PDF de comprobante, y si la marca no paga el saldo a la fecha pactada sale un recordatorio automático por WhatsApp con tono administrativo prolijo. Resuelve de una vez tres dolores encadenados: falta de instrumento formal para exigir el anticipo, falta de comprobante para reclamar el saldo, y descalce entre lo que entra en MP/cuenta personal y lo que se declara ante ARCA a fin de año.",
        "dolor": "El influencer cobra brandeos por transferencia o efectivo suelto, sin comprobante ni instrumento para exigir el 50% de anticipo, y sin forma de reclamar cuando la marca demora o \"se olvida\" del saldo; a fin de año no puede justificar ante ARCA la plata que entró a su MP/cuenta personal.",
        "solucion": "Se monta 100% sobre el ERP existente: la marca es un \"cliente\", el tipo de brandeo es un \"servicio\" con condiciones de entrega, y el cobro en dos tramos usa el motor de cuotas/comisiones ya existente + Mercado Pago Link de Pago + el plugin ARCA/AFIP (monotributo) en sandbox. La única pieza nueva es una plantilla de invoice con theming por tenant (logo/foto/colores del influencer) reusando el sistema de branding de las vidrieras, más el job de recordatorio automático por WhatsApp que ya existe para cobros. Blueprint \"influencer/freelance\": alta de tenant en minutos vía el generador de preset desde su Instagram.",
        "encajeGSG": "Reutiliza el core de cobros (MP Link de Pago + cuotas/comisiones), el plugin ARCA/AFIP en sandbox, el motor multi-tenant (1 tenant por creador), los recordatorios automáticos por WhatsApp ya existentes y el generador de preset por IA para el alta exprés. Cero desarrollo de dominio nuevo: es blueprint liviano + plantilla visual reusando theming de vidriera.",
        "mejorasAplicadas": "Ajusté el scoring a un nivel más honesto: bajé confianza porque el segmento es mayormente informal y puede resistir pagar/adoptar una herramienta de compliance aunque el dolor sea real; subí ligeramente esfuerzo por el trabajo de UI de la plantilla invoice (no es solo reskin trivial, necesita verse \"media kit\" creíble) y sumé horas de configuración del job de recordatorio WhatsApp con el tono administrativo correcto. Costo humano ajustado a ~380 USD de trabajo de diseño/config, sin inflar el resto.",
        "impacto": 6,
        "esfuerzo": 3,
        "horasHumanas": 20,
        "pctAutomatizableIA": 85,
        "segmento": "influencers",
        "tiempoMVPdias": 6,
        "titulo": "Link de Cobro con Factura ARCA automática para brandeos"
      }
    },
    {
      "id": "r1-683e69ab",
      "ronda": 1,
      "autor": "Analítico",
      "autorKey": "analitico",
      "v1": {
        "titulo": "CRM de marcas y pipeline de brand deals por WhatsApp"
      },
      "mejoraV2": "Se afinó el dolor sumando el contexto argentino real (inflación, repricing, cobro en pesos viejos). Se concretó la solución atando el pipeline al modelo de estados de Cobros ya existente y agregando conciliación automática vía Mercado Pago en vez de marcar \"cobrado\" manualmente, y se sumó un indicador de \"total adeudado\" y alerta de repricing por inflación, subiendo el encaje con infraestructura ya paga (MP) en vez de solo WhatsApp+CRM.",
      "mejoraV3": "Se recortó el alcance del MVP: la conciliación con Mercado Pago pasa de \"automática por webhook\" a un match simple monto+fecha para bajar esfuerzo real; se puntuó con honestidad (impacto y confianza en 6, no 8-9) porque la pagabilidad en el segmento freelancer/CM individual es incierta —el ticket que puede pagar un influencer solo por esto es bajo, encaja mejor como feature dentro de un plan ya vendido que como producto standalone.",
      "final": {
        "categoriaDolor": "gestion_clientes_marcas",
        "confianza": 6,
        "costoHumanoUSD": 650,
        "descripcion": "Mini-CRM que registra cada marca como \"cliente\" con pipeline de negociación (contactado, propuesta, acordado, entregado, cobrado), condiciones pactadas (piezas, fecha, monto y moneda) y alertas automáticas de vencimiento de entrega y de cobro por WhatsApp. El cockpit muestra \"cuánto me deben en total\" (AR$) y el estado \"cobrado\" se marca solo cuando el pago de Mercado Pago/transferencia matchea el monto pactado, en vez de a mano. El MVP deja la conciliación automática de MP como regla simple (match por monto+fecha, sin webhook complejo) para no inflar el esfuerzo inicial.",
        "dolor": "El influencer/CM negocia marcas por chat de Instagram/WhatsApp sin ningún registro: no sabe cuánto le deben, se le vencen fechas de entrega y pierde el hilo de qué cobró y qué no; con la inflación y el dólar movidos, además, no repriza sus tarifas a tiempo y cobra en pesos viejos.",
        "encajeGSG": "Reutiliza 100% módulos ya en el core del ERP: Clientes/CRM (relabeleado \"marcas\"), Recordatorios WhatsApp-first, e integración Mercado Pago para conciliar cobros — un campo custom de etapa (pipeline) sobre el modelo de estados que ya usa Cobros, sin módulo nuevo ni UI nueva de fondo.",
        "esfuerzo": 4,
        "horasHumanas": 32,
        "impacto": 6,
        "mejorasAplicadas": "Se recortó el alcance del MVP: la conciliación con Mercado Pago pasa de \"automática por webhook\" a un match simple monto+fecha para bajar esfuerzo real; se puntuó con honestidad (impacto y confianza en 6, no 8-9) porque la pagabilidad en el segmento freelancer/CM individual es incierta —el ticket que puede pagar un influencer solo por esto es bajo, encaja mejor como feature dentro de un plan ya vendido que como producto standalone.",
        "pctAutomatizableIA": 70,
        "segmento": "influencers",
        "solucion": "Blueprint de tenant \"creador de contenido\" sobre el backoffice existente: Clientes/CRM relabeleado \"Marcas\" con campo custom de etapa tipo Kanban (contactado→propuesta→acordado→entregado→cobrado), Recordatorios WhatsApp para deadlines de entrega/cobro, vista de \"total adeudado\" en el cockpit, alerta de repricing a los >60 días sin actualizar tarifa, y matching simple monto+fecha contra pagos de Mercado Pago/transferencia para auto-marcar \"cobrado\".",
        "tiempoMVPdias": 6,
        "titulo": "CRM de marcas y pipeline de brand deals por WhatsApp"
      }
    },
    {
      "id": "r1-b4505957",
      "ronda": 1,
      "autor": "Analítico",
      "autorKey": "analitico",
      "v1": {
        "titulo": "Media kit / portfolio storefront generado por IA"
      },
      "mejoraV2": "Concreté el dolor con la escena real (el manoteo del Canva viejo cuando una marca pide el media kit) en vez de una descripción genérica. Bajé la solución a tierra: quién edita la rate card y cómo evita que la IA invente precios. Recorté humo del encaje (eliminé el campo vacío \"descripcion2\" y especifiqué que no hay infraestructura nueva paga).",
      "mejoraV3": "Validé que el dolor es real y recurrente para micro/nano-influencers (no solo top-tier) y que es pagable como feature de captación, no como producto standalone caro. Ajusté el scoring a la baja con honestidad: impacto medio (nicho, ticket bajo, no es el motor de ventas del ERP) y confianza 7 (el dolor es concreto pero la disposición a pagar por sí sola —vs. usarlo gratis como demo/gancho— no está probada). Mantuve el MVP acotado: blueprint nuevo + rate card editable a mano, sin IA inventando precios ni infraestructura nueva.",
      "final": {
        "categoriaDolor": "venta_captacion",
        "confianza": 7,
        "costoHumanoUSD": 280,
        "descripcion": "Vidriera pública con URL propia (`<creador>-mediakit.vercel.app`) que funciona como media kit siempre actualizado: métricas de audiencia, rate card por tipo de brandeo (reel, story, posteo, canje), portfolio de piezas anteriores, testimonios de marcas y botón directo a WhatsApp para cotizar. El influencer lo comparte como link único en su bio en vez de mandar PDF viejo por mensaje. Se genera a costo cero por IA a partir de su Instagram, con el mismo Gate de calidad que ya se usa para presets de tenant, así que nunca sale algo desprolijo frente a una marca.",
        "dolor": "Cuando una marca pide \"pasame tu media kit\", el influencer manotea un Canva de hace 6 meses con métricas viejas o responde con capturas sueltas por WhatsApp; eso resta seriedad justo al negociar precio y hace perder pautas frente a creadores más prolijos.",
        "encajeGSG": "Reutiliza 100% el playbook \"Generador de Preset por IA\" y \"demo pública a costo cero\" ya operativos (mismo Gate, misma URL gratuita, mismo flujo de autorización del cliente); el storefront público multi-tenant ya existe en el ERP, solo se agrega un blueprint \"portfolio/rate card\" en vez de servicios o catálogo de productos. No requiere infraestructura nueva paga: mismo Vercel, mismo ERP core.",
        "esfuerzo": 3,
        "horasHumanas": 16,
        "impacto": 6,
        "mejorasAplicadas": "Validé que el dolor es real y recurrente para micro/nano-influencers (no solo top-tier) y que es pagable como feature de captación, no como producto standalone caro. Ajusté el scoring a la baja con honestidad: impacto medio (nicho, ticket bajo, no es el motor de ventas del ERP) y confianza 7 (el dolor es concreto pero la disposición a pagar por sí sola —vs. usarlo gratis como demo/gancho— no está probada). Mantuve el MVP acotado: blueprint nuevo + rate card editable a mano, sin IA inventando precios ni infraestructura nueva.",
        "pctAutomatizableIA": 85,
        "segmento": "influencers",
        "solucion": "Se reutiliza el Generador de Preset por IA (tenant + blueprint + branding + datos demo) con un blueprint nuevo y liviano \"creador de contenido\": el influencer (o su CM) da su Instagram, el sistema extrae identidad visual, nicho y posteos destacados, y arma el storefront-media kit en la URL gratuita de demo. Pasa el Gate bloqueante (SAP + GSG + Arquitectura + Confiabilidad) antes de mostrarse, igual que Magra o Break Point. La rate card queda editable a mano desde el mismo backoffice del ERP, sin que la IA le adivine el precio al creador.",
        "tiempoMVPdias": 5,
        "titulo": "\"Media Kit Vivo\": tu carta de presentación para marcas, lista en minutos"
      }
    },
    {
      "id": "r1-e433359d",
      "ronda": 1,
      "autor": "Analítico",
      "autorKey": "analitico",
      "v1": {
        "titulo": "Calendario editorial + banco de aprobaciones con cliente"
      },
      "mejoraV2": "Concreté el dolor con el disparador real del CM (el reclamo \"no aprobé esto\" sin evidencia) y agregué el comprobante exportable como respuesta directa a eso. Reemplacé el canal de aviso de mail/genérico por WhatsApp reusando la integración existente de recordatorios, en línea con el enfoque WhatsApp-first de GSG. Separé explícitamente qué es reutilización pura (agenda, probador) de qué es desarrollo nuevo concreto (adjunto, tabla de auditoría, export, trigger de WhatsApp) para bajar el humo de \"todo ya existe\".",
      "mejoraV3": "Recorté el MVP a las 4 piezas nuevas mínimas y saqué explícitamente del alcance lo que sonaba a \"todo ya existe\" sin serlo (threaded comments, versionado ilimitado, dashboard) para que el scope vendible quede honesto y chico. Bajé la confianza de pagabilidad porque el comprador real (CM freelance individual) tiene ticket más chico y más sensibilidad al precio que un tenant de marca del ERP — es una apuesta de volumen, no de ticket alto, y el dolor de \"reclamo sin evidencia\" es agudo pero no diario, lo que puede debilitar la urgencia de pago recurrente si no se empaqueta con algo que sí se usa todos los días (el calendario editorial en sí).",
      "final": {
        "categoriaDolor": "entregables_visuales",
        "titulo": "Aprobación de contenido sin login + comprobante de OK con validez de reclamo",
        "segmento": "community_managers",
        "dolor": "El CM que maneja 5-10 cuentas de clientes pierde horas por semana coordinando aprobaciones de piezas por WhatsApp/mail desordenado, y cuando el cliente reclama \"yo no aprobé esto\" no tiene evidencia (timestamp, versión, IP) para defenderse ni cobrar el retrabajo.",
        "descripcion": "Tablero por cliente donde el CM sube la pieza (imagen/copy) contra una fecha de calendario editorial, con estado borrador → en revisión → aprobado → publicado. El cliente aprueba o pide cambios desde un link sin contraseña (mismo patrón del probador del ERP), y cada acción queda registrada con timestamp, IP y versión adjunta, generando un comprobante exportable que el CM muestra como respaldo ante un reclamo. Aviso de \"pieza esperando aprobación\" sale por WhatsApp, no por mail que se pierde.",
        "solucion": "MVP acotado a 4 piezas nuevas concretas sobre lo ya existente: (1) campo de adjunto imagen/video por ítem de catálogo reusado como \"pieza\", (2) tabla de auditoría de aprobación (timestamp+IP+versión, sin RLS nuevo, hereda tenantId), (3) botón de exportar comprobante a PDF/imagen simple (una plantilla, no un motor de reportes), (4) trigger de WhatsApp reusando el webhook de recordatorios de turno con texto distinto. Se deja explícitamente fuera del MVP: multi-ronda de comentarios threaded, versionado ilimitado, y dashboard de métricas — eso es v2 si el mercado responde.",
        "encajeGSG": "Reutiliza tres piezas ya construidas y probadas: módulo de Agenda (recalendarizado a fecha editorial), patrón de acceso sin contraseña del probador interactivo, e integración de WhatsApp Business API para recordatorios (mismo webhook, distinto trigger/texto). Encaja como producto de la Agencia Digital para el segmento CM/freelance, con blueprint \"agencia de contenido\" ya contemplado en el roadmap de rubros.",
        "mejorasAplicadas": "Recorté el MVP a las 4 piezas nuevas mínimas y saqué explícitamente del alcance lo que sonaba a \"todo ya existe\" sin serlo (threaded comments, versionado ilimitado, dashboard) para que el scope vendible quede honesto y chico. Bajé la confianza de pagabilidad porque el comprador real (CM freelance individual) tiene ticket más chico y más sensibilidad al precio que un tenant de marca del ERP — es una apuesta de volumen, no de ticket alto, y el dolor de \"reclamo sin evidencia\" es agudo pero no diario, lo que puede debilitar la urgencia de pago recurrente si no se empaqueta con algo que sí se usa todos los días (el calendario editorial en sí).",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 4,
        "horasHumanas": 55,
        "costoHumanoUSD": 1400,
        "pctAutomatizableIA": 75,
        "tiempoMVPdias": 12
      }
    },
    {
      "id": "r1-59635fa2",
      "ronda": 1,
      "autor": "Analítico",
      "autorKey": "analitico",
      "v1": {
        "titulo": "Reporte automático de resultados para el cliente (CM)"
      },
      "mejoraV2": "Concreté el dolor con el costo real (2-4h/cliente) y until el efecto de negocio (reporte feo = renovación en riesgo, no solo \"atraso\"). Reemplacé la idea de \"redirigir el dashboard cross-tenant\" —que hubiera dado un reporte con cara de tabla de negocio, no de media kit— por una plantilla visual nueva de una sola página pensada para verse bien en el celular del cliente, que es el formato que realmente vende. Agregué el envío por WhatsApp como canal principal (no mail) y until el detalle de qué se apalanca exactamente vs qué es trabajo nuevo, para no vender humo de \"cero esfuerzo\".",
      "mejoraV3": "Sobre v2: incorporé el riesgo real de cronograma que faltaba — la revisión de permisos avanzados de Meta Graph API puede demorar días/semanas y es la variable más incierta del MVP, así que la acoté a cuentas ya conectadas por el CM para el primer entregable. Ajusté horas/costo/tiempo a la baja en confianza pero realista, y bajé ligeramente impacto/esfuerzo score para reflejar honestamente que es una mejora de retención (no un producto de venta directa nuevo) con dependencia de un tercero (Meta) fuera de nuestro control.",
      "final": {
        "titulo": "Reporte mensual \"one-pager de marca\" auto-armado para el cliente del CM",
        "segmento": "community_managers",
        "dolor": "Cada mes el CM arma a mano un PPT/Excel de resultados por cliente (2-4h por cliente) para justificar el fee; el resultado es desprolijo, inconsistente entre clientes y sin marca propia, justo en el momento en que el cliente decide si renueva.",
        "categoriaDolor": "reportes_metricas",
        "descripcion": "Reporte mensual por cliente, auto-generado el día 1: una sola página tipo media kit (portada con logo/color del cliente final, 3-4 métricas clave con variación mensual en tarjetas grandes, un gráfico de tendencia simple y \"lo más destacado del mes\" con miniaturas de los top posts). Exporta a PDF con el branding del CM (no del ERP) y se envía por WhatsApp con un mensaje corto. El CM no toca nada salvo, si quiere, agregar un comentario cuando una métrica cae.",
        "solucion": "MVP acotado a: (1) una plantilla visual de una página, diseñada para leerse bien en el celular del dueño de marca (no un dashboard reetiquetado), reutilizable para todos los tenants CM; (2) un conector a Instagram/Meta Graph API para traer 3-4 métricas (alcance, interacciones, publicaciones, seguidores) — punto de mayor riesgo de cronograma porque Meta exige permisos avanzados (instagram_basic, pages_read_engagement) sujetos a revisión de la app, que puede demorar días o semanas si la cuenta no está ya autorizada; para el MVP se arranca en modo desarrollo con las cuentas ya conectadas por el CM, y se documenta el trámite de review como paso posterior para escalar a nuevos tenants; (3) reutiliza el motor de export PDF con branding por tenant y el cron/scheduler ya en producción; (4) reutiliza el canal WhatsApp-first ya integrado para el envío.",
        "encajeGSG": "Apalanca 100% infraestructura existente: motor de export PDF con branding por tenant, cron diario de Vercel, y canal WhatsApp ya operativo para notificaciones. Lo nuevo y acotado es la plantilla de una página (una vez, reutilizable) y el conector liviano a Meta Graph API — no se construye BI ni dashboard desde cero.",
        "mejorasAplicadas": "Sobre v2: incorporé el riesgo real de cronograma que faltaba — la revisión de permisos avanzados de Meta Graph API puede demorar días/semanas y es la variable más incierta del MVP, así que la acoté a cuentas ya conectadas por el CM para el primer entregable. Ajusté horas/costo/tiempo a la baja en confianza pero realista, y bajé ligeramente impacto/esfuerzo score para reflejar honestamente que es una mejora de retención (no un producto de venta directa nuevo) con dependencia de un tercero (Meta) fuera de nuestro control.",
        "impacto": 6,
        "confianza": 7,
        "esfuerzo": 6,
        "horasHumanas": 45,
        "costoHumanoUSD": 900,
        "pctAutomatizableIA": 75,
        "tiempoMVPdias": 12
      }
    },
    {
      "id": "r1-ef49fe09",
      "ronda": 1,
      "autor": "Analítico",
      "autorKey": "analitico",
      "v1": {
        "titulo": "Agenda de entregas y sesiones multi-cliente vía WhatsApp"
      },
      "mejoraV2": "Se concretó el dolor con cifras de mercado argentino (rango de tarifa por sesión y picos estacionales de demanda) para que deje de ser genérico; se agregó el detalle de UX (carga en 30 segundos desde el celular) y el estado \"entregado\" como diferenciador frente a una agenda genérica de turnos, mostrando que resuelve también el seguimiento de entregables, no solo el calendario; se precisó el mecanismo de implementación (Generador de Preset por IA + blueprint, sin tocar el motor core) para bajar el riesgo de desarrollo a casi cero.",
      "mejoraV3": "Se ajustó el MVP a su versión mínima vendible: blueprint + un campo de estado nuevo + copy de recordatorio, sin tocar el motor de agenda. Se bajó confianza e impacto respecto de v2 porque, aunque el dolor es real, el freelancer individual argentino no siempre paga por herramienta de agenda cuando ya \"se arregla\" con WhatsApp + Google Calendar gratis — el pagador más probable es el estudio/agencia que gestiona varios creativos, no el freelancer solo, lo que acota el TAM inmediato. Se mantiene el esfuerzo bajo (3) porque el 90% ya existe.",
      "final": {
        "categoriaDolor": "organizacion_agenda",
        "confianza": 6,
        "costoHumanoUSD": 380,
        "descripcion": "Blueprint \"Creativo Freelance\" sobre el módulo de Agenda ya en producción (vertical CH Estética): cada sesión de foto/edición/entrega es un turno con cliente, fecha y estado (agendado/en curso/entregado), con bloqueo de solapamiento y recordatorio automático por WhatsApp 24hs antes al creativo y al cliente. Un tablero de \"próximas entregas\" filtra por estado \"entregado\" para que el freelancer vea de un vistazo qué debe y a quién. Carga del turno pensada para 30 segundos desde el celular, sin curva de aprendizaje. MVP acotado a: blueprint + campo de estado nuevo + textos de recordatorio adaptados al lenguaje del segmento — nada de motor nuevo.",
        "dolor": "El freelancer creativo argentino (foto, edición, diseño) coordina turnos y entregas a mano por WhatsApp, sin agenda centralizada: se superponen sesiones de distintos clientes y se le pasan fechas de entrega, lo que en temporada alta (books de egresados, previos a fiestas, fin de mes) le cuesta directamente una sesión perdida de $30.000-80.000.",
        "encajeGSG": "Reutiliza 100% el motor de Agenda + recordatorios WhatsApp ya maduro y en prod (CH Estética): cero desarrollo de infraestructura nueva, solo una definición de blueprint (config vía Generador de Preset por IA) y un estado adicional (\"entregado\") en el modelo de turno existente. Es exactamente el patrón de expansión por blueprint que el ERP ya sabe hacer.",
        "esfuerzo": 3,
        "horasHumanas": 16,
        "impacto": 6,
        "mejorasAplicadas": "Se ajustó el MVP a su versión mínima vendible: blueprint + un campo de estado nuevo + copy de recordatorio, sin tocar el motor de agenda. Se bajó confianza e impacto respecto de v2 porque, aunque el dolor es real, el freelancer individual argentino no siempre paga por herramienta de agenda cuando ya \"se arregla\" con WhatsApp + Google Calendar gratis — el pagador más probable es el estudio/agencia que gestiona varios creativos, no el freelancer solo, lo que acota el TAM inmediato. Se mantiene el esfuerzo bajo (3) porque el 90% ya existe.",
        "pctAutomatizableIA": 85,
        "segmento": "creativos",
        "solucion": "Blueprint nuevo \"Creativo Freelance\" generado vía el Generador de Preset por IA sobre el módulo de Agenda existente: \"profesional\" = creativo, \"servicio\" = tipo de sesión/entrega, \"cliente\" = marca o persona contratante. Se agrega el estado \"entregado\" al modelo de turno (sin tocar el motor) para que la misma agenda funcione como tracker de entregas pendientes. Recordatorio automático por WhatsApp 24hs antes, con copy adaptado al lenguaje del segmento (criollo, directo).",
        "tiempoMVPdias": 6,
        "titulo": "Agenda de sesiones y entregas multi-cliente por WhatsApp (blueprint Creativo Freelance)"
      }
    },
    {
      "id": "r1-396293e4",
      "ronda": 1,
      "autor": "Analítico",
      "autorKey": "analitico",
      "v1": {
        "titulo": "Cobro de sesiones y venta de presets/paquetes con MP"
      },
      "mejoraV2": "Se afiló el dolor mostrando el costo concreto (venta impulsiva perdida por depender de estar despierto/conectado) en vez de solo describir el proceso manual. Se subió el gancho del título a tono criollo y vendedor. Se hizo explícito que la entrega puede resolverse con un botón de descarga en la propia vidriera (no solo email/link externo), reforzando el encaje con el storefront ya existente y bajando aún más el esfuerzo de desarrollo.",
      "mejoraV3": "Se validó que el dolor es real y recurrente en el segmento (presets/LUTs es un producto ya extendido entre editores argentinos que hoy se vende 100% manual por DM). Se acotó el MVP a lo mínimo vendible: un flag \"digital\" en el producto existente + un hook de entrega tras el webhook, sin CDN ni portal de biblioteca de cliente en esta vuelta (eso queda para v2 del producto). Se ajustaron los números a algo defendible: horas humanas moderadas (no trivial: hay que manejar storage de archivos, expiración de links y UI de carga) e infra paga real (storage/bandwidth), en vez de asumir costo cero de infraestructura.",
      "final": {
        "titulo": "\"Vendé mientras dormís\": productos digitales con cobro y entrega automática por MP",
        "segmento": "creativos",
        "dolor": "El fotógrafo/editor que ya creó un producto digital (presets, LUTs, plantillas) lo sigue vendiendo a mano: DM, espera de transferencia, comprobante, y recién ahí manda el archivo por WeTransfer o Drive. Esa fricción mata la venta impulsiva de feed/story y ata un producto que podría venderse solo, 24/7, a que el creativo esté despierto y atento al chat.",
        "categoriaDolor": "venta_captacion",
        "descripcion": "Vidriera pública (link en la bio) donde el creativo lista, junto a sus sesiones 1 a 1, productos digitales repetibles (presets, LUTs, plantillas Canva/CapCut). El cliente paga con Mercado Pago y recibe el archivo al toque vía link de descarga, sin que el creativo intervenga. Pasa de \"vendo solo si estoy conectado\" a \"vendo mientras edito, duermo o estoy en un shooting\".",
        "solucion": "MVP acotado: un tipo de producto \"digital\" en el Catálogo/POS existente (no descuenta stock, tiene un archivo/link adjunto), que al confirmarse el pago por el webhook de Mercado Pago ya operativo dispara el envío automático de un link de descarga (WhatsApp o mail) y habilita un botón de descarga en la propia vidriera. Sin pasarela nueva, sin flujo de entrega manual.",
        "encajeGSG": "Reutiliza Catálogo/POS, el webhook de Mercado Pago y el storefront público por tenant tal cual existen hoy. Lo único nuevo es el tipo de producto \"digital\" + el disparo de entrega automática post-pago — desarrollo marginal sobre infraestructura ya construida y pagada.",
        "mejorasAplicadas": "Se validó que el dolor es real y recurrente en el segmento (presets/LUTs es un producto ya extendido entre editores argentinos que hoy se vende 100% manual por DM). Se acotó el MVP a lo mínimo vendible: un flag \"digital\" en el producto existente + un hook de entrega tras el webhook, sin CDN ni portal de biblioteca de cliente en esta vuelta (eso queda para v2 del producto). Se ajustaron los números a algo defendible: horas humanas moderadas (no trivial: hay que manejar storage de archivos, expiración de links y UI de carga) e infra paga real (storage/bandwidth), en vez de asumir costo cero de infraestructura.",
        "impacto": 6,
        "confianza": 7,
        "esfuerzo": 4,
        "horasHumanas": 22,
        "costoHumanoUSD": 15,
        "pctAutomatizableIA": 75,
        "tiempoMVPdias": 6
      }
    },
    {
      "id": "r1-5977eaff",
      "ronda": 1,
      "autor": "Dev",
      "autorKey": "dev",
      "v1": {
        "titulo": "Cobrame — link de cobro + factura automática para freelancers de contenido"
      },
      "mejoraV2": "Afiné el dolor agregando la dimensión visual (link genérico de MP vs. perfil con marca propia), que es la que un ojo de diseñador detecta y la v1 no mencionaba. Concreté la solución especificando layout mobile-first tipo link-in-bio y conexión directa con el generador de preset por IA para el alta self-serve (reutilizo de metodología existente, no un formulario nuevo). Subí el encaje aclarando que el único desarrollo nuevo es la variante de layout, todo lo demás es reuso. Agregué el efecto de upsell (gancho hacia el ERP completo) como valor de negocio adicional.",
      "mejoraV3": "Recorté el MVP al mínimo vendible: layout de perfil de cobro + link MP + aviso WhatsApp + caja simple, dejando ARCA como opcional post-venta y no bloqueante del lanzamiento (reduce esfuerzo y riesgo fiscal en el MVP). Bajé confianza e impacto a valores honestos: el dolor es real pero de ticket bajo por transacción, así que el volumen de usuarios (no el margen unitario) es lo que define si paga la inversión — lo dejo explícito en vez de sobrevender el caso.",
      "final": {
        "categoriaDolor": "cobros_facturacion",
        "confianza": 7,
        "costoHumanoUSD": 700,
        "descripcion": "Perfil de cobro público mobile-first (variante liviana del storefront/vidriera ya existente) donde el freelancer de contenido carga sus servicios con precio y su identidad visual (logo, paleta, foto) como un mini media-kit. Genera un link único tipo \"link-in-bio de cobro\" para mandar por WhatsApp; el cliente paga con Mercado Pago desde ahí. Al confirmarse el pago se dispara aviso automático por WhatsApp, se registra en una caja simple con export mensual, y opcionalmente se emite factura ARCA (monotributista). Se vende como plan de entrada barato con alta self-serve vía el generador de preset por IA (pega Instagram/web y el perfil sale armado), y sirve de gancho de upsell hacia el ERP completo.",
        "dolor": "El freelancer visual cobra por transferencia o link pelado de MP: sin recibo prolijo, sin recordatorio si el cliente se demora, sin claridad de cuánto facturó al mes ni cuánto debe declarar, y con un link que no tiene su marca — resta profesionalismo justo cuando el cliente decide si pagarle.",
        "encajeGSG": "Reusa storefront público + branding por tenant + Mercado Pago + Plugin ARCA + blueprint de tenant + generador de preset por IA, todo ya existente. El único desarrollo real es el layout \"perfil de cobro\" mobile-first (recorte del storefront, sin agenda/stock) y ajustar la landing de alta self-serve al flujo de creativos solos.",
        "esfuerzo": 4,
        "horasHumanas": 28,
        "impacto": 7,
        "mejorasAplicadas": "Recorté el MVP al mínimo vendible: layout de perfil de cobro + link MP + aviso WhatsApp + caja simple, dejando ARCA como opcional post-venta y no bloqueante del lanzamiento (reduce esfuerzo y riesgo fiscal en el MVP). Bajé confianza e impacto a valores honestos: el dolor es real pero de ticket bajo por transacción, así que el volumen de usuarios (no el margen unitario) es lo que define si paga la inversión — lo dejo explícito en vez de sobrevender el caso.",
        "pctAutomatizableIA": 75,
        "segmento": "creativos",
        "solucion": "Blueprint de tenant \"freelancer/solo\" (un usuario, sin agenda ni inventario) con catálogo de servicios reducido a layout vertical link-in-bio, branding por tenant, checkout Mercado Pago, webhook de pago que dispara aviso WhatsApp y asienta el cobro en una caja simple exportable; ARCA queda como toggle opcional para quien ya factura. Alta self-serve reutilizando el generador de preset por IA (Instagram/web → perfil armado y auditado antes de publicar).",
        "tiempoMVPdias": 12,
        "titulo": "Cobrame — perfil de cobro con marca personal + factura automática para freelancers de contenido"
      }
    },
    {
      "id": "r1-f416e803",
      "ronda": 1,
      "autor": "Dev",
      "autorKey": "dev",
      "v1": {
        "titulo": "Media Kit + Rate Card viva para influencers"
      },
      "mejoraV2": "Se concretó el dolor con cifras reales de tarifas de micro/nano influencers en Argentina ($15.000-$150.000 por posteo) para que la propuesta hable el idioma del mercado local en vez de quedar genérica. Se precisó la solución técnica (Checkout Pro + QR/transferencia como respaldo, seña configurable 30-50%, catálogo reconfigurado como \"formatos de colaboración\") y se reforzó el encaje aclarando que es cero desarrollo nuevo, reutilizando el mismo flujo de alta de tenant ya probado con Break Point y Magra, lo que baja el costo humano a soporte de alta únicamente.",
      "mejoraV3": "Se acotó el MVP a 3-4 formatos fijos y un único % de seña global (no por formato) para reducir la superficie de UI del primer corte. Se marcó explícitamente el riesgo de \"pagable\": el que paga la suscripción es el influencer, no la marca, y en el segmento nano/micro la disposición a pagar un SaaS mensual es incierta hasta validar con 3-5 casos reales; se bajó la confianza en consecuencia respecto de v2.",
      "final": {
        "categoriaDolor": "venta_captacion",
        "titulo": "Media Kit + Rate Card viva con cobro de seña por MP",
        "segmento": "influencers",
        "dolor": "El influencer/creador manda un PDF de media kit que envejece en dos semanas y responde a mano, por DM, la misma pregunta de cotización y coordinación de seña con cada marca interesada.",
        "descripcion": "Página pública (un link fijo en la bio) que actúa como media kit vivo: métricas, portfolio y una rate card real en pesos por formato (story, reel, posteo, UGC, evento), editable en minutos por el propio influencer. La marca elige formato, paga la seña por Mercado Pago (Checkout Pro + QR/transferencia de respaldo) y la fecha queda reservada en la agenda, sacando del chat las 5 idas y vueltas que hoy son manuales. Apunta al ticket real del micro/nano influencer argentino ($15.000-$150.000 por posteo), hoy gestionado a mano.",
        "solucion": "MVP acotado: blueprint \"creador de contenido\" sobre el storefront público ya existente, reconfigurando catálogo como \"formatos de colaboración\" con precio y % de seña, cobrando con el checkout de MP ya integrado y bloqueando fecha con el módulo de agenda ya existente. Sin backend nuevo: es reconfiguración de dominio + alta por el flujo de preset IA, con gate de autorización del cliente antes de publicar. Se recorta a 3-4 formatos fijos y un solo % de seña configurable (no editable por servicio) para bajar el esfuerzo de UI del primer corte.",
        "encajeGSG": "Reutiliza 100% infraestructura en producción: Generador de Preset IA (ingesta desde Instagram/web), storefront público multi-tenant, catálogo/servicios, Mercado Pago y agenda. Mismo flujo de alta de tenant probado con Break Point y Magra, aplicado a persona física. Costo humano marginal: soporte de alta y ajuste fino de UI para catálogo de \"formatos\" en vez de \"productos\".",
        "mejorasAplicadas": "Se acotó el MVP a 3-4 formatos fijos y un único % de seña global (no por formato) para reducir la superficie de UI del primer corte. Se marcó explícitamente el riesgo de \"pagable\": el que paga la suscripción es el influencer, no la marca, y en el segmento nano/micro la disposición a pagar un SaaS mensual es incierta hasta validar con 3-5 casos reales; se bajó la confianza en consecuencia respecto de v2.",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 22,
        "costoHumanoUSD": 350,
        "pctAutomatizableIA": 90,
        "tiempoMVPdias": 6
      }
    },
    {
      "id": "r1-4d9c7d42",
      "ronda": 1,
      "autor": "Dev",
      "autorKey": "dev",
      "v1": {
        "titulo": "Agenda de Colaboraciones — WhatsApp-first para CMs con múltiples marcas"
      },
      "mejoraV2": "Concreté el dolor con el costo real (plata perdida por publicar tarde/mal, no solo \"desorden\"), le di un ángulo fresco al copy (el registro de aprobación como respaldo ante el cliente que dice \"yo no dije que sí\"), y until until until until until until until until until until until until until until until until until until until until — until subí el encaje explicitando que no se toca el core de turnos y que WhatsApp es el canal donde el CM ya opera.",
      "mejoraV3": "Se limpió el copy corrupto de la v2 (cadena de \"until\" repetida), se acotó explícitamente el MVP a 4 funciones mínimas vendibles (excluyendo versionado/comentarios/integraciones para v2), y se bajó la confianza de forma honesta: el dolor es real pero compite con herramientas gratuitas ya instaladas (grupos de WhatsApp, Trello, Notion), lo que exige validar disposición real a pagar antes de invertir más de una demo.",
      "final": {
        "categoriaDolor": "organizacion_agenda",
        "titulo": "Agenda de Aprobaciones — el CM manda el link por WhatsApp, el cliente aprueba con un toque",
        "segmento": "community_managers",
        "dolor": "El CM freelance lleva 4 a 8 marcas al mismo tiempo y aprueba contenido a los ponchazos por WhatsApp: manda la pieza, el cliente contesta \"dale\" tres días después perdido en otro chat, y para cuando se acuerda ya pasó la fecha o publicó algo que en rigor no estaba aprobado. El costo real no es el desorden sino la plata que se pierde por publicar tarde/mal y la hora extra que el CM gasta scrolleando chats viejos para probar \"vos me dijiste que sí\".",
        "descripcion": "Tablero por CM (tenant = el CM, \"clientes\" = cuentas gestionadas) donde cada pieza de contenido tiene estado: borrador, en aprobación, aprobado, publicado. El cliente recibe un link de WhatsApp sin login, ve la pieza y aprueba o pide cambios con un toque; queda registrado quién aprobó y cuándo (timestamp) como respaldo ante reclamos. A las 24hs sin respuesta sale recordatorio automático al cliente y aviso al CM de que ese frente está trabado. El CM ve de un vistazo qué marca tiene pendientes y qué se vence esta semana, sin abrir ocho chats.",
        "solucion": "Se reutiliza el motor de agenda + recordatorios + gestión de clientes del ERP remapeando \"turno\" a \"pieza de contenido\" y \"cliente\" a \"cuenta gestionada\"; el link de aprobación sin password usa el mismo patrón de token público del probador (cero auth nueva). El MVP vendible es acotado: 4 estados, link de aprobación con timestamp, recordatorio a 24hs y un tablero simple — sin versionado de piezas, sin comentarios enhilados, sin integraciones a redes (eso queda para v2 si hay tracción).",
        "encajeGSG": "Motor de agenda/recordatorios, gestión de clientes y patrón de acceso sin password del probador ya existen y no se tocan; blueprint nuevo \"agencia-contenido\" bajo el principio de variante (ADR-055), sin meter mano en el core de turnos de estética. WhatsApp-first: el link va por el canal donde el CM ya vive todo el día, sin migrarlo de plataforma.",
        "mejorasAplicadas": "Se limpió el copy corrupto de la v2 (cadena de \"until\" repetida), se acotó explícitamente el MVP a 4 funciones mínimas vendibles (excluyendo versionado/comentarios/integraciones para v2), y se bajó la confianza de forma honesta: el dolor es real pero compite con herramientas gratuitas ya instaladas (grupos de WhatsApp, Trello, Notion), lo que exige validar disposición real a pagar antes de invertir más de una demo.",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 35,
        "costoHumanoUSD": 450,
        "pctAutomatizableIA": 80,
        "tiempoMVPdias": 10
      }
    },
    {
      "id": "r1-3e2a580c",
      "ronda": 1,
      "autor": "Dev",
      "autorKey": "dev",
      "v1": {
        "titulo": "Reporte de Resultados automático para clientes de CM/agencia chica"
      },
      "mejoraV2": "Se corrigió la premisa de humo de \"vía API donde esté disponible\" — para cuentas chicas de CM no existe API confiable de Meta/TikTok, así que la carga manual asistida por IA pasa a ser EL mecanismo, no un fallback; se precisó el dolor con el ángulo de negocio (el reporte es el momento de decisión de renovación del cliente, no solo prolijidad); se agregaron guardrails de precisión (la IA no inventa cifras, pide confirmación) y se cuantificó el ahorro de tiempo para que el caso de negocio sea concreto.",
      "mejoraV3": "Se ajustó el scoring a un MVP honesto: el esfuerzo real no es solo \"leer con IA\" sino construir la UI de carga, el pipeline de validación con guardrails, el almacenamiento histórico y el render brandeado -eso sí es horas humanas. Se bajó ligeramente el impacto porque es un feature de valor percibido/retención más que un generador directo de nuevas ventas, y se ató el tiempo de MVP a algo demostrable en ~2 semanas reusando componentes existentes en vez de tratarlo como trivial.",
      "final": {
        "titulo": "Reporte de Resultados mensual automatizado (branded, WhatsApp-first) para CM y agencias chicas",
        "segmento": "community_managers",
        "dolor": "A fin de mes el CM arma a mano en Canva/Excel el informe de resultados de cada cliente (no hay API estable de Meta/TikTok para cuentas chicas), le come 2-4 horas por cliente y justo ese entregable es el que decide si el cliente renueva o no.",
        "categoriaDolor": "reportes_metricas",
        "descripcion": "Generador de reporte mensual donde el CM sube capturas de Insights/TikTok Analytics o un CSV; la IA extrae y valida las métricas (pide confirmación ante ambigüedad, nunca inventa cifras), arma el comparativo mes a mes y redacta 2-3 conclusiones en criollo. El resultado se sirve como página brandeada con la identidad del cliente final y se entrega por WhatsApp con un link, no un PDF perdido en el chat. No promete integración de API de Meta/TikTok -la carga manual asistida por IA es el mecanismo real y sostenible para cuentas chicas, no un fallback.",
        "solucion": "Vista tipo storefront (motor de branding por tenant ya existente) con sección \"Reportes\" por cliente gestionado: el CM sube 1-3 capturas/CSV por red y por mes, la IA extrae y valida los números, genera comparativo + resumen ejecutivo, el CM aprueba con un click y se envía el link por WhatsApp. Guarda histórico para que desde el segundo mes el comparativo salga solo. Ahorra ~2-4 horas por cliente y las reduce a 5-10 minutos de carga/revisión.",
        "encajeGSG": "Reutiliza tres piezas ya construidas y pagas del ERP: motor de branding por tenant (página del reporte), integración WhatsApp-first (entrega), y capacidad de IA generativa para lectura de imágenes/CSV y redacción (costo IA = $0 por regla del proyecto). No requiere acuerdos con Meta/TikTok ni infraestructura nueva de pago: es una vista + flujo de carga nuevos sobre el mismo tenant y el mismo modelo de suscripción.",
        "mejorasAplicadas": "Se ajustó el scoring a un MVP honesto: el esfuerzo real no es solo \"leer con IA\" sino construir la UI de carga, el pipeline de validación con guardrails, el almacenamiento histórico y el render brandeado -eso sí es horas humanas. Se bajó ligeramente el impacto porque es un feature de valor percibido/retención más que un generador directo de nuevas ventas, y se ató el tiempo de MVP a algo demostrable en ~2 semanas reusando componentes existentes en vez de tratarlo como trivial.",
        "impacto": 6,
        "confianza": 7,
        "esfuerzo": 4,
        "horasHumanas": 45,
        "costoHumanoUSD": 900,
        "pctAutomatizableIA": 65,
        "tiempoMVPdias": 12
      }
    },
    {
      "id": "r1-7949d850",
      "ronda": 1,
      "autor": "Dev",
      "autorKey": "dev",
      "v1": {
        "titulo": "Catálogo + Cobro de Presets/Plantillas para creativos que venden digitales"
      },
      "mejoraV2": "Se afiló el dolor agregando el costo real (venta perdida por demora + cero visibilidad de cuánto se vendió) en vez de solo \"es manual\". Se bajó la solución a un campo concreto (`tipoEntrega`) y un trigger específico sobre el webhook de MP existente, en vez de hablar de \"tienda digital\" genérica. Se recortó el humo del encaje GSG dejando explícito que no hace falta storefront ni infraestructura nueva, solo una rama de comportamiento sobre el producto y el webhook ya existentes.",
      "mejoraV3": "Se agregó honestidad competitiva: el dolor es real pero YA está resuelto gratis/barato por Payhip, Hotmart y Gumroad, así que el argumento de venta no es \"entrega automática\" sino \"sin salir del ERP que ya usás para todo lo demás, sin comisión de plataforma externa\". Se acotó el MVP a un archivo por producto y tope de tamaño para no exponer costo de storage/bandwidth no contemplado. Se bajó la confianza y se subió el esfuerzo/horas reales frente a v2, que subestimaba el trabajo humano de UI de carga, expiración de links y QA del webhook.",
      "final": {
        "titulo": "Vidriera de Descargables: catálogo digital con entrega automática 24/7 para creativos",
        "segmento": "creativos",
        "dolor": "El editor de video, diseñador o fotógrafo que vende presets de Lightroom, plantillas de Canva/CapCut o LUTs no tiene vidriera propia: cobra por transferencia, negocia por DM y manda el archivo a mano por WhatsApp o Drive, uno por uno. Cada venta exige que esté despierto y disponible para \"entregar\" — si tarda, el cliente se enfría o pide reembolso, y no hay forma de saber cuánto vendió en el mes sin revisar el chat a mano.",
        "categoriaDolor": "entregables_visuales",
        "descripcion": "Es el storefront público del ERP (la vidriera que ya existe por tenant) con un tipo de producto nuevo: \"digital descargable\". El creativo carga su catálogo de presets/plantillas con foto, precio y el archivo real (o su link), tal como hoy carga un producto físico. El cliente entra a la vidriera, paga con Mercado Pago y automáticamente le llega el link de descarga (con expiración) o el archivo por WhatsApp, sin que el creativo toque un dedo. Vende mientras graba, edita o duerme, y el pedido queda registrado en el ERP como cualquier venta — con su comisión y su reporte. Nota de validación: la disposición a pagar existe (hoy usan Payhip/Hotmart/Gumroad para esto), así que el diferencial real de GSG no es \"vender lo mismo\" sino integrarlo al ERP que el creativo YA usa para agenda/clientes, sin altas de cuenta ni comisión extra de plataforma externa — ese es el argumento de venta, no la funcionalidad en sí (que ya existe gratis en otros lados).",
        "solucion": "Extender el modelo de producto del catálogo con un campo `tipoEntrega: fisico | digital`. Para \"digital\": en vez de descontar stock, el webhook de pago aprobado de Mercado Pago dispara la entrega automática — genera un link firmado con expiración desde el storage donde ya vive el archivo, y lo empuja por el mismo canal de WhatsApp que hoy usa el ERP para recordatorios/confirmaciones. MVP acotado a un solo archivo por producto (sin packs multi-archivo ni versionado) y tamaño límite chico (ej. hasta 50MB, cubre presets/LUTs/plantillas típicas, no video pesado) para no golpear storage/bandwidth. No hay checkout nuevo, no hay storefront nuevo: es una rama de comportamiento sobre el flujo de venta existente.",
        "encajeGSG": "Catálogo, storefront/vidriera por tenant, checkout Mercado Pago y mensajería WhatsApp ya existen y se reutilizan al 100%; lo único nuevo es el campo de tipo de entrega y el trigger de \"link post-pago\" en el webhook de MP — una variante puntual sobre el objeto producto (ADR-055: mismo objeto, nueva asignación/comportamiento, no un sistema aparte). Requiere confirmar que el bucket de storage actual soporta archivos descargables con expiración (no solo imágenes de catálogo) — si no, es una config puntual, no una infraestructura nueva.",
        "mejorasAplicadas": "Se agregó honestidad competitiva: el dolor es real pero YA está resuelto gratis/barato por Payhip, Hotmart y Gumroad, así que el argumento de venta no es \"entrega automática\" sino \"sin salir del ERP que ya usás para todo lo demás, sin comisión de plataforma externa\". Se acotó el MVP a un archivo por producto y tope de tamaño para no exponer costo de storage/bandwidth no contemplado. Se bajó la confianza y se subió el esfuerzo/horas reales frente a v2, que subestimaba el trabajo humano de UI de carga, expiración de links y QA del webhook.",
        "impacto": 5,
        "confianza": 6,
        "esfuerzo": 4,
        "horasHumanas": 28,
        "costoHumanoUSD": 280,
        "pctAutomatizableIA": 80,
        "tiempoMVPdias": 4
      }
    },
    {
      "id": "r1-70dd7163",
      "ronda": 1,
      "autor": "Dev",
      "autorKey": "dev",
      "v1": {
        "titulo": "CRM de Marcas para influencers — pipeline de sponsoreos"
      },
      "mejoraV2": "Se concretó el dolor con la fricción real de monotributo/facturación manual en Argentina. Se agregó el cierre de círculo cobro→factura ARCA→Mercado Pago como paso explícito del pipeline (v1 quedaba en \"cobrado\" sin especificar cómo). Se precisó que los recordatorios van por WhatsApp, coherente con el hábito real del segmento, y se aclaró que el único desarrollo nuevo es la vista Kanban, subiendo el encaje con lo ya existente y bajando el humo de \"sin desarrollo nuevo\" de v1.",
      "mejoraV3": "Se ajustó el scoring a la baja en confianza porque el segmento de micro/mid influencers argentinos es sensible al precio y muchos resuelven \"a mano\" sin pagar herramienta salvo que el ahorro de tiempo sea evidente desde el día uno; se acotaron horas humanas y costo a lo estrictamente de configuración/QA (blueprint + Kanban), dado que el resto es reuso directo de módulos ya construidos y el trabajo de wiring lo hace la IA a costo $0.",
      "final": {
        "titulo": "CRM de Marcas — pipeline de sponsoreos con cotizador y cobro integrado",
        "segmento": "influencers",
        "dolor": "El influencer/creador argentino negocia 5-15 marcas en simultáneo por WhatsApp/DM, cotiza a ojo sin registro y no tiene un lugar único para ver qué debe entregar y qué le deben cobrar, resultando en entregas tarde y cobros/facturación (monotributo) perdidos en Excel.",
        "categoriaDolor": "gestion_clientes_marcas",
        "descripcion": "Blueprint \"Influencer\" sobre el ERP core: remapea clientes→Marcas, catálogo→servicios cotizables (reel, posteo, story), agenda/recordatorios→deadlines de entrega y cobro por WhatsApp, y factura ARCA + Mercado Pago para cerrar cobro. Se agrega una vista Kanban de 6 columnas (Contactado→Cotizado→Confirmado→Producción→Entregado→Facturado/Cobrado) reutilizando el componente de tablero existente. Vive en el celular vía WhatsApp, no en planilla.",
        "solucion": "MVP: (1) blueprint de mapeo cliente→marca con campos custom (contacto de prensa, historial de pago), (2) catálogo con precios sugeridos en ARS por tipo de contenido, (3) recordatorios automáticos de entrega y cobro por WhatsApp reutilizando el motor de agenda, (4) botón \"Facturar\" (ARCA monotributo) y \"Cobrado\" (link MP/transferencia) sobre el flujo de facturación ya existente. Único desarrollo de UI nuevo: la vista Kanban, reutilizando el componente de tablero de turnos/servicios.",
        "encajeGSG": "Backend 100% reutilizado (clientes, catálogo, agenda/recordatorios, RBAC, ARCA/AFIP sandbox, Mercado Pago); cero infra nueva, mismo tenant/storefront. Encaja con demo a costo cero: preset de influencer con marcas ficticias. Único trabajo real: blueprint de mapeo + vista Kanban (reuso de componente existente).",
        "mejorasAplicadas": "Se ajustó el scoring a la baja en confianza porque el segmento de micro/mid influencers argentinos es sensible al precio y muchos resuelven \"a mano\" sin pagar herramienta salvo que el ahorro de tiempo sea evidente desde el día uno; se acotaron horas humanas y costo a lo estrictamente de configuración/QA (blueprint + Kanban), dado que el resto es reuso directo de módulos ya construidos y el trabajo de wiring lo hace la IA a costo $0.",
        "impacto": 7,
        "confianza": 6,
        "esfuerzo": 4,
        "horasHumanas": 18,
        "costoHumanoUSD": 350,
        "pctAutomatizableIA": 85,
        "tiempoMVPdias": 12
      }
    },
    {
      "id": "r1-02077435",
      "ronda": 1,
      "autor": "Dev",
      "autorKey": "dev",
      "v1": {
        "titulo": "Split de comisiones para colectivos de creativos / estudios chicos"
      },
      "mejoraV2": "Afiné el dolor: no es el cálculo del %, es la falta de un árbitro neutral y transparente (ahí está la fricción real de confianza entre socios ocasionales). Concreté la solución agregando la vista acotada por colaborador y el estado girado/pendiente, que faltaban en v1. Título más humano y con voz propia, y until el encaje quedó más específico sobre qué SÍ hay que construir (no \"cero desarrollo\" a secas).",
      "mejoraV3": "Validé que el dolor es real y específico (fricción de confianza entre socios ocasionales, no cálculo de porcentaje) pero es un nicho dentro de creativos — no todo freelance factura en colectivo, así que bajé impacto y confianza a niveles honestos. Recorté el MVP a lo mínimo vendible: ABM de asignación + link único de cobro + vista acotada + estado girado/pendiente, sin sumar features de reporting que no pidió nadie todavía. Ajusté horas y costo a una estimación conservadora de desarrollo sobre código existente (no desde cero).",
      "final": {
        "categoriaDolor": "cobros_facturacion",
        "confianza": 6,
        "costoHumanoUSD": 1100,
        "descripcion": "Tenant tipo \"estudio/colectivo freelance\": se carga un proyecto con sus colaboradores (ABM de asignación con % o monto fijo, nunca hardcodeado), se cobra al cliente final con un único link de Mercado Pago, y al acreditarse el pago el sistema calcula y registra automáticamente cuánto le corresponde a cada uno. Cada colaborador entra con login propio y ve SOLO sus proyectos y comisiones, con estado \"pendiente\" o \"girado\" — eliminando el Excel compartido y la discusión de confianza. El árbitro neutral es el sistema, no la memoria de nadie.",
        "dolor": "Fotógrafo, editor y diseñador facturan juntos a una marca pero reparten la guita en un Excel informal o \"después arreglamos\" — y ese después es donde se cortan sociedades porque nadie tiene un registro neutral de cuánto le toca a cada uno y quién ya cobró.",
        "encajeGSG": "Motor de comisiones, ledger de Mercado Pago y RBAC por rol ya existen en el core para empleados de un local — cero backend nuevo, solo reencuadrar el modelo (colectivo=tenant, colaborador=empleado por proyecto). Lo real a construir: vista acotada de colaborador (solo lectura de sus propias comisiones) y el campo/estado \"girado vs pendiente\" para transferencias manuales, que hoy no existe en ningún lado del producto.",
        "esfuerzo": 3,
        "horasHumanas": 45,
        "impacto": 5,
        "mejorasAplicadas": "Validé que el dolor es real y específico (fricción de confianza entre socios ocasionales, no cálculo de porcentaje) pero es un nicho dentro de creativos — no todo freelance factura en colectivo, así que bajé impacto y confianza a niveles honestos. Recorté el MVP a lo mínimo vendible: ABM de asignación + link único de cobro + vista acotada + estado girado/pendiente, sin sumar features de reporting que no pidió nadie todavía. Ajusté horas y costo a una estimación conservadora de desarrollo sobre código existente (no desde cero).",
        "pctAutomatizableIA": 75,
        "segmento": "creativos",
        "solucion": "Reusar el motor de comisiones + ledger de cobros de Mercado Pago que ya corre para empleados de un local, con el colectivo de freelancers como tenant y cada colaborador como \"empleado\" asignado a un proyecto puntual (ABM de asignación con % o monto fijo). Se suma: (1) vista de colaborador acotada por RBAC (solo sus propias comisiones, sin ver el resto del negocio), y (2) un estado \"girado/pendiente\" por transferencia que hoy no se trackea. MVP vendible sin tocar el core de cobros.",
        "tiempoMVPdias": 10,
        "titulo": "\"Somos 3 y cobramos como 1\": el split automático para colectivos de freelas"
      }
    },
    {
      "id": "r1-68e60738",
      "ronda": 1,
      "autor": "Dev",
      "autorKey": "dev",
      "v1": {
        "titulo": "Waitlist + Reserva de Cupos para talleres/mentorías de creativos"
      },
      "mejoraV2": "Se acoto el dolor a la causa raiz real (el pago no es lo que bloquea el cupo) y se especifico el mecanismo tecnico concreto. Se recategorizo de otro a venta_captacion porque el dolor central es perder ventas por desorden de cobro.",
      "mejoraV3": "Se validó que el dolor es real y recurrente en Argentina (venta de cupos por Instagram + transferencia manual), pero de alcance más acotado de lo que sugiere \"transversal\": aplica a quien vende cupos limitados, no a todo el segmento. Se ajustaron los números a la baja con honestidad (esfuerzo y horas subieron levemente por los casos borde de seña/webhook/reintentos que v2 minimizaba) y se mantiene el MVP mínimo: un solo blueprint de evento, sin editor de eventos recurrentes ni descuentos por volumen en esta primera vuelta.",
      "final": {
        "titulo": "Reserva de Cupos con Seña Automática (anti doble-booking) para talleres y mentorías",
        "segmento": "transversal",
        "dolor": "Al vender cupos limitados de un taller o mentoría por formulario + transferencia manual, el organizador no tiene forma de bloquear el lugar al momento del pago: dos personas pueden pagar el mismo cupo, la conciliación es manual contra una planilla, y si alguien cancela no hay manera automática de ofrecerle el lugar al siguiente de la waitlist.",
        "categoriaDolor": "venta_captacion",
        "descripcion": "Página de evento en el storefront del tenant con cupos numerados donde el pago (seña o total vía Mercado Pago) es el evento que confirma y descuenta el cupo, eliminando el doble-booking. Cupos llenos derivan a waitlist ordenada; una cancelación libera el lugar y dispara WhatsApp automático al primero de la lista con link de pago a vencimiento corto antes de pasar al siguiente. El organizador ve un panel simple: vendidos, seña vs. saldo, y waitlist en orden.",
        "solucion": "MVP acotado: modelar el taller/mentoría como un \"turno de cupo único\" dentro del motor de agenda/waitlist ya existente, sumar un webhook de confirmación de Mercado Pago que descuenta el cupo al acreditarse el pago (no antes), y reusar el canal de recordatorios WhatsApp ya integrado para avisar a la waitlist. Se empaqueta como un blueprint más del generador de preset, sin infraestructura nueva.",
        "encajeGSG": "Reutiliza tres piezas ya construidas del ERP (agenda con cupos/waitlist, checkout Mercado Pago, recordatorios WhatsApp): el trabajo real es reempaquetado + un webhook que ata el pago acreditado a la baja de cupo, más el blueprint de evento en el generador de preset. Cero infraestructura nueva.",
        "mejorasAplicadas": "Se validó que el dolor es real y recurrente en Argentina (venta de cupos por Instagram + transferencia manual), pero de alcance más acotado de lo que sugiere \"transversal\": aplica a quien vende cupos limitados, no a todo el segmento. Se ajustaron los números a la baja con honestidad (esfuerzo y horas subieron levemente por los casos borde de seña/webhook/reintentos que v2 minimizaba) y se mantiene el MVP mínimo: un solo blueprint de evento, sin editor de eventos recurrentes ni descuentos por volumen en esta primera vuelta.",
        "impacto": 6,
        "confianza": 7,
        "esfuerzo": 5,
        "horasHumanas": 38,
        "costoHumanoUSD": 760,
        "pctAutomatizableIA": 70,
        "tiempoMVPdias": 12
      }
    },
    {
      "id": "r1-02516cff",
      "ronda": 1,
      "autor": "Diseñador experto",
      "autorKey": "disenador",
      "v1": {
        "titulo": "Media Kit Automático (generador de preset por IA aplicado a personas, no a marcas)"
      },
      "mejoraV2": "Test mejoras",
      "mejoraV3": "Se reemplazaron los placeholders de la v2 (\"Test dolor/descripcion/solucion/encaje\") por contenido real y específico; se acotó el MVP a reusar el storefront existente en vez de construir un builder nuevo, bajando esfuerzo; se ajustó honestamente el score de impacto/confianza a la baja porque el dolor, aunque real, hoy tiene una solución manual aceptable (Canva) y el público dispuesto a pagar por esto solo es un subconjunto (creadores con volumen de marcas), no todo el segmento.",
      "final": {
        "titulo": "Media Kit para creadores (landing pública + rate card)",
        "segmento": "influencers",
        "categoriaDolor": "entregables_visuales",
        "dolor": "Influencers y CMs freelance necesitan mandar seguido un \"media kit\" profesional (métricas, audiencia, portfolio, tarifas) a marcas para cerrar canjes/pauta, y hoy lo arman a mano en Canva/PPT: se desactualiza rápido, no tienen un link único para compartir y actualizarlo cuesta tiempo cada vez que cambian sus números o tarifas.",
        "descripcion": "Se detecta que el dolor es real pero de intensidad media: no es un problema que impida operar (se resuelve hoy \"a mano\" con Canva), sino uno de fricción recurrente y de imagen profesional. Es pagable como feature dentro de un plan existente o como upsell de bajo ticket, no tanto como producto standalone de alto precio, salvo para creadores con volumen de marcas que gestionan (macro-influencers, agencias de talentos). El público objetivo real y dispuesto a pagar es más acotado que \"todo influencer\".",
        "solucion": "MVP: una landing pública tipo \"storefront\" (reutilizando el motor de vidrieras multi-tenant del ERP) por creador, con secciones fijas: bio + foto, métricas de audiencia (carga manual simple, sin integrarse a APIs de redes en el MVP), portfolio de trabajos/marcas, rate card editable y botón de contacto directo por WhatsApp. Self-serve: el creador edita desde un panel simple y el cambio se refleja al instante en su link único; exportable a PDF con un clic para mandarlo por mail cuando la marca lo pide así.",
        "encajeGSG": "Reutiliza el storefront público multi-tenant y su branding por tenant ya existentes (no se construye un builder de landings de cero); apalanca el Generador de Preset por IA para poblar bio/portfolio inicial desde Instagram si el creador autoriza; WhatsApp-first para el botón de contacto, coherente con el resto del ERP. Requiere solo un blueprint nuevo de rubro \"media kit\" sobre la infraestructura existente.",
        "mejorasAplicadas": "Se reemplazaron los placeholders de la v2 (\"Test dolor/descripcion/solucion/encaje\") por contenido real y específico; se acotó el MVP a reusar el storefront existente en vez de construir un builder nuevo, bajando esfuerzo; se ajustó honestamente el score de impacto/confianza a la baja porque el dolor, aunque real, hoy tiene una solución manual aceptable (Canva) y el público dispuesto a pagar por esto solo es un subconjunto (creadores con volumen de marcas), no todo el segmento.",
        "impacto": 5,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 22,
        "costoHumanoUSD": 450,
        "pctAutomatizableIA": 75,
        "tiempoMVPdias": 6
      }
    },
    {
      "id": "r1-d0ac604f",
      "ronda": 1,
      "autor": "Diseñador experto",
      "autorKey": "disenador",
      "v1": {
        "titulo": "Reporte mensual de resultados para marcas (community manager)"
      },
      "mejoraV2": "Se afiló el dolor agregando la consecuencia real (el cliente duda de seguir pagando si el informe no llega), se sacó jerga de \"insights accionables\" y se cambió a tono criollo explícito en las conclusiones IA, se resolvió la ambigüedad de \"carga o pega\" definiendo v1 sin integración a APIs de redes (menos costo/fragilidad, integración queda para v2), y se hizo explícito que el envío al cliente también puede automatizarse por WhatsApp, no solo el recordatorio al CM.",
      "mejoraV3": "Se mantuvo el ajuste ya hecho (dolor con consecuencia real de churn, tono criollo explícito, v1 sin integración a APIs de redes) y se recalibraron los números con más honestidad: el dolor es real pero hay alternativas gratuitas ya usadas por CMs (Canva, Google Data Studio/Looker Studio, plantillas de Notion) que compiten por el mismo problema, así que la disposición a pagar extra por esto specific módulo — más allá de que ya pagan el ERP — no está probada; se bajó confianza e impacto en consecuencia y se ajustó el esfuerzo/horas reflejando que aun con reuso alto hay trabajo real de UI (formulario, blueprint de PDF, lógica de comparativa mes a mes) y de testing multi-tenant.",
      "final": {
        "titulo": "El informe que se manda solo (y no da vergüenza mandarlo)",
        "segmento": "community_managers",
        "dolor": "Todo CM con 3 a 8 cuentas llega al día 5 del mes armando el informe a las apuradas en Canva copiando números a mano; si un mes no sale (viaje, enfermedad, olvido) el cliente empieza a dudar si vale la pena seguir pagando.",
        "categoriaDolor": "reportes_metricas",
        "descripcion": "Módulo del ERP donde el CM carga una vez por mes las métricas por cliente (alcance, seguidores, engagement, ventas si aplica) vía formulario simple, y el sistema arma solo un PDF con el branding de cada marca cliente, gráfico de evolución, comparativa contra el mes anterior y un párrafo de conclusiones en criollo generado por IA. El día 1 de mes llega un recordatorio por WhatsApp al CM para cargar los datos, y una vez cargados el sistema puede mandar el PDF directo al cliente final por WhatsApp o mail.",
        "solucion": "Nuevo tipo de documento sobre el motor de PDF con branding por tenant que el ERP ya usa para presupuestos/facturas. Carga 100% manual vía formulario (sin integración a APIs de Meta/TikTok en v1, para no sumar costo ni fragilidad — se evalúa en v2 solo si hay tracción paga). Disparo automático reutilizando el motor de recordatorios existente, envío final vía la integración de WhatsApp ya montada.",
        "encajeGSG": "Reuso alto: motor de documentos con marca (facturas/presupuestos) extendido a \"informe\"; motor de recordatorios ya construido dispara el aviso de carga; integración WhatsApp ya activa entrega el PDF. No requiere infraestructura nueva, solo un blueprint de documento nuevo y un formulario de carga — encaja sin tocar core.",
        "mejorasAplicadas": "Se mantuvo el ajuste ya hecho (dolor con consecuencia real de churn, tono criollo explícito, v1 sin integración a APIs de redes) y se recalibraron los números con más honestidad: el dolor es real pero hay alternativas gratuitas ya usadas por CMs (Canva, Google Data Studio/Looker Studio, plantillas de Notion) que compiten por el mismo problema, así que la disposición a pagar extra por esto specific módulo — más allá de que ya pagan el ERP — no está probada; se bajó confianza e impacto en consecuencia y se ajustó el esfuerzo/horas reflejando que aun con reuso alto hay trabajo real de UI (formulario, blueprint de PDF, lógica de comparativa mes a mes) y de testing multi-tenant.",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 28,
        "costoHumanoUSD": 550,
        "pctAutomatizableIA": 75,
        "tiempoMVPdias": 6
      }
    },
    {
      "id": "r1-c52f8e05",
      "ronda": 1,
      "autor": "Diseñador experto",
      "autorKey": "disenador",
      "v1": {
        "titulo": "Calendario editorial con aprobación por WhatsApp"
      },
      "mejoraV2": "Se precisó el dolor agregando el disparador concreto (cliente cambia de opinión) y el caso de uso multi-cliente del CM. Se concretó la solución técnica: la pieza es un registro del mismo esquema que usa turnos (no una tabla nueva), y se detalló qué es exactamente lo nuevo a construir (campo de adjunto + mapeo de botones a 3 estados) versus lo que ya existe. Se eliminó la vaguedad de \"reutiliza el módulo de agenda\" precisando qué se comparte y qué no.",
      "mejoraV3": "Se ajustó el MVP a 3 piezas concretas y acotadas (campo adjunto, plantilla aprobada por Meta, webhook de mapeo) en vez de \"reutiliza el módulo\". Se bajó la confianza y el impacto respecto de v2 porque el dolor es real pero de nivel \"feature diferenciador\", no un producto que un CM pague solo por esto — vende mejor empaquetado como upgrade del ERP existente que como SKU aparte. Se marcó el punto de fricción no automatizable: la aprobación de plantillas con botones ante Meta/WhatsApp Business API tarda días y no depende de IA ni de GSG.",
      "final": {
        "titulo": "Calendario editorial con aprobación por WhatsApp",
        "segmento": "community_managers",
        "dolor": "La aprobación de piezas con el cliente vive en mensajes sueltos y capturas de WhatsApp: no hay registro de qué se aprobó ni cuándo, y el CM termina publicando piezas no confirmadas o discutiendo \"vos me dijiste que sí\" cuando el cliente cambia de opinión.",
        "categoriaDolor": "organizacion_agenda",
        "descripcion": "Grilla mensual de piezas por cliente (tipo Instagram) donde el CM carga imagen/copy/fecha de publicación, reutilizando el mismo registro de turno del motor de agenda (fecha+estado+cliente) pero con estado de contenido en vez de estado de servicio. Al cargar la pieza se dispara un WhatsApp al contacto con la imagen y botones Aprobar/Pedir cambios; la respuesta actualiza el estado (pendiente/aprobado/a corregir) con timestamp, y si pide cambios el comentario queda adjunto como hilo en la pieza. Sirve para 1 CM con varias cuentas de cliente en simultáneo, cada una con su calendario y su hilo de aprobación propios.",
        "solucion": "MVP acotado a 3 piezas nuevas sobre lo existente: (1) campo de adjunto de imagen + tipo \"contenido\" en el registro de turno/slot, (2) plantilla de WhatsApp con botones de respuesta rápida aprobada ante Meta (usa el mismo número/integración ya operativa para recordatorios), (3) webhook que mapea la respuesta del botón a los 3 estados y loguea timestamp+mensaje como evidencia. No se construye chat nuevo, tabla nueva ni backend nuevo — se extiende el objeto turno y se cambia la plantilla del canal existente.",
        "encajeGSG": "Reutiliza el motor de agenda/turnos (mismo patrón slot-fecha-estado-cliente) y el canal WhatsApp conversacional ya integrado en el ERP/Agencia Digital; lo único genuinamente nuevo es el campo de adjunto, la plantilla con botones (sujeta a aprobación de Meta, no instantánea) y el mapeo de respuestas a estados.",
        "mejorasAplicadas": "Se ajustó el MVP a 3 piezas concretas y acotadas (campo adjunto, plantilla aprobada por Meta, webhook de mapeo) en vez de \"reutiliza el módulo\". Se bajó la confianza y el impacto respecto de v2 porque el dolor es real pero de nivel \"feature diferenciador\", no un producto que un CM pague solo por esto — vende mejor empaquetado como upgrade del ERP existente que como SKU aparte. Se marcó el punto de fricción no automatizable: la aprobación de plantillas con botones ante Meta/WhatsApp Business API tarda días y no depende de IA ni de GSG.",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 4,
        "horasHumanas": 32,
        "costoHumanoUSD": 450,
        "pctAutomatizableIA": 70,
        "tiempoMVPdias": 10
      }
    },
    {
      "id": "r1-0101ab06",
      "ronda": 1,
      "autor": "Diseñador experto",
      "autorKey": "disenador",
      "v1": {
        "titulo": "Cobro y factura fácil para freelancers creativos (monotributistas)"
      },
      "mejoraV2": "Separé el dolor en dos frentes concretos (perseguir la seña vs. no facturar) y até el segundo a una consecuencia de negocio real (recategorización/exclusión de monotributo), lo que sube la urgencia percibida. Precisé la solución técnica: especifiqué que el webhook de MP que dispara la factura YA existe en el ERP (no es integración nueva), acoté el desarrollo real al onboarding liviano de monotributista, y sumé un entregable secundario (control de tope de categoría) que agrega valor sin costo extra. Recorté humo del encaje GSG dejando explícito qué es reuso puro y qué es lo único nuevo a construir.",
      "mejoraV3": "Validé que el dolor es real pero ajusté la confianza de pago a la baja: un freelancer solo (sin equipo) es muy sensible al precio y hoy resuelve esto \"a mano\" gratis, aunque mal; el gancho de venta real es el riesgo de recategorización de monotributo, no la comodidad del link. Recorté el MVP a lo mínimo vendible (onboarding + link + historial de tope), sin agregar features de agenda/catálogo que no aportan a este dolor puntual. Bajé impacto y confianza a un número más honesto dado el ticket bajo y el mercado atomizado; mantuve esfuerzo bajo porque el reuso es real y verificable en el ERP actual.",
      "final": {
        "titulo": "Cobrá Fácil: link de seña + factura ARCA automática para freelancers creativos",
        "segmento": "creativos",
        "dolor": "El fotógrafo/diseñador/editor freelance monotributista pierde plata y tiempo en dos frentes: persigue por WhatsApp a cada cliente para que pague la seña antes de arrancar el laburo, y factura tarde o no factura porque generar el comprobante en ARCA a mano le resulta engorroso, arrastrando atraso en su categoría de monotributo con riesgo de recategorización o exclusión.",
        "categoriaDolor": "cobros_facturacion",
        "descripcion": "Link único de \"presupuesto + cobro\" para freelancer individual (sin negocio ni equipo): carga concepto/monto/% de seña desde el celular, el sistema genera el link de Mercado Pago y lo manda por WhatsApp con un tap. Al confirmarse el pago (webhook ya existente en el ERP), se dispara automáticamente la factura ARCA a nombre del cliente final y se devuelve el PDF/CAE por el mismo chat. Sin agenda, catálogo ni comisiones: solo presupuesto → cobro → comprobante, más un mini historial para controlar el tope de facturación de su categoría de monotributo.",
        "solucion": "Reempaquetar el Plugin ARCA + la integración Mercado Pago (webhook de acreditación que YA dispara facturación en el ERP) + el motor de presupuestos, como producto standalone de un solo usuario. Único desarrollo real: onboarding liviano de alta de monotributista (CUIT, punto de venta, condición IVA) en 2 pasos, generador de link compartible por WhatsApp, y la vista de historial/tope de categoría. Todo lo demás es reconfiguración de módulos ya construidos y probados en sandbox.",
        "encajeGSG": "Reuso casi total de infraestructura existente (Plugin ARCA standalone, integración MP con webhook, motor de comprobantes del ERP); no hay backend nuevo, solo una capa de UI/onboarding single-user sobre APIs ya expuestas.",
        "mejorasAplicadas": "Validé que el dolor es real pero ajusté la confianza de pago a la baja: un freelancer solo (sin equipo) es muy sensible al precio y hoy resuelve esto \"a mano\" gratis, aunque mal; el gancho de venta real es el riesgo de recategorización de monotributo, no la comodidad del link. Recorté el MVP a lo mínimo vendible (onboarding + link + historial de tope), sin agregar features de agenda/catálogo que no aportan a este dolor puntual. Bajé impacto y confianza a un número más honesto dado el ticket bajo y el mercado atomizado; mantuve esfuerzo bajo porque el reuso es real y verificable en el ERP actual.",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 50,
        "costoHumanoUSD": 900,
        "pctAutomatizableIA": 85,
        "tiempoMVPdias": 12
      }
    },
    {
      "id": "r1-b9e0b50e",
      "ronda": 1,
      "autor": "Diseñador experto",
      "autorKey": "disenador",
      "v1": {
        "titulo": "Portfolio-vidriera con captación de leads para diseñadores y editores"
      },
      "mejoraV2": "Reemplacé \"formulario que cae al WhatsApp\" genérico por un flujo concreto de 3 campos con mensaje precargado (reduce fricción real, no solo teórica); until until until until until until until until until until until until until until until until until until until until until until until until until agregué el ángulo de precios en pesos con actualización rápida por inflación (dolor real de tarifas argentinas) y until la posibilidad de linkear seña/anticipo vía Mercado Pago, apalancando un módulo GSG que la v1 no mencionaba; until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until</cuantifiqué el ahorro de tiempo (15-20 min por consulta) para concretar el dolor.",
      "mejoraV3": "Verifiqué en el código (`grep` sobre `src/`) que `whatsapp-cta.tsx`, el storefront y los blueprints de rubro ya existen, así que el encaje GSG pasó de \"afirmado\" a \"confirmado en repo\" y el esfuerzo bajó en consecuencia (es extender un componente, no crearlo). Ajusté los scores a la baja con honestidad: el ticket promedio de un freelance creativo argentino es chico y muchos ya resuelven esto gratis con Linktree/Notion, así que la confianza de pago y el impacto de negocio son moderados, no altos.",
      "final": {
        "titulo": "Vidriera-portfolio con botón \"Pedir presupuesto por WhatsApp\" para creativos freelance",
        "segmento": "creativos",
        "dolor": "El freelance creativo argentino (diseñador, editor, fotógrafo) no tiene tarifario público ni forma prolija de cotizar, así que cada DM nuevo arranca en \"¿cuánto cobrás?\" y \"¿tenés portfolio?\": pierde 15-20 min por consulta repitiendo lo mismo, con precios desactualizados por la inflación, y sin dejar por escrito seña/condiciones antes de arrancar.",
        "categoriaDolor": "venta_captacion",
        "descripcion": "Vidriera pública (mismo storefront del ERP, `src/app/tienda/Storefront.tsx` + `src/tenants/storefront.ts`) reconfigurada como portfolio: catálogo de servicios en pesos (\"desde $X\", editable en 2 clics), galería por categoría y testimonios. Botón central \"Pedir presupuesto por WhatsApp\" (reusa el patrón ya existente `src/components/whatsapp-cta.tsx`) con un formulario de 3 campos (tipo de trabajo, fecha estimada, referencia) que arma el mensaje precargado. Precio y condiciones de seña visibles de entrada, filtrando consultas que no pueden pagar la tarifa.",
        "solucion": "Blueprint de rubro nuevo sobre el storefront existente: \"productos\"=servicios creativos con precio \"desde\", \"categorías\"=tipo de servicio, \"variantes\"=paquetes básico/premium. El componente `whatsapp-cta.tsx` ya resuelve el link precargado a WhatsApp — solo se extiende el formulario a 3 campos y se agrega el copy de precios/seña al layout de `Storefront.tsx`. El Generador de Preset IA puebla el catálogo desde el Instagram/web del creativo. Si cobra por MP, el mismo storefront linkea el botón de seña a un link de pago MP ya soportado por el módulo de cobros (`CobrosSection.tsx`).",
        "encajeGSG": "Reutilización casi total: storefront brandeable + Generador de Preset IA + `whatsapp-cta.tsx` + módulo de cobros MP ya existen en el repo (confirmado por grep). El desarrollo real es acotado: un blueprint de rubro \"creativos/freelance\" y extender el CTA de WhatsApp a 3 campos con precarga de mensaje — no hay backend nuevo ni infraestructura adicional.",
        "mejorasAplicadas": "Verifiqué en el código (`grep` sobre `src/`) que `whatsapp-cta.tsx`, el storefront y los blueprints de rubro ya existen, así que el encaje GSG pasó de \"afirmado\" a \"confirmado en repo\" y el esfuerzo bajó en consecuencia (es extender un componente, no crearlo). Ajusté los scores a la baja con honestidad: el ticket promedio de un freelance creativo argentino es chico y muchos ya resuelven esto gratis con Linktree/Notion, así que la confianza de pago y el impacto de negocio son moderados, no altos.",
        "impacto": 5,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 28,
        "costoHumanoUSD": 420,
        "pctAutomatizableIA": 80,
        "tiempoMVPdias": 6
      }
    },
    {
      "id": "r1-29f48098",
      "ronda": 1,
      "autor": "Analista de mercado local",
      "autorKey": "mercado",
      "v1": {
        "titulo": "Facturador automático WhatsApp→ARCA para freelancers"
      },
      "mejoraV2": "Se acotó el \"parser de lenguaje natural\" a reglas/keywords para bajar el costo y la incertidumbre técnica (la IA queda solo como refuerzo opcional en casos ambiguos, no como dependencia crítica); se precisó el mecanismo de alerta (80% del techo, dato semi-estático mantenido manualmente) para que no suene a feature mágica; se agregó el costo real de infraestructura (WhatsApp Business API) que la v1 omitía; se eliminó la vaguedad de \"arma y emite\" especificando el flujo end-to-end (payload → ARCA → MP → PDF por chat).",
      "mejoraV3": "Se valida que el dolor real y pagable no es \"facturar\" (es gratis y obligatorio) sino el ahorro de tiempo/fricción y el control preventivo del techo de categoría, que sí es un problema con costo económico concreto (recategorización) y por tanto vendible como suscripción chica. Se bajó confianza e impacto a un nivel honesto dado que el universo de creativos monotributistas que factura por transferencia sin comprobante es un nicho, no masivo, y el ticket dispuesto a pagar es bajo (suscripción tipo $3-5 mil ARS/mes). Se mantiene el MVP acotado a reglas/keywords tal como en v2, sin agregar alcance nuevo.",
      "final": {
        "categoriaDolor": "cobros_facturacion",
        "confianza": 6,
        "costoHumanoUSD": 1300,
        "descripcion": "El monotributista creativo (editor, diseñador, fotógrafo, freelancer de contenido) cobra por transferencia sin emitir comprobante porque facturar vía portal ARCA implica salir de su flujo de trabajo (WhatsApp) y perder tiempo. Sin ese hábito, pierde trazabilidad de ingresos y puede recategorizarse de monotributo sin darse cuenta hasta que el contador se lo dice tarde, con la multa ya encima. El MVP resuelve esto con un webhook de WhatsApp con parser por reglas/keywords (no NLP costoso) que dispara el módulo ARCA/MP ya existente en el ERP, emite la factura C, adjunta el link de cobro y devuelve el PDF por el mismo chat, acumulando el total del año contra el techo de categoría vigente para avisar al 80%.",
        "dolor": "El monotributista creativo cobra por transferencia sin emitir comprobante porque el portal ARCA no está integrado a su flujo (WhatsApp), perdiendo trazabilidad de ingresos y arriesgando recategorización de monotributo sin aviso previo.",
        "encajeGSG": "Reutiliza tal cual el módulo ARCA/AFIP sandbox y la integración Mercado Pago que el ERP ya tiene operativos, corriendo sobre un tenant de una sola persona (el mismo motor multi-tenant). Se apalanca el enfoque WhatsApp-first que ya es pilar de producto GSG, sin integraciones externas nuevas ni licencias adicionales fuera de la API de WhatsApp Business ya contratada.",
        "esfuerzo": 4,
        "horasHumanas": 55,
        "impacto": 5,
        "mejorasAplicadas": "Se valida que el dolor real y pagable no es \"facturar\" (es gratis y obligatorio) sino el ahorro de tiempo/fricción y el control preventivo del techo de categoría, que sí es un problema con costo económico concreto (recategorización) y por tanto vendible como suscripción chica. Se bajó confianza e impacto a un nivel honesto dado que el universo de creativos monotributistas que factura por transferencia sin comprobante es un nicho, no masivo, y el ticket dispuesto a pagar es bajo (suscripción tipo $3-5 mil ARS/mes). Se mantiene el MVP acotado a reglas/keywords tal como en v2, sin agregar alcance nuevo.",
        "pctAutomatizableIA": 75,
        "segmento": "creativos",
        "solucion": "MVP mínimo: (1) webhook de WhatsApp Business API con parser por patrones fijos (\"facturale a [cliente] $[monto] por [concepto]\"), sin IA en el camino crítico; (2) reutilización directa del módulo ARCA/AFIP sandbox y de la integración MP ya existentes para emitir factura C y generar el link de cobro; (3) tabla simple de acumulado anual por tenant contra el techo oficial de categoría de monotributo (dato estático, actualizado a mano 1-2 veces por año) con alerta al 80%; (4) devolución del PDF y el link por el mismo chat. No se construye motor fiscal nuevo ni NLP; la IA solo asiste como refuerzo opcional en casos ambiguos, a costo marginal.",
        "tiempoMVPdias": 12,
        "titulo": "Facturador WhatsApp→ARCA con alerta de techo de monotributo para freelancers creativos"
      }
    },
    {
      "id": "r1-e10c2356",
      "ronda": 1,
      "autor": "Analista de mercado local",
      "autorKey": "mercado",
      "v1": {
        "titulo": "Media kit + catálogo de servicios como vidriera pública (storefront de influencer)"
      },
      "mejoraV2": "Se concretó el dolor de venta (mostrar tarifas) sumando el dolor de cobro (formalizar el pago), que v1 no atacaba. Se especificó el flujo técnico completo cotizar→aceptar→cobrar→confirmar reutilizando POS/pedidos + webhook de MP existentes, en vez de dejar la vidriera como solo informativa. Se eliminó la vaguedad de \"botón de WhatsApp/MP para reservar o cobrar\" (v1) reemplazándola por un mecanismo concreto: orden de venta + preferencia de pago + webhook + notificación automática, todo sobre módulos ya existentes del ERP.",
      "mejoraV3": "Se ajustó la confianza a la baja frente a v2: el dolor de \"vidriera de tarifas\" ya está bien cubierto gratis por Linktree/Stan Store/Beacons, así que lo realmente vendible y diferencial es el tramo cobro-con-comprobante-automático, no el media kit en sí — el pitch y el MVP se recortan a ese diferencial. Se mantiene el flujo técnico concreto (orden de venta + preferencia MP + webhook + WhatsApp) por ser 100% reuso, pero se baja el esfuerzo estimado porque no hay UI de pago nueva, solo blueprint y mapeo. Se corrige el costo humano para reflejar que el trabajo de IA (generación del preset, copy, mapeo de campos) es $0 y solo cuentan horas de QA del flujo de cobro real con MP (webhooks son la parte más propensa a fallar silenciosamente) y horas de soporte comercial para validar que un creador pague por esto.",
      "final": {
        "titulo": "Media Kit vivo + storefront de cobro para creadores (blueprint \"influencer\" sobre el motor de tenants)",
        "segmento": "influencers",
        "dolor": "El creador cotiza por DM/PDF desactualizado y, cuando la marca acepta, cobrar la seña o el total también es manual (transferencia + captura por WhatsApp), sin comprobante ni registro — pierde tiempo, consistencia de precio y a veces el cobro no queda formalizado.",
        "categoriaDolor": "venta_captacion",
        "descripcion": "Storefront público tipo \"media kit vivo\" (mismo motor de vidriera multi-tenant del ERP) con paquetes de contenido como catálogo con precio y disponibilidad. La diferencia frente a un media kit estático: el paquete corre un flujo completo cotizar → aceptar → cobrar, con botón \"Reservar\" que genera una orden de venta y una preferencia de pago de Mercado Pago (seña o total), confirmada automáticamente por webhook, sin que el creador tenga que hacer seguimiento manual. El preset de marca se genera por IA desde el Instagram del creador, con autorización explícita registrada.",
        "solucion": "Blueprint de rubro \"creador/influencer\" sobre el motor de storefronts existente: (1) preset IA arma la grilla de tarifas inicial desde Instagram/web; (2) paquetes de contenido como ítems del catálogo ya existente (sin módulo nuevo); (3) botón \"Reservar\" crea orden de venta (reutiliza POS/pedidos) + preferencia de pago MP asociada; (4) webhook de MP ya operativo confirma el pago, pasa el pedido a \"confirmado\" y dispara WhatsApp automático con comprobante a creador y marca. MVP acotado: 1 blueprint + mapeo paquete→ítem de catálogo + template de storefront \"media kit\", sin tocar pagos/pedidos/WhatsApp que ya funcionan para otros tenants.",
        "encajeGSG": "Cero infraestructura nueva: reutiliza storefront multi-tenant, generador de preset IA, catálogo/POS de pedidos, checkout+webhook de Mercado Pago y notificaciones WhatsApp ya operativos en el ERP. Lo único nuevo es config (branding/copy/campos de \"creador\" + mapeo de entidades), no desarrollo de plataforma.",
        "mejorasAplicadas": "Se ajustó la confianza a la baja frente a v2: el dolor de \"vidriera de tarifas\" ya está bien cubierto gratis por Linktree/Stan Store/Beacons, así que lo realmente vendible y diferencial es el tramo cobro-con-comprobante-automático, no el media kit en sí — el pitch y el MVP se recortan a ese diferencial. Se mantiene el flujo técnico concreto (orden de venta + preferencia MP + webhook + WhatsApp) por ser 100% reuso, pero se baja el esfuerzo estimado porque no hay UI de pago nueva, solo blueprint y mapeo. Se corrige el costo humano para reflejar que el trabajo de IA (generación del preset, copy, mapeo de campos) es $0 y solo cuentan horas de QA del flujo de cobro real con MP (webhooks son la parte más propensa a fallar silenciosamente) y horas de soporte comercial para validar que un creador pague por esto.",
        "impacto": 6,
        "confianza": 5,
        "esfuerzo": 3,
        "horasHumanas": 14,
        "costoHumanoUSD": 140,
        "pctAutomatizableIA": 85,
        "tiempoMVPdias": 5
      }
    },
    {
      "id": "r1-a6fb749b",
      "ronda": 1,
      "autor": "Analista de mercado local",
      "autorKey": "mercado",
      "v1": {
        "titulo": "Agenda + cobro de sesiones de contenido para creativos (fotógrafos, editores, diseñadores)"
      },
      "mejoraV2": "Se movió la categoría de \"organización de agenda\" a \"cobros/facturación\" porque el dolor real y diferencial es el cobro sin registro, no la agenda en sí. Se concretó la solución en 4 piezas puntuales (blueprint, RBAC, regla de automatización \"entregado→cobra saldo\", vista simplificada) en vez de una descripción genérica de \"reconfiguración\". Se agregó el enganche con el Generador de Preset por IA para alta de cliente, y se explicitó que queda registro contable/exportable, atacando el sub-dolor de declarar ingresos que la v1 mencionaba pero no resolvía.",
      "mejoraV3": "Se validó que el dolor y el pagador son reales para el segmento (freelance visual argentino que ya usa MP y WhatsApp) pero se corrigió el impacto a la baja (6, no producto masivo por sí solo: ticket bajo, es más un add-on/upsell que una nueva línea grande) y la confianza a 7 (falta validar con 1-2 clientes piloto si pagarían aparte o lo esperan incluido). Se recalibró el esfuerzo a 3 (reutilización casi total del motor existente) y las horas humanas a 20 (config de blueprint, ajuste de la regla de automatización, QA del flujo seña→entrega→saldo, sin desarrollo de backend), con costo humano+infra ~USD 380 y sin infra paga adicional porque corre sobre Neon/Vercel ya contratados.",
      "final": {
        "categoriaDolor": "cobros_facturacion",
        "confianza": 7,
        "costoHumanoUSD": 380,
        "descripcion": "Blueprint \"freelancer solo\" sobre el motor de agenda+POS+WhatsApp+Mercado Pago que el ERP ya tiene en producción: catálogo de servicios de contenido, turnero de un solo profesional sin choque de horarios, recordatorio automático 24hs antes, cobro de seña al confirmar turno y disparo automático del link de cobro del saldo apenas el trabajo se marca \"entregado\". Todo movimiento queda en el POS del tenant, exportable por cliente/mes para declarar ingresos. No requiere backend nuevo: es blueprint + RBAC de un solo usuario + una regla de automatización sobre el POS existente + una vista simplificada \"mis turnos / pendientes de cobro\".",
        "dolor": "El freelance visual (fotógrafo/editor/diseñador) coordina y cobra a mano por WhatsApp/transferencia: turnos que se pisan, seña sin registro (no sabe qué cobró de cada cliente a fin de mes) y tiene que perseguir el cobro del saldo final por chat en vez de que se dispare solo al entregar el trabajo.",
        "encajeGSG": "Reutiliza 100% el motor multi-tenant de agenda/recordatorios WhatsApp/Mercado Pago ya productivo (mismo usado en CH Estética): sin backend nuevo, solo blueprint de rubro + branding + una regla de automatización POS (\"entregado\" dispara cobro de saldo) + RBAC colapsado a un usuario. Alta rápida vía Generador de Preset por IA (el creador da su Instagram/web).",
        "esfuerzo": 3,
        "horasHumanas": 20,
        "impacto": 6,
        "mejorasAplicadas": "Se validó que el dolor y el pagador son reales para el segmento (freelance visual argentino que ya usa MP y WhatsApp) pero se corrigió el impacto a la baja (6, no producto masivo por sí solo: ticket bajo, es más un add-on/upsell que una nueva línea grande) y la confianza a 7 (falta validar con 1-2 clientes piloto si pagarían aparte o lo esperan incluido). Se recalibró el esfuerzo a 3 (reutilización casi total del motor existente) y las horas humanas a 20 (config de blueprint, ajuste de la regla de automatización, QA del flujo seña→entrega→saldo, sin desarrollo de backend), con costo humano+infra ~USD 380 y sin infra paga adicional porque corre sobre Neon/Vercel ya contratados.",
        "pctAutomatizableIA": 85,
        "segmento": "creativos",
        "solucion": "(1) Blueprint de rubro \"contenido freelance\" con catálogo propio (sesión de fotos, edición, kit de diseño); (2) RBAC colapsado a un solo profesional, sin choque de turnos; (3) regla de automatización agregada al POS existente: estado \"entregado\" dispara el link de cobro del saldo (Mercado Pago o transferencia con conciliación); (4) vista simplificada \"mis próximos turnos + pendientes de cobro\" reemplazando el dashboard multi-staff. Cero backend nuevo.",
        "tiempoMVPdias": 5,
        "titulo": "Agenda \"una sola persona\" con seña por Mercado Pago y saldo automático contra entrega — para fotógrafos/editores/diseñadores freelance"
      }
    },
    {
      "id": "r1-b208e0b5",
      "ronda": 1,
      "autor": "Analista de mercado local",
      "autorKey": "mercado",
      "v1": {
        "titulo": "Reporte automático de resultados para clientes de Community Manager"
      },
      "mejoraV2": "Afiné el dolor: el problema real no es \"armar el reporte\" sino que llega desacoplado del cobro, dando pie a discutir precio. Cambié PDF por link web (más liviano, reusa el patrón de storefront ya existente). Agregué un roadmap de 2 fases para no prometer integración de métricas reales de entrada, y eliminé humo dejando la propuesta anclada 100% en componentes que el ERP ya tiene construidos.",
      "mejoraV3": "Bajé confianza e impacto a niveles honestos: es una mejora incremental sobre un flujo existente, no un producto nuevo con demanda propia comprobada — el dolor es real pero blando (paliativo de fricción de cobro, no ausencia de solución). Recorté el MVP a modo 100% manual (el CM tildea entregables) eliminando cualquier promesa de integración con APIs de redes, que quedó explícitamente fuera de este alcance. Ajusté horas/costo a la baja porque es en esencia un template de mensaje + una vista pública, ambos patrones ya existentes en el ERP.",
      "final": {
        "categoriaDolor": "reportes_metricas",
        "confianza": 6,
        "costoHumanoUSD": 180,
        "descripcion": "Reporte mensual auto-generado como página web liviana (no PDF), con el branding del propio CM, que resume publicado vs. planificado y 2-3 líneas de \"qué sigue\" redactadas por IA a partir de lo que el CM ya carga en el catálogo/servicios del ERP. Lo diferencial no es el reporte —eso lo resuelven templates gratis en Canva/Notion— sino que se manda FUSIONADO en el mismo WhatsApp que el link de cobro de Mercado Pago: primero la prueba del trabajo, inmediatamente después el botón de pago, sin salto de app ni de contexto. Arranca en modo manual (el CM tildea qué entregó ese mes) para no prometer integración con redes que todavía no existe.",
        "dolor": "El CM freelance o de agencia chica pierde horas armando reportes sueltos en Canva, y aun con reporte el cliente demora el pago porque llega separado del cobro: no hay conexión visible entre \"esto hice\" y \"esto debés\", así que se discute precio o se atrasa la transferencia.",
        "encajeGSG": "Reutiliza el motor de recordatorios/cobros por WhatsApp y el link de pago de Mercado Pago que el ERP YA dispara — solo se agrega un template de mensaje nuevo y una vista pública tipo storefront (mismo patrón de las vidrieras por tenant) para alojar el reporte. Redacción del resumen es IA a costo $0. No hay pasarela, mensajería ni infraestructura nueva que construir.",
        "esfuerzo": 3,
        "horasHumanas": 14,
        "impacto": 5,
        "mejorasAplicadas": "Bajé confianza e impacto a niveles honestos: es una mejora incremental sobre un flujo existente, no un producto nuevo con demanda propia comprobada — el dolor es real pero blando (paliativo de fricción de cobro, no ausencia de solución). Recorté el MVP a modo 100% manual (el CM tildea entregables) eliminando cualquier promesa de integración con APIs de redes, que quedó explícitamente fuera de este alcance. Ajusté horas/costo a la baja porque es en esencia un template de mensaje + una vista pública, ambos patrones ya existentes en el ERP.",
        "pctAutomatizableIA": 85,
        "segmento": "community_managers",
        "solucion": "Extender el motor de recordatorios WhatsApp existente con un template \"reporte + cobro\": el mensaje mensual incluye un link a una página pública (patrón storefront) generada por IA con lo cargado en el catálogo del CM (servicios/contenido entregado) más una síntesis breve en tono cercano, seguido del link de pago de Mercado Pago en el mismo mensaje. MVP 100% manual (sin scraping de redes); una fase futura opcional conectaría métricas reales vía API si el CM lo pide.",
        "tiempoMVPdias": 5,
        "titulo": "El link de cobro que también rinde cuentas"
      }
    },
    {
      "id": "r1-6d9e91e2",
      "ronda": 1,
      "autor": "Analista de mercado local",
      "autorKey": "mercado",
      "v1": {
        "titulo": "Gestor de canjes y colaboraciones con marcas (CRM liviano para influencers)"
      },
      "mejoraV2": "Concreté el dolor con síntomas medibles (perder la próxima colaboración, canjes no cobrados) en vez de describirlo en general. Bajé el \"recordatorio a la marca\" y el volumen de features a un MVP acotado (2 campos + reuso de Turnos, sin pantallas nuevas), separando el upsell de checkout como fuera de alcance del MVP para no inflar el scope. Until now era una reasignación de campos difusa; ahora especifico exactamente qué 2 campos se agregan, qué modelo se reutiliza como qué, y qué reportes concretos hacen falta, para que quede claro que el costo de desarrollo es bajo y verificable.",
      "mejoraV3": "Sobre v2: acoté aún más el scope de reportes (2, no 3, para el MVP mínimo vendible), until now el recordatorio a la marca quedaba implícito y ahora lo dejo explícitamente fuera del MVP (nice-to-have post-venta) para no inflar horas, y calibré el scoring con honestidad: el dolor es real pero la disposición a pagar en este micro-segmento es incierta (muchos usan Notion/planillas gratis), lo que baja confianza e impacto respecto de una lectura optimista.",
      "final": {
        "titulo": "Cartera de Marcas: CRM de canjes y colaboraciones (preset del módulo Clientes+Turnos del ERP)",
        "segmento": "influencers",
        "dolor": "El influencer chico/mediano gestiona canjes y colaboraciones por WhatsApp sin sistema: no tiene un lugar único para ver qué marcas propusieron qué, qué aceptó, qué debe entregar y cuándo. Consecuencia medible: entregas tardías (la marca no vuelve a convocar) y canjes que se \"pierden\" sin cobrarse ni entregarse.",
        "categoriaDolor": "gestion_clientes_marcas",
        "descripcion": "Preset de rubro \"creador de contenido\" sobre el ERP existente: cada marca colaboradora es un registro de Cliente con 2 campos nuevos (tipoTrato: canje/pago/mixto, valorAcordado); cada compromiso de contenido es un Turno reetiquetado como \"Entrega\" con fecha de vencimiento, tipo de pieza (story/reel/post) y estado (propuesta→aceptado→entregado→cobrado). El motor de recordatorios WhatsApp ya existente avisa 48h/3h antes de cada vencimiento. Se agregan 2-3 vistas de reporte (por cobrar, vencidas esta semana) sin tablas ni backend nuevo.",
        "solucion": "Mapeo de 2 campos nuevos en Cliente + reuso 1:1 del modelo Turno/Reserva como \"Entrega de contenido\" + reuso del motor de recordatorios WhatsApp + preset de blueprint para el rubro + 2-3 reportes de embudo/cobranza. Cero tablas nuevas, cero módulo nuevo: es relabeling y configuración sobre infraestructura ya multi-tenant.",
        "encajeGSG": "Reutiliza 100% el motor Clientes+Turnos+Recordatorios WhatsApp multi-tenant ya en producción, siguiendo el patrón de \"preset por rubro\" y el principio ADR-055 (objeto se crea una vez —marca=cliente— y se asigna —entrega=asignación—). Storefront/checkout MP queda disponible como upsell futuro (asesorías, kits) pero fuera del MVP.",
        "mejorasAplicadas": "Sobre v2: acoté aún más el scope de reportes (2, no 3, para el MVP mínimo vendible), until now el recordatorio a la marca quedaba implícito y ahora lo dejo explícitamente fuera del MVP (nice-to-have post-venta) para no inflar horas, y calibré el scoring con honestidad: el dolor es real pero la disposición a pagar en este micro-segmento es incierta (muchos usan Notion/planillas gratis), lo que baja confianza e impacto respecto de una lectura optimista.",
        "impacto": 4,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 18,
        "costoHumanoUSD": 270,
        "pctAutomatizableIA": 85,
        "tiempoMVPdias": 4
      }
    },
    {
      "id": "r1-634b5d29",
      "ronda": 1,
      "autor": "Analista de mercado local",
      "autorKey": "mercado",
      "v1": {
        "titulo": "Kit de entregables de marca (plantillas + presets IA) para creativos que venden diseño/contenido"
      },
      "mejoraV2": "Se afiló el dolor cuantificando el costo (2-4hs no facturadas + pitches perdidos por lentitud) y se corrigió el enfoque original: v1 mezclaba \"preset para el cliente del creativo\" con el preset de tenant tal cual, sin diferenciar que el creativo necesita un output de VENTA (moodboard/propuesta white-label), no un tenant operativo completo. Se agregó el detalle de white-labeling (sin sello GSG visible), el modelo de monetización con límites de uso concreto, y se aclaró que el gate de auditoría se mantiene pero de forma invisible al usuario final para no complejizar la UX de este segmento.",
      "mejoraV3": "Se mantiene el afinado de v2 (dolor cuantificado, white-label, monetización por créditos/suscripción, gate invisible). En esta pasada se ajustó el scoring a la baja en confianza e impacto: la disposición a pagar de un freelancer individual en Argentina por una herramienta de nicho es incierta y el ticket esperado es bajo, aunque el costo de construirlo es efectivamente marginal por la reutilización casi total del pipeline.",
      "final": {
        "titulo": "Preset de marca IA para creativos freelance: de research manual a propuesta en 10 minutos",
        "segmento": "creativos",
        "dolor": "El diseñador/editor freelance pierde 2-4 horas no facturadas investigando a mano el rubro, paleta, tono y catálogo de un prospecto antes de mandar una propuesta que muchas veces ni se cierra, perdiendo pitches contra estudios más rápidos.",
        "categoriaDolor": "entregables_visuales",
        "descripcion": "Se expone el Generador de Preset por IA (hoy interno, para altas de tenant) como micro-herramienta de autoservicio: el creativo pega el Instagram/web del prospecto y en minutos recibe un preset auditado (paleta, tipografías sugeridas, tono de copy, estructura de contenido, 3-5 piezas de ejemplo) exportable como PDF/link de propuesta con SU marca (white-label), no la de GSG. Se cobra por pack prepago de créditos o suscripción con cupo mensual, apuntando al momento pre-venta donde el creativo no tiene presupuesto del cliente para herramientas caras (Brandfetch, Canva Enterprise).",
        "solucion": "Reusar el pipeline de extracción+generación de identidad existente, recortando el output a lo necesario para vender (moodboard/propuesta), sin catálogo/checkout/blueprint operativo. Agregar export white-label real y límite de uso por plan. El gate de auditoría interno se mantiene pero invisible al usuario, mostrando solo el resultado ya validado.",
        "encajeGSG": "Reutiliza 100% el pipeline de extracción/generación de marca por IA (ya probado en Magra/Break Point) sin tocar backend: solo se agrega una capa de presentación (recorte + export white-label) y un tier de cobro sobre Mercado Pago, ya integrado en el ERP. Mismo activo, dos segmentos de venta.",
        "mejorasAplicadas": "Se mantiene el afinado de v2 (dolor cuantificado, white-label, monetización por créditos/suscripción, gate invisible). En esta pasada se ajustó el scoring a la baja en confianza e impacto: la disposición a pagar de un freelancer individual en Argentina por una herramienta de nicho es incierta y el ticket esperado es bajo, aunque el costo de construirlo es efectivamente marginal por la reutilización casi total del pipeline.",
        "impacto": 5,
        "confianza": 6,
        "esfuerzo": 4,
        "horasHumanas": 28,
        "costoHumanoUSD": 450,
        "pctAutomatizableIA": 75,
        "tiempoMVPdias": 10
      }
    },
    {
      "id": "r2-a220585b",
      "ronda": 2,
      "autor": "Creativo",
      "autorKey": "creativo",
      "v1": {
        "titulo": "Media kit y catálogo de servicios que se actualiza solo"
      },
      "mejoraV2": "Precisé el dolor (no es solo \"PDF feo\" sino la fricción de reabrir/actualizar, y el costo concreto de perder el pitch), concreté la solución con el nombre del blueprint y el flujo exacto (blueprint nuevo + preset IA + edición propia, sin backend nuevo), y until até explícitamente Mercado Pago (cobro de paquetes) y WhatsApp (aviso) que v1 no mencionaba, subiendo el encaje real con la plataforma existente.",
      "mejoraV3": "Recorté el alcance del MVP sacando la promesa de \"contador que se refresca solo\" vía integración con redes (eso es un desarrollo aparte, no reversible en un blueprint) y la dejé como campo manual editable, que es lo que de verdad resuelve el dolor sin sumar riesgo técnico. Bajé confianza e impacto a un nivel honesto: es un habilitador de venta, no un producto que un creativo pague por sí solo salvo empaquetado dentro de una oferta mayor (agencia/adaptador).",
      "final": {
        "titulo": "Media kit vivo: link único que se actualiza solo (storefront-as-portfolio)",
        "segmento": "creativos",
        "dolor": "El creativo arma a mano un PDF de media kit que queda desactualizado en semanas (seguidores, precios, portfolio); llega a la reunión con datos viejos o sin el último trabajo y pierde el pitch frente a alguien que manda un link prolijo y vivo.",
        "categoriaDolor": "venta_captacion",
        "descripcion": "Un storefront público (la misma vidriera multi-tenant del ERP) reconfigurado vía un blueprint de rubro nuevo \"media kit de creador\": catálogo de paquetes de contenido con precio, bloque de portfolio, testimonios de marcas, y un campo de métricas (seguidores/engagement) que el creativo actualiza en segundos desde el backoffice. Un solo link estable va en la bio de Instagram y reemplaza el PDF adjunto que se manda por WhatsApp o mail.",
        "solucion": "Blueprint nuevo de layout (\"media kit\") sobre el motor de catálogo/vidriera ya existente: renombra producto→paquete, agrega bloques de portfolio/testimonios/métricas manuales. El preset por IA arma el borrador leyendo Instagram/web (con autorización registrada, mismo flujo que Break Point/Magra); el creativo edita precios y portfolio desde el backoffice existente. Cobro de paquetes vía link de Mercado Pago ya integrado; aviso de actualización por WhatsApp con plantilla existente. Sin backend nuevo, sin integración de scraping de redes en el MVP (el contador es manual, no automático, para no sumar alcance).",
        "encajeGSG": "Reutiliza 100% el storefront público multi-tenant, el motor de catálogo/blueprint por rubro, el generador de preset por IA (extracción desde redes con autorización), Mercado Pago para cobrar paquetes y WhatsApp-first para avisos. El único desarrollo real es el blueprint de layout (portfolio/testimonios/métricas manuales), acotado y reversible.",
        "mejorasAplicadas": "Recorté el alcance del MVP sacando la promesa de \"contador que se refresca solo\" vía integración con redes (eso es un desarrollo aparte, no reversible en un blueprint) y la dejé como campo manual editable, que es lo que de verdad resuelve el dolor sin sumar riesgo técnico. Bajé confianza e impacto a un nivel honesto: es un habilitador de venta, no un producto que un creativo pague por sí solo salvo empaquetado dentro de una oferta mayor (agencia/adaptador).",
        "impacto": 5,
        "confianza": 5,
        "esfuerzo": 3,
        "horasHumanas": 18,
        "costoHumanoUSD": 350,
        "pctAutomatizableIA": 80,
        "tiempoMVPdias": 5
      }
    },
    {
      "id": "r2-8cdb8fc0",
      "ronda": 2,
      "autor": "Creativo",
      "autorKey": "creativo",
      "v1": {
        "titulo": "Agenda con seña obligatoria para servicios de contenido"
      },
      "mejoraV2": "Concreté la ventana de liberación automática (ej. 30 min) que la v1 dejaba vaga como \"X minutos\", agregué el detalle de UX del link público (mostrar seña/saldo, no copy genérico de peluquería) y el comprobante adjunto en el WhatsApp, para que quede accionable y no solo \"reetiquetar blueprint\".",
      "mejoraV3": "Recorté el MVP a lo mínimo vendible (blueprint + 2 templates + 1 corrida de QA manual, sin tocar nada de UX genérica adicional), y bajé confianza/impacto a un nivel honesto: es una reetiquetación de un módulo maduro, no un producto nuevo, así que el techo de venta como línea aparte es moderado aunque el dolor sea real.",
      "final": {
        "titulo": "Turno con seña obligatoria para sesiones creativas (foto, video, edición)",
        "segmento": "creativos",
        "dolor": "El creador pierde horas de laburo y plata por cancelaciones de último momento y por clientes que negocian horarios a mensaje suelto de WhatsApp sin comprometerse ni pagar nada por adelantado, y el ida y vuelta manual de coordinar consume tiempo facturable.",
        "categoriaDolor": "organizacion_agenda",
        "descripcion": "Turnero público con link propio (mismo componente que ya usan barberías/salones del ERP), configurado como blueprint \"estudio creativo\": el cliente elige día/horario, paga una seña por Mercado Pago para confirmar y recibe recordatorio automático por WhatsApp 24hs antes. Si no paga la seña dentro de 30 minutos, el turno se libera solo. Sin seña pagada el turno no figura como confirmado, así el creador solo agenda tiempo real y no promesas.",
        "solucion": "MVP acotado a config, no a desarrollo: activar blueprint \"estudio creativo\" sobre el turnero existente (regla de seña obligatoria ya soportada por el checkout MP, timeout de liberación a 30 min ya parametrizable), dos templates nuevos (WhatsApp de recordatorio con comprobante adjunto, y copy del link público mostrando precio de seña + saldo restante en vez del genérico de peluquería). Cero motor nuevo: es blueprint + 2 templates + una corrida de QA manual del flujo end-to-end (reservar → pagar seña → recordatorio → liberación por timeout) antes de ofrecerlo al primer cliente piloto.",
        "encajeGSG": "Reusa 100% el módulo de agenda/turnos, el motor de recordatorios WhatsApp y el checkout de Mercado Pago ya construidos para el vertical de servicios; solo cambia blueprint de rubro y templates de copy/WhatsApp. Cero desarrollo de motor nuevo.",
        "mejorasAplicadas": "Recorté el MVP a lo mínimo vendible (blueprint + 2 templates + 1 corrida de QA manual, sin tocar nada de UX genérica adicional), y bajé confianza/impacto a un nivel honesto: es una reetiquetación de un módulo maduro, no un producto nuevo, así que el techo de venta como línea aparte es moderado aunque el dolor sea real.",
        "impacto": 6,
        "confianza": 7,
        "esfuerzo": 2,
        "horasHumanas": 6,
        "costoHumanoUSD": 150,
        "pctAutomatizableIA": 75,
        "tiempoMVPdias": 2
      }
    },
    {
      "id": "r2-8808b1d1",
      "ronda": 2,
      "autor": "Creativo",
      "autorKey": "creativo",
      "v1": {
        "titulo": "Panel de comisiones para el community manager con varias cuentas"
      },
      "mejoraV2": "Se concretaron los montos con rangos de fee real de mercado argentino en pesos y se explicitó el problema de inflación/reajuste de fee, no solo el olvido de cobro. Se acotó \"solución\" a los tres cambios concretos y mínimos (blueprint, copy, tarea de resumen) en vez de hablar en general de \"reetiquetar\", dejando claro que no hay desarrollo de backend nuevo. Se sumó el enganche con ARCA sandbox (ya existente) para el recibo del monotributista, que suma valor real sin costo adicional, y se conectó con el playbook de preset por IA para bajar el costo de puesta en marcha a cero.",
      "mejoraV3": "Se ratificó el MVP mínimo (blueprint + copy + cron, sin backend nuevo) y se ajustaron los scores a la baja en confianza de pago: el dolor es real pero la disposición a pagar por un CM freelance chico (vs. usar WhatsApp+planilla gratis) es el riesgo comercial principal, no la viabilidad técnica. Se estimaron horas humanas e infra concretas en vez de dejarlo implícito en \"bajo esfuerzo\".",
      "final": {
        "categoriaDolor": "cobros_facturacion",
        "segmento": "community_managers",
        "titulo": "Panel de cobranzas \"Mis Cuentas\" para el community manager con cartera de clientes",
        "dolor": "El CM freelance argentino con 5-8 cuentas de clientes no tiene un lugar único para saber quién le debe, quién pagó y quién está en mora; hoy lo lleva en Notion/WhatsApp/planilla suelta, y eso le cuesta plata real por olvidos, fees desactualizados por inflación y el desgaste de \"perseguir\" el cobro por WhatsApp.",
        "descripcion": "Tablero \"Mis Cuentas\" donde cada cliente gestionado es un registro con plan mensual recurrente (fee en pesos + recordatorio de reajuste). El sistema dispara el recordatorio de cobro por WhatsApp el día pactado, genera el link de Mercado Pago con el monto exacto, marca en mora a los N días de atraso, y manda un resumen semanal tipo \"esta semana te tienen que pagar $X: Cliente A vence hoy, Cliente B vencido hace 5 días\". Como plus, permite emitir recibo/factura de monotributista vía ARCA sandbox cuando el cliente lo pide.",
        "solucion": "Reutiliza 100% el módulo de clientes + planes recurrentes + recordatorios WhatsApp + checkout Mercado Pago + ARCA sandbox ya existentes, con un blueprint nuevo \"CM/Agencia de contenido\" (nomenclatura: cuenta gestionada, red social, fee mensual, día de cobro), copy de WhatsApp adaptado (\"te debe $X por la gestión de [cuenta]\"), y un cron de resumen semanal reetiquetado sobre datos que ya existen. Sin backend nuevo: blueprint + copy + una consulta agregada + un mensaje de WhatsApp.",
        "encajeGSG": "Encaje muy alto: motor de clientes, planes recurrentes, recordatorios WhatsApp, checkout MP y ARCA sandbox ya existen y se reutilizan sin tocar backend. El único trabajo real es blueprint de preset + copy + una tarea cron de agregación, generable como demo pública a costo cero vía el playbook de preset por IA.",
        "mejorasAplicadas": "Se ratificó el MVP mínimo (blueprint + copy + cron, sin backend nuevo) y se ajustaron los scores a la baja en confianza de pago: el dolor es real pero la disposición a pagar por un CM freelance chico (vs. usar WhatsApp+planilla gratis) es el riesgo comercial principal, no la viabilidad técnica. Se estimaron horas humanas e infra concretas en vez de dejarlo implícito en \"bajo esfuerzo\".",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 22,
        "costoHumanoUSD": 350,
        "pctAutomatizableIA": 85,
        "tiempoMVPdias": 5
      }
    },
    {
      "id": "r2-07c9cbf4",
      "ronda": 2,
      "autor": "Creativo",
      "autorKey": "creativo",
      "v1": {
        "titulo": "Banco de contenido con aprobación por WhatsApp"
      },
      "mejoraV2": "Se eliminó el humo de \"bot de WhatsApp bidireccional\" y \"subdominio nuevo del storefront\" (caro e innecesario): se reemplaza por notificaciones salientes con plantilla sobre la integración de WhatsApp existente y por una página privada dentro del storefront actual con token temporal, evitando infraestructura nueva. Se precisó el dolor agregando la falta de comprobante ante reclamos como consecuencia concreta, y se acotó explícitamente qué es \"lo único genuino a construir\" (modelo de datos + visor + endpoint de notificación) para que el encaje con GSG sea verificable y no una afirmación genérica.",
      "mejoraV3": "Validación final: el dolor es real (falta de comprobante ante reclamos) pero la disposición a pagar depende de que sea un feature dentro de un ERP/servicio que el CM ya paga, no un producto standalone — se ajustó el marco de venta implícitamente a \"addon\", no \"SaaS nuevo\". Se recortó el alcance a MVP mínimo vendible: sin versionado de comentarios threaded, sin dashboard de métricas, solo estado+comentario+notificación. Scoring bajado con honestidad: impacto medio (no es un dolor que por sí solo cierre venta, es un diferenciador de retención) y esfuerzo levemente subido porque el manejo de tokens temporales seguros y la vista pública dentro del storefront requiere cuidado de seguridad (evitar fugas de piezas no publicadas).",
      "final": {
        "titulo": "Portal de aprobación de contenido con notificación por WhatsApp",
        "segmento": "community_managers",
        "dolor": "La aprobación de piezas por WhatsApp diluye la trazabilidad: capturas duplicadas, versiones confundidas (\"la de ayer\") y ningún registro de quién aprobó qué y cuándo. Cuando algo sale mal después de publicado, el CM no tiene cómo probar que el cliente dio el visto bueno, lo que deriva en reclamos y horas perdidas releyendo chats.",
        "categoriaDolor": "gestion_clientes_marcas",
        "descripcion": "Un tablero de piezas por cliente, expuesto como página privada dentro del storefront existente del tenant (no un subdominio nuevo): el CM sube la pieza del mes con su versión, el cliente entra con un link con token temporal y aprueba o marca \"pedir cambios\" con comentario. Cada acción queda con timestamp y usuario, exportable como comprobante ante un reclamo. El aviso de \"tenés N piezas para aprobar\" y \"aprobó/rechazó la pieza X\" sale por el canal de WhatsApp ya integrado, como notificación saliente con plantilla y link de vuelta al tablero, sin bot conversacional nuevo.",
        "solucion": "Módulo dentro del ERP existente: una tabla \"piezas de contenido\" (tenant-scoped) con estados (pendiente/aprobado/rechazado), historial de versiones y de quién decidió qué. Reutiliza el storefront público del tenant para la vista de cliente (token de acceso temporal, sin login pesado) y el RBAC actual para diferenciar el rol \"cliente aprueba\" del rol \"CM sube\". Las notificaciones usan la integración de WhatsApp ya existente (mensajes salientes con plantilla), sin bot nuevo. Lo único genuino a construir: modelo de datos de piezas/versiones, el visor con estado de aprobación, y el endpoint de notificación saliente al cambiar de estado.",
        "encajeGSG": "Apalanca tres piezas ya construidas: (1) multi-tenancy/tenantId para que el CM gestione múltiples clientes; (2) RBAC existente para el rol aprobador vs. subidor; (3) el canal WhatsApp-first ya integrado para notificaciones salientes one-way, sin bot bidireccional. El desarrollo neto se acota a un modelo de datos chico y un visor, ambos reversibles y sin infraestructura nueva.",
        "mejorasAplicadas": "Validación final: el dolor es real (falta de comprobante ante reclamos) pero la disposición a pagar depende de que sea un feature dentro de un ERP/servicio que el CM ya paga, no un producto standalone — se ajustó el marco de venta implícitamente a \"addon\", no \"SaaS nuevo\". Se recortó el alcance a MVP mínimo vendible: sin versionado de comentarios threaded, sin dashboard de métricas, solo estado+comentario+notificación. Scoring bajado con honestidad: impacto medio (no es un dolor que por sí solo cierre venta, es un diferenciador de retención) y esfuerzo levemente subido porque el manejo de tokens temporales seguros y la vista pública dentro del storefront requiere cuidado de seguridad (evitar fugas de piezas no publicadas).",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 4,
        "horasHumanas": 35,
        "costoHumanoUSD": 500,
        "pctAutomatizableIA": 75,
        "tiempoMVPdias": 10
      }
    },
    {
      "id": "r2-8445436b",
      "ronda": 2,
      "autor": "Creativo",
      "autorKey": "creativo",
      "v1": {
        "titulo": "Reporte mensual de resultados armado solo, para mandarle al cliente"
      },
      "mejoraV2": "Se concretó el \"conectar o pegar a mano\" de v1 en un flujo de dos vías explícito (API real vs formulario de 5 campos), reconociendo que la mayoría de cuentas chicas no tendrá acceso business a la API. Se cuantificó el dolor (horas por cliente) y se marcó el conector OAuth como fase 2 opcional para bajar el riesgo/costo de arranque, dejando el MVP ejecutable con piezas que GSG ya tiene.",
      "mejoraV3": "Se sacó del MVP el conector OAuth a Instagram/TikTok (quedó 100% fase 2) para bajar esfuerzo y riesgo de arranque; se validó que el dolor es real, recurrente y mensurable en horas, y que el formulario manual alcanza para vender y demostrar valor sin depender de permisos de terceros.",
      "final": {
        "categoriaDolor": "reportes_metricas",
        "titulo": "Reporte mensual automático de resultados (WhatsApp, con marca del cliente)",
        "segmento": "community_managers",
        "dolor": "El día 1 de cada mes el CM arma a mano en Canva/PowerPoint un informe de métricas por cada cliente (1-3hs/cuenta); con 8-10 clientes son días perdidos, y si se atrasa el cliente no ve el trabajo del mes y duda en renovar.",
        "descripcion": "Módulo \"Reporte Mensual\" dentro del ERP: cada cliente del CM ya tiene su branding cargado (logo/colores). El día 1 un cron dispara la generación. MVP acotado: el CM completa un formulario de 5 campos (2 min) con las métricas del mes; el sistema arma automáticamente un PDF/página con el branding del cliente, 2-3 gráficos simples y un resumen ejecutivo en criollo redactado por IA, y lo envía por WhatsApp al cliente final. La conexión directa a Instagram/TikTok Graph API (OAuth) queda explícitamente fuera del MVP, como fase 2, porque agrega aprobación de permisos business y soporte de terceros que no son necesarios para validar la venta.",
        "solucion": "Nuevo módulo \"Reportes\" que reutiliza 100%: motor de branding por tenant (look del PDF), generación de copy por IA (resumen ejecutivo), canal WhatsApp-first (envío), y el scheduler existente de recordatorios (disparo día 1). Lo nuevo a construir, acotado: formulario de carga manual de 5 métricas + generador de PDF/página con 2-3 charts (chart.js/recharts). Sin integraciones OAuth externas en el MVP.",
        "encajeGSG": "Reusa branding por tenant, generación de contenido por IA, WhatsApp de envío y el scheduler ya existentes; solo se construye el generador de reporte (PDF+charts) y el formulario, ambos acotados y reversibles, sin tocar integraciones externas.",
        "mejorasAplicadas": "Se sacó del MVP el conector OAuth a Instagram/TikTok (quedó 100% fase 2) para bajar esfuerzo y riesgo de arranque; se validó que el dolor es real, recurrente y mensurable en horas, y que el formulario manual alcanza para vender y demostrar valor sin depender de permisos de terceros.",
        "impacto": 8,
        "confianza": 8,
        "esfuerzo": 4,
        "horasHumanas": 22,
        "costoHumanoUSD": 350,
        "pctAutomatizableIA": 85,
        "tiempoMVPdias": 6
      }
    },
    {
      "id": "r2-ccea9f6b",
      "ronda": 2,
      "autor": "Creativo",
      "autorKey": "creativo",
      "v1": {
        "titulo": "Tienda de presets y recursos con storefront propio"
      },
      "mejoraV2": "Concreté el dolor con cifras de comisión y el motivo real de fricción (falta de tarjeta internacional del comprador, no solo \"comisión alta\"); until now la solución era genérica -\"agregar entrega automática\"- y ahora especifico el mecanismo exacto (adjunto + webhook + reutilizo del motor WhatsApp existente) y sumo watermark/preview como resolución concreta del riesgo de piratería, un dolor no atacado en v1.",
      "mejoraV3": "Se validó que el dolor es real y específico (barrera de tarjeta internacional, no solo comisión) y se acotó el MVP a un único tipo de producto digital sin DRM avanzado, dejando fuera protección de piratería robusta y multi-variante para la v1, que quedan como iteración futura si hay tracción.",
      "final": {
        "titulo": "Digital Store: presets, LUTs y plantillas en pesos, con entrega automática sin fricción de tarjeta internacional",
        "segmento": "creativos",
        "dolor": "Creadores que venden presets/LUTs/plantillas usan Gumroad o Payhip: cobran en USD con comisión 8-10%+conversión, exigen tarjeta internacional del comprador (filtra al público argentino que paga con MP/transferencia) y liquidan con demora y retención cambiaria — pierden ventas locales y margen en cada operación.",
        "categoriaDolor": "venta_captacion",
        "descripcion": "Storefront propio del creador (subdominio con su marca, ya existente en el ERP) donde el producto es un ítem digital (preset/LUT/plantilla/mockup). El comprador paga en pesos vía Mercado Pago o transferencia con comprobante y, al confirmarse el pago, recibe el archivo automáticamente por WhatsApp/mail con link de descarga con expiración. Incluye vidriera con preview watermarked, cupón de lanzamiento y un panel simple de ventas del mes en pesos reales.",
        "solucion": "Se marca el ítem como \"producto digital\" (sin stock/envío) en el catálogo ya existente, se reutiliza el checkout MP ya integrado, y se agrega: (1) campo de adjunto (archivo o link protegido) en la ficha, (2) webhook post-pago que dispara el link de descarga por el motor de WhatsApp/mail que ya usa el ERP para recordatorios. El watermark se resuelve con dos versiones del archivo (preview liviana pública + original protegido tras pago). MVP acotado a un solo tipo de ítem digital (sin catálogo de variantes ni protección DRM avanzada).",
        "encajeGSG": "Storefront, catálogo, checkout MP y motor de mensajería WhatsApp ya existen y se reutilizan sin tocar lógica de turnos ni stock físico; el desarrollo genuino es acotado (campo adjunto + webhook de entrega) y reversible, bajo riesgo para producción.",
        "mejorasAplicadas": "Se validó que el dolor es real y específico (barrera de tarjeta internacional, no solo comisión) y se acotó el MVP a un único tipo de producto digital sin DRM avanzado, dejando fuera protección de piratería robusta y multi-variante para la v1, que quedan como iteración futura si hay tracción.",
        "impacto": 6,
        "confianza": 7,
        "esfuerzo": 3,
        "horasHumanas": 22,
        "costoHumanoUSD": 350,
        "pctAutomatizableIA": 85,
        "tiempoMVPdias": 6
      }
    },
    {
      "id": "r2-55ca2623",
      "ronda": 2,
      "autor": "Creativo",
      "autorKey": "creativo",
      "v1": {
        "titulo": "Preset de marca personal armado por IA en minutos"
      },
      "mejoraV2": "Concreté el entregable (media kit + catálogo de servicios + cobro MP, no un \"mini-sitio\" vago), reduje el segmento de \"transversal\" a \"influencers\" (foco real), agregué el export a PDF/imagen para WhatsApp que es el canal donde de verdad se mueve el trato con marcas, y bajé el humo: aclaré que el único trabajo nuevo real es el blueprint de rubro, todo lo demás es reuso de storefront/MP/WhatsApp ya existentes.",
      "mejoraV3": "Se achicó el MVP al mínimo vendible: un solo blueprint acotado (sin variantes por tipo de creador todavía) y un export simple a imagen/PDF en vez de un \"generador de media kit\" separado. Se marca honestamente el riesgo de pagabilidad: el sub-segmento \"recién arranca\" tiene poca disposición/capacidad de pago — la validación real de venta debe hacerse con 3-5 creadores piloto vía demo gratis antes de invertir más horas en el blueprint, por eso confianza y esfuerzo quedan moderados en vez de altos.",
      "final": {
        "titulo": "Media Kit + Catálogo de Servicios en 24hs (blueprint \"Creador\" del Generador de Preset IA)",
        "segmento": "influencers",
        "dolor": "El creador que empieza a monetizar no tiene media kit ni forma de cobrar/ordenar pedidos: manda capturas de Instagram por WhatsApp, cobra por transferencia sin registro y pierde acuerdos con marcas por no tener un link profesional. Contratar agencia o diseñador freelance no cierra en pesos para alguien que recién arranca.",
        "categoriaDolor": "entregables_visuales",
        "descripcion": "Con autorización registrada del creador, se toma su Instagram/TikTok o web; la IA extrae identidad visual, rubro de contenido y tarifas/servicios mencionados, y arma en 24hs un storefront tipo \"perfil de creador\": media kit (alcance, engagement, audiencia), catálogo de servicios con precio en pesos, WhatsApp directo y cobro por Mercado Pago, más un export a imagen/PDF del media kit para reenviar por WhatsApp. Todo pasa el Gate de auditoría antes de mostrarse. Se entrega como demo gratis (URL <creador>-erp.vercel.app); dominio propio y persistencia real solo post-venta.",
        "solucion": "Reuso directo del Generador de PRESET por IA (autorización → ingesta de redes → adaptación de branding → Gate) apuntado al storefront público del ERP en modo \"perfil de creador\": catálogo = servicios/paquetes, cobro = Mercado Pago ya integrado, contacto = WhatsApp-first ya integrado. Único desarrollo real: un blueprint de rubro \"creador de contenido\" (plantilla acotada de catálogo + campos de media kit) y el export a imagen/PDF del media kit; nada de infraestructura nueva.",
        "encajeGSG": "Encaja 100% con el playbook \"Generador de PRESET por IA\" (autorización, extracción, Gate bloqueante), el storefront, MP y WhatsApp-first ya construidos, y el ciclo Demo→Venta→Inversión. El único costo humano/infra es diseñar el blueprint de rubro \"creador\" y el exportador de media kit, reutilizando el mecanismo de blueprints por rubro que ya existe para negocios.",
        "mejorasAplicadas": "Se achicó el MVP al mínimo vendible: un solo blueprint acotado (sin variantes por tipo de creador todavía) y un export simple a imagen/PDF en vez de un \"generador de media kit\" separado. Se marca honestamente el riesgo de pagabilidad: el sub-segmento \"recién arranca\" tiene poca disposición/capacidad de pago — la validación real de venta debe hacerse con 3-5 creadores piloto vía demo gratis antes de invertir más horas en el blueprint, por eso confianza y esfuerzo quedan moderados en vez de altos.",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 22,
        "costoHumanoUSD": 550,
        "pctAutomatizableIA": 85,
        "tiempoMVPdias": 6
      }
    },
    {
      "id": "r2-2d8b45c4",
      "ronda": 2,
      "autor": "Analítico",
      "autorKey": "analitico",
      "v1": {
        "titulo": "Facturador ARCA para freelancers de contenido"
      },
      "mejoraV2": "Se aclaró que NO es un producto standalone sino un blueprint/preset de tenant sobre el core existente (evita duplicar infraestructura y reduce el costo real a casi cero); se concretó el catálogo de servicios y el flujo de cobro con las 3 piezas reales del ERP (ARCA, WhatsApp, Mercado Pago) en vez de mencionarlas en general; se marcó explícitamente el punto irreversible (homologación ARCA real) como algo a elevar al dueño, no a ejecutar solo; se eliminó el framing de \"producto nuevo vendible fuera del vertical\" por uno de \"mismo producto, nuevo blueprint de rubro\", que es más barato y más rápido de lanzar.",
      "mejoraV3": "Se validó el dolor como real y recurrente en el segmento (monotributista de servicio único, sin back office), pero de ticket bajo por cliente — se ajustó el impacto a la baja frente a v2 por tamaño de mercado unitario y por la dependencia de homologación ARCA real para vender con datos productivos (hoy solo sandbox, gate irreversible fuera de esta sesión). Se acotó el MVP a 4 entregables concretos y chicos (blueprint, textos, toggle UI, flujo de factura) en vez de \"reconfigurar el storefront\" en general, y se recalibraron horas/costo con honestidad: es más un blueprint reusable que un producto nuevo, así que el esfuerzo de construcción es bajo pero el techo de impacto por cliente también lo es hasta que haya volumen.",
      "final": {
        "titulo": "Facturador ARCA WhatsApp-first para freelancers de contenido",
        "segmento": "creativos",
        "dolor": "El community manager/editor/creador freelance monotributista factura a marcas y agencias a mano (o no factura), pierde 2-4 hs/mes en el trámite de ARCA, y no tiene visibilidad de qué marca le debe qué mes.",
        "categoriaDolor": "cobros_facturacion",
        "descripcion": "Un tenant liviano del ERP (mismo core, blueprint distinto) donde el freelancer da de alta sus \"clientes\" (marcas/agencias) como clientes recurrentes de servicio, con catálogo precargado de 4-5 ítems típicos (gestión de RRSS mensual, edición de reels, pauta, foto/producción). Cada mes el sistema dispara por WhatsApp un recordatorio de facturación a cada marca y genera la factura ARCA en 2 clics al confirmar el cobro (efectivo, transferencia o link de Mercado Pago). Dashboard único: quién debe, quién pagó, historial fiscal del monotributo.",
        "solucion": "MVP mínimo vendible: (1) blueprint de catálogo \"servicios digitales B2B\" cargado sobre el ERP existente, (2) textos de recordatorio WhatsApp adaptados a cobro B2B freelance (reusa el motor de recordatorios ya construido), (3) reconfiguración liviana del storefront como dashboard \"clientes/marcas\" (oculta vidriera pública, muestra estado de cobro), (4) factura ARCA en sandbox disparada desde el mismo flujo de confirmación de cobro que ya existe. Nada de infraestructura nueva: es blueprint + copy + toggle de UI.",
        "encajeGSG": "Reusa 3 piezas ya construidas del ERP: adapter ARCA/AFIP (sandbox; homologación real es Gate 2/irreversible y se eleva al dueño antes de vender con datos productivos), motor de recordatorios WhatsApp, link de cobro Mercado Pago. El costo humano real se limita a 1 blueprint de catálogo + textos + un toggle de storefront→dashboard. Mismo patrón que Agencia Digital usa para vender el ERP a otros rubros, aplicado a un freelancer individual en vez de un comercio con local.",
        "mejorasAplicadas": "Se validó el dolor como real y recurrente en el segmento (monotributista de servicio único, sin back office), pero de ticket bajo por cliente — se ajustó el impacto a la baja frente a v2 por tamaño de mercado unitario y por la dependencia de homologación ARCA real para vender con datos productivos (hoy solo sandbox, gate irreversible fuera de esta sesión). Se acotó el MVP a 4 entregables concretos y chicos (blueprint, textos, toggle UI, flujo de factura) en vez de \"reconfigurar el storefront\" en general, y se recalibraron horas/costo con honestidad: es más un blueprint reusable que un producto nuevo, así que el esfuerzo de construcción es bajo pero el techo de impacto por cliente también lo es hasta que haya volumen.",
        "impacto": 5,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 22,
        "costoHumanoUSD": 330,
        "pctAutomatizableIA": 80,
        "tiempoMVPdias": 7
      }
    },
    {
      "id": "r2-3ea737be",
      "ronda": 2,
      "autor": "Analítico",
      "autorKey": "analitico",
      "v1": {
        "titulo": "Media kit + booking de colaboraciones para influencers"
      },
      "mejoraV2": "Concreté el dolor (el problema no es \"no tener vidriera\" sino DM sin registro + PDF desactualizado + pérdida de propuestas), até el estado de la propuesta al estado de turno ya existente en vez de inventar una entidad nueva, agregué el disparo del recordatorio WhatsApp existente como confirmación automática, y especifiqué que el storefront necesita un layout portfolio-first (no reusar el genérico de catálogo tal cual) para que realmente compita visualmente con un media kit profesional.",
      "mejoraV3": "Recorté el MVP: saqué la dependencia del generador de preset por IA (ingesta automática de redes) del camino crítico para no atar la venta a una pieza más compleja de calibrar en la primera pasada; el alta inicial de paquetes se hace a mano con el ABM que ya existe, y la automatización de ingesta queda como mejora post-venta. Esto baja esfuerzo y tiempo a MVP sin perder el diferencial (media kit vivo + cobro de seña atado a agenda).",
      "final": {
        "titulo": "Media kit vivo + booking con seña para influencers y creadores",
        "segmento": "influencers",
        "dolor": "El influencer/creador cierra colaboraciones por DM: manda un PDF de tarifas desactualizado, no sabe si la marca \"lo vio\" ni en qué quedó la negociación, y pierde propuestas por desorganización o porque no hay forma simple de cobrar una seña antes de bloquear agenda de grabación.",
        "categoriaDolor": "venta_captacion",
        "descripcion": "Vidriera pública (storefront) que funciona como media kit vivo: métricas de audiencia, paquetes de colaboración con precio visible, testimonios de marcas anteriores y galería tipo portfolio (no lista de precios genérica). La marca elige paquete desde el celular, paga seña por Mercado Pago y el turno de grabación/entrega se agenda solo cuando el cobro se confirma, sin ida y vuelta de WhatsApp/DM. El creador ve en un único panel qué propuestas están \"en seña\", \"confirmadas\" o \"vencidas\", evitando el efecto carpeta de chat perdido.",
        "solucion": "MVP acotado: (1) layout \"portfolio\" alternativo para el storefront del blueprint servicios ya existente (foto grande, métricas como badges, paquetes con precio) — un skin, no una feature nueva; (2) reserva de turno + cobro de seña reusa agenda y Mercado Pago tal cual están; el estado de la propuesta se resuelve con el mismo estado de turno del ERP, sin entidad nueva; (3) al confirmarse la seña, se dispara el recordatorio WhatsApp existente en rol de confirmación de colaboración. La ingesta automática de catálogo desde redes sociales (vía generador de preset IA) se deja como mejora de onboarding, no como bloqueante del MVP: para las primeras altas alcanza con cargar 3-5 paquetes a mano en el ABM ya existente.",
        "encajeGSG": "Cero infraestructura nueva: reusa storefront público, agenda con estados de turno, cobro Mercado Pago y motor de recordatorios WhatsApp. El único trabajo real y acotado es el layout portfolio del storefront para el blueprint servicios; la ingesta por IA desde redes queda como fase 2 opcional, no como dependencia del MVP vendible.",
        "mejorasAplicadas": "Recorté el MVP: saqué la dependencia del generador de preset por IA (ingesta automática de redes) del camino crítico para no atar la venta a una pieza más compleja de calibrar en la primera pasada; el alta inicial de paquetes se hace a mano con el ABM que ya existe, y la automatización de ingesta queda como mejora post-venta. Esto baja esfuerzo y tiempo a MVP sin perder el diferencial (media kit vivo + cobro de seña atado a agenda).",
        "impacto": 6,
        "confianza": 7,
        "esfuerzo": 3,
        "horasHumanas": 32,
        "costoHumanoUSD": 550,
        "pctAutomatizableIA": 70,
        "tiempoMVPdias": 6
      }
    },
    {
      "id": "r2-1bfa3333",
      "ronda": 2,
      "autor": "Analítico",
      "autorKey": "analitico",
      "v1": {
        "titulo": "Cobrador de honorarios recurrentes para community managers"
      },
      "mejoraV2": "Se agregó el número real de mercado argentino (fee típico $80k-$250k/mes) para dimensionar el dolor con datos concretos en vez de genérico; se resolvió el punto débil de v1 (transferencias \"sin registrar\") con conciliación automática vía webhook de MP y confirmación por tap en WhatsApp para transferencia, evitando que el CM vuelva a la app; se sumó el ángulo fiscal (insumo prolijo para monotributo/ARCA) que v1 no mencionaba; se aclaró que no requiere infraestructura nueva, solo reconfiguración de triggers existentes, subiendo el encaje GSG de \"reempaquetado\" a \"cero desarrollo nuevo\".",
      "mejoraV3": "Se valida que el dolor es real y pagable (cobro recurrente con fricción de conciliación es un problema de plata, no cosmético) pero se corrige el optimismo de v2: no es \"cero desarrollo\", hay trabajo genuino en la vista de reporte, en el manejo de estados vencido/pendiente y en la confirmación por tap vía WhatsApp (requiere webhook/bot handler nuevo, no solo reconfigurar cron). Se ajustan impacto y esfuerzo a un nivel más realista y se agrega estimación de infra (mensajería WhatsApp Business API tiene costo por conversación en volumen).",
      "final": {
        "titulo": "Cartera de fee mensual para CMs: cobro por MP + recordatorio WhatsApp + conciliación automática",
        "segmento": "community_managers",
        "dolor": "El CM promedio en Argentina gestiona 6-12 marcas con fee mensual (~$80.000-$250.000 c/u) cobrado por transferencia o MP y controlado a mano en Excel/Notion; el atraso de cobro (10-15 días) es plata real perdida por inflación, el reclamo manual por WhatsApp se posterga o se olvida, y las transferencias sin conciliar dejan un lío al momento de rendir cuentas al contador o a ARCA por monotributo.",
        "categoriaDolor": "cobros_facturacion",
        "descripcion": "Panel de cartera de clientes con fee recurrente (cliente + monto + día de cobro + método) que dispara solo, 3-5 días antes del vencimiento, un recordatorio por WhatsApp con el link de pago de MP ya generado; al pagar, el webhook de MP marca \"cobrado\" y concilia el ingreso contra cliente y mes automáticamente. Si el cliente paga por transferencia, el CM confirma con un tap desde el mismo chat de WhatsApp, sin volver a la app. Al cierre de mes hay un estado de cobranza (cobrado/pendiente/vencido) exportable en un click.",
        "solucion": "Reusa el módulo de Clientes + Cobros + Recordatorios del ERP (blueprint de servicios) reconfigurado con etiqueta \"cliente de gestión de redes\" con fee mensual en vez de turno. Se apalanca la integración MP ya existente (link de cobro + webhook), el canal WhatsApp-first ya integrado (recordatorio + confirmación por tap) y el motor de recordatorios (cron), solo redefiniendo el trigger a \"día de cobro mensual\". Se agrega una vista nueva de reporte de cobranza exportable.",
        "encajeGSG": "Reuso casi total: Clientes + Cobros + Recordatorios (blueprint servicios) + Mercado Pago (link/webhook) + WhatsApp-first, todo ya vivo en el ERP. El trabajo real es configuración de triggers/objeto \"cliente con fee\" más una vista de reporte de cobranza — no hay pasarela, canal ni motor de jobs nuevo.",
        "mejorasAplicadas": "Se valida que el dolor es real y pagable (cobro recurrente con fricción de conciliación es un problema de plata, no cosmético) pero se corrige el optimismo de v2: no es \"cero desarrollo\", hay trabajo genuino en la vista de reporte, en el manejo de estados vencido/pendiente y en la confirmación por tap vía WhatsApp (requiere webhook/bot handler nuevo, no solo reconfigurar cron). Se ajustan impacto y esfuerzo a un nivel más realista y se agrega estimación de infra (mensajería WhatsApp Business API tiene costo por conversación en volumen).",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 30,
        "costoHumanoUSD": 650,
        "pctAutomatizableIA": 75,
        "tiempoMVPdias": 7
      }
    },
    {
      "id": "r2-0afa0b44",
      "ronda": 2,
      "autor": "Analítico",
      "autorKey": "analitico",
      "v1": {
        "titulo": "Reporte automático de resultados para clientes de CMs y agencias chicas"
      },
      "mejoraV2": "Cuantifiqué el dolor (2-3 horas, atraso de un día) para que pese más como caso de venta; agregué el resumen en lenguaje llano con IA como diferencial frente a un simple export de métricas; until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until aclaré que el CM revisa antes de enviar (control humano) y until until until especifiqué que el canal de envío es el WhatsApp Business que el ERP ya usa, no uno nuevo.",
      "mejoraV3": "Recorté el MVP al tamaño más chico vendible: saqué la integración con APIs de Instagram/TikTok (que exige aprobación de Meta y es un riesgo real de bloqueo) y la reemplacé por carga manual de métricas, dejando el OCR/vision como fase 2. Limpié el texto duplicado/corrupto de la versión anterior. Ajusté los scores a un nivel honesto: el dolor es real y el ahorro de tiempo es concreto, pero el esfuerzo de construir bien el flujo de branding+WhatsApp+aprobación humana no es trivial.",
      "final": {
        "titulo": "El informe de fin de mes que se manda solo",
        "segmento": "community_managers",
        "dolor": "Todo fin de mes el CM pierde 2-3 horas por cliente armando a mano un PDF en Canva con capturas de Instagram/TikTok para justificar el fee; si se atrasa un día, el cliente ya pregunta \"¿y los resultados?\" y un mes de laburo real queda en duda por un informe, no por el trabajo en sí.",
        "categoriaDolor": "reportes_metricas",
        "descripcion": "Un reporte mensual que se arma y se manda solo, sin que el CM toque Canva: el CM carga (tipeando o pegando) los números clave del mes por cliente —alcance, seguidores nuevos, engagement, piezas publicadas— y el sistema arma el PDF con el logo y colores del cliente final, agrega un párrafo corto en criollo generado por IA que explica qué significan esos números, y lo manda por WhatsApp el día pactado con un mensaje tipo \"Hola [cliente], acá tu informe de julio 📊\". El CM aprueba en 2 minutos antes de que salga; no lo arma de cero ni depende de conectar la API de Instagram/TikTok (evita el cuello de botella de aprobación de Meta para cuentas de terceros).",
        "solucion": "MVP acotado dentro del panel del CM/agencia en el ERP: (1) un formulario simple para cargar las 4-5 métricas del mes por cliente (carga manual, sin integración de APIs sociales en esta v1); (2) el motor de reportes/branding ya existente arma el PDF con la marca del cliente final; (3) IA genera el resumen en lenguaje llano (\"creciste 8% en seguidores, tu pico fue el reel del martes\"); (4) el envío se dispara por el WhatsApp Business que el ERP ya usa para recordatorios, en la fecha configurada por cliente, con aprobación del CM antes de salir. Fase 2 (no incluida en este MVP): ingesta semi-automática vía captura de pantalla + OCR/vision, evitando pedir permisos de API a Meta.",
        "encajeGSG": "Reutiliza tres piezas que el ERP ya tiene funcionando: el motor de reportes/analytics cross-tenant, el sistema de branding por tenant, y la integración WhatsApp-first ya montada para recordatorios/cobros. No se construye dashboard ni canal de envío nuevo, ni se depende de aprobación de Meta API: se reconfigura lo existente para un caso de uso nuevo (agencia → sus clientes), en línea con el frente de Analytics cross-tenant (ADR-027).",
        "mejorasAplicadas": "Recorté el MVP al tamaño más chico vendible: saqué la integración con APIs de Instagram/TikTok (que exige aprobación de Meta y es un riesgo real de bloqueo) y la reemplacé por carga manual de métricas, dejando el OCR/vision como fase 2. Limpié el texto duplicado/corrupto de la versión anterior. Ajusté los scores a un nivel honesto: el dolor es real y el ahorro de tiempo es concreto, pero el esfuerzo de construir bien el flujo de branding+WhatsApp+aprobación humana no es trivial.",
        "impacto": 7,
        "confianza": 7,
        "esfuerzo": 4,
        "horasHumanas": 22,
        "costoHumanoUSD": 550,
        "pctAutomatizableIA": 65,
        "tiempoMVPdias": 6
      }
    },
    {
      "id": "r2-a506ea10",
      "ronda": 2,
      "autor": "Analítico",
      "autorKey": "analitico",
      "v1": {
        "titulo": "Tienda de mentorías/infoproductos para creadores"
      },
      "mejoraV2": "Se concretó el \"dónde\" (ficha visual con preview antes/después, no lista de texto — es lo que compra el ojo del creador) y el \"cómo se entrega\" (webhook automático a mentoría/agenda vs. archivo, en vez de dejarlo implícito). Se acotó el encaje GSG a las dos piezas nuevas reales (ficha UI + webhook de entrega) en vez de decir genéricamente \"se reutiliza todo\", y se eliminó la vaguedad de \"sin pelearse con dólares/tarjetas\" reemplazándola por el dato concreto de comisión 15-20%.",
      "mejoraV3": "Se validó que el dolor es real y pagable (ahorro de comisión concreto 15-20% vs. Hotmart/Gumroad, más estética propia vs. Linktree). Se recortó el MVP a solo dos piezas nuevas verificables (ficha visual + webhook de entrega digital), dejando fuera de este alcance cualquier feature de mentoría avanzada (cupos múltiples, recordatorios especiales) para no inflar esfuerzo. Se ajustaron los scores a la baja con honestidad: impacto y confianza moderados (nicho dentro del segmento, no todo influencer vende infoproducto), esfuerzo bajo-moderado por ser wiring sobre módulos ya probados en prod.",
      "final": {
        "categoriaDolor": "entregables_visuales",
        "confianza": 6,
        "costoHumanoUSD": 700,
        "descripcion": "Vidriera pública de infoproductos (presets, plantillas, mentorías 1:1) con estética de marca del creador y ficha de producto visual (preview antes/después, capturas, video corto) en vez de un link de Linktree o post fijado. Cobro en pesos vía Mercado Pago directo a la cuenta del creador, sin la comisión de 15-20% de Hotmart/Gumroad ni fricción de tarjeta internacional. Al acreditarse el pago, la entrega es automática: link de descarga para preset/plantilla, o redirección al módulo de agenda para reservar la mentoría 1:1 — sin que el creador gestione DMs uno por uno.",
        "dolor": "El creador que vende presets, plantillas o mentorías 1:1 no tiene dónde mostrarlas con buena estética (Linktree feo), pierde 15-20% de comisión en Hotmart/Gumroad y entrega todo a mano por DM cuando vende varias unidades el mismo día.",
        "encajeGSG": "Reutiliza storefront público + catálogo (blueprint retail) + checkout MP + módulo de agenda, ya construidos y en producción (Shine Velas, A Dos Manos). Piezas nuevas reales y acotadas: (1) ficha de producto con preview antes/después y video corto (mejora de UI del catálogo existente, no módulo nuevo) y (2) webhook \"producto digital → entrega automática\" sobre el checkout de MP ya existente. Sin infraestructura paga nueva.",
        "esfuerzo": 4,
        "horasHumanas": 32,
        "impacto": 6,
        "mejorasAplicadas": "Se validó que el dolor es real y pagable (ahorro de comisión concreto 15-20% vs. Hotmart/Gumroad, más estética propia vs. Linktree). Se recortó el MVP a solo dos piezas nuevas verificables (ficha visual + webhook de entrega digital), dejando fuera de este alcance cualquier feature de mentoría avanzada (cupos múltiples, recordatorios especiales) para no inflar esfuerzo. Se ajustaron los scores a la baja con honestidad: impacto y confianza moderados (nicho dentro del segmento, no todo influencer vende infoproducto), esfuerzo bajo-moderado por ser wiring sobre módulos ya probados en prod.",
        "pctAutomatizableIA": 80,
        "segmento": "influencers",
        "solucion": "Cada infoproducto se carga como producto de catálogo con stock ilimitado y tipo \"entrega digital\" en vez de envío físico. Al confirmarse el pago de MP, un webhook dispara automáticamente el link de descarga (Drive/archivo) o, si es mentoría 1:1, redirige al módulo de agenda ya existente para que el comprador reserve directo su horario. La ficha de producto se extiende con soporte de imagen antes/después y video corto para que la vidriera muestre el producto con la estética que el creador necesita para vender.",
        "tiempoMVPdias": 6,
        "titulo": "Vidriera de Infoproductos: mentorías, presets y plantillas con cobro en pesos y entrega automática"
      }
    },
    {
      "id": "r2-2cb95082",
      "ronda": 2,
      "autor": "Dev",
      "autorKey": "dev",
      "v1": {
        "titulo": "Cobrador automático para creativos freelance (factura + link de pago en un mensaje de WhatsApp)"
      },
      "mejoraV2": "Se afiló el dolor real: no es \"pierden horas armando presupuestos\", es la fricción social de cobrar y facturar (perseguir al cliente, pedirle el CUIT, la vergüenza de reclamar). Se concretó la solución a 2 taps de uso real en vez de un \"mini-ERP\" genérico, y se remarcó que no hay desarrollo nuevo de motor — solo reconfiguración de piezas existentes (recordatorios de turnos → recordatorios de cobro), subiendo el encaje GSG y bajando el costo de construirlo.",
      "mejoraV3": "Se validó que el dolor es concreto, recurrente y pagable (roza lo fiscal, así que hay urgencia real de resolverlo bien, no cosmético). Se recortó el MVP al mínimo vendible: sin agenda ni inventario, un solo tipo de objeto (orden de cobro con servicio de catálogo corto) y reutilización explícita de 3 motores existentes sin desarrollo nuevo, lo que baja esfuerzo a 4/10 y sube confianza al no depender de piezas por construir. Se ajustaron horas humanas a lo que realmente exige un Blueprint (config + QA de integración WhatsApp/MP/ARCA), no un producto nuevo.",
      "final": {
        "categoriaDolor": "cobros_facturacion",
        "confianza": 8,
        "costoHumanoUSD": 1400,
        "descripcion": "Blueprint ultra-liviano de un solo usuario para freelancers creativos (CM, editor, diseñador): cargan sus clientes de marca, generan una orden de cobro en dos taps (monto + servicio de una lista corta), el sistema manda automático el link de MP por WhatsApp, factura ARCA monotributo apenas se acredita, y si no pagó a las 48hs sale un recordatorio automático con el mismo tono que mandaría un cobrador humano. Un panel único con semáforo cobrado/pendiente/vencido reemplaza el Excel mental. Sin agenda, sin inventario, sin POS: solo clientes, órdenes de cobro tipo servicio, link de pago y factura automática.",
        "dolor": "El freelancer creativo no tiene problema de precio sino de cobranza: cotiza a mano por WhatsApp, después queda a merced del \"ya te transfiero\" que se diluye, y cuando cobra, la mitad de las veces no factura (vergüenza de pedir el CUIT, pereza de entrar al portal de ARCA), dejando ese ingreso en negro sin respaldo ni declaración.",
        "encajeGSG": "Reusa 100% el motor de Cobros, el Plugin ARCA (sandbox) y la integración MP ya construidos — cero motor nuevo, solo un Blueprint liviano (catálogo de \"servicios\" en vez de productos físicos, sin agenda/inventario). El recordatorio a 48hs reconfigura el motor de recordatorios de turnos aplicado a cobros. WhatsApp-first ya es pilar del ERP, así que la mensajería es reconfiguración, no feature nueva.",
        "esfuerzo": 4,
        "horasHumanas": 45,
        "impacto": 7,
        "mejorasAplicadas": "Se validó que el dolor es concreto, recurrente y pagable (roza lo fiscal, así que hay urgencia real de resolverlo bien, no cosmético). Se recortó el MVP al mínimo vendible: sin agenda ni inventario, un solo tipo de objeto (orden de cobro con servicio de catálogo corto) y reutilización explícita de 3 motores existentes sin desarrollo nuevo, lo que baja esfuerzo a 4/10 y sube confianza al no depender de piezas por construir. Se ajustaron horas humanas a lo que realmente exige un Blueprint (config + QA de integración WhatsApp/MP/ARCA), no un producto nuevo.",
        "pctAutomatizableIA": 85,
        "segmento": "creativos",
        "solucion": "Blueprint \"freelancer-creativo\" sobre el core existente: onboarding de 10 minutos (nombre, CUIT monotributo, WhatsApp Business), catálogo corto de servicios predefinidos, orden de cobro en 2 taps que dispara link de MP por WhatsApp y factura ARCA automática al acreditarse, recordatorio automático a 48hs si no pagó, y panel semáforo cobrado/pendiente/vencido. Se vende como suscripción mensual chica, muy por debajo de lo que cuesta que un contador arme esto a mano.",
        "tiempoMVPdias": 12,
        "titulo": "\"Che, ¿ya me depositaste?\" — nunca más: cobrás con factura y sin perseguir a nadie"
      }
    },
    {
      "id": "r2-4716d9dc",
      "ronda": 2,
      "autor": "Dev",
      "autorKey": "dev",
      "v1": {
        "titulo": "Media Kit + tarifario vivo como storefront público (vidriera para influencers)"
      },
      "mejoraV2": "Se sacó el humo de la integración con APIs de Meta/TikTok (poco realista y cara de mantener) y se reemplazó por carga manual mensual; se eliminó el checkout/Mercado Pago porque el objetivo es captar el lead, no cobrar en la página; se agregó el canal WhatsApp para la notificación del lead, apalancando lo que GSG ya tiene en vez de depender solo del CRM; se precisó el dolor con el costo concreto (perder la marca por falta de seguimiento/profesionalismo).",
      "mejoraV3": "Se acotó la confianza reconociendo que el mercado ya tiene alternativas gratuitas (Linktree/Beacons) para el media kit en sí, por lo que el MVP se redefine explícitamente alrededor del diferencial pagable: lead directo a WhatsApp+CRM con seguimiento, no la vidriera sola. Se bajó el esfuerzo a 3 (reutilización casi total de piezas existentes: storefront, CRM, WhatsApp) y se ajustaron horas/costo a un MVP mínimo real (blueprint + quitar checkout + wiring de lead + QA), sin inflar impacto ni confianza.",
      "final": {
        "categoriaDolor": "venta_captacion",
        "confianza": 6,
        "costoHumanoUSD": 280,
        "descripcion": "Página pública tipo storefront (misma tecnología del ERP) que funciona como media kit vivo del influencer: métricas clave por red (cargadas a mano, sin depender de APIs de Meta/TikTok), catálogo de paquetes de colaboración con precio (story, reel, posteo, combo) y un botón único de \"Solicitar cotización\". No hay checkout ni cobro online: el objetivo es reemplazar el PDF/Canva desactualizado por un link vivo y profesional que además genera un lead trazable. Compite de cerca con Linktree/Beacons gratuitos, así que el diferencial real y vendible es la integración nativa con el lead→WhatsApp→CRM, no la vidriera en sí.",
        "dolor": "El influencer cotiza colaboraciones a mano con un PDF/Canva desactualizado por DM, sin precios visibles ni canal de cotización formal, y pierde el seguimiento del lead frente a marcas que evalúan varios perfiles a la vez.",
        "encajeGSG": "Reutiliza el motor de storefront/vidriera multi-tenant (branding, catálogo, formulario), el módulo de clientes/CRM y el flujo WhatsApp-first ya existentes vía un blueprint nuevo \"media kit\" que saca Mercado Pago (no hay cobro) y ARCA (no hay factura). Mismo hosting Vercel multi-tenant y mismo generador de preset por IA (con el gate de autorización) para armar la primera versión desde el perfil de Instagram/TikTok del influencer.",
        "esfuerzo": 3,
        "horasHumanas": 18,
        "impacto": 6,
        "mejorasAplicadas": "Se acotó la confianza reconociendo que el mercado ya tiene alternativas gratuitas (Linktree/Beacons) para el media kit en sí, por lo que el MVP se redefine explícitamente alrededor del diferencial pagable: lead directo a WhatsApp+CRM con seguimiento, no la vidriera sola. Se bajó el esfuerzo a 3 (reutilización casi total de piezas existentes: storefront, CRM, WhatsApp) y se ajustaron horas/costo a un MVP mínimo real (blueprint + quitar checkout + wiring de lead + QA), sin inflar impacto ni confianza.",
        "pctAutomatizableIA": 85,
        "segmento": "influencers",
        "solucion": "Blueprint \"media kit\" sobre el motor de storefront existente: reemplaza \"producto\" por \"paquete de colaboración\" (nombre, formato, precio, descripción), agrega bloque de métricas manuales por red (actualización mensual vía formulario simple) y quita el checkout de Mercado Pago. El botón \"Solicitar cotización\" crea el lead en el CRM del influencer y dispara aviso por WhatsApp reutilizando el flujo ya construido. El preset por IA arma la primera versión a partir del perfil que el influencer comparte, con autorización registrada, igual que el generador de preset de marca existente.",
        "tiempoMVPdias": 6,
        "titulo": "Media Kit vivo (storefront de colaboraciones) con lead directo a WhatsApp/CRM"
      }
    },
    {
      "id": "r2-7e31cdc4",
      "ronda": 2,
      "autor": "Dev",
      "autorKey": "dev",
      "v1": {
        "titulo": "Agenda + cobro de sesiones/colaboraciones con marcas (booking para influencers y creativos)"
      },
      "mejoraV2": "Se afinó el dolor separando \"choque de fecha\" de \"plata perdida por no cobrar seña\" como dos síntomas del mismo problema raíz (falta de bloqueo con cobro). Se concretó la solución en 3 cambios puntuales y acotados (rename, 2 campos de schema, extender recordatorio existente a la fecha de entrega) en vez de \"adaptar blueprint\" en abstracto, y se explicitó que el gate de cobro es el mecanismo que convierte \"propuesta\" en \"confirmada\" — el punto de venta real de la solución.",
      "mejoraV3": "Se validó que el dolor (plata perdida por cancelación sin seña) es real y pagable, pero se bajó la confianza de \"altísima\" a 7 porque el creador promedio en Argentina recién empieza a formalizar cobro de seña con marcas chicas — es un hábito a instalar, no un dolor 100% consciente hoy. Se ajustó el esfuerzo a 3 (rename + 2 campos de schema + reutilizar recordatorio existente, sin pantallas nuevas) y las horas humanas a 14 (incluye QA del flujo de cobro end-to-end y ajuste de textos de branding por tenant), reflejando el tamaño real del MVP más chico vendible.",
      "final": {
        "categoriaDolor": "organizacion_agenda",
        "confianza": 7,
        "costoHumanoUSD": 280,
        "descripcion": "Se reconfigura el Blueprint de Agenda de servicios (ya en prod con CH Estética) para que cada fila deje de ser \"turno\" y pase a ser \"colaboración\": marca, fecha de grabación, fecha de entrega de contenido y estado de cobro. El mismo calendario visual de estética se relee como calendario de contenido: de un vistazo el creador ve qué le debe a cada marca y para cuándo. El bloqueo de fecha exige seña por Mercado Pago antes de confirmar — mismo mecanismo que ya reserva turnos, aplicado a otro rubro. Sin seña cobrada, la colaboración queda en \"propuesta\" y no bloquea la agenda ni dispara producción.",
        "dolor": "El creador coordina grabaciones y entregas con 3-5 marcas en paralelo a mano por WhatsApp: sin agenda centralizada dobla fechas, se le pisan entregas, y arranca a producir sin cobrar seña — así queda plata afuera cuando la marca cancela o corre el shooting a último momento.",
        "encajeGSG": "Reusa el core más maduro en prod (Agenda+Recordatorios+Cobros de CH Estética) vía blueprints/branding por tenant — el principio de variante de ADR-055 aplicado a un rubro nuevo sin construir módulo aparte. Apalanca la integración de Mercado Pago ya cableada (seña) y los recordatorios de WhatsApp ya operativos: ambos a costo marginal de infraestructura cero porque el rail ya existe.",
        "esfuerzo": 3,
        "horasHumanas": 14,
        "impacto": 6,
        "mejorasAplicadas": "Se validó que el dolor (plata perdida por cancelación sin seña) es real y pagable, pero se bajó la confianza de \"altísima\" a 7 porque el creador promedio en Argentina recién empieza a formalizar cobro de seña con marcas chicas — es un hábito a instalar, no un dolor 100% consciente hoy. Se ajustó el esfuerzo a 3 (rename + 2 campos de schema + reutilizar recordatorio existente, sin pantallas nuevas) y las horas humanas a 14 (incluye QA del flujo de cobro end-to-end y ajuste de textos de branding por tenant), reflejando el tamaño real del MVP más chico vendible.",
        "pctAutomatizableIA": 80,
        "segmento": "transversal",
        "solucion": "Blueprint \"colaboraciones\" derivado 1:1 del Blueprint de servicios, mismo motor de Agenda+Recordatorios+Cobros, blanco distinto: (1) rename turno→colaboración y profesional→marca en textos y storefront/backoffice vía branding por tenant; (2) 2 campos nuevos en el modelo existente (tipo de contenido: reel/foto/story/UGC; fecha de entrega de contenido, distinta de la fecha de grabación); (3) activar el recordatorio de WhatsApp ya existente también para la fecha de entrega; (4) el cobro de seña por Mercado Pago sigue siendo la condición que pasa la colaboración de \"propuesta\" a \"confirmada\". Cero pantallas nuevas.",
        "tiempoMVPdias": 6,
        "titulo": "Blindaje de seña: agenda de colaboraciones con marcas + cobro anticipado por Mercado Pago"
      }
    },
    {
      "id": "r2-173d9dc0",
      "ronda": 2,
      "autor": "Dev",
      "autorKey": "dev",
      "v1": {
        "titulo": "Reporte mensual automático de resultados para clientes de CM/agencia chica"
      },
      "mejoraV2": "Se cuantificó el dolor con tarifas y horas reales del mercado argentino de CM, se precisó que el sello GSG va discreto en backoffice y no en el reporte (marca del CM), se agregó el cruce con MP para automatizar el estado de cobro sin carga manual, y se marcó honestamente la conexión a APIs de redes como fase 2 con costo a evaluar (no se asume gratis).",
      "mejoraV3": "Se recortó el MVP a carga manual de métricas (sin prometer conectores de API en el alcance ni en el costo/tiempo), se puntuó con honestidad bajando impacto y confianza por ser un nicho de ticket bajo dentro del ERP (no vende solo), y se ajustaron horas/costo a un desarrollo realista de formulario + template de reporte + integración de disparo y cruce de cobro, sin inflar el % automatizable por IA (la construcción del software la sigue haciendo un humano).",
      "final": {
        "titulo": "Reporte mensual automático de resultados (marca del CM) vía WhatsApp para justificar el fee",
        "segmento": "community_managers",
        "dolor": "El CM freelance/agencia chica en Argentina cobra $80.000-$250.000 por cliente/mes y lleva 5-10 cuentas a la vez; a fin de mes pierde 6-8 horas armando a mano en Canva el reporte que \"justifica\" el fee, tarea que no factura pero cuya ausencia dispara dudas de renovación. Es el momento de mayor fricción y mayor riesgo de pérdida del cliente del mes.",
        "categoriaDolor": "reportes_metricas",
        "descripcion": "Generador automático de reporte mensual con la marca del CM (nunca la de GSG) que arma una página web + PDF: métricas del mes cargadas por el CM (alcance, engagement, seguidores), grid del contenido publicado, resumen ejecutivo en criollo redactado por IA, y estado de cobro (pagado/pendiente) cruzado con Mercado Pago. Se dispara solo el día 1 de cada mes por WhatsApp, sin que el CM abra Canva ni Excel. MVP explícitamente manual en la carga de métricas: sin conectores de API de Meta/TikTok (eso queda evaluado como fase 2, no incluida en el costo/tiempo de este MVP).",
        "solucion": "Tenant \"Estudio CM\" en el ERP: cada cliente del CM es una cuenta con un formulario simple de carga mensual de métricas (5-6 campos). El motor de IA (costo $0) redacta el resumen ejecutivo en tono humano/criollo (zona humana, ADR-046); el storefront ya soporta branding por cliente para pintar la página con la marca del CM; el motor de recordatorios/WhatsApp ya existente dispara el envío automático el día 1; el estado pagado/pendiente se cruza con Mercado Pago (ya integrado), sin carga manual de ese dato.",
        "encajeGSG": "Reutiliza al 100% infraestructura ya construida: motor de recordatorios/WhatsApp, branding multi-tenant del storefront, integración MP para estado de cobro, y el trabajo de reportes de Agencia Digital. Cero infraestructura nueva paga para el MVP; el único costo real es horas humanas de desarrollo y la carga manual de métricas por el CM hasta que se evalúe (fase 2, no incluida acá) un conector de API que en varios casos es pago.",
        "mejorasAplicadas": "Se recortó el MVP a carga manual de métricas (sin prometer conectores de API en el alcance ni en el costo/tiempo), se puntuó con honestidad bajando impacto y confianza por ser un nicho de ticket bajo dentro del ERP (no vende solo), y se ajustaron horas/costo a un desarrollo realista de formulario + template de reporte + integración de disparo y cruce de cobro, sin inflar el % automatizable por IA (la construcción del software la sigue haciendo un humano).",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 5,
        "horasHumanas": 65,
        "costoHumanoUSD": 900,
        "pctAutomatizableIA": 65,
        "tiempoMVPdias": 10
      }
    },
    {
      "id": "r2-938fc27d",
      "ronda": 2,
      "autor": "Dev",
      "autorKey": "dev",
      "v1": {
        "titulo": "Catálogo + venta directa de productos digitales/presets desde WhatsApp (infoproductos de creativos)"
      },
      "mejoraV2": "Concreté el dolor con escenarios reales (venta perdida de madrugada, clonado de preset, doble booking de mentorías) en vez de descripción genérica. Bajé el alcance de \"blueprint nuevo\" a \"configuración/variante del retail existente\" para evitar duplicación de objetos (coherente con ADR-055) y reducir superficie de mantenimiento. Título y descripción reescritos en tono criollo/directo de venta, no de ficha técnica.",
      "mejoraV3": "Validé que el dolor es real pero de nicho acotado (creativos que ya venden infoproductos, no todo el segmento) y bajé la confianza de \"altísima\" a honesta (6/10) porque no hay validación directa con un cliente pagando por esto todavía. Recorté el MVP a lo mínimo vendible: un trigger único (webhook→WhatsApp) sobre el retail existente, sin tocar catálogo. Ajusté esfuerzo/horas a una estimación conservadora (26h humanas: webhook, template de WhatsApp, QA de stock/mentorías, prueba end-to-end con pago real) y until costo (~US$650) contemplando solo trabajo humano e infra paga, sin contar lo que resuelve la IA.",
      "final": {
        "categoriaDolor": "entregables_visuales",
        "confianza": 6,
        "costoHumanoUSD": 650,
        "descripcion": "Storefront liviano (3 a 8 productos digitales: preset, pack de LUTs, plantilla, cupo de mentoría) donde el cliente paga con Mercado Pago y recibe automáticamente por WhatsApp el archivo o el link de agenda, sin que el creativo esté online. Los ítems con stock limitado (mentorías, cupos de vivo) se cierran solos al agotarse, evitando el doble booking. Pensado para lanzar en un día, no como campus virtual: es una variante de configuración del retail existente, no un blueprint nuevo.",
        "dolor": "El creativo que vende presets, plantillas o cupos de mentoría 1:1 depende de transferencia + \"ahora te paso el link\" manual: pierde ventas fuera de horario, no controla la reventa/clonado del archivo, y se le mezclan los cupos de mentoría hasta agendar doble.",
        "encajeGSG": "100% sobre rieles existentes: Blueprint de retail (ya probado en Shine Velas y A Dos Manos) + Mercado Pago + módulo de mensajería WhatsApp, todo multi-tenant. Único desarrollo nuevo es el trigger de entrega post-pago (webhook MP → envío WhatsApp), acotado y reversible; no duplica objetos de catálogo (ADR-055): el infoproducto es una variante de ítem (trackStock true/false), no una entidad nueva.",
        "esfuerzo": 4,
        "horasHumanas": 26,
        "impacto": 6,
        "mejorasAplicadas": "Validé que el dolor es real pero de nicho acotado (creativos que ya venden infoproductos, no todo el segmento) y bajé la confianza de \"altísima\" a honesta (6/10) porque no hay validación directa con un cliente pagando por esto todavía. Recorté el MVP a lo mínimo vendible: un trigger único (webhook→WhatsApp) sobre el retail existente, sin tocar catálogo. Ajusté esfuerzo/horas a una estimación conservadora (26h humanas: webhook, template de WhatsApp, QA de stock/mentorías, prueba end-to-end con pago real) y until costo (~US$650) contemplando solo trabajo humano e infra paga, sin contar lo que resuelve la IA.",
        "pctAutomatizableIA": 85,
        "segmento": "creativos",
        "solucion": "Se trata cada infoproducto como ítem del catálogo/inventario existente: trackStock=false para archivos ilimitados (preset, LUTs, plantilla) o trackStock=true con stock chico para cupos de mentoría/curso en vivo. Al acreditarse el pago vía webhook de Mercado Pago (ya integrado), se dispara un envío de WhatsApp (reusa el módulo de mensajería/recordatorios) con el archivo adjunto o el link de agenda. Único desarrollo nuevo: el trigger de entrega post-pago; el resto es configuración del retail ya existente.",
        "tiempoMVPdias": 6,
        "titulo": "\"Comprá y listo\": link de pago para presets, plantillas y mentorías que se entrega solo por WhatsApp"
      }
    },
    {
      "id": "r2-1dc2026c",
      "ronda": 2,
      "autor": "Dev",
      "autorKey": "dev",
      "v1": {
        "titulo": "CRM de marcas y negociaciones para influencers (pipeline de colaboraciones)"
      },
      "mejoraV2": "Concreté el dolor con su costo económico explícito (propuestas frías, cobros que se pierden, descuentos por desmemoria) en vez de solo \"desorden\". Fijé las etapas del pipeline y agregué monto/moneda e historial de tarifas por marca para evitar subcotizar. Until now el cierre del ciclo con cobro quedaba solo mencionado; ahora especifico el trigger automático que crea el registro de cobro al pasar a 'Cerrado', y aclaré que la implementación es solo 2 campos + 1 vista (sin migración de arquitectura).",
      "mejoraV3": "Validé el dolor como real pero de pago incierto como producto standalone (encaja mejor como feature/add-on dentro del ERP que como venta aislada), lo cual bajó confianza e impacto respecto de v2. Recorté el MVP a su mínimo vendible: sin dashboards ni reportes extra, solo kanban + recordatorio + trigger de cobro. Puntué con honestidad: esfuerzo bajo (3) por reuso casi total, pero impacto y confianza moderados (6) porque el segmento (influencers individuales) suele resolver esto hoy con Excel/Notion gratis y la disposición a pagar aparte no está probada; el valor real es como diferencial dentro de una suscripción ERP ya vendida, no como producto nuevo por sí solo.",
      "final": {
        "categoriaDolor": "gestion_clientes_marcas",
        "confianza": 6,
        "costoHumanoUSD": 450,
        "descripcion": "Pipeline kanban de negociaciones con marcas, montado sobre el módulo de clientes ya existente: 2 campos nuevos (`etapaNegociacion` enum, `montoNegociado`) + 1 vista kanban filtrando la lista de clientes por etapa. Recordatorio automático por WhatsApp cuando una negociación lleva N días sin movimiento, reusando el motor de recordatorios de turnos con una regla nueva de inactividad. Al mover una negociación a 'Cerrado', un trigger crea el registro de cobro pendiente en el módulo de cobros/ARCA/MP ya existente, con el monto precargado. Historial simple de tarifa por marca para evitar subcotizar por desmemoria. Sin modelo de datos nuevo ni migración de arquitectura: es dato + 1 vista + 1 regla + 1 trigger sobre lo que el ERP ya tiene.",
        "dolor": "El influencer/CM maneja 10-20 negociaciones simultáneas por DM/WhatsApp sin registro estructurado: no sabe cuánto ofreció cada marca, en qué etapa quedó, ni cuándo hacer seguimiento — resultado en propuestas que se enfrían, colaboraciones cerradas de palabra que nunca se facturan, y descuentos regalados por no recordar la tarifa anterior a marcas similares.",
        "encajeGSG": "100% dato, cero arquitectura nueva: 2 campos en el modelo Cliente + 1 vista kanban + 1 regla nueva en el motor de recordatorios WhatsApp-first ya construido + 1 trigger que crea el cobro reutilizando el módulo de cobros/ARCA/MP existente. No toca RBAC, RLS ni storefront; es feature incremental sobre el ERP core, vendible como add-on a tenants existentes del segmento.",
        "esfuerzo": 3,
        "horasHumanas": 28,
        "impacto": 6,
        "mejorasAplicadas": "Validé el dolor como real pero de pago incierto como producto standalone (encaja mejor como feature/add-on dentro del ERP que como venta aislada), lo cual bajó confianza e impacto respecto de v2. Recorté el MVP a su mínimo vendible: sin dashboards ni reportes extra, solo kanban + recordatorio + trigger de cobro. Puntué con honestidad: esfuerzo bajo (3) por reuso casi total, pero impacto y confianza moderados (6) porque el segmento (influencers individuales) suele resolver esto hoy con Excel/Notion gratis y la disposición a pagar aparte no está probada; el valor real es como diferencial dentro de una suscripción ERP ya vendida, no como producto nuevo por sí solo.",
        "pctAutomatizableIA": 75,
        "segmento": "influencers",
        "solucion": "Reutilizar el módulo de clientes: cada \"marca\" es un cliente con `etapaNegociacion` (enum: Contacto/Propuesta enviada/En negociación/Cerrado/Cobrado) y `montoNegociado`. Vista kanban liviana sobre la lista de clientes existente. El motor de recordatorios WhatsApp ya construido se reconfigura con la regla \"sin actividad en la ficha por N días\". Al pasar a 'Cerrado', un trigger crea el registro en el módulo de cobros ya existente (MP o manual) con el monto precargado, listo para facturar por ARCA.",
        "tiempoMVPdias": 4,
        "titulo": "CRM de marcas: pipeline de negociaciones para influencers"
      }
    },
    {
      "id": "r2-28821f03",
      "ronda": 2,
      "autor": "Diseñador experto",
      "autorKey": "disenador",
      "v1": {
        "titulo": "Media Kit generador automático desde storefront"
      },
      "mejoraV2": "Test corto de mejoras.",
      "mejoraV3": "Se sacó del MVP la integración con APIs de redes sociales (cara, fragil, no imprescindible) y se reemplazó por campos editables a mano por el propio creador, lo que baja el esfuerzo y el costo de mantenimiento. Se acotaron descripción y solución a la reutilización concreta de storefront+catálogo ya existentes, y se dejó explícito el CTA de WhatsApp por paquete como único mecanismo de conversión del MVP.",
      "final": {
        "titulo": "Media Kit vivo (link único, siempre al día) desde el storefront",
        "segmento": "influencers",
        "dolor": "El creador cotiza por WhatsApp y manda media kits en PDF que quedan desactualizados (precios viejos por la inflación, stats viejas), perdiendo horas reescribiendo y perdiendo pauta por mandar tarifas que ya no rigen.",
        "categoriaDolor": "entregables_visuales",
        "descripcion": "Un link único y público (tipo linktree pero con vidriera propia) que muestra el media kit del creador siempre actualizado: bio, stats clave (editables por el propio creador, sin integración a la API de IG en el MVP), y una tarilfa de paquetes/servicios que se actualiza desde el mismo panel que usa para su catálogo. En vez de reescribir un PDF cada vez que sube un precio, el creador edita un campo en su backoffice y el link que ya mandó por WhatsApp muestra el precio nuevo al instante. El CTA principal de cada paquete es \"Coordinar por WhatsApp\", cerrando el círculo de cotización sin fricción.",
        "solucion": "Reutilizar el motor de storefront/vidriera y el módulo de catálogo que el ERP ya tiene para tenants de productos/servicios, armando un blueprint nuevo \"media kit de influencer\": página pública con bio, foto, 3-5 métricas editables a mano (seguidores, alcance, engagement) y una tabla de paquetes (post, reel, combo, story) con precio y botón de WhatsApp por ítem. Nada de scraping ni integración con la API de Instagram/TikTok en el MVP -eso se deja para una v2 si el cliente lo pide y paga por eso-. El creador edita precios y stats desde el mismo panel simple que ya usan otros tenants para su catálogo.",
        "encajeGSG": "Apalanca directamente tres piezas ya construidas y pagas: el motor de storefront/vidriera pública por tenant, el módulo de catálogo/precios (ABM ya existente) y el enfoque WhatsApp-first de todo el ERP. Es un blueprint/preset nuevo sobre infraestructura existente, no un desarrollo desde cero -mismo patrón que otros rubros (Break Point, Magra) generados por el flujo de preset por IA.",
        "mejorasAplicadas": "Se sacó del MVP la integración con APIs de redes sociales (cara, fragil, no imprescindible) y se reemplazó por campos editables a mano por el propio creador, lo que baja el esfuerzo y el costo de mantenimiento. Se acotaron descripción y solución a la reutilización concreta de storefront+catálogo ya existentes, y se dejó explícito el CTA de WhatsApp por paquete como único mecanismo de conversión del MVP.",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 24,
        "costoHumanoUSD": 480,
        "pctAutomatizableIA": 65,
        "tiempoMVPdias": 5
      }
    },
    {
      "id": "r2-66b63a73",
      "ronda": 2,
      "autor": "Diseñador experto",
      "autorKey": "disenador",
      "v1": {
        "titulo": "Reporte mensual para marcas con cobro de campaña integrado"
      },
      "mejoraV2": "Concreté el dolor con la fricción real (WhatsApp + vergüenza de reclamar cobro), until now el título era genérico y ahora vende el beneficio directo (un solo link). Until now el flujo era ambiguo entre generar automático vs manual: definí que el influencer arma el informe y elige manualmente factura o recibo, evitando prometer automatización de datos que Meta no expone fácil vía API pública. Recorté \"categoriaDolorSecundaria\" (no está en el schema) y until now el encaje decía \"sin desarrollar motor de pagos nuevo\" de forma vaga; ahora aclaro que también se reusa el módulo de clientes, eliminando la única pieza que sonaba a desarrollo desde cero.",
      "mejoraV3": "Confirmo el MVP más chico vendible: carga manual de KPIs (sin prometer integración con la API de Meta, que no está disponible fácil para creadores individuales), reutilizando 100% módulos existentes de clientes/facturación/MP. Ajusté el scoring a la baja con honestidad: es un nicho angosto (influencers que ya facturan a marcas formalmente, no todos), por eso impacto y confianza quedan moderados y no altos; el esfuerzo es bajo porque no hay lógica de negocio nueva, solo una vista compuesta.",
      "final": {
        "titulo": "El informe que la marca pide y el cobro que vos necesitás, en un solo link",
        "segmento": "influencers",
        "dolor": "Terminada la campaña, el influencer pierde media tarde armando un Canva/PDF con capturas y métricas para \"justificar\" el pago, y después persigue por WhatsApp los datos de cobro y el comprobante — sin factura ni recibo prolijo, cobrando semanas tarde por vergüenza de reclamar.",
        "categoriaDolor": "reportes_metricas",
        "descripcion": "Un \"informe de campaña\" armado desde el ERP: el influencer carga capturas de stories/posts y KPIs (alcance, likes, views) a mano, elige la marca del listado de clientes y el monto pactado. El sistema genera un único link/PDF con el informe arriba y, pegado abajo, el medio de cobro: factura ARCA o recibo simple más el link de pago de Mercado Pago. La marca ve todo en un lugar y paga desde ahí, sin cadena de WhatsApp ni pedir el CBU de nuevo.",
        "solucion": "Nuevo tipo de documento \"Informe de campaña\" sobre el módulo de clientes (la marca ya existe como cliente) y el de facturación/cobros ya construido: arriba, secciones editables de contenido (imágenes + KPIs manuales cargados a mano, sin integrarse a la API de Meta); abajo, botón \"Generar factura ARCA\" o \"Generar recibo\" + botón \"Crear link de pago MP\". Un solo link corto para la marca. No se toca el motor de pagos ni el de facturación, solo una vista de presentación que los antecede.",
        "encajeGSG": "Reusa tal cual la facturación ARCA/AFIP sandbox, la integración Mercado Pago y el módulo de clientes que el ERP ya tiene — cero motor nuevo, solo una capa de presentación (el informe) delante de documentos de cobro existentes.",
        "mejorasAplicadas": "Confirmo el MVP más chico vendible: carga manual de KPIs (sin prometer integración con la API de Meta, que no está disponible fácil para creadores individuales), reutilizando 100% módulos existentes de clientes/facturación/MP. Ajusté el scoring a la baja con honestidad: es un nicho angosto (influencers que ya facturan a marcas formalmente, no todos), por eso impacto y confianza quedan moderados y no altos; el esfuerzo es bajo porque no hay lógica de negocio nueva, solo una vista compuesta.",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 28,
        "costoHumanoUSD": 420,
        "pctAutomatizableIA": 75,
        "tiempoMVPdias": 5
      }
    },
    {
      "id": "r2-8f413934",
      "ronda": 2,
      "autor": "Diseñador experto",
      "autorKey": "disenador",
      "v1": {
        "titulo": "Calendario de contenido compartido con clientes (agenda del ERP reutilizada)"
      },
      "mejoraV2": "Concreté el dolor (trazabilidad de aprobaciones, no solo \"calendario disperso\"), aterricé la solución en un flujo operativo puntual (subir pieza → notificar → aprobar/rechazar con recordatorio automático) en vez de describir en abstracto, y until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until aterricé el encaje citando los tres componentes reales que reusa (agenda, WhatsApp, acceso sin login) sin agregar alcance nuevo.",
      "mejoraV3": "Se limpió el texto corrupto de la v2 (bucle de \"until\" repetido sin sentido en mejorasAplicadas). Se acotó explícitamente el alcance del MVP para dejar fuera edición de imagen y publicación automática a redes, evitando scope creep hacia un dominio nuevo (integración con APIs de Instagram/Meta), que encarecería el esfuerzo sin validar primero el dolor con clientes pagos. Se ajustaron los scores a un nivel más honesto: el dolor es real pero de pago moderado (herramienta de productividad interna, no genera ingresos directos al CM), y el esfuerzo, aunque bajo por reuso, no es trivial por la landing pública nueva y el ABM del objeto pieza.",
      "final": {
        "titulo": "Calendario de aprobación de contenido con clientes (agenda del ERP reconvertida)",
        "segmento": "community_managers",
        "dolor": "El CM maneja 5-10 cuentas en paralelo con calendarios dispersos en Excel/Notion/Drive, y aprobar piezas con el cliente implica ida y vuelta manual por WhatsApp (capturas, \"sí dale\", \"cambiá el texto\") sin trazabilidad de qué quedó aprobado, cuándo y en qué versión.",
        "categoriaDolor": "organizacion_agenda",
        "descripcion": "Se reconvierte el módulo de agenda/turnos (ya multi-tenant, con estados y recordatorios) en un calendario de piezas de contenido: cada \"turno\" pasa a ser una pieza con estado borrador → en aprobación → aprobado/rechazado → publicado, asignada a un cliente puntual. El CM sube la pieza (imagen/copy) desde su backoffice; el cliente la ve y aprueba desde un link sin login, igual que el probador/storefront. Si el cliente no responde en X horas, el ERP dispara solo el recordatorio por WhatsApp, así el CM deja de perseguir aprobaciones a mano y queda registro de quién aprobó qué y cuándo.",
        "solucion": "MVP acotado: una vista \"Aprobaciones\" (tablero tipo kanban por estado) dentro del backoffice existente del CM, más una landing pública de aprobación sin contraseña (mismo patrón que el storefront). Se reutiliza tal cual el motor de agenda/turnos (estado+fecha) y los recordatorios automáticos WhatsApp; el trabajo real es: (1) agregar el objeto \"pieza de contenido\" con su propio ABM (adjunto/preview, copy, cliente asignado, estado) siguiendo el patrón objeto-crea-una-vez/asigna de ADR-055, y (2) la landing de aprobación de un solo botón (aprobar/rechazar + comentario). No incluye edición de imagen ni programación real de publicación en redes (eso queda para una v2 si el dolor se valida con clientes pagos).",
        "encajeGSG": "Encaja directo con tres piezas ya construidas del ERP: motor de agenda/turnos (estados+fechas+recordatorios), integración WhatsApp-first, y el patrón de acceso sin login del probador/storefront. Es reconfiguración de un dominio existente (nuevo objeto \"pieza\" con su ABM, no una feature de cero), coherente con ADR-055 (objeto se crea una vez, se asigna con ABM propio).",
        "mejorasAplicadas": "Se limpió el texto corrupto de la v2 (bucle de \"until\" repetido sin sentido en mejorasAplicadas). Se acotó explícitamente el alcance del MVP para dejar fuera edición de imagen y publicación automática a redes, evitando scope creep hacia un dominio nuevo (integración con APIs de Instagram/Meta), que encarecería el esfuerzo sin validar primero el dolor con clientes pagos. Se ajustaron los scores a un nivel más honesto: el dolor es real pero de pago moderado (herramienta de productividad interna, no genera ingresos directos al CM), y el esfuerzo, aunque bajo por reuso, no es trivial por la landing pública nueva y el ABM del objeto pieza.",
        "impacto": 5,
        "confianza": 6,
        "esfuerzo": 4,
        "horasHumanas": 45,
        "costoHumanoUSD": 550,
        "pctAutomatizableIA": 75,
        "tiempoMVPdias": 12
      }
    },
    {
      "id": "r2-81f29db5",
      "ronda": 2,
      "autor": "Diseñador experto",
      "autorKey": "disenador",
      "v1": {
        "titulo": "Portfolio/catálogo de servicios con checkout directo para creativos freelance"
      },
      "mejoraV2": "Concreté el dolor (de \"portfolio sin checkout\" a \"gestión de seña/reserva dispersa en el chat\"), agregué el módulo de agenda/reservas y el webhook de WhatsApp existente como parte de la solución (no solo catálogo+MP), y until acoté el desarrollo nuevo a un único delta real (blueprint visual + ocultar campo stock) en vez de dejarlo como \"una skin\" sin precisar qué cambia técnicamente.",
      "mejoraV3": "Se validó que el dolor es concreto y recurrente (mezcla de pedidos/señas por chat, no solo \"falta de portfolio\"), se acotó el desarrollo nuevo a dos ítems verificables (blueprint visual + ocultar stock) y se bajó la estimación de esfuerzo/horas a lo que realmente implica un delta de configuración sobre módulos ya productivos, sin inflar el puntaje de impacto dado que es un nicho dentro de creativos con ticket de venta bajo.",
      "final": {
        "titulo": "Vidriera-Portfolio con seña por Mercado Pago para creativos freelance",
        "segmento": "creativos",
        "dolor": "El creativo freelance (diseñador, editor, fotógrafo) cotiza y cobra por DM/WhatsApp con un link de Mercado Pago suelto: no queda un registro único de qué cliente pagó seña, qué pack contrató y para cuándo, así que pierde profesionalismo y se le mezclan pedidos.",
        "categoriaDolor": "venta_captacion",
        "descripcion": "Storefront público \"portfolio + tienda de packs\" con blueprint propio del Generador de Preset IA: el creativo carga sus packs de servicio (con foto de tapa y galería de trabajos), el cliente entra desde el link de bio, elige el pack, paga seña por Checkout Pro y el pedido queda como reserva \"señado\" en un panel único, con aviso automático por WhatsApp al recibir el pago. Reemplaza la cadena manual DM→link MP suelto→captura de pantalla por un flujo con registro persistente y trazable.",
        "solucion": "MVP acotado: (1) blueprint visual \"portfolio creativo\" para el storefront (galería grande, sin grilla de góndola) generado por el Generador de Preset IA; (2) ocultar/campo opcional \"stock\" en el catálogo para este blueprint, porque el servicio creativo no tiene stock; (3) reusar tal cual catálogo, storefront, checkout Mercado Pago, agenda/reservas y el webhook de WhatsApp que ya dispara confirmaciones en otros tenants de servicios. Cero backend nuevo: es configuración + un blueprint + un ajuste de UI condicional.",
        "encajeGSG": "100% motor existente: catálogo+storefront+Mercado Pago (Checkout Pro)+agenda/reservas+webhook de WhatsApp, la misma base que corre para barberías/salones. El único delta real es el blueprint de branding \"portfolio\" (misma pipeline de presets que Break Point/Magra) y ocultar el campo stock para este rubro.",
        "mejorasAplicadas": "Se validó que el dolor es concreto y recurrente (mezcla de pedidos/señas por chat, no solo \"falta de portfolio\"), se acotó el desarrollo nuevo a dos ítems verificables (blueprint visual + ocultar stock) y se bajó la estimación de esfuerzo/horas a lo que realmente implica un delta de configuración sobre módulos ya productivos, sin inflar el puntaje de impacto dado que es un nicho dentro de creativos con ticket de venta bajo.",
        "impacto": 6,
        "confianza": 7,
        "esfuerzo": 3,
        "horasHumanas": 16,
        "costoHumanoUSD": 250,
        "pctAutomatizableIA": 85,
        "tiempoMVPdias": 6
      }
    },
    {
      "id": "r2-cd683b64",
      "ronda": 2,
      "autor": "Diseñador experto",
      "autorKey": "disenador",
      "v1": {
        "titulo": "Panel de gestión multi-cliente para community managers (mini-ERP por CM)"
      },
      "mejoraV2": "Concreté el dolor con el detalle real argentino (monotributo, factura tardía, WhatsApp como bitácora informal) en vez de una descripción genérica. Acoté la solución para que no implique construir conectores a APIs de redes sociales (costo/fragilidad alto) — el reporte es un PDF armado con datos ya cargados a mano, no scraping de métricas reales. Agregué que el propio CM también factura sus cobros vía ARCA sandbox, cerrando el círculo cobro→factura que la v1 dejaba implícito. Puse rango de precio de mercado (AR$80-150k/mes) como referencia de plausibilidad económica.",
      "mejoraV3": "Validé que el dolor es real pero ajusté la confianza en \"pagable\": el CM freelance es precio-sensible y compite contra herramientas gratuitas (Notion, Excel) que ya tiene instaladas, así que la fricción de adopción es mayor que en un negocio con local físico — esto bajó el score de confianza e impacto respecto a v2. Recorté el MVP al flujo mínimo demostrable (1 marca, 1 ciclo cobro-recordatorio-reporte) en vez de todo el blueprint completo, para acotar horas humanas reales de configuración y prueba del preset.",
      "final": {
        "titulo": "Panel de gestión multi-cliente para community managers (mini-ERP por CM)",
        "segmento": "community_managers",
        "dolor": "El CM freelance argentino que lleva 5-8 cuentas cobra por transferencia/MP sin orden, factura tarde o no factura, y cuando el cliente pregunta \"¿me mandaste el reporte de este mes?\" lo busca en un Excel viejo o scrolleando WhatsApp para atrás — tiene 4 herramientas sueltas (Excel, Notion, WhatsApp, Drive) que no hablan entre sí.",
        "categoriaDolor": "gestion_clientes_marcas",
        "descripcion": "Blueprint de tenant \"Agencia CM\" en el generador de preset IA: cada marca-cliente es un cliente del CRM, con su plan mensual (AR$80-150k) como cobro recurrente con recordatorio WhatsApp a los 3 y 7 días de vencido, calendario editorial de contenido pendiente de aprobación, y botón \"generar reporte del mes\" que arma un PDF con lo publicado y métricas cargadas a mano. Dashboard único: qué me deben, qué tengo que aprobar, qué reporte tengo que mandar. El CM factura sus cobros vía ARCA sandbox (monotributo) sin salir del sistema.",
        "solucion": "Combina 4 módulos ya existentes (CRM, recordatorios WhatsApp, cobros/ARCA/MP, agenda resignificada como calendario editorial) vía el Generador de Preset por IA — solo vocabulario (cliente→marca, turno→contenido, servicio→plan), sin tocar backend ni construir conectores a APIs de redes sociales (el riesgo/costo real que se evita). MVP mínimo vendible: preset + 1 flujo de demo (alta de marca → cobro recurrente → recordatorio → reporte PDF), sin onboarding masivo todavía.",
        "encajeGSG": "100% blueprint nuevo sobre módulos probados en otros tenants (CRM, cobros/ARCA/MP, recordatorios WhatsApp, agenda). Cero conectores nuevos a Meta/TikTok/Instagram — el reporte es manual-asistido con datos ya cargados, no scraping de métricas reales, lo que mantiene el esfuerzo bajo y evita el punto más frágil del dominio.",
        "mejorasAplicadas": "Validé que el dolor es real pero ajusté la confianza en \"pagable\": el CM freelance es precio-sensible y compite contra herramientas gratuitas (Notion, Excel) que ya tiene instaladas, así que la fricción de adopción es mayor que en un negocio con local físico — esto bajó el score de confianza e impacto respecto a v2. Recorté el MVP al flujo mínimo demostrable (1 marca, 1 ciclo cobro-recordatorio-reporte) en vez de todo el blueprint completo, para acotar horas humanas reales de configuración y prueba del preset.",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 18,
        "costoHumanoUSD": 450,
        "pctAutomatizableIA": 85,
        "tiempoMVPdias": 5
      }
    },
    {
      "id": "r2-c4b98d24",
      "ronda": 2,
      "autor": "Analista de mercado local",
      "autorKey": "mercado",
      "v1": {
        "titulo": "Facturador automático WhatsApp-first para creadores"
      },
      "mejoraV2": "Acoté el dolor a algo verificable (miedo a recategorización, no \"problemas con AFIP\" genérico); reemplacé el vago \"recordatorio de facturaste todo\" por un cálculo concreto (facturado vs cobrado vs techo de categoría cargado a mano, sin prometer scraping/integración con AFIP que no existe); aclaré que el parser es NLU liviano, no IA cara, y until que se vende como add-on de tenants existentes en vez de producto nuevo, bajando el costo de desarrollo y venta.",
      "mejoraV3": "Validé que el dolor es real y específico (miedo a recategorización, no \"problemas con AFIP\" genérico) pero acoté aún más el impacto de negocio: es un add-on de nicho dentro de un nicho (solo sirve a tenants influencer que además sean monotributistas activos en ARCA), por lo que bajé impacto y confianza frente a v2. Recorté el MVP a 4 comandos de chat fijos (sin NLU ambiguo) para minimizar riesgo de parseo mal interpretado emitiendo comprobantes fiscales erróneos, que sería el peor failure mode posible (dato fiscal mal cargado). Subí ligeramente el esfuerzo/horas porque integrar WhatsApp Business webhook + flujo de alta de cliente + emisión fiscal en producción real (no sandbox) exige testing cuidadoso, no es trivial aunque las piezas ya existan.",
      "final": {
        "titulo": "Facturador WhatsApp para creadores (ARCA + MP, monotributo)",
        "segmento": "influencers",
        "dolor": "El monotributista de contenido cobra por transferencia o MP y no factura en ARCA: no tiene tiempo ni sabe usar el portal, y teme recategorizarse mal por no llevar registro de lo cobrado mes a mes.",
        "categoriaDolor": "cobros_facturacion",
        "descripcion": "Bot de WhatsApp atado al ERP: el creador escribe \"Facturale 80000 a Marca X\", el sistema resuelve o da de alta al cliente con 2 datos (CUIT/nombre, email), emite el comprobante C vía el módulo ARCA/AFIP ya existente y lo manda por WhatsApp/mail. Si el cobro entra por Mercado Pago concilia automático contra ese comprobante. Un cron mensual manda resumen \"facturaste $X de $Y cobrado\" y alerta cuando se acerca al techo de categoría (dato cargado a mano por el usuario, sin scraping a AFIP).",
        "solucion": "Capa conversacional (parser de intents liviano, sin IA cara) sobre tres piezas que el ERP ya tiene: módulo ARCA/AFIP sandbox, integración Mercado Pago, canal WhatsApp Business. Se agrega alta rápida de cliente por chat, un comando de emisión, y un cron de resumen/alerta de techo (umbral manual). Se vende como add-on de un plan existente, no como producto nuevo — MVP acotado a 3-4 comandos de chat (facturar, alta cliente, consultar techo, resumen mensual).",
        "encajeGSG": "Reutiliza 100% del stack pago (ARCA sandbox, MP, WhatsApp Business ya activo para turnos/recordatorios) sin infraestructura nueva; el desarrollo real es acotado (parser + cron) y reversible; se vende como add-on de add-on sobre tenants influencer ya activos, sin nueva adquisición de clientes.",
        "mejorasAplicadas": "Validé que el dolor es real y específico (miedo a recategorización, no \"problemas con AFIP\" genérico) pero acoté aún más el impacto de negocio: es un add-on de nicho dentro de un nicho (solo sirve a tenants influencer que además sean monotributistas activos en ARCA), por lo que bajé impacto y confianza frente a v2. Recorté el MVP a 4 comandos de chat fijos (sin NLU ambiguo) para minimizar riesgo de parseo mal interpretado emitiendo comprobantes fiscales erróneos, que sería el peor failure mode posible (dato fiscal mal cargado). Subí ligeramente el esfuerzo/horas porque integrar WhatsApp Business webhook + flujo de alta de cliente + emisión fiscal en producción real (no sandbox) exige testing cuidadoso, no es trivial aunque las piezas ya existan.",
        "impacto": 5,
        "confianza": 6,
        "esfuerzo": 5,
        "horasHumanas": 55,
        "costoHumanoUSD": 700,
        "pctAutomatizableIA": 75,
        "tiempoMVPdias": 12
      }
    },
    {
      "id": "r2-23d733ab",
      "ronda": 2,
      "autor": "Analista de mercado local",
      "autorKey": "mercado",
      "v1": {
        "titulo": "Media kit y cotizador automático para pautas"
      },
      "mejoraV2": "Se acotó el dolor a algo verificable (falta de tarifa fija + cotización lenta + cobro sin trazabilidad) y se sacó la promesa de \"scraping de métricas por IA en tiempo real\", que es humo/riesgoso legalmente contra Meta; en su lugar se propone carga manual/import simple. Se agregó el cierre del círculo con cobro de seña vía Mercado Pago embebido en el presupuesto, que es la pieza de mayor encaje real con el stack (Mercado Pago ya integrado) y convierte la propuesta de \"un PDF más lindo\" a \"cotización que termina en venta registrada en el ERP\".",
      "mejoraV3": "Se redujo el MVP al mínimo vendible: se sacó del alcance v1 el \\\"media kit vivo\\\" con métricas y catálogo ampliado, dejando solo catálogo simple + cotizador self-serve + cobro de seña embebido, que es lo que efectivamente cierra el círculo cotización→venta→cobro. Se bajó la confianza del dolor de \\\"muy pagable\\\" a \\\"pagable pero con adopción incierta\\\": es un dolor real pero de bajo ticket individual, así que el score de impacto y confianza se ajustó a la baja para no inflar, priorizando honestidad sobre entusiasmo.",
      "final": {
        "categoriaDolor": "venta_captacion",
        "titulo": "Cotizador con cobro integrado para influencers (sobre el storefront ya existente)",
        "segmento": "influencers",
        "dolor": "Cuando una marca escribe por DM, el influencer no tiene tarifa fija por formato (reel, story, posteo, canje), cotiza \\\"a ojo\\\" por chat sin trazabilidad, y si cierra el trato no tiene forma prolija de cobrar seña ni de dejar constancia de la venta.",
        "descripcion": "Página pública mínima (reusa el storefront de tenant) con un catálogo de 3-5 formatos de contenido con precio fijo en pesos y un botón \\\"cotizar\\\": la marca elige formato+cantidad, se genera un presupuesto en PDF con el link de pago de Mercado Pago ya adentro, y se manda por WhatsApp al influencer y a la marca. Si la marca paga la seña, la venta queda registrada en el ERP del influencer, no perdida en una captura de chat. Las métricas de audiencia (seguidores, alcance promedio) se muestran como texto fijo cargado a mano por el influencer, sin scraping ni promesa de dashboard en vivo — eso queda fuera del MVP para no inflar alcance ni tocar ToS de Meta/IG.",
        "solucion": "MVP acotado a lo mínimo vendible: (1) catálogo de servicio relabeled a \\\"formatos de contenido\\\" con precio, reusando el módulo de catálogo existente; (2) botón de cotización self-serve en el storefront público que arma el presupuesto sin que el influencer tenga que escribir primero; (3) el link de cobro de Mercado Pago embebido en el mismo PDF de presupuesto para cobrar seña al aceptar. Se deja explícitamente afuera del v1 cualquier dashboard de métricas en vivo o integración con APIs de redes sociales — ese es un v2 opcional, no parte de este MVP, y no se promete al cliente hasta validar demanda real.",
        "encajeGSG": "100% sobre módulos ya construidos: storefront público por tenant, catálogo con precios, generador de presupuestos/PDF y checkout de Mercado Pago ya integrado al ERP. No hay infraestructura nueva ni riesgo legal de scraping; el trabajo es vocabulario de rubro + exponer un botón de cotización self-serve + insertar el link de pago en la plantilla de PDF, es decir cableado sobre lo existente.",
        "mejorasAplicadas": "Se redujo el MVP al mínimo vendible: se sacó del alcance v1 el \\\"media kit vivo\\\" con métricas y catálogo ampliado, dejando solo catálogo simple + cotizador self-serve + cobro de seña embebido, que es lo que efectivamente cierra el círculo cotización→venta→cobro. Se bajó la confianza del dolor de \\\"muy pagable\\\" a \\\"pagable pero con adopción incierta\\\": es un dolor real pero de bajo ticket individual, así que el score de impacto y confianza se ajustó a la baja para no inflar, priorizando honestidad sobre entusiasmo.",
        "impacto": 5,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 18,
        "costoHumanoUSD": 350,
        "pctAutomatizableIA": 85,
        "tiempoMVPdias": 5
      }
    },
    {
      "id": "r2-19f2ad3b",
      "ronda": 2,
      "autor": "Analista de mercado local",
      "autorKey": "mercado",
      "v1": {
        "titulo": "Agenda y CRM de marcas/clientes con seguimiento de pagos pendientes"
      },
      "mejoraV2": "Se concretó el dolor: no es solo \"flujo de caja\", es falta de un tablero visual de un vistazo. Se agregó un diferencial visual concreto (semáforo de cobranza + Kanban de entregables) en vez de \"dashboard simple\" genérico, y se sumó la \"vista cliente\" pública aprovechando el storefront existente, subiendo el valor percibido sin construir nada nuevo de infraestructura.",
      "mejoraV3": "Validado que el dolor es real y específico del segmento (visibilidad de estado de cuenta por marca, no solo cobranza genérica) y que es pagable como feature premium o addon de un plan existente. Se acotó el MVP a 3 piezas concretas y chicas (semáforo, Kanban, link read-only) evitando scope creep hacia un CRM completo nuevo. Se puntuó con honestidad: impacto medio (nicho, no motor de ventas masivo) pero esfuerzo bajo por altísima reutilización, lo que da una relación esfuerzo/impacto muy favorable.",
      "final": {
        "titulo": "CRM de marcas con semáforo de cobranza y timeline visual de entregables",
        "segmento": "transversal",
        "dolor": "El community manager/creador gestiona 5-15 marcas en simultáneo entre Excel, WhatsApp y notas sueltas: no tiene un solo lugar donde ver de un vistazo qué le deben, qué le deben entregar y para cuándo. El dolor es de visibilidad de un vistazo, no solo de caja.",
        "categoriaDolor": "gestion_clientes_marcas",
        "descripcion": "CRM liviano donde cada marca/cliente tiene una ficha con semáforo de cobranza (verde/amarillo/rojo + monto), una mini-timeline Kanban de entregables (pendiente/en revisión/entregado) e historial de contacto. Modo \"vista cliente\" opcional: link de solo lectura para que la marca vea el estado de sus entregables sin Excel compartido. Prioriza mirar colores y barras por sobre leer tablas.",
        "solucion": "MVP acotado a reutilización: renombrar jerga del módulo clientes+agenda+recordatorios WhatsApp del ERP (clientes=marcas, turnos=entregas/reuniones), agregar un componente de semáforo de cobro (reutilizando el patrón de badges/estados ya existente) y una vista Kanban simple sobre los mismos datos de agenda/tareas. El link \"vista cliente\" reutiliza el mecanismo de storefront público por tenant, aplicado a nivel de cliente individual. Sin modelo de datos nuevo ni infraestructura nueva: son vistas y renombrados sobre tablas existentes.",
        "encajeGSG": "100% reconfiguración de blueprint existente: clientes, agenda, recordatorios WhatsApp y el mecanismo de URL pública por tenant ya están en el core del ERP. Lo único a construir es UI (componente semáforo + vista Kanban) y el scoping del link público a nivel cliente — cero infraestructura nueva.",
        "mejorasAplicadas": "Validado que el dolor es real y específico del segmento (visibilidad de estado de cuenta por marca, no solo cobranza genérica) y que es pagable como feature premium o addon de un plan existente. Se acotó el MVP a 3 piezas concretas y chicas (semáforo, Kanban, link read-only) evitando scope creep hacia un CRM completo nuevo. Se puntuó con honestidad: impacto medio (nicho, no motor de ventas masivo) pero esfuerzo bajo por altísima reutilización, lo que da una relación esfuerzo/impacto muy favorable.",
        "impacto": 6,
        "confianza": 7,
        "esfuerzo": 3,
        "horasHumanas": 32,
        "costoHumanoUSD": 700,
        "pctAutomatizableIA": 85,
        "tiempoMVPdias": 10
      }
    },
    {
      "id": "r2-7e27f8c7",
      "ronda": 2,
      "autor": "Analista de mercado local",
      "autorKey": "mercado",
      "v1": {
        "titulo": "Calendario editorial + reportes de resultados automáticos para marcas"
      },
      "mejoraV2": "Concreté el dolor con una escena específica (23hs de un día de fin de mes) en vez de dejarlo abstracto; recorté la solución a un cambio de \"adapter de datos\" sobre infraestructura existente en vez de sonar a feature nueva; until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until until",
      "mejoraV3": "Se limpió el artefacto de texto corrupto (repetición de \"until\") de la v2. Se acotó explícitamente el alcance de v1 (solo entregas cargadas por el CM, sin métricas de performance de redes ni texto generado libre) para que el esfuerzo y el riesgo de la estimación sean honestos y no se infle la promesa de valor.",
      "final": {
        "titulo": "El informe mensual que se arma solo, sin PowerPoint ni trasnochada",
        "segmento": "community_managers",
        "dolor": "El 28 de cada mes el CM que lleva 3-4 cuentas se pone a las 23hs a copiar y pegar capturas en Canva para armar el informe del cliente. Lo manda tarde, con errores, o directamente lo debe y el cliente empieza a preguntar en qué se le está gastando la plata. No es falta de resultados: es falta de tiempo para mostrarlos, y eso hace dudar la renovación mes a mes.",
        "categoriaDolor": "reportes_metricas",
        "descripcion": "Un módulo que toma el calendario editorial que el CM ya carga día a día (qué se publicó, cuándo, para qué cliente) y a fin de mes genera solo un PDF prolijo con el detalle de entregas y un resumen ejecutivo en criollo (\"este mes publicamos 12 posteos y 3 reels\"), con un botón para mandarlo por WhatsApp al cliente final. El CM no arma nada extra: carga en el día a día y el informe le aparece listo el último día del mes. Sin métricas de alcance/engagement reales de cada red (eso requeriría integrarse a las APIs de Meta/TikTok, que es otro proyecto): la v1 reporta SOLO lo que el propio CM cargó como entregado, no performance.",
        "solucion": "Reutilizar el motor de reportes periódicos + generación de PDF del ERP (hoy corre para ventas/POS) cambiando la fuente de datos: en vez de tomar tickets de venta, toma los ítems del calendario editorial como \"entregas\". Se agrega un cron mensual por tenant que arma el PDF automático y queda listo para reenviar por el WhatsApp que el CM ya usa con ese cliente. MVP acotado a: listado de entregas del mes agrupado por cliente + conteo por tipo de pieza + un párrafo de resumen con plantilla fija (no IA generativa de texto libre en v1, para no meter riesgo de alucinar números). Sin dashboards ni métricas de red social.",
        "encajeGSG": "Cero desarrollo de reporting desde cero: se reusa el motor de reportes/PDF y el cron ya existentes en el ERP, más la integración WhatsApp-first que hoy dispara recordatorios de turnos (mismo mecanismo de envío, ahora dispara el informe en vez de un recordatorio de cita). El calendario editorial como fuente de datos ya debe existir como entidad en el ERP para que esto sea barato; si no existe todavía, ese es el verdadero costo del MVP.",
        "mejorasAplicadas": "Se limpió el artefacto de texto corrupto (repetición de \"until\") de la v2. Se acotó explícitamente el alcance de v1 (solo entregas cargadas por el CM, sin métricas de performance de redes ni texto generado libre) para que el esfuerzo y el riesgo de la estimación sean honestos y no se infle la promesa de valor.",
        "impacto": 6,
        "confianza": 7,
        "esfuerzo": 4,
        "horasHumanas": 18,
        "costoHumanoUSD": 250,
        "pctAutomatizableIA": 75,
        "tiempoMVPdias": 6
      }
    },
    {
      "id": "r2-eb20121a",
      "ronda": 2,
      "autor": "Analista de mercado local",
      "autorKey": "mercado",
      "v1": {
        "titulo": "Gestor de canjes y pagos en especie con valorización automática"
      },
      "mejoraV2": "Se afiló el dolor agregando el síntoma concreto (llevan cuenta en Excel/memoria, subfacturan o no declaran) para hacerlo más verificable. Se concretó la solución con campos mínimos de carga y un semáforo de conveniencia en vez de un cálculo abstracto \"vale la pena\", y se agregó un fallback de precio de referencia cuando el producto no está en el catálogo propio (caso frecuente). Se recortó el texto de encaje GSG para dejar explícito que no se crea infraestructura nueva, solo un tipo de comprobante sobre tablas existentes.",
      "mejoraV3": "Se recortó el MVP a lo mínimo indispensable (4-5 campos, un cálculo, un semáforo) descartando cualquier feature de \"análisis histórico de canjes\" o dashboard aparte que infle esfuerzo sin sumar venta. Se bajó la confianza respecto de v2 porque, aunque el dolor es real, la disposición a pagar EXTRA por esta feature puntual (vs. valorarla como parte del combo del ERP) es incierta sin validación de mercado directa. Se ajustaron horas y costo a un tamaño de tarea chico y concreto, no de módulo.",
      "final": {
        "titulo": "Registro de canjes con valorización automática y semáforo de conveniencia",
        "segmento": "influencers",
        "dolor": "Las colaboraciones en canje (no en plata) con marcas chicas/medianas son la norma en Argentina, y el influencer no tiene forma simple de valorizar lo recibido, comparar si conviene frente a su tarifa en efectivo, ni dejarlo asentado para el monotributo — hoy lo lleva de memoria o en un Excel suelto y termina subfacturando o sin declarar nada.",
        "categoriaDolor": "cobros_facturacion",
        "descripcion": "Un tipo de comprobante \"Canje\" dentro del módulo de cobros ya existente del ERP: al cargar una colaboración en especie, el sistema valoriza el producto recibido contra el catálogo de precios propio del creador (o un valor de referencia manual si no está catalogado), muestra al instante un semáforo (conviene / justo / no conviene) comparando contra la tarifa vigente para ese tipo de publicación, y lo suma como ingreso en especie al mismo reporte mensual que ya alimenta la facturación ARCA/monotributo. No crea infraestructura nueva: es un tipo de comprobante y una regla de comparación sobre tablas de cobros, catálogo e inventario que ya existen.",
        "solucion": "MVP acotado: (1) nuevo tipo de comprobante \"Canje\" con 4-5 campos (marca, producto/servicio, cantidad, referencia de precio de catálogo o valor manual, tipo de publicación acordada); (2) cálculo automático del valor en pesos y comparación contra la tarifa vigente del creador para ese tipo de publicación, con semáforo simple sin cálculo manual; (3) el registro cae directo en el reporte mensual existente sumando el ingreso en especie, sin duplicar carga de datos. Nada de app aparte, nada de tabla contable nueva.",
        "encajeGSG": "Reutiliza el módulo de cobros, el catálogo de precios, el inventario y el reporte mensual ARCA/monotributo que el ERP ya tiene: es un nuevo tipo de comprobante + una regla de negocio sobre datos existentes, no un módulo ni base de datos nueva. Encaja directo en el flujo que un creador ya usaría para facturar sus colaboraciones en efectivo.",
        "mejorasAplicadas": "Se recortó el MVP a lo mínimo indispensable (4-5 campos, un cálculo, un semáforo) descartando cualquier feature de \"análisis histórico de canjes\" o dashboard aparte que infle esfuerzo sin sumar venta. Se bajó la confianza respecto de v2 porque, aunque el dolor es real, la disposición a pagar EXTRA por esta feature puntual (vs. valorarla como parte del combo del ERP) es incierta sin validación de mercado directa. Se ajustaron horas y costo a un tamaño de tarea chico y concreto, no de módulo.",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 3,
        "horasHumanas": 14,
        "costoHumanoUSD": 180,
        "pctAutomatizableIA": 80,
        "tiempoMVPdias": 4
      }
    },
    {
      "id": "r2-f83e3508",
      "ronda": 2,
      "autor": "Analista de mercado local",
      "autorKey": "mercado",
      "v1": {
        "titulo": "Generador de piezas gráficas de marca por preset IA para freelancers"
      },
      "mejoraV2": "Concreté el listado de piezas del kit (portada de historias, media kit, presupuesto/factura, promo, firma WhatsApp) en vez de dejarlo genérico; definí el mecanismo técnico exacto (bifurcar el branch de salida del generador existente, sin tocar el motor de extracción); agregué el ángulo de negocio (gancho de funnel gratuito hacia el ERP) que la v1 no mencionaba, subiendo el encaje con la regla demo→venta→inversión de GSG.",
      "mejoraV3": "Recorté el kit de 5-8 piezas a exactamente 5 para bajar esfuerzo y tiempo de MVP; agregué el mecanismo de captura de lead (email/WhatsApp antes de la descarga) que faltaba y es el verdadero valor de negocio del producto (no las piezas en sí); bajé impacto y confianza a valores honestos porque es una herramienta de funnel indirecta, no un ingreso directo, y subí ligeramente esfuerzo por la capa de render que no estaba dimensionada en v2.",
      "final": {
        "titulo": "Kit de Piezas Gráficas de Marca — funnel gratuito desde el motor de PRESET IA del ERP",
        "segmento": "creativos",
        "dolor": "Freelancers, community managers e influencers necesitan piezas gráficas coherentes con su marca (portada de historias, media kit, presupuesto/factura, banner de promo, firma de WhatsApp) todo el tiempo, pero no tienen diseñador fijo ni Canva Pro, y terminan armando cada pieza a mano, con identidad inconsistente entre campañas y clientes.",
        "categoriaDolor": "entregables_visuales",
        "descripcion": "Se bifurca la salida del Generador de PRESET por IA (ya construido y auditado para altas de tenant): mismo paso de ingesta con autorización + extracción de identidad (logo, paleta, tipografía, tono) desde Instagram o web, pero en vez de crear tenant+storefront, renderiza un Kit de Marca fijo de 5 piezas priorizadas (portada de historias, media kit, presupuesto/factura con la identidad del creador, post de promo, firma de WhatsApp) en PNG/PDF listas para descargar. Vive como landing standalone gratuita, sin login ni persistencia, y captura el contacto del freelancer como lead. No es el producto que se vende: es el imán de entrada que precalienta la venta del ERP completo (agenda + cobros MP + facturación ARCA) cuando el freelancer crece y empieza a facturar.",
        "solucion": "MVP acotado a 5 piezas (no 8) usando el pipeline de extracción de identidad ya existente + una capa nueva de templates fijos (SVG/HTML→PNG/PDF) parametrizados por logo/paleta/tono extraídos. Sin editor visual, sin variantes por rubro en v1 — un set único de templates genéricos que sirve para cualquier creativo. Entrega por ZIP descargable + captura de email/WhatsApp del lead antes de la descarga (ese es el activo real del producto). Sin base de datos: assets se generan on-demand y se sirven efímeros.",
        "encajeGSG": "Reutiliza el pipeline de extracción de identidad de marca del Generador de PRESET por IA (motor ya construido, auditado, con flujo de autorización resuelto) — lo único nuevo es la capa de templates/render, acotada a 5 piezas para el MVP. Encaja con demo pública a costo cero (sin DB, sin login, sin dominio propio) y alimenta el funnel hacia venta del ERP (agenda, cobros MP, facturación ARCA) cumpliendo el ciclo demo→venta→inversión: no se gasta nada hasta que hay venta real de suscripción al ERP.",
        "mejorasAplicadas": "Recorté el kit de 5-8 piezas a exactamente 5 para bajar esfuerzo y tiempo de MVP; agregué el mecanismo de captura de lead (email/WhatsApp antes de la descarga) que faltaba y es el verdadero valor de negocio del producto (no las piezas en sí); bajé impacto y confianza a valores honestos porque es una herramienta de funnel indirecta, no un ingreso directo, y subí ligeramente esfuerzo por la capa de render que no estaba dimensionada en v2.",
        "impacto": 6,
        "confianza": 6,
        "esfuerzo": 4,
        "horasHumanas": 45,
        "costoHumanoUSD": 700,
        "pctAutomatizableIA": 85,
        "tiempoMVPdias": 10
      }
    }
  ]
};
