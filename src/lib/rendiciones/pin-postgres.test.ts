// EL PIN DE INGRESO contra una base migrada de verdad (Postgres del arnés o PGlite: `node scripts/qa/p1-pglite.mjs <este>`).
//
// Se ejecutan `pedirPin` y `confirmarPin` reales dentro de un pedido del negocio. El mail se captura en vez de salir.
// Con PGlite la concurrencia es secuencial: se prueba el RESULTADO del doble envío (entra uno), no la carrera.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";

test("PIN: un solo uso, vence, bloquea al quinto aunque pida otro, sin enumeración y atado al negocio", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  prepararAccionesDeServidor();
  apuntarLaAppA(base);
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  for (const n of [a, b]) await duenio.tenant.update({ where: { id: n.id }, data: { blueprintId: "productora" } });

  let serie = 0;
  const persona = async (n: NegocioDePrueba, rol = "COMERCIAL") => {
    serie++;
    const u = await duenio.user.create({ data: { tenantId: n.id, name: `Equipo ${serie}`, email: `equipo${serie}@${n.slug}.test`, passwordHash: "x", role: "RECEPTION" } });
    await duenio.proyectoPersona.create({ data: { tenantId: n.id, userId: u.id, nombre: u.name, rol } });
    return { id: u.id, tenantId: n.id, email: u.email, role: u.role as string };
  };

  const { pedirPin, confirmarPin, exigePin } = await import("./pin.server");
  const { MENSAJE_FALLO, MENSAJE_PEDIDO, VIGENCIA_PIN_MS } = await import("./pin-core");
  const en = async <R>(n: NegocioDePrueba, f: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: n }, f);
    assert.equal(r.tipo, "respuesta");
    return (r as { valor: R }).valor;
  };
  const mails: { para: string; cuerpo: string }[] = [];
  const enviar = (m: { para: string; cuerpo: string }) => mails.push(m);
  const pedir = async (n: NegocioDePrueba, u: Awaited<ReturnType<typeof persona>> | null, ahoraMs: number) => {
    const antes = mails.length;
    const { mensaje } = await en(n, () => pedirPin(n.id, u, { ahoraMs, enviar }));
    assert.equal(mensaje, MENSAJE_PEDIDO);
    return mails.length > antes ? mails.at(-1)!.cuerpo.match(/\d{6}/)![0] : null;
  };
  const confirmar = (n: NegocioDePrueba, u: Awaited<ReturnType<typeof persona>> | null, codigo: string, ahoraMs: number) =>
    en(n, () => confirmarPin(n.id, u, codigo, { ahoraMs }));
  const otro = (c: string) => String((Number(c) + 1) % 1_000_000).padStart(6, "0");
  const T0 = Date.now();

  // Roles: Comercial y Producción con PIN; Dirección sigue con su app.
  const comercial = await persona(a);
  assert.ok(await en(a, () => exigePin(comercial)));
  const direccion = { id: a.duenia.id, tenantId: a.id, email: a.duenia.email, role: "OWNER" };
  assert.ok(!(await en(a, () => exigePin(direccion))), "Dirección no baja a PIN: sigue con su app");
  assert.equal(await pedir(a, direccion, T0), null, "ni recibe un PIN aunque lo pida");

  // Hash ≠ código y un solo uso.
  const c1 = (await pedir(a, comercial, T0))!;
  assert.ok(c1, "salió un mail con el código");
  const guardado = await duenio.proyectoPinIngreso.findFirstOrThrow({ where: { tenantId: a.id, userId: comercial.id } });
  assert.notEqual(guardado.hash, c1);
  assert.ok(!guardado.hash.includes(c1));
  assert.deepEqual(await confirmar(a, comercial, c1, T0 + 1000), { ok: true });
  assert.deepEqual(await confirmar(a, comercial, c1, T0 + 2000), { ok: false, error: MENSAJE_FALLO }, "un solo uso");

  // Doble envío simultáneo: entra uno solo.
  const doble = await persona(a, "PRODUCCION");
  const c2 = (await pedir(a, doble, T0))!;
  const ambos = await Promise.all([confirmar(a, doble, c2, T0 + 1000), confirmar(a, doble, c2, T0 + 1000)]);
  assert.equal(ambos.filter((r) => r.ok).length, 1, "un código, una sesión");

  // Vence a los 5 minutos.
  const tarde = await persona(a);
  const c3 = (await pedir(a, tarde, T0))!;
  assert.equal((await confirmar(a, tarde, c3, T0 + VIGENCIA_PIN_MS + 1)).ok, false, "vencido no entra");

  // Bloqueo: cuatro fallos, pide otro código (no reinicia), quinto fallo → bloqueado; el código bueno ya no sirve.
  const insistente = await persona(a);
  const c4 = (await pedir(a, insistente, T0))!;
  for (let i = 0; i < 4; i++) assert.equal((await confirmar(a, insistente, otro(c4), T0 + 1000 + i)).ok, false);
  const c5 = (await pedir(a, insistente, T0 + 61_000))!;
  assert.ok(c5, "pedir otro código antes del bloqueo funciona");
  assert.equal((await duenio.proyectoPinIngreso.findFirstOrThrow({ where: { tenantId: a.id, userId: insistente.id } })).intentosVentana, 4, "pedir otro no reinicia la ventana");
  assert.equal((await confirmar(a, insistente, otro(c5), T0 + 62_000)).ok, false);
  assert.equal((await confirmar(a, insistente, c5, T0 + 63_000)).ok, false, "bloqueado: ni el código bueno entra");
  assert.equal(await pedir(a, insistente, T0 + 200_000), null, "bloqueado: no se mandan códigos nuevos");
  const bloqueada = await duenio.proyectoPinIngreso.findFirstOrThrow({ where: { tenantId: a.id, userId: insistente.id } });
  assert.ok(bloqueada.bloqueadoHasta && bloqueada.bloqueadoHasta.getTime() > T0 + 200_000, "el pedido no levantó el bloqueo");

  // Usuario inexistente: la misma respuesta, sin mail ni fila.
  const filasAntes = await duenio.proyectoPinIngreso.count();
  assert.equal(await pedir(a, null, T0), null);
  assert.deepEqual(await confirmar(a, null, "123456", T0), { ok: false, error: MENSAJE_FALLO });
  assert.equal(await duenio.proyectoPinIngreso.count(), filasAntes);

  // El código de A no abre en B: ni con el usuario de A pedido desde B, ni para la misma persona en otro negocio.
  const enA = await persona(a);
  const enB = await persona(b);
  const c6 = (await pedir(a, enA, T0))!;
  assert.equal((await confirmar(b, enA, c6, T0 + 1000)).ok, false, "el pase de A no sirve en el host de B");
  await pedir(b, enB, T0);
  assert.equal((await confirmar(b, enB, c6, T0 + 1000)).ok, false, "el código de A no abre la cuenta de B");
  assert.deepEqual(await confirmar(a, enA, c6, T0 + 2000), { ok: true }, "en A sigue sirviendo");
});
