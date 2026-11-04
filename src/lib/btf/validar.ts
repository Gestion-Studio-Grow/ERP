// Validación de lo que manda la app. Mismas reglas que el repositorio local de la app
// (celula-negocios-digitales/buscatufoto/src/lib/repo/idb.ts → validarAlbum / actualizarMarca), acá contra
// datos NO confiables: se reconstruye cada objeto campo por campo, nunca se guarda el cuerpo tal cual.

import { ErrorBtf } from "./http";
import { nuevoId } from "./ids";
import type { Album, Colaborador, Cupon, DatosCobro, EscalonDescuento, MarcaAgua, Paquete, TipoEvento } from "./tipos";

const mal = (m: string) => new ErrorBtf("invalido", m);
const esObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const ent = (v: unknown) => Math.round(num(v));

export const OPACIDAD_MIN = 0.15;
const EVENTOS: readonly TipoEvento[] = ["carrera", "torneo", "fiesta", "otro"];
const MAX_LOGO = 300_000;

export type CamposAlbum = Pick<
  Album,
  "nombre" | "evento" | "lugar" | "fecha" | "descripcion" | "precioFoto" | "precioVideo" | "paquetes" | "escalones" | "cupones" | "colaboradores" | "publicado"
>;

function paquetes(v: unknown): Paquete[] {
  if (!Array.isArray(v) || v.length > 20) throw mal("Revisá los paquetes.");
  return v.map((p) => {
    if (!esObj(p)) throw mal("Revisá los paquetes.");
    return { id: str(p.id, 40) || nuevoId("pq"), nombre: str(p.nombre, 80), cantidad: ent(p.cantidad), precio: ent(p.precio) };
  });
}

function escalones(v: unknown): EscalonDescuento[] {
  if (!Array.isArray(v) || v.length > 20) throw mal("Revisá los descuentos por cantidad.");
  return v.map((e) => {
    if (!esObj(e)) throw mal("Revisá los descuentos por cantidad.");
    return { desde: ent(e.desde), porcentaje: ent(e.porcentaje) };
  });
}

function cupones(v: unknown): Cupon[] {
  if (!Array.isArray(v) || v.length > 50) throw mal("Revisá los cupones.");
  return v.map((c) => {
    if (!esObj(c)) throw mal("Revisá los cupones.");
    return {
      codigo: str(c.codigo, 20).toUpperCase(),
      tipo: c.tipo === "monto" ? "monto" : "porcentaje",
      valor: ent(c.valor),
      tope: ent(c.tope ?? 0),
      usosMax: ent(c.usosMax ?? 0),
      usos: ent(c.usos ?? 0),
      activo: c.activo !== false,
    };
  });
}

function colaboradores(v: unknown): Colaborador[] {
  if (!Array.isArray(v) || v.length > 20) throw mal("Revisá los colaboradores.");
  return v.map((c) => {
    if (!esObj(c)) throw mal("Revisá los colaboradores.");
    return { id: str(c.id, 40) || nuevoId("co"), nombre: str(c.nombre, 80), email: str(c.email, 120), rol: c.rol === "asistente" ? "asistente" : "fotografo" };
  });
}

/** Lee del cuerpo los campos de álbum presentes (para alta: todos con defaults; para PATCH: sólo los que vienen). */
export function camposAlbum(c: Record<string, unknown>, base?: CamposAlbum): CamposAlbum {
  const t = (k: string, max: number, def: string) => (k in c ? str(c[k], max) : def);
  const r: CamposAlbum = {
    nombre: t("nombre", 120, base?.nombre ?? ""),
    evento: "evento" in c ? (EVENTOS.includes(c.evento as TipoEvento) ? (c.evento as TipoEvento) : "otro") : (base?.evento ?? "otro"),
    lugar: t("lugar", 120, base?.lugar ?? ""),
    fecha: t("fecha", 10, base?.fecha ?? ""),
    descripcion: t("descripcion", 2000, base?.descripcion ?? ""),
    precioFoto: "precioFoto" in c ? ent(c.precioFoto) : (base?.precioFoto ?? NaN),
    precioVideo: "precioVideo" in c ? ent(c.precioVideo) : (base?.precioVideo ?? 0),
    paquetes: "paquetes" in c ? paquetes(c.paquetes) : (base?.paquetes ?? []),
    escalones: "escalones" in c ? escalones(c.escalones) : (base?.escalones ?? []),
    cupones: "cupones" in c ? cupones(c.cupones) : (base?.cupones ?? []),
    colaboradores: "colaboradores" in c ? colaboradores(c.colaboradores) : (base?.colaboradores ?? []),
    publicado: "publicado" in c ? c.publicado === true : (base?.publicado ?? false),
  };
  validarAlbum(r);
  return r;
}

export function validarAlbum(d: CamposAlbum): void {
  if (!d.nombre) throw mal("El álbum necesita un nombre.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw mal("Poné la fecha del evento.");
  if (!(d.precioFoto > 0)) throw mal("El precio por foto tiene que ser mayor a cero.");
  if (!(d.precioVideo >= 0)) throw mal("El precio por video no puede ser negativo.");
  for (const p of d.paquetes) {
    if (!p.nombre || !(p.cantidad >= 0) || !(p.precio > 0)) throw mal("Revisá los paquetes: nombre, cantidad y precio.");
  }
  for (const e of d.escalones) {
    if (!(e.desde >= 2) || !(e.porcentaje > 0 && e.porcentaje <= 90)) throw mal("Los descuentos por cantidad van desde 2 unidades y entre 1 % y 90 %.");
  }
  const codigos = new Set<string>();
  for (const c of d.cupones) {
    if (!/^[A-Z0-9_-]{3,20}$/.test(c.codigo)) throw mal("Los cupones usan de 3 a 20 letras o números, sin espacios.");
    if (codigos.has(c.codigo)) throw mal(`El cupón ${c.codigo} está repetido.`);
    codigos.add(c.codigo);
    if (!(c.valor > 0) || (c.tipo === "porcentaje" && c.valor > 100)) throw mal(`Revisá el valor del cupón ${c.codigo}.`);
    if (!(c.tope >= 0) || !(c.usosMax >= 0) || !(c.usos >= 0)) throw mal(`Revisá el tope y los usos del cupón ${c.codigo}.`);
  }
}

export function marca(v: unknown): MarcaAgua {
  if (!esObj(v)) throw mal("Revisá la marca de agua.");
  const logo = typeof v.logo === "string" && v.logo ? v.logo : null;
  if (logo && (!/^data:image\/(png|jpeg|svg\+xml|webp);base64,/.test(logo) || logo.length > MAX_LOGO)) throw mal("El logo tiene que ser una imagen de hasta 200 KB.");
  const m: MarcaAgua = {
    texto: str(v.texto, 80),
    logo,
    color: /^#[0-9a-fA-F]{6}$/.test(String(v.color)) ? String(v.color) : "#ffffff", // design-lint-ignore: dato de la marca, no estilo
    opacidad: Math.min(0.9, num(v.opacidad)),
    escala: Math.min(2.5, Math.max(0.5, num(v.escala) || 1)),
    angulo: Math.min(60, Math.max(-60, num(v.angulo) || 0)),
    modo: v.modo === "centro" ? "centro" : "mosaico",
  };
  if (!m.texto && !m.logo) throw mal("La marca necesita un texto o un logo: sin eso la vista previa saldría limpia.");
  if (!(m.opacidad >= OPACIDAD_MIN)) throw mal(`La opacidad mínima es ${Math.round(OPACIDAD_MIN * 100)} %: más transparente no protege la foto.`);
  return m;
}

/** Datos de cobro SIN token (el token va sólo por PUT /yo/mp). null = sin cobro. */
export function cobro(v: unknown): DatosCobro | null {
  if (v === null) return null;
  if (!esObj(v)) throw mal("Revisá los datos de cobro.");
  return {
    metodo: v.metodo === "mercadopago" ? "mercadopago" : "transferencia",
    titular: str(v.titular, 120),
    alias: str(v.alias, 60),
    cuit: str(v.cuit, 13),
  };
}

export function dorsales(v: unknown): string[] {
  if (!Array.isArray(v) || v.length > 50) throw mal("Revisá los dorsales.");
  return [...new Set(v.map((d) => str(d, 12)).filter(Boolean))];
}

export function email(v: unknown): string {
  const e = str(v, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw mal("Revisá el email.");
  return e;
}
