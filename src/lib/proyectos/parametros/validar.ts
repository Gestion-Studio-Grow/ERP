// ============================================================================
// PARÁMETROS — validación, lectura del formulario y resolución «valor del negocio o del rubro». PURO (sin base).
// El servidor valida tipo, rango y sumas acá; la pantalla no protege nada (plan MIA-50, O45).
// ============================================================================

import { ETAPAS, type Etapa } from "../core";
import { CATALOGO, EMPRESA, defDe, type Clave, type ConId, type ConRango, type DefParametro, type EtapaParam, type TipoParametro, type Valores } from "./catalogo";

export type Validado<T = unknown> = { ok: true; valor: T } | { ok: false; error: string };
const mal = (error: string): { ok: false; error: string } => ({ ok: false, error });
const bien = <T>(valor: T): { ok: true; valor: T } => ({ ok: true, valor });

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const dosDecimales = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-9; // no-es-plata: un porcentaje con dos decimales
const esPct = (n: unknown, min = 0, max = 100): n is number => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max && dosDecimales(n);
const ID = /^[A-Z0-9_]{1,40}$/;

/** «7,5» o «7.5» → 7.5. Sin separador de miles: un porcentaje o unos días no lo necesitan. */
export function leerNumeroSimple(crudo: string | null | undefined): number | null {
  const t = String(crudo ?? "").trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** «Productor de campo» → «PRODUCTOR_DE_CAMPO». */
export function idDeNombre(nombre: string): string {
  const base = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 36);
  return base || "ITEM";
}

const idsDe = (lista: readonly ConId[]) => lista.map((x) => x.id);
/** Participantes de un reparto: la empresa y cada función del equipo. */
export const participantes = (funciones: readonly ConId[]): string[] => [EMPRESA, ...idsDe(funciones)];

function validarRango(v: unknown, nombre: string): Validado<ConRango> {
  if (!esObjeto(v)) return mal(`${nombre}: falta el valor.`);
  const { valor, min, max } = v;
  if (!esPct(valor) || !esPct(min) || !esPct(max)) return mal(`${nombre}: cada número va de 0 a 100, con hasta 2 decimales.`);
  if (min > max) return mal(`${nombre}: el mínimo no puede ser mayor que el máximo.`);
  if (valor < min || valor > max) return mal(`${nombre}: el valor tiene que quedar entre ${min} y ${max}.`);
  return bien({ valor, min, max });
}

function validarConId(v: unknown, min: number, max: number, nombre: string): Validado<ConId[]> {
  if (!Array.isArray(v)) return mal(`${nombre}: falta la lista.`);
  if (v.length < min || v.length > max) return mal(`${nombre}: tienen que ser entre ${min} y ${max}.`);
  const salida: ConId[] = [];
  for (const x of v) {
    if (!esObjeto(x) || typeof x.id !== "string" || !ID.test(x.id) || typeof x.nombre !== "string") return mal(`${nombre}: hay un renglón inválido.`);
    const n = x.nombre.trim();
    if (!n || n.length > 60) return mal(`${nombre}: cada nombre lleva entre 1 y 60 letras.`);
    if (salida.some((s) => s.id === x.id || s.nombre.toLowerCase() === n.toLowerCase())) return mal(`${nombre}: «${n}» está repetido.`);
    salida.push({ id: x.id, nombre: n });
  }
  return bien(salida);
}

function validarEtapas(v: unknown): Validado<EtapaParam[]> {
  if (!Array.isArray(v) || v.length < 1 || v.length > ETAPAS.length) return mal(`Etapas: tienen que ser entre 1 y ${ETAPAS.length}.`);
  const base = validarConId(v.map((e) => (esObjeto(e) ? { id: e.id, nombre: e.nombre } : e)), 1, ETAPAS.length, "Etapas");
  if (!base.ok) return base;
  const salida: EtapaParam[] = [];
  const recorrido: string[] = [];
  for (const [i, e] of (v as Record<string, unknown>[]).entries()) {
    const estados = e.estados;
    if (!Array.isArray(estados) || estados.length === 0) return mal(`La etapa «${base.valor[i].nombre}» no agrupa ningún estado.`);
    if (!estados.every((s) => (ETAPAS as readonly string[]).includes(s))) return mal(`La etapa «${base.valor[i].nombre}» tiene un estado que no existe.`);
    if (e.compuerta !== "AVISA" && e.compuerta !== "FRENA") return mal(`La etapa «${base.valor[i].nombre}»: la compuerta avisa o frena.`);
    recorrido.push(...(estados as string[]));
    salida.push({ ...base.valor[i], estados: estados as Etapa[], compuerta: e.compuerta });
  }
  // Cada estado interno en una sola etapa, y en su orden: una etapa agrupa estados seguidos (plan § 4.2, Dis. § 2.2).
  if (recorrido.join() !== ETAPAS.join()) return mal("Cada estado del proyecto va en una sola etapa, y las etapas siguen el orden de los estados.");
  return bien(salida);
}

/**
 * Valida un valor ya armado (de la base o del formulario) contra su definición. `vigentes` da los valores de los que
 * depende (las funciones del equipo y los conceptos del reparto).
 */
export function validarValor(def: DefParametro, v: unknown, vigentes: Pick<Valores, "equipo.funciones" | "reparto.conceptos">): Validado {
  const t: TipoParametro = def.def;
  const n = def.nombre;
  switch (t.tipo) {
    case "porcentaje":
      return esPct(v, t.min, t.max) ? bien(v) : mal(`${n}: va de ${t.min} a ${t.max}, con hasta 2 decimales.`);
    case "conRango":
      return validarRango(v, n);
    case "entero":
      return typeof v === "number" && Number.isInteger(v) && v >= t.min && v <= t.max ? bien(v) : mal(`${n}: un número entero de ${t.min} a ${t.max}.`);
    case "opcion":
      return t.opciones.some((o) => o.id === v) ? bien(v) : mal(`${n}: elegí una de las opciones.`);
    case "booleano":
      return typeof v === "boolean" ? bien(v) : mal(`${n}: sí o no.`);
    case "lista": {
      if (!Array.isArray(v) || !v.every((s) => typeof s === "string")) return mal(`${n}: falta la lista.`);
      const items = (v as string[]).map((s) => s.trim()).filter(Boolean);
      if (items.length !== v.length) return mal(`${n}: hay un renglón vacío.`);
      if (items.some((s) => s.length > 80)) return mal(`${n}: cada renglón lleva hasta 80 letras.`);
      if (new Set(items.map((s) => s.toLowerCase())).size !== items.length) return mal(`${n}: hay renglones repetidos.`);
      if (items.length < t.min || items.length > t.max) return mal(`${n}: tienen que ser entre ${t.min} y ${t.max}.`);
      return bien(items);
    }
    case "multiple": {
      if (!Array.isArray(v) || !v.every((s) => t.opciones.some((o) => o.id === s)) || new Set(v).size !== v.length) return mal(`${n}: elegí de la lista.`);
      if (v.length < t.min) return mal(`${n}: elegí al menos ${t.min}.`);
      return bien(t.opciones.map((o) => o.id).filter((id) => v.includes(id)));
    }
    case "conId":
      return validarConId(v, t.min, t.max, n);
    case "etapas":
      return validarEtapas(v);
    case "mapaConRango": {
      if (!esObjeto(v)) return mal(`${n}: falta el valor.`);
      const claves = idsDe(vigentes[t.clavesDe]);
      if (Object.keys(v).some((k) => !claves.includes(k))) return mal(`${n}: hay una función que el equipo no tiene.`);
      const salida: Record<string, ConRango> = {};
      for (const f of vigentes[t.clavesDe]) {
        const r = validarRango(v[f.id] ?? { valor: 0, min: 0, max: 100 }, `${n} · ${f.nombre}`);
        if (!r.ok) return r;
        salida[f.id] = r.valor;
      }
      return bien(salida);
    }
    case "matriz": {
      if (!esObjeto(v)) return mal(`${n}: falta el valor.`);
      const filas = vigentes[t.filasDe];
      const columnas = participantes(vigentes[t.columnasDe]);
      if (Object.keys(v).some((k) => !filas.some((f) => f.id === k))) return mal(`${n}: hay un concepto que el reparto no tiene.`);
      const salida: Record<string, Record<string, number>> = {};
      for (const f of filas) {
        const fila = v[f.id] ?? { [EMPRESA]: 100 };
        if (!esObjeto(fila) || Object.keys(fila).some((c) => !columnas.includes(c))) return mal(`${n} · ${f.nombre}: hay un participante que el equipo no tiene.`);
        const limpia: Record<string, number> = {};
        for (const c of columnas) {
          const x = fila[c] ?? 0;
          if (!esPct(x)) return mal(`${n} · ${f.nombre}: cada % va de 0 a 100, con hasta 2 decimales.`);
          if (x > 0) limpia[c] = x;
        }
        const suma = Object.values(limpia).reduce((s, x) => s + Math.round(x * 100), 0); // no-es-plata: la suma de porcentajes en centésimos de punto
        if (suma !== 10000) return mal(`${n} · ${f.nombre}: los porcentajes suman ${suma / 100} y tienen que sumar 100.`);
        salida[f.id] = limpia;
      }
      return bien(salida);
    }
    case "mapaTexto": {
      if (!esObjeto(v)) return mal(`${n}: falta el valor.`);
      const salida: Record<string, string> = {};
      for (const k of t.claves) {
        const s = typeof v[k.id] === "string" ? (v[k.id] as string).trim() : "";
        if (!s || s.length > 40) return mal(`${n} · ${k.label}: entre 1 y 40 letras.`);
        salida[k.id] = s;
      }
      return Object.keys(v).length === t.claves.length ? bien(salida) : mal(`${n}: hay una clave que no corresponde.`);
    }
    case "mapaOpcion": {
      if (!esObjeto(v)) return mal(`${n}: falta el valor.`);
      const salida: Record<string, string> = {};
      for (const k of t.claves) {
        if (!t.opciones.some((o) => o.id === v[k.id])) return mal(`${n} · ${k.label}: elegí una de las opciones.`);
        salida[k.id] = v[k.id] as string;
      }
      return Object.keys(v).length === t.claves.length ? bien(salida) : mal(`${n}: hay una clave que no corresponde.`);
    }
    case "tramos": {
      if (!Array.isArray(v) || v.length < t.min || v.length > t.max) return mal(`${n}: entre ${t.min} y ${t.max} tramos.`);
      if (!v.every((x, i) => Number.isInteger(x) && x > 0 && x <= 3650 && (i === 0 || x > v[i - 1]))) return mal(`${n}: días enteros, de menor a mayor y sin repetir.`);
      return bien([...v]);
    }
  }
}

// ── Lo que borra una dependencia: no se puede sacar una función o un concepto que todavía tiene un % ──

/** Al cambiar funciones o conceptos: lo que quedaría huérfano en la comisión o la matriz. PURA. */
export function huerfanosAlCambiar(clave: Clave, nuevo: ConId[], vigentes: Valores): string | null {
  if (clave === "equipo.funciones") {
    const quedan = new Set(idsDe(nuevo));
    const conComision = Object.entries(vigentes["precio.comision"]).filter(([id, r]) => !quedan.has(id) && (r.valor > 0 || r.min > 0)).map(([id]) => id);
    const enMatriz = Object.values(vigentes["reparto.matriz"]).flatMap((fila) => Object.entries(fila).filter(([id, x]) => id !== EMPRESA && !quedan.has(id) && x > 0).map(([id]) => id));
    const sueltas = [...new Set([...conComision, ...enMatriz])];
    if (sueltas.length) return `Primero poné en 0 la comisión y el reparto de: ${sueltas.map((id) => vigentes["equipo.funciones"].find((f) => f.id === id)?.nombre ?? id).join(", ")}.`;
  }
  if (clave === "reparto.conceptos") {
    const quedan = new Set(idsDe(nuevo));
    const sueltos = Object.entries(vigentes["reparto.matriz"]).filter(([id, fila]) => !quedan.has(id) && !(Object.keys(fila).length === 1 && fila[EMPRESA] === 100)).map(([id]) => id);
    if (sueltos.length) return `Primero dejá el 100 % para la empresa en: ${sueltos.map((id) => vigentes["reparto.conceptos"].find((c) => c.id === id)?.nombre ?? id).join(", ")}.`;
  }
  return null;
}

// ── El formulario de la pantalla → el valor crudo (que después valida `validarValor`) ──

export interface LectorForm { get(nombre: string): FormDataEntryValue | null; getAll(nombre: string): FormDataEntryValue[] }
const s = (f: LectorForm, k: string): string => String(f.get(k) ?? "").trim();
const num = (f: LectorForm, k: string): number | null => leerNumeroSimple(s(f, k));

function conIdDelForm(f: LectorForm): ConId[] {
  const n = Math.min(Number(s(f, "n")) || 0, 40);
  const salida: ConId[] = [];
  for (let i = 0; i < n; i++) {
    if (f.get(`quitar_${i}`)) continue;
    salida.push({ id: s(f, `id_${i}`), nombre: s(f, `nombre_${i}`) });
  }
  const nuevo = s(f, "nuevo");
  if (nuevo) {
    let id = idDeNombre(nuevo);
    for (let k = 2; salida.some((x) => x.id === id); k++) id = `${idDeNombre(nuevo)}_${k}`;
    salida.push({ id, nombre: nuevo });
  }
  return salida;
}

/** Diez casilleros de etapa: cada estado elige el suyo. Los casilleros sin estados no cuentan. */
function etapasDelForm(f: LectorForm): unknown {
  const casilleros = ETAPAS.map((_, k) => ({ id: s(f, `id_${k}`), nombre: s(f, `nombre_${k}`), compuerta: s(f, `compuerta_${k}`) || "AVISA", estados: [] as string[] }));
  for (const e of ETAPAS) {
    const k = Number(s(f, `estado_${e}`));
    if (!Number.isInteger(k) || k < 0 || k >= casilleros.length) return null;
    casilleros[k].estados.push(e);
  }
  const usados = casilleros.filter((c) => c.estados.length > 0);
  for (const c of usados) {
    if (!c.id) {
      let id = idDeNombre(c.nombre || "ETAPA");
      for (let k = 2; usados.some((o) => o !== c && o.id === id); k++) id = `${idDeNombre(c.nombre || "ETAPA")}_${k}`;
      c.id = id;
    }
  }
  return usados;
}

export function valorDelFormulario(def: DefParametro, f: LectorForm, vigentes: Valores): unknown {
  const t = def.def;
  switch (t.tipo) {
    case "porcentaje":
    case "entero":
      return num(f, "valor");
    case "conRango":
      return { valor: num(f, "valor"), min: num(f, "min"), max: num(f, "max") };
    case "opcion":
      return s(f, "valor");
    case "booleano":
      return s(f, "valor") === "1" ? true : s(f, "valor") === "0" ? false : null;
    case "lista":
      return s(f, "valor").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    case "multiple":
      return f.getAll("valor").map(String);
    case "conId":
      return conIdDelForm(f);
    case "etapas":
      return etapasDelForm(f);
    case "mapaConRango":
      return Object.fromEntries(vigentes[t.clavesDe].map((x) => [x.id, { valor: num(f, `valor_${x.id}`), min: num(f, `min_${x.id}`), max: num(f, `max_${x.id}`) }]));
    case "matriz": {
      const cols = participantes(vigentes[t.columnasDe]);
      return Object.fromEntries(vigentes[t.filasDe].map((fila) => [fila.id, Object.fromEntries(cols.map((c) => [c, num(f, `m_${fila.id}_${c}`) ?? 0]))]));
    }
    case "mapaTexto":
    case "mapaOpcion":
      return Object.fromEntries(t.claves.map((k) => [k.id, s(f, `valor_${k.id}`)]));
    case "tramos":
      return s(f, "valor").split(/[\s,;]+/).filter(Boolean).map((x) => leerNumeroSimple(x));
  }
}

// ── Resolver: por cada clave, el valor del negocio si hay fila válida; si no, el del rubro ──

export interface FilaParametro { clave: string; valor: unknown; provisional: boolean; actualizadoNombre: string; actualizadoEl: Date }
export interface Resuelto<K extends Clave = Clave> {
  valor: Valores[K];
  provisional: boolean;
  origen: "NEGOCIO" | "RUBRO";
  actualizadoNombre: string | null;
  actualizadoEl: Date | null;
}
export type Parametros = { [K in Clave]: Resuelto<K> };

const DEPENDIENTES = new Set(["mapaConRango", "matriz"]);

/** PURA. Una fila con una clave que el catálogo no conoce, o con un valor que ya no valida, no se lee: rige el rubro. */
export function resolverParametros(filas: readonly FilaParametro[]): Parametros {
  const salida = {} as Record<Clave, Resuelto>;
  const delRubro = (d: DefParametro): Resuelto => ({ valor: d.rubro, provisional: d.provisional, origen: "RUBRO", actualizadoNombre: null, actualizadoEl: null });
  const vigentesParciales = () => ({ "equipo.funciones": (salida["equipo.funciones"]?.valor ?? defDe("equipo.funciones").rubro) as ConId[], "reparto.conceptos": (salida["reparto.conceptos"]?.valor ?? defDe("reparto.conceptos").rubro) as ConId[] });
  // Primero lo que no depende de nada; después la comisión y la matriz, que leen funciones y conceptos.
  for (const pasada of [false, true]) {
    for (const d of CATALOGO) {
      if (DEPENDIENTES.has(d.def.tipo) !== pasada) continue;
      const fila = filas.find((x) => x.clave === d.clave);
      const v = fila ? validarValor(d, fila.valor, vigentesParciales()) : null;
      if (fila && v?.ok) salida[d.clave] = { valor: v.valor as never, provisional: fila.provisional, origen: "NEGOCIO", actualizadoNombre: fila.actualizadoNombre, actualizadoEl: fila.actualizadoEl };
      else {
        // El del rubro se ajusta a las funciones y conceptos del negocio (una función nueva arranca en 0).
        const r = pasada ? validarValor(d, d.rubro, vigentesParciales()) : null;
        salida[d.clave] = r?.ok ? { ...delRubro(d), valor: r.valor as never } : delRubro(d);
      }
    }
  }
  return salida as Parametros;
}

/** Los valores sueltos, para quien sólo necesita leer. */
export const valoresDe = (p: Parametros): Valores => Object.fromEntries(Object.entries(p).map(([k, r]) => [k, r.valor])) as unknown as Valores;

/** Texto corto de un valor, para el historial y la lista de provisionales. PURA. */
const CATALOGO_FUNCIONES = (): readonly ConId[] => defDe("equipo.funciones").rubro;
const CATALOGO_CONCEPTOS = (): readonly ConId[] => defDe("reparto.conceptos").rubro;

/** El valor en criollo: con los nombres de las funciones y los conceptos, nunca sus ids (lista estética E3). */
export function textoDelValor(def: DefParametro, v: unknown, vigentes?: Pick<Valores, "equipo.funciones" | "reparto.conceptos">): string {
  if (v === null || v === undefined) return "Valor del rubro";
  const t = def.def;
  const etiqueta = (ops: readonly { id: string; label: string }[], id: unknown) => ops.find((o) => o.id === id)?.label ?? String(id);
  const nombres = [...(vigentes?.["equipo.funciones"] ?? CATALOGO_FUNCIONES()), ...(vigentes?.["reparto.conceptos"] ?? CATALOGO_CONCEPTOS())];
  const nombre = (id: string) => (id === EMPRESA ? "Empresa" : (nombres.find((x) => x.id === id)?.nombre ?? id.charAt(0) + id.slice(1).toLowerCase().replace(/_/g, " ")));
  switch (t.tipo) {
    case "porcentaje": return `${String(v).replace(".", ",")} %`;
    case "conRango": { const r = v as ConRango; return `${String(r.valor).replace(".", ",")} % (de ${r.min} a ${r.max})`; }
    case "entero": return `${v} ${t.unidad}`;
    case "opcion": return etiqueta(t.opciones, v);
    case "booleano": return v ? t.si : t.no;
    case "lista": return (v as string[]).join(", ") || "Ninguno";
    case "multiple": return (v as string[]).map((id) => etiqueta(t.opciones, id)).join(", ");
    case "conId": return (v as ConId[]).map((x) => x.nombre).join(", ");
    case "etapas": return (v as EtapaParam[]).map((e) => `${e.nombre}${e.compuerta === "FRENA" ? " (frena)" : ""}`).join(" → ");
    case "mapaConRango": return Object.entries(v as Record<string, ConRango>).map(([k, r]) => `${nombre(k)}: ${String(r.valor).replace(".", ",")} %`).join(" · ");
    case "matriz": return Object.entries(v as Record<string, Record<string, number>>).map(([k, fila]) => `${nombre(k)}: ${Object.entries(fila).map(([c, x]) => `${nombre(c)} ${String(x).replace(".", ",")} %`).join(", ")}`).join(" · ");
    case "mapaTexto": return Object.values(v as Record<string, string>).join(", ");
    case "mapaOpcion": return Object.entries(v as Record<string, string>).map(([k, x]) => `${t.claves.find((c) => c.id === k)?.label ?? k}: ${etiqueta(t.opciones, x)}`).join(" · ");
    case "tramos": return (v as number[]).join(", ") + " días";
  }
}
