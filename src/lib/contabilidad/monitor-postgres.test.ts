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

test("transición del estudio en el servidor: lo cerrado por el negocio no se pisa (H1)", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo, duenio } = await preparar(base);
  const { desdeDondeMarcaElEstudio } = await import("./monitor");
  const delEstudio = (hacia: "PRESENTADO" | "PAGADO") => ({ desde: (accion: Parameters<typeof desdeDondeMarcaElEstudio>[1]) => desdeDondeMarcaElEstudio(hacia, accion) });
  const auditoria = { actor: "estudio:E/u", channel: "estudio" as const };

  const vs = await duenio.vencimientoFiscal.findMany({ where: { tenantId: base.a.id, estado: "PENDIENTE", obligacion: { accion: "AMBAS" } }, take: 3 });
  assert.equal(vs.length, 3);
  await duenio.vencimientoFiscal.update({ where: { id: vs[0].id }, data: { estado: "NO_CORRESPONDE" } });
  await duenio.vencimientoFiscal.update({ where: { id: vs[1].id }, data: { estado: "VERIFICADO", fechaPago: new Date("2026-04-10") } });

  // Antes pasaban (HALLAZGO del certificador): NO_CORRESPONDE → PAGADO y VERIFICADO → PRESENTADO.
  const a = await repo.cambiarEstadoVencimiento(base.a.id, vs[0].id, "PAGADO", {}, auditoria, delEstudio("PAGADO"));
  const b = await repo.cambiarEstadoVencimiento(base.a.id, vs[1].id, "PRESENTADO", {}, auditoria, delEstudio("PRESENTADO"));
  assert.ok(!a.ok && a.error === "TRANSICION_INVALIDA", JSON.stringify(a));
  assert.ok(!b.ok && b.error === "TRANSICION_INVALIDA", JSON.stringify(b));
  assert.equal((await duenio.vencimientoFiscal.findUniqueOrThrow({ where: { id: vs[0].id } })).estado, "NO_CORRESPONDE");
  assert.equal((await duenio.vencimientoFiscal.findUniqueOrThrow({ where: { id: vs[1].id } })).estado, "VERIFICADO");
  assert.equal(await duenio.auditLog.count({ where: { entityId: { in: [vs[0].id, vs[1].id] } } }), 0);

  // PENDIENTE → PRESENTADO → PAGADO sí; PAGADO → PRESENTADO no.
  assert.ok((await repo.cambiarEstadoVencimiento(base.a.id, vs[2].id, "PRESENTADO", {}, auditoria, delEstudio("PRESENTADO"))).ok);
  assert.ok((await repo.cambiarEstadoVencimiento(base.a.id, vs[2].id, "PAGADO", {}, auditoria, delEstudio("PAGADO"))).ok);
  const vuelta = await repo.cambiarEstadoVencimiento(base.a.id, vs[2].id, "PRESENTADO", {}, auditoria, delEstudio("PRESENTADO"));
  assert.ok(!vuelta.ok && vuelta.error === "TRANSICION_INVALIDA");

  // «Presentado» en una obligación que sólo se paga: rechazo.
  const soloPago = await duenio.vencimientoFiscal.findFirst({ where: { tenantId: base.a.id, estado: "PENDIENTE", obligacion: { accion: "PAGO" } } });
  if (soloPago) {
    const p = await repo.cambiarEstadoVencimiento(base.a.id, soloPago.id, "PRESENTADO", {}, auditoria, delEstudio("PRESENTADO"));
    assert.ok(!p.ok && p.error === "TRANSICION_INVALIDA");
  }
});

test("rastro del estudio con ids y «antes» real aunque marquen a la vez (H2 · H3)", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo, duenio } = await preparar(base);

  const v = await duenio.vencimientoFiscal.findFirstOrThrow({ where: { tenantId: base.a.id, estado: "PENDIENTE", obligacion: { accion: "AMBAS" } } });
  const rs = await Promise.all([
    repo.cambiarEstadoVencimiento(base.a.id, v.id, "PAGADO", {}, {
      actor: "estudio:E/u",
      channel: "estudio",
      ids: { estudioTenantId: base.b.id, usuarioId: "usuario-sintetico" },
    }),
    repo.cambiarEstadoVencimiento(base.a.id, v.id, "NO_CORRESPONDE", {}, { actor: "admin:x", channel: "admin" }),
  ]);
  for (const r of rs) assert.ok(r.ok || r.error === "CAMBIO_CONCURRENTE", JSON.stringify(r));
  const rastro = await duenio.auditLog.findMany({ where: { entityId: v.id }, orderBy: { createdAt: "asc" } });
  assert.equal(rastro.length, rs.filter((r) => r.ok).length);
  const antes = rastro.map((r) => (r.changes as { antes: string }).antes);
  assert.equal(new Set(antes).size, antes.length, `dos «antes» iguales: ${JSON.stringify(antes)}`);
  // La cadena cierra: cada «antes» es el «después» del anterior, y el último «después» es lo guardado.
  const cambios = rastro.map((r) => r.changes as { antes: string; despues: string });
  assert.equal(cambios[0].antes, "PENDIENTE");
  for (let i = 1; i < cambios.length; i++) assert.equal(cambios[i].antes, cambios[i - 1].despues);
  assert.equal((await duenio.vencimientoFiscal.findUniqueOrThrow({ where: { id: v.id } })).estado, cambios.at(-1)?.despues);
  const delEstudio = rastro.find((r) => r.channel === "estudio");
  if (delEstudio) {
    assert.deepEqual(delEstudio.changes, { estudioTenantId: base.b.id, usuarioId: "usuario-sintetico", antes: (delEstudio.changes as { antes: string }).antes, despues: "PAGADO" });
  }
});

test("GANANCIAS_DDJJ se siembra apagada y no genera vencimientos (H6)", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  const { repo, duenio } = await preparar(base);
  assert.ok((await repo.generarCalendario(base.a.id, null, "2025")).ok);
  const ddjj = await duenio.obligacionFiscal.findFirstOrThrow({ where: { tenantId: base.a.id, codigo: "GANANCIAS_DDJJ" } });
  assert.equal(ddjj.activa, false);
  assert.equal(await duenio.vencimientoFiscal.count({ where: { obligacionId: ddjj.id } }), 0);
});
