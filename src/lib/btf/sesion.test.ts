import { test } from "node:test";
import assert from "node:assert/strict";
import { DURACION_SESION_S, exigirFotografo, firmarSesion, verificarSesion } from "./sesion";
import { ErrorBtf } from "./http";

const S = "secreto-de-prueba-123456";
const T0 = Date.UTC(2026, 10, 4);

test("una sesión firmada se verifica y devuelve el fotógrafo", () => {
  assert.equal(verificarSesion(firmarSesion("cfoto1", S, T0), S, T0 + 1000), "cfoto1");
});

test("vence a los 30 días", () => {
  const v = firmarSesion("cfoto1", S, T0);
  assert.equal(verificarSesion(v, S, T0 + (DURACION_SESION_S - 1) * 1000), "cfoto1");
  assert.equal(verificarSesion(v, S, T0 + DURACION_SESION_S * 1000), null);
});

test("firma adulterada, otro secreto, otro id o basura → null", () => {
  const v = firmarSesion("cfoto1", S, T0);
  const [id, exp, f] = v.split(".");
  assert.equal(verificarSesion(v, "otro-secreto-xxxxxxxxx", T0), null);
  assert.equal(verificarSesion(`cfoto2.${exp}.${f}`, S, T0), null);
  assert.equal(verificarSesion(`${id}.${Number(exp) + 9999}.${f}`, S, T0), null);
  assert.equal(verificarSesion(`${id}.${exp}.${f.slice(0, -1)}A`, S, T0), null);
  for (const b of ["", "a.b", "a.b.c.d", null, undefined]) assert.equal(verificarSesion(b, S, T0), null);
});

test("exigirFotografo: sin cookie → 401; con cookie válida → id", () => {
  const antes = process.env.BTF_SECRET;
  process.env.BTF_SECRET = S;
  try {
    assert.throws(() => exigirFotografo(new Request("https://buscatufoto.x/api/btf/yo")), (e) => e instanceof ErrorBtf && e.status === 401);
    const r = new Request("https://buscatufoto.x/api/btf/yo", { headers: { cookie: `otra=1; btf_sesion=${firmarSesion("cfoto9", S)}` } });
    assert.equal(exigirFotografo(r), "cfoto9");
  } finally {
    if (antes === undefined) delete process.env.BTF_SECRET;
    else process.env.BTF_SECRET = antes;
  }
});
