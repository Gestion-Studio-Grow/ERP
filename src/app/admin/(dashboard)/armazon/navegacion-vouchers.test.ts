// QA vouchers (CALLEJÓN): /admin/vouchers no tenía entrada en el menú del diseño nuevo. Con el
// interruptor «vouchers» prendido y un rol que la abre, entra al menú (espacio Caja/Finanzas) y al
// buscador; apagado o sin permiso, la navegación queda idéntica.
import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogo } from "@/modules/catalog";
import { appsVisibles, proyectarMenuDeHoy, resolverContextoApps, type NegocioApps, type TenantParaApps } from "@/apps/visibles";
import type { Role } from "@/lib/capabilities";
import { appsDeInterruptores, armarNavegacion } from "./navegacion";

const CH: TenantParaApps = { id: "t-ch", slug: "beauty-spa", blueprintId: null, modules: [] };
const PRENDIDO = { vouchers: { encendido: true } } as const;
const APAGADO = { vouchers: { encendido: false } } as const;

function negocio(role: Role): NegocioApps {
  return {
    role,
    contexto: resolverContextoApps(CH, { registroGlobal: false, enInicioPorApps: false }, catalogo()),
    modulosAsignados: CH.modules,
    perfil: null,
    esMostrador: false,
    carniceriaLista: false,
  };
}

function nav(role: Role, interruptores: Parameters<typeof appsDeInterruptores>[0]) {
  const n = negocio(role);
  const visibles = appsVisibles(n);
  const menu = proyectarMenuDeHoy(visibles);
  return armarNavegacion({ visibles, menu, modoApps: false, esMostrador: false, role, extras: appsDeInterruptores(interruptores, n) });
}

const rutas = (n: ReturnType<typeof nav>) => n.espacios.flatMap((e) => e.apps.map((a) => a.ruta));

test("interruptor prendido + rol con permiso: «Vouchers» entra al menú y al buscador, una sola vez", () => {
  for (const role of ["OWNER", "RECEPTION"] as const) {
    const n = nav(role, PRENDIDO);
    assert.equal(rutas(n).filter((r) => r === "/admin/vouchers").length, 1, `${role}: una entrada`);
    assert.ok(n.comandos.some((c) => c.href === "/admin/vouchers"), `${role}: en el buscador`);
  }
});

test("interruptor apagado: la navegación es idéntica a la de siempre", () => {
  for (const role of ["OWNER", "RECEPTION", "PROFESSIONAL"] as const) {
    const n = negocio(role);
    const visibles = appsVisibles(n);
    const menu = proyectarMenuDeHoy(visibles);
    const base = armarNavegacion({ visibles, menu, modoApps: false, esMostrador: false, role });
    assert.deepEqual(appsDeInterruptores(APAGADO, n), []);
    assert.deepEqual(appsDeInterruptores({}, n), []);
    assert.deepEqual(nav(role, APAGADO), base, `${role}: sin cambios`);
  }
});

test("sin permiso (profesional, sin clients:read): no la ve aunque el interruptor esté prendido", () => {
  assert.deepEqual(appsDeInterruptores(PRENDIDO, negocio("PROFESSIONAL")), []);
  assert.ok(!rutas(nav("PROFESSIONAL", PRENDIDO)).includes("/admin/vouchers"));
});

test("las pantallas de siempre no cambian de lugar: vouchers va al final de su espacio", () => {
  const antes = nav("OWNER", APAGADO);
  const despues = nav("OWNER", PRENDIDO);
  for (const e of antes.espacios) {
    const d = despues.espacios.find((x) => x.id === e.id)!;
    assert.deepEqual(d.apps.slice(0, e.apps.length), e.apps, `${e.id}: mismo orden`);
  }
});
