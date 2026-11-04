// Contenido — calendario mes/semana y recordatorios (PURO). Porta club/novedades-core.ts:201-265 sin tocar al club.
// Las fechas son strings «YYYY-MM-DD» locales; la aritmética se hace en UTC sobre esos números (sin corrimientos).
import { CANALES, ESTADOS, type EstadoPublicacion, type Fecha, type Publicacion } from "./tipos";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** Lunes primero. */
export const DIAS_CORTOS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] as const;

const dosDigitos = (n: number) => String(n).padStart(2, "0");
const partes = (f: Fecha) => f.split("-").map(Number) as [number, number, number];
const deUtc = (d: Date): Fecha => `${d.getUTCFullYear()}-${dosDigitos(d.getUTCMonth() + 1)}-${dosDigitos(d.getUTCDate())}`;

/** La fecha LOCAL del equipo (no `toISOString`, que corre el día después de las 21 en Argentina). */
export function fechaLocal(d: Date = new Date()): Fecha {
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
}

export function esFechaValida(f: unknown): f is Fecha {
  if (typeof f !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const [a, m, d] = partes(f);
  return deUtc(new Date(Date.UTC(a, m - 1, d))) === f;
}

export function sumarDias(f: Fecha, n: number): Fecha {
  const [a, m, d] = partes(f);
  return deUtc(new Date(Date.UTC(a, m - 1, d + n)));
}

/** 0 = lunes … 6 = domingo. */
export function diaDeLaSemana(f: Fecha): number {
  const [a, m, d] = partes(f);
  return (new Date(Date.UTC(a, m - 1, d)).getUTCDay() + 6) % 7;
}

export const mesDe = (f: Fecha) => f.slice(0, 7);

export function mesVecino(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  return deUtc(new Date(Date.UTC(a, m - 1 + delta, 1))).slice(0, 7);
}

export const inicioDeSemana = (f: Fecha): Fecha => sumarDias(f, -diaDeLaSemana(f));
/** El lunes de la semana de al lado. */
export const semanaVecina = (f: Fecha, delta: number): Fecha => sumarDias(inicioDeSemana(f), delta * 7);

export interface PublicacionDelDia {
  id: string;
  hora: string;
  titulo: string;
  estado: EstadoPublicacion;
  /** «19:00 · Torneo · Instagram · ◷ Programado»: el nombre accesible. */
  descripcion: string;
}

export interface DiaDelCalendario {
  fecha: Fecha;
  numero: number;
  /** «lun», «mar»… */
  dia: string;
  hoy: boolean;
  publicaciones: PublicacionDelDia[];
}

const porHora = (a: { hora: string }, b: { hora: string }) => a.hora.localeCompare(b.hora);

function armarDia(pubs: readonly Publicacion[], fecha: Fecha, hoy: Fecha): DiaDelCalendario {
  return {
    fecha,
    numero: partes(fecha)[2],
    dia: DIAS_CORTOS[diaDeLaSemana(fecha)],
    hoy: fecha === hoy,
    publicaciones: pubs
      .filter((p) => p.fecha === fecha)
      .sort(porHora)
      .map((p) => ({
        id: p.id,
        hora: p.hora,
        titulo: p.titulo,
        estado: p.estado,
        descripcion: `${p.hora} · ${p.titulo} · ${CANALES[p.canal] ?? p.canal} · ${ESTADOS[p.estado]?.simbolo ?? ""} ${ESTADOS[p.estado]?.etiqueta ?? p.estado}`,
      })),
  };
}

export interface ResumenDeEstados {
  cuentas: Record<EstadoPublicacion, number>;
  /** «Borrador: 1 · Programado: 2 · Publicado: 0». */
  texto: string;
  total: number;
}

export function resumenDeEstados(pubs: readonly Publicacion[]): ResumenDeEstados {
  const cuentas: Record<EstadoPublicacion, number> = { borrador: 0, programado: 0, publicado: 0 };
  for (const p of pubs) if (p.estado in cuentas) cuentas[p.estado]++;
  const texto = (Object.keys(cuentas) as EstadoPublicacion[]).map((e) => `${ESTADOS[e].etiqueta}: ${cuentas[e]}`).join(" · ");
  return { cuentas, texto, total: pubs.length };
}

export interface VistaMes {
  mes: string;
  /** «noviembre de 2026». */
  titulo: string;
  /** Huecos antes del día 1 (la semana arranca el lunes). */
  vacias: number;
  dias: DiaDelCalendario[];
  /** Grilla de 7 columnas, lunes primero; `null` = celda fuera del mes. */
  semanas: (DiaDelCalendario | null)[][];
  resumen: ResumenDeEstados;
}

export function armarMes(pubs: readonly Publicacion[], mes: string, hoy: Fecha): VistaMes {
  const [anio, m] = mes.split("-").map(Number);
  const diasMes = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  const delMes = pubs.filter((p) => mesDe(p.fecha) === mes);
  const dias = [...Array(diasMes).keys()].map((i) => armarDia(delMes, `${mes}-${dosDigitos(i + 1)}`, hoy));
  const vacias = diaDeLaSemana(`${mes}-01`);
  const celdas: (DiaDelCalendario | null)[] = [...Array(vacias).fill(null), ...dias];
  while (celdas.length % 7) celdas.push(null);
  const semanas: (DiaDelCalendario | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return { mes, titulo: `${MESES[m - 1]} de ${anio}`, vacias, dias, semanas, resumen: resumenDeEstados(delMes) };
}

export interface VistaSemana {
  desde: Fecha;
  hasta: Fecha;
  /** «2 al 8 de noviembre de 2026» / «30 de noviembre al 6 de diciembre de 2026». */
  titulo: string;
  dias: DiaDelCalendario[];
  resumen: ResumenDeEstados;
}

export function armarSemana(pubs: readonly Publicacion[], fecha: Fecha, hoy: Fecha): VistaSemana {
  const desde = inicioDeSemana(fecha);
  const hasta = sumarDias(desde, 6);
  const enSemana = pubs.filter((p) => p.fecha >= desde && p.fecha <= hasta);
  const dias = [...Array(7).keys()].map((i) => armarDia(enSemana, sumarDias(desde, i), hoy));
  const [a1, m1, d1] = partes(desde);
  const [a2, m2, d2] = partes(hasta);
  const inicio = m1 === m2 ? `${d1}` : a1 === a2 ? `${d1} de ${MESES[m1 - 1]}` : `${d1} de ${MESES[m1 - 1]} de ${a1}`;
  return { desde, hasta, titulo: `${inicio} al ${d2} de ${MESES[m2 - 1]} de ${a2}`, dias, resumen: resumenDeEstados(enSemana) };
}

/** Lo que hay que publicar hoy: programadas de `hoy`, sin publicar, por hora. */
export function recordatoriosDelDia(pubs: readonly Publicacion[], hoy: Fecha): Publicacion[] {
  return pubs.filter((p) => p.fecha === hoy && p.estado === "programado").sort(porHora);
}
