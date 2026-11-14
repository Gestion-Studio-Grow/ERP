// Núcleo PURO e INYECTABLE del reset de contraseña del OWNER. Separado del Server Action
// (`operator-actions.ts`) para poder testearlo sin tocar la DB ni la red: recibe un PORT con las
// operaciones que necesita (incluido el envío del mail), así los tests le pasan un doble en memoria
// y el action real le pasa uno armado sobre la transacción del negocio y Resend.
//
// INVARIANTES que garantiza (y que los tests verifican):
//   - la contraseña en claro se GENERA acá (alta entropía) y sale SÓLO por `enviarClave` (el mail al
//     titular, GSG-SEG-014). No se devuelve: la pantalla muestra a dónde fue, enmascarado;
//   - nunca se pasa a `audit()` ni a `setPasswordHash` en claro (sólo su hash);
//   - FALLA CERRADO dos veces:
//       · marca el cambio forzado ANTES de tocar la contraseña; si la base no tiene la columna,
//         devuelve error y la contraseña vieja queda intacta;
//       · el mail es el ÚLTIMO paso: si no sale, TIRA `ClaveNoEnviada` para que la transacción del
//         llamador se deshaga entera (hash anterior intacto, sin flag, sin auditoría de reset). El
//         llamador deja la auditoría de la falla en otra transacción.

import { hashPassword, generateStrongPassword } from "@/lib/auth-password";
import { AUDIT_ACTION_OWNER_RESET, CAMBIO_OBLIGATORIO_INACTIVO } from "@/lib/must-change-password";
import { ClaveNoEnviada, enmascararEmail, type EnvioClave } from "@/lib/clave-temporal-mail";

export interface OwnerResetPort {
  // OWNER activo más antiguo del tenant (el dueño original), o null si no hay.
  findOwner(tenantId: string): Promise<{ id: string; email: string; name: string } | null>;
  // Persiste SOLO el hash (nunca el claro).
  setPasswordHash(userId: string, passwordHash: string): Promise<void>;
  // Marca/limpia el cambio forzado; `persisted:false` si la columna no existe (Gate 2 sin aplicar).
  setMustChange(userId: string, value: boolean): Promise<{ persisted: boolean }>;
  // Registra el evento de auditoría (sin el valor de la contraseña).
  audit(entry: {
    tenantId: string;
    actor: string;
    action: string;
    entity: string;
    entityId: string;
    changes: unknown;
  }): Promise<void>;
  // Manda la provisoria por mail al titular. El único lugar por donde sale el claro.
  enviarClave(destino: { email: string; nombre: string }, clave: string): Promise<EnvioClave>;
}

export type OwnerResetResult =
  | { ok: true; email: string; enviadaA: string }
  | { ok: false; error: string };

export async function resetOwnerPasswordCore(
  port: OwnerResetPort,
  {
    tenantId,
    operatorSubject,
    actor,
    extra,
  }: {
    tenantId: string;
    operatorSubject: string;
    /** Actor de la auditoría; por defecto `operator:<sujeto>`. El reseteo pendiente usa `system:…`. */
    actor?: string;
    /** Campos extra para la auditoría (p. ej. la clave del reseteo pendiente). Nunca la contraseña. */
    extra?: Record<string, string>;
  },
): Promise<OwnerResetResult> {
  if (!tenantId) return { ok: false, error: "Falta el tenant." };

  const owner = await port.findOwner(tenantId);
  if (!owner) {
    return { ok: false, error: "Este tenant no tiene un OWNER activo. Revisá los usuarios del tenant." };
  }

  // Primero el flag: si no se puede marcar, no se toca la contraseña (regla del dueño).
  const { persisted } = await port.setMustChange(owner.id, true);
  if (!persisted) return { ok: false, error: CAMBIO_OBLIGATORIO_INACTIVO };

  const password = generateStrongPassword();
  const passwordHash = await hashPassword(password);
  await port.setPasswordHash(owner.id, passwordHash);

  const enviadaA = enmascararEmail(owner.email);
  await port.audit({
    tenantId,
    actor: actor ?? `operator:${operatorSubject}`,
    action: AUDIT_ACTION_OWNER_RESET,
    entity: "User",
    entityId: owner.id,
    changes: { forcedChangePersisted: true, entrega: "mail", enviadaA, ...(extra ?? {}) },
  });

  // Último paso, adentro de la transacción: si el mail no sale, se deshace todo lo anterior.
  const envio = await port.enviarClave({ email: owner.email, nombre: owner.name }, password);
  if (!envio.enviado) throw new ClaveNoEnviada(envio.motivo, enviadaA);

  return { ok: true, email: owner.email, enviadaA };
}
