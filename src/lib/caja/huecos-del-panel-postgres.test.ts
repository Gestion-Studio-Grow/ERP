// MIA-141 (certificación MIA-139 de #199): tres huecos que quedaban con el panel apagado. Contra Postgres real y como
// `app_rls` (RLS aplicado; el dueño de la base sólo siembra y cuenta filas antes y después), con la sesión de cada persona:
//   1. `getAperturaEnVender` no miraba la app: en un negocio con casa devolvía el efectivo esperado del cajón.
//   2. Cierre del mes (`congelarMesAction`, `reabrirMesAction`) usaba `requireAppAccion`, que no ve la casa ni el rol de
//      gestión: la Dirección de un negocio con casa congelaba y reabría.
//   3. El rebote por PRODUCTO del layout (Factoque → /facturita/app, Contador → /contador) no estaba en
//      `motivoDeLaPantalla`: las acciones de #199 escribían en Factoque y en Contador.
// CH (beauty-spa) queda igual: su producto es el vertical y sus acciones andan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba, type UsuarioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const NO_DISPONIBLE = /esta app no es parte|no tiene acceso a esta app/;

const form = (c: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(c)) fd.set(k, v);
  return fd;
};

test("huecos del panel apagado: apertura en Vender, Cierre del mes y el rebote por producto", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(laBase);
  const { a, b } = laBase;
  const { getAperturaEnVender } = await import("@/lib/caja-actions");
  const { addLibroEntry } = await import("@/lib/libro-caja-actions");
  const { congelarMesAction, reabrirMesAction } = await import("@/lib/cierre-mes/acciones");
  const { updateAccentPresetAction } = await import("@/lib/apariencia-actions");
  const { dateStrInBusinessTz } = await import("@/lib/datetime");
  const hoy = dateStrInBusinessTz(new Date());
  // El mes anterior: ya terminó, así que congelarlo escribiría de verdad si la guarda lo dejara pasar.
  const [anio, mm] = hoy.slice(0, 7).split("-").map(Number);
  const mes = mm === 1 ? `${anio - 1}-12` : `${anio}-${String(mm - 1).padStart(2, "0")}`;

  // A = productora con panel cerrado: la Dirección abre Caja (prendida). B = negocio con casa (el club).
  await duenio.tenant.update({ where: { id: a.id }, data: { blueprintId: "productora", modules: ["proyectos"] } });
  await duenio.tenant.update({ where: { id: b.id }, data: { modules: ["club"], accentPreset: null } });
  // Efectivo en el cajón de los dos, para que «el esperado» tenga un número que filtrar.
  for (const n of [a, b]) {
    await duenio.cashMovement.create({ data: { tenantId: n.id, type: "INGRESO", method: "EFECTIVO", amount: 7300, reason: "Seña", createdBy: "seed" } });
  }

  const huella = async (n: NegocioDePrueba) => {
    const [turnos, movimientos, auditoria, negocio] = await Promise.all([
      duenio.cashSession.count({ where: { tenantId: n.id } }),
      duenio.cashMovement.count({ where: { tenantId: n.id } }),
      duenio.auditLog.count({ where: { tenantId: n.id } }),
      duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { accentPreset: true } }),
    ]);
    return { turnos, movimientos, auditoria, acento: negocio.accentPreset };
  };
  const rechaza = async (n: NegocioDePrueba, u: UsuarioDePrueba, nombre: string, f: () => Promise<unknown>) => {
    const antes = await huella(n);
    const r = await ejecutarAccion({ negocio: n, usuario: u }, f);
    const valor = r.tipo === "respuesta" ? (r.valor as { ok?: boolean } | null) : null;
    const texto = JSON.stringify(valor);
    assert.ok(r.tipo === "respuesta" && valor?.ok === false && NO_DISPONIBLE.test(texto), `${nombre} (${u.rol} de ${n.slug}) NO rechazó por la app: ${r.tipo} ${texto}`);
    const despues = await huella(n);
    assert.deepEqual(despues, antes, `${nombre} (${u.rol} de ${n.slug}) escribió en la base`);
    t.diagnostic(`${nombre} · filas antes ${JSON.stringify(antes)} · después ${JSON.stringify(despues)} · ${texto}`);
  };
  const anda = async (n: NegocioDePrueba, u: UsuarioDePrueba, nombre: string, f: () => Promise<unknown>) => {
    const r = await ejecutarAccion({ negocio: n, usuario: u }, f);
    assert.equal(r.tipo, "respuesta", `${nombre} cortó con ${r.tipo}`);
    assert.equal((r as { valor: { ok?: boolean } }).valor?.ok, true, `${nombre}: ${JSON.stringify((r as { valor: unknown }).valor)}`);
  };
  const apertura = async (n: NegocioDePrueba, u: UsuarioDePrueba) => {
    const r = await ejecutarAccion({ negocio: n, usuario: u }, () => getAperturaEnVender());
    assert.equal(r.tipo, "respuesta", `getAperturaEnVender cortó con ${r.tipo}: Vender no puede caerse`);
    return (r as { valor: Awaited<ReturnType<typeof getAperturaEnVender>> }).valor;
  };

  // ── 1 · Apertura sugerida en Vender ────────────────────────────────────────────────────────────────────────
  await t.test("1 · prendida: la Dirección de A ve el esperado del cajón", async () => {
    const v = await apertura(a, a.duenia);
    assert.equal(v?.esperado, 7300);
  });
  await t.test("1 · apagada: la dueña de B (casa) no recibe el esperado del cajón", async () => {
    const antes = await huella(b);
    const v = await apertura(b, b.duenia);
    t.diagnostic(`getAperturaEnVender en B: ${JSON.stringify(v)}`);
    assert.equal(v, null, `con la caja fuera del panel devolvió ${JSON.stringify(v)}`);
    assert.deepEqual(await huella(b), antes);
  });

  // ── 2 · Cierre del mes con casa ─────────────────────────────────────────────────────────────────────────────
  await t.test("2 · apagada: la Dirección de B (casa) no congela ni reabre el mes", async () => {
    await rechaza(b, b.duenia, "congelarMesAction", () => congelarMesAction(null, form({ mes })));
    await rechaza(b, b.duenia, "reabrirMesAction", () => reabrirMesAction(null, form({ mes, motivo: "Faltaba una factura" })));
  });
  // ── 3 · Rebote por producto: Factoque y Contador ────────────────────────────────────────────────────────────
  for (const [nombre, data] of [
    ["Factoque", { blueprintId: "facturita", modules: [] as string[] }],
    ["Contador", { blueprintId: null, modules: ["cartera"] }],
  ] as const) {
    await t.test(`3 · apagada: en ${nombre} la dueña no escribe con las acciones del panel`, async () => {
      await duenio.tenant.update({ where: { id: b.id }, data: { blueprintId: data.blueprintId, modules: [...data.modules], accentPreset: null } });
      await rechaza(b, b.duenia, `updateAccentPresetAction (${nombre})`, () => updateAccentPresetAction("verde"));
      await rechaza(b, b.duenia, `addLibroEntry (${nombre})`, () => addLibroEntry(null, form({ date: hoy, detail: "Hielo", type: "EGRESO", method: "EFECTIVO", amount: "1.300" })));
      assert.equal(await apertura(b, b.duenia), null);
    });
  }

  // ── CH sin cambios: beauty-spa es el vertical ─────────────────────────────────────────────────────────────
  await t.test("CH (beauty-spa): la dueña cambia el color y carga en el libro como siempre", async () => {
    await duenio.tenant.update({ where: { id: b.id }, data: { blueprintId: "beauty-spa", modules: [], accentPreset: null } });
    await anda(b, b.duenia, "updateAccentPresetAction", () => updateAccentPresetAction("verde"));
    await anda(b, b.duenia, "addLibroEntry", () => addLibroEntry(null, form({ date: hoy, detail: "Hielo", type: "EGRESO", method: "EFECTIVO", amount: "1.300" })));
    assert.equal((await huella(b)).acento, "verde");
    assert.ok((await apertura(b, b.duenia)) !== null, "CH perdió la tarjeta de apertura");
    // Cierre del mes: pasa la guarda de la app (si hay error, es del estado del mes, no de la app).
    const r = await ejecutarAccion({ negocio: b, usuario: b.duenia }, () => reabrirMesAction(null, form({ mes, motivo: "Faltaba una factura" })));
    assert.equal(r.tipo, "respuesta");
    assert.ok(!NO_DISPONIBLE.test(JSON.stringify((r as { valor: unknown }).valor)), `rebotó por la app: ${JSON.stringify((r as { valor: unknown }).valor)}`);
  });
});
