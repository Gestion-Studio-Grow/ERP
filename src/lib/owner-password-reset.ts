// Núcleo PURO e INYECTABLE del reset de contraseña del OWNER (revelado único). Separado del
// Server Action (`operator-actions.ts`) para poder testearlo sin tocar la DB: recibe un PORT con
// las 4 operaciones que necesita, así los tests le pasan un doble en memoria y el action real le
// pasa uno armado sobre `operatorPrisma`.
//
// INVARIANTES que garantiza (y que los tests verifican):
//   - la contraseña en claro se GENERA acá (alta entropía) y se devuelve UNA vez; NUNCA se pasa a
//     `audit()` ni a `setPasswordHash` en claro (solo su hash);
//   - `audit()` recibe la acción canónica y un `changes` SIN el valor;
//   - marca cambio forzado; si el flag no se pudo persistir, lo reporta (`flagPending`).

import { hashPassword, generateStrongPassword } from "@/lib/auth-password";
import { AUDIT_ACTION_OWNER_RESET } from "@/lib/must-change-password";

export interface OwnerResetPort {
  // OWNER activo más antiguo del tenant (el dueño original), o null si no hay.
  findOwner(tenantId: string): Promise<{ id: string; email: string } | null>;
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
}

export type OwnerResetResult =
  | { ok: true; password: string; email: string; flagPending: boolean }
  | { ok: false; error: string };

export async function resetOwnerPasswordCore(
  port: OwnerResetPort,
  { tenantId, operatorSubject }: { tenantId: string; operatorSubject: string },
): Promise<OwnerResetResult> {
  if (!tenantId) return { ok: false, error: "Falta el tenant." };

  const owner = await port.findOwner(tenantId);
  if (!owner) {
    return { ok: false, error: "Este tenant no tiene un OWNER activo. Revisá los usuarios del tenant." };
  }

  const password = generateStrongPassword();
  const passwordHash = await hashPassword(password);
  await port.setPasswordHash(owner.id, passwordHash);

  const { persisted } = await port.setMustChange(owner.id, true);

  await port.audit({
    tenantId,
    actor: `operator:${operatorSubject}`,
    action: AUDIT_ACTION_OWNER_RESET,
    entity: "User",
    entityId: owner.id,
    changes: { forcedChangePersisted: persisted },
  });

  return { ok: true, password, email: owner.email, flagPending: !persisted };
}
