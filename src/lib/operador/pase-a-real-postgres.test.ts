// ============================================================================
// PASE A FACTURACIÓN REAL — la action de la consola contra Postgres de verdad (R2-F5)
// ============================================================================
//
// En una base efímera propia (src/test/base-efimera.ts): la consola con el rol dueño, igual que
// producción. Se corre la action REAL (`cambiarFacturacionReal`) con la cookie de operador firmada,
// el certificado se carga cifrado con `cargarCredencialTenant` (el mismo camino que la ficha) y se
// abre con la guardia de siempre. Se mide en la base: la columna `arcaHomologacion` y las filas de
// AuditLog. Sin Postgres local se SALTEA diciéndolo; en CI, falla.
//
// Qué se prueba:
//   · las 6 combinaciones de condiciones: con todo en regla pasa; faltando cada una de las 5, se
//     niega con su motivo en castellano y no cambia nada;
//   · la vuelta a pruebas sin ningún dato (ni CUIT, ni certificado, ni huella, ni slug) funciona;
//   · dos confirmaciones a la vez dejan un solo cambio y una sola fila de AuditLog;
//   · una huella vieja (la ficha cambió después de mirarla) no cambia nada;
//   · CH: un operador que no es el dueño no puede ni pasar ni volver; el dueño tiene que escribir el slug;
//   · comprobantes de la etapa de pruebas (sexta condición): 1 factura PENDING con su envío abierto
//     niega y no cambia nada; una autorizada en pruebas también; lo autorizado antes de la última
//     vuelta a pruebas no cuenta (fue real) y lo autorizado después sí; el conteo queda en AuditLog;
//   · el negocio B queda intacto, aunque le manden la confirmación de A.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import forge from "node-forge";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { valorDeClave } from "./clave-operador";

const CUIT = "20123456786";
const PRODUCCION = { cn: "Computadores", o: "AFIP" };
const PRUEBAS = { cn: "Computadores Test", o: "AFIP" };

/** Un certificado con el CUIT en el subject, firmado por la autoridad que se le pida. */
function certificado(cuit: string, emisor: { cn: string; o: string }): { certPem: string; keyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  cert.setSubject([
    { name: "commonName", value: "qa-pase-a-real" },
    { name: "serialNumber", value: `CUIT ${cuit}` },
  ]);
  cert.setIssuer([
    { name: "commonName", value: emisor.cn },
    { name: "organizationName", value: emisor.o },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

test("pase a real contra Postgres: condiciones, vuelta, concurrencia, huella, CH y aislamiento", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const antes = { ...process.env };
  Object.assign(process.env, {
    FISCAL_MASTER_KEY: randomBytes(32).toString("base64"),
    OPERATOR_SECRET: "secreto-de-operador-qa",
    AUTH_SECRET: "secreto-de-auth-qa",
    OPERADOR_DUENIO: "tomas",
    OPERADORES: `facu=${await valorDeClave("clave-de-facu", new Uint8Array(16).fill(9))}`,
    ARCA_MODO: "real",
  });
  t.after(() => {
    for (const k of ["FISCAL_MASTER_KEY", "OPERATOR_SECRET", "AUTH_SECRET", "OPERADOR_DUENIO", "OPERADORES", "ARCA_MODO"]) {
      if (antes[k] === undefined) delete process.env[k];
      else process.env[k] = antes[k];
    }
  });
  prepararAccionesDeServidor();

  const { operatorPrisma } = await import("@/lib/operator-db");
  const { cargarCredencialTenant } = await import("@/lib/fiscal/tenant-cert");
  const { createOperatorToken } = await import("@/lib/operator-auth");
  const { cambiarFacturacionReal } = await import("@/lib/operator-actions");
  const { aplicarPase, leerFichaDelPase, ACCION_AUDITORIA } = await import("./pase-a-real.server");
  const { huellaDeLaFicha, FICHA_CAMBIO_MIENTRAS_MIRABAS, MOTIVO_CANDADO_CH } = await import("./pase-a-real");
  const { modoDesdeEnv } = await import("@/plugins/arca");

  const A = base.a;
  const B = base.b;
  const duenio = await createOperatorToken("tomas");
  const facu = await createOperatorToken("facu");
  const produccion = certificado(CUIT, PRODUCCION);
  const dePruebas = certificado(CUIT, PRUEBAS);

  async function cargar(tenantId: string, par: { certPem: string; keyPem: string }) {
    await cargarCredencialTenant({ tenantId, ...par, actor: "operator:tomas" });
  }
  async function fichaEnRegla(tenantId: string) {
    await operatorPrisma.tenant.update({
      where: { id: tenantId },
      data: { arcaCuit: CUIT, arcaPuntoVenta: 3, arcaCondicionIva: "RESPONSABLE_INSCRIPTO" },
    });
    await cargar(tenantId, produccion);
    process.env.ARCA_MODO = "real";
  }
  async function huella(tenantId: string): Promise<string> {
    const f = await leerFichaDelPase(tenantId, modoDesdeEnv());
    assert.ok(f, "la ficha existe");
    return huellaDeLaFicha(f);
  }
  async function confirmar(tenantId: string, campos: { accion: string; huella?: string; slug?: string }, token = duenio) {
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("accion", campos.accion);
    fd.set("huella", campos.huella ?? "");
    fd.set("slug", campos.slug ?? "");
    const s = await ejecutarAccion({ cookies: { operator_session: token } }, () => cambiarFacturacionReal(fd));
    assert.equal(s.tipo, "redireccion", "la action siempre vuelve a la ficha");
    const destino = s.tipo === "redireccion" ? s.destino : "";
    const u = new URL(destino, "http://consola.test");
    return { ok: u.searchParams.get("ok"), error: u.searchParams.get("error"), destino };
  }
  async function estado(tenantId: string) {
    const fila = await operatorPrisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { arcaHomologacion: true },
    });
    const auditorias = await operatorPrisma.auditLog.count({
      where: { tenantId, action: { in: Object.values(ACCION_AUDITORIA) } },
    });
    return { homologacion: fila.arcaHomologacion, auditorias };
  }
  const deB = async () => ({
    tenant: await operatorPrisma.tenant.findUniqueOrThrow({ where: { id: B.id } }),
    auditorias: await operatorPrisma.auditLog.count({ where: { tenantId: B.id } }),
  });
  const bAlEmpezar = await deB();

  await fichaEnRegla(A.id);
  assert.deepEqual(await estado(A.id), { homologacion: true, auditorias: 0 });

  await t.test("faltando cada una de las 5 condiciones, se niega con su motivo y no cambia nada", async () => {
    const casos: { nombre: string; romper: () => Promise<void>; motivo: RegExp }[] = [
      {
        nombre: "sin CUIT",
        romper: () => operatorPrisma.tenant.update({ where: { id: A.id }, data: { arcaCuit: null } }).then(() => {}),
        motivo: /Falta el CUIT del negocio\./,
      },
      {
        nombre: "sin punto de venta",
        romper: () => operatorPrisma.tenant.update({ where: { id: A.id }, data: { arcaPuntoVenta: null } }).then(() => {}),
        motivo: /Falta el punto de venta que ARCA habilitó/,
      },
      {
        nombre: "certificado de pruebas",
        romper: () => cargar(A.id, dePruebas),
        motivo: /El certificado cargado es de pruebas \(lo firmó Computadores Test · AFIP\)/,
      },
      {
        nombre: "sin condición de IVA",
        romper: () => operatorPrisma.tenant.update({ where: { id: A.id }, data: { arcaCondicionIva: null } }).then(() => {}),
        motivo: /Falta la condición del negocio frente al IVA\./,
      },
      {
        nombre: "plataforma en homologación",
        romper: async () => {
          process.env.ARCA_MODO = "homologacion";
        },
        motivo: /La plataforma está en modo pruebas \(homologación\)/,
      },
    ];
    for (const c of casos) {
      await fichaEnRegla(A.id);
      await c.romper();
      const antesDelIntento = await estado(A.id);
      const r = await confirmar(A.id, { accion: "pasar-a-real", huella: await huella(A.id), slug: A.slug });
      assert.equal(r.ok, null, c.nombre);
      assert.match(r.error ?? "", /^No se puede pasar a facturación real\./, c.nombre);
      assert.match(r.error ?? "", c.motivo, c.nombre);
      assert.match(r.error ?? "", /No se hizo nada\.$/, c.nombre);
      assert.match(r.destino, /\?pestana=fiscal&error=.*#pase-a-real$/, c.nombre);
      assert.deepEqual(await estado(A.id), antesDelIntento, `${c.nombre}: no cambió nada`);
    }
  });

  await t.test("con todo en regla pasa a real y deja una fila de AuditLog sin material del certificado", async () => {
    await fichaEnRegla(A.id);
    const r = await confirmar(A.id, { accion: "pasar-a-real", huella: await huella(A.id), slug: ` ${A.slug.toUpperCase()} ` });
    assert.equal(r.error, null);
    assert.match(r.ok ?? "", /pasó a facturación real/);
    assert.deepEqual(await estado(A.id), { homologacion: false, auditorias: 1 });
    const fila = await operatorPrisma.auditLog.findFirstOrThrow({
      where: { tenantId: A.id, action: ACCION_AUDITORIA["pasar-a-real"] },
    });
    assert.equal(fila.actor, "operator:tomas");
    assert.equal(fila.entity, "Tenant");
    assert.equal(fila.entityId, A.id);
    const cambios = fila.changes as Record<string, unknown>;
    assert.deepEqual(cambios.arcaHomologacion, { antes: true, despues: false });
    assert.deepEqual(cambios.respaldo, {
      tipo: "certificado",
      certCuit: CUIT,
      entorno: "produccion",
      emisor: "Computadores · AFIP",
    });
    assert.equal(cambios.modoArca, "real");
    assert.doesNotMatch(JSON.stringify(cambios), /BEGIN|PRIVATE|sealed|wrappedDek/);
  });

  await t.test("la vuelta a pruebas funciona sin ningún dato (ni CUIT, ni certificado, ni huella, ni slug)", async () => {
    await operatorPrisma.tenant.update({
      where: { id: A.id },
      data: { arcaCuit: null, arcaPuntoVenta: null, arcaCondicionIva: null },
    });
    await operatorPrisma.tenantFiscalCredential.deleteMany({ where: { tenantId: A.id } });
    process.env.ARCA_MODO = "stub";
    const r = await confirmar(A.id, { accion: "volver-a-pruebas", huella: "v1|una-huella-vieja" });
    assert.equal(r.error, null);
    assert.match(r.ok ?? "", /volvió a facturar en pruebas/);
    assert.deepEqual(await estado(A.id), { homologacion: true, auditorias: 2 });
    const fila = await operatorPrisma.auditLog.findFirstOrThrow({
      where: { tenantId: A.id, action: ACCION_AUDITORIA["volver-a-pruebas"] },
    });
    assert.deepEqual((fila.changes as Record<string, unknown>).arcaHomologacion, { antes: false, despues: true });
    // Pedir la vuelta estando ya en pruebas no escribe nada.
    const otra = await confirmar(A.id, { accion: "volver-a-pruebas" });
    assert.match(otra.ok ?? "", /Ya estaba facturando en pruebas/);
    assert.deepEqual(await estado(A.id), { homologacion: true, auditorias: 2 });
  });

  await t.test("dos confirmaciones a la vez: un solo cambio y una sola fila de AuditLog", async () => {
    await fichaEnRegla(A.id);
    const h = await huella(A.id);
    const antesDeLaCarrera = await estado(A.id);
    const [uno, dos] = await Promise.all([
      confirmar(A.id, { accion: "pasar-a-real", huella: h, slug: A.slug }),
      confirmar(A.id, { accion: "pasar-a-real", huella: h, slug: A.slug }),
    ]);
    assert.equal(uno.error, null);
    assert.equal(dos.error, null);
    const oks = [uno.ok ?? "", dos.ok ?? ""];
    assert.equal(oks.filter((m) => /pasó a facturación real/.test(m)).length, 1, oks.join(" / "));
    assert.equal(oks.filter((m) => /Ya estaba facturando en real/.test(m)).length, 1, oks.join(" / "));
    assert.deepEqual(await estado(A.id), { homologacion: false, auditorias: antesDeLaCarrera.auditorias + 1 });
    await confirmar(A.id, { accion: "volver-a-pruebas" });
  });

  await t.test("con la huella vieja (la ficha cambió después de mirarla) no cambia nada", async () => {
    await fichaEnRegla(A.id);
    const vieja = await huella(A.id);
    const antesDelCambio = await estado(A.id);
    await operatorPrisma.tenant.update({ where: { id: A.id }, data: { arcaPuntoVenta: 4 } });
    const r = await confirmar(A.id, { accion: "pasar-a-real", huella: vieja, slug: A.slug });
    assert.equal(r.error, FICHA_CAMBIO_MIENTRAS_MIRABAS);
    assert.deepEqual(await estado(A.id), antesDelCambio);
    // El certificado rotado también cambia la huella.
    const conPv4 = await huella(A.id);
    await cargar(A.id, produccion);
    const r2 = await confirmar(A.id, { accion: "pasar-a-real", huella: conPv4, slug: A.slug });
    assert.equal(r2.error, FICHA_CAMBIO_MIENTRAS_MIRABAS);
    assert.deepEqual(await estado(A.id), antesDelCambio);
  });

  await t.test("sin el slug escrito no pasa; con el de otro negocio, tampoco", async () => {
    await fichaEnRegla(A.id);
    const h = await huella(A.id);
    const antesDelIntento = await estado(A.id);
    const sinSlug = await confirmar(A.id, { accion: "pasar-a-real", huella: h, slug: "" });
    assert.match(sinSlug.error ?? "", new RegExp(`escribí exactamente el nombre corto del negocio \\(«${A.slug}»\\)`));
    const otroSlug = await confirmar(A.id, { accion: "pasar-a-real", huella: h, slug: B.slug });
    assert.match(otroSlug.error ?? "", /escribí exactamente el nombre corto/);
    assert.deepEqual(await estado(A.id), antesDelIntento);
  });

  await t.test("CH: un operador que no es el dueño no pasa ni vuelve; el dueño tiene que escribir el slug", async () => {
    const ch = await operatorPrisma.tenant.create({
      data: { name: "CH (copia de prueba)", slug: "beauty-spa", subdomain: "qa-ch-pase", arcaHomologacion: true },
    });
    await fichaEnRegla(ch.id);
    const h = await huella(ch.id);
    const pasar = await confirmar(ch.id, { accion: "pasar-a-real", huella: h, slug: "beauty-spa" }, facu);
    assert.match(pasar.error ?? "", /«beauty-spa» es un cliente vivo en producción: sólo el dueño de GSG/);
    assert.match(pasar.error ?? "", /Entraste como «facu»\. No se hizo nada\./);
    assert.deepEqual(await estado(ch.id), { homologacion: true, auditorias: 0 });
    // El núcleo también lo niega por su cuenta (defensa en profundidad, sin la guardia de sesión).
    const directo = await aplicarPase(
      { nombre: "facu", esDuenio: false },
      ch.id,
      { accion: "pasar-a-real", huellaVista: h, slugTipeado: "beauty-spa" },
      "real",
    );
    assert.deepEqual(directo, { tipo: "rechazado", motivo: MOTIVO_CANDADO_CH });
    // El dueño, sin escribir el slug, tampoco.
    const sinSlug = await confirmar(ch.id, { accion: "pasar-a-real", huella: h });
    assert.match(sinSlug.error ?? "", /escribí exactamente el nombre corto del negocio \(«beauty-spa»\)/);
    assert.deepEqual(await estado(ch.id), { homologacion: true, auditorias: 0 });
    // Con el slug, el dueño sí; y la vuelta de un operador que no es el dueño también se frena.
    const conSlug = await confirmar(ch.id, { accion: "pasar-a-real", huella: h, slug: "beauty-spa" });
    assert.match(conSlug.ok ?? "", /pasó a facturación real/);
    const vueltaFacu = await confirmar(ch.id, { accion: "volver-a-pruebas" }, facu);
    assert.match(vueltaFacu.error ?? "", /sólo el dueño de GSG/);
    assert.deepEqual(await estado(ch.id), { homologacion: false, auditorias: 1 });
    const vuelta = await confirmar(ch.id, { accion: "volver-a-pruebas" });
    assert.match(vuelta.ok ?? "", /volvió a facturar en pruebas/);
    assert.deepEqual(await estado(ch.id), { homologacion: true, auditorias: 2 });
  });

  await t.test("comprobantes de la etapa de pruebas: esperando CAE o autorizados en pruebas niegan sin cambiar nada", async () => {
    const C = await operatorPrisma.tenant.create({
      data: { name: "QA comprobantes de prueba", slug: "qa-pase-comprobantes", subdomain: "qa-pase-comprobantes", arcaHomologacion: true },
    });
    await fichaEnRegla(C.id);
    const factura = { tenantId: C.id, puntoVenta: 3, concepto: 1, docTipo: 99, docNro: "0", fecha: "20260920", neto: 100, iva: 0, total: 100 };
    const pedirPase = async () => confirmar(C.id, { accion: "pasar-a-real", huella: await huella(C.id), slug: C.slug });

    // 1. Una factura de la etapa de pruebas PENDING, con su envío a ARCA abierto.
    const pendiente = await operatorPrisma.invoice.create({ data: factura });
    await operatorPrisma.outboxEvent.create({ data: { tenantId: C.id, type: "InvoiceCreated", payload: { invoiceId: pendiente.id } } });
    const f1 = await leerFichaDelPase(C.id, "real");
    assert.deepEqual(f1?.comprobantesDePrueba, { esperandoCae: 1, enviosAbiertos: 1, autorizados: 0, desde: null });
    const alEmpezar = await estado(C.id);
    const r1 = await pedirPase();
    assert.equal(r1.ok, null);
    assert.match(r1.error ?? "", /Hay 1 comprobante de la etapa de pruebas esperando CAE \(1 envío a ARCA sin cerrar\); si pasás a real saldrían con validez fiscal/);
    assert.match(r1.error ?? "", /No se hizo nada\.$/);
    assert.deepEqual(await estado(C.id), alEmpezar, "1 PENDING: no cambió nada");
    const directo = await aplicarPase(
      { nombre: "tomas", esDuenio: true },
      C.id,
      { accion: "pasar-a-real", huellaVista: await huella(C.id), slugTipeado: C.slug },
      "real",
    );
    assert.equal(directo.tipo, "rechazado", "el núcleo también lo niega");
    assert.deepEqual(await estado(C.id), alEmpezar);

    // 2. ARCA la rechazó y el envío se cerró: eso ya no frena. Una autorizada en pruebas, sí.
    await operatorPrisma.invoice.update({ where: { id: pendiente.id }, data: { status: "REJECTED", rechazoMotivo: "qa" } });
    await operatorPrisma.outboxEvent.updateMany({ where: { tenantId: C.id }, data: { processedAt: new Date() } });
    const autorizada = { ...factura, status: "AUTHORIZED" as const, tipoComprobante: 11, caeVencimiento: "20261001" };
    await operatorPrisma.invoice.create({
      data: { ...autorizada, numero: 1, cae: "70000000000001", authorizedAt: new Date(Date.now() - 3 * 3_600_000) },
    });
    const r2 = await pedirPase();
    assert.match(r2.error ?? "", /Hay 1 comprobante autorizado en pruebas, con CAE de homologación: si pasa a real se mezclan con los reales/);
    assert.match(r2.error ?? "", /Avisale al dueño de GSG\./);
    assert.deepEqual(await estado(C.id), alEmpezar, "1 autorizada en pruebas: no cambió nada");

    // 3. Una vuelta a pruebas registrada DESPUÉS de esa factura: fue de la etapa real, ya no cuenta.
    const vuelta = await operatorPrisma.auditLog.create({
      data: {
        tenantId: C.id,
        actor: "operator:tomas",
        action: ACCION_AUDITORIA["volver-a-pruebas"],
        entity: "Tenant",
        entityId: C.id,
        changes: { accion: "volver-a-pruebas", arcaHomologacion: { antes: false, despues: true } },
        createdAt: new Date(Date.now() - 2 * 3_600_000),
      },
    });
    const f3 = await leerFichaDelPase(C.id, "real");
    assert.deepEqual(f3?.comprobantesDePrueba, { esperandoCae: 0, enviosAbiertos: 0, autorizados: 0, desde: vuelta.createdAt.toISOString() });
    const r3 = await pedirPase();
    assert.match(r3.ok ?? "", /pasó a facturación real/);
    const pase = await operatorPrisma.auditLog.findFirstOrThrow({ where: { tenantId: C.id, action: ACCION_AUDITORIA["pasar-a-real"] } });
    assert.deepEqual((pase.changes as Record<string, unknown>).comprobantesDePrueba, f3?.comprobantesDePrueba, "el conteo queda en AuditLog");

    // 4. Vuelve a pruebas y se autoriza una en pruebas: el próximo pase se niega y dice desde cuándo.
    assert.match((await confirmar(C.id, { accion: "volver-a-pruebas" })).ok ?? "", /volvió a facturar en pruebas/);
    await operatorPrisma.invoice.create({
      data: { ...autorizada, numero: 2, cae: "70000000000002", authorizedAt: new Date(Date.now() + 1_000) },
    });
    const antesDelSegundo = await estado(C.id);
    const r4 = await pedirPase();
    assert.match(r4.error ?? "", /Hay 1 comprobante autorizado en pruebas desde que volvió a pruebas el \d{2}\/\d{2}\/\d{4}/);
    assert.deepEqual(await estado(C.id), antesDelSegundo, "autorizada después de la vuelta: no cambió nada");
  });

  await t.test("el negocio B queda intacto, aunque le manden la confirmación de A", async () => {
    await fichaEnRegla(A.id);
    const r = await confirmar(B.id, { accion: "pasar-a-real", huella: await huella(A.id), slug: A.slug });
    assert.ok(r.error, "se niega");
    assert.deepEqual(await deB(), bAlEmpezar);
  });
});
