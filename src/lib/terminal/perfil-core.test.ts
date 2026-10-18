// Perfil de terminal (plan T-1): los tres maestros, la validación de lo que llega del
// almacén, la clave por negocio y persona, y el ida y vuelta con un almacén en memoria.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PERFILES_BASE,
  TIPOS_DE_TERMINAL,
  TIPO_POR_DEFECTO,
  VERSION_DEL_PERFIL,
  claveDelPerfil,
  esDeFabrica,
  guardarPerfil,
  leerPerfil,
  pantallaQueSePuedeAbrir,
  perfilDeFabrica,
  perfilDeTexto,
  perfilDesdeAfuera,
  problemaDelPrefijo,
  textoDelPerfil,
  type AlmacenDelEquipo,
  type PerfilDeTerminal,
} from "./perfil-core";

function almacenEnMemoria(): AlmacenDelEquipo & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, String(v)),
  };
}

const guardado = (p: PerfilDeTerminal) => ({ v: VERSION_DEL_PERFIL, ...p });

test("los tres maestros existen, son válidos y están congelados", () => {
  assert.deepEqual(Object.keys(PERFILES_BASE).sort(), [...TIPOS_DE_TERMINAL].sort());
  for (const tipo of TIPOS_DE_TERMINAL) {
    const base = PERFILES_BASE[tipo];
    assert.equal(base.tipo, tipo);
    assert.deepEqual(perfilDesdeAfuera(guardado(perfilDeFabrica(tipo))), perfilDeFabrica(tipo), `${tipo} no pasa su propia validación`);
    assert.ok(Object.isFrozen(base) && Object.isFrozen(base.lector), `${tipo}: el maestro se puede tocar`);
  }
  assert.equal(PERFILES_BASE["kiosco-pc"].anchoTicket, 80);
  assert.equal(PERFILES_BASE["celular-mostrador"].anchoTicket, 58);
  assert.equal(PERFILES_BASE["celular-mostrador"].vibracion, true);
});

test("ajustar una copia de fábrica no toca el maestro (objeto maestro ≠ asignación)", () => {
  const copia = perfilDeFabrica("kiosco-pc");
  copia.anchoTicket = 58;
  copia.lector.prefijo = "*";
  assert.equal(PERFILES_BASE["kiosco-pc"].anchoTicket, 80);
  assert.equal(PERFILES_BASE["kiosco-pc"].lector.prefijo, "");
  assert.equal(esDeFabrica(copia), false);
  assert.equal(esDeFabrica(perfilDeFabrica("kiosco-pc")), true);
});

test("sin nada guardado, o con algo ilegible, el equipo es un celular de mostrador", () => {
  assert.equal(TIPO_POR_DEFECTO, "celular-mostrador");
  const a = almacenEnMemoria();
  const clave = claveDelPerfil("magra", "u-1");
  assert.deepEqual(leerPerfil(a, clave), perfilDeFabrica("celular-mostrador"));
  a.datos.set(clave, "{no es json");
  assert.deepEqual(leerPerfil(a, clave), perfilDeFabrica("celular-mostrador"));
  assert.deepEqual(leerPerfil(null, clave), perfilDeFabrica("celular-mostrador"));
  assert.deepEqual(perfilDeTexto(undefined), perfilDeFabrica("celular-mostrador"));
  const queTira: AlmacenDelEquipo = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("SecurityError");
    },
  };
  assert.deepEqual(leerPerfil(queTira, clave), perfilDeFabrica("celular-mostrador"));
  assert.equal(guardarPerfil(queTira, clave, perfilDeFabrica("kiosco-pc")), false);
});

test("perfilDesdeAfuera rechaza basura y versiones viejas", () => {
  const bueno = guardado(perfilDeFabrica("kiosco-pc"));
  for (const basura of [null, undefined, 42, "kiosco-pc", [], {}, { v: VERSION_DEL_PERFIL }]) {
    assert.equal(perfilDesdeAfuera(basura), null, `aceptó ${JSON.stringify(basura)}`);
  }
  // Versión vieja o sin versión: no se adivina la forma.
  assert.equal(perfilDesdeAfuera({ ...bueno, v: 0 }), null);
  assert.equal(perfilDesdeAfuera({ ...bueno, v: "1" }), null);
  const sinVersion: Record<string, unknown> = { ...bueno };
  delete sinVersion.v;
  assert.equal(perfilDesdeAfuera(sinVersion), null);
  // Cada campo fuera de su lista.
  assert.equal(perfilDesdeAfuera({ ...bueno, tipo: "heladera" }), null);
  assert.equal(perfilDesdeAfuera({ ...bueno, anchoTicket: 76 }), null);
  assert.equal(perfilDesdeAfuera({ ...bueno, anchoTicket: "80" }), null);
  assert.equal(perfilDesdeAfuera({ ...bueno, sonido: "si" }), null);
  assert.equal(perfilDesdeAfuera({ ...bueno, pantallaInicio: "/admin/usuarios" }), null);
  assert.equal(perfilDesdeAfuera({ ...bueno, pantallaInicio: "https://otro.com" }), null);
  assert.equal(perfilDesdeAfuera({ ...bueno, lector: null }), null);
  assert.equal(perfilDesdeAfuera({ ...bueno, lector: { prefijo: "*", sufijo: "espacio" } }), null);
  assert.equal(perfilDesdeAfuera({ ...bueno, lector: { prefijo: "123456789", sufijo: "enter" } }), null);
  // Lo que sobra no viaja: el perfil normalizado trae sólo sus campos.
  assert.deepEqual(perfilDesdeAfuera({ ...bueno, extra: "x" }), perfilDeFabrica("kiosco-pc"));
});

test("el prefijo del lector: hasta 8 caracteres, sin Enter ni Tab (STX y * sí)", () => {
  assert.equal(problemaDelPrefijo(""), null);
  assert.equal(problemaDelPrefijo("*"), null);
  assert.equal(problemaDelPrefijo("\u0002"), null);
  assert.equal(problemaDelPrefijo("]C1"), null);
  assert.match(problemaDelPrefijo("123456789") ?? "", /0 a 8/);
  assert.match(problemaDelPrefijo("*\n") ?? "", /Enter ni Tab/);
  assert.match(problemaDelPrefijo("\t") ?? "", /Enter ni Tab/);
  assert.notEqual(problemaDelPrefijo(7), null);
});

test("la clave lleva negocio y persona: dos personas en el mismo equipo no comparten perfil", () => {
  assert.equal(claveDelPerfil("magra", "u-1"), "gsg-terminal:magra:u-1:v1");
  assert.notEqual(claveDelPerfil("magra", "u-1"), claveDelPerfil("magra", "u-2"));
  // Mismo origen, dos negocios (sandbox /demo, FORCE_TENANT_SLUG): claves distintas.
  assert.notEqual(claveDelPerfil("magra", "u-1"), claveDelPerfil("shinevelas", "u-1"));
  // Un ":" adentro de una parte no puede fabricar la clave de otra combinación.
  assert.notEqual(claveDelPerfil("a:b", "c"), claveDelPerfil("a", "b:c"));
  // Sin negocio o sin persona no hay clave "de todos".
  assert.throws(() => claveDelPerfil("", "u-1"), RangeError);
  assert.throws(() => claveDelPerfil("magra", "  "), RangeError);

  const a = almacenEnMemoria();
  const kiosco = perfilDeFabrica("kiosco-pc");
  assert.equal(guardarPerfil(a, claveDelPerfil("magra", "u-1"), kiosco), true);
  assert.deepEqual(leerPerfil(a, claveDelPerfil("magra", "u-1")), kiosco);
  assert.deepEqual(leerPerfil(a, claveDelPerfil("magra", "u-2")), perfilDeFabrica("celular-mostrador"), "la otra persona heredó el perfil");
  assert.deepEqual(leerPerfil(a, claveDelPerfil("shinevelas", "u-1")), perfilDeFabrica("celular-mostrador"), "el otro negocio heredó el perfil");
});

test("ida y vuelta con un almacén en memoria, y lo inválido no se guarda", () => {
  const a = almacenEnMemoria();
  const clave = claveDelPerfil("adosmanos", "u-9");
  const ajustado: PerfilDeTerminal = { ...perfilDeFabrica("tablet-recepcion"), anchoTicket: 58, lector: { prefijo: "*", sufijo: "tab" } };
  assert.equal(guardarPerfil(a, clave, ajustado), true);
  assert.equal(a.datos.get(clave), textoDelPerfil(ajustado));
  assert.deepEqual(JSON.parse(a.datos.get(clave)!).v, VERSION_DEL_PERFIL);
  assert.deepEqual(leerPerfil(a, clave), ajustado);

  const roto = { ...ajustado, lector: { prefijo: "demasiado-largo", sufijo: "enter" as const } };
  assert.equal(guardarPerfil(a, clave, roto), false);
  assert.deepEqual(leerPerfil(a, clave), ajustado, "un guardado inválido pisó el bueno");
  assert.equal(guardarPerfil(null, clave, ajustado), false);
});

test("la pantalla de inicio nunca abre una puerta: si no está entre las permitidas, el Inicio", () => {
  const kiosco = perfilDeFabrica("kiosco-pc");
  assert.equal(pantallaQueSePuedeAbrir(kiosco, ["/admin", "/admin/caja-rapida"]), "/admin/caja-rapida");
  assert.equal(pantallaQueSePuedeAbrir(kiosco, ["/admin", "/admin/vender"]), "/admin");
  assert.equal(pantallaQueSePuedeAbrir(kiosco, []), "/admin");
});
