import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LARGO_MAXIMO,
  MAX_POR_REGISTRO,
  armarRegistros,
  leerBusqueda,
  rangosDeCodigo,
  type ClienteLeido,
  type PedidoLeido,
  type ProductoLeido,
} from "./registros-core";

const PERMISOS_TODO = { clientes: true, productos: true, pedidos: true, ventas: true, verPlata: true } as const;

const cli = (id: string, nombre: string, telefono = ""): ClienteLeido => ({ id, nombre, telefono });
const prod = (id: string, nombre: string, extra: Partial<ProductoLeido> = {}): ProductoLeido => ({
  id,
  nombre,
  activo: true,
  porPeso: false,
  precio: null,
  ...extra,
});
const ped = (id: string, codigo: number, extra: Partial<PedidoLeido> = {}): PedidoLeido => ({
  id,
  codigo,
  cliente: "",
  abierto: true,
  anulado: false,
  dia: "2026-09-20",
  total: 0,
  ...extra,
});

// ── La entrada ───────────────────────────────────────────────────────────────

test("la búsqueda se recorta y exige de 2 a 60 letras; lo que no es texto no se busca", () => {
  assert.deepEqual(leerBusqueda("  ana  "), { ok: true, texto: "ana", digitos: null, codigo: null });
  assert.deepEqual(leerBusqueda("ana   maría"), { ok: true, texto: "ana maría", digitos: null, codigo: null });
  const corta = leerBusqueda(" a ");
  assert.equal(corta.ok, false);
  assert.match(!corta.ok ? corta.mensaje : "", /al menos 2/);
  const larga = leerBusqueda("x".repeat(LARGO_MAXIMO + 1));
  assert.equal(larga.ok, false);
  assert.match(!larga.ok ? larga.mensaje : "", /hasta 60/);
  assert.equal(leerBusqueda("x".repeat(LARGO_MAXIMO)).ok, true);
  for (const raro of [undefined, null, 42, { q: "ana" }, ["ana"]]) assert.equal(leerBusqueda(raro).ok, false);
});

test("los mensajes de una búsqueda inválida no nombran tablas, campos ni tipos", () => {
  for (const q of ["", "a", "x".repeat(200), 7]) {
    const r = leerBusqueda(q);
    assert.equal(r.ok, false);
    if (!r.ok) assert.doesNotMatch(r.mensaje, /string|prisma|tabla|campo|null|undefined|client|order|product/i);
  }
});

test("un número (con # o separadores) se lee como número de pedido y como teléfono", () => {
  assert.deepEqual(leerBusqueda("#47"), { ok: true, texto: "#47", digitos: "47", codigo: 47 });
  assert.deepEqual(leerBusqueda("47"), { ok: true, texto: "47", digitos: "47", codigo: 47 });
  assert.deepEqual(leerBusqueda("11 5555-2271"), { ok: true, texto: "11 5555-2271", digitos: "1155552271", codigo: null });
  // Un número que no entra en el correlativo no es un pedido, pero sí puede ser un teléfono.
  assert.deepEqual(leerBusqueda("99999999999"), { ok: true, texto: "99999999999", digitos: "99999999999", codigo: null });
  const mezcla = leerBusqueda("ana 12");
  assert.ok(mezcla.ok && mezcla.digitos === null && mezcla.codigo === null);
});

test("el número de pedido «47» cubre el 47 y los que empiezan con 47 (470-479, 4700-4799…), sin pasarse del tope", () => {
  const r = rangosDeCodigo(47, 99_999);
  assert.deepEqual(r, [
    { gte: 47, lte: 47 },
    { gte: 470, lte: 479 },
    { gte: 4700, lte: 4799 },
    { gte: 47000, lte: 47999 },
  ]);
  assert.deepEqual(rangosDeCodigo(0, 1000), [{ gte: 0, lte: 0 }], "el cero no es prefijo de nada");
  assert.ok(rangosDeCodigo(1).every((x) => x.lte <= 2_147_483_647));
});

// ── El armado ────────────────────────────────────────────────────────────────

test("tres grupos en orden fijo: clientes, productos, pedidos; como mucho 5 por grupo", () => {
  const b = leerBusqueda("ma");
  assert.ok(b.ok);
  const r = armarRegistros(
    {
      clientes: Array.from({ length: 9 }, (_, i) => cli(`c${i}`, `María ${i}`)),
      productos: Array.from({ length: 7 }, (_, i) => prod(`p${i}`, `Matambre ${i}`)),
      pedidos: [],
    },
    b,
    PERMISOS_TODO,
  );
  assert.deepEqual(r.map((g) => g.grupo), ["clientes", "productos"]);
  assert.deepEqual(r.map((g) => g.nombre), ["Clientes", "Productos"]);
  assert.ok(r.every((g) => g.items.length === MAX_POR_REGISTRO));
});

test("clientes: primero los que empiezan con lo tipeado, después palabra que empieza, después contiene; sin tildes", () => {
  const b = leerBusqueda("rodri");
  assert.ok(b.ok);
  const [g] = armarRegistros(
    {
      clientes: [cli("1", "Ana Rodríguez", "11 1111-1111"), cli("2", "Carla Barrodrigo"), cli("3", "Rodrigo Paz", "11 2222-2222")],
      productos: [],
      pedidos: [],
    },
    b,
    PERMISOS_TODO,
  );
  assert.deepEqual(g.items.map((c) => c.id), ["cliente-3", "cliente-1", "cliente-2"]);
  assert.equal(g.items[0].href, "/admin/clientes/3");
  assert.equal(g.items[0].segunda, "11 2222-2222");
  assert.equal(g.items[2].segunda, "Sin teléfono");
});

test("clientes encontrados por el teléfono van después de los encontrados por el nombre", () => {
  const b = leerBusqueda("2271");
  assert.ok(b.ok);
  const [g] = armarRegistros(
    { clientes: [cli("t", "Beatriz Luna", "11 5555-2271"), cli("n", "Local 2271")], productos: [], pedidos: [] },
    b,
    PERMISOS_TODO,
  );
  assert.deepEqual(g.items.map((c) => c.id), ["cliente-n", "cliente-t"]);
});

test("productos: activos antes que pausados; el precio sólo para quien ve plata", () => {
  const b = leerBusqueda("vac");
  assert.ok(b.ok);
  const leidos = {
    clientes: [],
    productos: [prod("x", "Vacío pausado", { activo: false, precio: 9000 }), prod("v", "Vacío", { porPeso: true, precio: 12500.5 })],
    pedidos: [],
  };
  const [conPlata] = armarRegistros(leidos, b, PERMISOS_TODO);
  assert.deepEqual(conPlata.items.map((p) => p.id), ["producto-v", "producto-x"]);
  assert.equal(conPlata.items[0].href, "/admin/catalogo?editar=v");
  assert.match(conPlata.items[0].segunda ?? "", /^Por kilo · \$\s?12\.500,50 el kilo$/);
  assert.match(conPlata.items[1].segunda ?? "", /^Pausado · /);
  const [sinPlata] = armarRegistros(leidos, b, { ...PERMISOS_TODO, verPlata: false });
  assert.equal(sinPlata.items[0].segunda, "Por kilo");
  assert.doesNotMatch(sinPlata.items.map((p) => p.segunda).join(" "), /\$/);
});

test("pedidos: el número exacto primero y después los más nuevos; abierto al tablero, cerrado a las ventas de ese día", () => {
  const b = leerBusqueda("#12");
  assert.ok(b.ok);
  const [g] = armarRegistros(
    {
      clientes: [],
      productos: [],
      pedidos: [
        ped("a", 120, { cliente: "Juan Pérez", total: 1500 }),
        ped("b", 12, { abierto: false, dia: "2026-09-01", total: 800 }),
        ped("c", 1299, { abierto: false, anulado: true }),
      ],
    },
    b,
    PERMISOS_TODO,
  );
  assert.deepEqual(g.items.map((p) => p.nombre), ["Pedido #12", "Pedido #1299", "Pedido #120"]);
  assert.equal(g.items[0].href, "/admin/ventas?dia=2026-09-01");
  assert.equal(g.items[2].href, "/admin/pedidos?pedido=a");
  assert.match(g.items[2].segunda ?? "", /^Abierto · Juan Pérez · \$/);
  assert.match(g.items[1].segunda ?? "", /^Anulado/);
});

test("pedidos sin permiso de ver plata: sin montos y, cerrados, a las ventas de hoy (otro día no lo pueden abrir)", () => {
  const b = leerBusqueda("12");
  assert.ok(b.ok);
  const [g] = armarRegistros(
    { clientes: [], productos: [], pedidos: [ped("b", 12, { abierto: false, total: 800 }), ped("a", 120, { total: 10 })] },
    b,
    { ...PERMISOS_TODO, verPlata: false },
  );
  assert.equal(g.items[0].href, "/admin/ventas");
  assert.doesNotMatch(g.items.map((p) => p.segunda).join(" "), /\$/);
});

test("un pedido cerrado sin la app Ventas del día va a la bandeja de pedidos; sin ninguna de las dos no se muestra", () => {
  const b = leerBusqueda("12");
  assert.ok(b.ok);
  const leidos = { clientes: [], productos: [], pedidos: [ped("b", 12, { abierto: false })] };
  const [g] = armarRegistros(leidos, b, { ...PERMISOS_TODO, ventas: false });
  assert.equal(g.items[0].href, "/admin/pedidos");
  assert.deepEqual(armarRegistros(leidos, b, { ...PERMISOS_TODO, ventas: false, pedidos: false }), []);
});

test("SEGURIDAD: un grupo sin permiso no se dibuja aunque le lleguen filas", () => {
  const b = leerBusqueda("ana");
  assert.ok(b.ok);
  const r = armarRegistros(
    { clientes: [cli("1", "Ana")], productos: [prod("p", "Anana")], pedidos: [] },
    b,
    { clientes: false, productos: false, pedidos: false, ventas: false, verPlata: false },
  );
  assert.deepEqual(r, []);
});

test("los ids son únicos entre grupos (un cliente y un producto con el mismo id no chocan en la lista)", () => {
  const b = leerBusqueda("ana");
  assert.ok(b.ok);
  const r = armarRegistros({ clientes: [cli("1", "Ana")], productos: [prod("1", "Anana")], pedidos: [] }, b, PERMISOS_TODO);
  const ids = r.flatMap((g) => g.items.map((i) => i.id));
  assert.equal(new Set(ids).size, ids.length);
});
