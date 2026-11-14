// Alta de UNA persona en un negocio, desde la consola de GSG (pestaña Personas de la ficha).
//
// POR QUÉ. La consola sólo sabía resetear la clave del dueño; el resto de las personas las daba de
// alta el dueño desde su panel. El día de las pruebas reales hacía falta dar de alta a dos dueños
// de entrada y no había cómo. Esto cierra ese hueco SIN abrir uno nuevo:
//   · mismo criterio que el alta del panel (`createUser`): nombre, email con arroba, rol de la lista;
//   · respeta el TOPE de usuarios del plan, en la misma transacción que crea al usuario;
//   · la contraseña se genera acá, sólo se guarda su hash y sale ÚNICAMENTE por mail al titular
//     (GSG-SEG-014): no se devuelve ni va a la auditoría (mismo molde que `resetOwnerPasswordCore`).
//     El mail es el último paso de la transacción: si no sale, se tira `ClaveNoEnviada` y el alta
//     se deshace entera (no nace una persona con una clave que nadie tiene);
//   · queda con cambio forzado en el primer ingreso (si la columna existe);
//   · el email es único por negocio, también contra los dados de baja (así lo pide el schema).
// PURO e INYECTABLE: recibe un puerto, así el test lo ejecuta sin base. La action real (operator-actions.ts)
// le pasa uno armado sobre la transacción del negocio y pone antes la guardia del operador (CH sólo con
// el dueño de GSG).

import { hashPassword, generateStrongPassword } from "@/lib/auth-password";
import { CambioObligatorioInactivo } from "@/lib/must-change-password";
import { ClaveNoEnviada, enmascararEmail, type EnvioClave } from "@/lib/clave-temporal-mail";

export const ROLES_DE_ALTA = ["OWNER", "RECEPTION", "PROFESSIONAL"] as const;
export type RolDeAlta = (typeof ROLES_DE_ALTA)[number];

export interface AltaPersonaPort {
  /** ¿Ya hay una fila con ese email en el negocio (activa o dada de baja)? */
  existeEmail(tenantId: string, email: string): Promise<boolean>;
  /** ¿Entra un usuario activo más en el plan? Toma el candado de usuarios del negocio. */
  decidirTope(tenantId: string): Promise<{ ok: true } | { ok: false; motivo: string }>;
  /** Crea al usuario con el HASH (nunca el claro). */
  crear(data: { tenantId: string; name: string; email: string; role: RolDeAlta; passwordHash: string }): Promise<{ id: string }>;
  /** Marca el cambio forzado; `persisted:false` si la columna no existe en la base. */
  setMustChange(userId: string, value: boolean): Promise<{ persisted: boolean }>;
  audit(entry: { tenantId: string; actor: string; action: string; entity: string; entityId: string; changes: unknown }): Promise<void>;
  /** Manda la provisoria por mail al titular. El único lugar por donde sale el claro. */
  enviarClave(destino: { email: string; nombre: string }, clave: string): Promise<EnvioClave>;
}

export type AltaPersonaResult =
  | { ok: true; email: string; enviadaA: string; name: string; role: RolDeAlta }
  | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarAltaPersona(entrada: { name: string; email: string; role: string }):
  | { ok: true; name: string; email: string; role: RolDeAlta }
  | { ok: false; error: string } {
  const name = String(entrada.name ?? "").trim();
  const email = String(entrada.email ?? "").trim().toLowerCase();
  const role = String(entrada.role ?? "");
  if (!name) return { ok: false, error: "Falta el nombre de la persona." };
  if (!EMAIL.test(email)) return { ok: false, error: "El email no tiene un formato válido (nombre@dominio.com). Es con el que entra." };
  if (!(ROLES_DE_ALTA as readonly string[]).includes(role)) return { ok: false, error: "El rol tiene que ser Dueño, Recepción o Profesional." };
  return { ok: true, name, email, role: role as RolDeAlta };
}

export async function altaPersonaCore(
  port: AltaPersonaPort,
  { tenantId, operatorSubject, entrada }: { tenantId: string; operatorSubject: string; entrada: { name: string; email: string; role: string } },
): Promise<AltaPersonaResult> {
  if (!tenantId) return { ok: false, error: "Falta el negocio." };
  const v = validarAltaPersona(entrada);
  if (!v.ok) return v;

  if (await port.existeEmail(tenantId, v.email)) {
    return { ok: false, error: `Ya hay una persona con el email ${v.email} en este negocio (puede estar dada de baja). Si es la misma, se le resetea la contraseña desde su panel.` };
  }

  const tope = await port.decidirTope(tenantId);
  if (!tope.ok) return { ok: false, error: `El plan del negocio no admite una persona más: ${tope.motivo}` };

  const password = generateStrongPassword();
  const passwordHash = await hashPassword(password);
  const creado = await port.crear({ tenantId, name: v.name, email: v.email, role: v.role, passwordHash });
  // Falla cerrado: sin el cambio obligatorio, la provisoria quedaría válida para siempre. Se tira
  // (no se devuelve) para que la transacción del negocio deshaga el alta recién creada.
  const { persisted } = await port.setMustChange(creado.id, true);
  if (!persisted) throw new CambioObligatorioInactivo();

  await port.audit({
    tenantId,
    actor: `operator:${operatorSubject}`,
    action: "create",
    entity: "User",
    entityId: creado.id,
    changes: { name: v.name, email: v.email, role: v.role, origen: "consola", forcedChangePersisted: true, entrega: "mail" },
  });

  // Último paso, adentro de la transacción: sin mail, el alta se deshace entera.
  const envio = await port.enviarClave({ email: v.email, nombre: v.name }, password);
  if (!envio.enviado) throw new ClaveNoEnviada(envio.motivo, enmascararEmail(v.email));

  return { ok: true, email: v.email, enviadaA: enmascararEmail(v.email), name: v.name, role: v.role };
}
