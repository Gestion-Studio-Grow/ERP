// ============================================================================
// QUIÉN VE QUÉ — el gate por negocio, las apps que leen otros negocios, el buscador y
// la pantalla de "App no disponible", ejecutados con datos.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogo } from "@/modules/catalog";
import { nucleoParaProducto } from "@/modules/nucleo";
import type { Role } from "@/lib/capabilities";
import type { AppDescriptor } from "./contract";
import { REGISTRO_APPS, appPorId, type AppId } from "./registro";
import { nombreDeEspacio, ordenDeEspacio } from "./espacios";
import {
  appPermitida,
  appsVisibles,
  buscarApps,
  destinoDeVuelta,
  explicarNoDisponible,
  motivoNoDisponible,
  negocioEnAppsInicio,
  partesDelKpi,
  proyectarMenuDeHoy,
  resolverContextoApps,
  rolPuedeEntrar,
  type NegocioApps,
  type TenantParaApps,
} from "./visibles";
import { searchNavItems } from "@/modules/nav-search";

// Filas de Tenant como las de la base de QA (psql erp_qa_apps, 2026-09-23): beauty-spa sin
// blueprint ni módulos; magra con su seed.
const CH: TenantParaApps = { id: "t-ch", slug: "beauty-spa", blueprintId: null, modules: [] };
const MAGRA: TenantParaApps = {
  id: "t-magra",
  slug: "magra",
  blueprintId: "carniceria",
  modules: ["pos", "catalog", "clients", "reports", "arca"],
};
const PILOTO = "magra,shinevelas,adosmanos";
const SIN_FLAGS = { registroGlobal: false, appsInicio: undefined };

/** Contexto con la regla real. `appsInicio: null` = la variable no está definida. */
const ctx = (t: TenantParaApps, appsInicio: string | null = PILOTO) =>
  resolverContextoApps(t, { registroGlobal: false, appsInicio: appsInicio ?? undefined }, catalogo());

function negocio(over: Partial<NegocioApps> & { role: Role }): NegocioApps {
  return {
    contexto: null,
    modulosAsignados: [],
    perfil: null,
    esMostrador: false,
    carniceriaLista: false,
    ...over,
  };
}

const ids = (apps: readonly AppDescriptor[]) => apps.map((a) => a.id);

// ── El gate es por negocio: null significa sin gate, igual que hoy ────────────

test("APPS_INICIO: lista de slugs o '*'; vacío o ausente no prende a nadie", () => {
  assert.equal(negocioEnAppsInicio("magra", " Magra , shinevelas "), true);
  assert.equal(negocioEnAppsInicio("shinevelas", PILOTO), true);
  assert.equal(negocioEnAppsInicio("beauty-spa", PILOTO), false);
  // Cada local de MAGRA es otro negocio con su slug: se prende uno por uno.
  assert.equal(negocioEnAppsInicio("magra-lomas", PILOTO), false);
  assert.equal(negocioEnAppsInicio("cualquiera", "*"), true);
  assert.equal(negocioEnAppsInicio("magra", ""), false);
  assert.equal(negocioEnAppsInicio("magra", undefined), false);
  assert.equal(negocioEnAppsInicio(null, "*"), false);
});

test("CH queda SIN gate aunque el piloto se prenda para todos: su asignación está vacía", () => {
  assert.equal(ctx(CH, null), null);
  assert.equal(ctx(CH, PILOTO), null);
  assert.equal(ctx(CH, "*"), null);
  assert.equal(ctx(CH, "beauty-spa"), null);
});

test("magra: sin gate fuera del piloto; en el piloto, sus módulos resueltos", () => {
  assert.equal(ctx(MAGRA, null), null);
  const c = ctx(MAGRA);
  assert.equal(c?.origen, "piloto");
  assert.deepEqual([...(c?.modulos ?? [])].sort(), ["arca", "catalog", "clients", "pos", "reports"]);
});

test("piloto: un módulo sin su dependencia no habilita nada (resolverActivacion real)", () => {
  // `inventario` depende de `catalog`: asignado solo, se cae.
  const c = ctx({ ...MAGRA, modules: ["pos", "inventario"] });
  assert.equal(c?.modulos.has("inventario"), false);
  const n = negocio({ role: "OWNER", contexto: c, esMostrador: true });
  assert.equal(motivoNoDisponible(appPorId("inventario"), n), "modulo");
});

test("Comerciante: el set asignado tal cual, con o sin piloto; el flag global manda sobre todo", () => {
  const kiosco: TenantParaApps = { id: "t-k", slug: "kiosco", blueprintId: "generico", modules: nucleoParaProducto("comerciante") };
  assert.equal(ctx(kiosco, null)?.origen, "producto");
  assert.equal(resolverContextoApps(CH, { registroGlobal: true, appsInicio: undefined }, catalogo())?.origen, "registro");
  // Con el flag global prendido, CH queda con cero módulos: es el riesgo de hoy, no uno nuevo
  // (layout.tsx hace lo mismo con getActiveModuleIds). Por eso sigue apagado.
  assert.equal(resolverContextoApps(CH, { registroGlobal: true, appsInicio: undefined }, catalogo())?.modulos.size, 0);
  assert.equal(resolverContextoApps(MAGRA, SIN_FLAGS, catalogo()), null);
});

test("sin gate, el módulo no decide nada: CH ve Facturación aunque no tenga `arca` asignado", () => {
  const n = negocio({ role: "OWNER", contexto: ctx(CH) });
  assert.equal(appPermitida(appPorId("facturacion"), n), true);
  assert.equal(appPermitida(appPorId("campanias"), n), true);
});

test("piloto: el gate saca sólo lo no asignado; con inventario, bancos y campañas, magra no pierde nada", () => {
  const conGate = negocio({ role: "OWNER", contexto: ctx(MAGRA), esMostrador: true });
  const sinGate = negocio({ role: "OWNER", contexto: null, esMostrador: true });
  const pierde = ids(appsVisibles(sinGate)).filter((id) => !ids(appsVisibles(conGate)).includes(id));
  // Stock, Recibir mercadería y Mermas cuelgan de `inventario`, que magra no tiene todavía
  // en su seed: por eso el operador se lo asigna antes de prenderle el Inicio por apps.
  assert.deepEqual(pierde.sort(), [
    "campanias",
    "facturacion-automatica",
    "inventario",
    "mermas",
    "movimientos",
    "proveedores",
    "recibir-mercaderia",
    "recuento",
  ]);
  const conInventario = negocio({
    role: "OWNER",
    contexto: ctx({ ...MAGRA, modules: [...MAGRA.modules, "inventario", "bancos", "campanias"] }),
    esMostrador: true,
  });
  assert.deepEqual(ids(appsVisibles(sinGate)).filter((id) => !ids(appsVisibles(conInventario)).includes(id)), []);
});

test("piloto: manda el módulo, no el perfil (Libro IVA sin el callejón de 'edición Empresa')", () => {
  const libro = appPorId("libro-iva");
  const sinLibros = negocio({ role: "OWNER", contexto: ctx(MAGRA), esMostrador: true });
  assert.equal(motivoNoDisponible(libro, sinLibros), "modulo");
  const conLibros = negocio({ role: "OWNER", contexto: ctx({ ...MAGRA, modules: [...MAGRA.modules, "libros"] }), esMostrador: true });
  assert.equal(motivoNoDisponible(libro, conLibros), null);
  // Fuera del piloto sigue como hoy: sin motor de perfiles, la pantalla de edición no se ofrece.
  assert.equal(motivoNoDisponible(libro, negocio({ role: "OWNER" })), "edicion");
  assert.equal(motivoNoDisponible(libro, negocio({ role: "OWNER", perfil: "lite" })), "edicion");
  assert.equal(motivoNoDisponible(libro, negocio({ role: "OWNER", perfil: "enterprise" })), null);
});

test("Comerciante: la guardia usa el módulo de su barra de hoy; el piloto, el de la app", () => {
  // Si la barra y la guardia usaran módulos distintos, una pantalla de la barra rebotaría al
  // abrirla. El Comerciante ya tenía gate: Compras se filtraba con `catalog` y las pantallas
  // de edición con ninguno, así que sigue igual. En el piloto manda el módulo de la app.
  const kiosco: TenantParaApps = {
    id: "t-k",
    slug: "kiosco",
    blueprintId: "generico",
    modules: [...nucleoParaProducto("comerciante"), "catalog"],
  };
  const comerciante = (perfil: NegocioApps["perfil"]) =>
    negocio({ role: "OWNER", contexto: ctx(kiosco, null), modulosAsignados: kiosco.modules, perfil });
  assert.equal(motivoNoDisponible(appPorId("recibir-mercaderia"), comerciante(null)), null);
  assert.equal(motivoNoDisponible(appPorId("mermas"), comerciante(null)), null);
  // Edición: sin `libros` asignado, la decide el perfil, como hoy.
  assert.equal(motivoNoDisponible(appPorId("libro-iva"), comerciante("enterprise")), null);
  assert.equal(motivoNoDisponible(appPorId("libro-iva"), comerciante(null)), "edicion");
  // Una app fuera de la barra de hoy usa su propio módulo también en el Comerciante.
  assert.equal(motivoNoDisponible(appPorId("facturacion-automatica"), comerciante(null)), null);
  const sinBancos = { ...kiosco, modules: kiosco.modules.filter((m) => m !== "bancos") };
  assert.equal(
    motivoNoDisponible(appPorId("facturacion-automatica"), negocio({ role: "OWNER", contexto: ctx(sinBancos, null) })),
    "modulo",
  );
  // El mismo `catalog` sin `inventario`, en el piloto: Compras no está.
  const piloto = negocio({ role: "OWNER", contexto: ctx(MAGRA), esMostrador: true });
  assert.equal(motivoNoDisponible(appPorId("recibir-mercaderia"), piloto), "modulo");
});

// ── Las apps que leen otros negocios exigen su módulo SIEMPRE ─────────────────

const MIS_LOCALES_PRUEBA: AppDescriptor = {
  id: "mis-locales-prueba",
  nombre: "Mis locales (prueba)",
  descripcion: "Fixture: una app que lee datos de otros negocios.",
  icono: "dashboard",
  ruta: "/admin/locales-prueba",
  espacio: "locales",
  capability: "dashboard:read",
  modulo: "multilocal",
  moduloDuro: true,
  estado: "lista",
};

test("moduloDuro: invisible con contexto null si el negocio no tiene el módulo", () => {
  const n = negocio({ role: "OWNER", contexto: null, modulosAsignados: ["pos", "catalog"] });
  assert.equal(motivoNoDisponible(MIS_LOCALES_PRUEBA, n), "modulo");
  assert.deepEqual(ids(appsVisibles(n, [MIS_LOCALES_PRUEBA])), []);
  // Una app común con el mismo módulo, en cambio, pasa: sin gate no decide el módulo.
  const comun = { ...MIS_LOCALES_PRUEBA, id: "comun", moduloDuro: undefined };
  assert.deepEqual(ids(appsVisibles(n, [comun])), ["comun"]);
});

test("moduloDuro: el módulo de la barra de hoy no lo afloja en el Comerciante", () => {
  // Aunque una app de Mis locales llegara a tener un `moduloDeHoy` sin módulo, en un
  // Comerciante sin `multilocal` sigue cerrada: lee datos de otros negocios.
  const conMenu: AppDescriptor = { ...MIS_LOCALES_PRUEBA, menuDeHoy: { etiqueta: "Prueba", orden: 999, moduloDeHoy: null } };
  const kiosco: TenantParaApps = { id: "t-k", slug: "kiosco", blueprintId: "generico", modules: nucleoParaProducto("comerciante") };
  const n = negocio({ role: "OWNER", contexto: ctx(kiosco, null), modulosAsignados: kiosco.modules });
  assert.equal(n.contexto?.origen, "producto");
  assert.equal(motivoNoDisponible(conMenu, n), "modulo");
});

test("moduloDuro: la casa (con el módulo asignado) la ve, con o sin gate", () => {
  const sinGate = negocio({ role: "OWNER", modulosAsignados: ["multilocal"] });
  assert.equal(appPermitida(MIS_LOCALES_PRUEBA, sinGate), true);
  const conGate = negocio({ role: "OWNER", contexto: { origen: "piloto", modulos: new Set(["multilocal"]) } });
  assert.equal(appPermitida(MIS_LOCALES_PRUEBA, conGate), true);
  // Con gate manda lo resuelto, no lo crudo: asignado pero descartado por el resolver = no.
  const descartado = negocio({ role: "OWNER", contexto: { origen: "piloto", modulos: new Set() }, modulosAsignados: ["multilocal"] });
  assert.equal(appPermitida(MIS_LOCALES_PRUEBA, descartado), false);
  // Y el rol sigue mandando: PROFESSIONAL no tiene dashboard:read.
  assert.equal(motivoNoDisponible(MIS_LOCALES_PRUEBA, { ...sinGate, role: "PROFESSIONAL" }), "rol");
});

// ── Rubro, rol, estado ───────────────────────────────────────────────────────

test("motivos: rol primero, después en preparación, módulo, rubro y edición", () => {
  // PROFESSIONAL teclea /admin/facturacion en CH.
  assert.equal(motivoNoDisponible(appPorId("facturacion"), negocio({ role: "PROFESSIONAL" })), "rol");
  // OWNER de un mostrador teclea /admin/turnos.
  assert.equal(motivoNoDisponible(appPorId("agenda"), negocio({ role: "OWNER", esMostrador: true })), "rubro");
  // OWNER de una estética teclea /admin/inventario.
  assert.equal(motivoNoDisponible(appPorId("inventario"), negocio({ role: "OWNER" })), "rubro");
  // Lotes: mostrador sin la migración cárnica.
  const lotes = appPorId("lotes-y-vencimientos");
  assert.equal(motivoNoDisponible(lotes, negocio({ role: "OWNER", esMostrador: true })), "rubro");
  assert.equal(motivoNoDisponible(lotes, negocio({ role: "OWNER", esMostrador: true, carniceriaLista: true })), null);
  // Una app en preparación no se abre, aunque todo lo demás dé.
  const enPreparacion = { ...appPorId("reportes"), estado: "en-preparacion" as const };
  assert.equal(motivoNoDisponible(enPreparacion, negocio({ role: "OWNER" })), "en-preparacion");
  assert.deepEqual(ids(appsVisibles(negocio({ role: "OWNER" }), [enPreparacion])), []);
});

test("'App no disponible' la abre cualquiera con sesión, y nunca se ofrece en un lanzador", () => {
  const nd = appPorId("app-no-disponible");
  for (const role of ["OWNER", "RECEPTION", "PROFESSIONAL"] as const) {
    assert.equal(rolPuedeEntrar(nd, role), true, role);
    assert.equal(appPermitida(nd, negocio({ role })), true, role);
    assert.equal(ids(appsVisibles(negocio({ role }))).includes("app-no-disponible"), false, role);
  }
});

// ── El buscador no revela apps ocultas ───────────────────────────────────────

const CASOS_BUSCADOR: { nombre: string; n: NegocioApps }[] = [
  { nombre: "RECEPTION de CH", n: negocio({ role: "RECEPTION" }) },
  { nombre: "PROFESSIONAL de CH", n: negocio({ role: "PROFESSIONAL" }) },
  { nombre: "OWNER de magra en el piloto", n: negocio({ role: "OWNER", contexto: ctx(MAGRA), esMostrador: true }) },
  { nombre: "OWNER de CH", n: negocio({ role: "OWNER" }) },
];

test("el buscador no revela apps ocultas, ni tecleando su nombre, sus palabras o su rótulo de hoy", () => {
  for (const { nombre, n } of CASOS_BUSCADOR) {
    const visibles = appsVisibles(n);
    const ocultas = REGISTRO_APPS.filter((a) => !visibles.includes(a));
    assert.ok(ocultas.length > 0, `${nombre}: el caso no prueba nada si no hay ocultas`);
    for (const oculta of ocultas) {
      const consultas = [oculta.nombre, oculta.id, ...(oculta.palabras ?? []), oculta.menuDeHoy?.etiqueta ?? ""];
      for (const q of consultas.filter(Boolean)) {
        // El buscador del Inicio (sobre apps) y el de la barra de hoy (sobre la proyección).
        const enInicio = buscarApps(visibles, q);
        assert.ok(!enInicio.includes(oculta), `${nombre}: "${q}" reveló ${oculta.id} en el Inicio`);
        assert.ok(enInicio.every((a) => visibles.includes(a)), `${nombre}: "${q}" devolvió algo no visible`);
        const enBarra = searchNavItems(proyectarMenuDeHoy(visibles), q);
        assert.ok(!enBarra.some((i) => i.href === oculta.ruta), `${nombre}: "${q}" reveló ${oculta.ruta} en la barra`);
      }
    }
  }
});

test("el buscador encuentra lo que la persona sí ve, por nombre, palabra o rótulo de hoy", () => {
  const owner = appsVisibles(negocio({ role: "OWNER" }));
  assert.equal(buscarApps(owner, "fact")[0]?.id, "facturacion");
  assert.equal(buscarApps(owner, "afip")[0]?.id, "facturacion");
  assert.equal(buscarApps(owner, "arqueo")[0]?.id, "cierre-del-dia");
  // "Ajustes" era el rótulo de Mermas: quien lo busca así la sigue encontrando.
  assert.ok(ids(buscarApps(owner, "ajustes")).includes("mermas"));
  assert.deepEqual(buscarApps(owner, "   "), []);
  // PROFESSIONAL sólo ve su agenda.
  const prof = appsVisibles(negocio({ role: "PROFESSIONAL" }));
  assert.deepEqual(ids(prof), ["agenda"]);
  assert.deepEqual(buscarApps(prof, "fact"), []);
});

// ── Orden por espacio ────────────────────────────────────────────────────────

test("appsVisibles sale ordenada por espacio y, adentro, por el orden decidido", () => {
  const n = negocio({
    role: "OWNER",
    contexto: ctx({ ...MAGRA, modules: [...MAGRA.modules, "inventario", "campanias", "bancos"] }),
    esMostrador: true,
    carniceriaLista: true,
  });
  const visibles = appsVisibles(n);
  const espacios = visibles.map((a) => ordenDeEspacio(a.espacio));
  assert.deepEqual(espacios, [...espacios].sort((a, b) => a - b), "espacios fuera de orden");
  assert.deepEqual(
    ids(visibles.filter((a) => a.espacio === "caja")),
    ["caja-del-dia", "cierre-del-dia", "libro-de-caja"],
  );
  assert.deepEqual(
    ids(visibles.filter((a) => a.espacio === "stock")),
    ["inventario", "movimientos", "recuento", "mermas", "recibir-mercaderia", "proveedores", "lotes-y-vencimientos", "despiece"],
  );
  // El primer espacio se llama según el rubro.
  assert.equal(nombreDeEspacio("mostrador", { esMostrador: true }), "Mostrador");
  assert.equal(nombreDeEspacio("mostrador", { esMostrador: false }), "Recepción");
});

// ── "App no disponible": a quién pedírsela y por dónde volver, sin loop ──────

test("PROFESSIONAL teclea /admin/facturacion: el porqué es su rol y el botón va a su agenda", () => {
  const n = negocio({ role: "PROFESSIONAL" });
  const app = appPorId("facturacion");
  const motivo = motivoNoDisponible(app, n);
  const texto = explicarNoDisponible(app, motivo, n);
  assert.equal(texto.titulo, "Facturación no está disponible");
  assert.match(texto.aQuien, /dueña o al dueño/);
  assert.deepEqual(destinoDeVuelta(n), { href: "/admin/turnos", etiqueta: "Ir a mi agenda" });
});

test("a quién pedírsela: la dueña o el dueño a GSG, el resto del equipo a la dueña o el dueño", () => {
  const app = appPorId("libro-iva");
  const owner = negocio({ role: "OWNER", contexto: ctx(MAGRA), esMostrador: true });
  const recepcion = { ...owner, role: "RECEPTION" as const };
  assert.match(explicarNoDisponible(app, motivoNoDisponible(app, owner), owner).aQuien, /Gestión Studio Grow/);
  // RECEPTION no tiene reports:read: su motivo es el rol, y se lo pide a la dueña.
  assert.equal(motivoNoDisponible(app, recepcion), "rol");
  assert.match(explicarNoDisponible(app, "modulo", recepcion).aQuien, /dueña o al dueño/);
  // Un id que no es una app no se inventa: mensaje genérico.
  assert.equal(explicarNoDisponible(undefined, null, owner).titulo, "Esta pantalla no está disponible");
  // Cada motivo tiene su texto, y ninguno queda sin decir cómo seguir.
  for (const motivo of ["rol", "en-preparacion", "modulo", "rubro", "edicion", null] as const) {
    const t = explicarNoDisponible(appPorId("despiece"), motivo, owner);
    assert.ok(t.porque.length > 0 && t.aQuien.length > 0, `${motivo}`);
  }
});

test("sin loop: si la casa del rol tampoco se puede abrir, no hay botón de vuelta", () => {
  // PROFESSIONAL en un local de mostrador: su casa es la agenda, y la agenda no aplica.
  const n = negocio({ role: "PROFESSIONAL", esMostrador: true });
  assert.equal(appPermitida(appPorId("agenda"), n), false);
  assert.equal(destinoDeVuelta(n), null);
  // OWNER y RECEPTION vuelven al Inicio, que es del núcleo y siempre abre.
  assert.deepEqual(destinoDeVuelta(negocio({ role: "OWNER", esMostrador: true })), { href: "/admin", etiqueta: "Ir al inicio" });
  assert.deepEqual(destinoDeVuelta(negocio({ role: "RECEPTION", contexto: ctx(MAGRA) })), { href: "/admin", etiqueta: "Ir al inicio" });
});

// ── El número del botón: la plata pide reports:read ──────────────────────────

test("número del botón: RECEPTION ve cuántos, nunca cuánta plata", () => {
  // Cierre del día: RECEPTION lo abre (orders:read) y ve los días sin cerrar, pero no el
  // faltante del último cierre.
  assert.deepEqual(partesDelKpi(appPorId("cierre-del-dia"), "RECEPTION"), { numero: true, monto: false });
  assert.deepEqual(partesDelKpi(appPorId("cierre-del-dia"), "OWNER"), { numero: true, monto: true });
  assert.deepEqual(partesDelKpi(appPorId("caja-del-dia"), "RECEPTION"), { numero: true, monto: false });
  assert.deepEqual(partesDelKpi(appPorId("libro-de-caja"), "RECEPTION"), { numero: true, monto: false });
  // Un número que es todo plata no se muestra sin reports:read.
  assert.deepEqual(partesDelKpi(appPorId("reportes"), "RECEPTION"), { numero: false, monto: false });
  // Sin número declarado, no hay nada que mostrar.
  assert.equal(partesDelKpi(appPorId("apariencia"), "OWNER"), null);
});

test("número del botón: ninguna app con plata en su número se la muestra a quien no tiene reports:read", () => {
  // Las apps cuyo número, según el catálogo de producto, lleva pesos ('$X').
  const CON_PLATA: AppId[] = [
    "caja-del-dia", "cierre-del-dia", "libro-de-caja", "inventario", "recibir-mercaderia", "mermas",
    "lotes-y-vencimientos", "devoluciones-a-proveedor", "reportes", "libro-iva", "cuentas-a-cobrar", "cuentas-a-pagar",
  ];
  for (const id of CON_PLATA) {
    const app = appPorId(id);
    assert.ok(app.kpi, `${id}: sin número declarado`);
    // La plata está declarada en algún lado: en `monto` o como capability del número entero.
    assert.ok(app.kpi.monto || app.kpi.capability, `${id}: la plata no tiene capability`);
    for (const role of ["RECEPTION", "PROFESSIONAL"] as const) {
      const partes = partesDelKpi(app, role)!;
      const vePlata: boolean = app.kpi.monto ? partes.monto : partes.numero;
      assert.equal(vePlata, false, `${id}: ${role} vería plata`);
    }
    assert.equal(partesDelKpi(app, "OWNER")!.numero, true, `${id}: la dueña no ve el número`);
  }
  // Y ninguna app declara plata con una capability que no sea reports:read.
  for (const app of REGISTRO_APPS) {
    if (app.kpi?.monto) assert.equal(app.kpi.monto.capability, "reports:read", app.id);
  }
});

test("el encargado: RECEPTION de un mostrador del piloto abre Stock, Recibir mercadería y Mermas; en CH, no", () => {
  const encargado = negocio({ role: "RECEPTION", contexto: ctx({ ...MAGRA, modules: [...MAGRA.modules, "inventario"] }), esMostrador: true });
  for (const id of ["inventario", "recibir-mercaderia", "mermas", "movimientos", "recuento"] as const) {
    assert.equal(motivoNoDisponible(appPorId(id), encargado), null, id);
  }
  // Proveedores y Devoluciones siguen siendo de la dueña.
  assert.equal(motivoNoDisponible(appPorId("proveedores"), encargado), "rol");
  // CH (sin gate): la recepción no suma Compras ni Ajustes, ni tecleando la ruta.
  const recepcionCH = negocio({ role: "RECEPTION", contexto: null, esMostrador: false });
  for (const id of ["recibir-mercaderia", "mermas"] as const) {
    assert.equal(motivoNoDisponible(appPorId(id), recepcionCH), "rol", id);
  }
  // Un mostrador FUERA del piloto (sin gate) tampoco: la barra de hoy no cambia.
  const mostradorSinPiloto = negocio({ role: "RECEPTION", contexto: null, esMostrador: true });
  assert.equal(motivoNoDisponible(appPorId("inventario"), mostradorSinPiloto), "rol");
  // Sin el negocio, la regla es la de siempre.
  assert.equal(rolPuedeEntrar(appPorId("inventario"), "RECEPTION"), false);
});

// CH (asignación vacía, sin gate) no puede entrar a Vender ni a Ventas del día ni tecleando la
// URL: son plata nueva en el negocio vivo. MAGRA, con `pos`, sí. Se prueba con el registro REAL.
test("Vender y Ventas del día: CH no las ve ni por URL; un comercio con pos sí", async () => {
  const { REGISTRO_APPS } = await import("./registro");
  const apps = REGISTRO_APPS.filter((a) => a.id === "vender" || a.id === "ventas-del-dia");
  assert.equal(apps.length, 2);
  for (const role of ["OWNER", "RECEPTION"] as const) {
    const ch = negocio({ role, contexto: null, modulosAsignados: [] });
    for (const app of apps) assert.equal(motivoNoDisponible(app, ch), "modulo", `${app.id} para ${role} de CH`);
    const comercio = negocio({ role, contexto: null, modulosAsignados: ["pos", "catalog"], esMostrador: true });
    for (const app of apps) assert.equal(motivoNoDisponible(app, comercio), null, `${app.id} para ${role} de un comercio`);
  }
});
