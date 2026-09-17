// ============================================================================
// IDENTIDAD PÚBLICA DEL LOCAL — el caso de los 5 locales de MAGRA.
// ============================================================================
//
// Qué blinda: que la vidriera pública de un local NO dependa de que su slug esté
// escrito a mano en algún mapa. MAGRA abre 5 locales y cada local es un tenant
// propio; cuatro de los cinco NO se llaman `magra`. Antes de este arreglo:
//   · `src/blueprints/retail/rubros.ts` tenía 3 slugs a mano (magra/shinevelas/adosmanos)
//   · `src/app/tienda/page.tsx` elegía el front con `if (slug === "magra" || "magra-demo")`
// → `magra-lomas` no era retail, su raíz servía la LANDING DE ESTÉTICA de CH (otra clienta,
// con las fotos y los nombres de su equipo) y su /tienda caía a la vidriera genérica.
//
// Los casos de abajo corren la resolución REAL (la misma que usan las páginas) con las
// filas de `Tenant` tal como están en la base: se leyeron de Postgres local
// (`select slug, "blueprintId" from "Tenant"`) y de los seeds que dan de alta los tenants
// (prisma/seed-qa-tenants.ts, prisma/seed-magra.ts y el create de scripts/provision-tenant.ts).
//
// Si alguien revierte el arreglo (vuelve a resolver sólo por slug exacto, o vuelve a
// elegir el front con un `if` de slugs), los casos `magra-lomas` fallan.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTenantIdentity, editorialFrontFor } from "./identidad-rubro";
import { resolveRubroId, resolveRubroIdBySlug, tenantFamilySlug } from "@/blueprints/retail/rubros";

// ---------------------------------------------------------------------------
// EL CASO QUE HOY FALLA: los otros 4 locales de MAGRA.
// ---------------------------------------------------------------------------

test("local nuevo de MAGRA (slug magra-lomas, blueprintId carniceria): es carnicería y es MAGRA", () => {
  // Fila tal como la escribe el alta: `scripts/provision-tenant.ts` setea
  // blueprintId = id del blueprint elegido.
  const id = buildTenantIdentity({ slug: "magra-lomas", blueprintId: "carniceria" });

  // 1. RUBRO = carnicería → su raíz pública es la vidriera, no la landing de estética.
  assert.equal(id.rubroId, "carniceria");
  assert.equal(id.isRetail, true, "magra-lomas tiene que ser un local de mostrador");

  // 2. VOCABULARIO de carnicería, no de spa ni genérico.
  assert.equal(id.rubro?.wording.itemNoun, "corte");
  assert.equal(id.rubro?.wording.catalogHeading, "La selección");

  // 3. FRONT de carnicería = el editorial de MAGRA (carbón+hueso+oro), no el molde genérico.
  assert.equal(id.brandId, "magra");
  assert.equal(editorialFrontFor(id), "magra");
});

test("los 5 locales de MAGRA resuelven igual, se llamen como se llamen", () => {
  const locales = ["magra", "magra-lomas", "magra-canning", "magra-ezeiza", "magra-san-vicente"];
  for (const slug of locales) {
    const id = buildTenantIdentity({ slug, blueprintId: "carniceria" });
    assert.equal(id.rubroId, "carniceria", `${slug}: rubro`);
    assert.equal(editorialFrontFor(id), "magra", `${slug}: front editorial`);
  }
});

test("el DATO gana al slug: un local de MAGRA con slug ajeno sigue siendo carnicería", () => {
  // Caso real posible: el dueño pide un slug comercial ("carnes-lomas") en vez de "magra-*".
  // El rubro tiene que salir igual, porque salió del alta.
  const id = buildTenantIdentity({ slug: "carnes-lomas", blueprintId: "carniceria" });
  assert.equal(id.rubroId, "carniceria");
  assert.equal(id.isRetail, true);
  // La MARCA, en cambio, no se puede adivinar del rubro: sin familia de slug, vidriera
  // genérica del rubro. Correcto: otra carnicería no puede llevar el relato de MAGRA.
  assert.equal(id.brandId, null);
  assert.equal(editorialFrontFor(id), null);
});

test("el rubro NO se hereda entre marcas: otra carnicería no es MAGRA", () => {
  const otra = buildTenantIdentity({ slug: "donjose", blueprintId: "carniceria" });
  assert.equal(otra.rubroId, "carniceria");
  assert.equal(editorialFrontFor(otra), null, "el front de MAGRA es de MAGRA");
});

// ---------------------------------------------------------------------------
// NO ROMPER LO VIVO: beauty-spa es el único tenant en producción.
// ---------------------------------------------------------------------------

test("beauty-spa (blueprintId null en la base) NO es retail: sigue con la landing de CH", () => {
  // Fila real del Postgres local: slug "beauty-spa", blueprintId NULL.
  const id = buildTenantIdentity({ slug: "beauty-spa", blueprintId: null });
  assert.equal(id.rubroId, null);
  assert.equal(id.isRetail, false, "si esto da true, beauty-spa pierde su home");
  assert.equal(id.brandId, null);
  assert.equal(editorialFrontFor(id), null);
});

test("un tenant de agenda con blueprint propio tampoco es retail", () => {
  // `prisma/seed-qa-tenants.ts` (seedServicios) da de alta los de agenda con blueprintId "servicios".
  const id = buildTenantIdentity({ slug: "estetica-demo", blueprintId: "servicios" });
  assert.equal(id.isRetail, false);
});

test("blueprintId comodín 'generico' no alcanza para ser de mostrador", () => {
  // Fila real del Postgres local: slug "tenant-b", blueprintId "generico".
  const id = buildTenantIdentity({ slug: "tenant-b", blueprintId: "generico" });
  assert.equal(id.rubroId, null);
  assert.equal(id.isRetail, false);
});

test("sin tenant resuelto (fail-open) no se cambia nada", () => {
  const id = buildTenantIdentity({ slug: null, blueprintId: null });
  assert.equal(id.isRetail, false);
  assert.equal(id.brandId, null);
});

// ---------------------------------------------------------------------------
// RED DE CONTENCIÓN POR SLUG: tenants viejos, sin blueprintId.
// ---------------------------------------------------------------------------

test("tenant viejo sin blueprintId: el slug exacto lo salva", () => {
  const id = buildTenantIdentity({ slug: "magra", blueprintId: null });
  assert.equal(id.rubroId, "carniceria");
  assert.equal(editorialFrontFor(id), "magra");
});

test("tenant viejo sin blueprintId: la FAMILIA del slug también lo salva", () => {
  // Éste es el que antes sólo andaba porque `tienda/page.tsx` tenía "magra-demo" a mano.
  const id = buildTenantIdentity({ slug: "magra-demo", blueprintId: null });
  assert.equal(id.rubroId, "carniceria");
  assert.equal(editorialFrontFor(id), "magra");
});

test("la familia del slug NO inventa rubros donde no los hay", () => {
  assert.equal(resolveRubroIdBySlug("beauty-spa"), null);
  assert.equal(resolveRubroIdBySlug("estetica-demo"), null);
  assert.equal(resolveRubroIdBySlug("tenant-b"), null);
  assert.equal(resolveRubroIdBySlug(""), null);
  assert.equal(resolveRubroIdBySlug(null), null);
});

test("tenantFamilySlug: lo que va antes del primer guion", () => {
  assert.equal(tenantFamilySlug("magra-lomas"), "magra");
  assert.equal(tenantFamilySlug("magra"), "magra");
  assert.equal(tenantFamilySlug("magra-san-vicente"), "magra");
  assert.equal(tenantFamilySlug("MAGRA-Lomas"), "magra");
  assert.equal(tenantFamilySlug("  "), null);
  assert.equal(tenantFamilySlug(null), null);
});

test("un blueprintId que no es un rubro retail no se cuela como rubro", () => {
  assert.equal(resolveRubroId({ blueprintId: "no-existe", slug: "beauty-spa" }), null);
  // pero no anula la red de contención por slug
  assert.equal(resolveRubroId({ blueprintId: "no-existe", slug: "magra-lomas" }), "carniceria");
});

test("los demos de QA caen al rubro por su blueprintId, no por el slug", () => {
  // prisma/seed-qa-tenants.ts — "velas-demo"/"padel-demo" NO están en el mapa de slugs.
  assert.equal(buildTenantIdentity({ slug: "velas-demo", blueprintId: "velas" }).rubroId, "velas");
  assert.equal(buildTenantIdentity({ slug: "padel-demo", blueprintId: "padel" }).rubroId, "padel");
});

// ---------------------------------------------------------------------------
// DATOS DEL LOCAL: una sola fuente (BusinessSettings), y el WhatsApp no se parte.
// ---------------------------------------------------------------------------

import { MAGRA_CANNING_LOCALIZACION, resolveMagraLocal, whatsappLabel } from "@/tenants/magra-content";
import { getStorefrontCopy } from "@/tenants/storefront";

const soloDigitos = (v: string) => v.replace(/\D/g, "");

test("WhatsApp: el texto que se lee y el número que se abre son el MISMO dato", () => {
  // El bug: el pie pintaba "+54 9 11 7609 5555" y el href iba a wa.me/5491161354042.
  // El cliente leía un número y el click abría otro.
  for (const crudo of ["5491161354042", "+54 9 11 7609 5555", "11 6135-4042 ", "5492214567890"]) {
    const local = resolveMagraLocal({
      addressLine: null, city: null, hoursLabel: null, whatsapp: crudo, instagram: null, email: null,
    });
    const href = `https://wa.me/${local.whatsapp}`;
    assert.equal(
      soloDigitos(local.whatsappLabel ?? ""),
      soloDigitos(href),
      `el texto visible y el link tienen que ser el mismo número (${crudo})`,
    );
  }
});

test("WhatsApp: formato AR legible, sin inventar cuando no lo es", () => {
  assert.equal(whatsappLabel("5491161354042"), "+54 9 11 6135 4042");
  assert.equal(whatsappLabel("5492214567890"), "+54 9 221 456 7890");
  assert.equal(whatsappLabel("447911123456"), "+447911123456"); // no-AR: se muestra tal cual
  assert.equal(whatsappLabel(""), null);
});

test("local sin datos cargados: devuelve vacío, NO los datos de Canning", () => {
  // Con 5 locales, heredar la dirección de Canning manda al cliente a otra ciudad.
  const local = resolveMagraLocal(null);
  assert.equal(local.addressLine, null);
  assert.equal(local.hours, null);
  assert.equal(local.whatsapp, "");
  assert.equal(local.whatsappLabel, null);
  assert.equal(local.email, null);
  assert.equal(local.instagramUrl, null);
  // y en particular: ninguno de los valores de Canning se filtró como default
  assert.notEqual(local.addressLine, MAGRA_CANNING_LOCALIZACION.addressLine);
  assert.notEqual(local.whatsapp, MAGRA_CANNING_LOCALIZACION.whatsapp);
});

test("local con datos cargados: gana BusinessSettings, campo por campo", () => {
  const local = resolveMagraLocal({
    addressLine: "  Av. Antártida Argentina 1200, Lomas de Zamora ",
    city: "Buenos Aires",
    hoursLabel: "Lun a sáb · 9 a 21 h",
    whatsapp: "+54 9 11 5555 1234",
    instagram: "https://www.instagram.com/magralomas/",
    email: "lomas@magrameatmarket.com.ar",
  });
  assert.equal(local.addressLine, "Av. Antártida Argentina 1200, Lomas de Zamora");
  assert.equal(local.hours, "Lun a sáb · 9 a 21 h");
  assert.equal(local.whatsapp, "5491155551234");
  assert.equal(local.whatsappLabel, "+54 9 11 5555 1234");
  assert.equal(local.instagram, "@magralomas");
  assert.equal(local.instagramUrl, "https://www.instagram.com/magralomas/");
  assert.equal(local.email, "lomas@magrameatmarket.com.ar");
});

test("campos en blanco cuentan como sin cargar (no se publica un string vacío)", () => {
  const local = resolveMagraLocal({
    addressLine: "   ", city: "", hoursLabel: null, whatsapp: "  ", instagram: "  ", email: "",
  });
  assert.equal(local.addressLine, null);
  assert.equal(local.city, null);
  assert.equal(local.whatsapp, "");
  assert.equal(local.instagram, null);
});

test("la localidad del mástil y del envío sale del local, no del copy", () => {
  // "MAGRA · Meat Market · Canning" en el mástil de Lomas era la marca diciendo que está
  // en otra ciudad. Ahora la localidad sale de BusinessSettings.city (antes de la coma).
  const lomas = resolveMagraLocal({
    addressLine: null, city: "Lomas de Zamora, Buenos Aires", hoursLabel: null,
    whatsapp: null, instagram: null, email: null,
  });
  assert.equal(lomas.zoneLabel, "Lomas de Zamora");
  const canning = resolveMagraLocal({
    addressLine: null, city: "Canning, Buenos Aires", hoursLabel: null,
    whatsapp: null, instagram: null, email: null,
  });
  assert.equal(canning.zoneLabel, "Canning");
  // Sin ciudad cargada, la vidriera omite la localidad en vez de inventar una.
  assert.equal(resolveMagraLocal(null).zoneLabel, null);
});

test("Instagram: handle o URL, siempre un link que abre", () => {
  const conHandle = resolveMagraLocal({
    addressLine: null, city: null, hoursLabel: null, whatsapp: null, instagram: "@tiendamagra", email: null,
  });
  assert.equal(conHandle.instagram, "@tiendamagra");
  assert.equal(conHandle.instagramUrl, "https://www.instagram.com/tiendamagra");
});

test("el copy de marca llega a TODOS los locales, no sólo al del slug exacto", () => {
  // Por qué importa fuera de la vidriera: `generateMetadata` de /tienda arma la
  // <meta description> con `copy.intro ?? copy.about.body ?? branding.contactNote`.
  // Sin copy resuelto, la descripción caía al contactNote de la fila — y el seed de QA
  // escribe ahí "Carnicería DEMO — datos ficticios para QA." (prisma/seed-magra.ts).
  // Eso es lo que indexa Google y lo que muestra la previsualización de un link de WhatsApp.
  for (const slug of ["magra", "magra-demo", "magra-lomas"]) {
    const copy = getStorefrontCopy(slug);
    assert.ok(copy, `${slug} tiene que resolver el copy de MAGRA`);
    assert.equal(copy?.tagline, "Esto no es una carnicería.");
    assert.ok((copy?.intro ?? "").length > 0, `${slug}: la <meta description> sale de acá`);
  }
  // Y no se le regala el copy de MAGRA a cualquiera.
  assert.equal(getStorefrontCopy("beauty-spa"), null);
  assert.equal(getStorefrontCopy("donjose"), null);
});

// ── Lo que se le publica a un local que NO es el de Canning ─────────────────
//
// Estos tests existen porque el primer intento de arreglar la identidad pública dejó tres
// cosas que se ven en la pantalla de los otros cuatro locales: el hero prometiendo reparto en
// Canning, el "quiénes somos" cerrando en Canning, y la localidad saliendo de `city` —cuyo
// default es "Buenos Aires"— en vez de la dirección.

import { promesaDeReparto, textoAbout, esElLocalDelCopy, MAGRA } from "@/tenants/magra-content";

const CANNING = {
  addressLine: "José Champagnat 4351 – Local 1, Sotavento Point, Canning",
  city: "Buenos Aires",
  whatsapp: "5491161354042",
} as never;

const LOMAS = {
  addressLine: "Av. Meeks 1200, Lomas de Zamora",
  city: "Buenos Aires",
  whatsapp: "5491155550000",
} as never;

test("la localidad sale de la DIRECCIÓN, no de `city` (cuyo default es Buenos Aires)", () => {
  assert.equal(resolveMagraLocal(CANNING).zoneLabel, "Canning");
  assert.equal(resolveMagraLocal(LOMAS).zoneLabel, "Lomas de Zamora");
  // Sin dirección cargada cae a `city`, que es lo único que queda.
  assert.equal(resolveMagraLocal({ city: "Canning, Buenos Aires" } as never).zoneLabel, "Canning");
  assert.equal(resolveMagraLocal(null).zoneLabel, null);
});

test("el hero de Lomas NO promete reparto en Canning, San Vicente ni Guernica", () => {
  const lomas = resolveMagraLocal(LOMAS);
  const promesa = promesaDeReparto(lomas, MAGRA);
  assert.ok(promesa, "un local con localidad cargada sí promete reparto");
  for (const ajena of ["Canning", "San Vicente", "Guernica", "Ezeiza", "Monte Grande"]) {
    assert.ok(
      !promesa!.includes(ajena),
      `el hero de Lomas nombra "${ajena}", que es zona de otro local: ${promesa}`,
    );
  }
  assert.ok(promesa!.includes("Lomas de Zamora"));
});

test("el local de Canning conserva su promesa entera, palabra por palabra", () => {
  assert.equal(promesaDeReparto(resolveMagraLocal(CANNING), MAGRA), MAGRA.heroZone);
  assert.equal(esElLocalDelCopy(resolveMagraLocal(CANNING)), true);
  assert.equal(esElLocalDelCopy(resolveMagraLocal(LOMAS)), false);
});

test("sin localidad cargada no se promete ningún reparto", () => {
  assert.equal(promesaDeReparto(resolveMagraLocal(null), MAGRA), null);
});

test("el «quiénes somos» cierra en la localidad del local, no en Canning", () => {
  const lomas = textoAbout(resolveMagraLocal(LOMAS), MAGRA);
  assert.ok(!lomas.includes("Canning"), `el about de Lomas dice Canning: ${lomas}`);
  assert.ok(lomas.includes("Servicio puerta a puerta en Lomas de Zamora."));
  // Y el de Canning queda igual que siempre.
  assert.ok(textoAbout(resolveMagraLocal(CANNING), MAGRA).includes("puerta a puerta en Canning."));
});

test("la vidriera NUNCA abre WhatsApp a un número que no sea del negocio", () => {
  // El camino sin número configurado abría un modal titulado "Tu WhatsApp" que le pedía el
  // número AL VISITANTE, lo guardaba en su localStorage y abría el chat contra él: el cliente
  // que quería hacer un pedido terminaba escribiéndose a sí mismo. Y `BusinessSettings.whatsapp`
  // está vacío en MAGRA (ni el script de corrección ni la semilla lo escriben), donde ese botón
  // es el ÚNICO canal de venta y aparece seis veces en la misma página.
  const cta = readFileSync(new URL("../components/whatsapp-cta.tsx", import.meta.url), "utf8");
  const sinComentarios = cta.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");
  assert.doesNotMatch(
    sinComentarios,
    /localStorage/,
    "volvió a guardar un número del visitante: el chat se abre contra él, no contra el local",
  );
  assert.doesNotMatch(
    sinComentarios,
    /Tu WhatsApp/,
    "volvió el modal que le pide el número a quien está mirando la página",
  );
  // Y que el único `window.open` siga colgando del número configurado.
  const abre = sinComentarios.indexOf("window.open");
  assert.ok(abre > 0, "la vidriera tiene que poder abrir WhatsApp cuando SÍ hay número");
  assert.equal(
    (sinComentarios.match(/window\.open/g) ?? []).length,
    1,
    "hay más de un camino que abre WhatsApp: uno de ellos no está atado al número del negocio",
  );
});
