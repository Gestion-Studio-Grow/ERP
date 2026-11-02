// ============================================================================
// CONSULTAS DE POTENCIALES CLIENTES — lo que corre en el servidor: registrar la consulta, mandar el acuse y avisar al equipo.
// Las reglas viven en consulta-core.ts (puras y probadas). Acá sólo se las aplica y se toca la base.
//
// Lo único que sale solo es una PLANTILLA FIJA (acuse y preguntas fijas). Lo que redacta la IA queda como borrador hasta que una
// persona lo aprueba (ver acciones-consultas.ts).
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import { basePrisma } from "@/lib/prisma-base";
import { resolveTenantId } from "@/lib/tenant";
import type { Prisma } from "@/generated/prisma/client";
import { enviarMailInterno, mailConectado } from "@/lib/notifications";
import { datosDelNegocio } from "./datos.server";
import { avisar } from "./gestion.server";
import { acotarEntrante, acuseDeRecibo, acuseSinPreguntas, armarPreguntas, clasificarConsulta, emailValido, normalizarTelefonoAR, respuestaAutomatica, revisarRespuesta, tipoEventoDeTexto, type BriefConsulta, type Canal } from "./consulta-core";

export type EnvioConsulta = "ENVIADO" | "SIMULADO" | "FALLIDO" | "BORRADOR";

/** Cuántas consultas con el mismo mail se atienden por día: un formulario público no puede servir para mandarle mails a un tercero. */
const TOPE_POR_MAIL_Y_DIA = 2;

/** Quién recibe el aviso de una consulta: Dirección, Comercial y el dueño. */
export async function usuariosParaConsultas(tenantId: string): Promise<string[]> {
  const [personas, duenos] = await Promise.all([
    prisma.proyectoPersona.findMany({ where: { tenantId, activa: true, rol: { in: ["DIRECCION", "COMERCIAL"] }, userId: { not: null } }, select: { userId: true } }),
    prisma.user.findMany({ where: { tenantId, role: "OWNER", active: true, deletedAt: null }, select: { id: true } }),
  ]);
  return [...new Set([...personas.map((p) => p.userId!), ...duenos.map((d) => d.id)])];
}

/** Manda un texto por mail si hay mail conectado; si no, queda registrado como simulado (nunca se finge que salió). */
export async function enviarPorMail(tenantId: string, para: string | null | undefined, asunto: string, cuerpo: string): Promise<"ENVIADO" | "SIMULADO" | "FALLIDO"> {
  if (!para || !mailConectado()) return "SIMULADO";
  const r = await enviarMailInterno({ tenantId, para, asunto, cuerpo });
  return r.sent ? "ENVIADO" : "FALLIDO";
}

export interface EntradaConsulta {
  tenantId: string;
  canal: Canal;
  nombre?: unknown;
  email?: unknown;
  telefono?: unknown;
  empresa?: unknown;
  texto: unknown;
}

export type ResultadoRegistro = { ok: true; id: string; intencion: string; respuesta: EnvioConsulta | "NINGUNA" } | { ok: false; error: string };

export async function registrarConsulta(d: EntradaConsulta): Promise<ResultadoRegistro> {
  const { tenantId } = d;
  const texto = acotarEntrante(d.texto, 4000);
  const nombre = acotarEntrante(d.nombre, 120);
  const empresa = acotarEntrante(d.empresa, 120);
  const email = acotarEntrante(d.email, 254).toLowerCase();
  const crudoTel = acotarEntrante(d.telefono, 40);
  const telefono = crudoTel ? normalizarTelefonoAR(crudoTel) : null;
  if (texto.length < 5) return { ok: false, error: "Escribí tu consulta." };
  if (email && !emailValido(email)) return { ok: false, error: "El mail no parece válido." };
  if (crudoTel && !telefono) return { ok: false, error: "No entendimos el teléfono. Escribilo con la característica, por ejemplo 11 2345 6789." };
  if (!email && !telefono) return { ok: false, error: "Dejanos un mail o un teléfono para poder responderte." };

  const c = clasificarConsulta(texto);
  const auto = respuestaAutomatica(c);
  const tipo = tipoEventoDeTexto(texto);
  const brief: BriefConsulta = tipo ? { tipoEvento: { estado: "INFERIDO", valor: tipo } } : {};
  const estado = c.intencion === "ESCALAR" ? "PARA_PERSONA" : c.intencion === "NO_CLIENTE" ? "NUEVA" : "EN_CALIFICACION";

  const creada = await prisma.consulta.create({
    data: {
      tenantId,
      canal: d.canal,
      nombre,
      email: email || null,
      telefono,
      empresa: empresa || null,
      estado,
      intencion: c.intencion,
      motivos: c.motivos,
      brief: brief as Prisma.InputJsonValue,
      mensajes: { create: { tenantId, direccion: "ENTRANTE", origen: "CLIENTE", texto } },
    },
    select: { id: true },
  });

  let respuesta: EnvioConsulta | "NINGUNA" = "NINGUNA";
  try {
    if (auto !== "NINGUNA") {
      const negocio = (await datosDelNegocio(tenantId)).nombre;
      const cuerpo = auto === "ACUSE_Y_PREGUNTAS" ? acuseDeRecibo({ nombre, negocio, conPreguntas: armarPreguntas(brief) }) : acuseSinPreguntas({ nombre, negocio });
      const problemas = revisarRespuesta(cuerpo, { entrante: texto });
      let envio: EnvioConsulta;
      if (problemas.length > 0) envio = "BORRADOR";
      else {
        const hoy = await prisma.consulta.count({ where: { tenantId, email: email || "-sin-mail-", createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
        envio = email && hoy <= TOPE_POR_MAIL_Y_DIA ? await enviarPorMail(tenantId, email, `Recibimos tu consulta — ${negocio}`, cuerpo) : "SIMULADO";
      }
      await prisma.consultaMensaje.create({ data: { tenantId, consultaId: creada.id, direccion: "SALIENTE", origen: "PLANTILLA", texto: cuerpo, envio, problemas } });
      respuesta = envio;
    }
  } catch (e) {
    // Perder la consulta es peor que no contestarla: queda registrada y una persona la ve.
    console.error("[consultas] no se pudo registrar el acuse", e instanceof Error ? e.message : e);
  }

  try {
    const aviso = c.intencion === "ESCALAR" ? `Consulta que hay que atender ya (${c.motivos.join(", ")}): ${nombre || "un contacto"} por ${d.canal.toLowerCase()}` : `Nueva consulta de ${nombre || "un contacto"} por ${d.canal.toLowerCase()}`;
    await avisar(prisma, { tenantId, destinatarios: await usuariosParaConsultas(tenantId), tipo: "consulta", texto: aviso, enlace: `/admin/proyectos/consultas/${creada.id}` });
  } catch (e) {
    console.error("[consultas] no se pudo avisar al equipo", e instanceof Error ? e.message : e);
  }
  return { ok: true, id: creada.id, intencion: c.intencion, respuesta };
}

/** El negocio de este host, sólo si es una productora: el formulario público no abre consultas en cualquier negocio. */
export async function tenantDeConsultas(host: string | null): Promise<string | null> {
  try {
    const id = await resolveTenantId(host);
    const t = await basePrisma.tenant.findUnique({ where: { id }, select: { blueprintId: true } });
    return t?.blueprintId === "productora" ? id : null;
  } catch {
    return null;
  }
}
