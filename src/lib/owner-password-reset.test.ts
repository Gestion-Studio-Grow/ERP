import { test } from "node:test";
import assert from "node:assert/strict";
import { resetOwnerPasswordCore, type OwnerResetPort } from "./owner-password-reset";
import { verifyPassword } from "./auth-password";
import { validatePasswordStrength } from "./password-policy";
import { AUDIT_ACTION_OWNER_RESET, CAMBIO_OBLIGATORIO_INACTIVO } from "./must-change-password";
import { ClaveNoEnviada } from "./clave-temporal-mail";

// Doble en memoria del PORT: la fila del OWNER, la auditoría y el MAIL (lo único por donde sale el
// claro). `mailFalla` simula el servicio de mail caído.
function makeFakePort(opts?: { owner?: { id: string; email: string; name: string } | null; columnMissing?: boolean; mailFalla?: boolean }) {
  const owner = opts?.owner === undefined ? { id: "u1", email: "dueno@negocio.test", name: "Ana" } : opts.owner;
  const row: { passwordHash?: string; mustChangePassword?: boolean } = {};
  const audits: { action: string; entity: string; entityId: string; changes: unknown; actor: string }[] = [];
  const mails: { email: string; nombre: string; clave: string }[] = [];

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
    enviarClave: async (destino, clave) => {
      if (opts?.mailFalla) return { enviado: false, motivo: "el servicio de mail respondió 503" };
      mails.push({ ...destino, clave });
      return { enviado: true };
    },
  };
  return { port, row, audits, mails };
}

test("mail OK: la temporal fuerte sale por mail al titular, marca cambio forzado y audita", async () => {
  const { port, row, audits, mails } = makeFakePort();
  const r = await resetOwnerPasswordCore(port, { tenantId: "t1", operatorSubject: "operator" });

  assert.deepEqual(r, { ok: true, email: "dueno@negocio.test", enviadaA: "d***@negocio.test" });
  assert.equal(mails.length, 1);
  assert.equal(mails[0].email, "dueno@negocio.test");
  assert.equal(mails[0].nombre, "Ana");
  assert.equal(validatePasswordStrength(mails[0].clave).ok, true);
  assert.equal(row.mustChangePassword, true);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, AUDIT_ACTION_OWNER_RESET);
  assert.equal(audits[0].entity, "User");
  assert.equal(audits[0].entityId, "u1");
  assert.equal(audits[0].actor, "operator:operator");
});

test("la contraseña NO viaja en el resultado (la pantalla sólo ve el destino enmascarado)", async () => {
  const { port, mails } = makeFakePort();
  const r = await resetOwnerPasswordCore(port, { tenantId: "t1", operatorSubject: "op" });
  assert.ok(!JSON.stringify(r).includes(mails[0].clave));
  assert.ok(!("password" in r));
});

test("sólo se persiste el hash; corresponde a la clave del mail", async () => {
  const { port, row, mails } = makeFakePort();
  await resetOwnerPasswordCore(port, { tenantId: "t1", operatorSubject: "op" });
  const clave = mails[0].clave;
  assert.ok(row.passwordHash && row.passwordHash.startsWith("scrypt$"));
  assert.ok(!JSON.stringify(row).includes(clave));
  assert.equal(await verifyPassword(clave, row.passwordHash!), true);
});

test("AUDITORÍA sin el valor: sólo metadata y el destino enmascarado", async () => {
  const { port, audits, mails } = makeFakePort();
  await resetOwnerPasswordCore(port, { tenantId: "t1", operatorSubject: "op", actor: "system:x", extra: { pendiente: "k1" } });
  assert.ok(!JSON.stringify(audits).includes(mails[0].clave));
  assert.deepEqual(audits[0].changes, { forcedChangePersisted: true, entrega: "mail", enviadaA: "d***@negocio.test", pendiente: "k1" });
  assert.equal(audits[0].actor, "system:x");
});

test("MAIL CAÍDO: tira ClaveNoEnviada (la transacción del llamador se deshace) y nada devuelve la clave", async () => {
  const { port, audits } = makeFakePort({ mailFalla: true });
  await assert.rejects(
    resetOwnerPasswordCore(port, { tenantId: "t1", operatorSubject: "op" }),
    (e: unknown) => {
      assert.ok(e instanceof ClaveNoEnviada);
      assert.equal(e.destino, "d***@negocio.test");
      assert.match(e.message, /503/);
      assert.match(e.message, /No se cambió nada/);
      return true;
    },
  );
  // El mail es el ÚLTIMO paso: lo escrito antes vive en la misma transacción que se deshace.
  assert.equal(audits.length, 1, "la auditoría del reset iba en la transacción que se revierte");
});

test("dos resets consecutivos mandan contraseñas distintas", async () => {
  const a = makeFakePort();
  const b = makeFakePort();
  await resetOwnerPasswordCore(a.port, { tenantId: "t1", operatorSubject: "op" });
  await resetOwnerPasswordCore(b.port, { tenantId: "t1", operatorSubject: "op" });
  assert.notEqual(a.mails[0].clave, b.mails[0].clave);
});

test("sin OWNER activo: no resetea, no manda mail y avisa", async () => {
  const { port, row, audits, mails } = makeFakePort({ owner: null });
  const r = await resetOwnerPasswordCore(port, { tenantId: "t1", operatorSubject: "op" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /OWNER/);
  assert.equal(row.passwordHash, undefined);
  assert.equal(audits.length, 0);
  assert.equal(mails.length, 0);
});

test("FALLA CERRADO: sin la columna del cambio obligatorio no se emite provisoria ni sale mail", async () => {
  const { port, row, audits, mails } = makeFakePort({ columnMissing: true });
  const r = await resetOwnerPasswordCore(port, { tenantId: "t1", operatorSubject: "op" });
  assert.deepEqual(r, { ok: false, error: CAMBIO_OBLIGATORIO_INACTIVO });
  assert.equal(row.passwordHash, undefined);
  assert.equal(row.mustChangePassword, undefined);
  assert.equal(audits.length, 0);
  assert.equal(mails.length, 0);
});

test("orden: flag → hash → auditoría → mail (el mail último, para que su falla deshaga todo)", async () => {
  const orden: string[] = [];
  const { port } = makeFakePort();
  const r = await resetOwnerPasswordCore(
    {
      ...port,
      setMustChange: async (id, v) => (orden.push("flag"), port.setMustChange(id, v)),
      setPasswordHash: async (id, h) => (orden.push("hash"), port.setPasswordHash(id, h)),
      audit: async (e) => (orden.push("audit"), port.audit(e)),
      enviarClave: async (d, c) => (orden.push("mail"), port.enviarClave(d, c)),
    },
    { tenantId: "t1", operatorSubject: "op" },
  );
  assert.equal(r.ok, true);
  assert.deepEqual(orden, ["flag", "hash", "audit", "mail"]);
});

test("tenant vacío: no toca nada", async () => {
  const { port, row, mails } = makeFakePort();
  const r = await resetOwnerPasswordCore(port, { tenantId: "", operatorSubject: "op" });
  assert.equal(r.ok, false);
  assert.equal(row.passwordHash, undefined);
  assert.equal(mails.length, 0);
});
