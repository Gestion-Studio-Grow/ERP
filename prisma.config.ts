import "dotenv/config";
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
  // ── MIGRAR NO USA LA MISMA CONEXIÓN QUE SERVIR ─────────────────────────
  //
  // `DATABASE_URL` en producción apunta al POOLER de Neon, que es lo correcto para una app
  // serverless: muchas funciones, conexiones cortas. Pero **el pooler rechaza las
  // migraciones** (el runbook lo dice desde siempre: `migrate deploy`, rol directo, nunca el
  // pooler). Hasta acá las dos cosas leían la misma variable, así que migrar desde cualquier
  // lado que tuviera la conexión de producción fallaba, y la única salida era que una persona
  // pegara a mano la cadena del rol directo en su terminal.
  //
  // `MIGRATE_DATABASE_URL` es esa cadena, con el rol DIRECTO. Se setea sólo donde se migra.
  // Si no está, se cae a `DATABASE_URL` y todo sigue como antes: en local las dos son la
  // misma y no cambia nada.
  migrate: {
    adapter: async () =>
      new PrismaPg({
        connectionString: process.env["MIGRATE_DATABASE_URL"] || process.env["DATABASE_URL"],
      }),
  },
});
