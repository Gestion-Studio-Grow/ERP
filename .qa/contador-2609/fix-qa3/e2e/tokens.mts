// Firma sesiones del laboratorio (AUTH_SECRET del env-lab) para las dueñas y la contadora: el
// recorrido no necesita las contraseñas temporales (tachadas en la evidencia del QA).
import { createSessionToken, getSessionCookieName } from "@/lib/auth";
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.LAB_OWNER_URL });
await c.connect();
const q = await c.query(`select t.subdomain, u.id from "User" u join "Tenant" t on t.id = u."tenantId"
  where u.role = 'OWNER' and u.active and u."deletedAt" is null
  and t.subdomain in ('dontito-lab','andino-lab','martinagomez-lab','losandes-lab','riobamba-lab','estudio')
  order by u."createdAt" asc`);
const salida: Record<string, string> = { cookie: getSessionCookieName() };
for (const r of q.rows) if (!salida[r.subdomain]) salida[r.subdomain] = await createSessionToken(r.id);
await c.end();
console.log(JSON.stringify(salida));
