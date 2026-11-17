// CONSOLA DE LA CUADRILLA · los manuales de puesto que el sistema conoce, para cruzar la «Regla» de un negado
// (GSG-MIA-072, hallazgo 1 de MIA-070: un agente verificador negó citando «prospección §1» y el sistema lo aceptó).
//
// Fuente: Factory-GSG `00-ESTADO/capa-ia/mia/puestos/<puesto>.md` en el commit 61f8865 (17/11/2026). Cada manual
// numera sus pasos «## §1 … ## §n» y el registro de turno los cita «<puesto> §n». Acá va, por puesto, el último §
// que existe. Si un manual suma o saca pasos, se actualiza este número en el mismo cambio (si no, el agente no puede
// citar el paso nuevo, o puede citar uno que ya no está).
//
// Regla: la cita tiene la forma «<puesto> §n»; el puesto es el del AGENTE (no otro); el manual existe; el § existe.
// Un puesto sin manual cargado no puede negar con una regla: traspasa a GSG o escala (lo dice el motivo).
// PURO: sin base.

/** Último § de cada manual (Factory-GSG 61f8865). La clave es el puesto normalizado (`clavePuesto`). */
export const MANUALES: Readonly<Record<string, { nombre: string; ultimo: number }>> = {
  caja: { nombre: "caja", ultimo: 12 },
  cobranzas: { nombre: "cobranzas", ultimo: 11 },
  comercial: { nombre: "comercial", ultimo: 14 },
  "direccion-taller": { nombre: "dirección-taller", ultimo: 17 },
  pagos: { nombre: "pagos", ultimo: 14 },
  prospeccion: { nombre: "prospección", ultimo: 11 },
};

/** «Prospección», «prospeccion », «PROSPECCIÓN» → «prospeccion»; «Dirección Taller» → «direccion-taller». */
export function clavePuesto(puesto: string): string {
  return puesto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-");
}

/** «<puesto> §<n>»: grupo 1 el puesto, grupo 2 el número. */
const CITA = /^(\p{L}[\p{L} _-]*?)\s*§\s*(\d+)$/u;

export type ReglaCruzada = { ok: true; regla: string } | { ok: false; motivo: string };

/**
 * ¿La regla cita un § que existe en el manual del puesto de ESTE agente? Devuelve la cita normalizada
 * («prospección §6») o el motivo en criollo.
 */
export function cruzarRegla(regla: string, puestoDelAgente: string): ReglaCruzada {
  const manual = MANUALES[clavePuesto(puestoDelAgente)];
  if (!manual) {
    return {
      ok: false,
      motivo: `Tu puesto («${puestoDelAgente.trim()}») no tiene manual cargado en el sistema: no podés negar citando una regla. Traspasalo a GSG o pasáselo a una persona.`,
    };
  }
  const m = CITA.exec(regla.trim());
  if (!m) return { ok: false, motivo: `La regla tiene que citar tu manual: «${manual.nombre} §n» (por ejemplo «${manual.nombre} §3»).` };
  if (clavePuesto(m[1]) !== clavePuesto(puestoDelAgente)) {
    return { ok: false, motivo: `Citaste el manual de otro puesto («${m[1].trim()}»). Tu manual es «${manual.nombre}»: citá «${manual.nombre} §n».` };
  }
  const n = Number(m[2]);
  if (!Number.isInteger(n) || n < 1 || n > manual.ultimo) {
    return { ok: false, motivo: `El manual de ${manual.nombre} no tiene §${m[2]}: va de §1 a §${manual.ultimo}.` };
  }
  return { ok: true, regla: `${manual.nombre} §${n}` };
}
