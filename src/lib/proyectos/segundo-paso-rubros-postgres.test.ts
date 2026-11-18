// ============================================================================
// E-4 (GSG-MIA-090): en MIA Taller (rubro `taller-stands`) Dirección y Administración, que ven la plata, tienen que
// pasar por los dos pasos al entrar, como en una productora. Antes del arreglo `exigeSegundoPaso` miraba sólo el rubro
// `productora`: en el Taller entraban con la contraseña sola, y la pantalla de Equipo decía lo contrario.
//
// Se prueba ENTRANDO: la acción `login` real (la del formulario), con la clave correcta y sin código, y después el
// segundo paso real (`confirmarSegundoPaso`) con el código de la app y con un código de respaldo (perder el teléfono
// tiene salida). Postgres con RLS y la app como `app_rls`; nada toca Neon. Sin Postgres local se saltea (en CI falla).
// Decisión del dueño (2) A, 18/11: «MIA Taller pide dos pasos a Dirección y Administración». Provisional a confirmar
// por el dueño en lo que no dijo: los otros tres roles del Taller entran como hoy (sin el código por mail de rendiciones).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, CLAVE_DE_PRUEBA, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor, type SalidaDeAccion } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const COOKIE_PASE = "admin_segundo_paso";
const ROLES = ["ADMINISTRACION", "COMERCIAL", "DISENO", "PRODUCCION"] as const;
/** Reloj fijo para el código de la app: 15 s dentro de un paso de 30 s, lejos del borde (18/11/2026 12:00:15 UTC). */
const AHORA = Date.UTC(2026, 10, 18, 12, 0, 15);
let ingresos = 0;

interface Fixture {
  base: BaseEfimera;
  /** Mail de cada rol de gestión en el negocio A (Dirección es la dueña). */
  mail: Record<"DIRECCION" | (typeof ROLES)[number], string>;
  sesion: string;
}

let prep: Promise<Fixture> | null = null;
async function preparar(t: import("node:test").TestContext): Promise<Fixture | null> {
  const base = await laBase(t);
  if (!base) return null;
  prep ??= (async () => {
    apuntarLaAppA(base);
    prepararAccionesDeServidor();
    const a = base.a;
    const mail = { DIRECCION: a.duenia.email } as Fixture["mail"];
    const c = new pg.Client({ connectionString: base.urlDuenio });
    await c.connect();
    try {
      const { rows } = await c.query(`SELECT "passwordHash" FROM "User" WHERE id = $1`, [a.duenia.id]);
      for (const rol of ROLES) {
        const id = `e4-${rol.toLowerCase()}`;
        mail[rol] = `${rol.toLowerCase()}@${a.subdominio}.example`;
        await c.query(`INSERT INTO "User" (id, "tenantId", name, email, "passwordHash", role, "updatedAt") VALUES ($1, $2, $3, $4, $5, 'RECEPTION'::"UserRole", now())`, [id, a.id, `Persona ${rol}`, mail[rol], rows[0].passwordHash]);
        await c.query(`INSERT INTO "ProyectoPersona" (id, "tenantId", "userId", nombre, email, rol) VALUES ($1, $2, $3, $4, $5, $6)`, [`pp-${id}`, a.id, id, `Persona ${rol}`, mail[rol], rol]);
      }
    } finally {
      await c.end();
    }
    const { getSessionCookieName } = await import("@/lib/auth");
    return { base, mail, sesion: getSessionCookieName() };
  })();
  return prep;
}

async function rubro(base: BaseEfimera, blueprintId: string | null): Promise<void> {
  const d = await prismaComoDuenio(base);
  await d.tenant.update({ where: { id: base.a.id }, data: { blueprintId } });
  // Cada ingreso de la prueba arranca sin dos pasos activados (el estado es por persona).
  await d.proyectoSegundoFactor.deleteMany({ where: { tenantId: base.a.id } });
}

/** El ingreso de verdad: el formulario de /admin/login con la clave correcta, sin código. */
async function entrar(f: Fixture, email: string): Promise<SalidaDeAccion<unknown>> {
  const { login } = await import("@/lib/auth-actions");
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", CLAVE_DE_PRUEBA);
  fd.set("next", "/admin");
  // Una IP de documentación distinta por ingreso, en orden fijo (el límite de intentos es por IP): la corrida se repite igual.
  ingresos += 1;
  return ejecutarAccion({ negocio: f.base.a, headers: { "x-forwarded-for": `198.51.100.${ingresos}` } }, () => login(fd));
}

const destino = (r: SalidaDeAccion<unknown>): string => (r.tipo === "redireccion" ? r.destino : `(${r.tipo})`);
const conSesion = (f: Fixture, r: SalidaDeAccion<unknown>): boolean => !!r.cookiesPuestas[f.sesion];

function pideSegundoPaso(f: Fixture, r: SalidaDeAccion<unknown>, quien: string): void {
  assert.match(destino(r), /^\/admin\/login\/segundo-paso/, `${quien}: con la clave sola va al segundo paso`);
  assert.equal(conSesion(f, r), false, `${quien}: sin código no obtiene sesión`);
  assert.ok(r.cookiesPuestas[COOKIE_PASE], `${quien}: sale el pase de 10 minutos para el código`);
}

function entraSinCodigo(f: Fixture, r: SalidaDeAccion<unknown>, quien: string): void {
  assert.equal(conSesion(f, r), true, `${quien}: entra como hoy (${destino(r)})`);
  assert.doesNotMatch(destino(r), /segundo-paso|\/pin/, `${quien}: sin segundo paso`);
}

test("E-4 · MIA Taller (taller-stands): Dirección y Administración no obtienen sesión con la clave sola; Comercial, Diseño y Producción entran como hoy", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  await rubro(f.base, "taller-stands");
  pideSegundoPaso(f, await entrar(f, f.mail.DIRECCION), "Dirección (dueña)");
  pideSegundoPaso(f, await entrar(f, f.mail.ADMINISTRACION), "Administración");
  for (const rol of ["COMERCIAL", "DISENO", "PRODUCCION"] as const) entraSinCodigo(f, await entrar(f, f.mail[rol]), rol);
});

test("E-4 · MIA Taller: con el código de la app entra, y con un código de respaldo también (perdió el teléfono)", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  await rubro(f.base, "taller-stands");
  // El servidor lee la hora del reloj del sistema: se fija sólo Date (los timers siguen reales), así el test y el servidor ven el mismo paso.
  t.mock.timers.enable({ apis: ["Date"], now: AHORA });
  const { confirmarSegundoPaso } = await import("@/app/admin/login/segundo-paso/acciones");
  const { datosDeActivacion } = await import("@/lib/proyectos/segundo-factor.server");
  const { codigoDelPaso, pasoDe } = await import("@/lib/proyectos/segundo-factor-core");
  const a = f.base.a;

  // 1) Primer ingreso: clave → pase → la pantalla del segundo paso arma la activación → código de la app → sesión.
  const r1 = await entrar(f, f.mail.DIRECCION);
  pideSegundoPaso(f, r1, "Dirección");
  const pase = { [COOKIE_PASE]: r1.cookiesPuestas[COOKIE_PASE] };
  const act = await ejecutarAccion({ negocio: a, cookies: pase }, () => datosDeActivacion({ id: a.duenia.id, tenantId: a.id, email: a.duenia.email, role: "OWNER" }, "Taller"));
  assert.equal(act.tipo, "respuesta");
  const secreto = (act as { valor: { secreto: Buffer } }).valor.secreto;
  const mal = new FormData();
  mal.set("codigo", "000000" === codigoDelPaso(secreto, pasoDe(AHORA)) ? "111111" : "000000");
  const fallido = await ejecutarAccion({ negocio: a, cookies: pase }, () => confirmarSegundoPaso({}, mal));
  assert.equal(fallido.tipo, "respuesta");
  assert.equal(conSesion(f, fallido), false, "un código equivocado no da sesión");
  const bien = new FormData();
  bien.set("codigo", codigoDelPaso(secreto, pasoDe(AHORA)));
  bien.set("next", "/admin");
  const ok = await ejecutarAccion({ negocio: a, cookies: pase }, () => confirmarSegundoPaso({}, bien));
  assert.equal(conSesion(f, ok), true, `con el código entra (${destino(ok)})`);
  const codigos = ok.tipo === "respuesta" ? (ok.valor as { codigos?: string[] }).codigos ?? [] : [];
  assert.ok(codigos.length > 0, "al activar se muestran los códigos de respaldo");

  // 2) Perdió el teléfono: clave → segundo paso → un código de respaldo → sesión.
  const r2 = await entrar(f, f.mail.DIRECCION);
  pideSegundoPaso(f, r2, "Dirección, segundo ingreso");
  const respaldo = new FormData();
  respaldo.set("codigo", codigos[0]);
  respaldo.set("next", "/admin");
  const conRespaldo = await ejecutarAccion({ negocio: a, cookies: { [COOKIE_PASE]: r2.cookiesPuestas[COOKIE_PASE] } }, () => confirmarSegundoPaso({}, respaldo));
  assert.equal(conSesion(f, conRespaldo), true, `con un código de respaldo entra (${destino(conRespaldo)})`);
});

test("E-4 · los otros negocios entran igual que antes: productora (MIA Producciones) con dos pasos; CH, Magra y el ARM sin", async (t) => {
  const f = await preparar(t);
  if (!f) return;
  await rubro(f.base, "productora");
  pideSegundoPaso(f, await entrar(f, f.mail.DIRECCION), "productora · Dirección");
  pideSegundoPaso(f, await entrar(f, f.mail.ADMINISTRACION), "productora · Administración");
  for (const bp of [null, "generico", "arm"]) {
    await rubro(f.base, bp);
    entraSinCodigo(f, await entrar(f, f.mail.DIRECCION), `rubro ${bp ?? "sin rubro (CH, Magra)"} · dueña`);
    entraSinCodigo(f, await entrar(f, f.mail.ADMINISTRACION), `rubro ${bp ?? "sin rubro"} · Administración`);
  }
});
