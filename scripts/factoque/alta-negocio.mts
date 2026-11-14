// Alta automatizada de un negocio Factoque (orden del dueño 08/11/2026).
// Runbook: docs/runbooks/factoque/ALTA-AUTOMATIZADA.md · lógica: src/lib/factoque/.
//
//   node --import tsx scripts/factoque/alta-negocio.mts --nombre "…" --slug … --cuit … \
//     --condicion-iva monotributo|ri|exento --punto-venta N --email titular@…
//
// Base: OPERATOR_DATABASE_URL (la de la consola) o DATABASE_URL. Mail: RESEND_API_KEY +
// RESEND_FROM_EMAIL (src/lib/notifications.ts); sin ellas la contraseña queda pendiente de envío.
// Nunca imprime la contraseña.

import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { correrAlta } from "../../src/lib/factoque/alta-negocio.server";
import { guardaEnDisco } from "../../src/lib/factoque/guarda-de-claves";
import { enviarMailInterno } from "../../src/lib/notifications";

let prisma: PrismaClient | null = null;
const codigo = await correrAlta(process.argv.slice(2), {
  prisma: () => {
    const url = process.env.OPERATOR_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error("Falta OPERATOR_DATABASE_URL o DATABASE_URL.");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    return prisma;
  },
  claves: guardaEnDisco(),
  correo: { enviar: enviarMailInterno },
  dominio: process.env.FACTOQUE_DOMINIO?.trim() || undefined,
  escribir: (l) => console.log(l),
});
await (prisma as PrismaClient | null)?.$disconnect();
process.exit(codigo);
