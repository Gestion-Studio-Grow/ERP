// SEO de base (ronda 2, P0): robots, sitemap, canonical y JSON-LD por host y por rubro.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalDe, hostPublico, origenDelHost } from "./base";
import { esRutaPrivada, reglasDelRobots, rutasDelSitemap } from "./sitio";
import { catalogoLd, negocioLd, personaLd, productoLd, serializarLd, servicioLd, sinVacios } from "./jsonld";
import { ogDelNegocio } from "./og";

test("origen público por host: https en producción, http en local, sin puerto salvo local", () => {
  assert.equal(origenDelHost("QueBienOles.gsgapp.com.ar:443"), "https://quebienoles.gsgapp.com.ar");
  assert.equal(origenDelHost("quebienoles.localhost:3200"), "http://quebienoles.localhost:3200");
  assert.equal(origenDelHost("a.gsgapp.com.ar, proxy.interno"), "https://a.gsgapp.com.ar");
  assert.equal(origenDelHost('x"><script>'), null);
  assert.equal(hostPublico(null), null);
});

test("canonical: sin query ni hash ni barra final", () => {
  assert.equal(canonicalDe("https://a.gsgapp.com.ar", "/tienda?p=12#ficha"), "https://a.gsgapp.com.ar/tienda");
  assert.equal(canonicalDe("https://a.gsgapp.com.ar", "/servicios/"), "https://a.gsgapp.com.ar/servicios");
  assert.equal(canonicalDe("https://a.gsgapp.com.ar", "/"), "https://a.gsgapp.com.ar/");
  assert.equal(canonicalDe("https://a.gsgapp.com.ar", null), "https://a.gsgapp.com.ar/");
});

test("robots: con negocio cierra paneles y turnos; sin negocio cierra todo", () => {
  const r = reglasDelRobots("tienda");
  assert.equal(r.allow, "/");
  for (const p of ["/admin", "/operador", "/reserva/turno", "/alumno"]) assert.ok((r.disallow as string[]).includes(p), p);
  assert.deepEqual(reglasDelRobots("ninguno"), { disallow: "/" });
  assert.ok(esRutaPrivada("/admin/clientes"));
  assert.ok(esRutaPrivada("/tienda/gracias?pedido=3"));
  assert.ok(esRutaPrivada("/taller/turno/abc"));
  assert.ok(!esRutaPrivada("/taller/turno"), "el formulario del turno es público");
  assert.ok(!esRutaPrivada("/administracion-de-algo"), "prefijo de palabra, no de ruta");
  assert.ok(!esRutaPrivada("/tienda"));
});

test("sitemap por rubro: la portada primero, fichas propias, nada privado", () => {
  assert.deepEqual(rutasDelSitemap("tienda"), ["/tienda"]);
  assert.deepEqual(rutasDelSitemap("taller"), ["/taller", "/taller/turno"]);
  assert.deepEqual(rutasDelSitemap("clases"), ["/clases"]);
  assert.deepEqual(rutasDelSitemap("servicios", ["/servicios/a1"]), ["/", "/servicios", "/reserva", "/servicios/a1"]);
  assert.deepEqual(rutasDelSitemap("estatico", ["/", "/turnero"]), ["/", "/turnero"]);
  assert.deepEqual(rutasDelSitemap("ninguno", ["/x"]), []);
  assert.deepEqual(rutasDelSitemap("servicios", ["/admin/x"]), ["/", "/servicios", "/reserva"]);
});

test("tipo de sitio: base caída o apex nunca publican el sitemap de un negocio", async () => {
  const { tipoDeSitio } = await import("./tipo-de-sitio");
  const base = { vidrieraDeProducto: null, esApex: false, estado: "negocio" as const, slug: "x", blueprintId: null, isRetail: false, esSitioEstatico: false };
  assert.equal(tipoDeSitio(base), "servicios");
  assert.equal(tipoDeSitio({ ...base, estado: "sin-servicio" }), "ninguno");
  assert.equal(tipoDeSitio({ ...base, estado: "sin-negocio" }), "ninguno");
  assert.equal(tipoDeSitio({ ...base, esApex: true }), "ninguno");
  assert.equal(tipoDeSitio({ ...base, isRetail: true }), "tienda");
  assert.equal(tipoDeSitio({ ...base, blueprintId: "taller" }), "taller");
  assert.equal(tipoDeSitio({ ...base, blueprintId: "profe-padel" }), "clases");
  assert.equal(tipoDeSitio({ ...base, esSitioEstatico: true }), "estatico");
  assert.equal(tipoDeSitio({ ...base, vidrieraDeProducto: "/facturita" }), "producto");
});

test("JSON-LD: lo que no hay no se publica (dirección, teléfono, horarios, precio)", () => {
  const n = negocioLd("AutoRepair", { nombre: "Taller AGR", url: "https://agr.gsgapp.com.ar/taller", telefono: null, direccion: { calle: null, ciudad: null }, horarios: [] });
  assert.equal(n["@type"], "AutoRepair");
  assert.ok(!("telephone" in n));
  assert.ok(!("address" in n), "una dirección sin calle ni ciudad no se publica");
  assert.ok(!("openingHoursSpecification" in n));
  const conHorario = negocioLd("Store", { nombre: "X", url: "https://x", horarios: [{ dia: 1, abre: "09:00", cierra: "18:00" }, { dia: 9, abre: "x", cierra: "y" }] });
  assert.equal((conHorario.openingHoursSpecification as unknown[]).length, 1);
  const p = productoLd({ nombre: "Khamrah", url: "https://q/tienda", precio: 0 });
  assert.ok(!("offers" in p), "sin precio no hay oferta");
  const kg = productoLd({ nombre: "Vacío", url: "https://m/tienda", precio: 18500, unidad: "KGM", hayStock: true });
  assert.equal((kg.offers as Record<string, unknown>).availability, "https://schema.org/InStock");
  assert.equal(((kg.offers as Record<string, Record<string, unknown>>).priceSpecification).unitCode, "KGM");
  assert.equal(sinVacios({ a: "", b: [], c: { "@type": "X" } } as Record<string, unknown>).a, undefined);
});

test("JSON-LD: catálogo, servicio y persona", () => {
  const c = catalogoLd([{ nombre: "A", url: "https://t/tienda", precio: 100, marca: "Lattafa" }], { nombre: "T", url: "https://t" });
  const item = (c.itemListElement as Record<string, Record<string, unknown>>[])[0].item;
  assert.equal(item["@type"], "Product");
  assert.ok(!("@context" in item));
  const s = servicioLd({ nombre: "Limpieza facial", url: "https://ch/servicios/1", precio: 25000, duracionMin: 60 }, { nombre: "CH", url: "https://ch", tipo: "HealthAndBeautyBusiness" });
  assert.equal(s.timeRequired, "PT60M");
  const per = personaLd({ nombre: "Matías", url: "https://p/clases", ofertas: [{ nombre: "Individual", precio: 20000 }, { nombre: "Sin precio", precio: null }] });
  assert.equal((per.makesOffer as unknown[]).length, 1);
});

test("serializarLd no deja cerrar la etiqueta <script>", () => {
  const s = serializarLd({ name: "</script><script>alert(1)</script>" });
  assert.ok(!s.includes("</script>"));
  assert.deepEqual(JSON.parse(s), { name: "</script><script>alert(1)</script>" });
});

test("og:image sólo si el negocio tiene la suya", () => {
  assert.equal(ogDelNegocio("no-existe"), null);
});
