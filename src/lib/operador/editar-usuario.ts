// Edición de UNA persona de un negocio desde la consola de GSG (pestaña Personas de la ficha): rol, nombre,
// ficha de profesional vinculada y activo/baja.
//
// POR QUÉ. La consola daba de alta y reseteaba la clave del dueño, pero un rol mal elegido en el alta, o una
// persona que se fue, sólo se arreglaba desde el panel del dueño (o desde la base). Esto lo resuelve SIN abrir
// un hueco nuevo, con las MISMAS reglas que el panel (`user-actions.ts`):
//   · sólo una persona de ESTE negocio y no borrada (`deletedAt`); un id de otro negocio no existe acá;
//   · el rol es uno de la lista; el nombre, recortado y no vacío;
//   · nunca deja el negocio con 0 dueños activos (bajar de rol o dar de baja al último → se niega). El conteo
//     se hace con el candado de usuarios del negocio tomado (el mismo del alta y del tope del plan), así dos
//     ediciones a la vez no pueden bajar cada una a uno de los dos últimos dueños;
//   · reactivar suma un usuario activo: mismo tope del plan que el alta (R3-F3);
//   · la ficha de profesional pasa por `decidirVinculoProfesional` (sólo el rol Profesional, sólo fichas del
//     negocio, no la de otra persona); desvincular (`fichaId: null`) se acepta con cualquier rol. Si la base
//     rechaza por unicidad (P2002: otra pestaña la vinculó entre la lectura y la escritura) → «ficha-ocupada»;
//   · si el rol con que queda no es Profesional y conserva una ficha, se la desvincula (auditado);
//   · sin cambios reales → «nada-que-cambiar» (no se escribe ni se audita nada);
//   · audita antes/después SÓLO de los campos tocados. Nunca toca la contraseña ni el email.
// Dar de baja corta el acceso en el próximo pedido: la sesión del panel se valida contra la base en cada
// pedido (`getSesionDelPanel`, session.ts, exige `active: true`), y el rol también se lee de ahí.
// PURO e INYECTABLE: el puerto real lo arma la action (operator-actions.ts) sobre la transacción del negocio.

import { decidirVinculoProfesional, type FichaVinculable } from "@/app/admin/(dashboard)/usuarios/vinculo-profesional";

export const ROLES_EDITABLES = ["OWNER", "RECEPTION", "PROFESSIONAL"] as const;
export type RolEditable = (typeof ROLES_EDITABLES)[number];

export interface UsuarioEditable {
  id: string;
  name: string;
  role: string;
  active: boolean;
  professionalId: string | null;
  deletedAt: Date | null;
}

/** Los campos que esta edición puede escribir. Nunca `passwordHash` ni `email`. */
export interface CambiosDeUsuario {
  name?: string;
  role?: RolEditable;
  active?: boolean;
  professionalId?: string | null;
}

export interface EditarUsuarioPort {
  /** Candado de usuarios del negocio (el mismo del alta y del tope): serializa el conteo de dueños. */
  bloquearUsuarios(tenantId: string): Promise<void>;
  /** La persona por id DENTRO del negocio (borrada o no), o null. */
  leerUsuario(tenantId: string, userId: string): Promise<UsuarioEditable | null>;
  /** Dueños activos y no borrados del negocio. */
  contarOwnersActivos(tenantId: string): Promise<number>;
  /** Fichas de profesional del negocio (no borradas), con quién las tiene. */
  fichas(tenantId: string): Promise<FichaVinculable[]>;
  /** ¿Entra un usuario activo más en el plan? (para reactivar). */
  decidirTope(tenantId: string): Promise<{ ok: true } | { ok: false; motivo: string }>;
  actualizar(tenantId: string, userId: string, data: CambiosDeUsuario): Promise<void>;
  audit(entry: { tenantId: string; actor: string; action: string; entity: string; entityId: string; changes: unknown }): Promise<void>;
}

export type CodigoEditarUsuario =
  | "falta-negocio"
  | "no-encontrado"
  | "rol-invalido"
  | "nombre-vacio"
  | "ultimo-owner"
  | "vinculo-rol"
  | "ficha-no-encontrada"
  | "ficha-ocupada"
  | "sin-lugar-en-plan"
  | "nada-que-cambiar"
  // Sólo los pone la action (guardia, slug, base): el núcleo nunca los devuelve.
  | "sin-permiso"
  | "slug-no-coincide"
  | "error-de-base";

export type EditarUsuarioResult =
  | { ok: true; cambios: { antes: CambiosDeUsuario; despues: CambiosDeUsuario } }
  | { ok: false; codigo: CodigoEditarUsuario; error: string };

export interface EditarUsuarioInput {
  userId: string;
  rol?: string;
  nombre?: string;
  /** `undefined` = no tocar; `null` = desvincular. */
  fichaId?: string | null;
  activo?: boolean;
}

const MENSAJES: Record<Exclude<CodigoEditarUsuario, "sin-permiso" | "slug-no-coincide" | "error-de-base">, string> = {
  "falta-negocio": "Falta el negocio. No se tocó nada.",
  "no-encontrado": "Esa persona no es de este negocio (o fue borrada). No se tocó nada.",
  "rol-invalido": "El rol tiene que ser Dueño, Recepción o Profesional. No se tocó nada.",
  "nombre-vacio": "El nombre no puede quedar vacío. No se tocó nada.",
  "ultimo-owner":
    "Es el último dueño activo del negocio: si le cambiás el rol o lo das de baja, nadie podría administrar el panel. " +
    "Primero dale el rol de Dueño a otra persona. No se tocó nada.",
  "vinculo-rol": "Sólo una persona con rol Profesional puede tener una ficha de agenda. No se tocó nada.",
  "ficha-no-encontrada": "Esa ficha de profesional no existe en este negocio. No se tocó nada.",
  "ficha-ocupada": "Esa ficha de profesional ya la tiene otra persona. No se tocó nada.",
  "sin-lugar-en-plan": "El plan del negocio no admite una persona activa más. No se tocó nada.",
  "nada-que-cambiar": "No hay nada que cambiar: los datos son los mismos que ya tiene.",
};

function falla(codigo: keyof typeof MENSAJES, detalle?: string): EditarUsuarioResult {
  return { ok: false, codigo, error: detalle ? `${MENSAJES[codigo]} (${detalle})` : MENSAJES[codigo] };
}

/** Error de unicidad de Prisma (P2002), sin depender de la clase (el núcleo no conoce Prisma). */
function esUnicidad(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

export async function editarUsuarioCore(
  port: EditarUsuarioPort,
  { tenantId, operatorSubject, input }: { tenantId: string; operatorSubject: string; input: EditarUsuarioInput },
): Promise<EditarUsuarioResult> {
  if (!tenantId) return falla("falta-negocio");
  const userId = String(input.userId ?? "").trim();
  if (!userId) return falla("no-encontrado");

  // Validación de forma, antes de tocar la base.
  let rolPedido: RolEditable | undefined;
  if (input.rol !== undefined) {
    if (!(ROLES_EDITABLES as readonly string[]).includes(input.rol)) return falla("rol-invalido");
    rolPedido = input.rol as RolEditable;
  }
  let nombrePedido: string | undefined;
  if (input.nombre !== undefined) {
    nombrePedido = String(input.nombre).trim();
    if (!nombrePedido) return falla("nombre-vacio");
  }

  await port.bloquearUsuarios(tenantId);
  const u = await port.leerUsuario(tenantId, userId);
  if (!u || u.deletedAt) return falla("no-encontrado");

  // Sólo lo que de verdad cambia cuenta como cambio.
  const antes: CambiosDeUsuario = {};
  const despues: CambiosDeUsuario = {};
  if (nombrePedido !== undefined && nombrePedido !== u.name) {
    antes.name = u.name;
    despues.name = nombrePedido;
  }
  if (rolPedido !== undefined && rolPedido !== u.role) {
    antes.role = u.role as RolEditable;
    despues.role = rolPedido;
  }
  if (input.activo !== undefined && input.activo !== u.active) {
    antes.active = u.active;
    despues.active = input.activo;
  }
  if (input.fichaId !== undefined && (input.fichaId || null) !== u.professionalId) {
    antes.professionalId = u.professionalId;
    despues.professionalId = input.fichaId || null;
  }
  if (Object.keys(despues).length === 0) return falla("nada-que-cambiar");

  const rolFinal = despues.role ?? u.role;
  const activoFinal = despues.active ?? u.active;

  // Una ficha de agenda es sólo del rol Profesional (`decidirVinculoProfesional`). Si el rol con que queda no
  // es Profesional y conserva una ficha (p. ej. pasa de Profesional a Recepción sin tocar la ficha), se
  // desvincula en la misma escritura y queda dicho en la auditoría: si no, seguiría «teniendo» esa agenda y la
  // ficha quedaría ocupada para quien sí la atiende.
  let fichaDesvinculadaPorRol = false;
  if (rolFinal !== "PROFESSIONAL" && despues.professionalId === undefined && u.professionalId) {
    antes.professionalId = u.professionalId;
    despues.professionalId = null;
    fichaDesvinculadaPorRol = true;
  }

  // Nunca 0 dueños activos: si hoy es dueño activo y deja de serlo (por rol o por baja), tiene que haber otro.
  if (u.role === "OWNER" && u.active && (rolFinal !== "OWNER" || !activoFinal)) {
    if ((await port.contarOwnersActivos(tenantId)) <= 1) return falla("ultimo-owner");
  }

  // Vincular a una ficha: la regla del panel, con el rol con que queda. Desvincular se acepta siempre.
  if (despues.professionalId) {
    const d = decidirVinculoProfesional({
      usuario: { id: u.id, role: rolFinal },
      fichaId: despues.professionalId,
      fichas: await port.fichas(tenantId),
    });
    if (!d.ok) {
      return falla(
        d.status === "error_vinculo_rol" ? "vinculo-rol" : d.status === "error_vinculo_ocupado" ? "ficha-ocupada" : "ficha-no-encontrada",
      );
    }
  }

  // Reactivar suma un activo: el tope del plan, con el candado ya tomado.
  if (despues.active === true) {
    const tope = await port.decidirTope(tenantId);
    if (!tope.ok) return falla("sin-lugar-en-plan", tope.motivo);
  }

  try {
    await port.actualizar(tenantId, u.id, despues);
  } catch (e) {
    if (esUnicidad(e)) return falla("ficha-ocupada");
    throw e;
  }

  await port.audit({
    tenantId,
    actor: `operator:${operatorSubject}`,
    action: "update",
    entity: "User",
    entityId: u.id,
    changes: { antes, despues, origen: "consola", ...(fichaDesvinculadaPorRol ? { fichaDesvinculadaPorRol: true } : {}) },
  });

  return { ok: true, cambios: { antes, despues } };
}
