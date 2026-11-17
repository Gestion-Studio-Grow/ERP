/**
 * GSG-CRM-018b · V1 completo (certificación GSG-CRM-010, fila V1): el negocio ARM (vertical «arm») tiene SÓLO el CRM
 * comercial, más Usuarios para que Dirección dé de alta a su equipo. Ni Caja, ni Cierre, ni Libro de caja, ni
 * Auditoría, Localización o Apariencia; el Inicio aterriza en el CRM; el vertical tiene definición propia y la barra
 * rotula su espacio «Comercial». La productora no cambia. Datos ficticios.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogo } from "@/modules/catalog";
import { appPorId, REGISTRO_APPS } from "@/apps/registro";
import { appDeRuta } from "@/apps/rutas";
import {
  appDelPanelCerrado,
  appsVisibles,
  aterrizajeDelPanel,
  motivoNoDisponible,
  resolverContextoApps,
  rutaFueraDelPanel,
  type NegocioApps,
  type TenantParaApps,
} from "@/apps/visibles";
import { nombrePropioDelEspacio } from "@/apps/espacios";
import { BLUEPRINT_IDS, getBlueprint } from "@/blueprints";
import { BLUEPRINT_ARM } from "@/lib/crm-comercial/arm";
import { espaciosDeApps, sumarApps } from "@/app/admin/(dashboard)/armazon/navegacion";
import { seccionesDelInicio } from "@/app/admin/(dashboard)/inicio/secciones";
import type { Role } from "@/lib/capabilities";

const ARM: TenantParaApps = { id: "t-arm", slug: "arm-demo", blueprintId: BLUEPRINT_ARM, modules: [] };
const de = (role: Role, t: TenantParaApps = ARM): NegocioApps => ({
  role,
  contexto: resolverContextoApps(t, { registroGlobal: false, enInicioPorApps: false }, catalogo()),
  modulosAsignados: t.modules,
  blueprintId: t.blueprintId,
  perfil: null,
  esMostrador: false,
  carniceriaLista: false,
});

// Las pantallas que la certificación abrió con 200 como Dirección del ARM, con la app que las guarda.
const ADMINISTRACION: Record<string, string> = {
  "/admin/caja": "caja-del-dia",
  "/admin/caja/cierre": "cierre-del-dia",
  "/admin/caja/libro": "libro-de-caja",
  "/admin/auditoria": "auditoria",
  "/admin/localizacion": "datos-del-negocio",
  "/admin/apariencia": "apariencia",
};

test("V1 · como Dirección del ARM, Caja, Cierre, Libro de caja, Auditoría, Localización y Apariencia rebotan (Usuarios y el CRM, no)", () => {
  for (const role of ["OWNER", "RECEPTION"] as const) {
    const n = de(role);
    const panel = appDelPanelCerrado(n);
    assert.equal(panel?.id, "crm-comercial", role);
    for (const [ruta, id] of Object.entries(ADMINISTRACION)) {
      assert.equal(appDeRuta(ruta)?.id, id, `${ruta} es de ${id}`);
      // La guardia de la página (`requireApp`) y el layout (`rutaFueraDelPanel`) dicen lo mismo: fuera del panel.
      const motivo = motivoNoDisponible(appPorId(id as never), n);
      assert.notEqual(motivo, null, `${id} para ${role}`);
      if (role === "OWNER") assert.equal(motivo, "panel", `${id}: Dirección puede por rol; lo cierra el panel`);
      assert.ok(rutaFueraDelPanel(ruta, panel!), `${ruta} fuera del panel`);
    }
    for (const ruta of ["/admin/crm", "/admin/crm/embudo", "/admin/usuarios"]) assert.ok(!rutaFueraDelPanel(ruta, panel!), ruta);
  }
  // Lo único que abre Dirección en todo el registro: el CRM y Usuarios.
  assert.deepEqual(REGISTRO_APPS.filter((a) => motivoNoDisponible(a, de("OWNER")) === null).map((a) => a.id).sort(), ["crm-comercial", "usuarios"]);
});

test("V1 · el Inicio del ARM aterriza en el CRM y no ofrece Caja ni tarjetas de otro rubro", () => {
  for (const role of ["OWNER", "RECEPTION", "PROFESSIONAL"] as const) {
    const n = de(role);
    assert.notEqual(motivoNoDisponible(appPorId("inicio"), n), null, `Inicio para ${role}`);
    // Dirección y el equipo comercial caen en el CRM; quien no puede abrirlo, en «no disponible» (nunca en el Inicio).
    if (motivoNoDisponible(appPorId("crm-comercial"), n) === null) assert.equal(aterrizajeDelPanel(n), "/admin/crm", role);
    const visibles = appsVisibles(n);
    assert.ok(!visibles.some((a) => a.espacio === "caja" || a.id === "caja-del-dia"), `«Mis apps» de ${role} sin Caja`);
    assert.deepEqual(seccionesDelInicio(visibles, { esMostrador: false }).flatMap((s) => s.apps.map((a) => a.id)).filter((id) => id !== "usuarios"), [], role);
  }
});

test("V1 · el vertical «arm» tiene definición propia (no cae al de por defecto) y no siembra catálogo, caja ni turnos", async () => {
  assert.ok(BLUEPRINT_IDS.includes(BLUEPRINT_ARM));
  const bp = getBlueprint(BLUEPRINT_ARM);
  assert.equal(bp.id, BLUEPRINT_ARM);
  assert.match(bp.label, /CRM/);
  assert.ok(!bp.capabilities.some((c) => /^(orders|agenda|catalog):/.test(c)), "sin caja, agenda ni catálogo");
  // El alta no siembra nada: si la transacción se tocara, esto tiraría.
  const tx = new Proxy({}, { get: () => { throw new Error("el ARM no siembra nada"); } });
  assert.equal(await bp.seedCatalog(tx as never, "t-arm"), false);
});

test("V1 · la barra del ARM rotula su espacio «Comercial»; la productora y los demás negocios no cambian", () => {
  const crm = appPorId("crm-comercial");
  const usuarios = appPorId("usuarios");
  // El ARM: Usuarios en el lanzador y el CRM sumado por su interruptor (layout.tsx).
  const arm = sumarApps(espaciosDeApps([usuarios], false), [crm], false);
  const espacioDelCrm = arm.find((e) => e.apps.some((a) => a.id === "crm-comercial"));
  assert.equal(espacioDelCrm?.nombre, "Comercial");
  assert.equal(espacioDelCrm?.rotulo, "Comercial");
  // La productora (CRM-011): el CRM va junto a Proyectos, en «Gestión».
  const productora = sumarApps(espaciosDeApps([appPorId("proyectos"), appPorId("gestion-inicio")], false), [crm], false);
  assert.equal(productora.find((e) => e.apps.some((a) => a.id === "crm-comercial"))?.nombre, "Gestión");
  // Un negocio de servicios con el CRM prendido sigue con «Recepción» (tiene agenda); uno de mostrador, «Mostrador».
  assert.equal(sumarApps(espaciosDeApps([appPorId("agenda")], false), [crm], false).find((e) => e.id === "mostrador")?.nombre, "Recepción");
  assert.equal(sumarApps(espaciosDeApps([appPorId("agenda")], true), [crm], true).find((e) => e.id === "mostrador")?.nombre, "Mostrador");
  // La regla, pura: sólo el espacio de la recepción y sólo cuando lo único que tiene es el CRM.
  assert.equal(nombrePropioDelEspacio("mostrador", ["crm-comercial"]), "Comercial");
  assert.equal(nombrePropioDelEspacio("mostrador", ["crm-comercial", "agenda"]), null);
  assert.equal(nombrePropioDelEspacio("mostrador", []), null);
  assert.equal(nombrePropioDelEspacio("caja", ["crm-comercial"]), null);
});

test("V1 · la productora sigue en su panel de Proyectos y un negocio común, sin panel", () => {
  const productora = de("OWNER", { id: "t-mia", slug: "productora-demo", blueprintId: "productora", modules: ["proyectos"] });
  assert.equal(appDelPanelCerrado({ ...productora, contexto: null })?.id, "proyectos");
  assert.equal(appDelPanelCerrado(de("OWNER", { id: "t-x", slug: "estetica-demo", blueprintId: "servicios", modules: [] })), null);
});
