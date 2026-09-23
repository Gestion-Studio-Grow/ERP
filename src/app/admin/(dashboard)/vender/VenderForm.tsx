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
// Todas las reglas de plata (descuento, tope, vuelto, precio a mano) son las de
// reglas-venta.ts, las MISMAS que aplica el servidor: la pantalla avisa y el servidor decide.
// Sin imports de valor de Prisma: esto es un client component.

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createOrder, buscarClienteParaVenta } from "@/lib/order-actions";
import { BuscadorCombo, Input, Select, buttonClasses, cn, fmtMoneyARS, type OpcionBuscador } from "@/components/ui";
import { faltanteDeLinea, type PosStockInfo } from "@/lib/stock/pos-stock-rules";
import { MEDIOS_DE_COBRO, type MedioDeCobro } from "@/lib/caja/medio-cobro";
import {
  leerCantidad,
  cantidadParaFormulario,
  avisoDeCantidad,
  formatearCantidad,
  importeOCero,
  importeParaFormulario,
  leerImporte,
} from "@/lib/pos-peso";
import { round2 } from "@/lib/round";
import { useToast } from "../ToastProvider";
import TicketVenta from "./TicketVenta";
import {
  aplicarDescuento,
  calcularVuelto,
  descuentoDelFormulario,
  validarLineaAMano,
  type TipoDescuento,
  type VentaTicket,
} from "./reglas-venta";

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

function CobrarSubmit({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={buttonClasses("solid", "lg", "w-full sm:w-auto disabled:opacity-50")}
    >
      {pending ? "Cobrando…" : label}
    </button>
  );
}

export default function VenderForm({
  products,
  stockById,
  rapidos,
  negocio,
  topeDescuentoPct,
  pedidoInicial = false,
}: {
  products: SellableProduct[];
  stockById: Record<string, PosStockInfo>;
  /** Ids de los más vendidos (hasta 8), ya filtrados a lo que hoy se puede vender. */
  rapidos: string[];
  /** Nombre del negocio para el encabezado del ticket. */
  negocio: string;
  /** Tope de descuento de quien vende, en %. null = sin tope (la dueña o el dueño). */
  topeDescuentoPct: number | null;
  /** Abrir en «Pedido» (el «Tomar un pedido» de la bandeja vacía llega con `?modo=pedido`). */
  pedidoInicial?: boolean;
}) {
  const { showError, showSuccess } = useToast();
  const [isOrder, setIsOrder] = useState(pedidoInicial);
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [paid, setPaid] = useState(!pedidoInicial);
  const [medio, setMedio] = useState<MedioDeCobro | "">("");
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", qtyText: "" }]);
  const [manuales, setManuales] = useState<LineaManual[]>([]);
  const [nextKey, setNextKey] = useState(2);
  const ticketKey = useRef("");

  // Opcionales, cerrados hasta que alguien los abre (ninguno suma un paso al camino feliz).
  const [conCliente, setConCliente] = useState(false);
  const [telefono, setTelefono] = useState("");
  const [nombreCliente, setNombreCliente] = useState("");
  const [busqueda, setBusqueda] = useState<"nada" | "buscando" | "encontrado" | "sin-ficha" | "error">("nada");
  const [conDescuento, setConDescuento] = useState(false);
  const [tipoDescuento, setTipoDescuento] = useState<TipoDescuento>("porcentaje");
  const [descuentoText, setDescuentoText] = useState("");
  const [pagoConText, setPagoConText] = useState("");
  // Los datos del pedido van CONTROLADOS, como todo lo demás del formulario. Sueltos, el reset
  // automático del <form action> de React 19 los borraba también cuando el servidor rechazaba
  // (sin stock, un descuento de más): había que volver a escribir horario, dirección y nota.
  const [horario, setHorario] = useState("");
  const [direccion, setDireccion] = useState("");
  const [nota, setNota] = useState("");

  // La última venta cobrada, con su ticket. No frena la próxima: el formulario ya está limpio.
  const [ultima, setUltima] = useState<{ venta: VentaTicket; pagoCon: number | null } | null>(null);

  const [focusPedido, setFocusPedido] = useState<{ id: string; n: number } | null>(null);
  const focusN = useRef(0);
  const pedirFoco = (id: string) => setFocusPedido({ id, n: ++focusN.current });
  useEffect(() => {
    if (!focusPedido) return;
    document.getElementById(focusPedido.id)?.focus();
  }, [focusPedido]);

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
  function elegirRapido(productId: string) {
    const vacia = lines.find((l) => !l.productId);
    if (vacia) {
      setLine(vacia.key, { productId, qtyText: "" });
      pedirFoco(`qty-${vacia.key}`);
    } else {
      pedirFoco(`qty-${addLine(productId)}`);
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
    return { ...m, importe: importeOCero(m.importeText), error: tocada && !v.ok ? v.error : null, valida: v.ok };
  });

  const subtotal = round2(
    leidas.reduce((s, l) => s + totalDeLinea(l), 0) + manualesLeidas.reduce((s, m) => s + (m.valida ? m.importe : 0), 0),
  );

  const pedidoDescuento = conDescuento ? descuentoDelFormulario(tipoDescuento, descuentoText) : { ok: true as const, pedido: null };
  const descuento = pedidoDescuento.ok
    ? aplicarDescuento({ subtotal, pedido: pedidoDescuento.pedido, topePct: topeDescuentoPct })
    : ({ ok: false as const, error: pedidoDescuento.error });
  const total = descuento.ok ? descuento.total : subtotal;

  const contextoStock = isOrder ? "ONLINE" : "COUNTER";
  const faltanteDe = (l: { productId: string; qty: number }) => {
    const p = byId.get(l.productId);
    return p ? faltanteDeLinea(stockById[l.productId], l.qty, { saleUnit: p.saleUnit, contexto: contextoStock }) : null;
  };

  const hayLineaValida = leidas.some((l) => byId.get(l.productId) && l.qty > 0) || manualesLeidas.some((m) => m.valida);
  const hayFaltante = leidas.some((l) => faltanteDe(l)?.bloquea === true);
  const hayCantidadInvalida = leidas.some((l) => l.productId && l.invalida);
  // Una línea a mano abierta y a medio llenar frena el cobro: si se dejara pasar, se cobraría
  // de menos sin que nadie se entere. Vacía del todo, se ignora.
  const hayManualInvalida = manualesLeidas.some((m) => m.error !== null);
  const faltaMedio = paid && !medio;
  const vuelto = paid && medio === "EFECTIVO" ? calcularVuelto(total, pagoConText) : null;

  const motivoBloqueo = !hayLineaValida
    ? null
    : !descuento.ok
      ? "Revisá el descuento"
      : faltaMedio
        ? "Elegí cómo pagó"
        : null;

  function limpiar() {
    // El foco vuelve al buscador: el próximo cliente se atiende sin tocar el mouse.
    pedirFoco(`prod-${nextKey}`);
    setLines([{ key: nextKey, productId: "", qtyText: "" }]);
    setManuales([]);
    setNextKey((k) => k + 1);
    setMedio("");
    setPaid(!isOrder);
    setConDescuento(false);
    setDescuentoText("");
    setPagoConText("");
    setConCliente(false);
    setTelefono("");
    setNombreCliente("");
    setBusqueda("nada");
    setHorario("");
    setDireccion("");
    setNota("");
    ticketKey.current = "";
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
    if (!ticketKey.current) ticketKey.current = nuevaClaveDeTicket();
    fd.set("idempotencyKey", ticketKey.current);
    fd.set("conTicket", "1");
    const pagoCon = medio === "EFECTIVO" ? leerImporte(pagoConText) : null;
    let r;
    try {
      r = await createOrder(fd);
    } catch (e) {
      if (isNextRedirect(e)) throw e;
      showError(
        "No se pudo registrar la venta. Revisá la conexión y volvé a intentar con el mismo ticket: " +
          "si ya se había grabado, no se va a cobrar dos veces.",
      );
      return;
    }
    if (r && !r.ok) {
      showError(r.error);
      return;
    }
    // El mensaje dice lo que pasó: una venta que quedó sin cobrar no es "Venta cobrada".
    showSuccess(
      r?.mensaje ??
        (isOrder
          ? "Pedido registrado."
          : paid
            ? "Venta cobrada."
            : "Venta registrada sin cobrar: queda en Pedidos para preparar hasta que se cobre."),
    );
    if (r?.venta && r.venta.medio) {
      setUltima({ venta: r.venta, pagoCon: pagoCon?.estado === "ok" ? pagoCon.valor : null });
    }
    limpiar();
  }

  const etiquetaCobrar = !hayLineaValida
    ? "Cobrar"
    : motivoBloqueo ?? (isOrder ? "Registrar pedido" : `Cobrar ${fmtMoneyARS(total)}`);

  return (
    <div className="space-y-4">
      {ultima && (
        <section
          aria-label="Última venta"
          className="rounded-lg border border-success/40 bg-success-soft/40 p-3 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-strong">
              Venta #{ultima.venta.code} cobrada · {fmtMoneyARS(ultima.venta.total)}
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
          <TicketVenta venta={ultima.venta} negocio={negocio} pagoCon={ultima.pagoCon} />
        </section>
      )}

      <form action={submit} className="rounded-lg border border-line p-3 sm:p-4 space-y-4">
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
            }}
            className={cn("chip-btn h-11 text-sm", isOrder && "bg-accent text-on-accent")}
          >
            Pedido (retiro / envío)
          </button>
        </div>

        {/* Los más vendidos: un toque y salta al peso. Sólo si ya hubo ventas. */}
        {botonesRapidos.length > 0 && (
          <div>
            <p className="mb-2 text-xs text-muted">Más vendidos</p>
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
            const esPeso = p?.saleUnit === "WEIGHT";
            const lineTotal = totalDeLinea(l);
            const faltante = faltanteDe(l);
            const falta = faltante?.bloquea ? faltante : null;
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

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => pedirFoco(`prod-${addLine()}`)} className="chip-btn h-11 text-sm">
              + Agregar producto
            </button>
            <button type="button" onClick={addManual} className="chip-btn h-11 text-sm">
              Precio a mano
            </button>
          </div>
        </div>

        {/* Cliente: opcional en la venta, obligatorio el nombre en el pedido. */}
        {isOrder || conCliente ? (
          <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Teléfono / WhatsApp{isOrder ? "" : " (opcional)"}</span>
              <div className="flex gap-2">
                <Input
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

        {/* Descuento: un botón, no un campo más en el camino. */}
        {conDescuento && (
          <div className="space-y-2 border-t border-line pt-4">
            <div className="flex flex-wrap items-end gap-2">
              <div role="radiogroup" aria-label="Tipo de descuento" className="flex gap-1">
                {(
                  [
                    ["porcentaje", "%"],
                    ["monto", "$"],
                  ] as const
                ).map(([valor, etiqueta]) => (
                  <button
                    key={valor}
                    type="button"
                    role="radio"
                    aria-checked={tipoDescuento === valor}
                    onClick={() => setTipoDescuento(valor)}
                    className={cn("chip-btn h-11 w-11 justify-center text-sm", tipoDescuento === valor && "bg-accent text-on-accent")}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
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
              <button
                type="button"
                onClick={() => {
                  setConDescuento(false);
                  setDescuentoText("");
                }}
                className="h-11 px-2 text-sm text-muted hover:underline"
              >
                Sin descuento
              </button>
            </div>
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
          </div>
        )}

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
                  aria-checked={medio === m.valor}
                  tabIndex={(medio ? medio === m.valor : i === 0) ? 0 : -1}
                  onClick={() => setMedio(m.valor)}
                  className={cn("chip-btn h-11 px-4 text-sm", medio === m.valor && "bg-accent text-on-accent")}
                >
                  {m.etiqueta}
                </button>
              ))}
              {medio && <input type="hidden" name="paymentMethod" value={medio} />}
            </div>
          )}
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

        <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
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
            disabled={!hayLineaValida || hayFaltante || hayCantidadInvalida || hayManualInvalida || faltaMedio || !descuento.ok}
            label={etiquetaCobrar}
          />
        </div>
      </form>
    </div>
  );
}
