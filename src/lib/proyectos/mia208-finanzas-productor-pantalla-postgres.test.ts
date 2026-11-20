// ============================================================================
// GSG-MIA-208 · 3, la pantalla: en Finanzas de la ficha, el productor (rol de gestión PRODUCCION con «Pagos · editar»,
// usuario que no ve la plata) no ve «Marcar cobrado» ni «Anular»; la dueña sí. El servidor ya lo rechaza
// (mia208-libro-protegido-postgres, test 3); esto fija que la pantalla no le ofrece un botón que va a fallar.
// Renderiza `PestanaFinanzas` de verdad (base efímera migrada, app_rls, sesión) y, con MIA208_CAPTURAS=<carpeta>, saca
// las capturas de las dos vistas en Chromium (no van a Git).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const EVENTO = new Date("2027-06-15T15:00:00Z");
const DIA = 86_400_000;

test("3 · Finanzas de la ficha: el productor no ve «Marcar cobrado» ni «Anular»; la dueña sí", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const en = async <R>(quien: "duenia" | "recepcion", fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a[quien].id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const ficha = await import("./acciones-ficha");
  const gestion = await import("./gestion.server");
  const p = await duenio.proyecto.create({
    data: { tenantId: a.id, numero: 7301, clientId: a.clientes[0], nombre: "Stand Aurora", servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(EVENTO.getTime() - 2 * DIA), fechaEvento: EVENTO, fechaDesarme: new Date(EVENTO.getTime() + DIA) },
    select: { id: true },
  });
  const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `mia208p-${p.id}`, ivaPct: 21 }, select: { id: true } });
  await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
  await en("duenia", () => gestion.regenerarCuotas(a.id, p.id));
  const anticipo = await duenio.proyectoCuota.findFirstOrThrow({ where: { proyectoId: p.id, tipo: "COBRO", clave: { endsWith: ":cliente:anticipo" } }, select: { id: true } });
  const fd = new FormData();
  for (const [k, v] of Object.entries({ envio: "mia208-pantalla-0001", id: anticipo.id, medio: "TRANSFERENCIA", cuenta: "ninguna" })) fd.set(k, v);
  const cobro = await en("duenia", () => ficha.marcarCuota(fd));
  assert.equal(cobro.ok, true, JSON.stringify(cobro));
  await duenio.proyectoGasto.create({ data: { tenantId: a.id, proyectoId: p.id, descripcion: "Flete", neto: 10_000, pagadoEl: EVENTO, medio: "EFECTIVO", pagadoPor: "Dueña" } });
  // El productor, como `produccion@` de la corrida.
  await duenio.user.update({ where: { id: a.recepcion.id }, data: { role: "PROFESSIONAL" } });
  const persona = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: "Producción de prueba", rol: "PRODUCCION" }, select: { id: true } });
  await duenio.proyectoEquipo.create({ data: { tenantId: a.id, proyectoId: p.id, personaId: persona.id, funcion: "PRODUCTOR" } });

  const { prerender } = await import("react-dom/static");
  const { exigirVer } = await import("./gestion.server");
  const { cabeceraFicha, vistaDe } = await import("./ficha.server");
  const { PestanaFinanzas } = await import("@/app/admin/(dashboard)/proyectos/[id]/_pestanas-plata");
  const { default: ToastProvider } = await import("@/app/admin/(dashboard)/ToastProvider");
  const pantalla = (quien: "duenia" | "recepcion") =>
    en(quien, async () => {
      const actor = await exigirVer("pipeline");
      const cab = await cabeceraFicha(actor, p.id);
      assert.ok(cab, `${quien} ve la ficha`);
      const vista = vistaDe(actor);
      // Es un componente de servidor asíncrono: se resuelve a mano y se pinta lo que devuelve.
      const arbol = (await PestanaFinanzas({ a: actor, cab, vista })) as ReactElement;
      const { prelude } = await prerender(createElement(ToastProvider, null, arbol));
      return { html: await new Response(prelude).text(), editaPagos: vista.editaPagos };
    });
  const deLaDuenia = await pantalla("duenia");
  const delProductor = await pantalla("recepcion");
  const botones = (html: string) => ({
    marcarCobrado: html.includes(">Marcar cobrado<"),
    anularCobro: html.includes('aria-label="Anular cobro de'),
    anularGasto: html.includes('aria-label="Anular gasto Flete"'),
  });
  assert.deepEqual(botones(deLaDuenia.html), { marcarCobrado: true, anularCobro: true, anularGasto: true }, "la dueña ve los tres");
  assert.equal(delProductor.editaPagos, true, "el productor tiene «Pagos · editar» (el caso de la corrida)");
  assert.deepEqual(botones(delProductor.html), { marcarCobrado: false, anularCobro: false, anularGasto: false }, "el productor no ve ninguno");

  const carpeta = process.env.MIA208_CAPTURAS;
  if (!carpeta) return;
  const { prepararNavegador } = await import("@/test/navegador-componentes");
  const nav = await prepararNavegador("export {};");
  if (typeof nav === "string") return t.diagnostic(`sin capturas: ${nav}`);
  try {
    for (const [nombre, html] of [["duenia", deLaDuenia.html], ["productor", delProductor.html]] as const) {
      for (const [ancho, alto, sufijo] of [[390, 844, "movil"], [1280, 900, "escritorio"]] as const) {
        const page = await nav.browser.newPage({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 2, locale: "es-AR" });
        await page.setContent(`<!doctype html><html lang="es"><head><style>${nav.css}</style></head><body><div id="root" data-skin="fable" data-diseno="renglon" data-theme="light" data-density="lite" class="min-h-dvh bg-surface p-4">${html}</div></body></html>`);
        await page.screenshot({ path: `${carpeta}/mia208-3-finanzas-${nombre}-${sufijo}.png`, fullPage: true });
        await page.close();
      }
    }
  } finally {
    await nav.browser.close();
  }
});
