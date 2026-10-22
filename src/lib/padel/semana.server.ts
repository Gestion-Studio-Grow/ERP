import "server-only";

// ============================================================================
// PADEL-CLASES · T4 — generarSemana: las clases de la semana que salen de los turnos fijos (M-117).
// ============================================================================
//
// NO es "use server" a propósito: recibe el `tenantId` como parámetro (el cron de la T5A la llama por
// negocio, sin sesión). Una Server Action con `tenantId` de parámetro dejaría que el navegador generara
// la semana de otro negocio. La puerta del profe es `generarSemana` (acciones-modelo.ts), que saca el
// negocio de la sesión y pide agenda:manage.
//
// Idempotente por construcción: cada clase lleva `serieId` + `serieFecha` (la ocurrencia) con índice
// único, y se crean con `createMany({ skipDuplicates })` (ON CONFLICT DO NOTHING) adentro de una
// transacción Serializable con reintento (`bookingTransaction`). Correrla dos veces —o dos veces a la
// vez— no duplica nada. Una ocurrencia cuyo horario ya tomó otra clase NO se crea: vuelve en `choques`
// (el profe decide). El aviso «Avisar a Juan su semana» es uno por alumno y semana (idExterno).

import { prisma } from "@/lib/prisma";
import { bookingTransaction } from "@/lib/rls";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { ESTADOS_QUE_OCUPAN, costoDeLaClase, esTipoClase, hayChoque, ocurrenciasAGenerar, precioDe, semanaDesdeLunes, sumarDias, textoSemana, type Ocurrencia } from "./core";
import { configPadel } from "./datos.server";
import { SELECT_SERIE, clavesGeneradas, filtroSeriesActivas, serieBase } from "./datos-modelo.server";
import { modeloT4 } from "./modelo.server";

export interface ResultadoSemana {
  lunes: string;
  creadas: number;
  /** Ocurrencias que no se crearon porque ese horario ya tenía otra clase. */
  choques: { serieId: string; alumnoId: string; empiezaEn: string }[];
  /** Un ítem por alumno con clases nuevas esta semana: «Avisar a Juan su semana: mar 19 y jue 19». */
  avisos: { alumnoId: string; nombre: string; detalle: string; clases: number }[];
}

/**
 * Genera las clases de la semana (de lunes a domingo) que contiene `desde` ("YYYY-MM-DD"; por defecto,
 * la que viene). Sólo lo que todavía no pasó. Sin la migración T4 → `null` (no hay series).
 */
export async function generarSemanaDelNegocio(tenantId: string, desde?: string, ahora = new Date()): Promise<ResultadoSemana | null> {
  if (!(await modeloT4())) return null;
  const lunes = semanaDesdeLunes(desde ?? sumarDias(dateStrInBusinessTz(ahora), 1));
  const domingo = sumarDias(lunes, 6);
  const config = await configPadel(tenantId);

  const r = await bookingTransaction(async (tx) => {
    // Todo con `tx` (nunca el `prisma` de afuera adentro de la transacción: con RLS, otra conexión
    // no tiene el negocio puesto y no vería nada).
    const series = await tx.padelSerie.findMany({ where: filtroSeriesActivas(tenantId, lunes, domingo), select: SELECT_SERIE });
    if (!series.length) return { creadas: [] as (Ocurrencia & { alumnoId: string })[], choques: [] as ResultadoSemana["choques"] };
    const yaHechas = await tx.padelClase.findMany({
      where: { tenantId, serieId: { in: series.map((s) => s.id) }, serieFecha: { gte: new Date(`${lunes}T00:00:00.000Z`), lte: new Date(`${domingo}T00:00:00.000Z`) } },
      select: { serieId: true, serieFecha: true },
    });
    const generadas = clavesGeneradas(yaHechas);
    const porId = new Map(series.map((s) => [s.id, s]));
    const pendientes = ocurrenciasAGenerar(series.map(serieBase), lunes, domingo, generadas).filter((o) => o.empiezaEn.getTime() > ahora.getTime());
    if (!pendientes.length) return { creadas: [], choques: [] };
    // Lo que ya ocupa la semana (clases vivas), para no pisar a nadie.
    const vivas = await tx.padelClase.findMany({
      where: { tenantId, estado: { in: [...ESTADOS_QUE_OCUPAN] }, empiezaEn: { lt: pendientes[pendientes.length - 1].terminaEn }, terminaEn: { gt: pendientes[0].empiezaEn } },
      select: { empiezaEn: true, terminaEn: true },
    });
    const ocupadas = vivas.map((v) => ({ startsAt: v.empiezaEn, endsAt: v.terminaEn }));
    const clubIds = [...new Set(series.map((s) => s.clubId).filter((x): x is string => Boolean(x)))];
    const clubes = clubIds.length
      ? new Map((await tx.padelClub.findMany({ where: { tenantId, id: { in: clubIds } }, select: { id: true, costoCancha: true, modoCobroClub: true } })).map((c) => [c.id, { ...c, costoCancha: c.costoCancha == null ? null : Number(c.costoCancha) }]))
      : new Map<string, { costoCancha: number | null; modoCobroClub: string | null }>();
    const alumnos = await tx.padelAlumno.findMany({ where: { tenantId, id: { in: [...new Set(series.map((s) => s.alumnoId))] } }, select: { id: true, clientId: true } });
    const clienteDe = new Map(alumnos.map((a) => [a.id, a.clientId]));

    const creadas: (Ocurrencia & { alumnoId: string })[] = [];
    const choques: ResultadoSemana["choques"] = [];
    const filas = [];
    for (const o of pendientes) {
      const s = porId.get(o.serieId)!;
      const clientId = clienteDe.get(s.alumnoId);
      if (!clientId) continue;
      if (hayChoque(o.empiezaEn, o.terminaEn, ocupadas)) {
        choques.push({ serieId: s.id, alumnoId: s.alumnoId, empiezaEn: o.empiezaEn.toISOString() });
        continue;
      }
      ocupadas.push({ startsAt: o.empiezaEn, endsAt: o.terminaEn });
      const tipo = esTipoClase(s.tipo) ? s.tipo : "INDIVIDUAL";
      const club = s.clubId ? clubes.get(s.clubId) : undefined;
      filas.push({
        tenantId, alumnoId: s.alumnoId, clientId, empiezaEn: o.empiezaEn, terminaEn: o.terminaEn, tipo, personas: s.personas,
        // Turno fijo: lo arregló el profe con el alumno, nace confirmada (M-117).
        estado: "CONFIRMADA", confirmadaEl: ahora, origen: "PROFE", precio: precioDe(config, tipo, s.personas),
        serieId: s.id, serieFecha: new Date(`${o.fecha}T00:00:00.000Z`),
        clubId: s.clubId ?? null, costoCancha: costoDeLaClase(club, s.duracionMin),
      });
      creadas.push({ ...o, alumnoId: s.alumnoId });
    }
    if (filas.length) await tx.padelClase.createMany({ data: filas, skipDuplicates: true });
    return { creadas, choques };
  }, { tenantId });

  // «Avisar a Juan su semana»: un aviso por alumno y semana en la bandeja del profe (idempotente).
  const porAlumno = new Map<string, { empiezaEn: Date }[]>();
  for (const c of r.creadas) porAlumno.set(c.alumnoId, [...(porAlumno.get(c.alumnoId) ?? []), { empiezaEn: c.empiezaEn }]);
  const nombres = porAlumno.size
    ? new Map((await prisma.padelAlumno.findMany({ where: { tenantId, id: { in: [...porAlumno.keys()] } }, select: { id: true, client: { select: { name: true } } } })).map((a) => [a.id, a.client.name]))
    : new Map<string, string>();
  const avisos: ResultadoSemana["avisos"] = [];
  for (const [alumnoId, clases] of porAlumno) {
    const nombre = nombres.get(alumnoId) ?? "";
    const detalle = textoSemana(clases);
    avisos.push({ alumnoId, nombre, detalle, clases: clases.length });
    await prisma.padelAviso.createMany({
      data: [{ tenantId, destino: "PROFE", tipo: "semana", alumnoId, texto: `Avisar a ${nombre.split(" ")[0]} su semana: ${detalle}.`, idExterno: `semana:${alumnoId}:${lunes}` }],
      skipDuplicates: true,
    });
  }
  return { lunes, creadas: r.creadas.length, choques: r.choques, avisos };
}
