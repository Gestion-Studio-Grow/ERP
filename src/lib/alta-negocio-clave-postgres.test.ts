// ============================================================================
// GSG-SEG-014 · Alta de negocio (wizard): la provisoria va UNA vez y sólo al dueño que quedó en la base.
// Hallazgo del refutador: el cache de idempotencia del alta guardaba la clave; un segundo «Dar de alta»
// con el MISMO nombre corto y OTRO email le mandaba la clave del dueño real a ese otro email.
// Base efímera con RLS (src/test/base-efimera.ts) y un Resend de prueba. Sin Postgres local se saltea.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("alta repetida con otro email: no sale ningún mail más y la clave del dueño no viaja a nadie", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const e = process.env as Record<string, string | undefined>;
  const nombres = ["AUTH_SECRET", "OPERATOR_SECRET", "OPERADOR_DUENIO", "RESEND_API_KEY", "RESEND_FROM_EMAIL"];
  const antes = Object.fromEntries(nombres.map((k) => [k, e[k]]));
  Object.assign(e, {
    AUTH_SECRET: "s-auth-alta",
    OPERATOR_SECRET: "s-op-alta",
    OPERADOR_DUENIO: "tomas",
    RESEND_API_KEY: "re_prueba",
    RESEND_FROM_EMAIL: "GSG <no-responder@gsg.test>",
  });
  const mails: { to: string; text: string }[] = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (!String(url).startsWith("https://api.resend.com/")) return fetchOriginal(url, init);
    const b = JSON.parse(String(init?.body));
    mails.push({ to: String(b.to), text: String(b.text) });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = fetchOriginal;
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete e[k];
      else e[k] = v;
    }
  });
  prepararAccionesDeServidor();
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { createOperatorToken } = await import("@/lib/operator-auth");
  const { commitTenantAction } = await import("@/lib/operator-provisioning-actions");
  const { verifyPassword } = await import("@/lib/auth-password");
  base.alBorrar(() => operatorPrisma.$disconnect());
  const duenio = await prismaComoDuenio(base);

  const pedido = { cookies: { operator_session: await createOperatorToken("tomas") } };
  const slug = "alta-clave-una-vez";
  const alta = async (ownerEmail: string) => {
    const r = await ejecutarAccion(pedido, () =>
      commitTenantAction({ name: "Alta Una Vez", slug, ownerEmail, edicion: "comercio", sinCatalogo: true }),
    );
    assert.equal(r.tipo, "respuesta");
    return (r as Extract<typeof r, { tipo: "respuesta" }>).valor;
  };

  const primera = await alta("titular@cliente.test");
  assert.equal(primera.ok, true, JSON.stringify(primera.error));
  assert.equal(primera.claveEnviadaA, "t***@cliente.test");
  assert.equal(primera.outcome?.commit?.generatedPassword, undefined, "la clave no vuelve al navegador");
  assert.deepEqual(mails.map((m) => m.to), ["titular@cliente.test"]);

  const segunda = await alta("tercero@otro.test");
  assert.equal(segunda.claveEnviadaA, undefined);
  assert.equal(segunda.outcome?.commit?.generatedPassword, undefined);
  assert.deepEqual(mails.map((m) => m.to), ["titular@cliente.test"], "ningún mail a otra dirección");

  // La clave que salió es la del dueño de la base, que nace con el cambio obligatorio.
  const owner = await duenio.user.findFirstOrThrow({
    where: { tenant: { slug }, role: "OWNER" },
    select: { email: true, passwordHash: true, mustChangePassword: true },
  });
  assert.equal(owner.email, "titular@cliente.test");
  assert.equal(owner.mustChangePassword, true);
  const clave = /contraseña provisoria: (\S+)/.exec(mails[0].text)?.[1] ?? "";
  assert.equal(await verifyPassword(clave, owner.passwordHash), true);
});
