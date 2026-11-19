"use server";

// ============================================================================
// PROYECTOS — ETAPAS II (MIA-50 T09): la fecha prevista por etapa (O05), las obligaciones a mano del calendario (O07) y la
// salida «cancelado» después de aprobado (O04). Cada acción vuelve a pedir su permiso y que el proyecto sea visible. Lo que
// necesita M7b avisa si la migración no está (Gate 2) en vez de reventar.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { auditAdmin } from "@/lib/audit-core";
import { etapaLabel, pesos } from "./core";
import { trabarCobranza } from "./cobranza.server";
import { avisar, exigirEditar, proyectoVisible, regenerarCuotasTx, registrarCambio, usuariosDeLaPlata, usuariosDelEquipo, type Actor } from "./gestion.server";
import type { ModuloGestion } from "./gestion-core";
import { valorDelNegocio } from "./parametros/leer.server";
import { faltaLaMigracion } from "./rendiciones-core";
import { esCancelado, pendientesDeCancelar, PREFIJO_CANCELADO, rechazoDeCancelar } from "./cancelacion-core";
import { fechaDelCampo, leerObligacion } from "./obligaciones-core";
import { hayM7b } from "./etapas-m7b.server";

export type ResultadoEtapas = { ok: true; listo?: string } | { ok: false; error: string };

const RAIZ = "/admin/proyectos";
const SIN_M7B = "Esta parte todavía no está habilitada en tu negocio (falta una actualización de la base). Avisale a Gestión Studio Grow.";
const txt = (v: FormDataEntryValue | null | undefined, max = 300): string => String(v ?? "").trim().slice(0, max);
const centavos = (n: number) => Math.round(n * 100);

async function entrar(modulo: ModuloGestion, proyectoId?: string | null): Promise<Actor | string> {
  let a: Actor;
  try {
    a = await exigirEditar(modulo);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("No tenés permiso")) return "No tenés permiso para hacer esto.";
    throw e;
  }
  if (proyectoId !== undefined && (!proyectoId || !(await proyectoVisible(a, proyectoId)))) return "Ese proyecto no existe.";
  return a;
}

// ── O05 · Fecha prevista por etapa ──────────────────────────────────────────

/** Guarda las fechas previstas de las etapas (campos `prevista-<etapaId>`, AAAA-MM-DD o vacío). Queda en el historial. */
export async function guardarFechasPrevistas(formData: FormData): Promise<ResultadoEtapas> {
  const id = txt(formData.get("id"), 40);
  const a = await entrar("pipeline", id);
  if (typeof a === "string") return { ok: false, error: a };
  const { tenantId } = a;
  if (!(await hayM7b())) return { ok: false, error: SIN_M7B };
  const etapas = await valorDelNegocio(tenantId, "etapas.lista");
  const pedidas: { etapaId: string; nombre: string; prevista: Date | null }[] = [];
  for (const e of etapas) {
    const v = txt(formData.get(`prevista-${e.id}`), 10);
    const prevista = v ? fechaDelCampo(v) : null;
    if (v && !prevista) return { ok: false, error: `La fecha de ${e.nombre} no es válida.` };
    pedidas.push({ etapaId: e.id, nombre: e.nombre, prevista });
  }
  const corta = (d: Date | null) => (d ? d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : null);
  await tenantTransaction(
    async (tx) => {
      const previas = await tx.proyectoEtapaFecha.findMany({ where: { tenantId, proyectoId: id }, select: { etapaId: true, prevista: true } });
      for (const p of pedidas) {
        const antes = previas.find((f) => f.etapaId === p.etapaId)?.prevista ?? null;
        if ((antes?.getTime() ?? null) === (p.prevista?.getTime() ?? null)) continue;
        await tx.proyectoEtapaFecha.upsert({
          where: { tenantId_proyectoId_etapaId: { tenantId, proyectoId: id, etapaId: p.etapaId } },
          create: { tenantId, proyectoId: id, etapaId: p.etapaId, prevista: p.prevista, previstaPor: a.nombre },
          update: { prevista: p.prevista, previstaPor: a.nombre },
        });
        await registrarCambio(tx, { tenantId, proyectoId: id, entidad: "Proyecto", entidadId: id, campo: `Fecha prevista: ${p.nombre}`, antes: corta(antes), despues: corta(p.prevista), autor: a.nombre });
      }
    },
    { tenantId },
  );
  revalidatePath(`${RAIZ}/${id}`);
  revalidatePath(`${RAIZ}/calendario`);
  return { ok: true, listo: "Fechas previstas guardadas." };
}

// ── O07 · Obligaciones a mano ───────────────────────────────────────────────

/**
 * Da de alta una obligación (vencimiento de un seguro, un pago de impuesto, un permiso). La clave `envio` del formulario
 * hace que el mismo envío dos veces grabe una sola.
 */
export async function crearObligacion(formData: FormData): Promise<ResultadoEtapas> {
  const proyectoId = txt(formData.get("proyectoId"), 40) || null;
  const a = await entrar("pipeline", proyectoId ?? undefined);
  if (typeof a === "string") return { ok: false, error: a };
  const { tenantId } = a;
  if (!(await hayM7b())) return { ok: false, error: SIN_M7B };
  const envio = txt(formData.get("claveEnvio"), 60);
  if (!envio) return { ok: false, error: "Volvé a abrir el formulario." };
  const [tipos, dias] = await Promise.all([valorDelNegocio(tenantId, "calendario.tiposObligacion"), valorDelNegocio(tenantId, "calendario.diasAviso")]);
  const datos = leerObligacion((n) => txt(formData.get(n), 200), tipos, dias);
  if (typeof datos === "string") return { ok: false, error: datos };
  const persona = await prisma.proyectoPersona.findFirst({ where: { id: datos.responsableId, tenantId, activa: true }, select: { nombre: true } });
  if (!persona) return { ok: false, error: "Esa persona no está en el equipo." };
  const creada = await tenantTransaction(
    async (tx) => {
      const r = await tx.proyectoObligacion.createManyAndReturn({
        data: [{ tenantId, ...datos, responsableNombre: persona.nombre, envio, creadaPor: a.nombre }],
        skipDuplicates: true,
        select: { id: true },
      });
      if (r.length === 0) return false;
      await registrarCambio(tx, { tenantId, proyectoId: datos.proyectoId, entidad: "Obligación", entidadId: r[0].id, campo: "Alta", despues: `${datos.tipo}: ${datos.titulo}`, autor: a.nombre });
      return true;
    },
    { tenantId },
  );
  revalidatePath(`${RAIZ}/calendario`);
  return { ok: true, listo: creada ? "Obligación agendada." : "Ya estaba agendada." };
}

/** Marca una obligación como hecha: deja de verse en el calendario y no avisa más. */
export async function marcarObligacionHecha(formData: FormData): Promise<ResultadoEtapas> {
  const a = await entrar("pipeline");
  if (typeof a === "string") return { ok: false, error: a };
  const { tenantId } = a;
  if (!(await hayM7b())) return { ok: false, error: SIN_M7B };
  const id = txt(formData.get("id"), 40);
  const o = await prisma.proyectoObligacion.findFirst({ where: { id, tenantId }, select: { titulo: true, proyectoId: true } });
  if (!o || (o.proyectoId && !(await proyectoVisible(a, o.proyectoId)))) return { ok: false, error: "Esa obligación ya no está." };
  await tenantTransaction(
    async (tx) => {
      const { count } = await tx.proyectoObligacion.updateMany({ where: { id, tenantId, hechaEl: null }, data: { hechaEl: new Date() } });
      if (count === 1) await registrarCambio(tx, { tenantId, proyectoId: o.proyectoId, entidad: "Obligación", entidadId: id, campo: "Hecha", despues: o.titulo, autor: a.nombre });
    },
    { tenantId },
  );
  revalidatePath(`${RAIZ}/calendario`);
  return { ok: true, listo: "Marcada como hecha." };
}

// ── O04 · Cancelar después de aprobado ──────────────────────────────────────

/** Rendiciones y anticipos sin cerrar: por fuera de la transacción (sin la migración de rendiciones, ninguno). */
async function abiertosDeCampo(tenantId: string, proyectoId: string): Promise<{ rendiciones: number; anticipos: number }> {
  try {
    const [rendiciones, anticipos] = await Promise.all([
      prisma.proyectoRendicion.count({ where: { tenantId, proyectoId, estado: { in: ["borrador", "enviada", "devuelta"] } } }),
      prisma.proyectoAnticipo.count({ where: { tenantId, proyectoId, estado: "ENTREGADO" } }),
    ]);
    return { rendiciones, anticipos };
  } catch (e) {
    if (faltaLaMigracion(e)) return { rendiciones: 0, anticipos: 0 };
    throw e;
  }
}

/**
 * Cancela un proyecto que ya tenía una versión aprobada. Sólo Dirección, con motivo. Sale del tablero como «perdido» (la
 * marca vive en `Proyecto`, aunque M7b no esté): las cuotas pendientes se anulan solas, los cobros y pagos hechos quedan
 * como están y no se genera ninguna liquidación. Lo que hay que resolver a mano queda listado en la ficha.
 */
export async function cancelarProyecto(formData: FormData): Promise<ResultadoEtapas> {
  const id = txt(formData.get("id"), 40);
  const a = await entrar("pipeline", id);
  if (typeof a === "string") return { ok: false, error: a };
  const { tenantId } = a;
  const motivo = txt(formData.get("motivo"), 300);
  if (a.rol !== "DIRECCION") return { ok: false, error: "Sólo Dirección puede cancelar un proyecto aprobado." };
  // Afuera de la transacción: lecturas por otra conexión y la tabla que puede faltar.
  const [m7b, criterio, destinatarios, deCampo] = await Promise.all([
    hayM7b(),
    valorDelNegocio(tenantId, "cancelacion.despuesDeAprobado"),
    usuariosDelEquipo(tenantId, id, a.user.id),
    abiertosDeCampo(tenantId, id),
  ]);
  const r = await tenantTransaction(
    async (tx): Promise<string | { antes: string; nombre: string; anuladas: number; pendientes: string[] }> => {
      await trabarCobranza(tx, tenantId, id);
      const p = await tx.proyecto.findFirst({ where: { id, tenantId }, select: { nombre: true, etapa: true, servicio: true, moneda: true, perdidoEl: true, motivoPerdida: true } });
      if (!p) return "Ese proyecto no existe.";
      const aprobada = (await tx.proyectoPresupuesto.count({ where: { tenantId, proyectoId: id, estado: "APROBADO" } })) > 0;
      const rechazo = rechazoDeCancelar({ rol: a.rol, motivo, aprobada, perdido: !!p.perdidoEl && !esCancelado(p.motivoPerdida), cancelado: esCancelado(p.motivoPerdida) && !!p.perdidoEl });
      if (rechazo) return rechazo;
      const [cobros, pagos, cuotasPagoMarcadas, pendientesAntes] = await Promise.all([
        tx.proyectoPago.findMany({ where: { tenantId, proyectoId: id, anuladoEl: null }, select: { monto: true } }),
        tx.proyectoGasto.findMany({ where: { tenantId, proyectoId: id, anuladoEl: null, pagadoEl: { not: null } }, select: { neto: true, iva: true } }),
        tx.proyectoCuota.count({ where: { tenantId, proyectoId: id, tipo: "PAGO", anuladoEl: null, pagadoEl: { not: null } } }),
        tx.proyectoCuota.count({ where: { tenantId, proyectoId: id, anuladoEl: null, pagadoEl: null } }),
      ]);
      const pendientes = pendientesDeCancelar(
        {
          cobros: { cantidad: cobros.length, total: cobros.reduce((s, c) => s + centavos(c.monto), 0) / 100 },
          pagos: { cantidad: pagos.length, total: pagos.reduce((s, g) => s + centavos(g.neto) + centavos(g.iva), 0) / 100 },
          cuotasPagoMarcadas,
          rendicionesAbiertas: deCampo.rendiciones,
          anticiposAbiertos: deCampo.anticipos,
        },
        (n) => pesos(n, p.moneda),
      );
      const antes = etapaLabel(p.etapa, p.servicio);
      await tx.proyecto.updateMany({ where: { id, tenantId }, data: { perdidoEl: new Date(), motivoPerdida: `${PREFIJO_CANCELADO}${motivo}` } });
      await regenerarCuotasTx(tx, tenantId, id);
      const pendientesDespues = await tx.proyectoCuota.count({ where: { tenantId, proyectoId: id, anuladoEl: null, pagadoEl: null } });
      const anuladas = Math.max(0, pendientesAntes - pendientesDespues);
      if (m7b) {
        const fila = { motivo, criterio, cuotasAnuladas: anuladas, pendientes, autorId: a.user.id, autorNombre: a.nombre, canceladoEl: new Date(), reabiertoEl: null, reabiertoPor: null };
        await tx.proyectoCancelacion.upsert({ where: { proyectoId_tenantId: { proyectoId: id, tenantId } }, create: { tenantId, proyectoId: id, ...fila }, update: fila });
      }
      await registrarCambio(tx, { tenantId, proyectoId: id, entidad: "Proyecto", entidadId: id, campo: "Etapa", antes, despues: `Cancelado: ${motivo}`, autor: a.nombre });
      const plata = await usuariosDeLaPlata(tx, tenantId, a.user.id);
      await avisar(tx, { tenantId, destinatarios: [...destinatarios, ...plata], tipo: "etapa", texto: `${p.nombre} se canceló: ${motivo}`, enlace: `${RAIZ}/${id}` });
      return { antes, nombre: p.nombre, anuladas, pendientes };
    },
    { tenantId, timeoutMs: 15_000 },
  );
  if (typeof r === "string") return { ok: false, error: r };
  await auditAdmin({ action: "proyecto.cancelado", entity: "Proyecto", entityId: id, changes: { de: r.antes, a: "Cancelado", cuotasAnuladas: r.anuladas } });
  revalidatePath(RAIZ);
  revalidatePath(`${RAIZ}/${id}`);
  return { ok: true, listo: r.anuladas > 0 ? `Proyecto cancelado. Se anularon ${r.anuladas} cuotas pendientes.` : "Proyecto cancelado." };
}
