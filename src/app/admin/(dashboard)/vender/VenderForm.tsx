"use client";

// VENDER — el mostrador en su propia pantalla.
//
// Es el POS de la bandeja (pedidos/PosForm.tsx) con lo que el local no podía hacer: dar el
// vuelto, hacer un descuento, vender algo sin precio cargado, dejar la venta en la ficha del
// cliente, llegar en un toque a lo que más se vende y darle el ticket. La regla de diseño es
// que NADA de eso agrega un paso al camino feliz: Vacío, 1,240, Efectivo, Cobrar sigue siendo
// lo mismo. Cliente, descuento y precio a mano están cerrados hasta que alguien los abre; el
// vuelto aparece solo cuando el medio es efectivo.
//
// Lo que se mantiene del PosForm, con el mismo porqué (ver los comentarios de allá):
//   · la cantidad se TIPEA como texto y se lee con `leerCantidad` (coma y punto valen igual);
//   · el medio arranca vacío siempre: nunca efectivo por default;
//   · la clave de idempotencia es una por ticket y se renueva recién cuando el ticket se limpia;
//   · los rechazos del servidor llegan DEVUELTOS (no lanzados) y se muestran enteros.
//
// En el celular el total y el botón de cobrar quedan FIJOS abajo (se ve cuánto es y se cobra sin
// bajar hasta el final), y lo que no salió se dice AHÍ, al lado del botón, hasta que se resuelva:
// antes era un aviso de 4 segundos que en el celular tapaba justo el botón y se iba. Sin señal a
// mitad del cobro, el botón pasa a «Reintentar cobro» con la MISMA venta (cobro-sin-conexion.ts).
// Lo mismo si el servidor no contesta en TIEMPO_MAXIMO_DEL_COBRO_MS o falla por algo que no es un
// rechazo de negocio. Esa duda queda guardada en la pestaña (sessionStorage, por negocio): si se
// recarga o se vuelve a Vender, reaparece con lo cargado y la misma clave. Y si el servidor
// contesta que esa clave ya estaba grabada con OTRA cosa («ya-grabada-distinta»), se dice cuál
// quedó y qué no se registró, y se ofrece cobrar sólo lo que falta como otra venta.
//
// Todas las reglas de plata (descuento, tope, vuelto, precio a mano) son las de
// reglas-venta.ts, las MISMAS que aplica el servidor: la pantalla avisa y el servidor decide.
// Sin imports de valor de Prisma: esto es un client component.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { createOrder, buscarClienteParaVenta } from "@/lib/order-actions";
import { AvisoError, BuscadorCombo, Input, Select, buttonClasses, cn, fmtMoneyARS, type OpcionBuscador } from "@/components/ui";
import { Atajos } from "@/components/ui/Renglon";
import { Kbd } from "@/components/ui/Kbd";
import { Plata } from "@/components/ui/Plata";
import { useDiseno } from "@/lib/diseno/DisenoProvider";
import { faltanteDeLinea, type PosStockInfo } from "@/lib/stock/pos-stock-rules";
import { MEDIOS_DE_COBRO, leerMedioDeCobro, type MedioDeCobro } from "@/lib/caja/medio-cobro";
import type { VentaYaGrabada } from "@/lib/reintento-de-venta";
import {
  leerCantidad,
  cantidadParaFormulario,
  avisoDeCantidad,
  formatearCantidad,
  importeOCero,
  importeParaFormulario,
  leerImporte,
} from "@/lib/pos-peso";
import { textoDelFaltante, type Faltante } from "@/lib/reintento-de-venta";
import { round2 } from "@/lib/round";
import TicketVenta from "./TicketVenta";
import FacturarVenta from "../ventas/FacturarVenta";
import { SIN_FACTURA } from "../ventas/factura";
import { useCuponDePedido } from "@/app/tienda/pedido-online";
import {
  aplicarDescuento,
  calcularVuelto,
  controlarPrecioAMano,
  descuentoDelFormulario,
  lineaSinCantidad as primeraLineaSinCantidad,
  motivoDeLineaSinCantidad,
  validarLineaAMano,
  type ResultadoDescuento,
  type TipoDescuento,
  type TopePrecioAMano,
  type VentaTicket,
} from "./reglas-venta";
import {
  almacenDeSesion,
  antesDeCobrar,
  avisoDelCobro,
  avisoDeYaGrabada,
  borrarCobroSinConfirmar,
  cambioDespuesDelCorte,
  claveParaCobrar,
  conTiempoMaximo,
  avisoAntesDeEmpezarDeNuevo,
  avisoDeDudaDeOtraPersona,
  avisoDeDudaIlegible,
  avisoDeGrabadaAhoraPorOtroTotal,
  cuandoDelEnvio,
  ETIQUETA_DEJARLA_ASI,
  ETIQUETA_VOLVER_A_CONSULTAR,
  etiquetaDeCobrarAparte,
  etiquetaDeOtraVenta,
  etiquetaDeReintento,
  etiquetaDeVerGrabada,
  firmaDelCobro,
  guardarCobroSinConfirmar,
  leerCobroSinConfirmar,
  recordarEnvioSinRespuesta,
  renovarClaveTrasRechazo,
  TIEMPO_MAXIMO_DEL_COBRO_MS,
  type CargadoDelCobro,
  type EnvioSinRespuesta,
} from "./cobro-sin-conexion";

type SellableProduct = {
  id: string;
  name: string;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  unit: string;
};

/** Una línea del ticket: el producto y lo TIPEADO (texto, no número: ver PosForm). */
type Line = { key: number; productId: string; qtyText: string };
/** Una línea con precio a mano: nombre, importe tipeado y motivo. */
type LineaManual = { key: number; nombre: string; importeText: string; motivo: string };

function nuevaClaveDeTicket(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function precioDe(p: SellableProduct): number {
  return (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;
}

// El redirect de sesión vencida llega como excepción con digest NEXT_REDIRECT: tragarlo
// dejaría a la persona sin login (el mismo helper que PosForm y los formularios de la bandeja).
function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function CobrarSubmit({ disabled, label, pendiente, atajo }: { disabled: boolean; label: string; pendiente: string; atajo?: string }) {
  const { pending } = useFormStatus();
  // Sin `atajo` (la vista de siempre), el botón de siempre, byte a byte. Con `atajo` (el ticket del
  // diseño nuevo), marcado para la piel y con la tecla a la vista en la PC.
  if (!atajo) {
    return (
      <button
        type="submit"
        disabled={disabled || pending}
        className={buttonClasses("solid", "lg", "w-full sm:w-auto disabled:opacity-50")}
      >
        {pending ? pendiente : label}
      </button>
    );
  }
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      data-ui="button"
      data-variant="solid"
      data-size="lg"
      data-estado={pending ? "cargando" : undefined}
      aria-keyshortcuts={atajo}
      className={buttonClasses("solid", "lg", "w-full")}
    >
      {pending ? pendiente : label}
      <Kbd enBoton>{atajo}</Kbd>
    </button>
  );
}

/** Lo que no salió en el último intento de cobro. El texto se arma al mostrarlo (según la señal de AHORA). */
// Lo que se mandó sin respuesta (su firma y su total) NO va acá: se guarda aparte, porque el
// intento siguiente pisa la falla y la duda sigue (cobro-sin-conexion.ts, "Lo que se mandó y no
// tuvo respuesta").
type Falla = { tipo: "sin-senal" } | { tipo: "red" } | { tipo: "rechazo"; error: string };

type PropsDeVender = {
  products: SellableProduct[];
  stockById: Record<string, PosStockInfo>;
  /** Ids de los más vendidos (hasta 8), ya filtrados a lo que hoy se puede vender. */
  rapidos: string[];
  /** Rótulo de las teclas en el diseño nuevo («Tus productos» mientras se completan con el catálogo). */
  rotuloRapidos?: string;
  /** Nombre del negocio para el encabezado del ticket. */
  negocio: string;
  /** Tope de descuento de quien vende, en %. null = sin tope (la dueña o el dueño). */
  topeDescuentoPct: number | null;
  /** Abrir en «Pedido» (el «Tomar un pedido» de la bandeja vacía llega con `?modo=pedido`). */
  pedidoInicial?: boolean;
  /**
   * ¿Se ofrece «A cuenta»? Sólo con cuentas corrientes encendidas y la app Cuentas a cobrar
   * habilitada para quien vende (lo decide la página; el servidor lo vuelve a exigir).
   */
  aCuentaDisponible?: boolean;
  /** ¿Se ofrece «Facturar» en la venta recién cobrada? (billing:manage y la app Facturación). */
  puedeFacturar?: boolean;
  /** Tope del precio a mano de quien vende (null = sin tope). La misma regla que el servidor. */
  topePrecioAMano?: TopePrecioAMano | null;
  /** El negocio (su id): separa en el almacén de la pestaña el cobro sin confirmar de cada uno. */
  negocioId?: string;
  /** Quién vende (su id): la duda guardada de otra persona no se restaura. */
  usuarioId?: string;
  /** Diseño nuevo: el nombre de quien vende, en la cabeza del ticket. */
  vendedor?: string;
  /** Diseño nuevo: cómo llama el rubro a lo que vende («corte» en una carnicería), para el buscador. */
  sustantivo?: string;
};

const sinSuscripcion = () => () => {};

// El servidor no tiene el almacén de la pestaña, y la primera pintura del navegador tiene que
// ser igual a la del servidor: ésa se arma sin mirar el almacén. Apenas se sabe que se está en el
// navegador, el formulario se arma de nuevo, ya con el cobro sin confirmar si quedó uno (el mismo
// arreglo que RecuentoForm). Navegando dentro del panel no hay pintura del servidor: se arma una
// sola vez, directo con lo guardado.
export default function VenderForm(props: PropsDeVender) {
  const enNavegador = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  return <FormularioVender key={enNavegador ? "navegador" : "servidor"} {...props} enNavegador={enNavegador} />;
}

/** Las líneas con las que arranca el formulario: las de un cobro sin confirmar, o una vacía. */
function lineasIniciales(k: CargadoDelCobro | undefined): { lines: Line[]; manuales: LineaManual[]; nextKey: number } {
  let n = 1;
  const lines: Line[] = (k?.lineas ?? []).map((l) => ({ key: n++, productId: l.productId, qtyText: l.qtyText }));
  if (lines.length === 0) lines.push({ key: n++, productId: "", qtyText: "" });
  const manuales = (k?.manuales ?? []).map((m) => ({ key: n++, nombre: m.nombre, importeText: m.importeText, motivo: m.motivo }));
  return { lines, manuales, nextKey: n };
}

function FormularioVender({
  products,
  stockById,
  rapidos,
  rotuloRapidos = "Más vendidos",
  negocio,
  topeDescuentoPct,
  pedidoInicial = false,
  aCuentaDisponible = false,
  puedeFacturar = false,
  topePrecioAMano = null,
  negocioId = "",
  usuarioId = "",
  vendedor,
  sustantivo = "producto",
  enNavegador,
}: PropsDeVender & { enNavegador: boolean }) {
  // Diseño nuevo («Renglón»): la MISMA venta (estado, reglas, envío) dibujada como el ticket que
  // crece (vistaTicket, abajo). Apagado, la pantalla de siempre.
  const nuevo = useDiseno();
  // Un cobro que quedó sin confirmar en esta pestaña (se recargó, se volvió de otra pantalla, el
  // celular descartó la pestaña al ir a la app de MP): el formulario arranca con lo cargado, su
  // clave y el aviso. Se lee una sola vez, al armar el formulario.
  const almacen = negocioId || negocio;
  const [lectura] = useState(() =>
    enNavegador ? leerCobroSinConfirmar(almacenDeSesion(), almacen, { usuario: usuarioId, ahora: Date.now() }) : null,
  );
  const arranque = lectura?.tipo === "propia" ? lectura.cobro : null;
  // La duda que dejó OTRA persona en esta pestaña: no se restaura (ni su cliente ni lo cargado);
  // sólo se avisa, con la fecha, hasta que se toque «Entendido».
  const [dudaAjena, setDudaAjena] = useState(lectura?.tipo === "de-otra-persona" ? lectura.desde : null);
  // Una duda guardada que no se puede leer entera: no se inventa lo cargado, pero se avisa.
  const [dudaIlegible, setDudaIlegible] = useState(lectura?.tipo === "ilegible" ? { desde: lectura.desde } : null);
  const k = arranque?.cargado;
  // Los nombres de los productos de la duda, para mostrar una línea cuyo producto salió del
  // catálogo entre el corte y la recarga (ver `huerfana`).
  const [nombresDeLaDuda] = useState<Record<string, string>>(() =>
    Object.fromEntries((k?.lineas ?? []).map((l) => [l.productId, l.nombre ?? "Un producto"])),
  );
  const [inicial] = useState(() => lineasIniciales(k));

  const [isOrder, setIsOrder] = useState(k ? k.esPedido : pedidoInicial);
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">(k?.entrega.tipo ?? "PICKUP");
  const [paid, setPaid] = useState(k ? k.paid : !pedidoInicial);
  const [medio, setMedio] = useState<MedioDeCobro | "">(k ? (leerMedioDeCobro(k.medio) ?? "") : "");
  // «A cuenta» no es un medio de cobro: no entra plata. Va aparte del medio para que nunca viaje
  // como `paymentMethod`.
  const [aCuenta, setACuenta] = useState(k?.aCuenta ?? false);
  const [lines, setLines] = useState<Line[]>(inicial.lines);
  const [manuales, setManuales] = useState<LineaManual[]>(inicial.manuales);
  const [nextKey, setNextKey] = useState(inicial.nextKey);
  const ticketKey = useRef(arranque?.clave ?? "");

  // Opcionales, cerrados hasta que alguien los abre (ninguno suma un paso al camino feliz).
  const [conCliente, setConCliente] = useState(k?.conCliente ?? false);
  const [telefono, setTelefono] = useState(k?.telefono ?? "");
  const [nombreCliente, setNombreCliente] = useState(k?.nombre ?? "");
  const [busqueda, setBusqueda] = useState<"nada" | "buscando" | "encontrado" | "sin-ficha" | "error">(
    k?.fichaEncontrada ? "encontrado" : "nada",
  );
  const [conDescuento, setConDescuento] = useState(k?.descuento.abierto ?? false);
  // El cupón es la tercera forma del descuento: uno o el otro, nunca los dos (lo mismo exige el
  // servidor).
  const [tipoDescuento, setTipoDescuento] = useState<TipoDescuento | "cupon">(k?.descuento.tipo ?? "porcentaje");
  const [descuentoText, setDescuentoText] = useState(k?.descuento.texto ?? "");
  const [pagoConText, setPagoConText] = useState("");
  // Los datos del pedido van CONTROLADOS, como todo lo demás del formulario. Sueltos, el reset
  // automático del <form action> de React 19 los borraba también cuando el servidor rechazaba
  // (sin stock, un descuento de más): había que volver a escribir horario, dirección y nota.
  const [horario, setHorario] = useState(k?.entrega.horario ?? "");
  const [direccion, setDireccion] = useState(k?.entrega.direccion ?? "");
  const [nota, setNota] = useState(k?.entrega.nota ?? "");

  // Lo que no salió en el último intento, a la vista hasta que se resuelva (ver arriba), y si el
  // navegador tiene señal ahora: cambia el "cuando vuelva la señal" por "tocá Reintentar".
  const [falla, setFalla] = useState<Falla | null>(arranque ? { tipo: "red" } : null);
  // El envío que salió y no tuvo respuesta (puede haberse grabado con la clave de este ticket).
  // Sólo se borra cuando la duda se resuelve: cobro confirmado, «ya grabada», «Es otra venta».
  const [sinRespuesta, setSinRespuesta] = useState<EnvioSinRespuesta | null>(
    arranque ? { firma: arranque.firma, total: arranque.total, desde: arranque.desde, restaurado: true } : null,
  );
  // El servidor contestó que la clave ya estaba grabada con OTRA cosa (o anulada): cuál quedó y
  // qué no se registró. Frena el botón hasta que el cajero elija cómo seguir.
  const [yaGrabada, setYaGrabada] = useState<VentaYaGrabada | null>(null);
  const [verGrabada, setVerGrabada] = useState(false);
  // «Empezar de nuevo» con un envío en duda: primero se pregunta (revisar Ventas del día).
  const [confirmarEmpezar, setConfirmarEmpezar] = useState(false);
  // Se cargó SÓLO lo que faltaba de una venta ya grabada: se dice arriba del botón.
  const [soloLoQueFalta, setSoloLoQueFalta] = useState<{ code: number; texto: string } | null>(null);
  const formulario = useRef<HTMLFormElement | null>(null);
  const [enLinea, setEnLinea] = useState(true);
  useEffect(() => {
    const leer = () => setEnLinea(navigator.onLine);
    leer();
    window.addEventListener("online", leer);
    window.addEventListener("offline", leer);
    return () => {
      window.removeEventListener("online", leer);
      window.removeEventListener("offline", leer);
    };
  }, []);

  // La última venta cobrada, con su ticket. No frena la próxima: el formulario ya está limpio.
  const [ultima, setUltima] = useState<{ venta: VentaTicket; pagoCon: number | null } | null>(null);
  // Lo que salió sin ticket (un pedido, una venta sin cobrar, el reintento que ya estaba
  // registrado), escrito arriba del formulario. No en el aviso flotante: en el celular tapaba el
  // botón de cobrar de la venta siguiente.
  const [confirmacion, setConfirmacion] = useState<string | null>(null);

  const [focusPedido, setFocusPedido] = useState<{ id: string; n: number } | null>(null);
  const focusN = useRef(0);
  const pedirFoco = (id: string) => setFocusPedido({ id, n: ++focusN.current });
  useEffect(() => {
    if (!focusPedido) return;
    // En el ticket no hay renglones vacíos con su buscador: el foco que iba a uno va al buscador.
    const el = document.getElementById(focusPedido.id) ?? (nuevo ? document.getElementById("vender-buscar") : null);
    el?.focus();
    if (nuevo && el instanceof HTMLInputElement && el.value) el.select();
  }, [focusPedido, nuevo]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const opciones = useMemo<OpcionBuscador[]>(
    () =>
      products.map((prod) => {
        const info = stockById[prod.id];
        const esPeso = prod.saleUnit === "WEIGHT";
        const precio = esPeso ? `${fmtMoneyARS(prod.pricePerKg ?? 0)}/kg` : `${fmtMoneyARS(prod.price ?? 0)}/u`;
        const quedan = info?.trackStock ? ` · quedan ${formatearCantidad(info.stock)} ${esPeso ? "kg" : "u"}` : "";
        return { id: prod.id, etiqueta: prod.name, detalle: `${precio}${quedan}` };
      }),
    [products, stockById],
  );
  const botonesRapidos = useMemo(
    () => rapidos.map((id) => byId.get(id)).filter((p): p is SellableProduct => !!p),
    [rapidos, byId],
  );

  function setLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine(productId = "") {
    const key = nextKey;
    setLines((ls) => [...ls, { key, productId, qtyText: "" }]);
    setNextKey((k) => k + 1);
    return key;
  }
  function removeLine(key: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [{ ...ls[0], productId: "", qtyText: "" }]));
  }
  function setManual(key: number, patch: Partial<LineaManual>) {
    setManuales((ms) => ms.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }
  function addManual() {
    const key = nextKey;
    setManuales((ms) => [...ms, { key, nombre: "", importeText: "", motivo: "" }]);
    setNextKey((k) => k + 1);
    pedirFoco(`manual-nombre-${key}`);
  }

  // Botón rápido: usa la línea vacía si hay una (no deja renglones en blanco en el medio) y
  // salta directo al peso o la cantidad.
  // Diseño nuevo: lo que se vende por unidad entra con 1 (y el campo seleccionado, para pisarlo);
  // por kilo queda vacío, esperando la balanza.
  function elegirRapido(productId: string) {
    const qtyText = nuevo && byId.get(productId)?.saleUnit === "UNIT" ? "1" : "";
    const vacia = lines.find((l) => !l.productId);
    if (vacia) {
      setLine(vacia.key, { productId, qtyText });
      pedirFoco(`qty-${vacia.key}`);
    } else {
      const key = addLine(productId);
      if (qtyText) setLine(key, { qtyText });
      pedirFoco(`qty-${key}`);
    }
  }

  const leidas = useMemo(
    () =>
      lines.map((l) => {
        const lectura = leerCantidad(l.qtyText);
        return { ...l, qty: lectura.estado === "ok" ? lectura.valor : 0, invalida: lectura.estado === "invalida" };
      }),
    [lines],
  );
  // Total de línea redondeado igual que el servidor (`buildOrderLines`): la pantalla y el
  // ticket dicen el mismo número al centavo.
  const totalDeLinea = (l: { productId: string; qty: number }) => {
    const p = byId.get(l.productId);
    return p && l.qty > 0 ? round2(l.qty * precioDe(p)) : 0;
  };
  const manualesLeidas = manuales.map((m) => {
    const tocada = m.nombre.trim() !== "" || m.importeText.trim() !== "" || m.motivo.trim() !== "";
    const v = validarLineaAMano({ nombre: m.nombre, importe: m.importeText, motivo: m.motivo });
    // El tope de quien vende, con la MISMA regla que el alta aplica en la transacción: la
    // pantalla avisa antes de cobrar y el servidor decide (con el catálogo entero de la base).
    const t = v.ok ? controlarPrecioAMano({ linea: v.linea, catalogo: products, tope: topePrecioAMano }) : null;
    const error = tocada && !v.ok ? v.error : t && !t.ok ? t.error : null;
    return { ...m, importe: importeOCero(m.importeText), error, valida: v.ok && (t?.ok ?? true) };
  });

  const subtotal = round2(
    leidas.reduce((s, l) => s + totalDeLinea(l), 0) + manualesLeidas.reduce((s, m) => s + (m.valida ? m.importe : 0), 0),
  );

  // Cupón: la vista previa sale de la regla del alta (`montoDeCupon`); el servidor lo vuelve a
  // decidir y lo consume en la transacción. Sin «Aplicar», no se cobra: el total que dice el
  // botón tiene que ser el que se cobra.
  const cupon = useCuponDePedido(subtotal, k ? { codigo: k.descuento.cuponTexto, aplicado: k.descuento.cupon } : undefined);
  const usaCupon = conDescuento && tipoDescuento === "cupon";
  const cuponSinAplicar = usaCupon && cupon.codigo.trim() !== "" && !cupon.aplicado;
  const pedidoDescuento =
    conDescuento && tipoDescuento !== "cupon"
      ? descuentoDelFormulario(tipoDescuento, descuentoText)
      : { ok: true as const, pedido: null };
  const descuento: ResultadoDescuento = usaCupon
    ? { ok: true, descuento: cupon.descuento, total: round2(subtotal - cupon.descuento), porcentaje: 0 }
    : pedidoDescuento.ok
      ? aplicarDescuento({ subtotal, pedido: pedidoDescuento.pedido, topePct: topeDescuentoPct })
      : { ok: false, error: pedidoDescuento.error };
  const total = descuento.ok ? descuento.total : subtotal;

  const contextoStock = isOrder ? "ONLINE" : "COUNTER";
  const faltanteDe = (l: { productId: string; qty: number }) => {
    const p = byId.get(l.productId);
    return p ? faltanteDeLinea(stockById[l.productId], l.qty, { saleUnit: p.saleUnit, contexto: contextoStock }) : null;
  };

  // Con un envío en duda, una línea cuyo producto ya no está en el catálogo (lo sacaron entre el
  // corte y la recarga) SIGUE en el ticket, en la firma y en el envío: el reintento tiene que
  // viajar igual que la cortada. El servidor busca la clave antes de validar: si estaba grabada,
  // la devuelve. Sin duda de por medio, esa línea no se vende (no hay precio).
  const huerfana = (productId: string) => sinRespuesta !== null && productId !== "" && !byId.has(productId);
  const enviable = (l: { productId: string; qty: number }) => (byId.has(l.productId) || huerfana(l.productId)) && l.qty > 0;
  const hayLineaValida = leidas.some(enviable) || manualesLeidas.some((m) => m.valida);
  const hayFaltante = leidas.some((l) => faltanteDe(l)?.bloquea === true);
  const hayCantidadInvalida = leidas.some((l) => l.productId && l.invalida);
  // Una línea con producto y SIN cantidad frena el cobro, en las DOS vistas (antes, sólo con
  // «Diseño nuevo»; en la de siempre esa línea no viajaba —no es `enviable`— y el ticket salía
  // sin ella, cobrado de menos). La regla es una sola: `lineaSinCantidad` (reglas-venta.ts).
  const lineaSinCantidad = primeraLineaSinCantidad(leidas);
  // Una línea a mano abierta y a medio llenar frena el cobro: si se dejara pasar, se cobraría
  // de menos sin que nadie se entere. Vacía del todo, se ignora.
  const hayManualInvalida = manualesLeidas.some((m) => m.error !== null);
  // A cuenta: la deuda es de ALGUIEN. Sin la ficha encontrada por teléfono no hay a quién.
  const aCuentaActivo = aCuentaDisponible && !isOrder && paid && aCuenta;
  const faltaFichaACuenta = aCuentaActivo && busqueda !== "encontrado";
  const faltaMedio = paid && !medio && !aCuentaActivo;
  const vuelto = paid && !aCuentaActivo && medio === "EFECTIVO" ? calcularVuelto(total, pagoConText) : null;

  // Lo que define este cobro —TODO lo que el servidor compara con lo grabado—, para saber si un
  // reintento es la misma venta. Cliente y entrega van como viajan: sin la sección abierta no se
  // mandan, y la firma no los cuenta.
  const conDatosDeCliente = isOrder || conCliente;
  // Lo mismo que viaja en el formulario, firmado con la función del servidor (`firmaDelPedido`):
  // sin precios, sin total, sin el nombre de la ficha. Recargar con otro precio de catálogo ya
  // no cambia la firma.
  const firma = firmaDelCobro({
    lineas: leidas.filter(enviable).map((l) => ({ productId: l.productId, cantidad: l.qty })),
    manuales: manualesLeidas.filter((m) => m.valida).map((m) => ({ nombre: m.nombre, importe: m.importe })),
    medio: aCuentaActivo ? "A_CUENTA" : paid ? medio : "SIN_COBRAR",
    esPedido: isOrder,
    telefono: conDatosDeCliente ? telefono : "",
    cupon: usaCupon ? (cupon.aplicado?.codigo ?? cupon.codigo) : null,
    descuento: conDescuento && !usaCupon && pedidoDescuento.ok ? pedidoDescuento.pedido : null,
    entrega: isOrder
      ? { tipo: fulfillment, direccion: fulfillment === "DELIVERY" ? direccion : "", horario, nota }
      : null,
  });
  const cambioTrasCorte = sinRespuesta !== null && cambioDespuesDelCorte(sinRespuesta.firma, firma);
  // El reintento de LA MISMA venta en duda. El stock que muestra la pantalla puede ya tener
  // descontada esa venta (si se grabó): no frena el reintento. Decide el servidor: si está
  // grabada, la devuelve; si no, valida el stock él, en su transacción.
  const reintentoDeLaMisma = sinRespuesta !== null && !cambioTrasCorte;

  // Lo cargado, lo justo para volver a mostrarlo igual si la pantalla se recarga con un cobro en
  // duda (cobro-sin-conexion.ts, "La duda sobrevive a recargar la pantalla").
  function cargadoActual(): CargadoDelCobro {
    return {
      esPedido: isOrder,
      lineas: lines
        .filter((l) => l.productId)
        .map((l) => ({ productId: l.productId, qtyText: l.qtyText, nombre: byId.get(l.productId)?.name ?? nombresDeLaDuda[l.productId] })),
      manuales: manuales.map((m) => ({ nombre: m.nombre, importeText: m.importeText, motivo: m.motivo })),
      paid,
      medio,
      aCuenta,
      conCliente,
      telefono,
      nombre: nombreCliente,
      fichaEncontrada: busqueda === "encontrado",
      descuento: {
        abierto: conDescuento,
        tipo: tipoDescuento,
        texto: descuentoText,
        cupon: cupon.aplicado,
        cuponTexto: cupon.codigo,
      },
      entrega: { tipo: fulfillment, horario, direccion, nota },
    };
  }


  const motivoBloqueo = !hayLineaValida
    ? null
    : yaGrabada
      ? yaGrabada.esPedido
        ? `Revisá el pedido #${yaGrabada.code}`
        : `Revisá la venta #${yaGrabada.code}`
      : cambioTrasCorte
      ? isOrder
        ? "Revisá el pedido cortado"
        : "Revisá la venta cortada"
      : lineaSinCantidad
      ? motivoDeLineaSinCantidad(byId.get(lineaSinCantidad.productId))
      : !descuento.ok
      ? "Revisá el descuento"
      : cuponSinAplicar
        ? "Aplicá el cupón"
        : faltaMedio
          ? "Elegí cómo pagó"
          : faltaFichaACuenta
            ? "Buscá al cliente"
            : null;

  function limpiar() {
    // El foco vuelve al buscador: el próximo cliente se atiende sin tocar el mouse.
    pedirFoco(`prod-${nextKey}`);
    setLines([{ key: nextKey, productId: "", qtyText: "" }]);
    setManuales([]);
    setNextKey((k) => k + 1);
    setMedio("");
    setACuenta(false);
    setPaid(!isOrder);
    setConDescuento(false);
    setDescuentoText("");
    cupon.limpiar();
    setPagoConText("");
    setConCliente(false);
    setTelefono("");
    setNombreCliente("");
    setBusqueda("nada");
    setHorario("");
    setDireccion("");
    setNota("");
    setFalla(null);
    setSinRespuesta(null);
    setYaGrabada(null);
    setVerGrabada(false);
    setConfirmarEmpezar(false);
    setSoloLoQueFalta(null);
    borrarCobroSinConfirmar(almacenDeSesion(), almacen);
    ticketKey.current = "";
  }

  // «Es otra venta» / «Cobrar lo que falta como otra venta»: el cajero revisó y lo cargado NO es
  // la venta cortada o la ya grabada (o ya sacó lo que se había grabado). Viaja con otra clave;
  // lo cargado queda como está. La duda (o la grabada) queda resuelta: se borra de la pestaña.
  function esOtraVenta() {
    ticketKey.current = "";
    setFalla(null);
    setSinRespuesta(null);
    setYaGrabada(null);
    setVerGrabada(false);
    setConfirmarEmpezar(false);
    borrarCobroSinConfirmar(almacenDeSesion(), almacen);
  }

  // «Cobrar sólo lo que falta»: la venta #N ya está grabada y lo cargado trae DE MÁS (el servidor
  // calculó qué: `faltante`). El ticket queda con SÓLO eso —mismo medio y mismo cliente, sin
  // descuento (con descuento el servidor no ofrece esta salida)— y viaja con otra clave. Antes
  // este botón dejaba el carrito entero y cobraba todo otra vez (refutador R-A).
  function cargarSoloLoQueFalta(g: VentaYaGrabada, f: Faltante) {
    let n = nextKey;
    const nuevas: Line[] = f.productos.map((l) => ({ key: n++, productId: l.productId, qtyText: formatearCantidad(l.cantidad) }));
    const nuevasAMano: LineaManual[] = f.aMano.map((m) => {
      // El motivo es de la pantalla (el servidor no lo compara): el de la línea igual que ya estaba.
      const igual = manuales.find((x) => x.nombre.trim().toLowerCase() === m.nombre.trim().toLowerCase() && importeOCero(x.importeText) === m.importe);
      return { key: n++, nombre: m.nombre, importeText: importeParaFormulario(m.importe), motivo: igual?.motivo ?? "" };
    });
    if (nuevas.length === 0) nuevas.push({ key: n++, productId: "", qtyText: "" });
    setLines(nuevas);
    setManuales(nuevasAMano);
    setNextKey(n);
    setConDescuento(false);
    setDescuentoText("");
    // «Pagó con» era de la venta entera: con él, el vuelto de lo que falta salía de más.
    setPagoConText("");
    cupon.limpiar();
    esOtraVenta();
    setSoloLoQueFalta({ code: g.code, texto: textoDelFaltante(f) });
  }

  // «Ya la anulé: volver a consultar»: la misma clave, lo mismo cargado. El servidor contesta
  // cómo está AHORA la #N (si la anularon, ofrece cobrarla como otra venta).
  function volverAConsultar() {
    setYaGrabada(null);
    setVerGrabada(false);
    formulario.current?.requestSubmit();
  }

  async function buscarCliente() {
    const tel = telefono.trim();
    if (tel.replace(/\D/g, "").length < 6) return;
    setBusqueda("buscando");
    try {
      const r = await buscarClienteParaVenta(tel);
      if (r) {
        setNombreCliente(r.nombre);
        setBusqueda("encontrado");
      } else {
        setBusqueda("sin-ficha");
      }
    } catch (e) {
      if (isNextRedirect(e)) throw e;
      setBusqueda("error");
    }
  }

  async function submit(fd: FormData) {
    // Sin señal no se manda: el envío quedaría colgado y el cajero no sabría qué pasó.
    if (antesDeCobrar(navigator.onLine)) {
      setFalla({ tipo: "sin-senal" });
      return;
    }
    // Un reintento es la MISMA venta: misma clave (cobro-sin-conexion.ts).
    ticketKey.current = claveParaCobrar(ticketKey.current, nuevaClaveDeTicket);
    const clave = ticketKey.current;
    fd.set("idempotencyKey", clave);
    setConfirmacion(null);
    fd.set("conTicket", "1");
    const pagoCon = medio === "EFECTIVO" ? leerImporte(pagoConText) : null;
    // Lo que viaja, por si la respuesta no vuelve: queda en duda, en memoria y en la pestaña.
    const enviado: EnvioSinRespuesta = { firma, total, desde: new Date().toISOString() };
    // La duda con la que sale este envío (si es un reintento): su total es lo que se había mandado.
    const enDuda = sinRespuesta;
    const cargado = cargadoActual();
    const quedaEnDuda = () => {
      setFalla({ tipo: "red" });
      setSinRespuesta((previo) => recordarEnvioSinRespuesta(previo, enviado));
      // Se guarda el PRIMER envío en duda (un reintento sólo sale si lo cargado es igual).
      if (!sinRespuesta) {
        guardarCobroSinConfirmar(almacenDeSesion(), almacen, {
          v: 3,
          clave,
          firma,
          total,
          desde: enviado.desde!,
          usuario: usuarioId,
          cargado,
        });
      }
    };
    let espera;
    try {
      espera = await conTiempoMaximo(createOrder(fd), TIEMPO_MAXIMO_DEL_COBRO_MS);
    } catch (e) {
      if (isNextRedirect(e)) throw e;
      quedaEnDuda();
      return;
    }
    // El servidor no contestó a tiempo: no sabemos si se grabó (lo mismo que un corte).
    if (espera.tipo === "sin-respuesta") {
      quedaEnDuda();
      return;
    }
    const r = espera.valor;
    if (r && !r.ok) {
      // Falló algo que no es un rechazo de negocio (la base, la transacción al confirmarse): no
      // prueba que no se grabó. Se trata como un corte: misma clave para reintentar.
      if (r.tipo === "sin-confirmar") {
        quedaEnDuda();
        return;
      }
      // La clave ya estaba grabada con OTRA cosa (o anulada). No se grabó nada nuevo; la duda
      // quedó resuelta (sabemos cuál quedó). El botón se frena hasta que el cajero elija.
      if (r.tipo === "ya-grabada-distinta") {
        setFalla(null);
        setSinRespuesta(null);
        borrarCobroSinConfirmar(almacenDeSesion(), almacen);
        setYaGrabada(r.grabada);
        setVerGrabada(false);
        return;
      }
      // El servidor sabe que con esta clave NO hay nada grabado (la buscó al rechazar): la duda
      // queda resuelta —la cortada no se había grabado— y el rechazo se dice como es: "no se
      // cobró", sin el "puede ser que ya se grabó" que mandaba a buscar una venta que no existe.
      if (r.claveLibre && sinRespuesta) {
        setSinRespuesta(null);
        borrarCobroSinConfirmar(almacenDeSesion(), almacen);
      }
      setFalla({ tipo: "rechazo", error: r.error });
      // Rechazo de negocio sin nada en duda: con esta clave no hay nada grabado, así que lo que se
      // corrija viaja con otra (el porqué, en `renovarClaveTrasRechazo`).
      if (renovarClaveTrasRechazo(sinRespuesta !== null && !r.claveLibre)) ticketKey.current = "";
      return;
    }
    // La venta a cuenta también lleva su ticket (dice "Queda a cuenta"): el cliente se lleva
    // la mercadería y la constancia de lo que quedó debiendo.
    if (r?.venta && (r.venta.medio || r.venta.aCuenta)) {
      // Con ticket, la confirmación es el bloque «Última venta», que queda a la vista. El aviso
      // flotante de 4 s, en el celular, tapaba el botón de cobrar de la venta siguiente (medido
      // a 412 px: 138 × 44 px encima del botón).
      setUltima({ venta: r.venta, pagoCon: pagoCon?.estado === "ok" ? pagoCon.valor : null });
      // El reintento de una venta que ya estaba grabada vuelve con su ticket Y con el aviso de
      // que no se cobró dos veces (order-actions.ts, rama `dedup`): se dicen las dos cosas.
      if (r.mensaje) setConfirmacion(r.mensaje);
    } else {
      // El mensaje dice lo que pasó: una venta que quedó sin cobrar no es "Venta cobrada".
      setConfirmacion(
        r?.mensaje ??
          (isOrder
            ? "Pedido registrado."
            : paid
              ? "Venta cobrada."
              : "Venta registrada sin cobrar: queda en Pedidos para preparar hasta que se cobre."),
      );
    }
    // Era un reintento y la cortada NO estaba grabada: se grabó AHORA, con los precios y el
    // catálogo de hoy. Si el total no es el que se había mandado (y quizá cobrado), se dice.
    if (enDuda && r?.ok && !r.yaEstaba && r.venta && round2(r.venta.total) !== round2(enDuda.total)) {
      setConfirmacion(avisoDeGrabadaAhoraPorOtroTotal({ code: r.venta.code, esPedido: isOrder, mandado: enDuda.total, grabado: r.venta.total }));
    }
    limpiar();
  }

  // Lo que falta incluye un producto que ya no está en el catálogo: no se ofrece cargarlo solo.
  const fueraDelCatalogo = yaGrabada?.faltante?.productos.filter((l) => !byId.has(l.productId)).map((l) => l.nombre) ?? [];
  const cobrarAparte = yaGrabada && fueraDelCatalogo.length === 0 ? etiquetaDeCobrarAparte(yaGrabada) : null;
  const aviso = yaGrabada
    ? avisoDeYaGrabada(yaGrabada, fueraDelCatalogo)
    : avisoDelCobro({
        falla,
        sinRespuesta: sinRespuesta
          ? {
              cambio: cambioTrasCorte,
              totalMandado: fmtMoneyARS(sinRespuesta.total),
              restaurado: sinRespuesta.restaurado ? cuandoDelEnvio(sinRespuesta.desde) : null,
            }
          : null,
        enLinea,
        esPedido: isOrder,
      });

  const etiquetaCobrar = !hayLineaValida
    ? "Cobrar"
    : motivoBloqueo ??
      (aviso?.reintentar
        ? isOrder
          ? etiquetaDeReintento(true)
          : // El reintento de la duda dice lo que se MANDÓ (y quizá se cobró), no el total a
            // precios de hoy: si estaba grabada, vuelve esa venta con ese total.
            `${etiquetaDeReintento()} ${fmtMoneyARS(reintentoDeLaMisma && sinRespuesta ? sinRespuesta.total : total)}`
        : isOrder
          ? "Registrar pedido"
          : aCuentaActivo
            ? `Dejar a cuenta ${fmtMoneyARS(total)}`
            : `Cobrar ${fmtMoneyARS(total)}`);

  // Los bloques de la pantalla: los mismos en la vista de siempre y en el ticket del diseño nuevo.
  const bloqueUltima = (
    <>
      {ultima && (
        <section
          aria-label="Última venta"
          aria-live="polite"
          className="rounded-lg border border-success/40 bg-success-soft/40 p-3 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-strong">
              Venta #{ultima.venta.code} {ultima.venta.anulada ? "ANULADA" : ultima.venta.aCuenta ? "a cuenta" : "cobrada"} ·{" "}
              {fmtMoneyARS(ultima.venta.total)}
              {ultima.pagoCon != null && ultima.pagoCon >= ultima.venta.total && (
                <> · vuelto {fmtMoneyARS(round2(ultima.pagoCon - ultima.venta.total))}</>
              )}
            </p>
            <button
              type="button"
              onClick={() => setUltima(null)}
              className="h-11 px-3 text-sm text-muted hover:underline"
            >
              Cerrar
            </button>
          </div>
          {puedeFacturar && <FacturarVenta key={ultima.venta.id} orderId={ultima.venta.id} inicial={SIN_FACTURA} />}
          <TicketVenta venta={ultima.venta} negocio={negocio} pagoCon={ultima.pagoCon} />
        </section>
      )}
    </>
  );

  const bloqueGrabada = (
    <>
      {yaGrabada?.ticket && verGrabada && (
        <section
          aria-label={yaGrabada.esPedido ? `Pedido #${yaGrabada.code} ya registrado` : `Venta #${yaGrabada.code} ya grabada`}
          className="rounded-lg border border-line-strong p-3 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="venta-ya-grabada" tabIndex={-1} className="text-sm font-medium text-strong">
              {yaGrabada.esPedido ? "Pedido" : "Venta"} #{yaGrabada.code} {yaGrabada.anulada ? "ANULADA" : yaGrabada.como} ·{" "}
              {fmtMoneyARS(yaGrabada.total)}
            </h2>
            <button type="button" onClick={() => setVerGrabada(false)} className="h-11 px-3 text-sm text-muted hover:underline">
              Cerrar
            </button>
          </div>
          <TicketVenta venta={yaGrabada.ticket} negocio={negocio} />
        </section>
      )}
    </>
  );

  const bloqueConfirmacion = (
    <>
      {confirmacion && (
        <div
          role="status"
          className="flex items-center justify-between gap-2 rounded-lg border border-success/40 bg-success-soft/40 pl-3 text-sm text-strong"
        >
          <p className="py-2">{confirmacion}</p>
          <button type="button" onClick={() => setConfirmacion(null)} className="h-11 shrink-0 px-3 text-sm text-muted hover:underline">
            Cerrar
          </button>
        </div>
      )}
    </>
  );

  const bloqueDudas = (
    <>
      {dudaIlegible && (
        <AvisoError
          tono="aviso"
          titulo={avisoDeDudaIlegible(dudaIlegible.desde).titulo}
          comoSeguir={avisoDeDudaIlegible(dudaIlegible.desde).comoSeguir}
          accion={
            <button
              type="button"
              onClick={() => {
                borrarCobroSinConfirmar(almacenDeSesion(), almacen);
                setDudaIlegible(null);
              }}
              className="h-11 px-2 text-sm text-muted hover:underline"
            >
              Ya revisé
            </button>
          }
        />
      )}

      {dudaAjena && (
        <AvisoError
          tono="aviso"
          titulo={avisoDeDudaDeOtraPersona(dudaAjena).titulo}
          comoSeguir={avisoDeDudaDeOtraPersona(dudaAjena).comoSeguir}
          accion={
            <button
              type="button"
              onClick={() => {
                borrarCobroSinConfirmar(almacenDeSesion(), almacen);
                setDudaAjena(null);
              }}
              className="h-11 px-2 text-sm text-muted hover:underline"
            >
              Entendido
            </button>
          }
        />
      )}
    </>
  );

  const bloqueManuales = (
    <>
          {/* Líneas con precio a mano: sin producto, no mueven stock, con motivo. */}
          {manualesLeidas.map((m) => (
            <fieldset key={m.key} className="rounded-md border border-dashed border-line-strong p-2 space-y-2">
              <legend className="px-1 text-xs text-muted">Precio a mano · no descuenta stock</legend>
              <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_128px_auto]">
                <label className="col-span-2 sm:col-span-1">
                  <span className="sr-only">Qué se vende</span>
                  <Input
                    id={`manual-nombre-${m.key}`}
                    value={m.nombre}
                    onChange={(e) => setManual(m.key, { nombre: e.target.value })}
                    placeholder="Qué se vende (ej.: Bondiola)"
                    maxLength={80}
                  />
                </label>
                <label>
                  <span className="sr-only">Importe</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={m.importeText}
                    onChange={(e) => setManual(m.key, { importeText: e.target.value })}
                    placeholder="$ Importe"
                    className="text-right tabular-nums"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setManuales((ms) => ms.filter((x) => x.key !== m.key))}
                  aria-label="Quitar la línea con precio a mano"
                  className="inline-flex h-11 w-11 items-center justify-center text-lg leading-none text-muted hover:text-danger"
                >
                  ×
                </button>
                <label className="col-span-2 sm:col-span-3">
                  <span className="sr-only">Motivo</span>
                  <Input
                    value={m.motivo}
                    onChange={(e) => setManual(m.key, { motivo: e.target.value })}
                    placeholder="Motivo (obligatorio): ej. no tiene precio cargado"
                    maxLength={200}
                    aria-invalid={m.error ? true : undefined}
                  />
                </label>
              </div>
              {m.error && (
                <p role="alert" className="text-xs text-danger">
                  {m.error}
                </p>
              )}
              {m.valida && (
                <>
                  <input type="hidden" name="manualNombre" value={m.nombre} />
                  <input type="hidden" name="manualImporte" value={importeParaFormulario(m.importe)} />
                  <input type="hidden" name="manualMotivo" value={m.motivo} />
                </>
              )}
            </fieldset>
          ))}
    </>
  );

  const bloqueCliente = (
    <>
        {/* Cliente: opcional en la venta, obligatorio el nombre en el pedido. */}
        {isOrder || conCliente ? (
          <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Teléfono / WhatsApp{isOrder ? "" : " (opcional)"}</span>
              <div className="flex gap-2">
                <Input
                  id="vender-telefono"
                  name="customerPhone"
                  inputMode="tel"
                  autoComplete="off"
                  value={telefono}
                  onChange={(e) => {
                    setTelefono(e.target.value);
                    if (busqueda !== "nada") setBusqueda("nada");
                  }}
                  onBlur={() => void buscarCliente()}
                  placeholder="11…"
                />
                <button
                  type="button"
                  onClick={() => void buscarCliente()}
                  className="chip-btn h-11 shrink-0 text-sm"
                  disabled={busqueda === "buscando"}
                >
                  {busqueda === "buscando" ? "Buscando…" : "Buscar"}
                </button>
              </div>
              {busqueda === "encontrado" && (
                <span role="status" className="mt-1 block text-xs text-success">
                  Cliente: {nombreCliente}. La venta queda en su ficha.
                </span>
              )}
              {busqueda === "sin-ficha" && (
                <span role="status" className="mt-1 block text-xs text-muted">
                  No hay una ficha con ese teléfono: la venta queda con el nombre que escribas.
                </span>
              )}
              {busqueda === "error" && (
                <span role="alert" className="mt-1 block text-xs text-warning">
                  No se pudo buscar ahora. Podés seguir: la venta se registra igual.
                </span>
              )}
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Nombre{isOrder ? " *" : " (opcional)"}</span>
              <Input
                name="customerName"
                required={isOrder}
                value={nombreCliente}
                onChange={(e) => setNombreCliente(e.target.value)}
                placeholder="Nombre y apellido"
              />
            </label>
            {isOrder && (
              <>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Entrega</span>
                  <Select
                    name="fulfillment"
                    value={fulfillment}
                    onChange={(e) => setFulfillment(e.target.value as "PICKUP" | "DELIVERY")}
                  >
                    <option value="PICKUP">Retira en el local</option>
                    <option value="DELIVERY">Envío a domicilio</option>
                  </Select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Horario deseado</span>
                  <Input
                    name="scheduledFor"
                    type="datetime-local"
                    value={horario}
                    onChange={(e) => setHorario(e.target.value)}
                  />
                </label>
                {fulfillment === "DELIVERY" && (
                  <label className="text-sm sm:col-span-2">
                    <span className="mb-1 block text-muted">Dirección *</span>
                    <Input
                      name="address"
                      required
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                      placeholder="Calle, número, barrio"
                    />
                  </label>
                )}
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-muted">Nota</span>
                  <Input
                    name="notes"
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Ej.: cortar en milanesas, sin grasa"
                  />
                </label>
              </>
            )}
          </div>
        ) : null}
    </>
  );

  const bloqueDescuento = (
    <>
        {/* Descuento: un botón, no un campo más en el camino. */}
        {conDescuento && (
          <div className="space-y-2 border-t border-line pt-4">
            <div className="flex flex-wrap items-end gap-2">
              <div role="radiogroup" aria-label="Tipo de descuento" className="flex gap-1">
                {(
                  [
                    ["porcentaje", "%"],
                    ["monto", "$"],
                    ["cupon", "Cupón"],
                  ] as const
                ).map(([valor, etiqueta]) => (
                  <button
                    key={valor}
                    type="button"
                    role="radio"
                    aria-checked={tipoDescuento === valor}
                    onClick={() => setTipoDescuento(valor)}
                    className={cn(
                      "chip-btn h-11 justify-center text-sm",
                      valor === "cupon" ? "px-3" : "w-11",
                      tipoDescuento === valor && "bg-accent text-on-accent",
                    )}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
              {usaCupon ? (
                <>
                  <label className="text-sm">
                    <span className="mb-1 block text-muted">Código del cupón</span>
                    <Input
                      id="descuento-valor"
                      type="text"
                      autoComplete="off"
                      value={cupon.codigo}
                      onChange={(e) => cupon.cambiar(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void cupon.aplicar();
                        }
                      }}
                      className="w-40 uppercase"
                      aria-invalid={cupon.error ? true : undefined}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void cupon.aplicar()}
                    disabled={cupon.probando}
                    className="chip-btn h-11 text-sm"
                  >
                    {cupon.probando ? "Revisando…" : "Aplicar"}
                  </button>
                </>
              ) : (
                <label className="text-sm">
                  <span className="mb-1 block text-muted">Descuento {tipoDescuento === "porcentaje" ? "(%)" : "($)"}</span>
                  <Input
                    id="descuento-valor"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={descuentoText}
                    onChange={(e) => setDescuentoText(e.target.value)}
                    className="w-32 text-right tabular-nums"
                    aria-invalid={!descuento.ok ? true : undefined}
                  />
                </label>
              )}
              <button
                type="button"
                onClick={() => {
                  setConDescuento(false);
                  setDescuentoText("");
                  cupon.limpiar();
                }}
                className="h-11 px-2 text-sm text-muted hover:underline"
              >
                Sin descuento
              </button>
            </div>
            {usaCupon ? (
              <>
                {cupon.aplicado && (
                  <p role="status" className="text-xs text-success">
                    Cupón {cupon.aplicado.codigo}: −{fmtMoneyARS(cupon.descuento)}. Lo cargó la dueña: no tiene el tope del descuento a mano.
                  </p>
                )}
                {cupon.error && (
                  <p role="alert" className="text-xs text-danger">
                    {cupon.error}
                  </p>
                )}
                <input type="hidden" name="cupon" value={cupon.aplicado?.codigo ?? cupon.codigo} />
              </>
            ) : (
              <>
                {topeDescuentoPct != null && (
                  <p className="text-xs text-faint">Con tu usuario, hasta el {topeDescuentoPct} % de la venta.</p>
                )}
                {!descuento.ok && (
                  <p role="alert" className="text-xs text-danger">
                    {descuento.error}
                  </p>
                )}
                <input type="hidden" name="descuentoTipo" value={tipoDescuento} />
                <input type="hidden" name="descuentoValor" value={descuentoText} />
              </>
            )}
          </div>
        )}
    </>
  );

  const bloqueMedios = (
    <>
          {paid && (
            <div
              role="radiogroup"
              aria-label="Cómo pagó"
              className="flex flex-wrap gap-2"
              onKeyDown={(e) => {
                const paso =
                  e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                if (!paso) return;
                e.preventDefault();
                const n = MEDIOS_DE_COBRO.length;
                const actual = MEDIOS_DE_COBRO.findIndex((m) => `vender-medio-${m.valor}` === (e.target as HTMLElement).id);
                const sig = MEDIOS_DE_COBRO[(Math.max(actual, 0) + paso + n) % n];
                setMedio(sig.valor);
                document.getElementById(`vender-medio-${sig.valor}`)?.focus();
              }}
            >
              {MEDIOS_DE_COBRO.map((m, i) => (
                <button
                  key={m.valor}
                  id={`vender-medio-${m.valor}`}
                  type="button"
                  role="radio"
                  aria-checked={!aCuentaActivo && medio === m.valor}
                  tabIndex={(medio ? medio === m.valor : i === 0) ? 0 : -1}
                  onClick={() => {
                    setMedio(m.valor);
                    setACuenta(false);
                  }}
                  className={cn("chip-btn h-11 px-4 text-sm", !aCuentaActivo && medio === m.valor && "bg-accent text-on-accent")}
                >
                  {m.etiqueta}
                </button>
              ))}
              {/* A cuenta: no es un medio (no entra plata), va a la cuenta corriente del cliente. */}
              {aCuentaDisponible && !isOrder && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={aCuentaActivo}
                  tabIndex={-1}
                  onClick={() => {
                    setACuenta(true);
                    setMedio("");
                    setConCliente(true);
                    pedirFoco("vender-telefono");
                  }}
                  className={cn("chip-btn h-11 px-4 text-sm", aCuentaActivo && "bg-accent text-on-accent")}
                >
                  A cuenta
                </button>
              )}
              {medio && !aCuentaActivo && <input type="hidden" name="paymentMethod" value={medio} />}
              {aCuentaActivo && <input type="hidden" name="aCuenta" value="1" />}
            </div>
          )}
          {aCuentaActivo && (
            <p role={faltaFichaACuenta ? "alert" : "status"} className={cn("text-xs", faltaFichaACuenta ? "text-warning" : "text-muted")}>
              {faltaFichaACuenta
                ? "Para dejar a cuenta, buscá al cliente por su teléfono: la deuda queda en su ficha."
                : `Queda en la cuenta corriente de ${nombreCliente}. No entra al libro de caja hasta que la pague.`}
            </p>
          )}
    </>
  );

  const bloqueVuelto = (
    <>
          {/* Vuelto: sólo con efectivo, y no se guarda. */}
          {vuelto && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-muted">Pagó con</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={pagoConText}
                  onChange={(e) => setPagoConText(e.target.value)}
                  placeholder="$"
                  className="w-36 text-right tabular-nums"
                  aria-invalid={vuelto.estado === "invalido" ? true : undefined}
                />
              </label>
              <p role="status" className="min-h-11 py-2 text-sm">
                {vuelto.estado === "ok" && (
                  <>
                    Vuelto <strong className="text-lg tabular-nums text-strong">{fmtMoneyARS(vuelto.vuelto)}</strong>
                  </>
                )}
                {vuelto.estado === "falta" && (
                  <span className="text-danger">Faltan {fmtMoneyARS(vuelto.falta)}</span>
                )}
                {vuelto.estado === "invalido" && <span className="text-danger">Eso no es un importe</span>}
              </p>
            </div>
          )}
    </>
  );

  const bloqueAviso = (
    <>
          {aviso && (
            <AvisoError
              titulo={aviso.titulo}
              comoSeguir={aviso.comoSeguir}
              accion={
                yaGrabada ? (
                  <>
                    {cobrarAparte && (
                      <button
                        type="button"
                        onClick={() => (yaGrabada.faltante && !yaGrabada.anulada ? cargarSoloLoQueFalta(yaGrabada, yaGrabada.faltante) : esOtraVenta())}
                        className="h-11 px-2 text-sm font-medium text-strong underline"
                      >
                        {cobrarAparte}
                      </button>
                    )}
                    {yaGrabada.ticket && (
                      <button
                        type="button"
                        onClick={() => {
                          setVerGrabada(true);
                          pedirFoco("venta-ya-grabada");
                        }}
                        className="h-11 px-2 text-sm text-strong underline"
                      >
                        {etiquetaDeVerGrabada(yaGrabada)}
                      </button>
                    )}
                    {!etiquetaDeCobrarAparte(yaGrabada) && fueraDelCatalogo.length === 0 && (
                      <>
                        <a
                          href={yaGrabada.esPedido ? "/admin/pedidos" : "/admin/ventas"}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex h-11 items-center px-2 text-sm text-strong underline"
                        >
                          {yaGrabada.esPedido ? "Abrir Pedidos para preparar" : "Abrir Ventas del día"}
                        </a>
                        <button type="button" onClick={volverAConsultar} className="h-11 px-2 text-sm text-strong underline">
                          {ETIQUETA_VOLVER_A_CONSULTAR}
                        </button>
                      </>
                    )}
                    <button type="button" onClick={limpiar} className="h-11 px-2 text-sm text-muted hover:underline">
                      {ETIQUETA_DEJARLA_ASI}
                    </button>
                  </>
                ) : confirmarEmpezar ? (
                  <>
                    <p className="w-full text-sm text-body">{avisoAntesDeEmpezarDeNuevo(isOrder)}</p>
                    <button type="button" onClick={limpiar} className="h-11 px-2 text-sm font-medium text-strong underline">
                      Sí, empezar de nuevo
                    </button>
                    <button type="button" onClick={() => setConfirmarEmpezar(false)} className="h-11 px-2 text-sm text-muted hover:underline">
                      Cancelar
                    </button>
                  </>
                ) : !aviso.reintentar || sinRespuesta ? (
                  <>
                    {cambioTrasCorte ? (
                      <button type="button" onClick={esOtraVenta} className="h-11 px-2 text-sm font-medium text-strong underline">
                        {etiquetaDeOtraVenta(isOrder)}
                      </button>
                    ) : !aviso.reintentar ? (
                      <button type="button" onClick={() => setFalla(null)} className="h-11 px-2 text-sm text-muted hover:underline">
                        Entendido
                      </button>
                    ) : null}
                    {/* Con un envío en duda, siempre hay salida: empezar de nuevo, después de revisar. */}
                    {sinRespuesta && (
                      <button type="button" onClick={() => setConfirmarEmpezar(true)} className="h-11 px-2 text-sm text-muted hover:underline">
                        Empezar de nuevo
                      </button>
                    )}
                  </>
                ) : undefined
              }
            />
          )}
          {soloLoQueFalta && !aviso && (
            <p role="status" className="text-sm text-body">
              Cargado sólo lo que faltaba de la venta #{soloLoQueFalta.code}: {soloLoQueFalta.texto}. Total a cobrar aparte:{" "}
              <strong className="tabular-nums text-strong">{fmtMoneyARS(total)}</strong>.
            </p>
          )}
    </>
  );

  // Todo lo que frena el botón de cobrar (la misma regla para las dos vistas).
  const cobrarBloqueado =
    !hayLineaValida ||
    (hayFaltante && !reintentoDeLaMisma) ||
    hayCantidadInvalida ||
    lineaSinCantidad !== undefined ||
    hayManualInvalida ||
    faltaMedio ||
    !descuento.ok ||
    cuponSinAplicar ||
    faltaFichaACuenta ||
    cambioTrasCorte ||
    yaGrabada !== null;

  // Diseño nuevo: los atajos del mostrador. «/» busca, F2 cobra, Alt+1..3 elige el medio, Esc
  // limpia (sólo sin un cobro en duda: con una duda, «Empezar de nuevo» pregunta antes). Nunca con
  // el foco en un campo (Esc ahí es del campo) ni con un diálogo abierto.
  useEffect(() => {
    if (!nuevo) return;
    const alPresionar = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const enCampo = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "F2" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (!cobrarBloqueado) formulario.current?.requestSubmit();
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-3]$/.test(e.key) && paid) {
        const m = MEDIOS_DE_COBRO[Number(e.key) - 1];
        if (m) {
          e.preventDefault();
          setMedio(m.valor);
          setACuenta(false);
        }
        return;
      }
      if (enCampo || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("vender-buscar")?.focus();
      } else if (e.key === "Escape" && !sinRespuesta && !yaGrabada) {
        limpiar();
      }
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  });

  /**
   * EL TICKET QUE CRECE (diseño nuevo, «Renglón»). La MISMA venta que la vista de siempre: las mismas
   * líneas, los mismos campos con el mismo nombre (lo que viaja al servidor es idéntico, lo prueba
   * vender-pantalla.test.ts) y las mismas reglas. Cambia cómo se ve y se toca:
   *   · a la izquierda (arriba en el celular) el buscador y las teclas de «Más vendidos» con su
   *     precio por kilo o por unidad; tocar una suma la línea y deja el cursor en su peso;
   *   · a la derecha (abajo) el ticket: cada línea `1,280 kg × $28.600 = $36.608`, con «−» para
   *     sacarla; el total grande para el cliente del otro lado del mostrador;
   *   · el pie: los medios como segmentado, «Pagó con» y el vuelto a la vista, y «Cobrar $X» (F2).
   * «Cobrado» deja de ser una casilla a la vista: cobrar ES la acción; «registrar sin cobrar» va a «Más».
   */
  function vistaTicket() {
    const conProducto = leidas.filter((l) => l.productId);
    const nLineas = leidas.filter(enviable).length + manualesLeidas.filter((m) => m.valida).length;
    const porPeso = botonesRapidos.some((p) => p.saleUnit === "WEIGHT");
    const buscarQue = sustantivo && sustantivo !== "producto" ? `Buscá un ${sustantivo} o un producto` : "Buscá un producto";
    const casillaCobrado = (
      <label className="flex min-h-11 w-fit items-center gap-2 text-sm">
        <input
          key={isOrder ? "cobrado-pedido" : "cobrado-venta"}
          type="checkbox"
          name="paid"
          checked={paid}
          onChange={(e) => setPaid(e.target.checked)}
          className="h-5 w-5"
        />
        <span className="text-body">{isOrder ? "Ya está cobrado" : "Cobrado"}</span>
      </label>
    );
    return (
      <div data-vender="ticket-que-crece" className="space-y-4">
        {bloqueDudas}
        {bloqueUltima}
        {bloqueGrabada}
        {bloqueConfirmacion}
        <form ref={formulario} action={submit} data-vender="formulario" className="grid gap-6">
          <input type="hidden" name="channel" value={isOrder ? "ONLINE" : "COUNTER"} />
          <div data-vender="elegir" className="min-w-0 space-y-4">
            <BuscadorCombo
              id="vender-buscar"
              ariaLabel={buscarQue}
              placeholder={buscarQue}
              opciones={opciones}
              valor=""
              onElegir={(id) => elegirRapido(id)}
              // El foco vuelve acá solo después de cada peso: la lista se abre al tipear, no
              // encima de los más vendidos (un toque caía sobre otro corte).
              abrirAlEnfocar={false}
            />
            {botonesRapidos.length > 0 && (
              <section data-vender="rapidos" aria-labelledby="vender-rapidos">
                <div data-parte="cabeza" className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="vender-rapidos" className="text-[15px] font-semibold text-strong">
                    {rotuloRapidos}
                  </h2>
                  <p className="text-[13px] text-muted">{porPeso ? "Tocá y cargá el peso de la balanza" : "Tocá y cargá la cantidad"}</p>
                </div>
                <div data-parte="teclas" className="grid grid-cols-2 gap-2">
                  {botonesRapidos.map((p) => {
                    const esPeso = p.saleUnit === "WEIGHT";
                    return (
                      <button key={p.id} type="button" onClick={() => elegirRapido(p.id)} data-vender="tecla-producto" className="text-left">
                        <span data-parte="nombre">{p.name}</span>{" "}
                        <span data-parte="precio">
                          {fmtMoneyARS(precioDe(p), 0)}
                          <small> / {esPeso ? "kg" : "u"}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            <Atajos
              atajos={[
                { teclas: ["/"], que: "buscar" },
                { teclas: ["Enter"], que: porPeso ? "listo el peso" : "listo" },
                { teclas: ["F2"], que: isOrder ? "registrar" : "cobrar" },
                { teclas: ["Alt", "1–3"], que: "medio de pago" },
                { teclas: ["Esc"], que: "limpiar" },
              ]}
            />
          </div>

          <section data-vender="ticket" aria-label={isOrder ? "Pedido" : "Ticket"} className="min-w-0">
            <header data-parte="cabeza" className="flex flex-wrap items-center justify-between gap-2">
              <div role="group" aria-label="Qué se registra" data-vender="modo" className="flex gap-1">
                <button
                  type="button"
                  aria-pressed={!isOrder}
                  onClick={() => {
                    if (!isOrder) return;
                    setIsOrder(false);
                    setPaid(true);
                  }}
                >
                  Venta
                </button>
                <button
                  type="button"
                  aria-pressed={isOrder}
                  onClick={() => {
                    if (isOrder) return;
                    setIsOrder(true);
                    setPaid(false);
                    setACuenta(false);
                  }}
                >
                  Pedido
                </button>
              </div>
              <span data-parte="quien">{[vendedor, negocio].filter(Boolean).join(" · ")}</span>
            </header>

            {conProducto.length === 0 && manuales.length === 0 && (
              <p data-parte="vacio">
                {porPeso
                  ? "Tocá un producto o buscalo: la línea se suma acá y escribís el peso de la etiqueta de la balanza."
                  : "Tocá un producto o buscalo: la línea se suma acá con su cantidad y su precio."}
              </p>
            )}

            <ol data-parte="lineas" aria-label="Lo que lleva">
              {conProducto.map((l) => {
                const p = byId.get(l.productId);
                if (!p && huerfana(l.productId)) {
                  return (
                    <li key={l.key} data-vender="linea">
                      <div data-parte="que">
                        <span data-parte="producto">{nombresDeLaDuda[l.productId] ?? "Un producto"}</span>
                        <span data-parte="detalle" className="text-warning">
                          ya no está en el catálogo (va igual en el reintento)
                        </span>
                      </div>
                      <span id={`qty-${l.key}`} data-parte="cantidad">
                        {l.qtyText}
                      </span>
                      <span data-parte="importe" />
                      <button type="button" data-parte="quitar" onClick={() => removeLine(l.key)} aria-label="Quitar línea">
                        −
                      </button>
                      {l.qty > 0 && (
                        <>
                          <input type="hidden" name="productId" value={l.productId} />
                          <input type="hidden" name="quantity" value={cantidadParaFormulario(l.qty)} />
                        </>
                      )}
                    </li>
                  );
                }
                if (!p) return null;
                const esPeso = p.saleUnit === "WEIGHT";
                const lineTotal = totalDeLinea(l);
                const faltante = faltanteDe(l);
                const falta = faltante?.bloquea && !reintentoDeLaMisma ? faltante : null;
                const faltaEnDuda = faltante?.bloquea && reintentoDeLaMisma ? faltante : null;
                const avisoStock = faltante && !faltante.bloquea ? faltante.aviso : null;
                const avisoCant = !l.invalida ? avisoDeCantidad({ valor: l.qty, saleUnit: p.saleUnit }) : null;
                return (
                  <li key={l.key} data-vender="linea" data-sin-cantidad={l.qty > 0 ? undefined : ""}>
                    <div data-parte="que">
                      <span data-parte="producto">{p.name}</span>
                      <span data-parte="detalle">
                        {l.qty > 0 ? `${formatearCantidad(l.qty)} ${esPeso ? "kg" : "u"} × ` : "× "}
                        {fmtMoneyARS(precioDe(p), 0)}
                        {esPeso ? " / kg" : " / u"}
                      </span>
                    </div>
                    <label data-parte="cantidad">
                      <Input
                        id={`qty-${l.key}`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={l.qtyText}
                        aria-label={esPeso ? "Peso en kg" : "Cantidad"}
                        placeholder={esPeso ? "Peso" : "Cant."}
                        onChange={(e) => setLine(l.key, { qtyText: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (l.qty > 0) document.getElementById("vender-buscar")?.focus();
                          }
                        }}
                        aria-invalid={falta || l.invalida ? true : undefined}
                        data-tipo={esPeso ? "peso" : "cantidad"}
                        className="text-right tabular-nums"
                      />
                      <span data-parte="unidad" aria-hidden>
                        {esPeso ? "kg" : "u"}
                      </span>
                    </label>
                    <span data-parte="importe">{lineTotal > 0 ? <Plata valor={lineTotal} /> : "—"}</span>
                    <button type="button" data-parte="quitar" onClick={() => removeLine(l.key)} aria-label="Quitar línea">
                      −
                    </button>
                    {l.invalida && (
                      <p role="alert" data-parte="nota" className="text-xs text-danger">
                        Eso no es una cantidad. Escribí el {esPeso ? "peso" : "número"}, con coma si
                        {esPeso ? " tiene gramos (1,240)" : " hace falta"}.
                      </p>
                    )}
                    {faltaEnDuda && (
                      <p role="status" data-parte="nota" className="text-xs text-warning">
                        Quedan {formatearCantidad(faltaEnDuda.available)} {esPeso ? "kg" : "u"} de {p.name}, pero puede ser porque esta misma
                        venta ya se grabó: el reintento lo controla el sistema.
                      </p>
                    )}
                    {falta && (
                      <p role="alert" data-parte="nota" className="text-xs text-danger">
                        No alcanza el stock: quedan {formatearCantidad(falta.available)} {esPeso ? "kg" : "u"} de {p.name}.
                      </p>
                    )}
                    {avisoStock && (
                      <p role="status" data-parte="nota" className="text-xs text-warning">
                        {avisoStock}
                      </p>
                    )}
                    {avisoCant && (
                      <p data-parte="nota" className="text-xs text-warning">
                        {avisoCant}
                      </p>
                    )}
                    {l.qty > 0 && (
                      <>
                        <input type="hidden" name="productId" value={l.productId} />
                        <input type="hidden" name="quantity" value={cantidadParaFormulario(l.qty)} />
                      </>
                    )}
                  </li>
                );
              })}
            </ol>

            {bloqueManuales}

            <div data-vender="opcionales" className="flex flex-wrap gap-2">
              <button type="button" onClick={addManual} className="chip-btn h-11 text-sm">
                Precio a mano
              </button>
              {!conDescuento && (
                <button
                  type="button"
                  onClick={() => {
                    setConDescuento(true);
                    pedirFoco("descuento-valor");
                  }}
                  className="chip-btn h-11 text-sm"
                >
                  Descuento
                </button>
              )}
              {!isOrder && !conCliente && (
                <button type="button" onClick={() => setConCliente(true)} className="chip-btn h-11 text-sm">
                  Cliente
                </button>
              )}
            </div>

            {bloqueCliente}
            {bloqueDescuento}

            <div data-vender="pie" className="space-y-3">
              <div data-parte="total" className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p data-ui="rotulo">
                    {isOrder ? "Total del pedido" : "Total"}
                    {nLineas > 0 ? ` · ${nLineas} ${nLineas === 1 ? "línea" : "líneas"}` : ""}
                  </p>
                  {descuento.ok && descuento.descuento > 0 && (
                    <p data-parte="subtotal" className="text-[13px] tabular-nums text-muted">
                      Subtotal {fmtMoneyARS(subtotal)} · descuento −{fmtMoneyARS(descuento.descuento)}
                    </p>
                  )}
                </div>
                <Plata valor={total} tamano="grande" sinCentavos={Number.isInteger(total)} />
              </div>
              {isOrder && casillaCobrado}
              {bloqueMedios}
              {bloqueVuelto}
              {!isOrder && (
                <details data-vender="mas">
                  <summary>Más: registrar sin cobrar</summary>
                  {casillaCobrado}
                  <p className="text-[13px] text-muted">Sin «Cobrado», la venta queda en Pedidos para preparar hasta que se cobre.</p>
                </details>
              )}
            </div>
            {/* Lo que va fijo abajo en el celular: el botón (que dice el total) y lo que no salió, al
                lado del botón, que es donde se está mirando. Encima de la cápsula del armazón
                (`--alto-barra-inferior`); en la PC, en su lugar. */}
            <div data-vender="cobrar" className="sticky bottom-[var(--alto-barra-inferior,0px)] z-10 space-y-3">
              {bloqueAviso}
              <CobrarSubmit disabled={cobrarBloqueado} label={etiquetaCobrar} pendiente={isOrder ? "Registrando…" : "Cobrando…"} atajo="F2" />
            </div>
          </section>
        </form>
      </div>
    );
  }

  if (nuevo) return vistaTicket();

  return (
    <div className="space-y-4">
      {bloqueUltima}

      {/* La venta que YA estaba grabada con esta clave, como quedó en la base («Ver la venta #N»). */}
      {bloqueGrabada}

      {bloqueConfirmacion}

      {bloqueDudas}

      <form ref={formulario} action={submit} className="rounded-lg border border-line p-3 sm:p-4 space-y-4">
        <input type="hidden" name="channel" value={isOrder ? "ONLINE" : "COUNTER"} />

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Qué se registra">
          <button
            type="button"
            aria-pressed={!isOrder}
            onClick={() => {
              if (!isOrder) return;
              setIsOrder(false);
              setPaid(true);
            }}
            className={cn("chip-btn h-11 text-sm", !isOrder && "bg-accent text-on-accent")}
          >
            Venta
          </button>
          <button
            type="button"
            aria-pressed={isOrder}
            onClick={() => {
              if (isOrder) return;
              setIsOrder(true);
              setPaid(false);
              setACuenta(false);
            }}
            className={cn("chip-btn h-11 text-sm", isOrder && "bg-accent text-on-accent")}
          >
            Pedido (retiro / envío)
          </button>
        </div>

        {/* Los más vendidos: un toque y salta al peso. Sólo si ya hubo ventas. */}
        {botonesRapidos.length > 0 && (
          <div>
            <p className="mb-2 text-xs text-muted">{rotuloRapidos}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {botonesRapidos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => elegirRapido(p.id)}
                  className="chip-btn h-11 min-w-0 justify-center px-2 text-sm text-strong"
                  title={p.name}
                >
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Líneas con producto */}
        <div className="space-y-2">
          {leidas.map((l) => {
            const p = byId.get(l.productId);
            // Una línea de la duda cuyo producto salió del catálogo: se muestra, viaja igual en el
            // reintento y se puede quitar (y entonces ya no es la misma venta).
            if (!p && huerfana(l.productId)) {
              return (
                <div key={l.key} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_128px_auto]">
                  <p className="col-span-2 sm:col-span-1 text-sm text-strong">
                    {nombresDeLaDuda[l.productId] ?? "Un producto"}{" "}
                    <span className="text-xs text-warning">· ya no está en el catálogo (va igual en el reintento)</span>
                  </p>
                  <span id={`qty-${l.key}`} className="text-right text-sm tabular-nums text-body">
                    {l.qtyText}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(l.key)}
                    aria-label="Quitar línea"
                    className="inline-flex h-11 w-11 items-center justify-center text-lg leading-none text-muted hover:text-danger"
                  >
                    ×
                  </button>
                  {l.qty > 0 && (
                    <>
                      <input type="hidden" name="productId" value={l.productId} />
                      <input type="hidden" name="quantity" value={cantidadParaFormulario(l.qty)} />
                    </>
                  )}
                </div>
              );
            }
            const esPeso = p?.saleUnit === "WEIGHT";
            const lineTotal = totalDeLinea(l);
            const faltante = faltanteDe(l);
            const falta = faltante?.bloquea && !reintentoDeLaMisma ? faltante : null;
            const faltaEnDuda = faltante?.bloquea && reintentoDeLaMisma ? faltante : null;
            const avisoStock = faltante && !faltante.bloquea ? faltante.aviso : null;
            const aviso = p && !l.invalida ? avisoDeCantidad({ valor: l.qty, saleUnit: p.saleUnit }) : null;
            return (
              <div key={l.key} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_128px_auto]">
                <BuscadorCombo
                  className="col-span-2 sm:col-span-1"
                  id={`prod-${l.key}`}
                  ariaLabel="Producto"
                  placeholder="Buscá el producto…"
                  opciones={opciones}
                  valor={l.productId}
                  onElegir={(productId) => {
                    if (productId !== l.productId) setLine(l.key, { productId, qtyText: "" });
                    pedirFoco(`qty-${l.key}`);
                  }}
                />
                <div className="relative">
                  <Input
                    id={`qty-${l.key}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={l.qtyText}
                    aria-label={esPeso ? "Peso en kg" : "Cantidad"}
                    placeholder={p ? (esPeso ? "Peso" : "Cantidad") : "—"}
                    onChange={(e) => setLine(l.key, { qtyText: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (l.qty > 0) pedirFoco(`prod-${addLine()}`);
                      }
                    }}
                    disabled={!p}
                    aria-invalid={falta || l.invalida ? true : undefined}
                    className="pr-8 text-right tabular-nums"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-faint">
                    {p ? (esPeso ? "kg" : "u") : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <span className="w-24 text-right text-sm tabular-nums text-body">
                    {lineTotal > 0 ? fmtMoneyARS(lineTotal) : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeLine(l.key)}
                    aria-label="Quitar línea"
                    className="inline-flex h-11 w-11 items-center justify-center text-lg leading-none text-muted hover:text-danger"
                  >
                    ×
                  </button>
                </div>
                {l.invalida && (
                  <p role="alert" className="col-span-2 sm:col-span-3 text-xs text-danger">
                    Eso no es una cantidad. Escribí el {esPeso ? "peso" : "número"}, con coma si
                    {esPeso ? " tiene gramos (1,240)" : " hace falta"}.
                  </p>
                )}
                {faltaEnDuda && (
                  <p role="status" className="col-span-2 sm:col-span-3 text-xs text-warning">
                    Quedan {formatearCantidad(faltaEnDuda.available)} {esPeso ? "kg" : "u"} de {p?.name}, pero puede ser porque
                    esta misma venta ya se grabó: el reintento lo controla el sistema.
                  </p>
                )}
                {falta && (
                  <p role="alert" className="col-span-2 sm:col-span-3 text-xs text-danger">
                    No alcanza el stock: quedan {formatearCantidad(falta.available)} {esPeso ? "kg" : "u"} de {p?.name}.
                  </p>
                )}
                {avisoStock && (
                  <p role="status" className="col-span-2 sm:col-span-3 text-xs text-warning">
                    {avisoStock}
                  </p>
                )}
                {aviso && <p className="col-span-2 sm:col-span-3 text-xs text-warning">{aviso}</p>}
                {p && l.qty > 0 && (
                  <>
                    <input type="hidden" name="productId" value={l.productId} />
                    <input type="hidden" name="quantity" value={cantidadParaFormulario(l.qty)} />
                  </>
                )}
              </div>
            );
          })}

          {bloqueManuales}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => pedirFoco(`prod-${addLine()}`)} className="chip-btn h-11 text-sm">
              + Agregar producto
            </button>
            <button type="button" onClick={addManual} className="chip-btn h-11 text-sm">
              Precio a mano
            </button>
          </div>
        </div>

        {bloqueCliente}

        {bloqueDescuento}

        {/* Cobro */}
        <div className="space-y-3 border-t border-line pt-4">
          <label className="flex min-h-11 w-fit items-center gap-2 text-sm">
            <input
              key={isOrder ? "cobrado-pedido" : "cobrado-venta"}
              type="checkbox"
              name="paid"
              checked={paid}
              onChange={(e) => setPaid(e.target.checked)}
              className="h-5 w-5"
            />
            <span className="text-body">Cobrado</span>
          </label>
          {bloqueMedios}
          {bloqueVuelto}
        </div>

        {/* Opcionales cerrados: se abren sólo si hacen falta. */}
        {(!conDescuento || (!isOrder && !conCliente)) && (
          <div className="flex flex-wrap gap-2">
            {!conDescuento && (
              <button
                type="button"
                onClick={() => {
                  setConDescuento(true);
                  pedirFoco("descuento-valor");
                }}
                className="chip-btn h-11 text-sm"
              >
                Descuento
              </button>
            )}
            {!isOrder && !conCliente && (
              <button type="button" onClick={() => setConCliente(true)} className="chip-btn h-11 text-sm">
                Cliente
              </button>
            )}
          </div>
        )}

        {/* Total y cobrar. En el celular, FIJOS abajo mientras se arma el ticket (el pie del
            formulario los suelta al final); desde sm, el pie de siempre. Lo que no salió va acá
            arriba del botón, que es donde se está mirando. z-10 y no más: la lista del buscador
            (z-20) tiene que poder abrirse por encima de la barra. Se apoya ENCIMA de la barra de
            espacios del celular (`--alto-barra-inferior`, layout.tsx; 0 donde no la hay): con
            bottom-0 quedaba debajo y tocar «Cobrar» abría la hoja de «Mostrador». La zona segura
            del iPhone (la rayita de abajo) se deja UNA vez: si hay barra, ya viene en su alto y el
            pie no la vuelve a sumar; si no hay, la deja el pie (pie-pegado-zona-segura.test.ts). */}
        <div className="sticky bottom-[var(--alto-barra-inferior,0px)] z-10 -mx-3 -mb-3 space-y-3 rounded-b-lg border-t border-line bg-surface px-3 pt-3 pb-[max(0.75rem,calc(env(safe-area-inset-bottom)_-_var(--alto-barra-inferior,0px)))] shadow-[0_-6px_16px_-10px_rgba(0,0,0,0.25)] sm:static sm:z-auto sm:mx-0 sm:mb-0 sm:rounded-none sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-4 sm:shadow-none">
          {bloqueAviso}
          {/* El mismo pie de siempre (total arriba y botón a lo ancho en el celular; en fila desde
              sm): lo único nuevo es que en el celular queda fijo. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted">
              {descuento.ok && descuento.descuento > 0 && (
                <p className="tabular-nums">
                  Subtotal {fmtMoneyARS(subtotal)} · descuento −{fmtMoneyARS(descuento.descuento)}
                </p>
              )}
              <p>
                Total{" "}
                <span className="ml-1 text-2xl font-semibold tabular-nums text-strong">{fmtMoneyARS(total)}</span>
              </p>
            </div>
            <CobrarSubmit
              disabled={cobrarBloqueado}
              label={etiquetaCobrar}
              pendiente={isOrder ? "Registrando…" : "Cobrando…"}
            />
          </div>
        </div>
      </form>
    </div>
  );
}
