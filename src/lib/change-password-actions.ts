"use server";

// Cambio de la PROPIA contraseña del usuario del panel (portón de cambio forzado en /admin).
// Se dispara cuando el OWNER ingresa con una contraseña temporal reseteada por el operador y el
// sistema lo obliga a definir una nueva. Reglas:
//   - re-verifica la contraseña actual (la temporal) → nadie cambia la de otro sobre una sesión;
//   - valida la fuerza mínima (fuente única: `validatePasswordStrength`);
//   - guarda solo el hash (scrypt) y BAJA el flag de cambio forzado;
//   - audita el cambio (actor real de la sesión), NUNCA el valor.
// Toda la validación se re-corre en el server (fuente de verdad); el cliente solo da feedback.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserConCambioPendiente } from "@/lib/authz";
import { verifyPassword, hashPassword } from "@/lib/auth-password";
import { validatePasswordStrength } from "@/lib/password-policy";
import { clearMustChangePassword } from "@/lib/must-change-password";
import { auditAdmin } from "@/lib/audit-core";
import { getProductoContexto } from "@/lib/producto";
import { productoHome } from "@/lib/producto-identidad";
import { createSessionToken } from "@/lib/auth";
import { ponerCookieDeSesion } from "@/lib/ingreso.server";
import { tienePin } from "@/lib/sesion-pin.server";

const CHANGE_PATH = "/admin/cambiar-password";

function backWith(status: string): never {
  redirect(`${CHANGE_PATH}?status=${encodeURIComponent(status)}`);
}

export async function changeOwnPassword(formData: FormData) {
  const user = await requireUserConCambioPendiente();
  const current = String(formData.get("currentPassword") || "");
  const next = String(formData.get("newPassword") || "");
  const confirm = String(formData.get("confirmPassword") || "");

  const row = await prisma.user.findFirst({
    where: { id: user.id, tenantId: user.tenantId },
    select: { passwordHash: true },
  });
  if (!row) backWith("error");

  // La contraseña actual (la temporal) tiene que ser correcta.
  if (!(await verifyPassword(current, row!.passwordHash))) backWith("error_current");
  // La nueva no puede ser la misma que la temporal.
  if (next === current) backWith("error_same");
  // Confirmación tiene que coincidir.
  if (next !== confirm) backWith("error_mismatch");
  // Fuerza mínima.
  if (!validatePasswordStrength(next).ok) backWith("error_weak");

  const passwordHash = await hashPassword(next);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await clearMustChangePassword({ id: user.id, tenantId: user.tenantId });

  // Se audita el cambio, NUNCA la contraseña.
  await auditAdmin({ action: "change_own_password", entity: "User", entityId: user.id });

  // Acaba de comprobar su contraseña: la sesión se reemite con el ingreso en «ahora» (habilita elegir el PIN).
  await ponerCookieDeSesion(await createSessionToken(user.id));

  // Ya con contraseña definitiva: a la casa del producto (igual criterio que el login), pasando por elegir el PIN de
  // desbloqueo si todavía no tiene (sesion-pin.ts; se puede saltear).
  const { producto } = await getProductoContexto();
  const home = productoHome(producto);
  if (!(await tienePin(user.id, user.tenantId).catch(() => true))) {
    redirect(`/admin/definir-pin?next=${encodeURIComponent(home)}`);
  }
  redirect(home);
}
