// ============================================================================
// TEST del catálogo de planes — el trinquete de lo que se vende.
// ============================================================================
//
// Criterio de aceptación de R0-F2, punto por punto, contra el catálogo de módulos, el registro de
// apps y los blueprints REALES (no copias):
//   1. todo módulo del plan existe, sus dependencias están dentro del plan y lo acepta CUALQUIER
//      blueprint registrado del rubro (no sólo la muestra), también por el camino de la consola;
//   2. micro ⊆ comerciante ⊆ pyme (y facturación ⊆ micro) en módulos, apps y límites;
//   3. ningún plan vende una app en preparación, y la vitrina no regala apps de módulos que no vende;
//   4. el Estudio trae la cartera y no Mis locales, medido con el menú real de su producto.
// Más lo que sostiene esos cuatro: las apps del plan salen del mismo gate que el Inicio, no
// prometen nada que un negocio real no vea, cada módulo que se vende se nota, y los precios no
// entran al código que decide.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { validarCambio } from "@/app/operador/(console)/tenants/[id]/apps-del-negocio";
import type { AppDescriptor, RubroApp } from "@/apps/contract";
import { REGISTRO_APPS } from "@/apps/registro";
import { appsVisibles, resolverContextoApps } from "@/apps/visibles";
import { BLUEPRINT_IDS } from "@/blueprints";
import { resolveRubroId, rubroConPerecederos } from "@/blueprints/retail/rubros";
import type { Role } from "@/lib/capabilities";
import { derivarProducto, productoUsaTienda } from "@/lib/producto-identidad";
import { resolverActivacion } from "@/modules/activation";
import { construirCatalogo } from "@/modules/catalog";
import type { ModuleId } from "@/modules/contract";
import { nucleoParaProducto } from "@/modules/nucleo";
import type { Perfil } from "@/modules/perfil";
import {
  ESCALERA,
  LIMITE_IDS,
  PLAN_IDS,
  PLANES,
  RUBROS,
  esPlanId,
  modulosDelPlan,
  modulosPosiblesDelPlan,
  planPorId,
  rubroDelNegocio,
  type PlanDescriptor,
  type PlanId,
  type Tope,
} from "./catalogo";
import {
  NEGOCIO_DE_MUESTRA,
  appsDelPlan,
  appsEnPreparacionDelPlan,
  contextoDelPlan,
  negocioDelPlan,
} from "./apps-del-plan";
import { ESTADO_DE_LOS_PRECIOS, PRECIOS_PROVISIONALES } from "./precios";

const CAT = construirCatalogo();
const PLANES_TODOS: PlanDescriptor[] = PLAN_IDS.map(planPorId);
const PARES_DE_LA_ESCALERA: [PlanId, PlanId][] = ESCALERA.slice(1).map((p, i) => [ESCALERA[i], p]);
const ids = (apps: readonly AppDescriptor[]) => apps.map((a) => a.id);

interface NegocioReal {
  blueprintId: string | null;
  esMostrador: boolean;
  carniceriaLista: boolean;
  rubro: RubroApp;
}

/**
 * Cada blueprint registrado, y un negocio sin blueprint, en cada rubro de la barra en que puede
 * caer. Se deriva como lo hace la ficha del negocio (negocio.server.ts:212-223): mostrador si el
 * blueprint es un rubro de retail; carnicería si además vende perecederos y la migración de lotes
 * está (por eso esos blueprints aparecen en los dos). Sale del registro: un blueprint nuevo entra solo.
 */
const NEGOCIOS_REALES: NegocioReal[] = [...BLUEPRINT_IDS, null].flatMap((blueprintId) => {
  const rubroId = resolveRubroId({ slug: null, blueprintId });
  const esMostrador = rubroId != null;
  const conLotes = esMostrador && rubroConPerecederos(rubroId) ? [false, true] : [false];
  return conLotes.map((carniceriaLista) => ({
    blueprintId,
    esMostrador,
    carniceriaLista,
    rubro: rubroDelNegocio({ esMostrador, carniceriaLista }),
  }));
});

/** El gate real de un negocio con estos módulos y "Trabaja por apps" prendido. */
function gateReal(n: NegocioReal, modulos: readonly ModuleId[]) {
  return resolverContextoApps(
    { id: "t", slug: "negocio-de-prueba", blueprintId: n.blueprintId, modules: modulos },
    { registroGlobal: false, enInicioPorApps: true },
    CAT,
  );
}

/** Lo que ve la dueña de un negocio real con estos módulos, "Trabaja por apps" y este perfil. */
function appsReales(n: NegocioReal, modulos: readonly ModuleId[], perfil: Perfil | null): string[] {
  return ids(
    appsVisibles({
      role: "OWNER",
      contexto: gateReal(n, modulos),
      modulosAsignados: modulos,
      perfil,
      esMostrador: n.esMostrador,
      carniceriaLista: n.carniceriaLista,
    }),
  );
}

/** Los blueprints cuyo producto tiene menú propio (hoy "generico", el Comerciante de facturación). */
const CON_MENU_DE_PRODUCTO = BLUEPRINT_IDS.filter((bp) => productoUsaTienda(derivarProducto({ blueprintId: bp, modules: [] })));

// ── El catálogo en sí ─────────────────────────────────────────────────────────

test("catálogo: cinco planes, uno por id, con nombre y a quién le sirve", () => {
  assert.deepEqual(Object.keys(PLANES).sort(), [...PLAN_IDS].sort());
  for (const id of PLAN_IDS) {
    const p = planPorId(id);
    assert.equal(p.id, id);
    assert.ok(p.nombre.trim().length > 0, `${id}: sin nombre`);
    assert.ok(p.paraQuien.trim().length > 0, `${id}: sin "para quién"`);
    for (const l of LIMITE_IDS) {
      const tope = p.limites[l];
      assert.ok(tope === null || (Number.isInteger(tope) && tope >= 0), `${id}.${l}: tope inválido ${String(tope)}`);
    }
  }
  assert.deepEqual([...ESCALERA], ["facturacion", "micro", "comerciante", "pyme"]);
});

test("esPlanId es estricto: el texto libre de antes en Tenant.plan no se lee como un plan", () => {
  for (const id of PLAN_IDS) assert.equal(esPlanId(id), true);
  for (const x of ["PYME", "Pyme", "Micro", " micro", "micro ", "comerciante-pro", "free", "", null, undefined, 3]) {
    assert.equal(esPlanId(x), false, `"${String(x)}" no es un plan`);
  }
});

test("rubroDelNegocio usa los dos datos de la barra", () => {
  assert.equal(rubroDelNegocio({ esMostrador: false, carniceriaLista: false }), "servicios");
  assert.equal(rubroDelNegocio({ esMostrador: false, carniceriaLista: true }), "servicios");
  assert.equal(rubroDelNegocio({ esMostrador: true, carniceriaLista: false }), "mostrador");
  assert.equal(rubroDelNegocio({ esMostrador: true, carniceriaLista: true }), "carniceria");
  for (const r of RUBROS) assert.equal(rubroDelNegocio(NEGOCIO_DE_MUESTRA[r]), r);
  // La muestra de cada rubro es un negocio real de ese rubro, y los tres rubros tienen negocios reales.
  for (const r of RUBROS) {
    const m = NEGOCIO_DE_MUESTRA[r];
    assert.ok(
      NEGOCIOS_REALES.some((n) => n.blueprintId === m.blueprintId && n.rubro === r),
      `la muestra de ${r} (${m.blueprintId}) no es un negocio real de ese rubro`,
    );
  }
  assert.ok(NEGOCIOS_REALES.some((n) => n.blueprintId === "estetica" && n.rubro === "servicios"));
  assert.ok(NEGOCIOS_REALES.some((n) => n.blueprintId === null && n.rubro === "servicios"));
  assert.deepEqual(new Set(NEGOCIOS_REALES.map((n) => n.blueprintId)).size, BLUEPRINT_IDS.length + 1);
});

// ── 1. Todo módulo existe y sus dependencias están dentro del plan ────────────

test("1a. todo módulo de cada plan (propios, por rubro y agregables) existe en el catálogo de módulos", () => {
  for (const p of PLANES_TODOS) {
    for (const m of modulosPosiblesDelPlan(p)) {
      assert.ok(CAT.tiene(m), `${p.id}: el módulo "${m}" no existe en src/modules/catalog.ts`);
    }
  }
});

test("1b. las dependencias de cada módulo están dentro del plan, en cada rubro y con cada agregado", () => {
  for (const p of PLANES_TODOS) {
    for (const r of RUBROS) {
      const combinaciones = [[], ...p.agregables.map((a) => [a]), [...p.agregables]];
      for (const agregados of combinaciones) {
        const { modulos, rechazados } = modulosDelPlan(p, r, agregados);
        assert.deepEqual(rechazados, []);
        const set = new Set(modulos);
        for (const m of modulos) {
          for (const dep of CAT.get(m).dependencias ?? []) {
            assert.ok(
              set.has(dep.id),
              `${p.id}/${r}${agregados.length ? ` + ${agregados.join(",")}` : ""}: "${m}" necesita "${dep.id}" y el plan no lo trae`,
            );
          }
        }
      }
    }
  }
});

test("1c. el gate real no descarta nada del plan en NINGÚN blueprint: ni desconocidos, ni de otro rubro, ni con dependencias colgadas", () => {
  for (const p of PLANES_TODOS) {
    for (const n of NEGOCIOS_REALES) {
      const donde = `${p.id} en ${String(n.blueprintId)} (${n.rubro})`;
      const { modulos } = modulosDelPlan(p, n.rubro, p.agregables);
      const res = resolverActivacion({ tenantId: "t", blueprintId: n.blueprintId, modules: modulos }, CAT);
      assert.deepEqual(res.desconocidos, [], donde);
      assert.deepEqual(res.incompatibles.map((d) => d.id), [], `${donde}: el blueprint rechaza estos módulos`);
      assert.deepEqual(res.dependenciasFaltantes, [], donde);
      assert.deepEqual(res.activos.map((d) => d.id).sort(), [...modulos].sort(), donde);
    }
  }
});

test("1c'. el plan se aplica por el camino de la consola (validarCambio, de a un módulo) en cualquier blueprint", () => {
  for (const p of PLANES_TODOS) {
    for (const n of NEGOCIOS_REALES) {
      const donde = `${p.id} en ${String(n.blueprintId)} (${n.rubro})`;
      const { modulos } = modulosDelPlan(p, n.rubro, p.agregables);
      let asignados: string[] = [];
      for (const modulo of modulos) {
        const r = validarCambio(
          { slug: "negocio-de-prueba", blueprintId: n.blueprintId, modules: asignados, vinculosActivos: 0 },
          { accion: "activar", modulo },
          CAT,
        );
        assert.ok(r.ok, `${donde}: la consola rechaza "${modulo}": ${r.ok ? "" : r.motivo}`);
        asignados = r.despues;
      }
      assert.deepEqual([...asignados].sort(), [...modulos].sort(), donde);
    }
  }
});

test("1c''. las pruebas de rubro muerden: un módulo de un solo blueprint en el plan se detecta en una estética", () => {
  // `commissions` sólo acepta el blueprint "servicios" (nativos.ts:167). Así estaba el catálogo.
  const conComisiones: PlanDescriptor = {
    ...planPorId("comerciante"),
    porRubro: { servicios: [...(planPorId("comerciante").porRubro.servicios ?? []), "commissions"] },
  };
  const { modulos } = modulosDelPlan(conComisiones, "servicios");
  const res = resolverActivacion({ tenantId: "t", blueprintId: "estetica", modules: modulos }, CAT);
  assert.deepEqual(res.incompatibles.map((d) => d.id), ["commissions"]);
  const r = validarCambio(
    { slug: "negocio-de-prueba", blueprintId: "estetica", modules: ["reports"], vinculosActivos: 0 },
    { accion: "activar", modulo: "commissions" },
    CAT,
  );
  assert.equal(r.ok, false);
  // En el blueprint "servicios" sí entra: una muestra con ese blueprint escondía la falla.
  assert.deepEqual(
    resolverActivacion({ tenantId: "t", blueprintId: "servicios", modules: modulos }, CAT).incompatibles,
    [],
  );
});

test("1d. la prueba de dependencias muerde: un plan con inventario sin catálogo se detecta", () => {
  const roto: PlanDescriptor = { ...planPorId("micro"), modulos: planPorId("micro").modulos.filter((m) => m !== "catalog") };
  const res = resolverActivacion(
    { tenantId: "t", blueprintId: "kiosco", modules: modulosDelPlan(roto, "mostrador").modulos },
    CAT,
  );
  assert.deepEqual(res.dependenciasFaltantes.map((d) => d.id), ["inventario"]);
});

test("agregables: no repiten lo del plan, y lo que un plan suma suelto el siguiente lo trae o lo ofrece", () => {
  for (const p of PLANES_TODOS) {
    for (const a of p.agregables) assert.ok(!p.modulos.includes(a), `${p.id}: "${a}" ya viene en el plan`);
  }
  for (const [menor, mayor] of PARES_DE_LA_ESCALERA) {
    const alcanza = new Set([...planPorId(mayor).modulos, ...planPorId(mayor).agregables]);
    for (const a of planPorId(menor).agregables) {
      assert.ok(alcanza.has(a), `subir de ${menor} a ${mayor} le sacaría el agregado "${a}"`);
    }
  }
});

/**
 * Módulos que se venden sin una app propia en el Inicio, con lo que hacen. Sumar uno acá es una
 * decisión: un módulo que no se ve y no hace nada de fondo no se vende.
 */
const TRABAJAN_DE_FONDO: Readonly<Record<string, string>> = {
  mercadopago: "Factura sola lo que se cobra por Mercado Pago (src/modules/descriptors/mercadopago.ts).",
  cartera: "Es la consola del estudio, /contador, fuera del Inicio (src/modules/descriptors/cartera.ts).",
};

/** Qué módulos de este plan no se notan: ninguna app suya aparece en la vitrina de ningún rubro. */
function modulosQueNoSeNotan(p: PlanDescriptor): ModuleId[] {
  const enVitrina = new Set(
    RUBROS.flatMap((r) => appsDelPlan(p, r, CAT, { agregados: p.agregables }).map((a) => a.modulo)),
  );
  return modulosPosiblesDelPlan(p).filter((m) => !enVitrina.has(m) && !(m in TRABAJAN_DE_FONDO));
}

test("cada módulo que vende un plan se nota: alguna app suya aparece en la vitrina, o trabaja de fondo", () => {
  for (const p of PLANES_TODOS) {
    assert.deepEqual(modulosQueNoSeNotan(p), [], `${p.id} vende módulos que el negocio no vería`);
  }
  // Muerde: comisiones no decide ninguna app, y el Libro IVA no se ve en el menú del estudio.
  const comerciante = planPorId("comerciante");
  assert.deepEqual(
    modulosQueNoSeNotan({ ...comerciante, porRubro: { servicios: [...(comerciante.porRubro.servicios ?? []), "commissions"] } }),
    ["commissions"],
  );
  const estudio = planPorId("estudio");
  assert.deepEqual(modulosQueNoSeNotan({ ...estudio, agregables: [...estudio.agregables, "libros"] }), ["libros"]);
});

test("modulosDelPlan: suma los agregables y rechaza con el porqué lo que el plan no ofrece", () => {
  const ok = modulosDelPlan("micro", "mostrador", ["cuentas-a-cobrar", "cuentas-a-cobrar", "pos"]);
  assert.deepEqual(ok.agregados, ["cuentas-a-cobrar"]);
  assert.ok(ok.modulos.includes("cuentas-a-cobrar"));
  assert.equal(ok.modulos.filter((m) => m === "pos").length, 1);
  assert.deepEqual(ok.rechazados, []);

  const no = modulosDelPlan("micro", "mostrador", ["multilocal", "cartera"]);
  assert.deepEqual(no.agregados, []);
  assert.deepEqual(no.rechazados.map((r) => r.id), ["multilocal", "cartera"]);
  assert.match(no.rechazados[0].motivo, /Micro comerciante no permite sumar "multilocal" suelto/);
  assert.ok(!no.modulos.includes("multilocal"));
});

// ── 2. La escalera: micro ⊆ comerciante ⊆ pyme (y facturación ⊆ micro) ────────

test("2a. escalera en MÓDULOS, en cada rubro", () => {
  for (const r of RUBROS) {
    for (const [menor, mayor] of PARES_DE_LA_ESCALERA) {
      const grande = new Set(modulosDelPlan(mayor, r).modulos);
      const faltan = modulosDelPlan(menor, r).modulos.filter((m) => !grande.has(m));
      assert.deepEqual(faltan, [], `${r}: ${menor} trae módulos que ${mayor} no: ${faltan.join(", ")}`);
    }
  }
});

test("2b. escalera en APPS, en cada rubro (con el mismo gate que el Inicio)", () => {
  for (const r of RUBROS) {
    for (const [menor, mayor] of PARES_DE_LA_ESCALERA) {
      const grande = new Set(ids(appsDelPlan(mayor, r, CAT)));
      const faltan = ids(appsDelPlan(menor, r, CAT)).filter((a) => !grande.has(a));
      assert.deepEqual(faltan, [], `${r}: ${menor} ve apps que ${mayor} no: ${faltan.join(", ")}`);
    }
  }
});

test("2c. escalera en LÍMITES: ningún tope baja al subir de plan (sin tope = el más alto)", () => {
  const menorOIgual = (a: Tope, b: Tope) => b === null || (a !== null && a <= b);
  for (const [menor, mayor] of PARES_DE_LA_ESCALERA) {
    for (const l of LIMITE_IDS) {
      const a = planPorId(menor).limites[l];
      const b = planPorId(mayor).limites[l];
      assert.ok(menorOIgual(a, b), `${l}: ${menor} tiene ${String(a)} y ${mayor} ${String(b)}`);
    }
  }
});

test("2d. escalera en PERFIL: subir nunca pasa de Empresa a Comercio", () => {
  const orden = { lite: 0, enterprise: 1 } as const;
  for (const [menor, mayor] of PARES_DE_LA_ESCALERA) {
    assert.ok(orden[planPorId(menor).perfil] <= orden[planPorId(mayor).perfil], `${menor} → ${mayor}`);
  }
  assert.equal(planPorId("pyme").perfil, "enterprise");
});

test("2e. cada escalón suma algo: ningún plan de la escalera es igual al anterior en módulos y límites", () => {
  for (const [menor, mayor] of PARES_DE_LA_ESCALERA) {
    const a = new Set(modulosPosiblesDelPlan(menor));
    const b = modulosPosiblesDelPlan(mayor);
    const sumaModulos = b.some((m) => !a.has(m));
    const sumaLimites = LIMITE_IDS.some((l) => planPorId(menor).limites[l] !== planPorId(mayor).limites[l]);
    assert.ok(sumaModulos || sumaLimites, `${mayor} no agrega nada sobre ${menor}`);
  }
});

// ── 3. Ninguna app en preparación ─────────────────────────────────────────────

test("3a. ningún plan vende un módulo cuya app está en preparación", () => {
  for (const p of PLANES_TODOS) {
    const pendientes = appsEnPreparacionDelPlan(p);
    assert.deepEqual(
      ids(pendientes),
      [],
      `${p.id} vende apps que todavía no están listas: ${ids(pendientes).join(", ")}. ` +
        "Sumá el módulo al plan cuando su app pase a 'lista'.",
    );
  }
});

test("3b. la vitrina no regala: cada app que muestra es del núcleo o de un módulo que el plan trae", () => {
  for (const p of PLANES_TODOS) {
    for (const r of RUBROS) {
      for (const agregados of [[], [...p.agregables]]) {
        const modulos = new Set(modulosDelPlan(p, r, agregados).modulos);
        const apps = appsDelPlan(p, r, CAT, { agregados });
        assert.ok(apps.length > 0, `${p.id}/${r}: vitrina vacía`);
        const regaladas = apps.filter((a) => a.modulo !== null && !modulos.has(a.modulo));
        assert.deepEqual(ids(regaladas), [], `${p.id}/${r}: muestra apps de módulos que no vende`);
      }
    }
  }
});

test("3c. la prueba de 'en preparación' muerde: una app en preparación de un módulo del plan se detecta y no se muestra", () => {
  const falsa: AppDescriptor = {
    ...REGISTRO_APPS.find((a) => a.id === "reportes")!,
    id: "app-de-prueba",
    ruta: "/admin/app-de-prueba",
    estado: "en-preparacion",
  };
  const apps = [...REGISTRO_APPS, falsa];
  assert.deepEqual(ids(appsEnPreparacionDelPlan("micro", apps)), ["app-de-prueba"]);
  assert.ok(!ids(appsDelPlan("micro", "mostrador", CAT, { apps })).includes("app-de-prueba"));
  // Del núcleo no cuenta: viene con la plataforma, no con el plan.
  assert.deepEqual(ids(appsEnPreparacionDelPlan("micro", [{ ...falsa, modulo: null }])), []);
});

// ── 4. El Estudio trae la cartera y no Mis locales ───────────────────────────

test("4a. el Estudio trae la cartera y no Mis locales, ni en su rubro ni con agregados", () => {
  const estudio = planPorId("estudio");
  assert.ok(estudio.modulos.includes("cartera"));
  assert.ok(!modulosPosiblesDelPlan(estudio).includes("multilocal"));
  for (const r of RUBROS) {
    const { modulos } = modulosDelPlan(estudio, r, estudio.agregables);
    assert.ok(modulos.includes("cartera") && !modulos.includes("multilocal"), r);
    assert.ok(contextoDelPlan(estudio, r, CAT, estudio.agregables).modulos.has("cartera"), r);
  }
});

test("4b. ningún plan junta cartera y Mis locales, y la cartera es sólo del Estudio", () => {
  for (const p of PLANES_TODOS) {
    const todos = modulosPosiblesDelPlan(p);
    assert.ok(!(todos.includes("cartera") && todos.includes("multilocal")), p.id);
    if (p.id !== "estudio") assert.ok(!todos.includes("cartera"), `${p.id} no es un estudio`);
  }
  assert.equal(planPorId("estudio").limites.clientesCartera! > 0, true);
  for (const id of ESCALERA) assert.equal(planPorId(id).limites.clientesCartera, 0, id);
});

test("4c. el Estudio, con el menú real de su producto, no ve Mis locales ni el mostrador", () => {
  for (const r of RUBROS) {
    const agregados = planPorId("estudio").agregables;
    assert.equal(contextoDelPlan("estudio", r, CAT, agregados).origen, "producto", r);
    const apps = ids(appsDelPlan("estudio", r, CAT, { agregados }));
    for (const no of ["mis-locales", "ventas-por-local", "stock-por-local", "traslados", "vender", "inventario", "libro-iva"]) {
      assert.ok(!apps.includes(no), `estudio/${r} no debería ver ${no}`);
    }
    assert.ok(apps.includes("facturacion"), `estudio/${r} factura`);
    assert.ok(apps.includes("facturacion-automatica"), `estudio/${r} con el banco factura solo`);
  }
});

// ── Lo que sostiene a los cuatro ─────────────────────────────────────────────

test("Facturación es el núcleo del producto de facturación de hoy; el Estudio, el del contador", () => {
  assert.deepEqual([...planPorId("facturacion").modulos].sort(), nucleoParaProducto("comerciante", CAT).sort());
  const estudio = new Set(planPorId("estudio").modulos);
  for (const m of nucleoParaProducto("contador", CAT)) assert.ok(estudio.has(m), m);
});

test("appsDelPlan usa el mismo gate que un negocio real que trabaja por apps (el Estudio, con el de su producto)", () => {
  for (const p of PLAN_IDS) {
    for (const r of RUBROS) {
      const muestra = { ...NEGOCIO_DE_MUESTRA[r], rubro: r };
      const { modulos } = modulosDelPlan(p, r);
      const real = gateReal(muestra, modulos);
      const delPlan = contextoDelPlan(p, r, CAT);
      assert.equal(real?.origen, p === "estudio" ? "producto" : "piloto", `${p}/${r}`);
      assert.equal(delPlan.origen, real?.origen, `${p}/${r}`);
      assert.deepEqual([...delPlan.modulos].sort(), [...(real?.modulos ?? [])].sort(), `${p}/${r}`);
      // Lo que ve seguro: con el motor de perfiles prendido (perfil del plan) y apagado (null).
      const conMotor = appsReales(muestra, modulos, planPorId(p).perfil);
      const sinMotor = new Set(appsReales(muestra, modulos, null));
      assert.deepEqual(ids(appsDelPlan(p, r, CAT)), conMotor.filter((a) => sinMotor.has(a)), `${p}/${r}`);
    }
  }
});

test("la vitrina no promete de más en ningún blueprint (salvo el de menú de producto, que se conoce)", () => {
  // El único blueprint cuyo producto tiene menú propio: ahí manda ese menú y no el plan.
  assert.deepEqual(CON_MENU_DE_PRODUCTO, ["generico"]);
  for (const p of PLANES_TODOS) {
    for (const n of NEGOCIOS_REALES) {
      // El Estudio siempre tiene el menú de su producto, también en "generico": se mide en todos.
      if (p.id !== "estudio" && n.blueprintId !== null && CON_MENU_DE_PRODUCTO.includes(n.blueprintId)) continue;
      const donde = `${p.id} en ${String(n.blueprintId)} (${n.rubro})`;
      const { modulos } = modulosDelPlan(p, n.rubro, p.agregables);
      const vitrina = ids(appsDelPlan(p, n.rubro, CAT, { agregados: p.agregables }));
      for (const perfil of [null, p.perfil]) {
        const reales = new Set(appsReales(n, modulos, perfil));
        const deMas = vitrina.filter((a) => !reales.has(a));
        assert.deepEqual(deMas, [], `${donde}, perfil ${String(perfil)}: promete apps que no ve`);
      }
      // En la escalera el módulo decide: la vitrina es exactamente lo que ve.
      if (p.id !== "estudio") assert.deepEqual(appsReales(n, modulos, p.perfil), vitrina, donde);
    }
  }
});

test("en un negocio de menú de producto la escalera NO decide sus apps: se sabe y se mide", () => {
  // Si algún día el plan decide también ahí, este test avisa que la vitrina ya vale para ellos.
  for (const blueprintId of CON_MENU_DE_PRODUCTO) {
    for (const p of ESCALERA) {
      const n: NegocioReal = { blueprintId, esMostrador: false, carniceriaLista: false, rubro: "servicios" };
      assert.equal(gateReal(n, modulosDelPlan(p, "servicios").modulos)?.origen, "producto", `${p} en ${blueprintId}`);
    }
  }
});

test("lo que ve la dueña cubre lo que ve todo el equipo", () => {
  const roles: Role[] = ["RECEPTION", "PROFESSIONAL"];
  for (const p of PLAN_IDS) {
    for (const r of RUBROS) {
      const duenia = new Set(ids(appsDelPlan(p, r, CAT)));
      for (const role of roles) {
        const otras = ids(appsVisibles({ ...negocioDelPlan(p, r, CAT), role })).filter((a) => !duenia.has(a));
        assert.deepEqual(otras, [], `${p}/${r}/${role}`);
      }
    }
  }
});

test("la vitrina dice lo que cada plan vende (casos concretos)", () => {
  const tiene = (p: PlanId, r: RubroApp, si: string[], no: string[], agregados: string[] = []) => {
    const apps = ids(appsDelPlan(p, r, CAT, { agregados }));
    for (const a of si) assert.ok(apps.includes(a), `${p}/${r} debería traer ${a}`);
    for (const a of no) assert.ok(!apps.includes(a), `${p}/${r} no debería traer ${a}`);
  };
  tiene("facturacion", "mostrador", ["facturacion", "facturacion-automatica", "clientes", "reportes", "caja-del-dia"], ["vender", "inventario", "agenda"]);
  tiene("micro", "mostrador", ["vender", "inventario", "recuento", "facturacion", "margen", "cierre-del-mes"], ["cuentas-a-cobrar", "libro-iva", "mis-locales", "agenda", "despiece"]);
  tiene("micro", "servicios", ["agenda", "confirmar-manana", "vender", "comisiones"], ["inventario", "lista-de-espera", "recordatorios"]);
  tiene("micro", "mostrador", ["cuentas-a-cobrar"], [], ["cuentas-a-cobrar"]);
  tiene("comerciante", "servicios", ["cuentas-a-cobrar", "libro-iva", "campanias", "lista-de-espera", "recordatorios", "resenas"], ["cuentas-a-pagar", "mis-locales"]);
  tiene("pyme", "carniceria", ["lotes-y-vencimientos", "despiece", "cuentas-a-pagar", "devoluciones-a-proveedor", "mis-locales", "traslados", "libro-iva"], ["agenda"]);
  tiene("estudio", "servicios", ["facturacion", "clientes", "reportes"], ["libro-iva", "cuentas-a-cobrar", "vender", "mis-locales"], ["bancos", "mercadopago"]);
});

// ── Precios fuera del código que decide ─────────────────────────────────────

test("precios: uno por plan, todos provisionales a confirmar", () => {
  assert.deepEqual(Object.keys(PRECIOS_PROVISIONALES).sort(), [...PLAN_IDS].sort());
  for (const id of PLAN_IDS) {
    const p = PRECIOS_PROVISIONALES[id];
    assert.equal(p.estado, ESTADO_DE_LOS_PRECIOS);
    assert.equal(ESTADO_DE_LOS_PRECIOS, "provisional a confirmar");
    assert.ok(Number.isInteger(p.mensual) && p.mensual > 0 && p.anualPorMes > 0 && p.anualPorMes <= p.mensual, id);
  }
});

/** Los módulos que un archivo importa, y si cada import es sólo de tipos. */
function importsDe(archivo: string): { desde: string; soloTipos: boolean }[] {
  const src = readFileSync(join(__dirname, archivo), "utf8");
  const sf = ts.createSourceFile(archivo, src, ts.ScriptTarget.Latest, true);
  const out: { desde: string; soloTipos: boolean }[] = [];
  for (const st of sf.statements) {
    if ((ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      const soloTipos = ts.isImportDeclaration(st) ? !!st.importClause?.isTypeOnly : st.isTypeOnly;
      out.push({ desde: st.moduleSpecifier.text, soloTipos });
    }
  }
  return out;
}

test("ningún archivo que decide importa los precios", () => {
  for (const archivo of ["catalogo.ts", "limites.ts", "apps-del-plan.ts"]) {
    const deps = importsDe(archivo).map((i) => i.desde);
    assert.ok(!deps.some((d) => /(^|\/)precios(\.ts)?$/.test(d)), `${archivo} importa los precios`);
  }
});

test("el catálogo es dato puro: sólo importa tipos (se puede leer desde el navegador)", () => {
  const imports = importsDe("catalogo.ts");
  assert.ok(imports.length > 0);
  for (const i of imports) assert.equal(i.soloTipos, true, `catalogo.ts importa por valor "${i.desde}"`);
});
