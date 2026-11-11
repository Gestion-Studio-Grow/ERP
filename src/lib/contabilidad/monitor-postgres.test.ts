// ============================================================================
// MONITOR DE OBLIGACIONES CONTRA POSTGRES (FC-11 · T7) — base efímera con RLS.
// ============================================================================
//
// Dos negocios sintéticos, A y B, con la conexión de la app (`app_rls`, sin BYPASSRLS):
//   · el monitor de A no muestra nada de B (y viceversa);
//   · B no puede asignar responsable, prender/apagar ni marcar con ids de A;
//   · las obligaciones que dependen del perfil fiscal (SICORE) entran apagadas y no generan
//     vencimientos hasta que se prenden;
//   · marcar desde el estudio deja rastro en AuditLog del negocio, con su canal;
//   · lo vencido se ve vencido sin que nadie lo marque.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
// 15:00 del 20/04/2026 en Buenos Aires: lo de marzo (vence en abril) está alrededor de hoy.
const AHORA = new Date("2026-04-20T18:00:00Z");

let preparado: Promise<void> | null = null;
async function preparar(base: BaseEfimera) {
  preparado ??= (async () => {
    apuntarLaAppA(base);
    const duenio = await prismaComoDuenio(base);
    await duenio.tenant.update({ where: { id: base.a.id }, data: { arcaCuit: "20123456786" } });
    await duenio.tenant.update({ where: { id: base.b.id }, data: { arcaCuit: "20100000130" } });
    const repo = await import("./repo");
    for (const t of [base.a.id, base.b.id]) {
      const r = await repo.generarCalendario(t, null, "2026-03");
      assert.ok(r.ok, JSON.stringify(r));
    }
  })();
  await preparado;
  return { repo: await import("./repo"), monitor: await import("./monitor.server"), duenio: await prismaComoDuenio(base) };
}

test("aislamiento: el monitor de cada negocio muestra sólo lo suyo", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { monitor, duenio } = await preparar(base);

  const deA = await monitor.leerMonitor(base.a.id, { ahora: AHORA });
  const deB = await monitor.leerMonitor(base.b.id, { ahora: AHORA });
  assert.ok(deA.ok && deB.ok);
  assert.ok(deA.monitor.filas.length > 0 && deB.monitor.filas.length > 0);

  const idsA = new Set((await duenio.vencimientoFiscal.findMany({ where: { tenantId: base.a.id }, select: { id: true } })).map((v) => v.id));
  const idsB = new Set((await duenio.vencimientoFiscal.findMany({ where: { tenantId: base.b.id }, select: { id: true } })).map((v) => v.id));
  assert.ok(deA.monitor.filas.every((f) => idsA.has(f.id) && !idsB.has(f.id)), "A no ve vencimientos de B");
  assert.ok(deB.monitor.filas.every((f) => idsB.has(f.id) && !idsA.has(f.id)), "B no ve vencimientos de A");

  const oblA = new Set(deA.obligaciones.map((o) => o.id));
  assert.ok(deB.obligaciones.every((o) => !oblA.has(o.id)), "B no ve obligaciones de A");
});

test("perfil fiscal: SICORE entra apagada y sin vencimientos; prendida, se genera", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo, monitor, duenio } = await preparar(base);

  const sicore = await duenio.obligacionFiscal.findFirstOrThrow({ where: { tenantId: base.a.id, codigo: "SICORE" } });
  assert.equal(sicore.activa, false);
  assert.equal(await duenio.vencimientoFiscal.count({ where: { obligacionId: sicore.id } }), 0);

  // B no puede prenderla.
  const ajeno = await repo.activarObligacion(base.b.id, sicore.id, true);
  assert.ok(!ajeno.ok && ajeno.error === "NO_ENCONTRADO");
  assert.equal((await duenio.obligacionFiscal.findUniqueOrThrow({ where: { id: sicore.id } })).activa, false);

  assert.ok((await repo.activarObligacion(base.a.id, sicore.id, true)).ok);
  const r = await repo.generarCalendario(base.a.id, null, "2026-03");
  assert.ok(r.ok && r.creados === 1, JSON.stringify(r));
  const v = await duenio.vencimientoFiscal.findFirstOrThrow({ where: { obligacionId: sicore.id } });
  assert.equal(v.fechaVencimiento.toISOString().slice(0, 10), "2026-04-13"); // sábado 11 → lunes 13

  // Vence el 13 y hoy es 20: se ve vencido sin que nadie lo marque.
  const m = await monitor.leerMonitor(base.a.id, { ahora: AHORA });
  assert.ok(m.ok);
  const fila = m.monitor.filas.find((f) => f.id === v.id);
  assert.equal(fila?.situacion, "VENCIDO");
  assert.equal((await duenio.vencimientoFiscal.findUniqueOrThrow({ where: { id: v.id } })).estado, "PENDIENTE");
});

test("responsable: lo asigna el negocio dueño; B no puede con ids de A", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { monitor, duenio } = await preparar(base);

  const iva = await duenio.obligacionFiscal.findFirstOrThrow({ where: { tenantId: base.a.id, codigo: "IVA_MENSUAL" } });
  const ajeno = await monitor.asignarResponsable(base.b.id, iva.id, "ESTUDIO", "admin:intruso");
  assert.ok(!ajeno.ok && ajeno.error === "NO_ENCONTRADO");
  assert.equal(await duenio.auditLog.count({ where: { entityId: iva.id } }), 0);

  assert.ok((await monitor.asignarResponsable(base.a.id, iva.id, "ESTUDIO", "admin:sintetico")).ok);
  const m = await monitor.leerMonitor(base.a.id, { ahora: AHORA });
  assert.ok(m.ok);
  assert.equal(m.obligaciones.find((o) => o.id === iva.id)?.responsable, "ESTUDIO");
  assert.ok(m.monitor.filas.filter((f) => f.obligacionId === iva.id).every((f) => f.responsable === "ESTUDIO"));

  const deB = await monitor.leerMonitor(base.b.id, { ahora: AHORA });
  assert.ok(deB.ok);
  assert.ok(deB.obligaciones.every((o) => o.responsable === "NEGOCIO"), "lo asignado en A no se filtra a B");
});

test("el estudio marca: queda el rastro en el negocio; con ids de otro negocio no toca nada", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo, monitor, duenio } = await preparar(base);

  const v = await duenio.vencimientoFiscal.findFirstOrThrow({ where: { tenantId: base.a.id, estado: "PENDIENTE" } });
  const ajeno = await repo.cambiarEstadoVencimiento(base.b.id, v.id, "PAGADO", {}, { actor: "estudio:otro/x", channel: "estudio" });
  assert.ok(!ajeno.ok && ajeno.error === "NO_ENCONTRADO");
  assert.equal(await duenio.auditLog.count({ where: { entityId: v.id } }), 0);

  const ok = await repo.cambiarEstadoVencimiento(base.a.id, v.id, "PRESENTADO", {}, { actor: "estudio:Estudio Sintético/Contadora", channel: "estudio" });
  assert.ok(ok.ok);
  const rastro = await duenio.auditLog.findMany({ where: { entityId: v.id } });
  assert.equal(rastro.length, 1);
  assert.equal(rastro[0].tenantId, base.a.id);
  assert.equal(rastro[0].channel, "estudio");
  assert.deepEqual(rastro[0].changes, { antes: "PENDIENTE", despues: "PRESENTADO" });

  // Desde el negocio se infiere que hay estudio (ya marcó algo); B sigue sin estudio.
  const m = await monitor.leerMonitor(base.a.id, { ahora: AHORA });
  const mb = await monitor.leerMonitor(base.b.id, { ahora: AHORA });
  assert.ok(m.ok && mb.ok);
  assert.equal(m.tieneEstudio, true);
  assert.equal(mb.tieneEstudio, false);
});
