// Valor del voucher del negocio (orden del dueño, 09/11/2026): lectura del formulario, de la fila y quién lo edita.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Role, UsuarioConPermisos } from "@/lib/capabilities";
import { leerValorDelFormulario, leerValorVoucherInTx, motivoParaNoEditarValor, SOLO_DUENIA_VALOR, valorDeLaFila, VALOR_MAXIMO } from "./valor-voucher";

test("el formulario: importe de la casa, vacío = sin valor, cero o basura se rechaza", () => {
  assert.deepEqual(leerValorDelFormulario("14.000"), { ok: true, valor: 14000 });
  assert.deepEqual(leerValorDelFormulario("$ 9.999,50"), { ok: true, valor: 9999.5 });
  assert.deepEqual(leerValorDelFormulario(""), { ok: true, valor: null });
  assert.deepEqual(leerValorDelFormulario("   "), { ok: true, valor: null });
  for (const raw of ["0", "0,00", "abc", "-5", "1,234"]) {
    const r = leerValorDelFormulario(raw);
    if (raw === "1,234") assert.deepEqual(r, { ok: true, valor: 1234 });
    else assert.equal(r.ok, false, raw);
  }
  assert.equal(leerValorDelFormulario(String(VALOR_MAXIMO * 10)).ok, false);
});

test("la fila: ausente (columna sin migrar), null o ≤ 0 = sin valor", () => {
  assert.equal(valorDeLaFila(undefined), null);
  assert.equal(valorDeLaFila(null), null);
  assert.equal(valorDeLaFila(""), null);
  assert.equal(valorDeLaFila("0"), null);
  assert.equal(valorDeLaFila("abc"), null);
  assert.equal(valorDeLaFila("14000.00"), 14000);
  assert.equal(valorDeLaFila(9999.5), 9999.5);
});

test("leerValorVoucherInTx: sin fila o sin columna devuelve null; con valor, el número", async () => {
  const tx = (filas: { valor: string | null }[]) => ({ $queryRaw: async () => filas }) as never;
  assert.equal(await leerValorVoucherInTx(tx([]), "t1"), null);
  assert.equal(await leerValorVoucherInTx(tx([{ valor: null }]), "t1"), null);
  assert.equal(await leerValorVoucherInTx(tx([{ valor: "12000.00" }]), "t1"), 12000);
  // La consulta lee la fila como JSON: no falla (ni aborta la transacción del cobro) sin la columna.
  const fuente = readFileSync(new URL("./valor-voucher.ts", import.meta.url), "utf8");
  assert.match(fuente, /to_jsonb\(b\) ->> 'voucherValor'/);
});

test("sólo la dueña cambia el valor; un override no se lo da a nadie más", () => {
  const u = (role: Role, overrides: UsuarioConPermisos["overrides"] = []): UsuarioConPermisos => ({ role, overrides });
  assert.equal(motivoParaNoEditarValor(u("OWNER")), null);
  for (const role of ["RECEPTION", "PROFESSIONAL"] as const) {
    assert.equal(motivoParaNoEditarValor(u(role, [{ capability: "vouchers:conciliar", allowed: true }])), SOLO_DUENIA_VALOR);
  }
});

test("la migración es aditiva, nullable y con CHECK > 0", () => {
  const sql = readFileSync(new URL("../../../prisma/migrations/20261109200000_voucher_valor/migration.sql", import.meta.url), "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "voucherValor" DECIMAL\(14,2\);/);
  assert.match(sql, /CHECK \("voucherValor" IS NULL OR "voucherValor" > 0\)/);
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ""), /DROP|NOT NULL|UPDATE /);
});
