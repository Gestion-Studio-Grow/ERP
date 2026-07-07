export const meta = {
  name: 'lab-influencers-ronda',
  description: 'Ronda cíclica de la célula Lab Influencers: 5 agentes generan oportunidades, cada propuesta se mejora 2 veces y se puntúa',
  phases: [
    { title: 'Generación', detail: '5 agentes (creativo, analítico, dev, diseñador, mercado local) generan oportunidades' },
    { title: 'Mejora v2', detail: 'cada propuesta mejorada por una lente cruzada' },
    { title: 'Mejora v3 + Score', detail: 'segunda mejora + scoring ICE y costos' },
  ],
}

const RONDA = args.ronda
const IDEAS_POR_AGENTE = args.ideasPorAgente
const EXISTENTES = args.titulosExistentes || []

const CONTEXTO_GSG = `CONTEXTO DE LA COMPAÑÍA (Gestión Studio Grow, Argentina):
Somos un estudio con: (a) un ERP multi-tenant SaaS (agenda, clientes, catálogo, POS/inventario, cobros, comisiones, reseñas, recordatorios, RBAC) con storefronts/vidrieras públicas por tenant; (b) facturación ARCA/AFIP en sandbox; (c) integración Mercado Pago; (d) enfoque WhatsApp-first para la pyme argentina; (e) capacidad de generar presets/demos de marca por IA a costo cero.
SEGMENTO OBJETIVO de esta célula: influencers, community managers y creativos/freelancers de contenido en Argentina (y LATAM hispano). Buscamos OPORTUNIDADES DE AUTOMATIZACIÓN o productos que cubran PUNTOS DE DOLOR reales de ese segmento, apalancando lo que YA tenemos antes de construir de cero.
REGLA DE COSTOS: el trabajo que puede hacer la IA se considera costo $0 (no se contempla); solo cuenta el costo humano e infraestructura paga.`

const ROLES = [
  { key: 'creativo', nombre: 'Creativo', brief: 'Sos un creativo publicitario senior con años trabajando CON influencers y community managers argentinos. Pensás lateral: encontrás dolores que nadie está atacando y ángulos frescos. Tono humano y criollo en los títulos/descripciones, pero concreto.' },
  { key: 'analitico', nombre: 'Analítico', brief: 'Sos un analista de negocio riguroso. Buscás oportunidades donde los números cierran: dolor frecuente + disposición a pagar + costo de solución bajo. Preciso y convencional, sin humo.' },
  { key: 'dev', nombre: 'Dev', brief: 'Sos un ingeniero de producto fullstack. Buscás oportunidades donde la automatización es técnicamente barata HOY (APIs, scraping legal, webhooks, IA generativa) y donde nuestro stack existente (ERP multi-tenant, storefronts, Mercado Pago, WhatsApp) da ventaja.' },
  { key: 'disenador', nombre: 'Diseñador experto', brief: 'Sos un diseñador UX/visual senior que trabaja con creadores de contenido. Buscás dolores en el flujo visual/entregable del creador: media kits, portfolios, calendarios de contenido, reportes para marcas, identidad. Sabés qué compra el ojo.' },
  { key: 'mercado', nombre: 'Analista de mercado local', brief: 'Sos un analista de mercado especializado en la economía de creadores en ARGENTINA: tarifas reales en pesos, inflación, cobros por MP/transferencia, monotributo/ARCA, hábitos (WhatsApp, Instagram, TikTok), qué herramientas usan hoy y cuánto pagan. Si te sirve, podés usar WebSearch para validar datos puntuales.' },
]

const IDEA_ITEM = {
  type: 'object',
  properties: {
    titulo: { type: 'string' },
    segmento: { type: 'string', enum: ['influencers', 'community_managers', 'creativos', 'transversal'] },
    dolor: { type: 'string', description: 'El punto de dolor concreto que ataca, en 1-2 frases' },
    categoriaDolor: { type: 'string', enum: ['cobros_facturacion', 'gestion_clientes_marcas', 'produccion_contenido', 'reportes_metricas', 'organizacion_agenda', 'venta_captacion', 'entregables_visuales', 'otro'] },
    descripcion: { type: 'string', description: 'Descripción de la oportunidad (3-5 frases)' },
    solucion: { type: 'string', description: 'Qué producto/automatización concreta la resuelve (3-5 frases)' },
    encajeGSG: { type: 'string', description: 'Cómo apalanca lo que GSG ya tiene (ERP, storefront, MP, ARCA, WhatsApp, presets IA)' },
  },
  required: ['titulo', 'segmento', 'dolor', 'categoriaDolor', 'descripcion', 'solucion', 'encajeGSG'],
}

const IDEAS_SCHEMA = {
  type: 'object',
  properties: { ideas: { type: 'array', items: IDEA_ITEM } },
  required: ['ideas'],
}

const PROP_V2_SCHEMA = {
  type: 'object',
  properties: Object.assign({}, IDEA_ITEM.properties, {
    mejorasAplicadas: { type: 'string', description: 'Resumen en 1-3 frases de qué mejoraste respecto de la versión anterior' },
  }),
  required: IDEA_ITEM.required.concat(['mejorasAplicadas']),
}

const PROP_V3_SCHEMA = {
  type: 'object',
  properties: Object.assign({}, PROP_V2_SCHEMA.properties, {
    impacto: { type: 'integer', minimum: 1, maximum: 10, description: 'Impacto potencial de negocio 1-10' },
    confianza: { type: 'integer', minimum: 1, maximum: 10, description: 'Confianza en que el dolor es real y pagable 1-10' },
    esfuerzo: { type: 'integer', minimum: 1, maximum: 10, description: 'Esfuerzo de construir el MVP 1-10 (10 = altísimo)' },
    horasHumanas: { type: 'number', description: 'Horas HUMANAS estimadas para el MVP (lo que hace la IA no cuenta)' },
    costoHumanoUSD: { type: 'number', description: 'Costo humano+infra paga estimado en USD para el MVP (costo IA = 0, no se contempla)' },
    pctAutomatizableIA: { type: 'integer', minimum: 0, maximum: 100, description: '% del trabajo de construcción+operación que puede hacer la IA a costo 0' },
    tiempoMVPdias: { type: 'integer', description: 'Días calendario estimados hasta MVP demostrable' },
  }),
  required: PROP_V2_SCHEMA.required.concat(['impacto', 'confianza', 'esfuerzo', 'horasHumanas', 'costoHumanoUSD', 'pctAutomatizableIA', 'tiempoMVPdias']),
}

const evitar = EXISTENTES.length
  ? `\n\nYA EXISTEN estas oportunidades de rondas anteriores — NO las repitas ni propongas variantes menores de ellas:\n- ${EXISTENTES.join('\n- ')}`
  : ''

phase('Generación')
log(`Ronda ${RONDA}: 5 agentes generando ${IDEAS_POR_AGENTE} oportunidades cada uno`)

const generado = await parallel(ROLES.map((rol, i) => () =>
  agent(`${CONTEXTO_GSG}\n\nTU ROL: ${rol.brief}\n\nTAREA: proponé exactamente ${IDEAS_POR_AGENTE} oportunidades de automatización o productos que cubran puntos de dolor del segmento influencers / community managers / creativos. Cada una tiene que ser concreta, vendible y distinta entre sí. Priorizá dolores frecuentes con disposición a pagar en el contexto argentino.${evitar}\n\nDevolvé el resultado estructurado según el schema.`,
    { label: `gen:${rol.key}`, phase: 'Generación', schema: IDEAS_SCHEMA, model: 'sonnet', effort: 'medium' })
    .then(r => (r && r.ideas ? r.ideas.map(idea => ({ idea, autor: rol.nombre, autorKey: rol.key, autorIdx: i })) : []))
))

const propuestas = generado.filter(Boolean).flat()
log(`Generadas ${propuestas.length} propuestas. Arranca el ciclo de mejora (2 pasadas por propuesta).`)

const resultado = await pipeline(
  propuestas,
  (p, _orig, idx) => {
    const lente = ROLES[(p.autorIdx + 1 + (idx % (ROLES.length - 1))) % ROLES.length]
    return agent(`${CONTEXTO_GSG}\n\nTU ROL (lente de mejora): ${lente.brief}\n\nPRIMERA PASADA DE MEJORA. Esta propuesta la generó el agente "${p.autor}". Mejorala desde TU lente: afinar el dolor, concretar la solución, subir el encaje con lo que GSG ya tiene, y eliminar humo. Mantené la esencia; devolvé la versión mejorada completa.\n\nPROPUESTA v1:\n${JSON.stringify(p.idea, null, 2)}\n\nDevolvé la propuesta v2 estructurada según el schema.`,
      { label: `v2:${p.idea.titulo.slice(0, 30)}`, phase: 'Mejora v2', schema: PROP_V2_SCHEMA, model: 'sonnet', effort: 'low' })
      .then(v2 => ({ p, v2 }))
  },
  (r) => {
    if (!r || !r.v2) return null
    return agent(`${CONTEXTO_GSG}\n\nTU ROL: combinás el rigor del Analítico y del Analista de mercado local argentino.\n\nSEGUNDA PASADA DE MEJORA + SCORING. Esta propuesta ya pasó una mejora. Hacé la pasada final: validá que el dolor sea real y pagable en Argentina, ajustá la solución al MVP más chico vendible, y PUNTUÁ con honestidad (no infles). Regla de costos: lo que puede hacer la IA cuesta $0 y NO se contempla; solo horas humanas e infra paga.\n\nPROPUESTA v2:\n${JSON.stringify(r.v2, null, 2)}\n\nDevolvé la propuesta v3 final estructurada según el schema, con scores.`,
      { label: `v3:${r.v2.titulo.slice(0, 30)}`, phase: 'Mejora v3 + Score', schema: PROP_V3_SCHEMA, model: 'sonnet', effort: 'medium' })
      .then(v3 => (v3 ? {
        ronda: RONDA,
        autor: r.p.autor,
        autorKey: r.p.autorKey,
        v1: r.p.idea,
        mejoraV2: r.v2.mejorasAplicadas,
        mejoraV3: v3.mejorasAplicadas,
        final: v3,
      } : null))
  }
)

const finales = resultado.filter(Boolean)
log(`Ronda ${RONDA} cerrada: ${finales.length}/${propuestas.length} propuestas completaron el ciclo v1→v2→v3.`)
return { ronda: RONDA, propuestas: finales }