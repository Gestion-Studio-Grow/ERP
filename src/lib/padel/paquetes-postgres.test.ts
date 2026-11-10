// ============================================================================
// PADEL-CLASES · T5 — paquetes de clases y precio por club contra Postgres efímero con RLS.
// ============================================================================
//
// Las Server Actions REALES (src/test/accion-de-servidor.ts), con la base como en producción
// (app_rls, RLS enforced) y la migración 20261110120000 aplicada en la base efímera local.
//
//   · Concurrencia: dos cobros «del paquete» a la vez con UNA clase restante → uno entra, el otro
//     «No le quedan clases»; la misma clase dos veces a la vez → un solo uso. Nunca un error crudo.
//   · Doble toque al vender (misma clave): un solo paquete.
//   · Cancelar una clase pagada con el paquete la devuelve al paquete; se puede volver a cobrar.
//   · Lo cobrado: suma la venta del paquete, no la clase descontada.
//   · Aislamiento: B no cobra, ni anula, ni vende sobre lo de A.
//   · Precio por club: agendar en un club con precio propio usa ése; sin club, el de la lista.
//
//   node --import tsx --test src/lib/padel/paquetes-postgres.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const H = 3_600_000;
const DIA = 86_400_000;
const fechaEn = (n: number) => new Date(Date.now() - 3 * H + n * DIA).toISOString().slice(0, 10);
const aLas = (fecha: string, h: string) => new Date(`${fecha}T${h}:00-03:00`);

type Sembrado = Awaited<ReturnType<typeof sembrar>>;
let sembrado: Sembrado | null = null;

async function sembrar(base: BaseEfimera) {
  const db = await prismaComoDuenio(base);
  for (const tenantId of [base.a.id, base.b.id]) {
    await db.padelConfig.create({ data: { tenantId, duracionMin: 60, precioIndividual: 25_000, precioGrupal: 12_000, anticipacionMin: 0, diasAdelante: 14, maxPendientesPorTel: 2 } });
    await db.padelDisponibilidad.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tenantId, diaSemana: d, desde: "06:00", hasta: "23:00", tipo: "DA" })) });
  }
  const alumno = async (tenantId: string, nombre: string, phone: string, token: string) => {
    const c = await db.client.create({ data: { tenantId, name: nombre, phone } });
    const a = await db.padelAlumno.create({ data: { tenantId, clientId: c.id, token } });
    return { id: a.id, clientId: c.id, tenantId };
  };
  return {
    db,
    juan: await alumno(base.a.id, "Juan Pérez", "1151111111", "TokenDeJuanPaquetesAAAAA1"),
    pedro: await alumno(base.b.id, "Pedro B", "1153333333", "TokenDePedroPaquetesBBBB1"),
  };
}

async function preparar(t: Parameters<typeof laBase>[0]) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env, { DB_CONNECTION_LIMIT: "8", DB_CONNECT_TIMEOUT_MS: "5000" });
  if (!sembrado) sembrado = await sembrar(base);
  return {
    base,
    s: sembrado,
    enA: { negocio: base.a, usuario: base.a.duenia },
    enB: { negocio: base.b, usuario: base.b.duenia },
    profe: await import("@/lib/padel/acciones"),
    paq: await import("@/lib/padel/acciones-paquetes"),
    clubes: await import("@/lib/padel/acciones-clubes"),
    datos: await import("@/lib/padel/datos.server"),
  };
}

function valor<R>(r: { tipo: string; valor?: R }): R {
  assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  return r.valor as R;
}

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

let dia = 0;
/** Una clase de Juan en un día propio (dadas en el pasado, confirmadas en el futuro). */
async function clase(s: Sembrado, estado: "DADA" | "CONFIRMADA") {
  dia++;
  const f = fechaEn(estado === "DADA" ? -dia : dia + 1);
  const empiezaEn = aLas(f, "09:00");
  return s.db.padelClase.create({
    data: { tenantId: s.juan.tenantId, alumnoId: s.juan.id, clientId: s.juan.clientId, empiezaEn, terminaEn: new Date(empiezaEn.getTime() + H), estado, origen: "PROFE", precio: 25_000, confirmadaEl: new Date(), ...(estado === "DADA" ? { dadaEl: new Date() } : {}) },
    select: { id: true },
  });
}

async function paqueteDe(s: Sembrado, clases: number, precio = 100_000) {
  return s.db.padelPaquete.create({ data: { tenantId: s.juan.tenantId, alumnoId: s.juan.id, clases, precio, pagoMedio: "EFECTIVO", pagadoEl: new Date(Date.now() - 400 * DIA) } });
}

/** Deja a Juan sin paquetes vivos (cada caso arranca de cero). */
async function sinPaquetes(s: Sembrado) {
  await s.db.padelPaquete.updateMany({ where: { tenantId: s.juan.tenantId, alumnoId: s.juan.id, anuladoEl: null }, data: { anuladoEl: new Date() } });
}

test("concurrencia: dos cobros del paquete a la vez con UNA clase restante → uno entra, el otro «No le quedan»; 0 errores crudos", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { s, enA, paq } = ctx;
  let crudos = 0;
  for (let ronda = 0; ronda < 6; ronda++) {
    await sinPaquetes(s);
    const p = await paqueteDe(s, 1);
    const [c1, c2] = await Promise.all([clase(s, "DADA"), clase(s, "DADA")]);
    const rs = await Promise.allSettled([ejecutarAccion(enA, () => paq.cobrarConPaquete(c1.id)), ejecutarAccion(enA, () => paq.cobrarConPaquete(c2.id))]);
    const valores = rs.map((r) => (r.status === "fulfilled" ? (r.value as { valor?: { ok: boolean; error?: string } }).valor : null));
    crudos += valores.filter((v) => v === null).length;
    assert.equal(valores.filter((v) => v?.ok).length, 1, `ronda ${ronda}: entra uno solo`);
    assert.ok(valores.some((v) => v && !v.ok && /No le quedan clases/.test(v.error ?? "")), `ronda ${ronda}: el otro dice que no le quedan`);
    assert.equal(await s.db.padelPaqueteUso.count({ where: { paqueteId: p.id } }), 1, "el paquete gastó una sola clase");
    const pagadas = await s.db.padelClase.count({ where: { id: { in: [c1.id, c2.id] }, pagoEstado: "PAGADO", pagoMedio: "PAQUETE" } });
    assert.equal(pagadas, 1);
  }
  assert.equal(crudos, 0, "ningún cobro termina en un error crudo");
});

test("concurrencia: la MISMA clase cobrada del paquete dos veces a la vez → un solo uso", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { s, enA, paq } = ctx;
  await sinPaquetes(s);
  const p = await paqueteDe(s, 5);
  const c = await clase(s, "DADA");
  const rs = await Promise.all([ejecutarAccion(enA, () => paq.cobrarConPaquete(c.id)), ejecutarAccion(enA, () => paq.cobrarConPaquete(c.id))]);
  const oks = rs.map((r) => valor(r)).filter((v) => v.ok);
  assert.equal(oks.length, 1);
  assert.equal(await s.db.padelPaqueteUso.count({ where: { paqueteId: p.id } }), 1);
  // Y por la puerta de siempre («Cobré» efectivo) tampoco se cobra dos veces.
  const otra = valor(await ejecutarAccion(enA, () => ctx.profe.cobrar(c.id, "EFECTIVO")));
  assert.equal(otra.ok, false);
});

test("vender: doble toque con la misma clave → un solo paquete; validación y ficha con «quedan»", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { s, enA, paq, datos } = ctx;
  await sinPaquetes(s);
  const clave = "clave-doble-toque-0001";
  const datosVenta = { clases: "8", precio: "160.000", medio: "TRANSFERENCIA", clave };
  const rs = await Promise.all([ejecutarAccion(enA, () => paq.venderPaquete(s.juan.id, datosVenta)), ejecutarAccion(enA, () => paq.venderPaquete(s.juan.id, datosVenta))]);
  const vs = rs.map((r) => valor(r));
  assert.ok(vs.every((v) => v.ok), JSON.stringify(vs));
  assert.equal(await s.db.padelPaquete.count({ where: { tenantId: s.juan.tenantId, claveIdem: clave } }), 1);
  const mal = valor(await ejecutarAccion(enA, () => paq.venderPaquete(s.juan.id, { clases: "0", precio: "1000", medio: "EFECTIVO" })));
  assert.equal(mal.ok, false);
  const f = valor(await ejecutarAccion(enA, () => datos.ficha(s.juan.id)));
  assert.ok(f);
  assert.equal(f.paquetes.disponible, true);
  assert.equal(f.paquetes.quedan, 8);
});

test("cancelar una clase pagada con el paquete la devuelve al paquete; se puede volver a cobrar", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { s, enA, paq, profe } = ctx;
  await sinPaquetes(s);
  await paqueteDe(s, 2);
  const c = await clase(s, "CONFIRMADA");
  const r1 = valor(await ejecutarAccion(enA, () => paq.cobrarConPaquete(c.id)));
  assert.ok(r1.ok && r1.quedan === 1, JSON.stringify(r1));
  const can = valor(await ejecutarAccion(enA, () => profe.cancelarConMotivo(c.id, "LLUVIA")));
  assert.ok(can.ok, JSON.stringify(can));
  const fila = await s.db.padelClase.findUniqueOrThrow({ where: { id: c.id }, select: { pagoEstado: true, pagoMedio: true } });
  assert.deepEqual(fila, { pagoEstado: "PENDIENTE", pagoMedio: null }, "ni a favor ni pagada: vuelve al paquete");
  const ahora = valor(await ejecutarAccion(enA, () => paq.paqueteParaCobrar(c.id)));
  assert.equal(ahora.quedan, 2);
  // Otra clase se cobra del paquete aunque haya quedado el uso viejo de la cancelada.
  const c2 = await clase(s, "CONFIRMADA");
  const r2 = valor(await ejecutarAccion(enA, () => paq.cobrarConPaquete(c2.id)));
  assert.ok(r2.ok && r2.quedan === 1, JSON.stringify(r2));
  // Anular: con una clase usada, no.
  const vivo = await s.db.padelPaquete.findFirstOrThrow({ where: { tenantId: s.juan.tenantId, alumnoId: s.juan.id, anuladoEl: null } });
  const an = valor(await ejecutarAccion(enA, () => paq.anularPaquete(vivo.id)));
  assert.equal(an.ok, false);
});

test("lo cobrado suma la venta del paquete, no la clase descontada", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { s, enA, paq, datos } = ctx;
  await sinPaquetes(s);
  const antes = valor(await ejecutarAccion(enA, () => datos.plata("hoy"))).cobrado.total;
  const v = valor(await ejecutarAccion(enA, () => paq.venderPaquete(s.juan.id, { clases: "4", precio: "90.000", medio: "EFECTIVO", clave: "clave-cobrado-hoy-0001" })));
  assert.ok(v.ok);
  const c = await clase(s, "DADA");
  assert.ok(valor(await ejecutarAccion(enA, () => paq.cobrarConPaquete(c.id))).ok);
  const despues = valor(await ejecutarAccion(enA, () => datos.plata("hoy"))).cobrado.total;
  assert.equal(despues - antes, 90_000);
});

test("aislamiento: B no cobra, ni anula, ni le vende a lo de A", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { s, enA, enB, paq } = ctx;
  await sinPaquetes(s);
  const p = await paqueteDe(s, 3);
  const c = await clase(s, "DADA");
  assert.equal(valor(await ejecutarAccion(enB, () => paq.cobrarConPaquete(c.id))).ok, false);
  assert.equal(valor(await ejecutarAccion(enB, () => paq.anularPaquete(p.id))).ok, false);
  assert.equal(valor(await ejecutarAccion(enB, () => paq.venderPaquete(s.juan.id, { clases: "2", precio: "1000", medio: "EFECTIVO" }))).ok, false);
  assert.equal(valor(await ejecutarAccion(enB, () => paq.paqueteParaCobrar(c.id))).quedan, 0);
  const sigue = await s.db.padelPaquete.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(sigue.anuladoEl, null);
  // A sí lo anula (no usó ninguna).
  assert.ok(valor(await ejecutarAccion(enA, () => paq.anularPaquete(p.id))).ok);
});

test("precio por club: agendar en un club con precio propio usa ése; sin club, la lista; B no lo toca", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { s, enA, enB, profe, clubes } = ctx;
  const club = valor(await ejecutarAccion(enA, () => clubes.crearClub(fd({ nombre: "Club Caro" }))));
  assert.ok(club.ok);
  const clubId = club.ok ? club.id : "";
  assert.ok(valor(await ejecutarAccion(enA, () => clubes.guardarPrecioClub(clubId, { precioIndividual: "30.000", precioGrupal: "" }))).ok);
  assert.equal(valor(await ejecutarAccion(enB, () => clubes.guardarPrecioClub(clubId, { precioIndividual: "1", precioGrupal: "" }))).ok, false, "B no cambia el precio de un club de A");
  const f = fechaEn(9);
  const conClub = valor(await ejecutarAccion(enA, () => profe.agendarClase(fd({ fecha: f, hora: "07:00", alumnoId: s.juan.id, clubId }))));
  assert.ok(conClub.ok, JSON.stringify(conClub));
  const sinClub = valor(await ejecutarAccion(enA, () => profe.agendarClase(fd({ fecha: f, hora: "20:00", alumnoId: s.juan.id }))));
  assert.ok(sinClub.ok, JSON.stringify(sinClub));
  const precios = await s.db.padelClase.findMany({ where: { tenantId: s.juan.tenantId, empiezaEn: { in: [aLas(f, "07:00"), aLas(f, "20:00")] } }, orderBy: { empiezaEn: "asc" }, select: { precio: true, clubId: true } });
  assert.deepEqual(precios.map((p) => [Number(p.precio), p.clubId]), [[30_000, clubId], [25_000, null]]);
  // Vaciar los dos precios vuelve a la lista general.
  assert.ok(valor(await ejecutarAccion(enA, () => clubes.guardarPrecioClub(clubId, { precioIndividual: "", precioGrupal: "" }))).ok);
  assert.equal(await s.db.padelPrecioClub.count({ where: { clubId } }), 0);
});
