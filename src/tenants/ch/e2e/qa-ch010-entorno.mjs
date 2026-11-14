// QA GSG-CH-010 · entorno de los recorridos de «Mi liquidación» (PR #139) y rendición (PR #144).
// Base Postgres LOCAL efímera (entorno-ch.mjs → crearBaseEfimera; nunca Neon) + la app de producción.
// Sobre la semilla de CH suma, SÓLO en esa base efímera:
//   · las migraciones pendientes que la rama necesita (CH_voucher_enum.sql y, si está en la rama,
//     CH_rendicion_profesional.sql), aplicadas como neondb_owner (como dice su cabecera);
//   · Laura «cobra aparte» (cobraEnMostrador = false) y un usuario profesional para Marina;
//   · turnos de Laura para los casos con voucher y con descuento, y uno de Marina ya cobrado.
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { levantarEntornoCH, RAIZ, CLAVE_DE_PRUEBA } from "./entorno-ch.mjs";
import { prismaComoDuenio } from "../../../test/base-efimera.ts";
import { hashPassword } from "../../../lib/auth-password.ts";

export const EMAIL_LAURA = "laura@negocio-a.erp.test";
export const EMAIL_MARINA = "marina@negocio-a.erp.test";
export { CLAVE_DE_PRUEBA };
const HORA = 3_600_000;

async function aplicarSql(url, archivo) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query(await readFile(archivo, "utf8"));
  } finally {
    await c.end();
  }
}

export async function levantarQA() {
  const e = await levantarEntornoCH({ log: () => {} });
  const pend = (f) => path.join(RAIZ, "prisma/pending-gate2", f);
  await aplicarSql(e.base.urlDuenio, pend("CH_voucher_enum.sql"));
  const conRendicion = existsSync(pend("CH_rendicion_profesional.sql"));
  if (conRendicion) await aplicarSql(e.base.urlDuenio, pend("CH_rendicion_profesional.sql"));

  const db = await prismaComoDuenio(e.base);
  const tenantId = e.base.a.id;
  const { laura, marina } = e.semilla.profesionales;
  const { masaje, peeling } = e.semilla.servicios;
  await db.professional.update({ where: { id: laura }, data: { cobraEnMostrador: false } });
  await db.user.create({
    data: { tenantId, name: "Marina Suárez", email: EMAIL_MARINA, passwordHash: await hashPassword(CLAVE_DE_PRUEBA), role: "PROFESSIONAL", professionalId: marina },
  });
  const lauraP = await db.professional.findUniqueOrThrow({ where: { id: laura } });
  const marinaP = await db.professional.findUniqueOrThrow({ where: { id: marina } });
  const ahora = Date.now();
  const turno = async (clienta, tel, prof, serviceId, min, haceH, precio) => {
    const client = await db.client.create({ data: { tenantId, name: clienta, phone: tel } });
    const startsAt = new Date(Math.floor((ahora - haceH * HORA) / 60_000) * 60_000);
    return db.appointment.create({
      data: { tenantId, clientId: client.id, professionalId: prof.id, serviceId, boxId: prof.boxId, startsAt, endsAt: new Date(startsAt.getTime() + min * 60_000), status: "CONFIRMED", priceAtBooking: precio },
    });
  };
  // Voucher: $15.000, la clienta trae un voucher de $5.000 (OpenKey); el saldo lo cobra Laura en la UI.
  const conVoucher = await turno("Paula Voucher", "1130000011", lauraP, masaje, 60, 5, 15000);
  const col = await db.collection.create({
    data: { tenantId, originType: "APPOINTMENT", originId: conVoucher.id, appointmentId: conVoucher.id, amount: 5000, method: "VOUCHER", collectedBy: `user:${e.base.a.duenia.id}`, note: "voucher OpenKey (semilla QA)" },
  });
  await db.payment.create({ data: { tenantId, appointmentId: conVoucher.id, amount: 5000, method: "VOUCHER", status: "APPROVED" } });
  // Descuento: masaje de lista $15.000 dado a $12.000.
  const conDescuento = await turno("Diana Descuento", "1130000012", lauraP, masaje, 60, 6, 12000);
  // Marina: un peeling ya cobrado por la dueña en el mostrador ($22.000), completado.
  const deMarina = await turno("Mora Marina", "1130000013", marinaP, peeling, 40, 3, 22000);
  await db.collection.create({
    data: { tenantId, originType: "APPOINTMENT", originId: deMarina.id, appointmentId: deMarina.id, amount: 22000, method: "EFECTIVO", collectedBy: `user:${e.base.a.duenia.id}` },
  });
  await db.payment.create({ data: { tenantId, appointmentId: deMarina.id, amount: 22000, method: "EFECTIVO", status: "APPROVED" } });
  await db.appointment.update({ where: { id: deMarina.id }, data: { status: "COMPLETED" } });
  return { e, db, conRendicion, ids: { conVoucher: conVoucher.id, voucherCol: col.id, conDescuento: conDescuento.id, deMarina: deMarina.id } };
}

// Modo «servidor»: levanta y deja corriendo para recorrer a mano; escribe el estado en un JSON.
if (process.argv[2] === "--servir") {
  const { writeFile } = await import("node:fs/promises");
  const q = await levantarQA();
  const estado = { url: q.e.url, conRendicion: q.conRendicion, semilla: q.e.semilla, ids: q.ids, duenia: q.e.base.a.duenia.email, recepcion: q.e.base.a.recepcion.email, tenantId: q.e.base.a.id, urlDuenio: q.e.base.urlDuenio };
  await writeFile(process.argv[3], JSON.stringify(estado, null, 2));
  console.log("listo", q.e.url);
  const fin = async () => { await q.e.cerrar(); process.exit(0); };
  process.on("SIGTERM", fin);
  process.on("SIGINT", fin);
  setInterval(() => {}, 1 << 30);
}
