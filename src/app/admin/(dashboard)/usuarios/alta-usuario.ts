// Qué se acepta en el alta de un usuario del panel (`createUser`, user-actions.ts). PURO.
//
// Vive fuera de la action para poder EJECUTARLA en un test: la action necesita la sesión de la
// dueña, el negocio y la base; esta decisión, no. La action le pasa el formulario y si el
// negocio trabaja de mostrador (`getNegocioApps`), y hace lo que esto dice: o vuelve a la
// pantalla con el código del aviso, o da de alta con estos datos (y sólo con estos).
//
// El rol: sólo los que la pantalla ofrece en ESTE negocio (`rolAdmitidoEnAlta`, roles.ts). Sin
// agenda (mostrador) no hay Profesional, que entraría a una agenda vacía; tampoco por un POST a
// mano. En servicios (CH) se admiten los tres, como siempre. Lo prueba alta-usuario.test.ts.

import type { Role } from "@/lib/capabilities";
import { rolAdmitidoEnAlta } from "./roles";

export const MIN_PASSWORD_LENGTH = 8;

/** El código del aviso que muestra /admin/usuarios (`?status=`). */
export type RechazoDeAlta = "error_name" | "error_email_invalid" | "error_role" | "error_password_short";

export type AltaDeUsuario =
  | { ok: true; name: string; email: string; role: Role; password: string }
  | { ok: false; status: RechazoDeAlta };

export function validarAltaDeUsuario(formData: FormData, esMostrador: boolean): AltaDeUsuario {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const roleRaw = String(formData.get("role") || "");
  const password = String(formData.get("password") || "");

  if (!name) return { ok: false, status: "error_name" };
  if (!email || !email.includes("@")) return { ok: false, status: "error_email_invalid" };
  if (!rolAdmitidoEnAlta(roleRaw, esMostrador)) return { ok: false, status: "error_role" };
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, status: "error_password_short" };
  return { ok: true, name, email, role: roleRaw as Role, password };
}
