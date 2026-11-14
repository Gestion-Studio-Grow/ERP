// ============================================================================
// EQUIPO DE AGENTES · motor de permisos y topes (03 §6). PURO: sin base, sin reloj, sin red.
// ============================================================================
// `decidirLlamada` decide qué hace el motor con una herramienta: correrla, convertirla en propuesta,
// derivarla a una persona o negarla. Los límites viven acá, en el código; las instrucciones del
// modelo sólo describen el trabajo (03 §1.1).

import type { Clase, Equipo, Fila, Nivel, Puesto, PuestoId, RecorteGuardado, Tarea, TareaId, TopeId, Vigencia, Vista } from "./tipos";

/** Catálogo de topes (provisional, 05 S5). `sujeto` dice de quién es el cupo. */
export const TOPES: Readonly<Record<TopeId, { max: number; sujeto: "persona" | "puesto"; periodo: "dia" | "abiertos" }>> = {
  pedidos_por_dia: { max: 60, sujeto: "persona", periodo: "dia" },
  partes_a_pedido: { max: 10, sujeto: "persona", periodo: "dia" },
  propuestas_por_dia: { max: 10, sujeto: "puesto", periodo: "dia" },
  compromisos_abiertos: { max: 50, sujeto: "puesto", periodo: "abiertos" },
  notas_activas: { max: 40, sujeto: "puesto", periodo: "abiertos" },
  avisos_por_dia: { max: 20, sujeto: "puesto", periodo: "dia" },
  pares_conciliacion: { max: 20, sujeto: "puesto", periodo: "dia" },
};

/** El cupo de pedidos por persona es de la persona, no de un puesto: se guarda con este puesto. */
export const PUESTO_DE_LOS_PEDIDOS = "*";

export interface NivelEfectivo {
  nivel: Nivel;
  /** El valor guardado superaba el techo del código y se ignoró: hay que registrarlo. */
  guardadoIgnorado: boolean;
}

const esNivel = (n: unknown): n is Nivel => n === 0 || n === 1 || n === 2 || n === 3;

/** `min(techo, guardado ?? inicial)`. Un guardado inválido o mayor al techo no sube nada (03 §6.2). */
export function nivelEfectivo(tarea: Tarea, guardados: Readonly<Record<string, unknown>>): NivelEfectivo {
  const g = guardados[tarea.id];
  if (g === undefined) return { nivel: Math.min(tarea.techo, tarea.inicial) as Nivel, guardadoIgnorado: false };
  if (!esNivel(g)) return { nivel: Math.min(tarea.techo, tarea.inicial) as Nivel, guardadoIgnorado: true };
  if (g > tarea.techo) return { nivel: tarea.techo, guardadoIgnorado: true };
  return { nivel: g, guardadoIgnorado: false };
}

export type Decision =
  | { tipo: "correr"; nivel: Nivel }
  | { tipo: "proponer"; nivel: Nivel }
  | { tipo: "derivar"; nivel: Nivel }
  | { tipo: "negar"; motivo: "pausado" | "apagado" | "sin_tarea" | "nivel"; nivel: Nivel | null };

export function tareaDe(puesto: Puesto, tarea: TareaId): Tarea | undefined {
  return puesto.tareas.find((t) => t.id === tarea);
}

/**
 * La decisión de §6. `estado` es la vigencia leída EN ESE MOMENTO (03 §12.1), no al empezar la vuelta.
 * Los topes y la huella de `ejecuta` se miran después, en la transacción que escribe.
 */
export function decidirLlamada(p: { puesto: Puesto; tarea: TareaId; clase: Clase; estado: Vigencia }): Decision {
  if (!p.estado.vigente) return { tipo: "negar", motivo: p.estado.motivo, nivel: null };
  const tarea = tareaDe(p.puesto, p.tarea);
  // Una herramienta que dice ser de una tarea que el puesto no tiene no corre.
  if (!tarea || tarea.clase !== p.clase) return { tipo: "negar", motivo: "sin_tarea", nivel: null };
  const { nivel } = nivelEfectivo(tarea, p.estado.niveles);
  switch (p.clase) {
    case "lectura":
      return { tipo: "correr", nivel };
    case "prepara":
      return nivel >= 1 ? { tipo: "proponer", nivel } : { tipo: "negar", motivo: "nivel", nivel };
    case "ejecuta":
      if (nivel === 3) return { tipo: "derivar", nivel };
      if (nivel === 2) return { tipo: "correr", nivel };
      if (nivel === 1) return { tipo: "proponer", nivel };
      return { tipo: "negar", motivo: "nivel", nivel };
    case "deriva":
      return { tipo: "derivar", nivel };
  }
}

/** Día en hora de Argentina (UTC-3, sin horario de verano), `AAAA-MM-DD`. PURA: el instante entra por parámetro. */
export function diaArgentina(instante: Date): string {
  return new Date(instante.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** El período de un cupo: el día en Argentina o "abiertos". */
export function periodoDelTope(tope: TopeId, ahora: Date): string {
  return TOPES[tope].periodo === "abiertos" ? "abiertos" : diaArgentina(ahora);
}

// ── Equipos visibles (03 §2: más de un equipo en el mismo negocio) ──────────────────────────────

/** Los equipos que ve una persona: los que tienen todos sus módulos para ver. Lo decide el código. */
export function equiposVisibles(equipos: readonly Equipo[], puedeVer: (modulo: string) => boolean): Equipo[] {
  return equipos.filter((e) => e.modulosParaVer.length > 0 && e.modulosParaVer.every((m) => puedeVer(m)));
}

/** Los puestos de esos equipos: toda lectura de pedidos, partes y registro filtra por esta lista. */
export function puestosVisibles(equipos: readonly Equipo[], puedeVer: (modulo: string) => boolean): PuestoId[] {
  return equiposVisibles(equipos, puedeVer).flatMap((e) => e.puestos.map((p) => p.id));
}

/** El puesto del catálogo, o `undefined` si no existe en ningún equipo. */
export function buscarPuesto(equipos: readonly Equipo[], id: string): { equipo: Equipo; puesto: Puesto } | undefined {
  for (const equipo of equipos) {
    const puesto = equipo.puestos.find((p) => p.id === id);
    if (puesto) return { equipo, puesto };
  }
  return undefined;
}

// ── Recorte en tres capas (03 §5). Lo hace el motor sobre el Resultado, no cada herramienta ──────

/**
 * Capa 2 (proyectos) y capa 3 (columnas) sobre los renglones: se descarta todo renglón de un
 * proyecto que la persona no ve (los sin proyecto, sólo si ve esos) y se quita toda cifra de una
 * columna oculta. `recortado` avisa que hay que recalcular (o descartar) los totales. La capa 1
 * (módulo) se mira antes de leer.
 */
export function recortarFilas(filas: readonly Fila[], vista: Pick<Vista, "proyectos" | "veSinProyecto" | "columnasOcultas"> | null): { filas: Fila[]; recortado: boolean } {
  if (!vista) return { filas: [...filas], recortado: false };
  let recortado = false;
  const salida: Fila[] = [];
  for (const f of filas) {
    const visible = f.proyectoId === null ? vista.veSinProyecto : vista.proyectos === "todos" || vista.proyectos.has(f.proyectoId);
    if (!visible) {
      recortado = true;
      continue;
    }
    const cifras = f.cifras.filter((c) => !(c.columna && vista.columnasOcultas.has(c.columna)));
    if (cifras.length !== f.cifras.length) recortado = true;
    salida.push(cifras.length === f.cifras.length ? f : { ...f, cifras });
  }
  return { filas: salida, recortado };
}

// ── El recorte de quien dejó el pedido (06 C4): se guarda con el pedido, nunca se rearma ─────────

/** Los módulos que nombra el catálogo de equipos (para ver el equipo y los de cada puesto). */
export function modulosDelCatalogo(equipos: readonly Equipo[]): string[] {
  const m = new Set<string>();
  for (const e of equipos) {
    for (const x of e.modulosParaVer) m.add(x);
    for (const p of e.puestos) for (const x of p.modulos) m.add(x);
  }
  return [...m].sort();
}

/**
 * Lo que veía la persona AL DEJAR el pedido, tomado de su `Vista` (armada con SU sesión). Sólo
 * nombres de módulo y columna e ids de proyecto: ni tenantId, ni userId, ni datos de terceros.
 */
export function recorteDeLaVista(vista: Vista, equipos: readonly Equipo[]): RecorteGuardado {
  return {
    modulos: modulosDelCatalogo(equipos).filter((m) => vista.puedeVer(m)),
    proyectos: vista.proyectos === "todos" ? "todos" : [...vista.proyectos].sort(),
    veSinProyecto: vista.veSinProyecto,
    columnasOcultas: [...vista.columnasOcultas].sort(),
  };
}

const listaDeTextos = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === "string");

/**
 * La restricción que sale de un `recorte` guardado, para aplicarla igual que una vista (capas 1 a 3).
 * Cualquier forma que no sea la esperada (o un pedido viejo sin recorte) da `null`: quien la use
 * muestra la ficha VACÍA, nunca sin recortar.
 */
export function restriccionDesdeRecorte(r: unknown): (Pick<Vista, "puedeVer" | "proyectos" | "veSinProyecto" | "columnasOcultas">) | null {
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const o = r as Record<string, unknown>;
  if (!listaDeTextos(o.modulos) || !listaDeTextos(o.columnasOcultas) || typeof o.veSinProyecto !== "boolean") return null;
  if (o.proyectos !== "todos" && !listaDeTextos(o.proyectos)) return null;
  const modulos = new Set(o.modulos);
  return {
    puedeVer: (m) => modulos.has(m),
    proyectos: o.proyectos === "todos" ? "todos" : new Set(o.proyectos as string[]),
    veSinProyecto: o.veSinProyecto,
    columnasOcultas: new Set(o.columnasOcultas),
  };
}
