// Prueba cerrada de Bitácora Café — carga los datos de ejemplo en la rama de Neon de QA.
//
// QUÉ HACE: corre `sembrarBitacoraQA` (src/lib/delivery-local/qa-seed.ts) contra la base que se le
// pasa en QA_DATABASE_URL. Aditivo e idempotente. Lo que siembra y por qué, en ese archivo.
//
// FRENOS (todos antes de escribir):
//   · sin `--confirmo-rama-qa-pedi-local` no hace nada (que nadie lo corra por error);
//   · lee QA_DATABASE_URL, NUNCA DATABASE_URL (que en la máquina de alguien puede ser producción);
//   · `frenoPorUrl`: corta si la URL es la de la rama main de Neon;
//   · `frenoPorContenido`: corta si la base tiene cualquier negocio que no sea `bitacora`.
//
// CONTRASEÑA: la provisoria del dueño entra por QA_OWNER_PASSWORD (12+ caracteres) y NUNCA se
// imprime. El dueño la cambia en el primer ingreso (mustChangePassword). Va al titular por mail aparte.
//
// Uso (sólo con el OK del dueño para la prueba cerrada, ver tarjeta C14 del tablero):
//   QA_DATABASE_URL=… QA_OWNER_PASSWORD=… npx tsx scripts/tenants/bitacora-qa-seed.mts \
//     --owner-email <mail del titular> --confirmo-rama-qa-pedi-local

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { frenoPorUrl, sembrarBitacoraQA } from "../../src/lib/delivery-local/qa-seed";

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  if (!process.argv.includes("--confirmo-rama-qa-pedi-local")) {
    console.error("Falta --confirmo-rama-qa-pedi-local. Este script sólo corre contra la rama de QA de Neon.");
    return 2;
  }
  const url = process.env.QA_DATABASE_URL;
  const freno = frenoPorUrl(url);
  if (!freno.ok) {
    console.error(`Freno anti-producción: ${freno.motivo} No se conectó a ninguna base.`);
    return 3;
  }
  const ownerEmail = argumento("owner-email");
  const ownerPassword = process.env.QA_OWNER_PASSWORD ?? "";
  if (!ownerEmail) {
    console.error("Falta --owner-email.");
    return 2;
  }
  if (ownerPassword.length < 12) {
    console.error("Falta QA_OWNER_PASSWORD (12 caracteres o más). No se imprime ni se guarda en el repo.");
    return 2;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  try {
    const r = await sembrarBitacoraQA(prisma, { ownerEmail, ownerPassword });
    console.log(
      `Bitácora QA lista · negocio ${r.tenantCreado ? "creado" : "ya existía"} · dueño ${r.ownerCreado ? "creado (cambio de contraseña obligatorio)" : "ya existía, sin cambios"} · ` +
        `${r.productosNuevos} producto(s) nuevo(s) · envíos ${r.enviosCargados ? "cargados" : "ya estaban"}.`,
    );
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

process.exit(await main());
