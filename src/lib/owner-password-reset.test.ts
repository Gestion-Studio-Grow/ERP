import { test } from "node:test";
import assert from "node:assert/strict";
import { resetOwnerPasswordCore, resetManyOwnerPasswordsCore, type OwnerResetPort } from "./owner-password-reset";
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

// --- Reset MASIVO ------------------------------------------------------------

// Port multi-tenant: `owners` mapea tenantId→owner (o null si no tiene). Registra hashes + audits.
function makeMultiPort(owners: Record<string, { id: string; email: string } | null>, columnMissing = false) {
  const hashes = new Map<string, string>();
  const flags = new Map<string, boolean>();
  const audits: { entityId: string; action: string; changes: unknown }[] = [];
  const port: OwnerResetPort = {
    findOwner: async (tid) => owners[tid] ?? null,
    setPasswordHash: async (id, h) => { hashes.set(id, h); },
    setMustChange: async (id, v) => {
      if (columnMissing) return { persisted: false };
      flags.set(id, v);
      return { persisted: true };
    },
    audit: async (e) => { audits.push({ entityId: e.entityId, action: e.action, changes: e.changes }); },
  };
  return { port, hashes, flags, audits };
}

test("masivo: una fila por tenant, todas con temporal distinta, todas auditadas", async () => {
  const owners: Record<string, { id: string; email: string } | null> = {
    t1: { id: "u1", email: "a@x.test" },
    t2: { id: "u2", email: "b@x.test" },
    t3: { id: "u3", email: "c@x.test" },
  };
  const { port, hashes, flags, audits } = makeMultiPort(owners);
  const tenants = [
    { id: "t1", name: "Uno" },
    { id: "t2", name: "Dos" },
    { id: "t3", name: "Tres" },
  ];
  const rows = await resetManyOwnerPasswordsCore(port, tenants, "operator");

  assert.equal(rows.length, 3);
  // Cada fila trae su tenant, email y una temporal.
  assert.deepEqual(rows.map((r) => r.tenantName), ["Uno", "Dos", "Tres"]);
  assert.deepEqual(rows.map((r) => r.email), ["a@x.test", "b@x.test", "c@x.test"]);
  // Todas las temporales son distintas entre sí.
  const pws = rows.map((r) => r.password);
  assert.equal(new Set(pws).size, 3);
  // Solo se persistió el hash de cada una (no el claro) y se marcó el flag.
  for (const r of rows) {
    const uid = owners[r.tenantId]!.id;
    const h = hashes.get(uid);
    assert.ok(h && h.startsWith("scrypt$") && !pws.includes(h));
    assert.equal(flags.get(uid), true);
    assert.equal(r.flagPending, false);
  }
  // Un audit por tenant, sin la contraseña en ninguno.
  assert.equal(audits.length, 3);
  assert.ok(pws[0] && !JSON.stringify(audits).includes(pws[0]));
});

test("masivo: un tenant sin OWNER no aborta el lote (se lista con error)", async () => {
  const owners = {
    t1: { id: "u1", email: "a@x.test" },
    t2: null, // sin OWNER
    t3: { id: "u3", email: "c@x.test" },
  };
  const { port } = makeMultiPort(owners);
  const tenants = [
    { id: "t1", name: "Uno" },
    { id: "t2", name: "Dos" },
    { id: "t3", name: "Tres" },
  ];
  const rows = await resetManyOwnerPasswordsCore(port, tenants, "op");
  assert.equal(rows.length, 3);
  assert.ok(rows[0].password && rows[2].password);
  // El del medio: sin contraseña, con error, pero el lote siguió.
  assert.equal(rows[1].password, null);
  assert.equal(rows[1].email, null);
  assert.match(rows[1].error ?? "", /OWNER/);
});

test("masivo: columna del flag sin aplicar → todas flagPending, pero resetean igual", async () => {
  const owners = { t1: { id: "u1", email: "a@x.test" } };
  const { port } = makeMultiPort(owners, true);
  const rows = await resetManyOwnerPasswordsCore(port, [{ id: "t1", name: "Uno" }], "op");
  assert.equal(rows[0].password !== null, true);
  assert.equal(rows[0].flagPending, true);
});
