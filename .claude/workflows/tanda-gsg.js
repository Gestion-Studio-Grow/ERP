export const meta = {
  name: 'tanda-gsg',
  description: 'Una tanda de GSG con gasto acotado, todo en Opus: construir, verificar, certificar sólo si hay riesgo, corregir hasta 2 vueltas y escalar a Fable sólo si Opus no alcanzó',
  whenToUse: 'Para construir una tanda de un cliente del ERP con el Método de Contexto Mínimo (Factory-GSG/10-GOBIERNO/economia-de-tokens.md). Lo dispara el comando /tanda.',
  phases: [
    { title: 'Construir', detail: 'un gsg-ingeniero fresco con el brief de 2 KB' },
    { title: 'Verificar', detail: 'tsc y tests de lo tocado, sólo resúmenes (esfuerzo bajo)' },
    { title: 'Certificar', detail: 'gsg-certificador (Opus) sobre el diff, sólo si toca plata, seguridad, concurrencia o datos' },
    { title: 'Corregir', detail: 'un gsg-ingeniero fresco por vuelta, máximo 2 vueltas' },
    { title: 'Escalar', detail: 'una única vuelta en Fable, sólo si Opus agotó sus 2 vueltas y quedan fallas alta/media', model: 'fable' },
  ],
}

// args (los arma el comando /tanda):
// { cliente, tanda, worktree, rama, base, extracto, mapa, archivosPropios, noTocar, criterios, riesgos: [],
//   factory, scratch, trailers, maxVueltas?, escalarFable?, frentes? }
// `frentes` (opcional, máximo 2): [{ nombre, archivosPropios, criterios, riesgos }]. Cuando la tanda junta frentes
// que no se tocan (p. ej. un parser puro y una rendición con plata), un constructor fresco por frente, en serie: cada
// uno carga sólo su zona (magra 2b, 23/10: un constructor con 4 frentes = 51 llamadas y 3,5 M). Sin `frentes`, uno solo.
// Modelo (decisión del dueño, 23/10/2026): todo en Opus. Fable sólo como escalamiento técnico: una única vuelta de
// corrección cuando Opus agotó sus vueltas y siguen fallas alta/media. `escalarFable: false` lo apaga.
const a = args || {}
const RIESGOS_CERT = ['plata', 'seguridad', 'concurrencia', 'datos']
const riesgos = [...new Set([...(a.riesgos || []), ...(a.frentes || []).flatMap((f) => f.riesgos || [])])].filter((r) => RIESGOS_CERT.includes(r))
const maxVueltas = Math.min(a.maxVueltas || 2, 2)
const resumen = `node ${a.factory}/entorno/tokens/resumen-tests.mjs --`
const nombre = `${a.cliente}-t${a.tanda}`

const CONSTRUCCION = {
  type: 'object',
  properties: {
    resultado: { type: 'string', enum: ['CUMPLE', 'PARCIAL', 'NO CUMPLE'] },
    commit: { type: 'string' },
    tsc: { type: 'string' },
    tests: { type: 'string' },
    archivosTocados: { type: 'array', items: { type: 'string' } },
    criterios: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, estado: { type: 'string' }, donde: { type: 'string' } }, required: ['id', 'estado'] } },
    supuestos: { type: 'array', items: { type: 'string' } },
    pendientes: { type: 'array', items: { type: 'string' } },
  },
  required: ['resultado', 'commit', 'tsc', 'tests', 'archivosTocados', 'criterios'],
}
const VERIFICACION = {
  type: 'object',
  properties: { tsc: { type: 'string' }, tests: { type: 'string' }, verde: { type: 'boolean' }, fallas: { type: 'array', items: { type: 'string' } } },
  required: ['tsc', 'tests', 'verde'],
}
const DICTAMEN = {
  type: 'object',
  properties: {
    veredicto: { type: 'string', enum: ['CERTIFICA', 'CON OBSERVACIONES', 'NO CERTIFICA'] },
    fallas: { type: 'array', items: { type: 'object', properties: { severidad: { type: 'string', enum: ['alta', 'media', 'baja'] }, que: { type: 'string' }, reproduccion: { type: 'string' }, arreglo: { type: 'string' }, donde: { type: 'string' }, test: { type: 'string', description: 'ruta del test adversarial que la reproduce (y subtest)' } }, required: ['severidad', 'que'] } },
    observaciones: { type: 'array', items: { type: 'string' } },
    dictamen: { type: 'string' },
    archivoDictamen: { type: 'string', description: 'ruta del dictamen escrito en el scratchpad' },
  },
  required: ['veredicto', 'fallas'],
}

const comun = `Worktree: ${a.worktree} (rama ${a.rama}). Trabajá con el cwd dentro de él; no crees otros worktrees.
Verificación SOLO con resúmenes: \`${resumen} <comando>\`. tsc una vez al final: \`${resumen} flock /tmp/tsc.lock npx tsc --noEmit -p .\`.
Commit por pathspec, sin push, con estos trailers:
${a.trailers}`

const frentes = (a.frentes || []).slice(0, 2)
const trabajos = frentes.length
  ? frentes.map((f) => ({ ...f, riesgos: (f.riesgos || []).filter((r) => RIESGOS_CERT.includes(r)) }))
  : [{ nombre: '', archivosPropios: a.archivosPropios, criterios: a.criterios, riesgos }]
// Lo que certifica el certificador: los archivos de los frentes con riesgo (sin frentes, todo el diff).
const archivosDeRiesgo = frentes.length ? trabajos.filter((f) => f.riesgos.length).map((f) => f.archivosPropios).join('; ') : ''

phase('Construir')
let construido = null
for (const f of trabajos) {
  const otros = trabajos.filter((o) => o !== f).map((o) => o.archivosPropios)
  const hecho = await agent(
    `Tarea: ${a.cliente}, Tanda ${a.tanda}${f.nombre ? `, frente «${f.nombre}» (sólo este; el otro frente lo hace otro agente)` : ''}.
Leé SOLO el extracto ${a.extracto}${a.mapa ? ` y el mapa de código ${a.mapa}` : ''}, y después los archivo:línea que necesites.
Archivos tuyos: ${f.archivosPropios}. No toques: ${[a.noTocar, ...otros].join('; ')}.
Criterios de aceptación: ${f.criterios}.
Riesgo: ${f.riesgos.join(', ') || 'visual'}. ${f.riesgos.length ? 'Plata/datos: test Postgres con dos negocios y doble envío (Postgres local del arnés).' : 'Todo archivo de pantalla tocado lleva un test o una línea de QA clic por clic en el informe.'}
${comun}`,
    { label: `construir ${nombre}${f.nombre ? ` · ${f.nombre}` : ''}`, phase: 'Construir', agentType: 'gsg-ingeniero', schema: CONSTRUCCION },
  )
  if (!hecho) return { estado: `cortado en la construcción${f.nombre ? ` (${f.nombre})` : ''}`, cliente: a.cliente, tanda: a.tanda, hecho: construido }
  construido = construido
    ? {
        ...hecho,
        resultado: [construido.resultado, hecho.resultado].includes('NO CUMPLE') ? 'NO CUMPLE' : [construido.resultado, hecho.resultado].includes('PARCIAL') ? 'PARCIAL' : 'CUMPLE',
        archivosTocados: [...new Set([...construido.archivosTocados, ...hecho.archivosTocados])],
        criterios: [...construido.criterios, ...hecho.criterios],
        supuestos: [...(construido.supuestos || []), ...(hecho.supuestos || [])],
        pendientes: [...(construido.pendientes || []), ...(hecho.pendientes || [])],
      }
    : hecho
}

const verificar = async (etiqueta) => agent(
  `Sólo verificar, sin cambiar nada. En ${a.worktree}:
1) \`${resumen} flock /tmp/tsc.lock npx tsc --noEmit -p .\`
2) \`${resumen} node --import tsx --test <los *.test.ts de las carpetas de: ${construido.archivosTocados.join(', ')}>\`
Devolvé sólo los resúmenes y las fallas.`,
  { label: etiqueta, phase: 'Verificar', agentType: 'gsg-ingeniero', effort: 'low', schema: VERIFICACION },
)

phase('Verificar')
let verificado = await verificar(`verificar ${nombre}`)

let dictamen = null
let vueltas = 0
let escalado = null
if (riesgos.length) {
  phase('Certificar')
  const certificar = (foco) => agent(
    `Certificá adversarialmente el diff ${a.base}..${a.rama} en ${a.worktree} (no modifiques el repo).
Riesgos a atacar: ${riesgos.join(', ')}. Criterios: ${trabajos.map((f) => f.criterios).join('; ')}.${archivosDeRiesgo ? `\nSuperficies de riesgo (el resto del diff ya tiene sus tests): ${archivosDeRiesgo}.` : ''}
${foco}
Tus tests adversariales y el dictamen van en ${a.scratch}/cert-${nombre}/. Corré suites con \`${resumen} <comando>\`.
Cada falla lleva en \`test\` la ruta (y el subtest) del test que la reproduce, y devolvés en \`archivoDictamen\` la ruta del dictamen: el corrector parte de ahí, no la redescubre.`,
    { label: `certificar ${nombre}${vueltas ? ` (vuelta ${vueltas + 1})` : ''}`, phase: 'Certificar', agentType: 'gsg-certificador', model: 'opus', schema: DICTAMEN },
  )
  // Primera vuelta con las ramas vecinas: en magra 2b la regresión del puesto 2 en la rama «cobrado» apareció recién
  // en la tercera vuelta, por mirar sólo la rama corregida. Verla en la primera ahorra una vuelta entera.
  dictamen = await certificar(`Primera vuelta: el diff completo de las superficies de riesgo. Por cada función de riesgo tocada, atacá también las ramas VECINAS del mismo flujo (las otras opciones del mismo formulario o acción, el segundo puesto o el reintento, el otro negocio) aunque el diff no las cambie: una corrección en una rama suele romper la de al lado.`)

  const briefCorreccion = (fallas, encabezado) => `${encabezado}
${fallas.map((f, i) => `${i + 1}. [${f.severidad}] ${f.que} — ${f.donde || ''} — arreglo sugerido: ${f.arreglo || 'a criterio'}${f.test ? ` — test que la reproduce: ${f.test}` : ''}`).join('\n')}
${dictamen?.archivoDictamen ? `Dictamen: ${dictamen.archivoDictamen} (leé sólo la parte de estas fallas). ` : ''}Arrancá corriendo el test del certificador (copialo a src/test/, corrélo y borralo): tiene que fallar antes y pasar después. Llevá el caso al test del repo de esa zona.
${comun}`

  while (dictamen && dictamen.fallas.some((f) => f.severidad !== 'baja') && vueltas < maxVueltas) {
    vueltas++
    const aCorregir = dictamen.fallas.filter((f) => f.severidad !== 'baja')
    log(`Vuelta ${vueltas}: ${aCorregir.length} falla(s) alta/media para corregir`)
    phase('Corregir')
    const correccion = await agent(
      briefCorreccion(aCorregir, 'Corregí SOLO estas fallas de la certificación (con test que las reproduzca y pase):'),
      { label: `corregir ${nombre} (vuelta ${vueltas})`, phase: 'Corregir', agentType: 'gsg-ingeniero', schema: CONSTRUCCION },
    )
    if (!correccion) break
    construido = { ...construido, commit: correccion.commit, archivosTocados: [...new Set([...construido.archivosTocados, ...correccion.archivosTocados])] }
    verificado = await verificar(`verificar ${nombre} (vuelta ${vueltas})`)
    phase('Certificar')
    dictamen = await certificar(`Vuelta ${vueltas + 1}: mirá SOLO lo corregido para estas fallas y su regresión inmediata (incluidas las ramas vecinas del mismo flujo):\n${aCorregir.map((f) => `- ${f.que}`).join('\n')}`)
  }
  let quedan = (dictamen?.fallas || []).filter((f) => f.severidad !== 'baja')
  if (quedan.length && vueltas >= maxVueltas && a.escalarFable !== false) {
    escalado = `Opus agotó ${vueltas} vuelta(s) y quedaban ${quedan.length} falla(s) alta/media: ${quedan.map((f) => f.que).join(' | ')}`
    log(`Escalamiento técnico a Fable (una única vuelta). Motivo: ${escalado}`)
    phase('Escalar')
    const escalada = await agent(
      briefCorreccion(quedan, `Escalamiento técnico: Opus no pudo cerrar estas fallas en ${vueltas} vuelta(s). Corregí SOLO estas (con test que las reproduzca y pase):`),
      { label: `escalar ${nombre} (Fable)`, phase: 'Escalar', agentType: 'gsg-ingeniero', model: 'fable', schema: CONSTRUCCION },
    )
    if (escalada) {
      construido = { ...construido, commit: escalada.commit, archivosTocados: [...new Set([...construido.archivosTocados, ...escalada.archivosTocados])] }
      verificado = await verificar(`verificar ${nombre} (escalada)`)
      phase('Certificar')
      dictamen = await certificar(`Después del escalamiento: mirá SOLO lo corregido para estas fallas y su regresión inmediata:
${quedan.map((f) => `- ${f.que}`).join('\n')}`)
      quedan = (dictamen?.fallas || []).filter((f) => f.severidad !== 'baja')
    }
  }
  if (quedan.length) log(`Quedan ${quedan.length} falla(s) alta/media después de ${vueltas} vuelta(s)${escalado ? ' y el escalamiento a Fable' : ''}: van al informe para el dueño`)
} else {
  log('Sin superficies de plata, seguridad, concurrencia ni datos: sin certificación adversarial (revisión liviana y QA clic por clic).')
}

return {
  cliente: a.cliente,
  tanda: a.tanda,
  rama: a.rama,
  commit: construido.commit,
  construccion: construido.resultado,
  verificacion: verificado ? `${verificado.tsc} · ${verificado.tests}${verificado.verde ? '' : ' · CON FALLAS'}` : 'sin verificar',
  certificacion: dictamen ? dictamen.veredicto : 'no aplica',
  vueltasDeCorreccion: vueltas,
  escaladoAFable: escalado || 'no',
  fallasAbiertas: (dictamen?.fallas || []).map((f) => `[${f.severidad}] ${f.que}`),
  criterios: construido.criterios.map((c) => `${c.id}: ${c.estado}`),
  supuestos: construido.supuestos || [],
  pendientes: construido.pendientes || [],
}
