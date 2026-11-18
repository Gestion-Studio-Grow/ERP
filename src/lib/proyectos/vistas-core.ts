// ============================================================================
// VISTAS GUARDADAS DE LAS LISTAS (MIA T03, O46; diseño MIA § 4.2). PURO.
// Una vista guarda columnas, filtros, agrupación y orden, de una persona o de un rol. NUNCA devuelve una columna que el
// permiso del rol oculta: el permiso se aplica al leer (`proyectarFila`), no se confía en lo que diga la vista guardada.
// Listas de esta tanda: «A cobrar» y «A pagar». Proyectos (T09) y liquidaciones (T12) suman su catálogo de columnas acá.
// ============================================================================

export const LISTAS = [
  { id: "a-cobrar", label: "Cuentas a cobrar" },
  { id: "a-pagar", label: "Cuentas a pagar" },
] as const;
export type ListaId = (typeof LISTAS)[number]["id"];
export const esLista = (v: unknown): v is ListaId => typeof v === "string" && LISTAS.some((l) => l.id === v);

export interface ColumnaDef {
  id: string;
  label: string;
  /** Siempre a la vista: ninguna vista la saca (las acciones no quedan escondidas, plan R6). */
  fija?: boolean;
  /** Columna de la ficha (`COLUMNAS_FICHA`) que, si el rol la tiene oculta, oculta también esta. */
  oculta?: string;
}

const COMUNES = (contraparte: string, montoOculta?: string): ColumnaDef[] => [
  { id: "vence", label: "Vence", fija: true },
  { id: "evento", label: "Evento" },
  { id: "contraparte", label: contraparte },
  { id: "concepto", label: "Concepto" },
  { id: "monto", label: "Monto", oculta: montoOculta },
  { id: "enPesos", label: "En pesos", oculta: montoOculta },
  { id: "factura", label: "Factura" },
  { id: "estado", label: "Estado" },
  { id: "accion", label: "Acción", fija: true },
  { id: "comentario", label: "Comentario" },
];

/** Lo que se le paga a un proveedor es costo: quien no ve costos en la ficha tampoco ve esos montos. */
export const COLUMNAS: Record<ListaId, readonly ColumnaDef[]> = {
  "a-cobrar": COMUNES("Cliente"),
  "a-pagar": COMUNES("Proveedor", "costoTotal"),
};

export const FILTRO_ESTADO = ["pendientes", "vencidos", "pagados", "todos"] as const;
export const FILTRO_ORIGEN = ["todos", "eventos", "empresa"] as const;
export const FILTRO_MONEDA = ["todas", "ARS", "USD"] as const;
export const VENCE_EN = [0, 7, 30] as const;
export const AGRUPACIONES = [
  { id: "", label: "Sin agrupar" },
  { id: "evento", label: "Por evento" },
  { id: "contraparte", label: "Por cliente o proveedor" },
  { id: "estado", label: "Por estado" },
  { id: "mes", label: "Por mes de vencimiento" },
] as const;
export const ORDENES = [
  { id: "vence:asc", label: "Vence primero" },
  { id: "vence:desc", label: "Vence último" },
  { id: "monto:desc", label: "Monto mayor" },
  { id: "monto:asc", label: "Monto menor" },
  { id: "contraparte:asc", label: "Cliente o proveedor (A-Z)" },
] as const;

export interface Filtros { estado: (typeof FILTRO_ESTADO)[number]; origen: (typeof FILTRO_ORIGEN)[number]; moneda: (typeof FILTRO_MONEDA)[number]; venceEnDias: (typeof VENCE_EN)[number] }
export interface Vista { columnas: string[]; filtros: Filtros; agrupacion: string; orden: string }
export interface VistaGuardada extends Vista { id: string; nombre: string; alcance: "PERSONA" | "ROL" | "SISTEMA"; propietario: string }

export const FILTROS_BASE: Filtros = { estado: "pendientes", origen: "todos", moneda: "todas", venceEnDias: 0 };

/** Las vistas que trae el sistema (diseño § 4.2: «Vence esta semana», de Administración). No se guardan en la base. */
export function vistasDelSistema(lista: ListaId): VistaGuardada[] {
  const todas = COLUMNAS[lista].map((c) => c.id);
  return [
    { id: "sistema:todas", nombre: "Todas las columnas", alcance: "SISTEMA", propietario: "", columnas: todas, filtros: FILTROS_BASE, agrupacion: "", orden: "vence:asc" },
    { id: "sistema:semana", nombre: "Vence esta semana", alcance: "SISTEMA", propietario: "", columnas: todas, filtros: { ...FILTROS_BASE, venceEnDias: 7 }, agrupacion: "", orden: "vence:asc" },
  ];
}

const uno = <T extends string | number>(ops: readonly T[], v: unknown, base: T): T => (ops.includes(v as T) ? (v as T) : base);

/** Lo que llega (de la base o del formulario) → una vista válida, o el error. PURA. */
export function normalizarVista(lista: ListaId, crudo: { columnas?: unknown; filtros?: unknown; agrupacion?: unknown; orden?: unknown }): { ok: true; vista: Vista } | { ok: false; error: string } {
  const catalogo = COLUMNAS[lista];
  const columnas = Array.isArray(crudo.columnas) ? crudo.columnas.filter((c): c is string => typeof c === "string") : [];
  if (columnas.some((c) => !catalogo.some((d) => d.id === c))) return { ok: false, error: "Hay una columna que esta lista no tiene." };
  const elegidas = catalogo.filter((d) => d.fija || columnas.includes(d.id)).map((d) => d.id);
  if (elegidas.length === catalogo.filter((d) => d.fija).length) return { ok: false, error: "Elegí al menos una columna." };
  const f = (crudo.filtros ?? {}) as Record<string, unknown>;
  const filtros: Filtros = {
    estado: uno(FILTRO_ESTADO, f.estado, FILTROS_BASE.estado),
    origen: uno(FILTRO_ORIGEN, f.origen, FILTROS_BASE.origen),
    moneda: uno(FILTRO_MONEDA, f.moneda, FILTROS_BASE.moneda),
    venceEnDias: uno(VENCE_EN, Number(f.venceEnDias ?? 0), 0),
  };
  if (typeof crudo.agrupacion === "string" && !AGRUPACIONES.some((a) => a.id === crudo.agrupacion)) return { ok: false, error: "Esa agrupación no existe." };
  if (crudo.orden != null && !ORDENES.some((o) => o.id === crudo.orden)) return { ok: false, error: "Ese orden no existe." };
  return { ok: true, vista: { columnas: elegidas, filtros, agrupacion: typeof crudo.agrupacion === "string" ? crudo.agrupacion : "", orden: typeof crudo.orden === "string" ? crudo.orden : "vence:asc" } };
}

/** Las columnas que el rol puede ver de esta lista, dado lo que tiene oculto en la ficha. PURA. */
export function columnasPermitidas(lista: ListaId, ocultasDelRol: readonly string[]): ColumnaDef[] {
  return COLUMNAS[lista].filter((c) => !c.oculta || !ocultasDelRol.includes(c.oculta));
}

/** Lo que se muestra: lo que pide la vista, menos lo que el permiso oculta, más las fijas. En el orden del catálogo. PURA. */
export function columnasDeLaVista(lista: ListaId, vista: Pick<Vista, "columnas">, ocultasDelRol: readonly string[]): ColumnaDef[] {
  return columnasPermitidas(lista, ocultasDelRol).filter((c) => c.fija || vista.columnas.includes(c.id));
}

/** Una fila de cuenta, ya calculada (lo que falta, en pesos, su estado). */
export interface FilaCuenta {
  id: string;
  vence: Date;
  evento: string | null;
  contraparte: string;
  concepto: string;
  monto: number;
  moneda: string;
  enPesos: number;
  factura: string | null;
  estado: "PAGADA" | "VENCIDA" | "PENDIENTE";
  deEmpresa: boolean;
  comentario: string | null;
}

/** Sólo las columnas que se pueden mostrar: lo oculto no viaja (ni en la respuesta ni en el HTML). PURA. */
export function proyectarFila(fila: FilaCuenta, columnas: readonly ColumnaDef[]): Record<string, unknown> {
  const salida: Record<string, unknown> = { id: fila.id };
  for (const c of columnas) {
    if (c.id === "accion") continue;
    if (c.id === "monto") { salida.monto = fila.monto; salida.moneda = fila.moneda; continue; }
    salida[c.id] = (fila as unknown as Record<string, unknown>)[c.id];
  }
  return salida;
}

const DIA = 86_400_000;

/** ¿La fila pasa los filtros de la vista? El estado «pendientes» incluye las vencidas, como la lista de hoy. PURA. */
export function pasaFiltros(f: Pick<FilaCuenta, "estado" | "deEmpresa" | "moneda" | "vence">, filtros: Filtros, hoy: Date): boolean {
  const okEstado = filtros.estado === "todos" || (filtros.estado === "pagados" ? f.estado === "PAGADA" : filtros.estado === "vencidos" ? f.estado === "VENCIDA" : f.estado !== "PAGADA");
  const okOrigen = filtros.origen === "todos" || (filtros.origen === "empresa") === f.deEmpresa;
  const okMoneda = filtros.moneda === "todas" || f.moneda === filtros.moneda;
  const okVence = !filtros.venceEnDias || f.vence.getTime() <= hoy.getTime() + filtros.venceEnDias * DIA;
  return okEstado && okOrigen && okMoneda && okVence;
}

/** Ordena sin tocar el original. El monto se compara en pesos. PURA. */
export function ordenar<T extends Pick<FilaCuenta, "vence" | "enPesos" | "contraparte">>(filas: readonly T[], orden: string): T[] {
  const [campo, dir] = orden.split(":");
  const signo = dir === "desc" ? -1 : 1;
  const clave = (f: T): number | string => (campo === "monto" ? f.enPesos : campo === "contraparte" ? f.contraparte.toLowerCase() : f.vence.getTime());
  return [...filas].sort((a, b) => {
    const x = clave(a), y = clave(b);
    return (x < y ? -1 : x > y ? 1 : 0) * signo || a.vence.getTime() - b.vence.getTime();
  });
}

const ESTADO_TITULO = { PENDIENTE: "Pendientes", VENCIDA: "Vencidas", PAGADA: "Pagadas" } as const;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Agrupa conservando el orden de las filas. Sin agrupación, un solo grupo sin título. PURA. */
export function agrupar<T extends Pick<FilaCuenta, "evento" | "contraparte" | "estado" | "vence">>(filas: readonly T[], agrupacion: string): { clave: string; titulo: string; filas: T[] }[] {
  if (!agrupacion) return [{ clave: "", titulo: "", filas: [...filas] }];
  const titulo = (f: T): string =>
    agrupacion === "evento" ? (f.evento ?? "Empresa") : agrupacion === "contraparte" ? f.contraparte : agrupacion === "estado" ? ESTADO_TITULO[f.estado] : `${MESES[f.vence.getMonth()]} ${f.vence.getFullYear()}`;
  const grupos = new Map<string, T[]>();
  for (const f of filas) grupos.set(titulo(f), [...(grupos.get(titulo(f)) ?? []), f]);
  return [...grupos].map(([t, fs]) => ({ clave: t, titulo: t, filas: fs }));
}

/** Qué vistas ve esta persona: las del sistema, las de su rol y las suyas. Nunca las personales de otro. PURA. */
export function vistasVisibles<T extends { alcance: string; propietario: string }>(guardadas: readonly T[], userId: string, rol: string): T[] {
  return guardadas.filter((v) => (v.alcance === "PERSONA" && v.propietario === userId) || (v.alcance === "ROL" && v.propietario === rol));
}
