// Configurador: las provisorias salen por mail a cada titular y NO vuelven al navegador (GSG-SEG-014).
import { test } from "node:test";
import assert from "node:assert/strict";
import { entregarClavesDelConfigurador, textoDeRecupero, type EntregarClave } from "./entrega-de-claves";
import type { ResultadoConfigurador } from "./configurador.server";

const CLAVE_CLIENTE = ["clave", "cliente", "1"].join("-");
const CLAVE_CONTADORA = ["clave", "contadora", "2"].join("-");

const alta = {
  ok: true,
  yaConfigurada: false,
  clienteTenantId: "t-cliente",
  estudio: { id: "t-estudio", nombre: "Estudio", direccionCartera: null },
  usuarios: [
    { quien: "cliente", nombre: "Dueño", email: "duenio@cliente.test", clave: CLAVE_CLIENTE },
    { quien: "contadora", nombre: "Mara", email: "mara@estudio.test", clave: CLAVE_CONTADORA },
    { quien: "contadora", nombre: "Ya estaba", email: "vieja@estudio.test", clave: null },
  ],
} as unknown as ResultadoConfigurador;

test("mail OK: cada clave va a su titular en SU negocio y el resultado no lleva ninguna", async () => {
  const pedidos: Parameters<EntregarClave>[0][] = [];
  const r = await entregarClavesDelConfigurador(alta, async (d) => {
    pedidos.push(d);
    return { enviada: true, enviadaA: `${d.destino.email[0]}***` };
  });
  assert.deepEqual(
    pedidos.map((p) => [p.tenantId, p.destino.email, p.clave, p.origen]),
    [
      ["t-cliente", "duenio@cliente.test", CLAVE_CLIENTE, "configurador-cliente"],
      ["t-estudio", "mara@estudio.test", CLAVE_CONTADORA, "configurador-contadora"],
    ],
    "el que ya tenía usuario no recibe nada",
  );
  assert.ok(r.ok);
  const texto = JSON.stringify(r);
  assert.ok(!texto.includes(CLAVE_CLIENTE) && !texto.includes(CLAVE_CONTADORA), "ninguna clave llega al navegador");
  if (!r.ok) return;
  assert.deepEqual(
    r.usuarios.map((u) => [u.email, u.enviadaA, u.noEnviada]),
    [
      ["duenio@cliente.test", "d***", undefined],
      ["mara@estudio.test", "m***", undefined],
      ["vieja@estudio.test", null, undefined],
    ],
  );
});

test("mail CAÍDO: el operador ve que no salió y cómo recuperarlo; tampoco hay clave en el resultado", async () => {
  const r = await entregarClavesDelConfigurador(alta, async (d) => ({ enviada: false, enviadaA: "x***@y", motivo: "mail no configurado" }));
  assert.ok(r.ok);
  if (!r.ok) return;
  const [cliente, contadora] = r.usuarios;
  assert.equal(cliente.enviadaA, null);
  assert.match(cliente.noEnviada ?? "", /no salió \(mail no configurado\).*Resetear y mandar por mail/);
  assert.match(contadora.noEnviada ?? "", /dueña del estudio/);
  const texto = JSON.stringify(r);
  assert.ok(!texto.includes(CLAVE_CLIENTE) && !texto.includes(CLAVE_CONTADORA));
});

test("un resultado con error pasa tal cual y no manda nada", async () => {
  let llamadas = 0;
  const r = await entregarClavesDelConfigurador({ ok: false, error: "no" }, async () => (llamadas++, { enviada: true, enviadaA: "" }));
  assert.deepEqual(r, { ok: false, error: "no" });
  assert.equal(llamadas, 0);
});

test("el texto de recupero nombra el destino enmascarado, no el email entero", () => {
  const t = textoDeRecupero("cliente", "503", "d***@cliente.test");
  assert.match(t, /d\*\*\*@cliente\.test/);
  assert.doesNotMatch(t, /duenio@/);
});
