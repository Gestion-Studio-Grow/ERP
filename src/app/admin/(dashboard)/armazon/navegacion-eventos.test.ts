// Eventos y sponsors (GSG-CRM-009): con el interruptor «eventos-sponsors» prendido y un rol que la
// abre, la app entra al menú y al buscador, también en el panel cerrado de una productora (MIA);
// apagado (el default) o sin permiso, la navegación queda idéntica.
import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogo } from "@/modules/catalog";
import { appPorId } from "@/apps/registro";
import { appPermitida, appsVisibles, conProyectosEnLaBarra, proyectarMenuDeHoy, resolverContextoApps, type NegocioApps, type TenantParaApps } from "@/apps/visibles";
import { INTERRUPTORES_DE_LA_CONSOLA, eventosSponsorsPrendido } from "@/cambios/interruptores";
import type { Role } from "@/lib/capabilities";
import { appDeGestionVisible, appEnLaBarra } from "@/lib/proyectos/gestion-core";
import { appsDeInterruptores, armarNavegacion } from "./navegacion";

const CH: TenantParaApps = { id: "t-ch", slug: "beauty-spa", blueprintId: null, modules: [] };
const PRODUCTORA: TenantParaApps = { id: "t-mia", slug: "mia", blueprintId: "productora", modules: ["proyectos", "clients"] };
const PRENDIDO = { "eventos-sponsors": { encendido: true } } as const;
const APAGADO = { "eventos-sponsors": { encendido: false } } as const;
const RUTA = "/admin/eventos";

function negocio(role: Role, t: TenantParaApps = CH, enInicioPorApps = false): NegocioApps {
  return {
    role,
    contexto: resolverContextoApps(t, { registroGlobal: false, enInicioPorApps }, catalogo()),
    modulosAsignados: t.modules,
    perfil: null,
    esMostrador: false,
    carniceriaLista: false,
  };
}

function nav(n: NegocioApps, interruptores: Parameters<typeof appsDeInterruptores>[0]) {
  const visibles = appsVisibles(n);
  const menu = proyectarMenuDeHoy(visibles);
  return armarNavegacion({ visibles, menu, modoApps: false, esMostrador: false, role: n.role, extras: appsDeInterruptores(interruptores, n) });
}
const rutas = (x: ReturnType<typeof nav>) => x.espacios.flatMap((e) => e.apps.map((a) => a.ruta));

test("el interruptor existe en la consola, apagado por defecto (un estado sin la entrada es apagado)", () => {
  assert.ok(INTERRUPTORES_DE_LA_CONSOLA.some((i) => i.id === "eventos-sponsors"));
  assert.equal(eventosSponsorsPrendido({}), false);
  assert.equal(eventosSponsorsPrendido(APAGADO), false);
  assert.equal(eventosSponsorsPrendido(PRENDIDO), true);
});

test("la app no se ofrece sola en el lanzador: sólo entra por el interruptor", () => {
  assert.equal(appPorId("eventos-sponsors").enLanzador, false);
  for (const t of [CH, PRODUCTORA]) assert.ok(!appsVisibles(negocio("OWNER", t)).some((a) => a.id === "eventos-sponsors"));
});

test("prendido + dueño: entra al menú y al buscador una sola vez (CH y productora con panel cerrado)", () => {
  for (const t of [CH, PRODUCTORA]) {
    const n = negocio("OWNER", t, t === PRODUCTORA);
    assert.ok(appPermitida(appPorId("eventos-sponsors"), n), `${t.slug}: permitida`);
    const x = nav(n, PRENDIDO);
    assert.equal(rutas(x).filter((r) => r === RUTA).length, 1, `${t.slug}: una entrada`);
    assert.ok(x.comandos.some((c) => c.href === RUTA), `${t.slug}: en el buscador`);
  }
});

test("apagado: la navegación es idéntica a la de siempre", () => {
  for (const role of ["OWNER", "RECEPTION", "PROFESSIONAL"] as const) {
    const n = negocio(role);
    const visibles = appsVisibles(n);
    const base = armarNavegacion({ visibles, menu: proyectarMenuDeHoy(visibles), modoApps: false, esMostrador: false, role });
    assert.deepEqual(appsDeInterruptores(APAGADO, n), []);
    assert.deepEqual(appsDeInterruptores({}, n), []);
    assert.deepEqual(nav(n, APAGADO), base, `${role}: sin cambios`);
  }
});

test("sin clients:read (profesional): no la ve aunque esté prendido", () => {
  assert.deepEqual(appsDeInterruptores(PRENDIDO, negocio("PROFESSIONAL")), []);
});

test("los dos interruptores juntos: vouchers y eventos, cada uno con su app", () => {
  const ids = appsDeInterruptores({ vouchers: { encendido: true }, "eventos-sponsors": { encendido: true } }, negocio("OWNER")).map((a) => a.id);
  assert.deepEqual(ids, ["vouchers", "eventos-sponsors"]);
});

test("panel de gestión de la productora (layout con `actor`): prendido, Comercial y Dirección la tienen en la barra; Diseño no; apagado, nada", () => {
  const n = negocio("OWNER", PRODUCTORA, true);
  const base = appsVisibles(n);
  for (const [estado, rol, espera] of [
    [PRENDIDO, "DIRECCION", true],
    [PRENDIDO, "COMERCIAL", true],
    [PRENDIDO, "DISENO", false],
    [APAGADO, "DIRECCION", false],
  ] as const) {
    // Lo mismo que arma src/app/admin/(dashboard)/layout.tsx para el panel con `actor`.
    const delPanel = [...base, ...appsDeInterruptores(estado, n).filter((x) => !base.some((v) => v.id === x.id))];
    const abribles = delPanel.filter((a) => appDeGestionVisible(a.id, rol, []));
    const visibles = abribles.filter((a) => appEnLaBarra(a.id, rol));
    const barra = conProyectosEnLaBarra(proyectarMenuDeHoy(visibles), visibles);
    assert.equal(abribles.some((a) => a.ruta === RUTA), espera, `${rol} abre`);
    assert.equal(barra.filter((i) => i.href === RUTA).length, espera ? 1 : 0, `${rol} en la barra`);
    const armada = armarNavegacion({ visibles, menu: barra, modoApps: true, esMostrador: n.esMostrador, role: "OWNER", extras: visibles.filter((a) => a.enLanzador === false) });
    assert.equal(armada.espacios.flatMap((e) => e.apps).filter((a) => a.ruta === RUTA).length, espera ? 1 : 0, `${rol} en el armazón nuevo`);
  }
});
