import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checklistApertura,
  estadoDelValor,
  evaluarListoParaFacturar,
  preciosSemillaPendientes,
  catalogoSemillaDe,
  type EstadoApertura,
  type ProductoApertura,
} from "./checklist-apertura";
import { RETAIL_RUBROS } from "@/blueprints/retail/rubros";
import { construirPerfilFiscal, type RegistroFiscalTenant } from "@/lib/fiscal";

// CUIT con dígito verificador VÁLIDO (mismo fixture que src/lib/fiscal.test.ts): sirve para que
// el validador no rechace el caso por una razón equivocada.
const CUIT_OK = "20304050609";

// DATOS REALES: el catálogo y el branding semilla que el blueprint de carnicería siembra en un
// local nuevo de MAGRA (src/blueprints/retail/rubros.ts). No se copian los valores acá: se leen
// del blueprint, así el test sigue siendo verdad cuando el catálogo cambie.
const CARNICERIA = RETAIL_RUBROS.carniceria;

function productosSemilla(): ProductoApertura[] {
  return CARNICERIA.catalog.map((c) =>
    c.sale === "kg"
      ? { name: c.name, price: null, pricePerKg: c.pricePerKg }
      : { name: c.name, price: c.price, pricePerKg: null },
  );
}

/** Local recién provisionado por el wizard: todo como lo dejó el blueprint. */
function magraLomasReciénCreada(over: Partial<EstadoApertura> = {}): EstadoApertura {
  return {
    slug: "magra-lomas",
    blueprintId: "carniceria",
    subdomain: null,
    usuariosActivos: 1,
    arcaCuit: null,
    arcaPuntoVenta: null,
    arcaHomologacion: true,
    certificadoCargado: false,
    certCuit: null,
    modoArca: "homologacion",
    condicionIvaDisponible: false,
    contacto: {
      addressLine: CARNICERIA.brandingDefaults.addressLine ?? null,
      instagram: CARNICERIA.brandingDefaults.instagram ?? null,
      whatsapp: null,
    },
    productos: productosSemilla(),
    ...over,
  };
}

/** El mismo local, ya configurado por el operador: listo para abrir. */
function magraLomasLista(over: Partial<EstadoApertura> = {}): EstadoApertura {
  return magraLomasReciénCreada({
    subdomain: "magra-lomas",
    usuariosActivos: 3,
    arcaCuit: CUIT_OK,
    arcaPuntoVenta: 4,
    certificadoCargado: true,
    certCuit: CUIT_OK,
    modoArca: "homologacion",
    contacto: {
      addressLine: "Ruta 58 km 3, Lomas de Canning",
      instagram: "@magra.lomas",
      whatsapp: "5491122334455",
    },
    // Precios reales del local: se le suma 12% al semilla. Nombres iguales a propósito —
    // lo que tiene que detectar el chequeo es el PRECIO, no el nombre.
    productos: productosSemilla().map((p) => ({
      ...p,
      price: p.price == null ? null : Math.round(p.price * 1.12),
      pricePerKg: p.pricePerKg == null ? null : Math.round(p.pricePerKg * 1.12),
    })),
    ...over,
  });
}

const item = (e: EstadoApertura, id: string) => {
  const i = checklistApertura(e).items.find((x) => x.id === id);
  assert.ok(i, `falta el ítem ${id}`);
  return i!;
};

// --- El caso que motiva el módulo -------------------------------------------

test("un local recién creado por el wizard NO está listo para abrir", () => {
  const r = checklistApertura(magraLomasReciénCreada());
  assert.equal(r.listo, false);
  // Los 6 ítems aplican y los 6 fallan: precios semilla, dirección provisional, IG placeholder,
  // sin datos fiscales, sin subdominio, un solo usuario.
  assert.equal(r.pendientes, 6);
});

test("el mismo local, ya configurado, da listo", () => {
  const r = checklistApertura(magraLomasLista());
  assert.deepEqual(
    r.items.filter((i) => i.ok === false).map((i) => i.id),
    [],
  );
  assert.equal(r.listo, true);
});

test("cada ítem explica POR QUÉ está en la lista (es lo que hace que se respete)", () => {
  for (const i of checklistApertura(magraLomasReciénCreada()).items) {
    assert.ok(i.porQue.length > 30, `el ítem ${i.id} no explica su razón`);
  }
});

// --- Precios: el dato real del blueprint -------------------------------------

test("detecta los precios provisionales del blueprint de carnicería", () => {
  const semilla = catalogoSemillaDe({ blueprintId: "carniceria", slug: "magra-lomas" });
  assert.ok(semilla && semilla.length > 10);
  const { pendientes } = preciosSemillaPendientes(productosSemilla(), semilla!);
  assert.equal(pendientes.length, CARNICERIA.catalog.length);
  const i = item(magraLomasReciénCreada(), "precios");
  assert.equal(i.ok, false);
  assert.match(i.detalle, /al precio del blueprint/);
});

test("un precio editado deja de contar como provisional; los demás siguen contando", () => {
  const productos = productosSemilla();
  productos[0] = { ...productos[0], pricePerKg: 21500, price: null }; // el dueño tocó el lomo
  const semilla = catalogoSemillaDe({ blueprintId: "carniceria", slug: "magra-lomas" })!;
  const { pendientes } = preciosSemillaPendientes(productos, semilla);
  assert.equal(pendientes.length, CARNICERIA.catalog.length - 1);
  assert.ok(!pendientes.includes(productos[0].name));
});

test("catálogo vacío = pendiente, no 'listo' por no tener nada que comparar", () => {
  assert.equal(item(magraLomasReciénCreada({ productos: [] }), "precios").ok, false);
});

test("un tenant que no es de mostrador no arrastra el chequeo de precios (beauty-spa)", () => {
  const e = magraLomasLista({ slug: "beauty-spa", blueprintId: null, productos: [] });
  assert.equal(item(e, "precios").ok, null); // no aplica, no bloquea
  assert.equal(checklistApertura(e).listo, true);
});

test("los 5 locales resuelven su rubro por familia de slug, no por un mapa a mano", () => {
  for (const slug of ["magra", "magra-lomas", "magra-canning", "magra-ezeiza", "magra-adrogue"]) {
    assert.ok(catalogoSemillaDe({ blueprintId: null, slug }), `${slug} no resolvió a carnicería`);
  }
});

// --- Dirección / Instagram ---------------------------------------------------

test("la dirección y el Instagram provisionales del blueprint se detectan", () => {
  const e = magraLomasReciénCreada();
  assert.equal(item(e, "direccion").ok, false);
  assert.equal(item(e, "instagram").ok, false);
  // El valor exacto que hoy vive en el blueprint (rubros.ts) — si alguien lo "arregla"
  // escribiendo otra dirección de mentira, la marca provisional lo sigue agarrando.
  assert.equal(estadoDelValor("Av. Provisional 1234, Canning", null), "provisional");
  assert.equal(estadoDelValor("@instagram-a-confirmar", null), "provisional");
  assert.equal(estadoDelValor("Av. Provisional 1234, Lomas", null), "provisional");
  assert.equal(estadoDelValor("", null), "vacio");
  assert.equal(estadoDelValor("Ruta 58 km 3, Lomas de Canning", null), "propio");
});

test("comparar contra el default del rubro es case/espacio-insensible", () => {
  const e = magraLomasReciénCreada({
    contacto: { addressLine: "  av. PROVISIONAL 1234,  canning ", instagram: "@magra.ok", whatsapp: null },
  });
  assert.equal(item(e, "direccion").ok, false);
  assert.equal(item(e, "instagram").ok, true);
});

// --- Semáforo fiscal: el que pintaba verde de más ----------------------------

test("REGRESIÓN: con CUIT y certificado pero SIN punto de venta, NO está listo para facturar", () => {
  const e = magraLomasLista({ arcaPuntoVenta: null, modoArca: "real" });
  const f = evaluarListoParaFacturar(e);
  assert.equal(f.listo, false);
  assert.ok(f.faltantes.some((m) => m.includes("punto de venta")));
  assert.equal(item(e, "facturacion").ok, false);
});

/**
 * ORÁCULO: quien decide de verdad si se puede emitir es `construirPerfilFiscal`
 * (src/lib/fiscal.ts). Si LANZA, la venta se cobra igual y la factura no sale. Este test recorre
 * la matriz de estados fiscales y exige que el semáforo NUNCA diga "listo" donde el constructor
 * del perfil lanza. Falla si se le saca al evaluador el chequeo de punto de venta o el de
 * condición de IVA en producción.
 */
test("ORÁCULO: el semáforo coincide con construirPerfilFiscal en modo real", () => {
  const combos: { pv: number | null; homologacion: boolean; condIva: boolean }[] = [];
  for (const pv of [null, 0, 4] as (number | null)[]) {
    for (const homologacion of [true, false]) {
      for (const condIva of [false, true]) combos.push({ pv, homologacion, condIva });
    }
  }

  for (const c of combos) {
    const e = magraLomasLista({
      arcaPuntoVenta: c.pv,
      arcaHomologacion: c.homologacion,
      condicionIvaDisponible: c.condIva,
      modoArca: "real",
    });
    const registro: RegistroFiscalTenant = {
      arcaCuit: e.arcaCuit,
      arcaPuntoVenta: e.arcaPuntoVenta,
      arcaHomologacion: e.arcaHomologacion,
      // La columna no existe hoy → el lector manda `undefined`. Con la migración aplicada,
      // el tenant cargaría su condición real.
      arcaCondicionIva: c.condIva ? "RESPONSABLE_INSCRIPTO" : undefined,
    };

    let lanza = false;
    try {
      construirPerfilFiscal("t-magra-lomas", registro);
    } catch {
      lanza = true;
    }

    const dice = evaluarListoParaFacturar(e).listo;
    assert.equal(
      dice,
      !lanza,
      `desacuerdo con el oráculo en ${JSON.stringify(c)}: semáforo=${dice}, perfil ${lanza ? "lanza" : "ok"}`,
    );
  }
});

test("en homologación la condición de IVA no bloquea (el plugin la asume y lo marca)", () => {
  const e = magraLomasLista({ modoArca: "homologacion", arcaHomologacion: false, condicionIvaDisponible: false });
  // modo `homologacion` fuerza homologación aunque el tenant diga producción → se puede emitir.
  assert.equal(evaluarListoParaFacturar(e).listo, true);
});

test("modo stub nunca es 'listo para facturar'", () => {
  assert.equal(evaluarListoParaFacturar(magraLomasLista({ modoArca: "stub" })).listo, false);
});

test("CUIT del certificado distinto al del tenant bloquea (la firma lo rechaza)", () => {
  const f = evaluarListoParaFacturar(magraLomasLista({ certCuit: "27222222228" }));
  assert.equal(f.listo, false);
  assert.ok(f.faltantes.some((m) => m.includes("no coincide")));
});

test("tabla de credenciales sin aplicar se reporta como bloqueo de migración, no como 'falta cargar'", () => {
  const f = evaluarListoParaFacturar(magraLomasLista({ certificadoCargado: null, certCuit: null }));
  assert.equal(f.listo, false);
  assert.equal(f.bloqueadoPorMigracion, true);
});

// --- Subdominio y usuarios ---------------------------------------------------

test("subdominio vacío o en blanco cuenta como pendiente", () => {
  assert.equal(item(magraLomasLista({ subdomain: "   " }), "subdominio").ok, false);
  assert.equal(item(magraLomasLista({ subdomain: "magra-lomas" }), "subdominio").ok, true);
});

test("un solo usuario es pendiente; dos ya no", () => {
  assert.equal(item(magraLomasLista({ usuariosActivos: 1 }), "usuarios").ok, false);
  assert.equal(item(magraLomasLista({ usuariosActivos: 2 }), "usuarios").ok, true);
});
