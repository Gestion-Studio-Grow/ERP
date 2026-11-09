// ARMADOR DE STANDS — el diseño como dato y su cómputo de materiales. Puro: lo usan el editor 3D,
// el visor de la propuesta, las acciones del servidor y las pruebas. Todas las medidas en metros.

export const TIPOS_STAND = ["LINEAL", "ESQUINA", "PENINSULA", "ISLA"] as const;
export type TipoStand = (typeof TIPOS_STAND)[number];

/** Cada tipo de lote se define por cuántos lados abiertos tiene al pasillo. */
export const TIPO_STAND_LABEL: Record<TipoStand, string> = {
  LINEAL: "Lineal (1 lado abierto)",
  ESQUINA: "Esquina (2 lados abiertos)",
  PENINSULA: "Península (3 lados abiertos)",
  ISLA: "Isla (4 lados abiertos)",
};

export type Lado = "fondo" | "izquierda" | "derecha";

export const PIEZAS = {
  MOSTRADOR: { label: "Mostrador", ancho: 1.5, fondo: 0.6, alto: 1.1, unidad: "u" },
  PANTALLA: { label: "Pantalla LED", ancho: 2, fondo: 0.15, alto: 2.2, unidad: "u" },
  TOTEM: { label: "Tótem", ancho: 0.8, fondo: 0.4, alto: 2.2, unidad: "u" },
  VITRINA: { label: "Exhibidor", ancho: 1, fondo: 0.5, alto: 1.8, unidad: "u" },
  MESA: { label: "Mesa con sillas", ancho: 1.2, fondo: 1.2, alto: 0.75, unidad: "u" },
  TARIMA: { label: "Tarima para producto", ancho: 2.4, fondo: 2.4, alto: 0.2, unidad: "u" },
  DEPOSITO: { label: "Depósito", ancho: 1.5, fondo: 1, alto: 2.5, unidad: "u" },
  PLANTA: { label: "Planta", ancho: 0.5, fondo: 0.5, alto: 1.4, unidad: "u" },
  // Activaciones de marca
  PHOTOCALL: { label: "Photocall", ancho: 2.4, fondo: 0.4, alto: 2.4, unidad: "u" },
  ZONA_PRUEBA: { label: "Zona de prueba de producto", ancho: 2, fondo: 1, alto: 1.2, unidad: "u" },
  DESAFIO: { label: "Estación de desafío interactivo", ancho: 1.2, fondo: 1.2, alto: 1.9, unidad: "u" },
  MURO_EXHIBICION: { label: "Muro de exhibición", ancho: 2.4, fondo: 0.3, alto: 2.2, unidad: "u" },
  MONITOR_55: { label: "Monitor de 55 pulgadas", ancho: 1.3, fondo: 0.5, alto: 1.8, unidad: "u" },
  CINTA: { label: "Cinta de correr", ancho: 0.9, fondo: 1.9, alto: 1.3, unidad: "u" },
  ARCO: { label: "Arco de largada", ancho: 3, fondo: 0.5, alto: 2.8, unidad: "u" },
  SILLON: { label: "Sillón", ancho: 1.8, fondo: 0.8, alto: 0.8, unidad: "u" },
  POUF: { label: "Pouf", ancho: 0.5, fondo: 0.5, alto: 0.45, unidad: "u" },
  ISLA_PRODUCTO: { label: "Isla de producto", ancho: 1.2, fondo: 1.2, alto: 1, unidad: "u" },
  BARRA: { label: "Barra", ancho: 2.4, fondo: 0.6, alto: 1.1, unidad: "u" },
} as const;
export type TipoPieza = keyof typeof PIEZAS;

export const ACABADOS_PISO = {
  ALFOMBRA: { label: "Alfombra", color: "#6b6f76" },
  VINILO: { label: "Vinilo madera", color: "#a98560" },
  MELAMINA: { label: "Melamina blanca", color: "#e9e7df" },
} as const;
export type AcabadoPiso = keyof typeof ACABADOS_PISO;

export interface Pieza {
  id: string;
  tipo: TipoPieza;
  /** Centro de la pieza, medido desde el centro del lote. */
  x: number;
  z: number;
  /** Giro en cuartos de vuelta (0 a 3). */
  giro: number;
}

export interface DisenoStand {
  version: 1;
  tipo: TipoStand;
  ancho: number;
  fondo: number;
  altoPared: number;
  colorPared: string;
  colorAcento: string;
  piso: AcabadoPiso;
  tarimaPiso: boolean;
  /** Marca del cliente: se pinta en las paredes y en la cenefa. */
  textoMarca: string;
  piezas: Pieza[];
}

export const LIMITES = { min: 2, max: 30, altoMin: 2.2, altoMax: 6, maxPiezas: 60 };

export const paso = (n: number, salto = 0.25): number => Math.round(n / salto) * salto;

const entre = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** Qué lados llevan pared: los que NO dan al pasillo. */
export function paredesDe(tipo: TipoStand): Lado[] {
  switch (tipo) {
    case "LINEAL":
      return ["fondo", "izquierda", "derecha"];
    case "ESQUINA":
      return ["fondo", "izquierda"];
    case "PENINSULA":
      return ["fondo"];
    case "ISLA":
      return [];
  }
}

export function disenoInicial(tipo: TipoStand = "ESQUINA", ancho = 6, fondo = 4): DisenoStand {
  return {
    version: 1,
    tipo,
    ancho,
    fondo,
    altoPared: 3,
    colorPared: "#E3E1D4",
    colorAcento: "#0049D5",
    piso: "ALFOMBRA",
    tarimaPiso: false,
    textoMarca: "",
    piezas: [
      { id: "p1", tipo: "MOSTRADOR", x: 0, z: fondo / 2 - 1, giro: 0 },
      { id: "p2", tipo: "PANTALLA", x: 0, z: -fondo / 2 + 0.2, giro: 0 },
    ],
  };
}

function tamanoGirado(p: Pick<Pieza, "tipo" | "giro">): { ancho: number; fondo: number } {
  const b = PIEZAS[p.tipo];
  return p.giro % 2 === 0 ? { ancho: b.ancho, fondo: b.fondo } : { ancho: b.fondo, fondo: b.ancho };
}

/** Deja la pieza adentro del lote y sobre la grilla de 25 cm. */
export function dentroDelLote(p: Pieza, d: Pick<DisenoStand, "ancho" | "fondo">): Pieza {
  const t = tamanoGirado(p);
  const maxX = Math.max(0, (d.ancho - t.ancho) / 2);
  const maxZ = Math.max(0, (d.fondo - t.fondo) / 2);
  return { ...p, x: entre(paso(p.x), -maxX, maxX), z: entre(paso(p.z), -maxZ, maxZ) };
}

/**
 * Lo que entra de afuera (formulario o JSON guardado) se valida entero: un diseño roto no llega a la
 * base ni al visor del cliente. Devuelve null si no se puede salvar.
 */
export function normalizarDiseno(raw: unknown): DisenoStand | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const tipo = (TIPOS_STAND as readonly string[]).includes(String(r.tipo)) ? (r.tipo as TipoStand) : null;
  const ancho = Number(r.ancho);
  const fondo = Number(r.fondo);
  if (!tipo || !Number.isFinite(ancho) || !Number.isFinite(fondo)) return null;
  const color = (v: unknown, def: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : def);
  const alto = Number(r.altoPared);
  const base = {
    ancho: entre(paso(ancho, 0.5), LIMITES.min, LIMITES.max),
    fondo: entre(paso(fondo, 0.5), LIMITES.min, LIMITES.max),
  };
  const piezas = (Array.isArray(r.piezas) ? r.piezas : [])
    .slice(0, LIMITES.maxPiezas)
    .flatMap((v, i): Pieza[] => {
      const p = v as Record<string, unknown>;
      if (!p || !Object.hasOwn(PIEZAS, String(p.tipo))) return [];
      const x = Number(p.x);
      const z = Number(p.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
      const giro = ((Math.round(Number(p.giro) || 0) % 4) + 4) % 4;
      const id = typeof p.id === "string" && p.id.length <= 24 ? p.id : `p${i}`;
      return [dentroDelLote({ id, tipo: p.tipo as TipoPieza, x, z, giro }, base)];
    });
  return {
    version: 1,
    tipo,
    ...base,
    altoPared: entre(Number.isFinite(alto) ? paso(alto, 0.1) : 3, LIMITES.altoMin, LIMITES.altoMax),
    colorPared: color(r.colorPared, "#E3E1D4"),
    colorAcento: color(r.colorAcento, "#0049D5"),
    piso: Object.hasOwn(ACABADOS_PISO, String(r.piso)) ? (r.piso as AcabadoPiso) : "ALFOMBRA",
    tarimaPiso: r.tarimaPiso === true,
    textoMarca: typeof r.textoMarca === "string" ? r.textoMarca.slice(0, 40) : "",
    piezas,
  };
}

// ── Cómputo: del dibujo a la lista de materiales ────────────────────────────

export type ClaveCosto = "piso" | "tarimaPiso" | "pared" | "grafica" | "armado" | "flete" | TipoPieza;

/** Costos de referencia por unidad. PROVISIONALES: cada negocio carga los suyos en Configuración. */
export const COSTOS_REFERENCIA: Record<ClaveCosto, number> = {
  piso: 18000,
  tarimaPiso: 42000,
  pared: 65000,
  grafica: 38000,
  armado: 30000,
  flete: 280000,
  MOSTRADOR: 320000,
  PANTALLA: 900000,
  TOTEM: 240000,
  VITRINA: 280000,
  MESA: 150000,
  TARIMA: 380000,
  DEPOSITO: 450000,
  PLANTA: 45000,
  PHOTOCALL: 260000,
  ZONA_PRUEBA: 350000,
  DESAFIO: 520000,
  MURO_EXHIBICION: 380000,
  MONITOR_55: 480000,
  CINTA: 850000,
  ARCO: 600000,
  SILLON: 220000,
  POUF: 60000,
  ISLA_PRODUCTO: 360000,
  BARRA: 420000,
};

export const COSTO_LABEL: Record<ClaveCosto, string> = {
  piso: "Piso (por m²)",
  tarimaPiso: "Tarima de piso (por m²)",
  pared: "Pared (por m²)",
  grafica: "Gráfica (por m²)",
  armado: "Mano de obra de armado y desarme (por m² de lote)",
  flete: "Flete (por viaje)",
  ...(Object.fromEntries(Object.entries(PIEZAS).map(([k, v]) => [k, v.label])) as Record<TipoPieza, string>),
};

export function costosVigentes(guardados: unknown): Record<ClaveCosto, number> {
  const g = (guardados && typeof guardados === "object" ? guardados : {}) as Record<string, unknown>;
  const res = { ...COSTOS_REFERENCIA };
  for (const k of Object.keys(res) as ClaveCosto[]) {
    const v = Number(g[k]);
    if (Number.isFinite(v) && v >= 0) res[k] = v;
  }
  return res;
}

export interface LineaComputo {
  clave: ClaveCosto;
  rubro: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
}

const dos = (n: number) => Math.round(n * 100) / 100; // no-es-plata: metros y unidades del cómputo

export function superficieParedes(d: DisenoStand): number {
  return dos(paredesDe(d.tipo).reduce((s, lado) => s + (lado === "fondo" ? d.ancho : d.fondo) * d.altoPared, 0));
}

/** El despiece del stand. Sale del dibujo; los precios se ponen aparte. */
export function computar(d: DisenoStand): LineaComputo[] {
  const m2 = dos(d.ancho * d.fondo);
  const paredes = superficieParedes(d);
  const lineas: LineaComputo[] = [
    { clave: "piso", rubro: "Estructura y piso", descripcion: `Piso ${ACABADOS_PISO[d.piso].label.toLowerCase()}`, unidad: "m²", cantidad: m2 },
  ];
  if (d.tarimaPiso) lineas.push({ clave: "tarimaPiso", rubro: "Estructura y piso", descripcion: "Tarima de piso", unidad: "m²", cantidad: m2 });
  if (paredes > 0) {
    lineas.push({ clave: "pared", rubro: "Estructura y piso", descripcion: `Paredes de ${d.altoPared} m de alto`, unidad: "m²", cantidad: paredes });
    lineas.push({ clave: "grafica", rubro: "Gráfica", descripcion: "Gráfica impresa sobre paredes", unidad: "m²", cantidad: paredes });
  }
  const cuenta = new Map<TipoPieza, number>();
  for (const p of d.piezas) cuenta.set(p.tipo, (cuenta.get(p.tipo) ?? 0) + 1);
  for (const [tipo, cantidad] of cuenta) {
    lineas.push({ clave: tipo, rubro: "Equipamiento", descripcion: PIEZAS[tipo].label, unidad: PIEZAS[tipo].unidad, cantidad });
  }
  lineas.push({ clave: "armado", rubro: "Logística y armado", descripcion: "Armado y desarme", unidad: "m²", cantidad: m2 });
  lineas.push({ clave: "flete", rubro: "Logística y armado", descripcion: "Flete ida y vuelta", unidad: "viaje", cantidad: 1 });
  return lineas;
}

// ── Paleta, lugar libre y validaciones ──────────────────────────────────────

/** Cómo se agrupan las piezas en el editor: cada una aparece en un solo grupo. */
export const GRUPOS_PIEZAS: readonly { titulo: string; piezas: readonly TipoPieza[] }[] = [
  { titulo: "Atención y exhibición", piezas: ["MOSTRADOR", "VITRINA", "MURO_EXHIBICION", "ISLA_PRODUCTO", "BARRA"] },
  { titulo: "Pantallas y gráfica", piezas: ["PANTALLA", "MONITOR_55", "TOTEM", "PHOTOCALL"] },
  { titulo: "Activación", piezas: ["ZONA_PRUEBA", "DESAFIO", "CINTA", "ARCO"] },
  { titulo: "Mobiliario y estructura", piezas: ["MESA", "SILLON", "POUF", "TARIMA", "DEPOSITO", "PLANTA"] },
];

const EPS = 1e-9;

function huella(p: Pick<Pieza, "tipo" | "giro" | "x" | "z">) {
  const t = tamanoGirado(p);
  return { x0: p.x - t.ancho / 2, x1: p.x + t.ancho / 2, z0: p.z - t.fondo / 2, z1: p.z + t.fondo / 2 };
}

function seSuperponen(a: Pick<Pieza, "tipo" | "giro" | "x" | "z">, b: Pick<Pieza, "tipo" | "giro" | "x" | "z">): boolean {
  const p = huella(a);
  const q = huella(b);
  return p.x0 < q.x1 - EPS && q.x0 < p.x1 - EPS && p.z0 < q.z1 - EPS && q.z0 < p.z1 - EPS;
}

/** Piezas que van contra la pared del fondo: ahí se las busca primero. */
export const CONTRA_PARED: readonly TipoPieza[] = ["PANTALLA", "MONITOR_55", "MURO_EXHIBICION", "PHOTOCALL", "DEPOSITO"];

/** El primer lugar del lote donde la pieza entra sin tocar a otra, del centro hacia los lados; las piezas de pared empiezan por el fondo y el resto por el frente. Si no hay, el centro. */
export function lugarLibre(d: DisenoStand, tipo: TipoPieza): { x: number; z: number } {
  const t = tamanoGirado({ tipo, giro: 0 });
  const maxX = Math.max(0, (d.ancho - t.ancho) / 2);
  const maxZ = Math.max(0, (d.fondo - t.fondo) / 2);
  const pasos = Math.round(maxX / 0.25);
  const alFondo = CONTRA_PARED.includes(tipo);
  for (let i = 0; i <= Math.round((2 * maxZ) / 0.25); i++) {
    const z = alFondo ? -paso(maxZ) + i * 0.25 : paso(maxZ) - i * 0.25;
    if (Math.abs(z) > maxZ + EPS) continue;
    for (let k = 0; k <= pasos; k++) {
      for (const sx of k === 0 ? [1] : [1, -1]) {
        const c = { tipo, giro: 0, x: sx * k * 0.25, z };
        if (Math.abs(c.x) <= maxX + EPS && !d.piezas.some((p) => seSuperponen(c, p))) return { x: c.x, z: c.z };
      }
    }
  }
  return { x: 0, z: 0 };
}

export interface AvisoStand {
  nivel: "error" | "aviso";
  texto: string;
  /** Piezas involucradas, para resaltarlas en la lista. */
  piezas: string[];
}

const metros = (n: number): string => String(Math.round(n * 100) / 100).replace(".", ","); // no-es-plata: medidas en metros

/** Qué parte del piso del lote tapan las piezas, en %. */
export function ocupacionStand(d: Pick<DisenoStand, "ancho" | "fondo" | "piezas">): number {
  const ocupado = d.piezas.reduce((s, p) => s + PIEZAS[p.tipo].ancho * PIEZAS[p.tipo].fondo, 0);
  return Math.round((ocupado / (d.ancho * d.fondo)) * 100); // no-es-plata: ocupación del piso en %
}

/** Controles que se pueden hacer sin un profesional: superposición, altura y espacio para circular. No reemplaza la validación técnica. */
export function validarDiseno(d: DisenoStand): AvisoStand[] {
  const avisos: AvisoStand[] = [];
  if (d.piezas.length === 0) return [{ nivel: "aviso", texto: "El stand todavía no tiene piezas.", piezas: [] }];
  for (let i = 0; i < d.piezas.length; i++) {
    for (let j = i + 1; j < d.piezas.length; j++) {
      if (seSuperponen(d.piezas[i], d.piezas[j])) avisos.push({ nivel: "error", texto: `${PIEZAS[d.piezas[i].tipo].label} y ${PIEZAS[d.piezas[j].tipo].label} se superponen.`, piezas: [d.piezas[i].id, d.piezas[j].id] });
    }
  }
  for (const p of d.piezas) {
    const alto = PIEZAS[p.tipo].alto;
    if (alto > d.altoPared + EPS) avisos.push({ nivel: "error", texto: `${PIEZAS[p.tipo].label} mide ${metros(alto)} m y el alto del lote es de ${metros(d.altoPared)} m.`, piezas: [p.id] });
  }
  const pct = ocupacionStand(d);
  if (pct > 50) avisos.push({ nivel: "aviso", texto: `Las piezas ocupan el ${pct} % del lote: queda poco lugar para circular.`, piezas: [] });
  return avisos;
}

/**
 * Qué impide eliminar una maqueta: sus materiales están en una cotización que ya se envió, o alguno ya se contrató o tiene costo real.
 * Devuelve el motivo para mostrarle a la persona, o null si se puede (y entonces se van la maqueta y sus renglones del borrador).
 */
export function bloqueoDeEliminar(renglones: readonly { presupuestoEstado: string; version: number; estadoItem: string; costoReal: number | null }[]): string | null {
  const viva = renglones.find((r) => r.presupuestoEstado === "ENVIADO" || r.presupuestoEstado === "APROBADO");
  if (viva) return `Los materiales de esta maqueta están en la cotización de la versión ${viva.version}, que ya se envió al cliente. Esa cotización no se toca: abrí una versión nueva en Cotización, sacá esos renglones y recién después eliminá la maqueta.`;
  const avanzado = renglones.find((r) => r.presupuestoEstado === "BORRADOR" && (r.estadoItem === "CONTRATADO" || r.estadoItem === "ENTREGADO" || r.costoReal !== null));
  if (avanzado) return "Alguno de los materiales de esta maqueta ya se contrató o tiene costo real cargado. Sacalo a mano del presupuesto antes de eliminar la maqueta.";
  return null;
}
