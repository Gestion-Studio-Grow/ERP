// El buscador «/» (buscarClientasYTurnos) CONTRA POSTGRES, con el rol de la app (app_rls, sin
// BYPASSRLS), RLS encendido y la Server Action REAL con la sesión de un usuario real
// (reingeniería CH, Tanda 2):
//   · CH-063 · «5566» de una clienta de OTRO negocio no aparece (ni la clienta ni sus turnos);
//   · CH-028 · Laura sale con su próximo turno, «Debe $9.000», sus faltazos y sus teclas;
//   · una PROFESIONAL ve sólo SUS turnos que vienen, sin clientas ni plata;
//   · sin sesión, al login; la entrada se valida antes de leer.
// Base: una efímera propia (src/test/base-efimera.ts); sin Postgres local se saltea (en CI falla).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const H = 3_600_000;

test("contra Postgres (app_rls + RLS): el buscador «/» sólo encuentra lo del negocio y lo que el rol deja ver", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  const ahora = Date.now();

  const negocio = async (tenantId: string) => {
    const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
    const piernas = await duenio.service.create({ data: { tenantId, name: "Piernas completas", durationMin: 30, price: 14000, depositAmount: 5000 } });
    const caro = await duenio.professional.create({ data: { tenantId, name: "Caro", boxId: box.id, services: { connect: [{ id: piernas.id }] } } });
    const vero = await duenio.professional.create({
      data: { tenantId, name: "Vero", boxId: box.id, cobraEnMostrador: false, services: { connect: [{ id: piernas.id }] } },
    });
    const turno = async (clientId: string, professionalId: string, enHoras: number, status: "PENDING" | "CONFIRMED" | "COMPLETED" | "NO_SHOW", precio = 14000) => {
      const startsAt = new Date(ahora + enHoras * H);
      return (
        await duenio.appointment.create({
          data: { tenantId, clientId, professionalId, serviceId: piernas.id, boxId: box.id, startsAt, endsAt: new Date(startsAt.getTime() + H / 2), status, priceAtBooking: precio },
        })
      ).id;
    };
    return { caro, vero, turno };
  };

  const A = await negocio(base.a.id);
  const B = await negocio(base.b.id);
  const laura = await duenio.client.create({ data: { tenantId: base.a.id, name: "Laura Gómez", phone: "11 5566-7788" } });
  const marta = await duenio.client.create({ data: { tenantId: base.a.id, name: "Marta Ríos", phone: "11 5566-1234" } });
  const otra = await duenio.client.create({ data: { tenantId: base.b.id, name: "Zulema Secreta", phone: "11 5566-9999" } });
  const proximoLaura = await A.turno(laura.id, A.caro.id, 50, "PENDING");
  await A.turno(laura.id, A.caro.id, -40 * 24, "COMPLETED", 9000); // debe $9.000 (sin cobros)
  await A.turno(laura.id, A.caro.id, -20 * 24, "NO_SHOW");
  const proximoMarta = await A.turno(marta.id, A.vero.id, 26, "CONFIRMED");
  const proximoOtra = await B.turno(otra.id, B.caro.id, 30, "PENDING");

  // Una profesional de A, vinculada a Vero (escrita como dueño de la base, no por la app).
  const profesional = await duenio.user.create({
    data: {
      tenantId: base.a.id,
      name: "Vero",
      email: "vero@negocio-a.erp.test",
      passwordHash: (await duenio.user.findUniqueOrThrow({ where: { id: base.a.duenia.id }, select: { passwordHash: true } })).passwordHash,
      role: "PROFESSIONAL",
      professionalId: A.vero.id,
    },
  });

  const { buscarClientasYTurnos } = await import("./buscar-actions");
  type R = Awaited<ReturnType<typeof buscarClientasYTurnos>>;
  const buscar = async (negocio: { host: string }, usuario: { id: string } | null, q: unknown): Promise<Extract<R, { ok: true }>> => {
    const s = await ejecutarAccion({ negocio, usuario }, () => buscarClientasYTurnos(q));
    assert.equal(s.tipo, "respuesta", `«${String(q)}» tenía que responder: ${JSON.stringify(s)}`);
    const v = (s as { valor: R }).valor;
    assert.equal(v.ok, true, JSON.stringify(v));
    return v as Extract<R, { ok: true }>;
  };
  const ids = (r: Extract<R, { ok: true }>, grupo: string) => (r.grupos.find((g) => g.grupo === grupo)?.items.map((i) => i.id) ?? []).sort();

  // ── CH-063 · aislamiento: «5566» en A trae sólo las de A; en B, sólo la de B ──
  const enA = await buscar(base.a, base.a.recepcion, "5566");
  assert.deepEqual(ids(enA, "clientas"), [`clienta-${laura.id}`, `clienta-${marta.id}`].sort());
  assert.deepEqual(ids(enA, "turnos"), [`turno-${proximoLaura}`, `turno-${proximoMarta}`].sort());
  assert.doesNotMatch(JSON.stringify(enA), new RegExp(`Zulema|9999|${otra.id}|${proximoOtra}`));
  const enB = await buscar(base.b, base.b.recepcion, "5566");
  assert.deepEqual(ids(enB, "clientas"), [`clienta-${otra.id}`]);
  assert.deepEqual(ids(enB, "turnos"), [`turno-${proximoOtra}`]);
  // Lo que sólo existe en B responde en A igual que algo que no existe.
  for (const q of ["Zulema", "9999", "1155669999"]) assert.deepEqual(await buscar(base.a, base.a.duenia, q), { ok: true, grupos: [] }, q);

  // ── CH-028 · Laura con lo que hay que saber y sus teclas ──
  const deLaura = (await buscar(base.a, base.a.recepcion, "laura")).grupos[0].items[0];
  assert.equal(deLaura.nombre, "Laura Gómez");
  const resumen = deLaura.resumen?.join(" · ") ?? "";
  assert.match(resumen, /Próximo turno: .* Piernas completas con Caro/);
  assert.match(resumen, /Seña de \$5\.000 sin cobrar/);
  assert.match(resumen, /Debe \$9\.000/);
  assert.match(resumen, /1 faltazo/);
  assert.deepEqual(deLaura.teclas?.map((x) => x.id), ["dar-turno", "whatsapp", "cobrar-deuda", "ver-ficha"]);
  assert.equal(deLaura.teclas?.[0].href, `/admin/turnos/lista?nuevo=1&cliente=${laura.id}`);
  assert.ok(deLaura.huecos?.some((h) => h.tipo === "llego-la-senia" && h.turnoId === proximoLaura && h.monto === 5000));

  // El turno de Marta es de Vero (cobra aparte): la recepción no recibe hueco de plata para él.
  const deMarta = (await buscar(base.a, base.a.recepcion, "marta")).grupos.find((g) => g.grupo === "turnos")?.items[0];
  assert.equal(deMarta?.huecos, undefined);

  // ── Una profesional: sólo SUS turnos que vienen, sin clientas, teléfonos ni plata ──
  const deVero = await buscar(base.a, profesional, "5566");
  assert.deepEqual(deVero.grupos.map((g) => g.grupo), ["turnos"]);
  assert.deepEqual(ids(deVero, "turnos"), [`turno-${proximoMarta}`], "el de Laura es de Caro: no lo ve");
  assert.doesNotMatch(JSON.stringify(deVero), /wa\.me|\/admin\/clientes\/|Debe/);
  assert.deepEqual(await buscar(base.a, profesional, "laura"), { ok: true, grupos: [] });

  // ── Sesión y entrada ──
  const sinSesion = await ejecutarAccion({ negocio: base.a }, () => buscarClientasYTurnos("laura"));
  assert.equal(sinSesion.tipo, "redireccion");
  const cruzada = await ejecutarAccion({ negocio: base.b, usuario: base.a.duenia }, () => buscarClientasYTurnos("laura"));
  assert.equal(cruzada.tipo, "redireccion", "la cookie de A no abre B");
  const corta = await ejecutarAccion({ negocio: base.a, usuario: base.a.recepcion }, () => buscarClientasYTurnos("l"));
  assert.equal(corta.tipo === "respuesta" && corta.valor.ok, false);
  assert.deepEqual(await buscar(base.a, base.a.duenia, "%%"), { ok: true, grupos: [] }, "un comodín se busca como letra");
});
