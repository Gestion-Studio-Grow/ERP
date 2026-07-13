import { test } from "node:test";
import assert from "node:assert/strict";
import { resetOwnerPasswordCore, type OwnerResetPort } from "./owner-password-reset";
import { verifyPassword } from "./auth-password";
import { validatePasswordStrength } from "./password-policy";
import { AUDIT_ACTION_OWNER_RESET } from "./must-change-password";

// Doble en memoria del PORT: modela la fila del OWNER (solo lo que persiste el reset) + el log
// de auditoría, para verificar los invariantes sin tocar la DB.
function makeFakePort(opts?: { owner?: { id: string; email: string } | null; columnMissing?: boolean }) {
  const owner = opts?.owner === undefined ? { id: "u1", email: "dueno@negocio.test" } : opts.owner;
  const row: { passwordHash?: string; mustChangePassword?: boolean } = {};
  const audits: { action: string; entity: string; entityId: string; changes: unknown; actor: string }[] = [];

  const port: OwnerResetPort = {
    findOwner: async () => owner,
    setPasswordHash: async (_id, passwordHash) => {
      row.passwordHash = passwordHash;
    },
    setMustChange: async (_id, value) => {
      if (opts?.columnMissing) return { persisted: false };
      row.mustChangePassword = value;
      return { persisted: true };
    },
    audit: async (e) => {
      audits.push({ action: e.action, entity: e.entity, entityId: e.entityId, changes: e.changes, actor: e.actor });
    },
  };
  return { port, row, audits };
}

test("reset OK: devuelve una temporal fuerte, marca cambio forzado y audita", async () => {
  const { port, row, audits } = makeFakePort();
  const r = await resetOwnerPasswordCore(port, { tenantId: "t1", operatorSubject: "operator" });

  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.email, "dueno@negocio.test");
  assert.equal(r.flagPending, false);
  // La temporal devuelta es fuerte por construcción.
  assert.equal(validatePasswordStrength(r.password).ok, true);
  // Se marcó el cambio forzado.
  assert.equal(row.mustChangePassword, true);
  // Se auditó con la acción canónica.
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, AUDIT_ACTION_OWNER_RESET);
  assert.equal(audits[0].entity, "User");
  assert.equal(audits[0].entityId, "u1");
  assert.equal(audits[0].actor, "operator:operator");
});

test("REVELADO ÚNICO: solo se persiste el hash; el claro no es recuperable del storage", async () => {
  const { port, row } = makeFakePort();
  const r = await resetOwnerPasswordCore(port, { tenantId: "t1", operatorSubject: "op" });
  assert.equal(r.ok, true);
  if (!r.ok) return;

  // Lo guardado es un hash scrypt$..., NO el texto plano.
  assert.ok(row.passwordHash && row.passwordHash.startsWith("scrypt$"));
  assert.notEqual(row.passwordHash, r.password);
  // El claro NO aparece en ninguna parte del estado persistido (no re-leíble).
  assert.ok(!JSON.stringify(row).includes(r.password));
  // Pero el hash corresponde a la temporal (se seteó de verdad).
  assert.equal(await verifyPassword(r.password, row.passwordHash!), true);
});

test("AUDITORÍA sin el valor: el log no contiene la contraseña en claro", async () => {
  const { port, audits } = makeFakePort();
  const r = await resetOwnerPasswordCore(port, { tenantId: "t1", operatorSubject: "op" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.ok(!JSON.stringify(audits).includes(r.password));
  // changes lleva solo metadata, no la contraseña.
  assert.deepEqual(audits[0].changes, { forcedChangePersisted: true });
});

test("dos resets consecutivos generan contraseñas distintas", async () => {
  const a = await resetOwnerPasswordCore(makeFakePort().port, { tenantId: "t1", operatorSubject: "op" });
  const b = await resetOwnerPasswordCore(makeFakePort().port, { tenantId: "t1", operatorSubject: "op" });
  assert.equal(a.ok && b.ok, true);
  if (a.ok && b.ok) assert.notEqual(a.password, b.password);
});

test("sin OWNER activo: no resetea y avisa", async () => {
  const { port, row, audits } = makeFakePort({ owner: null });
  const r = await resetOwnerPasswordCore(port, { tenantId: "t1", operatorSubject: "op" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /OWNER/);
  assert.equal(row.passwordHash, undefined);
  assert.equal(audits.length, 0);
});

test("columna del flag sin aplicar (Gate 2): resetea igual pero reporta flagPending", async () => {
  const { port, row } = makeFakePort({ columnMissing: true });
  const r = await resetOwnerPasswordCore(port, { tenantId: "t1", operatorSubject: "op" });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // La contraseña SÍ se reseteó...
  assert.ok(row.passwordHash?.startsWith("scrypt$"));
  // ...pero el forzado quedó pendiente.
  assert.equal(r.flagPending, true);
  assert.equal(row.mustChangePassword, undefined);
});

test("tenant vacío: no toca nada", async () => {
  const { port, row } = makeFakePort();
  const r = await resetOwnerPasswordCore(port, { tenantId: "", operatorSubject: "op" });
  assert.equal(r.ok, false);
  assert.equal(row.passwordHash, undefined);
});
