// Plata de buscatufoto contra un Postgres real (base efímera): los ataques de la certificación, en verde.
//  1. Cupón de 1 uso, 5 pedidos en paralelo → 1 pedido con cupón, 4 rechazados (422 cupon), usos = 1.
//  2. Cupón de 1 uso, pedidos secuenciales → el 2.º ya se rechaza al crear; marcar pagado no suma usos.
//  3. MP no arma la preferencia → el pedido se descarta y el cupón se libera; host ajeno → 400 sin reservar.
//  4. Webhook sin `?pedido=` válido → 200 y ninguna llamada a MP.
//  5. Descarga con clave corta, sin clave o con un carácter de más → 404.
//  6. `origenDe` sólo acepta hosts de buscatufoto o localhost.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const HOST = "https://buscatufoto.gsgapp.com.ar";

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

const pedir = (ruta: string, init: { method?: string; cuerpo?: unknown; cookie?: string; host?: string } = {}) =>
  new Request(`${HOST}/api/btf${ruta}`, {
    method: init.method ?? (init.cuerpo ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...(init.host ? { "x-forwarded-host": init.host } : {}),
    },
    body: init.cuerpo ? JSON.stringify(init.cuerpo) : undefined,
  });
const ctx = <T>(p: T) => ({ params: Promise.resolve(p) });
const cookieDe = (r: Response) => (r.headers.get("set-cookie") ?? "").split(";")[0];

test("cupón reservado al crear, webhook anónimo inerte, descarga y host", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const real = globalThis.fetch;
  let llamadasMp = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("https://cuenta.r2.example/")) return new Response(null, { status: init?.method === "HEAD" ? 200 : 204 });
    if (u.startsWith("https://api.mercadopago.com/")) {
      llamadasMp++;
      return new Response("{}", { status: u.includes("/checkout/preferences") ? 500 : 404 });
    }
    throw new Error("fetch inesperado " + u);
  }) as typeof fetch;
  t.after(() => (globalThis.fetch = real));

  const alta = await import("@/app/api/btf/ingreso/alta/route");
  const albumes = await import("@/app/api/btf/albumes/route");
  const medios = await import("@/app/api/btf/albumes/[id]/medios/route");
  const confirmar = await import("@/app/api/btf/medios/[id]/confirmar/route");
  const crear = await import("@/app/api/btf/a/[slug]/pedidos/route");
  const marcar = await import("@/app/api/btf/pedidos/[id]/marcar-pagado/route");
  const descarga = await import("@/app/api/btf/descarga/route");
  const webhook = await import("@/app/api/btf/mp/webhook/route");
  const yoMp = await import("@/app/api/btf/yo/mp/route");
  const { origenDe } = await import("@/lib/btf/pagos");
  const duenio = await prismaComoDuenio(base);

  const rA = await alta.POST(pedir("/ingreso/alta", { cuerpo: { nombre: "A", email: "a@x.com", contrasena: "clave-larga-1", codigo: "codigo-alta-qa" } }));
  const cookie = cookieDe(rA);
  const ALB = {
    nombre: "Alb", evento: "otro", lugar: "", fecha: "2026-11-01", descripcion: "", precioFoto: 1000, precioVideo: 0, paquetes: [], escalones: [],
    cupones: [
      { codigo: "GRATIS", tipo: "porcentaje", valor: 100, tope: 0, usosMax: 1, usos: 0, activo: true },
      { codigo: "MITAD", tipo: "porcentaje", valor: 50, tope: 0, usosMax: 1, usos: 0, activo: true },
      { codigo: "MP1", tipo: "porcentaje", valor: 10, tope: 0, usosMax: 1, usos: 0, activo: true },
    ],
    colaboradores: [], publicado: true, consentimiento: true,
  };
  const a = await (await albumes.POST(pedir("/albumes", { cuerpo: ALB, cookie }))).json();
  const rM = await medios.POST(
    pedir(`/albumes/${a.id}/medios`, { cuerpo: { tipo: "foto", ancho: 1, alto: 1, duracion: null, peso: 1, dorsales: [], mimeOriginal: "image/jpeg", mimePrevia: "image/webp", nombreArchivo: "x.jpg" }, cookie }),
    ctx({ id: a.id }),
  );
  const { medio } = await rM.json();
  await confirmar.POST(pedir(`/medios/${medio.id}/confirmar`, { method: "POST", cookie }), ctx({ id: medio.id }));
  const crearP = (cupon: string, total: number, metodo = "transferencia", host?: string) =>
    crear.POST(pedir(`/a/${a.slug}/pedidos`, { host, cuerpo: { items: [medio.id], comprador: { nombre: "J", email: "j@x.com" }, cupon, metodo, totalEsperado: total } }), ctx({ slug: a.slug }));
  const usos = async (codigo: string) =>
    ((await duenio.btfAlbum.findUniqueOrThrow({ where: { id: a.id } })).cupones as { codigo: string; usos: number }[]).find((c) => c.codigo === codigo)!.usos;
  const bajar = (q: Record<string, string>) => descarga.GET(pedir(`/descarga?${new URLSearchParams(q)}`));

  // 1) Cupón 100 % de un solo uso, 5 pedidos en paralelo → uno solo pasa
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => crearP("GRATIS", 0)));
  const ok = rs.filter((r) => r.status === 201);
  const rechazados = rs.filter((r) => r.status === 422);
  assert.equal(ok.length, 1, "más de un pedido con el cupón de 1 uso");
  assert.equal(rechazados.length, 4);
  for (const r of rechazados) assert.equal((await r.json()).error, "cupon");
  const { pedido: gratis } = await ok[0].json();
  assert.equal(gratis.estado, "pagado");
  assert.equal(await usos("GRATIS"), 1);
  assert.equal((await bajar({ pedido: gratis.id, clave: gratis.clave, medio: medio.id })).status, 302);

  // 2) Cupón 50 % de un solo uso, secuencial: el 2.º y 3.º se rechazan al crear; marcar pagado no suma
  const r1 = await crearP("MITAD", 500);
  assert.equal(r1.status, 201);
  for (let i = 0; i < 2; i++) assert.equal((await (await crearP("MITAD", 500)).json()).error, "cupon");
  const { pedido: mitad } = await r1.json();
  assert.equal(await usos("MITAD"), 1);
  for (let i = 0; i < 2; i++) await marcar.POST(pedir(`/pedidos/${mitad.id}/marcar-pagado`, { method: "POST", cookie }), ctx({ id: mitad.id }));
  assert.equal((await duenio.btfPedido.findUniqueOrThrow({ where: { id: mitad.id } })).estado, "pagado");
  assert.equal(await usos("MITAD"), 1);

  // 3) MP: preferencia rechazada → pedido descartado y cupón liberado; host ajeno → 400 sin reservar
  await yoMp.PUT(pedir("/yo/mp", { method: "PUT", cuerpo: { accessToken: "APP_USR-1234567890-abc" }, cookie }));
  const pedidosAntes = await duenio.btfPedido.count();
  const rPref = await crearP("MP1", 900, "mercadopago", "buscatufoto.gsgapp.com.ar");
  assert.equal(rPref.status, 503);
  assert.equal(await usos("MP1"), 0, "el cupón no se liberó al descartar el pedido");
  assert.equal(await duenio.btfPedido.count(), pedidosAntes);
  const rHost = await crearP("MP1", 900, "mercadopago", "evil.example");
  assert.equal(rHost.status, 400);
  assert.match((await rHost.json()).mensaje, /dirección de buscatufoto/);
  assert.equal(await usos("MP1"), 0);
  assert.equal(await duenio.btfPedido.count(), pedidosAntes);

  // 4) Webhook anónimo (sin pedido o con pedido inválido): 200 y ninguna llamada a MP
  for (const q of ["", "?pedido=../x"]) {
    llamadasMp = 0;
    const r = await webhook.POST(new Request(`${HOST}/api/btf/mp/webhook${q}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "payment", data: { id: "123" } }) }));
    assert.equal(r.status, 200);
    assert.equal(llamadasMp, 0, `webhook ${q || "sin pedido"} llamó a MP`);
  }

  // 5) Descarga: clave corta, sin clave, clave con un carácter de más → 404
  for (const q of [
    { pedido: gratis.id, clave: gratis.clave.slice(0, 10), medio: medio.id },
    { pedido: gratis.id, medio: medio.id },
    { pedido: gratis.id, clave: gratis.clave + "a", medio: medio.id },
  ] as Record<string, string>[]) {
    assert.equal((await bajar(q)).status, 404, JSON.stringify(Object.keys(q)));
  }

  // 6) origenDe: sólo buscatufoto o localhost
  const origen = (h: string) => origenDe(new Request(HOST, { headers: { "x-forwarded-host": h } }));
  for (const h of ["evil.example", "evil.example, buscatufoto.gsgapp.com.ar", "a@b", "x/y"]) {
    assert.throws(() => origen(h), /dirección de buscatufoto/, h);
  }
  assert.equal(origen("buscatufoto.gsgapp.com.ar"), "https://buscatufoto.gsgapp.com.ar");
  assert.equal(origen("buscatufoto-erp.vercel.app"), "https://buscatufoto-erp.vercel.app");
  assert.equal(origen("localhost:3000"), "https://localhost:3000");
  assert.equal(origen("buscatufoto.localhost:3000"), "https://buscatufoto.localhost:3000");
});
