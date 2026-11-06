import { test } from "node:test";
import assert from "node:assert/strict";
import {
  borradorVacio,
  explicarError,
  faltaEnComprador,
  faltaEnQue,
  leerRecientes,
  letraPrevista,
  pedidoDelBorrador,
  previa,
  sumarReciente,
  totalDelTexto,
  type Comprador,
} from "./facturador-core";
import { validarEmision } from "@/lib/facturita-core";
import { decidirComprobante } from "@/lib/fiscal/decidir-comprobante";

const CUIT_RI = "30111111118"; // verificador válido, inventado
type Identificado = Extract<Comprador, { tipo: "identificado" }>;
const ri = (condicion: "RESPONSABLE_INSCRIPTO" | "MONOTRIBUTO" | "EXENTO", domicilio = ""): Identificado => ({
  tipo: "identificado",
  docTipo: 80,
  docNro: CUIT_RI,
  nombre: "Kiosco Sur SRL",
  condicion,
  domicilio,
});

test("el total se lee como lo escribe una persona en Argentina", () => {
  assert.equal(totalDelTexto("25.000,50"), 25000.5);
  assert.equal(totalDelTexto("$ 25.000"), 25000);
  assert.equal(totalDelTexto("1500.5"), 1500.5);
  assert.equal(totalDelTexto("1.500"), 1500);
  assert.ok(Number.isNaN(totalDelTexto("")));
  assert.ok(Number.isNaN(totalDelTexto("doce")));
});

test("por defecto: consumidor final, productos, 21 %; el paso «A quién» ya está listo", () => {
  const b = borradorVacio();
  assert.equal(b.comprador.tipo, "consumidor-final");
  assert.equal(faltaEnComprador(b.comprador, "MONOTRIBUTO"), null);
  assert.match(faltaEnQue(b) ?? "", /qué vendiste/);
});

test("la letra prevista coincide con la decisión fiscal del Core (decidirComprobante)", () => {
  const casos: { emisor: string; c: Comprador }[] = [
    { emisor: "MONOTRIBUTO", c: { tipo: "consumidor-final" } },
    { emisor: "MONOTRIBUTO", c: ri("RESPONSABLE_INSCRIPTO") },
    { emisor: "RESPONSABLE_INSCRIPTO", c: { tipo: "consumidor-final" } },
    { emisor: "RESPONSABLE_INSCRIPTO", c: ri("RESPONSABLE_INSCRIPTO", "Av. Siempreviva 742") },
    { emisor: "RESPONSABLE_INSCRIPTO", c: ri("MONOTRIBUTO", "Av. Siempreviva 742") },
    { emisor: "RESPONSABLE_INSCRIPTO", c: ri("EXENTO") },
  ];
  for (const { emisor, c } of casos) {
    const receptor =
      c.tipo === "consumidor-final"
        ? { condicionIva: "CONSUMIDOR_FINAL", docTipo: 99, docNro: 0 }
        : { condicionIva: c.condicion, docTipo: c.docTipo, docNro: c.docNro };
    const d = decidirComprobante(
      { condicionIva: emisor, cuit: "20111111112", regimenFacturaA: "A" },
      receptor,
      { fecha: "20261106", fechaDeEnvio: "20261106", importeTotal: 1000, naturaleza: "productos" },
    );
    assert.equal(letraPrevista(emisor, c), d.comprobante?.letra ?? null, `${emisor} → ${JSON.stringify(c)}`);
  }
  assert.equal(letraPrevista(null, { tipo: "consumidor-final" }), null);
});

test("Factura A del inscripto: pide el domicilio antes de seguir", () => {
  assert.match(faltaEnComprador(ri("RESPONSABLE_INSCRIPTO"), "RESPONSABLE_INSCRIPTO") ?? "", /domicilio/);
  assert.equal(faltaEnComprador(ri("RESPONSABLE_INSCRIPTO", "Av. Siempreviva 742"), "RESPONSABLE_INSCRIPTO"), null);
  // El monotributista que le factura al mismo comprador emite C: no lo pide.
  assert.equal(faltaEnComprador(ri("RESPONSABLE_INSCRIPTO"), "MONOTRIBUTO"), null);
  assert.match(faltaEnComprador({ ...ri("EXENTO"), docNro: "30111111119" }, "MONOTRIBUTO") ?? "", /no es válido/);
});

test("el pedido armado pasa la MISMA validación del servidor", () => {
  const hoy = "20261106";
  const b = { ...borradorVacio(), descripcion: "Torta", total: "25.000" };
  const v = validarEmision(pedidoDelBorrador(b, "MONOTRIBUTO"), hoy, { condicionEmisor: "MONOTRIBUTO" });
  assert.ok(v.ok && v.receptor.condicionIva === "CONSUMIDOR_FINAL");

  const a = { ...b, comprador: ri("RESPONSABLE_INSCRIPTO", "Av. Siempreviva 742"), alicuota: "10.5" as const };
  const pedido = pedidoDelBorrador(a, "RESPONSABLE_INSCRIPTO");
  assert.equal(pedido.alicuota, "10.5");
  const va = validarEmision(pedido, hoy, { condicionEmisor: "RESPONSABLE_INSCRIPTO" });
  assert.ok(va.ok && va.receptor.docTipo === 80 && va.alicuotaId === 4);
  // El monotributista no manda alícuota.
  assert.equal(pedidoDelBorrador(a, "MONOTRIBUTO").alicuota, undefined);
});

test("la vista previa: el inscripto discrimina el IVA, la C no", () => {
  const b = { ...borradorVacio(), descripcion: "x", total: "12100" };
  const p = previa(b, "RESPONSABLE_INSCRIPTO");
  assert.ok(p);
  assert.equal(p.letra, "B");
  assert.equal(p.total, 12100);
  assert.equal(p.neto, 10000);
  assert.equal(p.iva, 2100);
  assert.ok(p.discrimina);
  const c = previa(b, "MONOTRIBUTO");
  assert.ok(c && c.letra === "C" && !c.discrimina && c.total === 12100);
  assert.equal(previa({ ...b, total: "" }, "MONOTRIBUTO"), null);
});

test("servicios: sin las tres fechas no se confirma", () => {
  const b = { ...borradorVacio(), concepto: "servicios" as const, descripcion: "Clase", total: "8000" };
  assert.match(faltaEnQue(b) ?? "", /tres fechas/);
  assert.equal(faltaEnQue({ ...b, desde: "2026-11-01", hasta: "2026-11-05", vencimiento: "2026-11-10" }), null);
  assert.match(faltaEnQue({ ...b, desde: "2026-11-05", hasta: "2026-11-01", vencimiento: "2026-11-10" }) ?? "", /antes de empezar/);
});

test("cada error dice qué tocar", () => {
  const rutas = { datosFiscales: "/admin/facturacion?vista=arca", comprobantes: "/admin/facturacion", plan: null };
  const datos = explicarError("Faltan los datos fiscales del negocio (CUIT y punto de venta).", rutas);
  assert.deepEqual(datos.accion, { tipo: "enlace", href: "/admin/facturacion?vista=arca", etiqueta: "Cargar los datos fiscales" });
  assert.deepEqual(explicarError("ARCA rechazó la factura: El CUIT informado no es válido", rutas).accion?.tipo, "paso");
  assert.equal((explicarError("Desde $10.000.000 ARCA exige identificar al comprador", rutas).accion as { paso: number }).paso, 1);
  assert.equal((explicarError("El vencimiento del pago no puede ser anterior a la fecha", rutas).accion as { paso: number }).paso, 2);
  assert.equal(explicarError("No se pudo emitir la factura. Probá de nuevo en unos minutos.", rutas).accion?.tipo, "reintentar");
  const cert = explicarError("ARCA no validó el token de acceso", rutas);
  assert.match(cert.texto, /certificado/);
  // Sin ruta para la salida, no se inventa un enlace.
  assert.equal(explicarError("Llegaste al tope de 5 facturas", rutas).accion, null);
});

test("los últimos compradores: sin repetir, hasta 5, y una lista rota no rompe", () => {
  let l = sumarReciente([], ri("MONOTRIBUTO"));
  l = sumarReciente(l, { ...ri("MONOTRIBUTO"), nombre: "Kiosco Sur" });
  assert.equal(l.length, 1);
  assert.equal(l[0].nombre, "Kiosco Sur");
  for (let i = 0; i < 7; i++) l = sumarReciente(l, { ...ri("EXENTO"), docTipo: 96, docNro: String(3000000 + i) });
  assert.equal(l.length, 5);
  assert.deepEqual(leerRecientes(JSON.stringify(l)), l);
  assert.deepEqual(leerRecientes("{no es json"), []);
  assert.deepEqual(leerRecientes(JSON.stringify([{ tipo: "identificado", docTipo: 1, docNro: "x", nombre: "y" }])), []);
  assert.deepEqual(sumarReciente(l, { tipo: "consumidor-final" }), l);
});
