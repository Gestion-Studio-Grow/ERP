"use server";

// ============================================================================
// PROYECTOS — las acciones del pipeline y de la ficha del evento. Cada una vuelve a pedir el permiso de su módulo y que el
// proyecto sea visible para esta persona. Los cambios de costos, precios, pagos y etapas quedan en el historial.
// ============================================================================

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin } from "@/lib/audit-core";
import { transferenciaEnElLibroTx } from "@/lib/caja/transferencia-en-el-libro";
import type { Prisma } from "@/generated/prisma/client";
import { esEtapa, etapaAlAprobar, etapaLabel, MEDIOS, metodoDeCaja, redondear, sePuedeEditar, sumarDias, type MedioPago } from "./core";
import { configProyectos } from "./datos.server";
import { aPesos, CHECKLIST_BASE, ESTADOS_ITEM, MONEDAS, RUBROS, TIPOS_EVENTO } from "./gestion-core";
import { avisar, columnasOcultas, exigirEditar, proyectoVisible, puede, regenerarCuotas, registrarCambio, tiposDeCambio, type Actor } from "./gestion.server";
import { clavesARenombrar, fechaAntesDe, fotoDeVersion, itemDeClave, linkSeguro, monedasSinCambio, numeroDe, PERDIDO, precioAlCopiar, precioAlEnviar, servicioDeTipo } from "./ficha-core";
import { marcaDeGastoProyecto } from "./marcas";
import type { ModuloGestion } from "./gestion-core";

export type ResultadoFicha<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const RAIZ = "/admin/proyectos";
const MAX_ARCHIVOS = 30;
const MAX_IMAGEN = 1_400_000;
const TIPOS_ARCHIVO = ["OTRO", "PRESUPUESTO", "PRESENTACION", "RENDER", "PLANO", "CONTRATO", "DISENO", "REFERENCIA"];

const txt = (v: FormDataEntryValue | null): string => String(v ?? "").trim();
const fecha = (v: FormDataEntryValue | null): Date | null => {
  const s = txt(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00-03:00`) : null;
};
const token = () => randomBytes(18).toString("base64url");
const mal = (error: string) => ({ ok: false as const, error });

function refrescar(id?: string | null) {
  revalidatePath(RAIZ);
  if (id) revalidatePath(`${RAIZ}/${id}`);
}

/** El permiso de cualquiera de estos módulos, y que el proyecto sea visible. Devuelve el motivo en vez de reventar la pantalla. */
async function entrar(modulos: ModuloGestion | readonly ModuloGestion[], proyectoId?: string | null): Promise<Actor | string> {
  let a: Actor | null = null;
  for (const m of typeof modulos === "string" ? [modulos] : modulos) {
    try {
      a = await exigirEditar(m);
      break;
    } catch (e) {
      if (!(e instanceof Error && e.message.startsWith("No tenés permiso"))) throw e;
    }
  }
  if (!a) return "No tenés permiso para hacer esto.";
  if (proyectoId !== undefined && (!proyectoId || !(await proyectoVisible(a, proyectoId)))) return "Ese proyecto no existe.";
  return a;
}

/** Dos guardados casi juntos (dos pestañas) pueden chocar creando la misma cuota: el segundo intento ya la encuentra. */
async function regenerar(tenantId: string, proyectoId: string) {
  try {
    await regenerarCuotas(tenantId, proyectoId);
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
    await regenerarCuotas(tenantId, proyectoId);
  }
}

async function usuariosDelEquipo(tenantId: string, proyectoId: string, salvo: string): Promise<string[]> {
  const filas = await prisma.proyectoEquipo.findMany({ where: { tenantId, proyectoId }, select: { persona: { select: { userId: true } } } });
  return filas.map((f) => f.persona.userId).filter((u): u is string => !!u && u !== salvo);
}

// ── Pipeline ────────────────────────────────────────────────────────────────

export async function crearLead(formData: FormData): Promise<ResultadoFicha<{ id: string }>> {
  const a = await entrar("pipeline");
  if (typeof a === "string") return mal(a);
  const { tenantId } = a;
  const nombre = txt(formData.get("nombre")).slice(0, 120);
  const clienteId = txt(formData.get("clienteId"));
  const clienteNuevo = txt(formData.get("clienteNuevo")).slice(0, 120);
  const telefono = txt(formData.get("telefono")).replace(/[^\d+]/g, "");
  const tipoEvento = txt(formData.get("tipoEvento"));
  const moneda = txt(formData.get("moneda")) || "ARS";
  if (!nombre) return mal("Falta el nombre del evento.");
  if (!clienteId && !clienteNuevo) return mal("Elegí un cliente o escribí uno nuevo.");
  if (!(TIPOS_EVENTO as readonly string[]).includes(tipoEvento)) return mal("Elegí el tipo de evento.");
  if (!(MONEDAS as readonly string[]).includes(moneda)) return mal("La moneda no es válida.");
  const fechaEvento = fecha(formData.get("fechaEvento"));
  const fechaFin = fecha(formData.get("fechaFin"));
  if (fechaEvento && fechaFin && fechaFin < fechaEvento) return mal("La fecha de fin no puede ser anterior a la de inicio.");
  const textoInvitados = txt(formData.get("invitados"));
  const invitados = textoInvitados ? numeroDe(textoInvitados) : null;
  if (textoInvitados && invitados === null) return mal("La cantidad de invitados no se entiende.");
  const textoEstimado = txt(formData.get("presupuestoEstimado"));
  const estimado = textoEstimado ? numeroDe(textoEstimado) : null;
  if (textoEstimado && estimado === null) return mal("El presupuesto estimado no se entiende.");
  const config = await configProyectos(tenantId);

  for (let intento = 0; intento < 3; intento++) {
    try {
      const creado = await tenantTransaction(async (tx) => {
        const clientId = clienteId
          ? (await tx.client.findFirst({ where: { id: clienteId, tenantId }, select: { id: true } }))?.id
          : (await tx.client.create({ data: { tenantId, name: clienteNuevo, phone: telefono || `sin-tel-${randomBytes(4).toString("hex")}` } })).id;
        if (!clientId) throw new Error("CLIENTE");
        const ultimo = await tx.proyecto.findFirst({ where: { tenantId }, orderBy: { numero: "desc" }, select: { numero: true } });
        const p = await tx.proyecto.create({
          data: {
            tenantId,
            numero: (ultimo?.numero ?? 0) + 1,
            clientId,
            nombre,
            servicio: servicioDeTipo(tipoEvento),
            tipoEvento,
            ciudad: txt(formData.get("ciudad")).slice(0, 80) || null,
            lugar: txt(formData.get("lugar")).slice(0, 120) || null,
            fechaEvento,
            fechaFin,
            invitados: invitados === null ? null : Math.round(invitados),
            moneda,
            presupuestoEstimado: estimado,
            responsable: a.nombre,
            brief: txt(formData.get("brief")),
          },
          select: { id: true, numero: true },
        });
        await tx.proyectoChecklist.createMany({ data: CHECKLIST_BASE.map((c) => ({ tenantId, proyectoId: p.id, texto: c.texto, categoria: c.categoria, fecha: fechaAntesDe(fechaEvento, c.dias) })) });
        await tx.proyectoPresupuesto.create({ data: { tenantId, proyectoId: p.id, version: 1, token: token(), ivaPct: config.ivaPct, condiciones: config.condiciones, creadoPor: a.nombre, nota: "Versión inicial" } });
        // Quien lo crea queda en el equipo: Producción sólo ve los proyectos donde está.
        if (a.personaId) await tx.proyectoEquipo.create({ data: { tenantId, proyectoId: p.id, personaId: a.personaId, funcion: "Responsable" } });
        return p;
      });
      await auditAdmin({ action: "proyecto.crear", entity: "Proyecto", entityId: creado.id, changes: { numero: creado.numero, tipoEvento } });
      refrescar();
      return { ok: true, id: creado.id };
    } catch (e) {
      if (e instanceof Error && e.message === "CLIENTE") return mal("Ese cliente no existe.");
      if ((e as { code?: string }).code === "P2002" && intento < 2) continue;
      throw e;
    }
  }
  return mal("No se pudo crear el proyecto. Probá de nuevo.");
}

/** Mover una tarjeta: a una etapa, o a Perdido con su motivo. Salir de Perdido reabre el proyecto. Las cuotas siguen a la etapa. */
export async function moverProyecto(d: { id: string; destino: string; motivo?: string }): Promise<ResultadoFicha> {
  const id = String(d.id ?? "");
  const a = await entrar("pipeline", id);
  if (typeof a === "string") return mal(a);
  const { tenantId } = a;
  const p = await prisma.proyecto.findFirst({ where: { id, tenantId }, select: { etapa: true, perdidoEl: true, nombre: true, servicio: true } });
  if (!p) return mal("Ese proyecto no existe.");
  const motivo = String(d.motivo ?? "").trim().slice(0, 300);
  const antes = p.perdidoEl ? "Perdido" : etapaLabel(p.etapa, p.servicio);
  let despues: string;
  let data: Prisma.ProyectoUpdateManyMutationInput;
  if (d.destino === PERDIDO) {
    if (!motivo) return mal("Escribí por qué se perdió.");
    if (p.perdidoEl) return { ok: true };
    despues = "Perdido";
    data = { perdidoEl: new Date(), motivoPerdida: motivo };
  } else {
    if (!esEtapa(d.destino)) return mal("Esa etapa no existe.");
    if (p.etapa === d.destino && !p.perdidoEl) return { ok: true };
    despues = etapaLabel(d.destino, p.servicio);
    data = { etapa: d.destino, perdidoEl: null, motivoPerdida: null };
  }
  await tenantTransaction(async (tx) => {
    await tx.proyecto.updateMany({ where: { id, tenantId }, data });
    await registrarCambio(tx, { tenantId, proyectoId: id, entidad: "Proyecto", entidadId: id, campo: "Etapa", antes, despues: motivo && d.destino === PERDIDO ? `Perdido: ${motivo}` : despues, autor: a.nombre });
    await avisar(tx, { tenantId, destinatarios: await usuariosDelEquipo(tenantId, id, a.user.id), tipo: "etapa", texto: `${p.nombre} pasó a ${despues}`, enlace: `${RAIZ}/${id}` });
  });
  await regenerar(tenantId, id);
  await auditAdmin({ action: "proyecto.etapa", entity: "Proyecto", entityId: id, changes: { de: antes, a: despues } });
  refrescar(id);
  return { ok: true };
}

// ── Datos del proyecto ──────────────────────────────────────────────────────

export async function guardarDatos(formData: FormData): Promise<ResultadoFicha> {
  const id = txt(formData.get("id"));
  const a = await entrar("pipeline", id);
  if (typeof a === "string") return mal(a);
  const { tenantId } = a;
  const nombre = txt(formData.get("nombre")).slice(0, 120);
  if (!nombre) return mal("Falta el nombre del evento.");
  const tipoEvento = txt(formData.get("tipoEvento"));
  const moneda = txt(formData.get("moneda")) || "ARS";
  if (tipoEvento && !(TIPOS_EVENTO as readonly string[]).includes(tipoEvento)) return mal("Elegí el tipo de evento.");
  if (!(MONEDAS as readonly string[]).includes(moneda)) return mal("La moneda no es válida.");
  const fechaEvento = fecha(formData.get("fechaEvento"));
  const fechaFin = fecha(formData.get("fechaFin"));
  if (fechaEvento && fechaFin && fechaFin < fechaEvento) return mal("La fecha de fin no puede ser anterior a la de inicio.");
  const textoAnticipo = txt(formData.get("anticipoClientePct"));
  const anticipo = textoAnticipo ? numeroDe(textoAnticipo) : 50;
  if (anticipo === null || anticipo > 100) return mal("El anticipo tiene que ser un porcentaje entre 0 y 100.");
  const textoInvitados = txt(formData.get("invitados"));
  const invitados = textoInvitados ? numeroDe(textoInvitados) : null;
  if (textoInvitados && invitados === null) return mal("La cantidad de invitados no se entiende.");
  const textoEstimado = txt(formData.get("presupuestoEstimado"));
  const estimado = textoEstimado ? numeroDe(textoEstimado) : null;
  if (textoEstimado && estimado === null) return mal("El presupuesto estimado no se entiende.");
  const previo = await prisma.proyecto.findFirst({ where: { id, tenantId }, select: { anticipoClientePct: true, fechaEvento: true, moneda: true } });
  if (!previo) return mal("Ese proyecto no existe.");
  await tenantTransaction(async (tx) => {
    await tx.proyecto.updateMany({
      where: { id, tenantId },
      data: {
        nombre,
        tipoEvento: tipoEvento || null,
        evento: txt(formData.get("evento")).slice(0, 120) || null,
        ciudad: txt(formData.get("ciudad")).slice(0, 80) || null,
        lugar: txt(formData.get("lugar")).slice(0, 120) || null,
        fechaArmado: fecha(formData.get("fechaArmado")),
        fechaEvento,
        fechaFin,
        fechaDesarme: fecha(formData.get("fechaDesarme")),
        invitados: invitados === null ? null : Math.round(invitados),
        moneda,
        presupuestoEstimado: estimado,
        anticipoClientePct: anticipo,
        responsable: txt(formData.get("responsable")).slice(0, 80) || null,
        contactoNombre: txt(formData.get("contactoNombre")).slice(0, 120) || null,
        contactoEmail: txt(formData.get("contactoEmail")).slice(0, 160) || null,
        brief: txt(formData.get("brief")),
      },
    });
    await registrarCambio(tx, { tenantId, proyectoId: id, entidad: "Proyecto", entidadId: id, campo: "Anticipo del cliente %", antes: previo.anticipoClientePct, despues: anticipo, autor: a.nombre });
    await registrarCambio(tx, { tenantId, proyectoId: id, entidad: "Proyecto", entidadId: id, campo: "Moneda de venta", antes: previo.moneda, despues: moneda, autor: a.nombre });
    // El checklist cuenta para atrás desde el evento: si se mueve la fecha, lo pendiente de la plantilla se mueve con ella.
    if ((previo.fechaEvento?.getTime() ?? null) !== (fechaEvento?.getTime() ?? null)) {
      await registrarCambio(tx, { tenantId, proyectoId: id, entidad: "Proyecto", entidadId: id, campo: "Fecha del evento", antes: previo.fechaEvento?.toISOString().slice(0, 10), despues: fechaEvento?.toISOString().slice(0, 10), autor: a.nombre });
      for (const c of CHECKLIST_BASE) {
        await tx.proyectoChecklist.updateMany({ where: { tenantId, proyectoId: id, texto: c.texto, hechoEl: null }, data: { fecha: fechaAntesDe(fechaEvento, c.dias) } });
      }
    }
  });
  await regenerar(tenantId, id);
  refrescar(id);
  return { ok: true };
}

export async function guardarCarpeta(formData: FormData): Promise<ResultadoFicha> {
  const id = txt(formData.get("id"));
  const a = await entrar("pipeline", id);
  if (typeof a === "string") return mal(a);
  const url = txt(formData.get("carpetaUrl"));
  if (url && !linkSeguro(url)) return mal("Pegá un link que empiece con https://.");
  await prisma.proyecto.updateMany({ where: { id, tenantId: a.tenantId }, data: { carpetaUrl: url || null } });
  refrescar(id);
  return { ok: true };
}

export async function generarPortal(formData: FormData): Promise<ResultadoFicha> {
  const id = txt(formData.get("id"));
  const a = await entrar("pipeline", id);
  if (typeof a === "string") return mal(a);
  await prisma.proyecto.updateMany({ where: { id, tenantId: a.tenantId, tokenPortal: null }, data: { tokenPortal: token() } });
  await auditAdmin({ action: "proyecto.portal.generar", entity: "Proyecto", entityId: id, changes: {} });
  refrescar(id);
  return { ok: true };
}

/** Sacarle el acceso a quien tenía el link. Al generarlo otra vez, es otro. */
export async function revocarPortal(formData: FormData): Promise<ResultadoFicha> {
  const id = txt(formData.get("id"));
  const a = await entrar("pipeline", id);
  if (typeof a === "string") return mal(a);
  await prisma.proyecto.updateMany({ where: { id, tenantId: a.tenantId }, data: { tokenPortal: null } });
  await auditAdmin({ action: "proyecto.portal.revocar", entity: "Proyecto", entityId: id, changes: {} });
  refrescar(id);
  return { ok: true };
}

// ── Equipo ──────────────────────────────────────────────────────────────────

export async function asignarEquipo(formData: FormData): Promise<ResultadoFicha> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar("pipeline", proyectoId);
  if (typeof a === "string") return mal(a);
  const { tenantId } = a;
  const personaId = txt(formData.get("personaId"));
  const persona = await prisma.proyectoPersona.findFirst({ where: { id: personaId, tenantId, activa: true }, select: { id: true, nombre: true } });
  if (!persona) return mal("Elegí una persona del equipo.");
  const funcion = txt(formData.get("funcion")).slice(0, 80);
  const textoPlus = txt(formData.get("plus"));
  // El plus es plata: sólo lo toca quien edita costos.
  const editaPlus = puede(a, "costos", "editar");
  const plus = editaPlus && textoPlus ? numeroDe(textoPlus) : 0;
  if (plus === null) return mal("El plus no se entiende: escribilo como un número.");
  const previo = await prisma.proyectoEquipo.findUnique({ where: { proyectoId_personaId: { proyectoId, personaId } }, select: { plus: true } });
  await tenantTransaction(async (tx) => {
    await tx.proyectoEquipo.upsert({
      where: { proyectoId_personaId: { proyectoId, personaId } },
      create: { tenantId, proyectoId, personaId, funcion, plus },
      update: editaPlus ? { funcion, plus } : { funcion },
    });
    if (editaPlus) await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoEquipo", entidadId: personaId, campo: `Plus · ${persona.nombre}`, antes: previo?.plus ?? null, despues: plus, autor: a.nombre });
  });
  refrescar(proyectoId);
  return { ok: true };
}

export async function quitarEquipo(formData: FormData): Promise<ResultadoFicha> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar("pipeline", proyectoId);
  if (typeof a === "string") return mal(a);
  await prisma.proyectoEquipo.deleteMany({ where: { id: txt(formData.get("id")), proyectoId, tenantId: a.tenantId } });
  refrescar(proyectoId);
  return { ok: true };
}

// ── Ficha del evento ────────────────────────────────────────────────────────

const ETIQUETA_CAMPO: Record<string, string> = {
  descripcion: "Descripción",
  rubro: "Rubro",
  supplierId: "Proveedor",
  cantidad: "Cantidad",
  costo: "Costo unitario",
  moneda: "Moneda",
  recargoPct: "Recargo %",
  precio: "Precio de venta",
  fechaLimite: "Fecha límite",
  estadoItem: "Estado",
  visibleCliente: "Visible al cliente",
};

// Tocan el precio final: lo que Dirección aprobó ya no es lo que se va a enviar.
const CAMPOS_DE_PRECIO = new Set(["cantidad", "costo", "moneda", "recargoPct", "precio"]);
const CAMPOS_DE_COSTOS: Record<string, string | null> = { costo: "costoUnit", moneda: "costoUnit", recargoPct: "recargo", precio: null };
const SIN_EFECTO_EN_CUOTAS = new Set(["estadoItem", "visibleCliente"]);

/** Guarda un campo al salir de él. Un número mal tipeado se rechaza: nunca queda en cero callado. */
export async function guardarCampoItem(d: { id: string; campo: string; valor: string }): Promise<ResultadoFicha> {
  const tenantId = await getCurrentTenantId();
  const it = await prisma.proyectoItem.findFirst({
    where: { id: String(d.id ?? ""), tenantId },
    select: { id: true, descripcion: true, rubro: true, supplierId: true, proveedor: true, cantidad: true, costo: true, moneda: true, recargoPct: true, precio: true, fechaLimite: true, estadoItem: true, visibleCliente: true, presupuesto: { select: { id: true, estado: true, proyectoId: true, aprobadoInternoEl: true } } },
  });
  if (!it) return mal("Ese ítem ya no existe. Recargá la página.");
  const { proyectoId } = it.presupuesto;
  const a = await entrar("ficha", proyectoId);
  if (typeof a === "string") return mal(a);
  if (!sePuedeEditar(it.presupuesto.estado)) return mal("Esta versión ya se envió: abrí una nueva para cambiarla.");
  const campo = String(d.campo ?? "");
  if (!(campo in ETIQUETA_CAMPO)) return mal("Ese campo no se puede editar.");
  if (campo in CAMPOS_DE_COSTOS) {
    if (!puede(a, "costos", "editar")) return mal("No tenés permiso para cambiar costos ni precios.");
    const columna = CAMPOS_DE_COSTOS[campo];
    if (columna && columnasOcultas(a).includes(columna)) return mal("No tenés permiso para cambiar costos ni precios.");
  }
  const valor = String(d.valor ?? "").trim();
  let data: Prisma.ProyectoItemUncheckedUpdateManyInput;
  let antes: unknown = it[campo as keyof typeof it];
  let despues: unknown = valor;

  switch (campo) {
    case "descripcion":
      if (!valor) return mal("La descripción no puede quedar vacía.");
      data = { descripcion: valor.slice(0, 200) };
      break;
    case "rubro":
      if (!valor) return mal("Elegí un rubro.");
      data = { rubro: valor.slice(0, 60) };
      break;
    case "supplierId": {
      const s = valor ? await prisma.supplier.findFirst({ where: { id: valor, tenantId }, select: { id: true, name: true } }) : null;
      if (valor && !s) return mal("Ese proveedor no existe.");
      data = { supplierId: s?.id ?? null, proveedor: s?.name ?? null };
      antes = it.proveedor;
      despues = s?.name ?? null;
      break;
    }
    case "cantidad": {
      const n = numeroDe(valor);
      if (n === null || n <= 0) return mal("La cantidad tiene que ser un número mayor que cero.");
      data = { cantidad: n };
      despues = n;
      break;
    }
    case "costo": {
      const n = numeroDe(valor);
      if (n === null) return mal("El costo no se entiende: escribilo como un número.");
      data = { costo: n };
      despues = n;
      break;
    }
    case "moneda":
      if (!(MONEDAS as readonly string[]).includes(valor)) return mal("La moneda no es válida.");
      data = { moneda: valor };
      break;
    case "recargoPct": {
      const n = valor ? numeroDe(valor) : null;
      if (valor && n === null) return mal("El recargo no se entiende: escribilo como un número.");
      // Con recargo, el precio sale de ahí. Vaciarlo sobre un precio a mano no cambia el precio.
      data = n === null ? { recargoPct: null } : { recargoPct: n, precio: 0 };
      despues = n;
      break;
    }
    case "precio": {
      const n = valor ? numeroDe(valor) : 0;
      if (n === null) return mal("El precio no se entiende: escribilo como un número.");
      data = n > 0 ? { precio: redondear(n), recargoPct: null } : { precio: 0 };
      despues = n;
      break;
    }
    case "fechaLimite": {
      const f = fecha(valor);
      if (valor && !f) return mal("La fecha no es válida.");
      data = { fechaLimite: f };
      antes = it.fechaLimite?.toISOString().slice(0, 10) ?? null;
      despues = valor || null;
      break;
    }
    case "estadoItem":
      if (!(ESTADOS_ITEM as readonly string[]).includes(valor)) return mal("Ese estado no existe.");
      data = { estadoItem: valor };
      break;
    default:
      data = { visibleCliente: valor === "1" };
      despues = valor === "1";
  }

  const pierdeAprobacion = CAMPOS_DE_PRECIO.has(campo) && !!it.presupuesto.aprobadoInternoEl;
  await tenantTransaction(async (tx) => {
    await tx.proyectoItem.updateMany({ where: { id: it.id, tenantId }, data });
    await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoItem", entidadId: it.id, campo: `${ETIQUETA_CAMPO[campo]} · ${it.descripcion}`, antes, despues, autor: a.nombre });
    if (pierdeAprobacion) await tx.proyectoPresupuesto.updateMany({ where: { id: it.presupuesto.id, tenantId }, data: { aprobadoInternoEl: null, aprobadoInternoPor: null } });
  });
  if (!SIN_EFECTO_EN_CUOTAS.has(campo)) await regenerar(tenantId, proyectoId);
  refrescar(proyectoId);
  return { ok: true };
}

export async function agregarItemFicha(formData: FormData): Promise<ResultadoFicha> {
  const tenantId = await getCurrentTenantId();
  const presupuestoId = txt(formData.get("presupuestoId"));
  const pr = await prisma.proyectoPresupuesto.findFirst({ where: { id: presupuestoId, tenantId }, select: { id: true, estado: true, proyectoId: true } });
  if (!pr) return mal("Esa versión no existe.");
  const a = await entrar("ficha", pr.proyectoId);
  if (typeof a === "string") return mal(a);
  if (!sePuedeEditar(pr.estado)) return mal("Esta versión ya se envió: abrí una nueva para cambiarla.");
  const descripcion = txt(formData.get("descripcion")).slice(0, 200);
  if (!descripcion) return mal("Escribí qué es el ítem.");
  const rubro = txt(formData.get("rubro")).slice(0, 60) || RUBROS[0];
  const posicion = await prisma.proyectoItem.count({ where: { tenantId, presupuestoId } });
  await tenantTransaction(async (tx) => {
    const creado = await tx.proyectoItem.create({ data: { tenantId, presupuestoId, rubro, descripcion, posicion }, select: { id: true } });
    await registrarCambio(tx, { tenantId, proyectoId: pr.proyectoId, entidad: "ProyectoItem", entidadId: creado.id, campo: "Ítem agregado", despues: descripcion, autor: a.nombre });
    await tx.proyectoPresupuesto.updateMany({ where: { id: presupuestoId, tenantId }, data: { aprobadoInternoEl: null, aprobadoInternoPor: null } });
  });
  await regenerar(tenantId, pr.proyectoId);
  refrescar(pr.proyectoId);
  return { ok: true };
}

export async function borrarItemFicha(d: { id: string }): Promise<ResultadoFicha> {
  const tenantId = await getCurrentTenantId();
  const it = await prisma.proyectoItem.findFirst({ where: { id: String(d.id ?? ""), tenantId }, select: { id: true, descripcion: true, cantidad: true, precio: true, presupuesto: { select: { id: true, estado: true, proyectoId: true } } } });
  if (!it) return mal("Ese ítem ya no existe. Recargá la página.");
  const { proyectoId } = it.presupuesto;
  const a = await entrar("ficha", proyectoId);
  if (typeof a === "string") return mal(a);
  if (!sePuedeEditar(it.presupuesto.estado)) return mal("Esta versión ya se envió: abrí una nueva para cambiarla.");
  await tenantTransaction(async (tx) => {
    await tx.proyectoArchivo.updateMany({ where: { tenantId, proyectoId, itemId: it.id }, data: { itemId: null } });
    await tx.proyectoItem.deleteMany({ where: { id: it.id, tenantId } });
    await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoItem", entidadId: it.id, campo: "Ítem quitado", antes: it.descripcion, autor: a.nombre });
    await tx.proyectoPresupuesto.updateMany({ where: { id: it.presupuesto.id, tenantId }, data: { aprobadoInternoEl: null, aprobadoInternoPor: null } });
  });
  await regenerar(tenantId, proyectoId);
  refrescar(proyectoId);
  return { ok: true };
}

// ── Cotización ──────────────────────────────────────────────────────────────

/**
 * Copia la versión anterior entera (proveedor, moneda, recargo, deadline). Los ítems cambian de id: las cuotas y los adjuntos
 * los siguen, si no lo ya pagado se volvería a generar como deuda nueva.
 */
export async function nuevaVersion(formData: FormData): Promise<ResultadoFicha> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar(["cotizaciones", "ficha"], proyectoId);
  if (typeof a === "string") return mal(a);
  const { tenantId } = a;
  const config = await configProyectos(tenantId);
  const r = await tenantTransaction(async (tx) => {
    const ultima = await tx.proyectoPresupuesto.findFirst({ where: { tenantId, proyectoId }, orderBy: { version: "desc" }, include: { items: { orderBy: { posicion: "asc" } } } });
    if (ultima && sePuedeEditar(ultima.estado)) return false;
    const nueva = await tx.proyectoPresupuesto.create({
      data: {
        tenantId,
        proyectoId,
        version: (ultima?.version ?? 0) + 1,
        token: token(),
        ivaPct: ultima?.ivaPct ?? config.ivaPct,
        presentacion: ultima?.presentacion ?? "",
        condiciones: ultima?.condiciones || config.condiciones,
        nota: txt(formData.get("nota")).slice(0, 300),
        creadoPor: a.nombre,
      },
    });
    const ids = new Map<string, string>();
    for (const i of ultima?.items ?? []) {
      const copia = await tx.proyectoItem.create({
        data: {
          tenantId,
          presupuestoId: nueva.id,
          rubro: i.rubro,
          descripcion: i.descripcion,
          unidad: i.unidad,
          cantidad: i.cantidad,
          costo: i.costo,
          precio: precioAlCopiar(i),
          proveedor: i.proveedor,
          supplierId: i.supplierId,
          recargoPct: i.recargoPct,
          moneda: i.moneda,
          fechaLimite: i.fechaLimite,
          estadoItem: i.estadoItem,
          visibleCliente: i.visibleCliente,
          costoReal: i.costoReal,
          origen: i.origen,
          posicion: i.posicion,
        },
        select: { id: true },
      });
      ids.set(i.id, copia.id);
      await tx.proyectoArchivo.updateMany({ where: { tenantId, proyectoId, itemId: i.id }, data: { itemId: copia.id } });
    }
    for (const { de, a: hacia } of clavesARenombrar(proyectoId, ids)) {
      await tx.proyectoCuota.updateMany({ where: { tenantId, proyectoId, clave: de }, data: { clave: hacia } });
    }
    await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoPresupuesto", entidadId: nueva.id, campo: "Versión nueva", despues: `Versión ${nueva.version}`, autor: a.nombre });
    return true;
  });
  if (!r) return mal("Ya hay una versión en borrador: seguí con ésa.");
  await regenerar(tenantId, proyectoId);
  refrescar(proyectoId);
  return { ok: true };
}

/** Sólo Dirección. Un cambio de precio posterior la borra: lo aprobado tiene que ser lo que se envía. */
export async function aprobarInterno(formData: FormData): Promise<ResultadoFicha> {
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const pr = await prisma.proyectoPresupuesto.findFirst({ where: { id, tenantId }, select: { proyectoId: true, estado: true, version: true, _count: { select: { items: true } } } });
  if (!pr) return mal("Esa versión no existe.");
  const a = await entrar("cotizaciones", pr.proyectoId);
  if (typeof a === "string") return mal(a);
  if (a.rol !== "DIRECCION") return mal("Los precios los aprueba Dirección.");
  if (!sePuedeEditar(pr.estado)) return mal("Esta versión ya se envió.");
  if (pr._count.items === 0) return mal("Cargá al menos un ítem antes de aprobar.");
  await tenantTransaction(async (tx) => {
    await tx.proyectoPresupuesto.updateMany({ where: { id, tenantId, estado: "BORRADOR" }, data: { aprobadoInternoPor: a.nombre, aprobadoInternoEl: new Date() } });
    await registrarCambio(tx, { tenantId, proyectoId: pr.proyectoId, entidad: "ProyectoPresupuesto", entidadId: id, campo: `Aprobación de precios · versión ${pr.version}`, despues: a.nombre, autor: a.nombre });
    await avisar(tx, { tenantId, destinatarios: await usuariosDelEquipo(tenantId, pr.proyectoId, a.user.id), tipo: "aprobacion", texto: `${a.nombre} aprobó los precios de la versión ${pr.version}`, enlace: `${RAIZ}/${pr.proyectoId}?tab=cotizacion` });
  });
  refrescar(pr.proyectoId);
  return { ok: true };
}

/** Enviar congela la versión: escribe los precios que salían del recargo, guarda la foto y la vuelve visible en su link. */
export async function enviarCotizacion(formData: FormData): Promise<ResultadoFicha> {
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const pr = await prisma.proyectoPresupuesto.findFirst({ where: { id, tenantId }, include: { items: { orderBy: { posicion: "asc" } } } });
  if (!pr) return mal("Esa versión no existe.");
  const a = await entrar("cotizaciones", pr.proyectoId);
  if (typeof a === "string") return mal(a);
  if (!sePuedeEditar(pr.estado)) return mal("Esta versión ya se envió.");
  if (pr.items.length === 0) return mal("Cargá al menos un ítem antes de enviar.");
  if (!pr.aprobadoInternoEl) return mal("Falta que Dirección apruebe los precios.");
  const [config, tc] = await Promise.all([configProyectos(tenantId), tiposDeCambio(tenantId)]);
  const faltan = monedasSinCambio(pr.items, tc);
  if (faltan.length > 0) return mal(`Falta el tipo de cambio de ${faltan.join(", ")}: sin él, esos ítems valen cero.`);
  const fijados = pr.items.map((i) => ({ item: i, fijo: precioAlEnviar(i, tc, config.margenPct) }));
  const foto = fotoDeVersion(fijados.map(({ item, fijo }) => ({ ...item, ...fijo })), tc, config.margenPct);
  const ahora = new Date();
  const enviada = await tenantTransaction(async (tx) => {
    const r = await tx.proyectoPresupuesto.updateMany({
      where: { id, tenantId, estado: "BORRADOR", aprobadoInternoEl: { not: null } },
      data: { estado: "ENVIADO", enviadoEl: ahora, validoHasta: sumarDias(ahora, config.validezDias), foto: foto as unknown as Prisma.InputJsonValue },
    });
    if (r.count === 0) return false;
    for (const { item, fijo } of fijados) if (fijo) await tx.proyectoItem.updateMany({ where: { id: item.id, tenantId }, data: fijo });
    await tx.proyectoPresupuesto.updateMany({ where: { tenantId, proyectoId: pr.proyectoId, estado: "ENVIADO", id: { not: id } }, data: { estado: "REEMPLAZADO" } });
    const avanza = await tx.proyecto.updateMany({ where: { id: pr.proyectoId, tenantId, etapa: { in: ["PEDIDO", "DISENO", "RENDER", "PRESUPUESTO"] } }, data: { etapa: "PROPUESTA" } });
    await registrarCambio(tx, { tenantId, proyectoId: pr.proyectoId, entidad: "ProyectoPresupuesto", entidadId: id, campo: `Versión ${pr.version}`, antes: "Borrador", despues: "Enviada", autor: a.nombre });
    if (avanza.count > 0) await registrarCambio(tx, { tenantId, proyectoId: pr.proyectoId, entidad: "Proyecto", entidadId: pr.proyectoId, campo: "Etapa", despues: etapaLabel("PROPUESTA"), autor: a.nombre });
    return true;
  });
  if (!enviada) return mal("No se pudo enviar: revisá que siga aprobada y en borrador.");
  await regenerar(tenantId, pr.proyectoId);
  await auditAdmin({ action: "proyecto.propuesta.enviar", entity: "ProyectoPresupuesto", entityId: id, changes: { version: pr.version } });
  refrescar(pr.proyectoId);
  return { ok: true };
}

/** Cuando el cliente responde por otro lado (teléfono, mail): queda igual que si hubiera usado su link. */
export async function registrarRespuesta(formData: FormData): Promise<ResultadoFicha> {
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const pr = await prisma.proyectoPresupuesto.findFirst({ where: { id, tenantId }, select: { proyectoId: true, version: true, proyecto: { select: { servicio: true, etapa: true } } } });
  if (!pr) return mal("Esa versión no existe.");
  const a = await entrar("cotizaciones", pr.proyectoId);
  if (typeof a === "string") return mal(a);
  const aprueba = txt(formData.get("respuesta")) === "APROBADO";
  const nombre = txt(formData.get("nombre")).slice(0, 120);
  const motivo = txt(formData.get("motivo")).slice(0, 500);
  if (!nombre) return mal("Escribí quién respondió.");
  if (!aprueba && !motivo) return mal("Escribí qué cambios pidió.");
  const ganada = await tenantTransaction(async (tx) => {
    const r = await tx.proyectoPresupuesto.updateMany({
      where: { id, tenantId, estado: "ENVIADO" },
      data: { estado: aprueba ? "APROBADO" : "RECHAZADO", respondidoEl: new Date(), respondidoPor: nombre, motivoRechazo: aprueba ? null : motivo },
    });
    if (r.count === 0) return false;
    await registrarCambio(tx, { tenantId, proyectoId: pr.proyectoId, entidad: "ProyectoPresupuesto", entidadId: id, campo: `Respuesta del cliente · versión ${pr.version}`, despues: aprueba ? `Aprobó (${nombre})` : `Pidió cambios (${nombre}): ${motivo}`, autor: a.nombre });
    if (aprueba) {
      const etapa = etapaAlAprobar(pr.proyecto.servicio, pr.proyecto.etapa);
      await tx.proyecto.updateMany({ where: { id: pr.proyectoId, tenantId }, data: { etapa } });
      await registrarCambio(tx, { tenantId, proyectoId: pr.proyectoId, entidad: "Proyecto", entidadId: pr.proyectoId, campo: "Etapa", antes: etapaLabel(pr.proyecto.etapa, pr.proyecto.servicio), despues: etapaLabel(etapa, pr.proyecto.servicio), autor: a.nombre });
    }
    return true;
  });
  if (!ganada) return mal("Esta versión ya fue respondida o reemplazada.");
  await regenerar(tenantId, pr.proyectoId);
  refrescar(pr.proyectoId);
  return { ok: true };
}

export async function guardarTextos(formData: FormData): Promise<ResultadoFicha> {
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const pr = await prisma.proyectoPresupuesto.findFirst({ where: { id, tenantId }, select: { proyectoId: true, estado: true } });
  if (!pr) return mal("Esa versión no existe.");
  const a = await entrar("cotizaciones", pr.proyectoId);
  if (typeof a === "string") return mal(a);
  if (!sePuedeEditar(pr.estado)) return mal("Esta versión ya se envió.");
  const iva = numeroDe(txt(formData.get("ivaPct")));
  if (iva === null) return mal("El IVA no se entiende: escribilo como un número.");
  await prisma.proyectoPresupuesto.updateMany({ where: { id, tenantId }, data: { presentacion: txt(formData.get("presentacion")), condiciones: txt(formData.get("condiciones")), ivaPct: iva } });
  refrescar(pr.proyectoId);
  return { ok: true };
}

// ── Finanzas ────────────────────────────────────────────────────────────────

/**
 * Marca una cuota del evento como cobrada o pagada, y asienta la plata: un cobro crea el `ProyectoPago` con su movimiento de caja; un
 * pago, el `ProyectoGasto` ya pagado con su asiento. Espera `id` y `medio` en el FormData. A prueba de doble clic: sólo gana quien la
 * encuentra sin pagar. Las cuotas de la empresa, sin proyecto, tienen su propia acción en acciones-empresa.ts.
 */
export async function marcarCuota(formData: FormData): Promise<ResultadoFicha> {
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const medio = txt(formData.get("medio")) as MedioPago;
  const c = await prisma.proyectoCuota.findFirst({
    where: { id, tenantId },
    include: { supplier: { select: { name: true } }, proyecto: { select: { numero: true, nombre: true } } },
  });
  if (!c) return mal("Esa cuota ya no existe. Recargá la página.");
  const { proyectoId, proyecto } = c;
  if (!proyectoId || !proyecto) return mal("Esa cuota es de la empresa: se marca desde Administración.");
  const a = await entrar(["pagos", "empresa"], proyectoId);
  if (typeof a === "string") return mal(a);
  if (!MEDIOS.includes(medio)) return mal("Elegí el medio de pago.");
  if (c.anuladoEl) return mal("Esa cuota ya no corre: la ficha la dejó afuera.");
  if (c.pagadoEl) return mal("Esa cuota ya estaba marcada.");
  const tc = await tiposDeCambio(tenantId);
  const importe = aPesos(c.monto, c.moneda, tc);
  if (!(importe > 0)) return mal(`Falta el tipo de cambio de ${c.moneda}: sin él no se puede asentar en pesos.`);
  const esCobro = c.tipo === "COBRO";
  const etiqueta = `Proyecto #${proyecto.numero} · ${c.concepto}`;
  const cheque = medio === "CHEQUE" ? " · Cheque" : "";
  const ganada = await tenantTransaction(async (tx) => {
    const r = await tx.proyectoCuota.updateMany({ where: { id, tenantId, pagadoEl: null, anuladoEl: null }, data: { pagadoEl: new Date(), pagadoPor: a.nombre, medio } });
    if (r.count === 0) return false;
    const session = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
    const method = metodoDeCaja(medio, await transferenciaEnElLibroTx(tx));
    const base = { tenantId, sessionId: session?.id ?? null, method, amount: importe };
    let asiento: string;
    if (esCobro) {
      const pago = await tx.proyectoPago.create({ data: { tenantId, proyectoId, medio, monto: importe, nota: c.concepto.slice(0, 200), cobradoPor: a.nombre }, select: { id: true } });
      asiento = pago.id;
      await tx.cashMovement.create({ data: { ...base, type: "VENTA", reason: `${etiqueta}${cheque}`, proyectoPagoId: pago.id, createdBy: a.user.name } });
    } else {
      // El rubro del ítem: es lo que permite comparar lo real contra lo presupuestado.
      const itemId = itemDeClave(c.clave);
      const item = itemId ? await tx.proyectoItem.findFirst({ where: { id: itemId, tenantId }, select: { rubro: true } }) : null;
      const gasto = await tx.proyectoGasto.create({
        data: { tenantId, proyectoId, supplierId: c.supplierId, rubro: item?.rubro ?? "General", descripcion: c.concepto.slice(0, 200), neto: importe, iva: 0, comprobante: c.factura, cargadoPor: a.nombre, pagadoEl: new Date(), medio, pagadoPor: a.nombre },
        select: { id: true },
      });
      asiento = gasto.id;
      await tx.cashMovement.create({ data: { ...base, type: "EGRESO", reason: `${etiqueta}${c.supplier ? ` · ${c.supplier.name}` : ""}${cheque}`, proyectoGastoId: gasto.id, createdBy: marcaDeGastoProyecto(gasto.id) } });
    }
    const cambio = { tenantId, proyectoId, entidad: "ProyectoCuota", entidadId: id, autor: a.nombre };
    await registrarCambio(tx, { ...cambio, campo: esCobro ? `Cobrado · ${c.concepto}` : `Pagado · ${c.concepto}`, antes: "Pendiente", despues: `${importe} (${medio})` });
    // Une la cuota con lo que se asentó: al anular el cobro o el gasto, la cuota vuelve a quedar pendiente.
    await registrarCambio(tx, { ...cambio, campo: "Asiento", despues: asiento });
    await avisar(tx, { tenantId, destinatarios: await usuariosDelEquipo(tenantId, proyectoId, a.user.id), tipo: esCobro ? "cobro" : "pago", texto: `${esCobro ? "Se cobró" : "Se pagó"}: ${c.concepto}`, enlace: `${RAIZ}/${proyectoId}?tab=finanzas` });
    return true;
  });
  if (!ganada) return mal("Esa cuota ya estaba marcada.");
  await auditAdmin({ action: esCobro ? "proyecto.cuota.cobrar" : "proyecto.cuota.pagar", entity: "ProyectoCuota", entityId: id, changes: { importe, medio } });
  refrescar(proyectoId);
  revalidatePath(`${RAIZ}/administracion`);
  return { ok: true };
}

export async function crearMovimientoManual(formData: FormData): Promise<ResultadoFicha> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar("pagos", proyectoId);
  if (typeof a === "string") return mal(a);
  const { tenantId } = a;
  const tipo = txt(formData.get("tipo"));
  const concepto = txt(formData.get("concepto")).slice(0, 200);
  const monto = numeroDe(txt(formData.get("monto")));
  const moneda = txt(formData.get("moneda")) || "ARS";
  const venceEl = fecha(formData.get("venceEl"));
  const supplierId = txt(formData.get("supplierId"));
  if (tipo !== "COBRO" && tipo !== "PAGO") return mal("Elegí si es un cobro o un pago.");
  if (!concepto) return mal("Escribí el concepto.");
  if (monto === null || monto <= 0) return mal("Escribí el monto.");
  if (!(MONEDAS as readonly string[]).includes(moneda)) return mal("La moneda no es válida.");
  if (!venceEl) return mal("Elegí la fecha.");
  if (supplierId && !(await prisma.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true } }))) return mal("Ese proveedor no existe.");
  await tenantTransaction(async (tx) => {
    const c = await tx.proyectoCuota.create({ data: { tenantId, proyectoId, tipo, concepto, monto, moneda, venceEl, supplierId: tipo === "PAGO" && supplierId ? supplierId : null, auto: false }, select: { id: true } });
    await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoCuota", entidadId: c.id, campo: `Movimiento manual · ${concepto}`, despues: `${tipo === "COBRO" ? "Cobro" : "Pago"} ${monto} ${moneda}`, autor: a.nombre });
  });
  refrescar(proyectoId);
  return { ok: true };
}

/** Sólo lo cargado a mano y sin pagar. Anular no borra. */
export async function quitarMovimiento(formData: FormData): Promise<ResultadoFicha> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar("pagos", proyectoId);
  if (typeof a === "string") return mal(a);
  const { tenantId } = a;
  const id = txt(formData.get("id"));
  const r = await prisma.proyectoCuota.updateMany({ where: { id, tenantId, proyectoId, auto: false, pagadoEl: null, anuladoEl: null }, data: { anuladoEl: new Date() } });
  if (r.count === 0) return mal("Ese movimiento ya no se puede quitar.");
  await registrarCambio(prisma, { tenantId, proyectoId, entidad: "ProyectoCuota", entidadId: id, campo: "Movimiento quitado", despues: id, autor: a.nombre });
  refrescar(proyectoId);
  return { ok: true };
}

/** La aprobación desde el link del cliente mueve la etapa sin pasar por acá: este botón pone las cuotas al día. */
export async function recalcularCuotas(formData: FormData): Promise<ResultadoFicha> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar("pagos", proyectoId);
  if (typeof a === "string") return mal(a);
  await regenerar(a.tenantId, proyectoId);
  refrescar(proyectoId);
  return { ok: true };
}

async function reabrirCuotaTx(tx: Prisma.TransactionClient, tenantId: string, proyectoId: string, asiento: string, autor: string) {
  const enlace = await tx.proyectoCambio.findFirst({ where: { tenantId, proyectoId, entidad: "ProyectoCuota", campo: "Asiento", despues: asiento }, select: { entidadId: true } });
  if (!enlace?.entidadId) return;
  await tx.proyectoCuota.updateMany({ where: { id: enlace.entidadId, tenantId }, data: { pagadoEl: null, pagadoPor: null, medio: null } });
  await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoCuota", entidadId: enlace.entidadId, campo: "Cuota reabierta", despues: "Pendiente", autor });
}

/** Anular no borra: escribe la contrapartida con fecha de hoy. Si el cobro salió de una cuota, la cuota vuelve a pendiente. */
export async function anularCobroFicha(formData: FormData): Promise<ResultadoFicha> {
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const pago = await prisma.proyectoPago.findFirst({ where: { id, tenantId }, select: { proyectoId: true, monto: true, proyecto: { select: { numero: true } } } });
  if (!pago) return mal("Ese cobro no existe.");
  const a = await entrar("pagos", pago.proyectoId);
  if (typeof a === "string") return mal(a);
  await tenantTransaction(async (tx) => {
    const r = await tx.proyectoPago.updateMany({ where: { id, tenantId, anuladoEl: null }, data: { anuladoEl: new Date(), anuladoPor: a.nombre } });
    if (r.count === 0) return;
    const venta = await tx.cashMovement.findFirst({ where: { tenantId, proyectoPagoId: id, type: "VENTA" }, select: { amount: true, method: true } });
    if (venta) {
      const session = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
      await tx.cashMovement.create({ data: { tenantId, sessionId: session?.id ?? null, type: "EGRESO", method: venta.method, amount: venta.amount, reason: `Anulación · Proyecto #${pago.proyecto.numero}`, proyectoPagoId: id, createdBy: a.user.name } });
    }
    await registrarCambio(tx, { tenantId, proyectoId: pago.proyectoId, entidad: "ProyectoPago", entidadId: id, campo: "Cobro anulado", antes: pago.monto, autor: a.nombre });
    await reabrirCuotaTx(tx, tenantId, pago.proyectoId, id, a.nombre);
  });
  await regenerar(tenantId, pago.proyectoId);
  await auditAdmin({ action: "proyecto.cobro.anular", entity: "ProyectoPago", entityId: id, changes: { monto: pago.monto } });
  refrescar(pago.proyectoId);
  return { ok: true };
}

/** Igual que el cobro: si ya se pagó, la plata vuelve al libro; si salió de una cuota, la cuota vuelve a pendiente. */
export async function anularGastoFicha(formData: FormData): Promise<ResultadoFicha> {
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const g = await prisma.proyectoGasto.findFirst({ where: { id, tenantId }, select: { proyectoId: true, neto: true, iva: true, proyecto: { select: { numero: true } } } });
  if (!g) return mal("Ese gasto no existe.");
  const a = await entrar("pagos", g.proyectoId);
  if (typeof a === "string") return mal(a);
  await tenantTransaction(async (tx) => {
    const r = await tx.proyectoGasto.updateMany({ where: { id, tenantId, anuladoEl: null }, data: { anuladoEl: new Date(), anuladoPor: a.nombre } });
    if (r.count === 0) return;
    const pago = await tx.cashMovement.findFirst({ where: { tenantId, proyectoGastoId: id, type: "EGRESO" }, select: { amount: true, method: true } });
    if (pago) {
      const session = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
      await tx.cashMovement.create({ data: { tenantId, sessionId: session?.id ?? null, type: "INGRESO", method: pago.method, amount: pago.amount, reason: `Anulación de gasto · Proyecto #${g.proyecto.numero}`, proyectoGastoId: id, createdBy: marcaDeGastoProyecto(id) } });
    }
    await registrarCambio(tx, { tenantId, proyectoId: g.proyectoId, entidad: "ProyectoGasto", entidadId: id, campo: "Gasto anulado", antes: redondear(g.neto + g.iva), autor: a.nombre });
    await reabrirCuotaTx(tx, tenantId, g.proyectoId, id, a.nombre);
  });
  await regenerar(tenantId, g.proyectoId);
  await auditAdmin({ action: "proyecto.gasto.anular", entity: "ProyectoGasto", entityId: id, changes: { neto: g.neto, iva: g.iva } });
  refrescar(g.proyectoId);
  revalidatePath(`${RAIZ}/proveedores`);
  return { ok: true };
}

// ── Seguimiento ─────────────────────────────────────────────────────────────

export async function agregarChecklist(formData: FormData): Promise<ResultadoFicha> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar("ficha", proyectoId);
  if (typeof a === "string") return mal(a);
  const texto = txt(formData.get("texto")).slice(0, 200);
  if (!texto) return mal("Escribí qué hay que confirmar.");
  await prisma.proyectoChecklist.create({ data: { tenantId: a.tenantId, proyectoId, texto, categoria: txt(formData.get("categoria")).slice(0, 40) || "general", fecha: fecha(formData.get("fecha")) } });
  refrescar(proyectoId);
  return { ok: true };
}

/** Para los proyectos de antes de la plantilla. */
export async function cargarPlantillaChecklist(formData: FormData): Promise<ResultadoFicha> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar("ficha", proyectoId);
  if (typeof a === "string") return mal(a);
  const { tenantId } = a;
  const p = await prisma.proyecto.findFirst({ where: { id: proyectoId, tenantId }, select: { fechaEvento: true, _count: { select: { checklist: true } } } });
  if (!p || p._count.checklist > 0) return mal("Este proyecto ya tiene checklist.");
  await prisma.proyectoChecklist.createMany({ data: CHECKLIST_BASE.map((c) => ({ tenantId, proyectoId, texto: c.texto, categoria: c.categoria, fecha: fechaAntesDe(p.fechaEvento, c.dias) })) });
  refrescar(proyectoId);
  return { ok: true };
}

export async function alternarChecklist(formData: FormData): Promise<ResultadoFicha> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar("ficha", proyectoId);
  if (typeof a === "string") return mal(a);
  const id = txt(formData.get("id"));
  const c = await prisma.proyectoChecklist.findFirst({ where: { id, proyectoId, tenantId: a.tenantId }, select: { hechoEl: true } });
  if (!c) return mal("Ese punto ya no existe.");
  await prisma.proyectoChecklist.updateMany({ where: { id, tenantId: a.tenantId }, data: { hechoEl: c.hechoEl ? null : new Date() } });
  refrescar(proyectoId);
  return { ok: true };
}

export async function borrarChecklist(formData: FormData): Promise<ResultadoFicha> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar("ficha", proyectoId);
  if (typeof a === "string") return mal(a);
  await prisma.proyectoChecklist.deleteMany({ where: { id: txt(formData.get("id")), proyectoId, tenantId: a.tenantId } });
  refrescar(proyectoId);
  return { ok: true };
}

// ── Archivos ────────────────────────────────────────────────────────────────

/** La subida de siempre, con el mismo tope, y los tipos que pide la ficha. Sube también quien sólo edita diseño. */
export async function subirArchivoFicha(d: { proyectoId: string; tipo: string; nombre: string; datos?: string | null; url?: string | null; visibleCliente?: boolean }): Promise<ResultadoFicha<{ id: string }>> {
  const proyectoId = String(d.proyectoId ?? "");
  const a = await entrar(["ficha", "diseno"], proyectoId);
  if (typeof a === "string") return mal(a);
  const { tenantId } = a;
  const tipo = TIPOS_ARCHIVO.includes(d.tipo) ? d.tipo : "OTRO";
  const nombre = (d.nombre ?? "").trim().slice(0, 120) || "Archivo";
  const url = (d.url ?? "").trim();
  const imagenOk = typeof d.datos === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(d.datos) && d.datos.length <= MAX_IMAGEN;
  if (d.datos ? !imagenOk : !linkSeguro(url)) return mal(d.datos ? "La imagen es demasiado pesada o no es válida." : "Pegá un link que empiece con https://.");
  const cuantos = await prisma.proyectoArchivo.count({ where: { tenantId, proyectoId } });
  if (cuantos >= MAX_ARCHIVOS) return mal(`Un proyecto guarda hasta ${MAX_ARCHIVOS} archivos. Sacá alguno que ya no uses.`);
  const nuevo = await prisma.proyectoArchivo.create({
    data: { tenantId, proyectoId, tipo, nombre, datos: d.datos || null, url: d.datos ? null : url, visibleCliente: !!d.visibleCliente && !!d.datos, subidoPor: a.nombre },
    select: { id: true },
  });
  refrescar(proyectoId);
  return { ok: true, id: nuevo.id };
}

export async function vincularArchivo(formData: FormData): Promise<ResultadoFicha> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar(["ficha", "diseno"], proyectoId);
  if (typeof a === "string") return mal(a);
  const { tenantId } = a;
  const itemId = txt(formData.get("itemId"));
  if (itemId && !(await prisma.proyectoItem.findFirst({ where: { id: itemId, tenantId, presupuesto: { proyectoId } }, select: { id: true } }))) return mal("Ese ítem no es de este proyecto.");
  await prisma.proyectoArchivo.updateMany({ where: { id: txt(formData.get("id")), proyectoId, tenantId }, data: { itemId: itemId || null } });
  refrescar(proyectoId);
  return { ok: true };
}

export async function borrarArchivoFicha(formData: FormData): Promise<ResultadoFicha> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar(["ficha", "diseno"], proyectoId);
  if (typeof a === "string") return mal(a);
  const id = txt(formData.get("id"));
  const f = await prisma.proyectoArchivo.findFirst({ where: { id, proyectoId, tenantId: a.tenantId }, select: { nombre: true } });
  if (!f) return mal("Ese archivo ya no existe.");
  await prisma.proyectoArchivo.deleteMany({ where: { id, proyectoId, tenantId: a.tenantId } });
  await auditAdmin({ action: "proyecto.archivo.borrar", entity: "ProyectoArchivo", entityId: id, changes: { nombre: f.nombre } });
  refrescar(proyectoId);
  return { ok: true };
}

export async function alternarVisibleFicha(formData: FormData): Promise<ResultadoFicha> {
  const proyectoId = txt(formData.get("proyectoId"));
  const a = await entrar(["ficha", "diseno"], proyectoId);
  if (typeof a === "string") return mal(a);
  const id = txt(formData.get("id"));
  const f = await prisma.proyectoArchivo.findFirst({ where: { id, proyectoId, tenantId: a.tenantId }, select: { visibleCliente: true, datos: true } });
  if (!f?.datos) return mal("Sólo una imagen guardada acá puede ir en la propuesta.");
  await prisma.proyectoArchivo.updateMany({ where: { id, tenantId: a.tenantId }, data: { visibleCliente: !f.visibleCliente } });
  refrescar(proyectoId);
  return { ok: true };
}
