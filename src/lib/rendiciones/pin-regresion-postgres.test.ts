// REGRESIÓN de la certificación T4 del PIN (cert-t4, vuelta 1) contra una base migrada de verdad (arnés o PGlite).
// A: fallos en paralelo + el bueno · B: ventana deslizante en el borde · C: primer pedido doble · D: reingreso enseguida ·
// E: espacios y guiones · F: código generado por Dirección para pasar por WhatsApp · G: base sin la tabla del PIN.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";

test("PIN: regresión de la certificación T4 y código para pasar por WhatsApp", async (t) => {
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
    const u = await duenio.user.create({ data: { tenantId: n.id, name: `Reg ${serie}`, email: `reg${serie}@${n.slug}.test`, passwordHash: "x", role: "RECEPTION" } });
    const p = await duenio.proyectoPersona.create({ data: { tenantId: n.id, userId: u.id, nombre: u.name, rol } });
    return { id: u.id, tenantId: n.id, email: u.email, role: u.role as string, personaId: p.id };
  };
  type Persona = Awaited<ReturnType<typeof persona>>;
  const { pedirPin, confirmarPin, exigePin, generarPinParaPasar } = await import("./pin.server");
  const { MENSAJE_RECIEN } = await import("./pin-core");
  const en = async <R>(n: NegocioDePrueba, f: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: n }, f);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r).slice(0, 300));
    return (r as { valor: R }).valor;
  };
  const mails: { cuerpo: string }[] = [];
  const enviar = (m: { cuerpo: string }) => mails.push(m);
  const pedir = async (u: Persona, ahoraMs: number, n = a) => {
    const antes = mails.length;
    await en(n, () => pedirPin(n.id, u, { ahoraMs, enviar }));
    return mails.length > antes ? mails.at(-1)!.cuerpo.match(/\d{6}/)![0] : null;
  };
  const confirmar = (u: Persona, c: string, ahoraMs: number, n = a) => en(n, () => confirmarPin(n.id, u, c, { ahoraMs }));
  const otro = (c: string, k = 1) => String((Number(c) + k) % 1_000_000).padStart(6, "0");
  const T0 = Date.now();
  const fila = (u: Persona) => duenio.proyectoPinIngreso.findFirstOrThrow({ where: { tenantId: u.tenantId, userId: u.id } });

  // A. 12 fallos en paralelo: ninguno se pierde y queda bloqueado; el código bueno, después, ya no abre.
  // (El bueno no va en la misma tanda: los intentos se turnan en la fila del PIN en un orden que nadie
  // promete, y si le tocaba antes del bloqueo entraba con todo derecho; el test fallaba según la carga.)
  const p = await persona(a);
  const c = (await pedir(p, T0))!;
  const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => confirmar(p, otro(c, i + 1), T0 + 1000)));
  assert.equal(rs.filter((r) => r.ok).length, 0);
  assert.ok((await fila(p)).bloqueadoHasta);
  assert.equal((await confirmar(p, c, T0 + 1000)).ok, false, "bloqueado: el bueno no abre");

  // B. Ventana deslizante: 1 fallo en T0, 3 en T0+14:59, 4 en T0+15:00 → bloquea, y el código bueno ya no abre.
  const q = await persona(a);
  let k = (await pedir(q, T0))!;
  await confirmar(q, otro(k), T0 + 1);
  k = (await pedir(q, T0 + 14 * 60_000 + 30_000))!;
  for (let i = 0; i < 3; i++) await confirmar(q, otro(k, i + 1), T0 + 15 * 60_000 - 100 + i);
  for (let i = 0; i < 4; i++) await confirmar(q, otro(k, i + 10), T0 + 15 * 60_000 + 10 + i);
  const bq = await fila(q);
  assert.ok(bq.bloqueadoHasta && bq.bloqueadoHasta.getTime() > T0 + 15 * 60_000 + 500, "bloqueada en el borde");
  assert.equal((await confirmar(q, k, T0 + 15 * 60_000 + 500)).ok, false, "el bueno no abre");

  // C. Primer pedido doble simultáneo: no rompe y sale un solo mail.
  const r = await persona(a);
  const antes = mails.length;
  const dos = await Promise.allSettled([en(a, () => pedirPin(a.id, r, { ahoraMs: T0, enviar })), en(a, () => pedirPin(a.id, r, { ahoraMs: T0, enviar }))]);
  assert.deepEqual(dos.map((d) => d.status), ["fulfilled", "fulfilled"]);
  assert.equal(mails.length - antes, 1);

  // D. Entró y vuelve a ingresar a los 30 s: sale otro código y el aviso es «hace instantes».
  const s = await persona(a);
  const cs = (await pedir(s, T0))!;
  assert.ok((await confirmar(s, cs, T0 + 1000)).ok);
  const { mensaje } = await en(a, () => pedirPin(a.id, s, { ahoraMs: T0 + 30_000, enviar }));
  assert.equal(mensaje, MENSAJE_RECIEN);
  assert.notEqual(mails.at(-1)!.cuerpo.match(/\d{6}/)![0], cs, "el código usado no traba el reingreso");

  // E. Con espacios y guiones entra.
  const e = await persona(a);
  const ce = (await pedir(e, T0))!;
  assert.ok((await confirmar(e, `${ce.slice(0, 3)} - ${ce.slice(3)}`, T0 + 1000)).ok);

  // F. Código para pasar por WhatsApp.
  const dirA = { tenantId: a.id, userId: a.duenia.id, rol: "DIRECCION", nombre: "Dirección A" };
  const destino = await persona(a, "PRODUCCION");
  const comercial = await persona(a, "COMERCIAL");
  const noGenera = await en(a, () => generarPinParaPasar({ tenantId: a.id, userId: comercial.id, rol: "COMERCIAL", nombre: "Comercial" }, destino.personaId, { ahoraMs: T0 }));
  assert.equal(noGenera.ok, false, "Comercial no puede generar");
  const dirB = await persona(b, "DIRECCION");
  const cruzado = await en(b, () => generarPinParaPasar({ tenantId: b.id, userId: dirB.id, rol: "DIRECCION", nombre: "Dirección B" }, destino.personaId, { ahoraMs: T0 }));
  assert.equal(cruzado.ok, false, "Dirección de B no genera para alguien de A");
  assert.equal(await duenio.proyectoPinIngreso.count({ where: { tenantId: a.id, userId: destino.id } }), 0);

  const gen = await en(a, () => generarPinParaPasar(dirA, destino.personaId, { ahoraMs: T0 }));
  assert.ok(gen.ok);
  assert.match(gen.enlace, /^https:\/\/wa\.me\/\?text=/);
  const guardado = await fila(destino);
  assert.ok(!guardado.hash.includes(gen.codigo), "sólo queda el hash");
  const otraVez = await en(a, () => generarPinParaPasar({ ...dirA, rol: "ADMINISTRACION" }, destino.personaId, { ahoraMs: T0 + 10_000 }));
  assert.equal(otraVez.ok, false, "mismo límite: un código por minuto");
  const bitacora = await duenio.proyectoCambio.findMany({ where: { tenantId: a.id, entidadId: destino.personaId } });
  assert.ok(bitacora.some((x) => x.autor === "Dirección A" && /código de ingreso/.test(x.campo)), "queda quién lo generó");
  assert.ok((await confirmar(destino, gen.codigo, T0 + 20_000)).ok, "el código generado abre una vez");
  assert.equal((await confirmar(destino, gen.codigo, T0 + 21_000)).ok, false);

  // G. Sin la tabla (migración sin aplicar): no se exige PIN y el ingreso sigue como hoy.
  await duenio.$executeRawUnsafe(`ALTER TABLE "ProyectoPinIngreso" RENAME TO "ProyectoPinIngresoAparte"`);
  try {
    assert.equal(await en(a, () => exigePin(destino)), false);
  } finally {
    await duenio.$executeRawUnsafe(`ALTER TABLE "ProyectoPinIngresoAparte" RENAME TO "ProyectoPinIngreso"`);
  }
  assert.equal(await en(a, () => exigePin(destino)), true);
});
