"use server";

// Gestión de usuarios del panel (ADR-017 Fase 2) — pantalla del OWNER en
// /admin/usuarios: listar, alta, baja/reactivación y reset de contraseña. Todo
// detrás de `users:manage` (solo OWNER) y auditado (`actor` real desde la
// sesión, ADR-017 §2.f). El hashing es scrypt de stdlib (auth-password.ts).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { auditAdmin } from "@/lib/audit-core";
import { hashPassword } from "@/lib/auth-password";
import { getNegocioApps } from "@/apps/contexto.server";
import { MIN_PASSWORD_LENGTH, validarAltaDeUsuario } from "@/app/admin/(dashboard)/usuarios/alta-usuario";
import {
  crearUsuarioSiEntra,
  DESTINO_SIN_LUGAR_USUARIOS,
  reactivarUsuarioSiEntra,
  type ResultadoAltaDeUsuario,
} from "@/lib/usuarios-del-plan";

const USERS_PATH = "/admin/usuarios";

// Redirige de vuelta a la pantalla con un código de feedback (banner). Nunca
// pasa el detalle crudo del error a la URL.
function backWith(status: string): never {
  redirect(`${USERS_PATH}?status=${encodeURIComponent(status)}`);
}

export async function getUsers() {
  await requireCapability("users:manage");
  const tenantId = await getCurrentTenantId();
  return prisma.user.findMany({
    where: { tenantId },
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      lastLoginAt: true,
      professionalId: true,
      deletedAt: true,
      createdAt: true,
    },
  });
}

export async function createUser(formData: FormData) {
  const actor = await requireCapability("users:manage");
  const tenantId = await getCurrentTenantId();

  // Qué se acepta lo decide `validarAltaDeUsuario` (alta-usuario.ts, probada): nombre, email,
  // contraseña y, sobre todo, el rol — sólo los que la pantalla ofrece en ESTE negocio. Sin
  // agenda (mostrador) no hay Profesional, que entraría a una agenda vacía; tampoco por un POST
  // a mano. En servicios (CH) se admiten los tres, como siempre.
  const { esMostrador } = await getNegocioApps(actor.role);
  const alta = validarAltaDeUsuario(formData, esMostrador);
  if (!alta.ok) backWith(alta.status);
  const { name, email, role, password } = alta;

  // Email único por tenant (schema @@unique). Chequeo previo por UX + defensa
  // ante la carrera con try/catch del constraint.
  const existing = await prisma.user.findFirst({ where: { tenantId, email } });
  if (existing) backWith("error_email_taken");

  const passwordHash = await hashPassword(password);
  // Tope de usuarios del plan (R3-F3): se cuenta y se crea en la misma transacción, con candado.
  // Sin plan del catálogo, o en CH, no hay tope. Quien choca va a "Tu plan", que dice el porqué.
  let resultado: ResultadoAltaDeUsuario;
  try {
    resultado = await crearUsuarioSiEntra({ data: { tenantId, name, email, role, passwordHash } });
  } catch {
    // P2002 u otro conflicto de unicidad que se coló entre el chequeo y el create.
    backWith("error_email_taken");
  }
  if (!resultado.ok) redirect(DESTINO_SIN_LUGAR_USUARIOS);
  const created = { id: resultado.id };

  await auditAdmin({
    action: "create",
    entity: "User",
    entityId: created.id,
    changes: { name, email, role },
  });

  revalidatePath(USERS_PATH);
  backWith("ok_created");
}

export async function setUserActive(formData: FormData) {
  const actor = await requireCapability("users:manage");
  const tenantId = await getCurrentTenantId();
  const userId = String(formData.get("userId") || "");
  const active = String(formData.get("active")) === "true";

  const target = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!target) backWith("error_not_found");

  // No podés darte de baja a vos misma (te dejaría sin acceso al panel).
  if (!active && target.id === actor.id) backWith("error_self_deactivate");

  // No se puede dar de baja al último OWNER activo: dejaría el panel sin dueño
  // (la puerta sin dueño que ADR-017 justamente vino a cerrar).
  if (!active && target.role === "OWNER") {
    const activeOwners = await prisma.user.count({
      where: { tenantId, role: "OWNER", active: true, deletedAt: null },
    });
    if (activeOwners <= 1) backWith("error_last_owner");
  }

  if (active && !target.active) {
    // Reactivar suma un usuario activo: mismo tope del plan que el alta (R3-F3).
    const d = await reactivarUsuarioSiEntra(tenantId, userId);
    if (!d.ok) redirect(DESTINO_SIN_LUGAR_USUARIOS);
  } else {
    await prisma.user.update({ where: { id: userId }, data: { active } });
  }
  await auditAdmin({
    action: active ? "reactivate" : "deactivate",
    entity: "User",
    entityId: userId,
    changes: { active },
  });

  revalidatePath(USERS_PATH);
  backWith(active ? "ok_reactivated" : "ok_deactivated");
}

export async function resetUserPassword(formData: FormData) {
  await requireCapability("users:manage");
  const tenantId = await getCurrentTenantId();
  const userId = String(formData.get("userId") || "");
  const password = String(formData.get("password") || "");

  if (password.length < MIN_PASSWORD_LENGTH) backWith("error_password_short");

  const target = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!target) backWith("error_not_found");

  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  // Se audita el reset, NUNCA la contraseña en sí.
  await auditAdmin({ action: "reset_password", entity: "User", entityId: userId });

  revalidatePath(USERS_PATH);
  backWith("ok_password_reset");
}
