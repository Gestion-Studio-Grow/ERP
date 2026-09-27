// Lo que dice /operador/login (aviso-ingreso.ts): se ejecuta la decisión con el limitador de verdad
// y un reloj falso, no se lee el texto de la página.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, LOGIN_RULE, loginKey } from "@/lib/rate-limit";
import {
  avisoDeIngreso,
  direccionFrenada,
  leerMinutos,
  MINUTOS_DE_LA_VENTANA,
  minutosDeEspera,
  pistaDelUsuario,
} from "./aviso-ingreso";

const MIN = 60_000;

test("frenado: la dirección lleva los minutos que faltan, medidos con el limitador de login", () => {
  let ahora = 1_800_000_000_000;
  const limitador = createRateLimiter(LOGIN_RULE, () => ahora);
  const key = loginKey("operator", "203.0.113.7");
  for (let i = 0; i < LOGIN_RULE.max; i++) limitador.fail(key);
  assert.equal(limitador.blocked(key), true);
  // Recién frenado: la ventana entera.
  assert.match(direccionFrenada("/operador", limitador.retryAfterMs(key)), /[?&]min=15&/);
  // 10 minutos y medio después faltan 4 y medio: se muestra 5 (hacia arriba, nunca "0 minutos").
  ahora += 10.5 * MIN;
  assert.equal(minutosDeEspera(limitador.retryAfterMs(key)), 5);
  // Al último segundo, 1.
  ahora += 4.5 * MIN - 1_000;
  assert.equal(minutosDeEspera(limitador.retryAfterMs(key)), 1);
  // Otra conexión (otra IP) no está frenada: por eso cambiar de red destraba.
  assert.equal(limitador.blocked(loginKey("operator", "198.51.100.9")), false);
  // La dirección conserva a dónde iba.
  assert.equal(
    direccionFrenada("/operador/tenants/x?a=1", 3 * MIN),
    "/operador/login?error=throttled&min=3&next=%2Foperador%2Ftenants%2Fx%3Fa%3D1",
  );
});

test("minutos de espera: siempre un entero de 1 a la ventana", () => {
  assert.equal(MINUTOS_DE_LA_VENTANA, 15);
  assert.equal(minutosDeEspera(1), 1);
  assert.equal(minutosDeEspera(MIN), 1);
  assert.equal(minutosDeEspera(MIN + 1), 2);
  assert.equal(minutosDeEspera(15 * MIN), 15);
  assert.equal(minutosDeEspera(99 * MIN), 15);
  for (const raro of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(minutosDeEspera(raro), 1, String(raro));
});

test("?min= de la dirección: sólo un entero de 1 a 15; lo demás no se muestra", () => {
  assert.equal(leerMinutos("5"), 5);
  assert.equal(leerMinutos("15"), 15);
  for (const raw of [undefined, "", "0", "16", "999", "-3", "5.5", "5 minutos", "<b>5</b>"]) {
    assert.equal(leerMinutos(raw), null, JSON.stringify(raw));
  }
});

test("frenado: dice cuántos minutos faltan y que cambiar de red lo destraba", () => {
  const a = avisoDeIngreso("throttled", 7, "duenio")!;
  assert.equal(a.titulo, "Demasiados intentos fallidos desde esta conexión.");
  assert.match(a.detalle, /^Esperá 7 minutos y volvé a probar\./);
  assert.match(a.detalle, /si cambiás de red \(por ejemplo, a los datos del celular\), arranca de cero/);
  assert.match(avisoDeIngreso("throttled", 1, "duenio")!.detalle, /^Esperá 1 minuto y/);
  // Sin un número válido en la dirección, no se inventa uno.
  assert.match(avisoDeIngreso("throttled", null, "duenio")!.detalle, /^Esperá unos minutos y/);
});

test("clave mal: dice con qué usuario entra el dueño y de dónde sale la clave", () => {
  assert.deepEqual(avisoDeIngreso("1", null, "tomas"), {
    titulo: "Usuario o clave incorrectos.",
    detalle: "Si sos el dueño, el usuario va vacío o «tomas», y la clave es la de OPERATOR_PASSWORD en Vercel (Production).",
  });
  assert.equal(avisoDeIngreso(undefined, null, "tomas"), null);
  assert.equal(avisoDeIngreso("", null, "tomas"), null);
});

test("la pista del usuario nombra al dueño configurado", () => {
  assert.equal(pistaDelUsuario("duenio"), "Si sos el dueño: dejalo vacío o escribí «duenio»");
  assert.equal(pistaDelUsuario("tomas"), "Si sos el dueño: dejalo vacío o escribí «tomas»");
});
