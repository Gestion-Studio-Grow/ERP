"use server";

// ============================================================================
// GESTIÓN DE EVENTOS — escrituras de Calendario, Proveedores, Equipo, Avisos y Portal. Cada una comprueba el permiso en el
// servidor y que el registro sea de este negocio: esconder un botón no protege nada.
// Avisos y preferencias son de la propia persona: no dependen de un módulo, y sólo tocan filas con su userId.
// ============================================================================

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin, auditPublic } from "@/lib/audit-core";
import { mensajeDeProveedor, validateSupplierInput } from "@/lib/suppliers/supplier";
import { fechaCorta, leerNumero } from "./core";
import { actorActual, avisar, exigirEditar, proyectoVisible, puede, registrarCambio, type Actor } from "./gestion.server";
import { COLUMNAS_OCULTAS_BASE, MONEDAS, permisoDe, ROLES_GESTION, RUBROS, TIPOS_AVISO, type ModuloGestion, type RolGestion } from "./gestion-core";
import { entre, matrizDelFormulario, respuestaDePresentacion } from "./gestion-lecturas-core";

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const RAIZ = "/admin/proyectos";
const txt = (v: FormDataEntryValue | null, max = 500): string => String(v ?? "").trim().slice(0, max);
const esMail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

async function exigirAlguno(modulos: readonly ModuloGestion[]): Promise<Actor> {
  const a = await actorActual();
  if (!modulos.some((m) => puede(a, m, "editar"))) throw new Error("No tenés permiso para hacer esto.");
  return a;
}

// ── Calendario ──────────────────────────────────────────────────────────────

const TIPOS_REUNION = ["REUNION", "MONTAJE", "EVENTO_TENTATIVO"];

export async function crearReunion(formData: FormData): Promise<Resultado> {
  const a = await exigirAlguno(["pipeline", "diseno"]);
  const titulo = txt(formData.get("titulo"), 160);
  if (!titulo) return { ok: false, error: "Poné un título." };
  const cuando = txt(formData.get("fecha"), 16);
  // La hora que se escribe es la de Argentina, sea cual sea la zona del servidor.
  const fecha = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(cuando) ? new Date(`${cuando}:00-03:00`) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) return { ok: false, error: "Elegí fecha y hora." };
  const tipo = txt(formData.get("tipo"), 20);
  const proyectoId = txt(formData.get("proyectoId"), 40) || null;
  if (proyectoId && !(await proyectoVisible(a, proyectoId))) return { ok: false, error: "Ese proyecto no está disponible." };
  await tenantTransaction(async (tx) => {
    const r = await tx.proyectoReunion.create({
      data: { tenantId: a.tenantId, proyectoId, titulo, tipo: TIPOS_REUNION.includes(tipo) ? tipo : "REUNION", fecha, lugar: txt(formData.get("lugar"), 300), creadaPor: a.nombre },
      select: { id: true },
    });
    await registrarCambio(tx, { tenantId: a.tenantId, proyectoId, entidad: "Reunión", entidadId: r.id, campo: "alta", despues: titulo, autor: a.nombre });
    if (proyectoId) {
      const equipo = await tx.proyectoEquipo.findMany({ where: { tenantId: a.tenantId, proyectoId }, select: { persona: { select: { userId: true } } } });
      const destinatarios = equipo.map((e) => e.persona.userId).filter((u): u is string => !!u && u !== a.user.id);
      await avisar(tx, { tenantId: a.tenantId, destinatarios, tipo: "deadline", texto: `Nueva reunión: ${titulo}, el ${fechaCorta(fecha)}`, enlace: `${RAIZ}/${proyectoId}` });
    }
  });
  revalidatePath(`${RAIZ}/calendario`);
  revalidatePath(`${RAIZ}/inicio`);
  return { ok: true };
}

// ── Proveedores ─────────────────────────────────────────────────────────────

/** Cambiar el % de anticipo no toca cuotas: las de un proyecto confirmado se recalculan cuando se vuelve a guardar su ficha. */
export async function guardarProveedor(formData: FormData): Promise<Resultado<{ id: string }>> {
  const a = await exigirEditar("proveedores");
  const { tenantId } = a;
  const id = txt(formData.get("id"), 40) || null;
  const v = validateSupplierInput({ name: txt(formData.get("name"), 120), taxId: txt(formData.get("taxId"), 20) || null, phone: txt(formData.get("phone"), 40) || null, email: txt(formData.get("email"), 160) || null });
  if (!v.ok) return { ok: false, error: mensajeDeProveedor(v.error) };
  const { name, taxId, phone, email } = v.value;
  const rubro = txt(formData.get("rubro"), 60);
  const moneda = txt(formData.get("moneda"), 3);
  const ficha = {
    rubro: (RUBROS as readonly string[]).includes(rubro) ? rubro : null,
    ciudad: txt(formData.get("ciudad"), 80) || null,
    condiciones: txt(formData.get("condiciones"), 300),
    anticipoPct: entre(leerNumero(String(formData.get("anticipoPct") ?? "")), 0, 100, 50),
    evaluacion: entre(leerNumero(String(formData.get("evaluacion") ?? "")), 1, 5, 4),
    moneda: (MONEDAS as readonly string[]).includes(moneda) ? moneda : "ARS",
    notas: txt(formData.get("notas"), 2000),
  };
  if (id) {
    const previo = await prisma.supplier.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!previo) return { ok: false, error: "Ese proveedor no está disponible." };
  }
  try {
    const guardado = await tenantTransaction(async (tx) => {
      let supplierId = id;
      if (id) {
        await tx.supplier.updateMany({ where: { id, tenantId }, data: { name, taxId, phone, email } });
      } else {
        supplierId = (await tx.supplier.create({ data: { tenantId, name, taxId, phone, email }, select: { id: true } })).id;
      }
      const previa = id ? await tx.proyectoProveedorFicha.findFirst({ where: { supplierId: id, tenantId }, select: { id: true, anticipoPct: true, evaluacion: true } }) : null;
      if (previa) {
        await tx.proyectoProveedorFicha.updateMany({ where: { id: previa.id, tenantId }, data: ficha });
        await registrarCambio(tx, { tenantId, entidad: "Proveedor", entidadId: id, campo: `${name}: % de anticipo`, antes: previa.anticipoPct, despues: ficha.anticipoPct, autor: a.nombre });
        await registrarCambio(tx, { tenantId, entidad: "Proveedor", entidadId: id, campo: `${name}: evaluación`, antes: previa.evaluacion, despues: ficha.evaluacion, autor: a.nombre });
      } else {
        await tx.proyectoProveedorFicha.create({ data: { tenantId, supplierId: supplierId!, ...ficha } });
        if (!id) await registrarCambio(tx, { tenantId, entidad: "Proveedor", entidadId: supplierId, campo: "alta", despues: name, autor: a.nombre });
      }
      return supplierId!;
    });
    await auditAdmin({ action: id ? "proyecto.proveedor.editar" : "proyecto.proveedor", entity: "Supplier", entityId: guardado, changes: { name } });
    revalidatePath(`${RAIZ}/proveedores`);
    revalidatePath(`${RAIZ}/proveedores/${guardado}`);
    return { ok: true, id: guardado };
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") return { ok: false, error: "Ya hay un proveedor con ese CUIT: buscalo en la lista." };
    throw err;
  }
}

/** Baja lógica: un proveedor con historial nunca se borra. */
export async function cambiarEstadoProveedor(formData: FormData): Promise<void> {
  const a = await exigirEditar("proveedores");
  const id = txt(formData.get("id"), 40);
  const active = txt(formData.get("activo"), 1) === "1";
  const r = await prisma.supplier.updateMany({ where: { id, tenantId: a.tenantId }, data: { active } });
  if (r.count === 0) return;
  await registrarCambio(prisma, { tenantId: a.tenantId, entidad: "Proveedor", entidadId: id, campo: "estado", antes: active ? "De baja" : "Activo", despues: active ? "Activo" : "De baja", autor: a.nombre });
  await auditAdmin({ action: "proyecto.proveedor.estado", entity: "Supplier", entityId: id, changes: { active } });
  revalidatePath(`${RAIZ}/proveedores`);
  revalidatePath(`${RAIZ}/proveedores/${id}`);
}

// ── Equipo ──────────────────────────────────────────────────────────────────

const esRol = (v: string): v is RolGestion => (ROLES_GESTION as readonly string[]).includes(v);

export async function guardarPersona(formData: FormData): Promise<Resultado> {
  const a = await exigirEditar("equipo");
  const { tenantId } = a;
  const id = txt(formData.get("id"), 40) || null;
  const nombre = txt(formData.get("nombre"), 120);
  if (!nombre) return { ok: false, error: "Poné el nombre." };
  const email = txt(formData.get("email"), 160).toLowerCase();
  if (email && !esMail(email)) return { ok: false, error: "Revisá el mail." };
  const rol = txt(formData.get("rol"), 20);
  if (!esRol(rol)) return { ok: false, error: "Elegí un rol." };
  const previa = id ? await prisma.proyectoPersona.findFirst({ where: { id, tenantId }, select: { id: true, nombre: true, email: true, rol: true, puesto: true, sueldoBase: true, facturaA: true, userId: true } }) : null;
  if (id && !previa) return { ok: false, error: "Esa persona no está disponible." };
  // Dirección ve todo: sólo otra Dirección puede dar ese rol o tocar a quien lo tiene.
  if (a.rol !== "DIRECCION" && (rol === "DIRECCION" || previa?.rol === "DIRECCION")) return { ok: false, error: "Sólo Dirección puede cambiar a alguien de Dirección." };
  if (previa?.userId === a.user.id && previa.rol !== rol) return { ok: false, error: "No podés cambiar tu propio rol: que lo haga otra persona de Dirección." };

  let userId: string | null = null;
  if (formData.get("vincular")) {
    if (!email) return { ok: false, error: "Para vincular la cuenta hace falta el mail." };
    const cuenta = await prisma.user.findFirst({ where: { tenantId, email: { equals: email, mode: "insensitive" }, active: true, deletedAt: null }, select: { id: true } });
    if (!cuenta) return { ok: false, error: "No hay una cuenta con ese mail en este negocio. Se da de alta en Usuarios." };
    userId = cuenta.id;
  }
  // Sin permiso de liquidaciones, el sueldo no se escribe aunque venga en el formulario.
  const sueldoBase = puede(a, "liquidaciones", "editar") ? entre(leerNumero(String(formData.get("sueldoBase") ?? "")), 0, 1e12, 0) : previa?.sueldoBase ?? 0;
  const datos = { nombre, email: email || null, rol, puesto: txt(formData.get("puesto"), 120), facturaA: txt(formData.get("facturaA"), 160), sueldoBase, userId };
  try {
    await tenantTransaction(async (tx) => {
      if (previa) {
        await tx.proyectoPersona.updateMany({ where: { id: previa.id, tenantId }, data: datos });
        for (const [campo, etiqueta] of [["nombre", "nombre"], ["email", "mail"], ["rol", "rol"], ["puesto", "puesto"], ["facturaA", "factura a"], ["sueldoBase", "sueldo"]] as const) {
          await registrarCambio(tx, { tenantId, entidad: "Persona", entidadId: previa.id, campo: `${nombre}: ${etiqueta}`, antes: previa[campo], despues: datos[campo], autor: a.nombre });
        }
        await registrarCambio(tx, { tenantId, entidad: "Persona", entidadId: previa.id, campo: `${nombre}: cuenta`, antes: previa.userId ? "Vinculada" : "Sin cuenta", despues: userId ? "Vinculada" : "Sin cuenta", autor: a.nombre });
      } else {
        const p = await tx.proyectoPersona.create({ data: { tenantId, ...datos }, select: { id: true } });
        await registrarCambio(tx, { tenantId, entidad: "Persona", entidadId: p.id, campo: "alta", despues: nombre, autor: a.nombre });
      }
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") return { ok: false, error: "Esa cuenta ya está vinculada a otra persona." };
    throw err;
  }
  revalidatePath(`${RAIZ}/equipo`);
  return { ok: true };
}

export async function cambiarEstadoPersona(formData: FormData): Promise<void> {
  const a = await exigirEditar("equipo");
  const id = txt(formData.get("id"), 40);
  const activa = txt(formData.get("activa"), 1) === "1";
  const p = await prisma.proyectoPersona.findFirst({ where: { id, tenantId: a.tenantId }, select: { id: true, nombre: true, rol: true, userId: true } });
  if (!p) return;
  if (p.userId === a.user.id) throw new Error("No podés darte de baja a vos.");
  if (p.rol === "DIRECCION" && a.rol !== "DIRECCION") throw new Error("Sólo Dirección puede cambiar a alguien de Dirección.");
  await prisma.proyectoPersona.updateMany({ where: { id, tenantId: a.tenantId }, data: { activa } });
  await registrarCambio(prisma, { tenantId: a.tenantId, entidad: "Persona", entidadId: id, campo: `${p.nombre}: estado`, antes: activa ? "De baja" : "Activa", despues: activa ? "Activa" : "De baja", autor: a.nombre });
  revalidatePath(`${RAIZ}/equipo`);
}

/** Sólo escribe lo que cambió. Dirección es fija, y nadie se sube a sí mismo los permisos salvo Dirección. */
export async function guardarPermisos(formData: FormData): Promise<void> {
  const a = await exigirEditar("equipo");
  const { tenantId } = a;
  const filas = matrizDelFormulario((c) => formData.get(c) !== null).filter((f) => a.rol === "DIRECCION" || f.rol !== a.rol);
  const guardados = await prisma.proyectoPermiso.findMany({ where: { tenantId }, select: { rol: true, modulo: true, ver: true, editar: true, columnasOcultas: true } });
  await tenantTransaction(async (tx) => {
    for (const f of filas) {
      const antes = permisoDe(f.rol, f.modulo as ModuloGestion, guardados);
      const fila = guardados.find((g) => g.rol === f.rol && g.modulo === f.modulo);
      const ocultasAntes = f.rol === "DIRECCION" ? [] : Array.isArray(fila?.columnasOcultas) ? (fila.columnasOcultas as string[]) : [...COLUMNAS_OCULTAS_BASE[f.rol]];
      const cambianOcultas = !!f.columnasOcultas && [...ocultasAntes].sort().join() !== [...f.columnasOcultas].sort().join();
      if (antes.ver === f.ver && antes.editar === f.editar && !cambianOcultas) continue;
      const columnas = f.columnasOcultas ? { columnasOcultas: f.columnasOcultas } : {};
      await tx.proyectoPermiso.upsert({
        where: { tenantId_rol_modulo: { tenantId, rol: f.rol, modulo: f.modulo } },
        create: { tenantId, rol: f.rol, modulo: f.modulo, ver: f.ver, editar: f.editar, ...columnas },
        update: { ver: f.ver, editar: f.editar, ...columnas },
      });
      const texto = (p: { ver: boolean; editar: boolean }) => (p.editar ? "Ver y editar" : p.ver ? "Ver" : "Sin acceso");
      await registrarCambio(tx, { tenantId, entidad: "Permiso", campo: `${f.rol} · ${f.modulo}`, antes: texto(antes), despues: texto(f), autor: a.nombre });
      if (cambianOcultas) await registrarCambio(tx, { tenantId, entidad: "Permiso", campo: `${f.rol} · columnas ocultas`, antes: ocultasAntes.join(", ") || "Ninguna", despues: f.columnasOcultas!.join(", ") || "Ninguna", autor: a.nombre });
    }
  });
  revalidatePath(`${RAIZ}`, "layout");
  redirect(`${RAIZ}/equipo?tab=permisos&ok=1`);
}

// ── Avisos y preferencias: de la propia persona ─────────────────────────────

export async function marcarAvisoLeido(formData: FormData): Promise<void> {
  const a = await actorActual();
  await prisma.proyectoAviso.updateMany({ where: { id: txt(formData.get("id"), 40), tenantId: a.tenantId, destinatario: a.user.id, leidoEl: null }, data: { leidoEl: new Date() } });
  revalidatePath(RAIZ, "layout");
}

export async function marcarTodosLeidos(): Promise<void> {
  const a = await actorActual();
  await prisma.proyectoAviso.updateMany({ where: { tenantId: a.tenantId, destinatario: a.user.id, leidoEl: null }, data: { leidoEl: new Date() } });
  revalidatePath(RAIZ, "layout");
}

/** El envío por mail de estos avisos no está conectado: acá no se guarda esa columna. */
export async function guardarPreferenciasAvisos(formData: FormData): Promise<void> {
  const a = await actorActual();
  const { tenantId } = a;
  const userId = a.user.id;
  await tenantTransaction(async (tx) => {
    for (const { id: tipo } of TIPOS_AVISO) {
      const enSistema = formData.get(`sistema:${tipo}`) !== null;
      await tx.proyectoAvisoPref.upsert({ where: { tenantId_userId_tipo: { tenantId, userId, tipo } }, create: { tenantId, userId, tipo, enSistema }, update: { enSistema } });
    }
  });
  redirect(`${RAIZ}/configuracion?ok=1`);
}

// ── Portal del cliente (sin login: la llave es el token) ────────────────────

export async function responderPresentacion(d: { token: string; presentacionId: string; aprueba: boolean; nombre: string; comentario?: string }): Promise<Resultado> {
  const tenantId = await getCurrentTenantId();
  const clave = String(d.token ?? "");
  if (!/^[A-Za-z0-9_-]{20,}$/.test(clave)) return { ok: false, error: "El link no es válido." };
  const nombre = String(d.nombre ?? "").trim().slice(0, 120);
  if (!nombre) return { ok: false, error: "Escribí tu nombre para dejar constancia." };
  const comentario = String(d.comentario ?? "").trim().slice(0, 1000);
  if (!d.aprueba && !comentario) return { ok: false, error: "Contanos qué hay que cambiar." };
  const id = String(d.presentacionId ?? "");
  const pr = await prisma.proyectoPresentacion.findFirst({
    where: { id, tenantId, proyecto: { tenantId, tokenPortal: clave, perdidoEl: null } },
    select: { nombre: true, proyectoId: true, proyecto: { select: { nombre: true, equipo: { select: { persona: { select: { userId: true } } } } } } },
  });
  if (!pr) return { ok: false, error: "El link no es válido." };
  const respuesta = respuestaDePresentacion(d.aprueba, nombre, comentario, fechaCorta(new Date()));
  const ganada = await tenantTransaction(async (tx) => {
    // El estado va en el where: dos clics a la vez no responden dos veces.
    const r = await tx.proyectoPresentacion.updateMany({ where: { id, tenantId, estado: "ENVIADA" }, data: { estado: d.aprueba ? "APROBADA" : "CAMBIOS", respuesta } });
    if (r.count === 0) return false;
    await registrarCambio(tx, { tenantId, proyectoId: pr.proyectoId, entidad: "Presentación", entidadId: id, campo: `${pr.nombre}: respuesta del cliente`, antes: "Enviada", despues: respuesta, autor: nombre });
    const destinatarios = pr.proyecto.equipo.map((e) => e.persona.userId).filter((u): u is string => !!u);
    await avisar(tx, { tenantId, destinatarios, tipo: "aprobacion", texto: `${pr.proyecto.nombre}: ${pr.nombre}. ${respuesta}`, enlace: `${RAIZ}/${pr.proyectoId}` });
    return true;
  });
  if (!ganada) return { ok: false, error: "Esta presentación ya fue respondida. Recargá la página." };
  await auditPublic({ action: d.aprueba ? "proyecto.presentacion.aprobar" : "proyecto.presentacion.cambios", entity: "ProyectoPresentacion", entityId: id, changes: { nombre } });
  revalidatePath(`/portal/${clave}`);
  revalidatePath(`${RAIZ}/${pr.proyectoId}`);
  return { ok: true };
}
