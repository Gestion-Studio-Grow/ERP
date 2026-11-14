"use server";

// ============================================================================
// CONSULTAS DE POTENCIALES CLIENTES — lo que hace el equipo desde la bandeja. Cada acción vuelve a pedir el permiso (Proyectos y
// leads, editar) y acota por negocio: esconder un botón no protege nada.
//
// El borrador del agente NUNCA sale solo: queda como BORRADOR hasta que una persona lo aprueba. Si los controles lo marcaron
// (precio, promesa, fecha o contacto inventado), la persona ve el motivo antes de aprobar.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { crearLead } from "./acciones-ficha";
import type { Resultado } from "./acciones";
import {
  acotarEntrante,
  enlaceWhatsApp,
  mezclarBrief,
  resumenParaLead,
  revisarRespuesta,
  tipoEventoDeTexto,
  validarBriefDeModelo,
  type BriefConsulta,
} from "./consulta-core";
import { enviarPorMail } from "./consultas.server";
import { datosDelNegocio } from "./datos.server";
import { exigirEditar, puede, type Actor } from "./gestion.server";
import { etapa2ActivaPara } from "./etapa2.server";
import { MENSAJE_APAGADO } from "./etapa2-core";
import { analizarConsultaConIA, FALTA_CLAVE, iaConectada } from "./ia.server";

const RAIZ = "/admin/proyectos/consultas";
const SIN_CONSULTA = "Esa consulta no existe.";

function refrescar(id?: string) {
  revalidatePath(RAIZ);
  revalidatePath("/admin/proyectos");
  if (id) revalidatePath(`${RAIZ}/${id}`);
}

async function cargar(a: Actor, id: string) {
  return prisma.consulta.findFirst({ where: { id: acotarEntrante(id, 40), tenantId: a.tenantId }, include: { mensajes: { orderBy: { createdAt: "asc" }, take: 100 } } });
}

const delCliente = (mensajes: readonly { direccion: string; texto: string }[]): string => mensajes.filter((m) => m.direccion === "ENTRANTE").map((m) => m.texto).join("\n");

/** El Analista arma el brief con estados y un borrador. No manda nada: el borrador queda esperando a una persona. */
export async function pedirBorradorConsulta(d: { id: string }): Promise<Resultado<{ problemas: string[] }>> {
  const a = await exigirEditar("pipeline");
  if (!puede(a, "ia", "editar")) return { ok: false, error: "Tu rol no puede usar la IA." };
  if (!(await etapa2ActivaPara(a.tenantId, "ia"))) return { ok: false, error: MENSAJE_APAGADO.ia };
  if (!iaConectada()) return { ok: false, error: FALTA_CLAVE };
  const c = await cargar(a, d.id);
  if (!c) return { ok: false, error: SIN_CONSULTA };
  if (c.intencion === "NO_CLIENTE") return { ok: false, error: "Esta consulta no parece de un cliente: no se arma una respuesta." };
  const previo = (c.brief ?? {}) as BriefConsulta;
  const negocio = (await datosDelNegocio(a.tenantId)).nombre;
  const r = await analizarConsultaConIA({ tenantId: a.tenantId, negocio, nombre: c.nombre, mensajes: c.mensajes.map((m) => ({ origen: m.origen, texto: m.texto })), brief: previo });
  if (!r.ok) return r;
  const cliente = delCliente(c.mensajes);
  const brief = mezclarBrief(previo, validarBriefDeModelo(r.brief, cliente));
  const problemas = revisarRespuesta(r.borrador, { entrante: cliente });
  await prisma.$transaction([
    prisma.consultaMensaje.create({ data: { tenantId: a.tenantId, consultaId: c.id, direccion: "SALIENTE", origen: "AGENTE", texto: r.borrador, envio: "BORRADOR", problemas } }),
    prisma.consulta.update({ where: { id: c.id }, data: { brief: brief as Prisma.InputJsonValue, ultimaActividad: new Date() } }),
  ]);
  refrescar(c.id);
  return { ok: true, problemas };
}

async function enviarYAsentar(a: Actor, consultaId: string, texto: string, mensajeId: string | null): Promise<Resultado<{ envio: string; enlaceWhatsApp: string | null }>> {
  const c = await prisma.consulta.findFirst({ where: { id: consultaId, tenantId: a.tenantId }, select: { id: true, email: true, telefono: true } });
  if (!c) return { ok: false, error: SIN_CONSULTA };
  const cuerpo = acotarEntrante(texto, 2000);
  if (cuerpo.length < 10) return { ok: false, error: "Escribí la respuesta (al menos una frase)." };
  const negocio = (await datosDelNegocio(a.tenantId)).nombre;
  const envio = await enviarPorMail(a.tenantId, c.email, `Tu consulta a ${negocio}`, cuerpo);
  const problemas = revisarRespuesta(cuerpo, { entrante: "" }).filter((p) => !/vacía|corta/.test(p));
  if (mensajeId) await prisma.consultaMensaje.updateMany({ where: { id: mensajeId, tenantId: a.tenantId, consultaId: c.id }, data: { texto: cuerpo, envio, autor: a.nombre, problemas } });
  else await prisma.consultaMensaje.create({ data: { tenantId: a.tenantId, consultaId: c.id, direccion: "SALIENTE", origen: "PERSONA", texto: cuerpo, envio, autor: a.nombre, problemas } });
  await prisma.consulta.update({ where: { id: c.id }, data: { ultimaActividad: new Date(), estado: "EN_CALIFICACION" } });
  refrescar(c.id);
  return { ok: true, envio, enlaceWhatsApp: c.telefono ? enlaceWhatsApp(c.telefono, cuerpo) : null };
}

/** Una persona escribe y manda una respuesta. Sin mail conectado queda registrada como simulada y se ofrece el enlace de WhatsApp. */
export async function responderConsulta(d: { id: string; texto: string }): Promise<Resultado<{ envio: string; enlaceWhatsApp: string | null }>> {
  const a = await exigirEditar("pipeline");
  return enviarYAsentar(a, acotarEntrante(d.id, 40), d.texto, null);
}

/** Una persona aprueba (y si quiere edita) el borrador del agente. Recién ahí sale. */
export async function aprobarBorrador(d: { mensajeId: string; texto: string }): Promise<Resultado<{ envio: string; enlaceWhatsApp: string | null }>> {
  const a = await exigirEditar("pipeline");
  const m = await prisma.consultaMensaje.findFirst({ where: { id: acotarEntrante(d.mensajeId, 40), tenantId: a.tenantId, direccion: "SALIENTE", envio: "BORRADOR" }, select: { id: true, consultaId: true } });
  if (!m) return { ok: false, error: "Ese borrador ya no está disponible." };
  return enviarYAsentar(a, m.consultaId, d.texto, m.id);
}

export async function descartarBorrador(d: { mensajeId: string }): Promise<Resultado> {
  const a = await exigirEditar("pipeline");
  const m = await prisma.consultaMensaje.findFirst({ where: { id: acotarEntrante(d.mensajeId, 40), tenantId: a.tenantId, envio: "BORRADOR" }, select: { id: true, consultaId: true } });
  if (!m) return { ok: false, error: "Ese borrador ya no está disponible." };
  await prisma.consultaMensaje.update({ where: { id: m.id }, data: { envio: "DESCARTADO", autor: a.nombre } });
  refrescar(m.consultaId);
  return { ok: true };
}

const ESTADOS_MANUALES = ["NUEVA", "EN_CALIFICACION", "PARA_PERSONA", "DESCARTADA"] as const;

export async function cambiarEstadoConsulta(d: { id: string; estado: string }): Promise<Resultado> {
  const a = await exigirEditar("pipeline");
  if (!(ESTADOS_MANUALES as readonly string[]).includes(d.estado)) return { ok: false, error: "Ese estado no existe." };
  const r = await prisma.consulta.updateMany({ where: { id: acotarEntrante(d.id, 40), tenantId: a.tenantId, estado: { not: "CONVERTIDA" } }, data: { estado: d.estado, ultimaActividad: new Date() } });
  if (r.count === 0) return { ok: false, error: "No se pudo cambiar: la consulta no existe o ya es un proyecto." };
  refrescar(acotarEntrante(d.id, 40));
  return { ok: true };
}

/** La consulta pasa a ser un lead en la etapa «Lead / brief», con el contacto y el brief ya cargados. Usa la misma creación que el pipeline. */
export async function convertirEnLead(d: { id: string }): Promise<Resultado<{ proyectoId: string }>> {
  const a = await exigirEditar("pipeline");
  const c = await cargar(a, d.id);
  if (!c) return { ok: false, error: SIN_CONSULTA };
  if (c.proyectoId) return { ok: false, error: "Esta consulta ya es un proyecto." };
  const brief = (c.brief ?? {}) as BriefConsulta;
  const primer = c.mensajes.find((m) => m.direccion === "ENTRANTE")?.texto ?? "";
  const tipo = tipoEventoDeTexto(primer) ?? (brief.tipoEvento?.valor ? tipoEventoDeTexto(brief.tipoEvento.valor) : null) ?? "Activación de marca";
  const quien = c.empresa || c.nombre || "Contacto sin nombre";
  // Si ya es cliente (mismo mail o mismo teléfono), el lead se cuelga de ese cliente: no se duplica.
  const existente = await prisma.client.findFirst({ where: { tenantId: a.tenantId, OR: [...(c.email ? [{ email: { equals: c.email, mode: "insensitive" as const } }] : []), ...(c.telefono ? [{ phone: { endsWith: c.telefono.slice(-10) } }] : [])] }, select: { id: true } });
  const fd = new FormData();
  fd.set("nombre", `${quien} — ${tipo}`.slice(0, 120));
  if (existente) fd.set("clienteId", existente.id);
  else fd.set("clienteNuevo", quien.slice(0, 120));
  fd.set("telefono", c.telefono ?? "");
  fd.set("tipoEvento", tipo);
  fd.set("moneda", "ARS");
  fd.set("ciudad", brief.ubicacion?.valor ?? "");
  fd.set("brief", resumenParaLead({ canal: c.canal, nombre: c.nombre, email: c.email, telefono: c.telefono, empresa: c.empresa, primerMensaje: primer, brief }));
  const r = await crearLead(fd);
  if (!r.ok) return { ok: false, error: r.error };
  await prisma.consulta.update({ where: { id: c.id }, data: { estado: "CONVERTIDA", proyectoId: r.id, ultimaActividad: new Date() } });
  refrescar(c.id);
  return { ok: true, proyectoId: r.id };
}

const VIAS = { WHATSAPP: "WhatsApp", TELEFONO: "teléfono", MAIL: "mail", PERSONAL: "en persona" } as const;

/** Cuando alguien contestó por fuera del sistema (su WhatsApp, un llamado): se anota para que la consulta no siga figurando como sin atender. */
export async function registrarRespuestaExterna(d: { id: string; via: string }): Promise<Resultado> {
  const a = await exigirEditar("pipeline");
  const via = (VIAS as Record<string, string>)[d.via];
  if (!via) return { ok: false, error: "Elegí por dónde se respondió." };
  const c = await prisma.consulta.findFirst({ where: { id: acotarEntrante(d.id, 40), tenantId: a.tenantId, estado: { not: "CONVERTIDA" } }, select: { id: true } });
  if (!c) return { ok: false, error: SIN_CONSULTA };
  await prisma.$transaction([
    prisma.consultaMensaje.create({ data: { tenantId: a.tenantId, consultaId: c.id, direccion: "SALIENTE", origen: "PERSONA", texto: `${a.nombre} respondió por ${via} (registrado a mano).`, envio: "NO_APLICA", autor: a.nombre } }),
    prisma.consulta.update({ where: { id: c.id }, data: { ultimaActividad: new Date(), estado: "EN_CALIFICACION" } }),
  ]);
  refrescar(c.id);
  return { ok: true };
}
