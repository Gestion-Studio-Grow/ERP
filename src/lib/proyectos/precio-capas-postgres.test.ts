// ============================================================================
// MIA T1 contra Postgres (base efímera, src/test/base-efimera.ts), con la app como `app_rls` igual que producción:
//   · interruptor de la Etapa 2 apagado: nada se guarda ni se importa;
//   · la fórmula se prende por negocio: B sigue sin fórmula aunque A la prenda;
//   · precio final: el tope se valida con el costo recalculado en el servidor; persona o proyecto de otro negocio, no;
//   · la fecha «a confirmar» se guarda como texto con la fecha vacía;
//   · importador: previsualizar no escribe; sin confirmación o con otro archivo, nada; confirmar dos veces (o dos a la vez)
//     no duplica; todo cae en el negocio de la sesión; B no ve lo de A;
//   · sin las tablas (Gate 2), la ficha y los datos siguen andando y lo nuevo lo dice.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

test("MIA T1: fórmula por negocio, precio final con tope, fecha a confirmar e importador aislado e idempotente", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const { guardarFormulaPrecio, guardarVentaProyecto } = await import("./acciones-precio");
  const { previsualizarImportacion, confirmarImportacion } = await import("./acciones-importar");
  const { guardarDatos } = await import("./acciones-ficha");
  const { formulaDelNegocio, ventaDelProyecto, precioCapasDelProyecto } = await import("./precio-capas.server");

  const enA = { negocio: a, usuario: { id: a.duenia.id } };
  const enB = { negocio: b, usuario: { id: b.duenia.id } };
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const correr = async <R>(pedido: typeof enA, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion(pedido, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };

  const personaA = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: "Ana Pérez", rol: "PRODUCCION" }, select: { id: true } });
  const personaB = await duenio.proyectoPersona.create({ data: { tenantId: b.id, userId: b.recepcion.id, nombre: "Ana Pérez", rol: "PRODUCCION" }, select: { id: true } });
  // Un proyecto de A con $ 1.000.000 de costo: 2 × $ 400.000 + 1 × $ 200.000.
  const proyecto = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 1, clientId: a.clientes[0], nombre: "Stand Expo", servicio: "ARQUITECTURA" }, select: { id: true } });
  const version = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: proyecto.id, version: 1, token: "tok-mia-1" }, select: { id: true } });
  await duenio.proyectoItem.createMany({
    data: [
      { tenantId: a.id, presupuestoId: version.id, rubro: "Escenografía y stands", descripcion: "Estructura", cantidad: 2, costo: 400_000 },
      { tenantId: a.id, presupuestoId: version.id, rubro: "Mobiliario", descripcion: "Muebles", cantidad: 1, costo: 200_000 },
    ],
  });

  // ── 0) Interruptor de la Etapa 2 apagado (por defecto): nada de MIA T1, aunque se intente guardar la fórmula ──
  const apagada = await correr(enA, () => formulaDelNegocio(a.id));
  assert.equal(apagada.encendida, false);
  assert.equal(apagada.vigente, null);
  const formMia = form({ rentabilidadBp: "30", comisionProductorBp: "10", comisionComercialBp: "10", margenErrorBp: "5", impuestosBp: "7", topeRedondeoBp: "5", ahorroEmpresaBp: "75", activa: "on" });
  assert.deepEqual(await correr(enA, () => guardarFormulaPrecio(formMia)), { ok: false, error: "El precio por capas y las comisiones no están activados para tu negocio. Pedile a GSG que los active." });
  assert.equal(await duenio.proyectoPrecioConfig.count({ where: { tenantId: a.id } }), 0);
  assert.equal((await correr(enA, () => previsualizarImportacion(form({ csv: "Cliente;Proyecto\nAcme;Stand" })))).ok, false);
  await duenio.tenant.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { modules: { push: "proyectos-precio-capas" } } });

  // ── 1) Sin fila: nadie usa la fórmula (los negocios de hoy no cambian) ──
  assert.equal((await correr(enA, () => formulaDelNegocio(a.id))).vigente, null);
  assert.deepEqual(await correr(enA, () => guardarVentaProyecto(form({ proyectoId: proyecto.id, precioFinal: "1" }))), { ok: false, error: "Este negocio no usa la fórmula de precio por capas. Se prende en Configuración." });

  // ── 2) A prende la fórmula de MIA; B no ──
  const mia = { rentabilidadBp: "30", comisionProductorBp: "10", comisionComercialBp: "10", margenErrorBp: "5", impuestosBp: "7", topeRedondeoBp: "5", ahorroEmpresaBp: "75" };
  assert.equal((await correr(enA, () => guardarFormulaPrecio(form({ ...mia, impuestosBp: "60", activa: "on" })))).ok, false, "60 % de impuestos se rechaza");
  assert.equal((await correr(enA, () => guardarFormulaPrecio(form({ ...mia, margenErrorBp: "5,555", activa: "on" })))).ok, false);
  assert.deepEqual(await correr(enA, () => guardarFormulaPrecio(form({ ...mia, activa: "on" }))), { ok: true });
  assert.equal((await correr(enA, () => formulaDelNegocio(a.id))).vigente?.impuestosBp, 700);
  assert.equal((await correr(enB, () => formulaDelNegocio(b.id))).vigente, null, "la fórmula de A no prende la de B");
  assert.equal(await duenio.proyectoPrecioConfig.count({ where: { tenantId: b.id } }), 0);

  // ── 3) Precio final con tope: sugerido $ 1.535.483,87; el 5 % deja moverse $ 76.774,19 ──
  const precio = async (pedido: typeof enA, campos: Record<string, string>) => correr(pedido, () => guardarVentaProyecto(form({ proyectoId: proyecto.id, ...campos })));
  const fuera = await precio(enA, { precioFinal: "1.612.258,07" });
  assert.equal(fuera.ok, false, "un centavo arriba del tope");
  assert.match((fuera as { error: string }).error, /entre \$\s1\.458\.709,68 y \$\s1\.612\.258,06/);
  assert.equal((await precio(enA, { precioFinal: "1.458.709,67" })).ok, false, "un centavo abajo del tope");
  assert.equal((await precio(enA, { precioFinal: "1.500.000,999" })).ok, false, "tres decimales no");
  assert.equal(await duenio.proyectoVenta.count(), 0, "nada rechazado se escribió");
  assert.deepEqual(await precio(enA, { precioFinal: "1.612.258,06", productorId: personaA.id }), { ok: true });
  let venta = await duenio.proyectoVenta.findFirst({ where: { proyectoId: proyecto.id } });
  assert.equal(venta?.precioFinalCent, BigInt(161_225_806));
  assert.equal(venta?.tenantId, a.id);
  assert.equal(venta?.productorId, personaA.id);
  // Dos guardados a la vez: una sola fila.
  const dos = await Promise.all([precio(enA, { precioFinal: "1.550.000" }), precio(enA, { precioFinal: "1.550.000" })]);
  assert.ok(dos.every((r) => r.ok), JSON.stringify(dos));
  assert.equal(await duenio.proyectoVenta.count({ where: { proyectoId: proyecto.id } }), 1);
  assert.ok(await duenio.proyectoCambio.count({ where: { tenantId: a.id, entidad: "ProyectoVenta", campo: "Precio final" } }) >= 2, "queda en el historial");

  // Persona de otro negocio, proyecto de otro negocio.
  assert.deepEqual(await precio(enA, { productorId: personaB.id }), { ok: false, error: "El productor elegido no está en el equipo." });
  assert.deepEqual(await precio(enA, { comercialId: personaB.id }), { ok: false, error: "El comercial elegido no está en el equipo." });
  assert.deepEqual(await correr(enB, () => guardarFormulaPrecio(form({ ...mia, activa: "on" }))), { ok: true });
  assert.deepEqual(await precio(enB, { precioFinal: "1.550.000", productorId: personaB.id }), { ok: false, error: "Ese proyecto no existe." });
  venta = await duenio.proyectoVenta.findFirst({ where: { proyectoId: proyecto.id } });
  assert.equal(venta?.productorId, null, "el último guardado de A dejó sin productor; B no tocó nada");
  assert.equal(venta?.precioFinalCent, BigInt(155_000_000));
  assert.equal((await correr(enB, () => ventaDelProyecto(b.id, proyecto.id))).precioFinalCent, null, "B no lee la venta de A (RLS)");
  assert.equal((await correr(enB, () => ventaDelProyecto(a.id, proyecto.id))).precioFinalCent, null, "ni pidiéndola con el id de A");

  // La pestaña: desglose, comisiones y reparto del ahorro.
  await precio(enA, { precioFinal: "1.550.000", productorId: personaA.id });
  const sinAprobar = await correr(enA, () => precioCapasDelProyecto(a.id, proyecto.id, 1_000_000, {}));
  assert.equal(sinAprobar?.desglose.sugerido, 153_548_387);
  assert.equal(sinAprobar?.precio.redondeo, 155_000_000 - 153_548_387);
  assert.equal(sinAprobar?.comisionesSobre, "vigente");
  assert.equal(sinAprobar?.reparto.ahorro, null);
  await duenio.proyectoPresupuesto.update({ where: { id: version.id }, data: { estado: "APROBADO" } });
  await duenio.proyectoGasto.create({ data: { tenantId: a.id, proyectoId: proyecto.id, rubro: "Mobiliario", descripcion: "Muebles", neto: 920_000, iva: 0 } });
  const cerrado = await correr(enA, () => precioCapasDelProyecto(a.id, proyecto.id, 1_000_000, {}));
  assert.equal(cerrado?.comisionesSobre, "aprobada");
  assert.deepEqual(cerrado?.reparto, { ahorro: 8_000_000, empresa: 6_000_000, productor: 2_000_000 });
  assert.deepEqual(cerrado?.comisiones.map((c) => [c.rol, c.personaId, c.total]), [["productor", personaA.id, 3_000_000 + 2_000_000], ["comercial", null, 3_000_000]]);

  // ── 4) Fecha del evento «a confirmar» ──
  const datos = (campos: Record<string, string>) => correr(enA, () => guardarDatos(form({ id: proyecto.id, nombre: "Stand Expo", moneda: "ARS", ...campos })));
  assert.deepEqual(await datos({ fechaEvento: "", fechaEventoTexto: "  primeros días   de diciembre " }), { ok: true });
  assert.equal((await duenio.proyecto.findUnique({ where: { id: proyecto.id } }))?.fechaEvento, null);
  assert.equal((await duenio.proyectoVenta.findFirst({ where: { proyectoId: proyecto.id } }))?.fechaEventoTexto, "primeros días de diciembre");
  assert.deepEqual(await datos({ fechaEvento: "2026-12-04", fechaEventoTexto: "a confirmar" }), { ok: true });
  assert.equal((await duenio.proyectoVenta.findFirst({ where: { proyectoId: proyecto.id } }))?.fechaEventoTexto, null, "con fecha exacta, el texto sobra");
  assert.equal((await duenio.proyectoVenta.findFirst({ where: { proyectoId: proyecto.id } }))?.precioFinalCent, BigInt(155_000_000), "la fecha no pisa el precio");

  // ── 5) Importador ──
  const csv = [
    "Cliente;Proyecto;Productor;Comercial;Status;Fecha del evento",
    "Nuevo Cliente SA;Stand Agro;Ana Pérez;;Cotizando;a confirmar",
    "nuevo cliente sa;STAND AGRO;;;Presentado;",
    "Cliente A1;Stand Expo;;;;", // se reemplaza por el nombre real del cliente de A: ya existe en A
    "Otra;Lanzamiento;Nadie;;No aprobado;12/11/2026",
  ].join("\n");
  const clienteA = await duenio.client.findUnique({ where: { id: a.clientes[0] }, select: { name: true } });
  const csvA = csv.replace("Cliente A1", clienteA!.name);
  const proyectosAntes = await duenio.proyecto.count({ where: { tenantId: a.id } });
  const previa = await correr(enA, () => previsualizarImportacion(form({ csv: csvA })));
  assert.equal(previa.ok, true, JSON.stringify(previa));
  const p = previa as Extract<typeof previa, { ok: true }>;
  assert.deepEqual(p.resumen, { nueva: 2, repetida: 1, existe: 1, error: 0 });
  assert.equal(await duenio.proyecto.count({ where: { tenantId: a.id } }), proyectosAntes, "previsualizar no escribe");

  const confirmar = (pedido: typeof enA, campos: Record<string, string>) => correr(pedido, () => confirmarImportacion(form(campos)));
  assert.deepEqual(await confirmar(enA, { csv: csvA, huella: p.huella }), { ok: false, error: "Falta confirmar la importación." });
  assert.equal((await confirmar(enA, { csv: csvA + "\nX;Y", huella: p.huella, confirmo: "si" })).ok, false, "otro archivo que el previsualizado");
  assert.equal(await duenio.proyecto.count({ where: { tenantId: a.id } }), proyectosAntes, "sin confirmación válida no se escribe nada");

  // Dos confirmaciones a la vez (doble clic): entran dos proyectos, no cuatro.
  const juntas = await Promise.all([confirmar(enA, { csv: csvA, huella: p.huella, confirmo: "si" }), confirmar(enA, { csv: csvA, huella: p.huella, confirmo: "si" })]);
  assert.ok(juntas.every((r) => r.ok), JSON.stringify(juntas));
  assert.deepEqual(juntas.map((r) => (r as { creados: number }).creados).sort(), [0, 2]);
  assert.equal(await duenio.proyecto.count({ where: { tenantId: a.id } }), proyectosAntes + 2);
  assert.deepEqual(await confirmar(enA, { csv: csvA, huella: p.huella, confirmo: "si" }), { ok: true, creados: 0, salteados: 4 }, "la tercera vez todo ya existe");

  const agro = await duenio.proyecto.findFirst({ where: { tenantId: a.id, nombre: "Stand Agro" }, include: { client: true, venta: true, equipo: true } });
  assert.equal(agro?.client.tenantId, a.id);
  assert.equal(agro?.etapa, "PRESUPUESTO");
  assert.equal(agro?.fechaEvento, null);
  assert.equal(agro?.venta?.fechaEventoTexto, "a confirmar");
  assert.equal(agro?.venta?.productorId, personaA.id);
  assert.deepEqual(agro?.equipo.map((e) => [e.personaId, e.funcion]), [[personaA.id, "Productor"]]);
  const lanz = await duenio.proyecto.findFirst({ where: { tenantId: a.id, nombre: "Lanzamiento" }, include: { venta: true } });
  assert.ok(lanz?.perdidoEl);
  assert.match(lanz?.motivoPerdida ?? "", /^Otro — /);
  assert.equal(lanz?.fechaEvento?.toISOString().slice(0, 10), "2026-11-12");
  assert.equal(lanz?.venta?.productorId, null);
  const numeros = (await duenio.proyecto.findMany({ where: { tenantId: a.id }, select: { numero: true } })).map((x) => x.numero).sort((x, y) => x - y);
  assert.deepEqual(numeros, [1, 2, 3], "números correlativos sin saltos ni choques");

  // B importa la misma planilla: no ve lo de A, crea lo suyo en B y no asigna personas de A.
  const previaB = await correr(enB, () => previsualizarImportacion(form({ csv: csvA })));
  assert.equal(previaB.ok, true);
  const pb = previaB as Extract<typeof previaB, { ok: true }>;
  assert.equal(pb.resumen.existe, 0, "los proyectos de A no cuentan como existentes en B");
  assert.deepEqual(await confirmar(enB, { csv: csvA, huella: pb.huella, confirmo: "si" }), { ok: true, creados: 3, salteados: 1 });
  const agroB = await duenio.proyecto.findFirst({ where: { tenantId: b.id, nombre: "Stand Agro" }, include: { client: true, venta: true } });
  assert.equal(agroB?.client.tenantId, b.id);
  assert.equal(agroB?.venta?.productorId, personaB.id, "en B, «Ana Pérez» es la de B");
  assert.equal(await duenio.proyecto.count({ where: { tenantId: a.id } }), proyectosAntes + 2, "A no cambió");
  assert.equal(await duenio.client.count({ where: { tenantId: a.id, name: "Nuevo Cliente SA" } }), 1);
  assert.equal(await duenio.client.count({ where: { tenantId: b.id, name: "Nuevo Cliente SA" } }), 1);

  // ── 6) Sin las tablas (migración sin aplicar): nada se rompe y lo nuevo lo dice ──
  await duenio.$executeRawUnsafe(`DROP TABLE "ProyectoVenta"`);
  await duenio.$executeRawUnsafe(`DROP TABLE "ProyectoPrecioConfig"`);
  const sinTabla = await correr(enA, () => formulaDelNegocio(a.id));
  assert.equal(sinTabla.disponible, false);
  assert.equal(sinTabla.vigente, null);
  assert.equal((await correr(enA, () => ventaDelProyecto(a.id, proyecto.id))).disponible, false);
  assert.equal(await correr(enA, () => precioCapasDelProyecto(a.id, proyecto.id, 1_000_000, {})), null);
  assert.deepEqual(await datos({ fechaEvento: "", nombre: "Stand Expo 2" }), { ok: true }, "guardar los datos sigue andando");
  assert.equal((await duenio.proyecto.findUnique({ where: { id: proyecto.id } }))?.nombre, "Stand Expo 2");
  assert.match(JSON.stringify(await correr(enA, () => previsualizarImportacion(form({ csv: csvA })))), /falta actualizar la base/);
  assert.match(JSON.stringify(await correr(enA, () => guardarFormulaPrecio(form({ ...mia, activa: "on" })))), /falta actualizar la base/);
  assert.match(JSON.stringify(await precio(enA, { precioFinal: "1.550.000" })), /falta actualizar la base/);
});
