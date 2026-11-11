// Alta Factoque — lo puro: flags, decisión de la contraseña, mail y salida (sin la contraseña).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claveAEntregar,
  interpretarArgs,
  leerCondicionIva,
  lineasDeSalida,
  mailAlTitular,
  urlDelNegocio,
} from "./alta-negocio-core";
import { guardaEnDisco } from "./guarda-de-claves";

const BUENOS = ["--nombre", "Almacén Don Pepe", "--slug", "don-pepe", "--cuit", "20-12345678-6", "--condicion-iva", "mono", "--punto-venta", "3", "--email", "Pepe@Ejemplo.com"];

test("flags válidos: CUIT normalizado, alias de IVA, email en minúsculas, titular = negocio", () => {
  const a = interpretarArgs(BUENOS);
  assert.ok(a.ok && a.modo === "alta");
  assert.deepEqual(a.datos, {
    nombre: "Almacén Don Pepe",
    slug: "don-pepe",
    cuit: "20123456786",
    condicionIva: "MONOTRIBUTO",
    puntoVenta: 3,
    email: "pepe@ejemplo.com",
    titular: "Almacén Don Pepe",
    operador: "script-alta-factoque",
  });
  const b = interpretarArgs(["--nombre=X", "--slug=x", "--cuit=20123456786", "--condicion-iva=RESPONSABLE_INSCRIPTO", "--punto-venta=1", "--email=a@b.co", "--titular=Ana"]);
  assert.ok(b.ok && b.modo === "alta" && b.datos.condicionIva === "RESPONSABLE_INSCRIPTO" && b.datos.titular === "Ana");
});

test("flags malos: junta todos los errores de una", () => {
  const a = interpretarArgs(["--slug", "Don Pepe", "--cuit", "20123456787", "--condicion-iva", "consumidor", "--punto-venta", "0", "--email", "nada"]);
  assert.ok(!a.ok);
  assert.equal(a.errores.length, 6); // slug, nombre, cuit (DV), iva, punto de venta, email
  assert.ok(!interpretarArgs(["--slug", "www", ...BUENOS.slice(2)]).ok, "www está reservado");
  assert.ok(!interpretarArgs(BUENOS.map((v) => (v === "3" ? "123456" : v))).ok, "punto de venta de 6 dígitos");
});

test("--confirmar-envio sólo pide el slug", () => {
  assert.deepEqual(interpretarArgs(["--confirmar-envio", "--slug", "don-pepe"]), { ok: true, modo: "confirmar-envio", slug: "don-pepe" });
});

test("condición IVA: alias y claves largas; lo demás, null", () => {
  assert.equal(leerCondicionIva("RI"), "RESPONSABLE_INSCRIPTO");
  assert.equal(leerCondicionIva("exento"), "EXENTO");
  assert.equal(leerCondicionIva("CONSUMIDOR_FINAL"), null);
});

test("contraseña: nueva si se creó el titular; pendiente si quedó de antes; si no, no se toca", () => {
  assert.equal(claveAEntregar({ titularCreado: true, habiaArchivo: false }), "nueva");
  assert.equal(claveAEntregar({ titularCreado: false, habiaArchivo: true }), "pendiente");
  assert.equal(claveAEntregar({ titularCreado: false, habiaArchivo: false }), "ninguna");
});

test("dirección del negocio", () => {
  assert.equal(urlDelNegocio("don-pepe"), "https://don-pepe.gsgapp.com.ar/facturita/app");
});

test("el mail lleva la clave y el aviso de cambio obligatorio; la salida NUNCA la lleva", () => {
  const clave = "Zz9-clave-que-no-se-ve";
  const m = mailAlTitular({ negocio: "Don Pepe", titular: "Pepe", url: urlDelNegocio("don-pepe"), email: "pepe@ejemplo.com", clave });
  assert.ok(m.cuerpo.includes(clave) && m.cuerpo.includes("elijas una contraseña tuya") && !m.asunto.includes(clave));
  const base = { slug: "don-pepe", url: urlDelNegocio("don-pepe"), usuario: "pepe@ejemplo.com", negocioCreado: true, completado: [] };
  for (const estado of [{ tipo: "enviada" as const }, { tipo: "sin-cambios" as const }, { tipo: "pendiente" as const, motivo: "sin mail", archivo: "/x/don-pepe.clave" }]) {
    const out = lineasDeSalida({ ...base, clave: estado }).join("\n");
    assert.ok(!out.includes(clave));
    assert.match(out, /^slug: don-pepe/);
    assert.match(out, /contraseña: (enviada|sin cambios|pendiente de envío)/);
  }
});

test("guarda en disco: 0600, no pisa una clave pendiente, se borra", () => {
  const g = guardaEnDisco(join(mkdtempSync(join(tmpdir(), "factoque-")), "claves"));
  assert.equal(g.leer("x"), null);
  const ruta = g.guardar("x", "abc123");
  assert.equal(statSync(ruta).mode & 0o777, 0o600);
  assert.equal(g.leer("x"), "abc123");
  assert.throws(() => g.guardar("x", "otra"));
  g.borrar("x");
  assert.equal(g.leer("x"), null);
});
