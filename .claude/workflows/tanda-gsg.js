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
//   factory, scratch, trailers, maxVueltas?, escalarFable? }
// Modelo (decisión del dueño, 23/10/2026): todo en Opus. Fable sólo como escalamiento técnico: una única vuelta de
// corrección cuando Opus agotó sus vueltas y siguen fallas alta/media. `escalarFable: false` lo apaga.
const a = args || {}
const RIESGOS_CERT = ['plata', 'seguridad', 'concurrencia', 'datos']
const riesgos = (a.riesgos || []).filter((r) => RIESGOS_CERT.includes(r))
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
    fallas: { type: 'array', items: { type: 'object', properties: { severidad: { type: 'string', enum: ['alta', 'media', 'baja'] }, que: { type: 'string' }, reproduccion: { type: 'string' }, arreglo: { type: 'string' }, donde: { type: 'string' } }, required: ['severidad', 'que'] } },
    observaciones: { type: 'array', items: { type: 'string' } },
    dictamen: { type: 'string' },
  },
  required: ['veredicto', 'fallas'],
}

const comun = `Worktree: ${a.worktree} (rama ${a.rama}). Trabajá con el cwd dentro de él; no crees otros worktrees.
Verificación SOLO con resúmenes: \`${resumen} <comando>\`. tsc una vez al final: \`${resumen} flock /tmp/tsc.lock npx tsc --noEmit -p .\`.
Commit por pathspec, sin push, con estos trailers:
${a.trailers}`

phase('Construir')
let construido = await agent(
  `Tarea: ${a.cliente}, Tanda ${a.tanda}.
Leé SOLO el extracto ${a.extracto}${a.mapa ? ` y el mapa de código ${a.mapa}` : ''}, y después los archivo:línea que necesites.
Archivos tuyos: ${a.archivosPropios}. No toques: ${a.noTocar}.
Criterios de aceptación: ${a.criterios}.
Riesgo: ${riesgos.join(', ') || 'visual'}. ${riesgos.length ? 'Plata/datos: test Postgres con dos negocios y doble envío (Postgres local del arnés).' : 'Todo archivo de pantalla tocado lleva un test o una línea de QA clic por clic en el informe.'}
${comun}`,
  { label: `construir ${nombre}`, phase: 'Construir', agentType: 'gsg-ingeniero', schema: CONSTRUCCION },
)
if (!construido) return { estado: 'cortado en la construcción', cliente: a.cliente, tanda: a.tanda }

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
Riesgos a atacar: ${riesgos.join(', ')}. Criterios: ${a.criterios}.
${foco}
Tus tests adversariales y el dictamen van en ${a.scratch}/cert-${nombre}/. Corré suites con \`${resumen} <comando>\`.`,
    { label: `certificar ${nombre}${vueltas ? ` (vuelta ${vueltas + 1})` : ''}`, phase: 'Certificar', agentType: 'gsg-certificador', model: 'opus', schema: DICTAMEN },
  )
  dictamen = await certificar('Primera vuelta: el diff completo de las superficies de riesgo.')

  while (dictamen && dictamen.fallas.some((f) => f.severidad !== 'baja') && vueltas < maxVueltas) {
    vueltas++
    const aCorregir = dictamen.fallas.filter((f) => f.severidad !== 'baja')
    log(`Vuelta ${vueltas}: ${aCorregir.length} falla(s) alta/media para corregir`)
    phase('Corregir')
    const correccion = await agent(
      `Corregí SOLO estas fallas de la certificación (con test que las reproduzca y pase):
${aCorregir.map((f, i) => `${i + 1}. [${f.severidad}] ${f.que} — ${f.donde || ''} — arreglo sugerido: ${f.arreglo || 'a criterio'}`).join('\n')}
${comun}`,
      { label: `corregir ${nombre} (vuelta ${vueltas})`, phase: 'Corregir', agentType: 'gsg-ingeniero', schema: CONSTRUCCION },
    )
    if (!correccion) break
    construido = { ...construido, commit: correccion.commit, archivosTocados: [...new Set([...construido.archivosTocados, ...correccion.archivosTocados])] }
    verificado = await verificar(`verificar ${nombre} (vuelta ${vueltas})`)
    phase('Certificar')
    dictamen = await certificar(`Vuelta ${vueltas + 1}: mirá SOLO lo corregido para estas fallas y su regresión inmediata:\n${aCorregir.map((f) => `- ${f.que}`).join('\n')}`)
  }
  let quedan = (dictamen?.fallas || []).filter((f) => f.severidad !== 'baja')
  if (quedan.length && vueltas >= maxVueltas && a.escalarFable !== false) {
    escalado = `Opus agotó ${vueltas} vuelta(s) y quedaban ${quedan.length} falla(s) alta/media: ${quedan.map((f) => f.que).join(' | ')}`
    log(`Escalamiento técnico a Fable (una única vuelta). Motivo: ${escalado}`)
    phase('Escalar')
    const escalada = await agent(
      `Escalamiento técnico: Opus no pudo cerrar estas fallas en ${vueltas} vuelta(s). Corregí SOLO estas (con test que las reproduzca y pase):
${quedan.map((f, i) => `${i + 1}. [${f.severidad}] ${f.que} — ${f.donde || ''} — arreglo sugerido: ${f.arreglo || 'a criterio'}`).join('\n')}
${comun}`,
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
