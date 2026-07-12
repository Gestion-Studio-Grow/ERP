import { test } from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";
import { CredencialCuitMismatchError } from "@/plugins/arca";
import {
  credencialParaTenant,
  cargarCredencialTenant,
  CredencialFiscalAusenteError,
  CuitTenantAusenteError,
  type TenantCertDeps,
  type RegistroCredencialFiscal,
  type AuditoriaCredencial,
} from "./tenant-cert";
import { type MasterKey } from "./cert-crypto";

// --- Helpers: par cert+clave real con el CUIT en el subject ------------------
function parConCuit(cuit: string): { certPem: string; keyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(2020, 0, 1);
  cert.validity.notAfter = new Date(2035, 0, 1);
  const attrs = [
    { name: "commonName", value: "Emisor" },
    { name: "serialNumber", value: `CUIT ${cuit}` },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

// --- Deps fake en memoria (sin DB) ------------------------------------------
function fakeDeps(cuitsPorTenant: Record<string, string | null>) {
  const store = new Map<string, RegistroCredencialFiscal>();
  const auditoria: AuditoriaCredencial[] = [];
  const master: MasterKey = { key: Buffer.alloc(32, 3), id: "test:v1" };
  const deps: TenantCertDeps = {
    leerCuitTenant: async (t) => cuitsPorTenant[t] ?? null,
    leerRegistro: async (t) => store.get(t) ?? null,
    guardarRegistro: async (t, reg, _loadedBy) => {
      const yaExistia = store.has(t);
      store.set(t, reg);
      return { id: `cred_${t}`, yaExistia };
    },
    auditar: async (e) => {
      auditoria.push(e);
    },
    master: () => master,
  };
  return { deps, store, auditoria };
}

test("cargar + resolver: round-trip devuelve el material del tenant", async () => {
  const { deps } = fakeDeps({ A: "20111111112" });
  const par = parConCuit("20111111112");
  await cargarCredencialTenant({ tenantId: "A", ...par, actor: "operator" }, deps);
  const cred = await credencialParaTenant("A", deps);
  assert.equal(cred.certPem, par.certPem);
  assert.equal(cred.keyPem, par.keyPem);
});

test("resolver sin credencial cargada → CredencialFiscalAusenteError (fail-closed)", async () => {
  const { deps } = fakeDeps({ A: "20111111112" });
  await assert.rejects(() => credencialParaTenant("A", deps), CredencialFiscalAusenteError);
});

test("resolver con tenant sin arcaCuit → CuitTenantAusenteError", async () => {
  const { deps, store } = fakeDeps({ A: null });
  // Registro presente pero sin CUIT del tenant → no hay con qué comparar → aborta.
  store.set("A", {
    certCuit: "20111111112",
    certNotAfter: null,
    kekId: "k",
    wrappedDek: "x.y.z",
    sealed: "x.y.z",
  });
  await assert.rejects(() => credencialParaTenant("A", deps), CuitTenantAusenteError);
});

test("🔒 ADR-066: un tenant NO puede usar el cert de otro (store envenenado) → aborta", async () => {
  // Tenant B declara su CUIT (B), pero su registro guarda el cert de A (CUIT A).
  const { deps, store } = fakeDeps({ A: "20111111112", B: "27999999993" });
  const parA = parConCuit("20111111112");
  // Cargamos legítimamente el cert de A bajo A...
  await cargarCredencialTenant({ tenantId: "A", ...parA, actor: "operator" }, deps);
  // ...y luego "envenenamos" el registro de B con el sobre de A.
  store.set("B", store.get("A")!);
  // Resolver para B debe ABORTAR: el cert descifrado es de A, pero B.arcaCuit es B.
  await assert.rejects(
    () => credencialParaTenant("B", deps),
    (err: unknown) => err instanceof CredencialCuitMismatchError,
  );
});

test("🔒 ADR-066: cada tenant resuelve SU propio cert (aislamiento normal)", async () => {
  const { deps } = fakeDeps({ A: "20111111112", B: "27999999993" });
  const parA = parConCuit("20111111112");
  const parB = parConCuit("27999999993");
  await cargarCredencialTenant({ tenantId: "A", ...parA, actor: "operator" }, deps);
  await cargarCredencialTenant({ tenantId: "B", ...parB, actor: "operator" }, deps);
  const credA = await credencialParaTenant("A", deps);
  const credB = await credencialParaTenant("B", deps);
  assert.equal(credA.certPem, parA.certPem);
  assert.equal(credB.certPem, parB.certPem);
  assert.notEqual(credA.certPem, credB.certPem);
});

test("🔒 cargar: rechaza un cert cuyo CUIT no es el del tenant (no se guarda el cert de otro)", async () => {
  const { deps, store } = fakeDeps({ A: "20111111112" });
  const parOtro = parConCuit("27999999993");
  await assert.rejects(
    () => cargarCredencialTenant({ tenantId: "A", ...parOtro, actor: "operator" }, deps),
    (err: unknown) => err instanceof CredencialCuitMismatchError,
  );
  assert.equal(store.has("A"), false, "no debe persistir un cert de otro CUIT");
});

test("cargar: rechaza si la clave privada no corresponde al certificado", async () => {
  const { deps } = fakeDeps({ A: "20111111112" });
  const cert = parConCuit("20111111112").certPem;
  const otraKey = parConCuit("20111111112").keyPem; // clave de otro par
  await assert.rejects(
    () => cargarCredencialTenant({ tenantId: "A", certPem: cert, keyPem: otraKey, actor: "operator" }, deps),
    /no corresponde al certificado/,
  );
});

test("cargar audita load la 1ª vez y rotate al reemplazar (sin material sensible)", async () => {
  const { deps, auditoria } = fakeDeps({ A: "20111111112" });
  const par1 = parConCuit("20111111112");
  const par2 = parConCuit("20111111112");
  await cargarCredencialTenant({ tenantId: "A", ...par1, actor: "operator" }, deps);
  await cargarCredencialTenant({ tenantId: "A", ...par2, actor: "operator" }, deps);
  assert.equal(auditoria[0].action, "fiscal.credential.load");
  assert.equal(auditoria[1].action, "fiscal.credential.rotate");
  // La auditoría NUNCA incluye el material.
  const dump = JSON.stringify(auditoria);
  assert.ok(!dump.includes("PRIVATE KEY"), "la auditoría no debe contener la clave");
  assert.ok(!dump.includes("CERTIFICATE"), "la auditoría no debe contener el certificado");
});
