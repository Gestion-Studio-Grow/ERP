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
    }
  ]
};
