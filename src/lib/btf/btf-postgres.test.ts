// buscatufoto contra un Postgres real (base efímera, migraciones del repo, app como `app_rls` con
// RLS_ENFORCEMENT=on, igual que producción): alta → álbum → medios → /a/:slug.
// Lo que se prueba: lo público no trae ocultos, ni no subidos, ni nada del original, ni cupones; otro
// fotógrafo no puede tocar el álbum; el token de MP queda cifrado y nunca vuelve.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const HOST = "https://buscatufoto.gsgapp.com.ar";
const TOKEN_MP = "APP_USR-1234567890-abcdef-secreto-del-fotografo";

function entorno() {
  Object.assign(process.env, {
    BTF_S3_ENDPOINT: "https://cuenta.r2.example",
    BTF_S3_KEY: "k",
    BTF_S3_SECRET: "s",
    BTF_S3_BUCKET_ORIGINALES: "btf-originales",
    BTF_S3_BUCKET_PREVIAS: "btf-previas",
    BTF_PREVIAS_URL_PUBLICA: "https://previas.example",
    BTF_SECRET: "secreto-de-prueba-0123456789",
    BTF_CODIGO_ALTA: "codigo-alta-qa",
    FISCAL_MASTER_KEY: randomBytes(32).toString("base64"),
  });
}

const pedir = (ruta: string, init: { method?: string; cuerpo?: unknown; cookie?: string } = {}) =>
  new Request(`${HOST}/api/btf${ruta}`, {
    method: init.method ?? (init.cuerpo ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}) },
    body: init.cuerpo ? JSON.stringify(init.cuerpo) : undefined,
  });
const ctx = <T>(p: T) => ({ params: Promise.resolve(p) });
const cookieDe = (r: Response) => (r.headers.get("set-cookie") ?? "").split(";")[0];

const ALBUM = {
  nombre: "10K de la Costanera",
  evento: "carrera",
  lugar: "Rosario",
  fecha: "2026-11-01",
  descripcion: "",
  precioFoto: 1500,
  precioVideo: 0,
  paquetes: [],
  escalones: [{ desde: 3, porcentaje: 10 }],
  cupones: [{ codigo: "AMIGOS", tipo: "porcentaje", valor: 20, tope: 0, usosMax: 0, usos: 0, activo: true }],
  colaboradores: [{ nombre: "Ana", email: "ana@privado.example", rol: "asistente" }],
  publicado: true,
};
const MEDIO = { tipo: "foto", ancho: 4000, alto: 3000, duracion: null, peso: 5_000_000, dorsales: ["123"], mimeOriginal: "image/jpeg", mimePrevia: "image/webp" };

test("alta → álbum → medios → /a/:slug no expone ocultos, no subidos, originales ni cupones", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  entorno();

  const estado = await import("@/app/api/btf/estado/route");
  const alta = await import("@/app/api/btf/ingreso/alta/route");
  const ingreso = await import("@/app/api/btf/ingreso/route");
  const yo = await import("@/app/api/btf/yo/route");
  const mp = await import("@/app/api/btf/yo/mp/route");
  const albumes = await import("@/app/api/btf/albumes/route");
  const album = await import("@/app/api/btf/albumes/[id]/route");
  const medios = await import("@/app/api/btf/albumes/[id]/medios/route");
  const confirmar = await import("@/app/api/btf/medios/[id]/confirmar/route");
  const medio = await import("@/app/api/btf/medios/[id]/route");
  const original = await import("@/app/api/btf/medios/[id]/original/route");
  const publico = await import("@/app/api/btf/a/[slug]/route");
  const cotizar = await import("@/app/api/btf/a/[slug]/cotizar/route");
  const perfil = await import("@/app/api/btf/fotografos/[usuario]/route");

  assert.deepEqual(await (await estado.GET()).json(), { configurado: true, mp: true });

  // Alta: código malo → 403; bueno → 201 con cookie
  const datos = { nombre: "Estudio Lente", email: "Lente@Example.com", contrasena: "una-clave-larga" };
  assert.equal((await alta.POST(pedir("/ingreso/alta", { cuerpo: { ...datos, codigo: "otro" } }))).status, 403);
  const rAlta = await alta.POST(pedir("/ingreso/alta", { cuerpo: { ...datos, codigo: "codigo-alta-qa" } }));
  assert.equal(rAlta.status, 201);
  const cookie = cookieDe(rAlta);
  assert.match(rAlta.headers.get("set-cookie")!, /HttpOnly; SameSite=Lax/);
  const f = await rAlta.json();
  assert.equal(f.email, "lente@example.com");
  assert.equal(f.usuario, "estudio-lente");
  assert.equal("contrasena" in f, false);
  assert.equal((await alta.POST(pedir("/ingreso/alta", { cuerpo: { ...datos, codigo: "codigo-alta-qa" } }))).status, 409);

  // Ingreso: clave mala → 401; buena → cookie
  assert.equal((await ingreso.POST(pedir("/ingreso", { cuerpo: { email: datos.email, contrasena: "mala-mala" } }))).status, 401);
  assert.equal((await ingreso.POST(pedir("/ingreso", { cuerpo: { email: datos.email, contrasena: datos.contrasena } }))).status, 200);
  assert.equal((await yo.GET(pedir("/yo"))).status, 401);

  // Token de MP: se guarda cifrado y nunca vuelve
  assert.equal((await mp.PUT(pedir("/yo/mp", { method: "PUT", cuerpo: { accessToken: TOKEN_MP }, cookie }))).status, 200);
  const rYo = await yo.GET(pedir("/yo", { cookie }));
  const textoYo = await rYo.text();
  assert.equal(JSON.parse(textoYo).mpConfigurado, true);
  assert.ok(!textoYo.includes(TOKEN_MP));
  const duenio = await prismaComoDuenio(base);
  const fila = await duenio.btfFotografo.findUniqueOrThrow({ where: { id: f.id } });
  assert.ok(!JSON.stringify(fila.mpCredencial).includes(TOKEN_MP), "el token quedó en claro en la base");

  // Álbum: sin consentimiento → 422
  assert.equal((await albumes.POST(pedir("/albumes", { cuerpo: ALBUM, cookie }))).status, 422);
  const rAlbum = await albumes.POST(pedir("/albumes", { cuerpo: { ...ALBUM, consentimiento: true }, cookie }));
  assert.equal(rAlbum.status, 201);
  const a = await rAlbum.json();
  assert.equal(a.slug, "10k-de-la-costanera");

  // Tres medios: uno visible, uno oculto, uno sin confirmar
  const ids: string[] = [];
  for (const nombreArchivo of ["visible.jpg", "oculto.jpg", "pendiente.jpg"]) {
    const r = await medios.POST(pedir(`/albumes/${a.id}/medios`, { cuerpo: { ...MEDIO, nombreArchivo }, cookie }), ctx({ id: a.id }));
    assert.equal(r.status, 201);
    const { medio: m, subir } = await r.json();
    assert.match(subir.original, /^https:\/\/cuenta\.r2\.example\/btf-originales\/o\//);
    assert.match(subir.previa, /\/btf-previas\/p\//);
    assert.equal(m.subido, false);
    ids.push(m.id);
  }
  const [visible, oculto, pendiente] = ids;
  for (const id of [visible, oculto]) assert.equal((await confirmar.POST(pedir(`/medios/${id}/confirmar`, { method: "POST", cookie }), ctx({ id }))).status, 200);
  const rOcultar = await medio.PATCH(pedir(`/medios/${oculto}`, { method: "PATCH", cuerpo: { oculto: true }, cookie }), ctx({ id: oculto }));
  assert.equal((await rOcultar.json()).oculto, true);

  // El dueño ve los tres
  assert.equal((await (await medios.GET(pedir(`/albumes/${a.id}/medios`, { cookie }), ctx({ id: a.id }))).json()).length, 3);

  // Público
  const rPub = await publico.GET(pedir(`/a/${a.slug}`), ctx({ slug: a.slug }));
  assert.equal(rPub.status, 200);
  const textoPub = await rPub.text();
  const pub = JSON.parse(textoPub);
  assert.deepEqual(pub.medios.map((m: { id: string }) => m.id), [visible]);
  assert.ok(!ids.slice(1).some((id) => textoPub.includes(id)), "se coló un medio oculto o no subido");
  for (const prohibido of ["claveOriginal", "mimeOriginal", "/o/", "btf-originales", "cupones", "AMIGOS", "ana@privado.example", "lente@example.com"]) {
    assert.ok(!textoPub.includes(prohibido), `lo público trae «${prohibido}»`);
  }
  assert.equal(pub.medios[0].previaUrl, `https://previas.example/p/${a.id}/${visible}.webp`);
  assert.deepEqual(pub.album.colaboradores, [{ nombre: "Ana", rol: "asistente" }]);

  // Perfil público: sin email ni cobro
  const textoPerfil = await (await perfil.GET(pedir("/fotografos/estudio-lente"), ctx({ usuario: "estudio-lente" }))).text();
  assert.ok(!textoPerfil.includes("lente@example.com") && !textoPerfil.includes("cobro"));

  // Cotizar en el servidor (cupón validado acá), y un medio oculto no entra al carrito
  const cot = await (await cotizar.POST(pedir(`/a/${a.slug}/cotizar`, { cuerpo: { items: [visible], cupon: "amigos" } }), ctx({ slug: a.slug }))).json();
  assert.equal(cot.total, 1200);
  const rOculto = await cotizar.POST(pedir(`/a/${a.slug}/cotizar`, { cuerpo: { items: [oculto], cupon: null } }), ctx({ slug: a.slug }));
  assert.equal(rOculto.status, 422);

  // Otro fotógrafo no toca nada ajeno
  const rOtro = await alta.POST(pedir("/ingreso/alta", { cuerpo: { nombre: "Otro", email: "otro@example.com", contrasena: "otra-clave-larga", codigo: "codigo-alta-qa" } }));
  const cookieOtro = cookieDe(rOtro);
  assert.equal((await album.GET(pedir(`/albumes/${a.id}`, { cookie: cookieOtro }), ctx({ id: a.id }))).status, 403);
  assert.equal((await original.GET(pedir(`/medios/${visible}/original`, { cookie: cookieOtro }), ctx({ id: visible }))).status, 403);
  assert.equal((await medio.DELETE(pedir(`/medios/${visible}`, { method: "DELETE", cookie: cookieOtro }), ctx({ id: visible }))).status, 403);
  assert.equal((await (await albumes.GET(pedir("/albumes", { cookie: cookieOtro }))).json()).length, 0);

  // El dueño sí: 302 al GET prefirmado del original
  const rOrig = await original.GET(pedir(`/medios/${visible}/original`, { cookie }), ctx({ id: visible }));
  assert.equal(rOrig.status, 302);
  assert.match(rOrig.headers.get("location")!, /\/btf-originales\/o\/.*X-Amz-Signature=/);
  void pendiente;
});
