// M1-C1 (caso de la certificación, F2; arreglado: Vender boutique, el cuaderno y el protocolo encienden Tarjeta).
// CERT M1-C1 · «Con hayValorEnum(PaymentMethod,TARJETA) el pie de cobro ofrece Tarjeta» y el QA
// «vender $5.000 con Tarjeta → aparece en el libro». Ataque estático (se corre con cwd = el worktree):
// la tecla existe en PieDeCobro pero NINGÚN llamador le pasa `conTarjeta`, ninguna server action de
// cobro lee TARJETA (`leerMedioDeCobroConTarjeta` no se usa) y ProtocoloSinSenal nunca recibe
// `conTarjeta`. Además `tarjetaHabilitada()` exige el valor en el cliente de Prisma, que
// schema.prisma:51 tiene comentado: CON el ADD VALUE aplicado, Tarjeta sigue sin ofrecerse.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const raiz = process.cwd();
const rg = (patron: string) => {
  try {
    return execFileSync("grep", ["-rlE", patron, "src", "--include=*.ts", "--include=*.tsx"], { cwd: raiz, encoding: "utf8" })
      .split("\n").filter((l) => l && !l.endsWith(".test.ts") && !l.endsWith(".test.tsx"));
  } catch { return []; }
};

test("C1 · algún llamador de PieDeCobro le pasa conTarjeta", () => {
  const llamadores = rg("<PieDeCobro").filter((f) => !f.endsWith("PieDeCobro.tsx"));
  assert.ok(llamadores.length > 0);
  const conTarjeta = rg("<PieDeCobro[^>]*conTarjeta|conTarjeta=\\{");
  assert.ok(conTarjeta.some((f) => !f.endsWith("PieDeCobro.tsx") && !f.endsWith("ProtocoloSinSenal.tsx")), `nadie enciende la tecla Tarjeta (llamadores: ${llamadores.join(", ")})`);
});

test("C1 · alguna server action de cobro acepta Débito/Crédito (leerMedioDeCobroConTarjeta)", () => {
  // `[(]` y no `\\(`: el grep de Git para Windows rechaza `\(` en -E («Unmatched ( or \(»).
  const usos = rg("leerMedioDeCobroConTarjeta[(]").filter((f) => !f.endsWith("medio-cobro.ts"));
  assert.ok(usos.length > 0, "el servidor rechaza DEBITO/CREDITO en todo cobro: la tecla, si se mostrara, fallaría");
});

test("C1 · el protocolo sin señal recibe conTarjeta de tarjetaHabilitada()", () => {
  const usos = rg("<ProtocoloSinSenal[^>]*conTarjeta");
  assert.ok(usos.length > 0, "ProtocoloSinSenal siempre dice la versión sin Tarjeta");
});
