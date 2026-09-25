"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createOrder } from "@/lib/order-actions";
import { AvisoError, BuscadorCombo, Input, Select, buttonClasses, fmtMoneyARS, type OpcionBuscador } from "@/components/ui";
import { detalleDeYaGrabada, textoDelFaltante, tituloDeYaGrabada, type VentaYaGrabada } from "@/lib/reintento-de-venta";
import { faltanteDeLinea, type PosStockInfo } from "@/lib/stock/pos-stock-rules";
import { MEDIOS_DE_COBRO, type MedioDeCobro } from "@/lib/caja/medio-cobro";
import {
  leerCantidad,
  cantidadParaFormulario,
  avisoDeCantidad,
  formatearCantidad,
} from "@/lib/pos-peso";
import { useToast } from "../ToastProvider";

// Producto vendible que llega del loader (getPosData): ya viene con precio.
type SellableProduct = {
  id: string;
  name: string;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  unit: string;
};

// Una línea del ticket en construcción.
//
// `qtyText` es lo que la persona TIENE TIPEADO, tal cual, no un número. Es la diferencia
// entre este campo y el `type="number"` de antes, que se tragaba la coma: "1,3" tecleado
// quedaba "13" (medido, ver el comentario del campo de cantidad más abajo). Guardar el número
// obliga a parsear en cada tecla y a devolverle al campo una versión "corregida" de lo que
// escribió; guardar el texto deja escribir "1," y "1,2" sin pelear, y el número se deriva
// recién cuando hace falta.
type Line = { key: number; productId: string; qtyText: string };

/** Clave de idempotencia de ESTE ticket. Ver el comentario de `CobrarSubmit`. */
function nuevaClaveDeTicket(): string {
  // `randomUUID` necesita contexto seguro (https/localhost); el fallback existe para que un
  // navegador viejo no se quede sin clave y vuelva a la ventana del doble cobro.
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}


function unitPriceOf(p: SellableProduct): number {
  return (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;
}

// Botón de cobro que se BLOQUEA mientras el envío está en vuelo.
//
// Sin esto, un doble clic cobraba DOS VECES: el QA midió dos `Order` idénticos a 73 ms
// uno del otro, dos movimientos VENTA y el efectivo esperado del turno subiendo el
// doble. Es plata mal contada en el arqueo. `useFormStatus` cierra la ventana en el
// cliente, que es la misma defensa con la que el libro de caja y la caja de mostrador
// YA resisten el doble clic (el QA lo verificó en los dos).
//
// Y AHORA TAMBIÉN A NIVEL BASE. Acá había anotado que una clave de idempotencia "sin
// renovar bloquearía la segunda venta idéntica legítima". El argumento era correcto y la
// conclusión no: la clave no tiene por qué ser fija ni salir del server. La genera ESTE
// cliente, una por TICKET (`nuevaClaveDeTicket` al montar, renovada cada vez que el ticket
// se limpia), así que dos ventas idénticas a dos personas distintas llevan claves distintas
// y se cobran las dos — pero el reintento de red, el botón "recargar" del navegador y la
// segunda pestaña del mismo ticket llevan la MISMA clave y se cobran una sola vez.
// `useFormStatus` no cubría nada de eso: sólo tapa el doble clic dentro de esta pestaña.
function CobrarSubmit({ disabled, label }: { disabled: boolean; label: string }) {
  // `label` puede ser "Elegí cómo pagó": el botón deshabilitado dice QUÉ falta, en vez de
  // quedar gris sin explicación.
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={`${buttonClasses("solid", "lg")} disabled:opacity-50`}
    >
      {pending ? "Cobrando…" : label}
    </button>
  );
}

// Un error LANZADO por una Server Action llega al cliente con el mensaje REDACTADO en
// producción (Next no reenvía `error.message`). Por eso `createOrder` ya no lanza sus
// rechazos: los DEVUELVE (`OrderActionState`), y así el mostrador lee el motivo exacto —"el
// día de caja está cerrado", "no alcanza el stock de X"— en vez del mismo texto genérico para
// todo. Lo que llega acá como excepción es lo imprevisto (red caída, 500) o el redirect de
// `requireCapability` con sesión vencida, que Next modela como una excepción con digest
// NEXT_REDIRECT: tragarla dejaría al usuario sin login.
function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

// Los datos del cliente de un pedido con el ticket vacío.
const CLIENTE_VACIO = { customerName: "", customerPhone: "", scheduledFor: "", address: "", notes: "" };

export default function PosForm({
  products,
  stockById,
}: {
  products: SellableProduct[];
  // Stock y flag de control por producto (getPosStockSnapshot): lo que permite avisar
  // el faltante ANTES de mandar la venta. Puede faltar un id (producto recién borrado):
  // en ese caso no se bloquea acá y decide la guarda del server.
  stockById: Record<string, PosStockInfo>;
}) {
  const { showError, showSuccess } = useToast();
  // Caja de mostrador (venta rápida, se cobra en el acto) vs. pedido con retiro/envío.
  const [isOrder, setIsOrder] = useState(false);
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  // Los datos del cliente del pedido, CONTROLADOS. Sueltos, React 19 los vaciaba al terminar la
  // acción del <form> AUNQUE hubiera fallado (se cortó la señal, el servidor rechazó): medido en
  // Chromium, nombre, teléfono y nota quedaban en blanco y había que volver a pedírselos al
  // cliente. Ahora quedan hasta que el ticket se limpia (cobrado bien o «Empezar de nuevo»), y el
  // reintento viaja con los mismos datos.
  const [cliente, setCliente] = useState(CLIENTE_VACIO);
  const escribir = (campo: keyof typeof CLIENTE_VACIO) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCliente((c) => ({ ...c, [campo]: e.target.value }));
  // «Cobrado», CONTROLADO. Antes era `defaultChecked={!isOrder}`, que React aplica sólo al
  // montar: medido en Chromium, después de tocar "Pedido" la casilla seguía tildada. Ahora el
  // modo lo pone (mostrador → cobrado, pedido → a cobrar) y la persona lo puede cambiar.
  const [paid, setPaid] = useState(true);
  // Con qué pagó (MAG-1). Arranca SIN elegir, siempre, y vuelve a vacío después de cada
  // cobro: ni EFECTIVO por default ni "el último que se usó". Cada venta cobrada con MP que
  // quedaba en el default aparecía en el cierre como faltante de efectivo por el ticket entero.
  const [medio, setMedio] = useState<MedioDeCobro | "">("");
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", qtyText: "" }]);
  const [nextKey, setNextKey] = useState(2);
  // Clave de idempotencia del ticket, en un ref y no en el estado: se crea recién al PRIMER
  // envío (nunca durante el render — el primer render también corre en el server y un UUID
  // distinto de cada lado rompería la hidratación) y sobrevive a los reintentos de ESA venta.
  // Se vacía al cobrar bien, así el ticket siguiente nace con una clave nueva.
  const ticketKey = useRef("");
  // La clave de este ticket ya estaba grabada con OTRA cosa (`ya-grabada-distinta`): no se grabó
  // nada. Antes sólo salía un aviso que se iba, y como la clave se queda, cada nuevo intento
  // volvía igual: el ticket quedaba trabado. Ahora se muestra la grabada y la salida.
  const [yaGrabada, setYaGrabada] = useState<VentaYaGrabada | null>(null);
  // Foco dirigido: al elegir un producto saltamos a pesar/contar; con Enter saltamos
  // al próximo producto. Es lo que hace fluida la atención en mostrador (sin mouse).
  // Cada pedido de foco lleva su número de orden: así el efecto sabe que hay uno
  // NUEVO (aunque sea al mismo campo) sin tener que "consumirlo" borrándolo — que
  // era un setState dentro del efecto, o sea un render de más en cada tecla.
  const [focusPedido, setFocusPedido] = useState<{ id: string; n: number } | null>(null);
  const focusN = useRef(0);
  const pedirFoco = (id: string) => setFocusPedido({ id, n: ++focusN.current });

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Opciones del buscador (MAG-8, sólo la parte sin migración): el <select> nativo con
  // cientos de productos no deja filtrar tipeando en tablet ni en celular. Se busca por el
  // nombre y también por el detalle (precio y stock), sin tildes y por palabras.
  const opciones = useMemo<OpcionBuscador[]>(
    () =>
      products.map((prod) => {
        const info = stockById[prod.id];
        const esPeso = prod.saleUnit === "WEIGHT";
        const precio = esPeso ? `${fmtMoneyARS(prod.pricePerKg ?? 0)}/kg` : `${fmtMoneyARS(prod.price ?? 0)}/u`;
        // El disponible sólo si el producto controla stock: si no, el número no manda. Con
        // coma, como se lee acá: "quedan 3,7 kg", no "3.7".
        const quedan = info?.trackStock
          ? ` · quedan ${formatearCantidad(info.stock)} ${esPeso ? "kg" : "u"}`
          : "";
        return { id: prod.id, etiqueta: prod.name, detalle: `${precio}${quedan}` };
      }),
    [products, stockById],
  );
  useEffect(() => {
    if (!focusPedido) return;
    document.getElementById(focusPedido.id)?.focus();
  }, [focusPedido]);

  function setLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    const key = nextKey;
    setLines((ls) => [...ls, { key, productId: "", qtyText: "" }]);
    setNextKey((k) => k + 1);
    return key;
  }
  function removeLine(key: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }

  // Cada línea, ya leída: el número que vale, y si lo tipeado es basura. Se calcula UNA vez
  // por render y lo reusan el total, el botón y la fila.
  const leidas = useMemo(
    () =>
      lines.map((l) => {
        const lectura = leerCantidad(l.qtyText);
        return { ...l, qty: lectura.estado === "ok" ? lectura.valor : 0, invalida: lectura.estado === "invalida" };
      }),
    [lines],
  );

  const subtotal = leidas.reduce((s, l) => {
    const p = byId.get(l.productId);
    if (!p || !(l.qty > 0)) return s;
    return s + l.qty * unitPriceOf(p);
  }, 0);

  const hasValidLine = leidas.some((l) => byId.get(l.productId) && l.qty > 0);
  // Dónde se descuenta el stock: el mostrador (la mercadería está en la mano) o un pedido.
  const contextoStock = isOrder ? "ONLINE" : "COUNTER";
  const faltanteDe = (l: { productId: string; qty: number }) => {
    const p = byId.get(l.productId);
    return p ? faltanteDeLinea(stockById[l.productId], l.qty, { saleUnit: p.saleUnit, contexto: contextoStock }) : null;
  };
  // Alguna línea pide más de lo que hay y la regla NO permite venderla igual. Se bloquea el
  // cobro acá para que la persona corrija la cantidad en vez de chocar con el error del server.
  // El corte por kg en el mostrador no entra acá: avisa en su fila y se vende (MAG-4, ver
  // `permiteVenderSinStock`); el server aplica la misma regla con la unidad leída de la base.
  const hasShortfall = leidas.some((l) => faltanteDe(l)?.bloquea === true);
  // Se cobra en el acto pero todavía no se tocó ningún medio.
  const faltaMedio = paid && !medio;
  // Una línea con producto elegido y cantidad ilegible ("1kg2", "-2") frena el cobro: si se
  // dejara pasar valiendo 0, la línea desaparecería del ticket sin que nadie se entere y se
  // cobraría de menos.
  const hasCantidadInvalida = leidas.some((l) => l.productId && l.invalida);

  // Cobra y, si salió bien, limpia el ticket: dejar las líneas cargadas después de cobrar es
  // invitar a cobrar dos veces lo mismo. Si falló, el ticket queda como estaba para corregir.
  //
  // Y la clave de idempotencia SÓLO se renueva cuando el ticket se limpia. Es el nudo del
  // asunto: si fallara y se renovara igual, el reintento de una venta que en realidad SÍ se
  // grabó (respuesta perdida, no error de negocio) cobraría dos veces.
  async function submit(fd: FormData) {
    if (!ticketKey.current) ticketKey.current = nuevaClaveDeTicket();
    fd.set("idempotencyKey", ticketKey.current);
    let r;
    try {
      r = await createOrder(fd);
    } catch (e) {
      if (isNextRedirect(e)) throw e;
      showError(
        isOrder
          ? "No se pudo registrar el pedido. Revisá la conexión y volvé a intentar con el mismo ticket: " +
              "si ya se había grabado, no se va a registrar dos veces."
          : "No se pudo registrar la venta. Revisá la conexión y volvé a intentar con el mismo ticket: " +
              "si ya se había grabado, no se va a cobrar dos veces.",
      );
      return;
    }
    if (r && !r.ok && r.tipo === "ya-grabada-distinta") {
      setYaGrabada(r.grabada);
      return;
    }
    if (r && !r.ok) {
      // El mensaje viene ENTERO del server (viaja como valor devuelto, no como excepción
      // redactada): dice el día que está cerrado, el producto sin stock o el dato que falta.
      // Un `sin-confirmar` también llega acá con su texto ("no pudimos confirmar…"): la clave
      // se queda, y el reintento encuentra la venta si se grabó.
      showError(r.error);
      return;
    }
    showSuccess(r?.mensaje ?? (isOrder ? "Pedido registrado." : "Venta cobrada."));
    limpiarTicket();
  }

  // El ticket vacío, con clave nueva. El medio vuelve a vacío: el próximo cliente se pregunta de
  // nuevo. Y «Cobrado» vuelve al del modo (mostrador → cobrado, pedido → a cobrar).
  function limpiarTicket() {
    setLines([{ key: nextKey, productId: "", qtyText: "" }]);
    setNextKey((k) => k + 1);
    setMedio("");
    setPaid(!isOrder);
    setYaGrabada(null);
    setCliente(CLIENTE_VACIO);
    ticketKey.current = "";
  }

  // «Cargar sólo lo que falta»: la venta #N ya está grabada y lo cargado traía DE MÁS (el
  // servidor calculó qué). El ticket queda con SÓLO eso, el mismo medio, y otra clave: se cobra
  // aparte, a la vista. Antes, «Empezar de nuevo» lo borraba sin decir que faltaba cobrarlo.
  // Lo que falta sólo se puede cargar solo si todos sus productos siguen en el catálogo (el POS
  // necesita su precio, y el alta no vendería uno que ya no está) y no trae líneas a mano.
  const faltanteFueraDelCatalogo =
    yaGrabada?.faltante?.productos.filter((l) => !byId.has(l.productId)).map((l) => l.nombre) ?? [];
  const faltanteCargable = Boolean(
    yaGrabada && !yaGrabada.anulada && yaGrabada.faltante && yaGrabada.faltante.aMano.length === 0 && faltanteFueraDelCatalogo.length === 0,
  );

  function cargarSoloLoQueFalta(g: VentaYaGrabada) {
    if (!g.faltante) return;
    let n = nextKey;
    const nuevas = g.faltante.productos.map((l) => ({ key: n++, productId: l.productId, qtyText: formatearCantidad(l.cantidad) }));
    setLines(nuevas.length ? nuevas : [{ key: n++, productId: "", qtyText: "" }]);
    setNextKey(n);
    setYaGrabada(null);
    ticketKey.current = "";
    showSuccess(
      `Cargado sólo lo que faltaba de la #${g.code}: ${textoDelFaltante(g.faltante)}. ${g.esPedido ? "Registralo como otro pedido." : "Cobralo aparte."}`,
    );
  }

  // Defensivo: la página ya muestra el estado vacío con la salida al catálogo antes de llegar acá.
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface-sunken p-4 text-sm text-muted">
        No hay productos con precio de venta cargado. Cargalos en el catálogo (precio por unidad o
        por kg) para poder venderlos en la caja.
      </div>
    );
  }

  return (
    <form action={submit} className="rounded-lg border border-line p-4 space-y-4">
      {/* Canal: el hidden refleja el toggle de modo. */}
      <input type="hidden" name="channel" value={isOrder ? "ONLINE" : "COUNTER"} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            // Sólo al CAMBIAR de modo se pone el «Cobrado» del modo: tocar el que ya está
            // elegido no le vuelve a tildar lo que la persona destildó.
            if (!isOrder) return;
            setIsOrder(false);
            setPaid(true);
          }}
          className={`chip-btn text-sm ${!isOrder ? "bg-accent text-on-accent" : ""}`}
        >
          Caja / mostrador
        </button>
        <button
          type="button"
          onClick={() => {
            if (isOrder) return;
            setIsOrder(true);
            setPaid(false);
          }}
          className={`chip-btn text-sm ${isOrder ? "bg-accent text-on-accent" : ""}`}
        >
          Pedido (retiro / envío)
        </button>
        {!isOrder && (
          <span className="text-xs text-faint">
            Buscá el producto, cargá la cantidad (o el peso), elegí cómo pagó y cobrá. Enter salta al siguiente.
          </span>
        )}
      </div>

      {/* Ticket: líneas de venta */}
      <div className="space-y-2">
        {leidas.map((l) => {
          const p = byId.get(l.productId);
          const isWeight = p?.saleUnit === "WEIGHT";
          const lineTotal = p && l.qty > 0 ? l.qty * unitPriceOf(p) : 0;
          const faltante = faltanteDe(l);
          const short = faltante?.bloquea ? faltante : null;
          const avisoStock = faltante && !faltante.bloquea ? faltante.aviso : null;
          // Aviso del decimal olvidado (la balanza dice 1,300 y la mano teclea "1300").
          // Avisa, no bloquea: existe el mayorista que se lleva 40 kg.
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
                  // Otro producto: la cantidad se vuelve a cargar (puede pasar de kg a
                  // unidades). El MISMO producto elegido otra vez no borra lo pesado.
                  if (productId !== l.productId) setLine(l.key, { productId, qtyText: "" });
                  pedirFoco(`qty-${l.key}`); // saltar a pesar/contar
                }}
              />
              <div className="relative">
                {/* type="text", NO type="number".
                    Con `type="number"` el navegador se traga la coma antes de que el código
                    la vea. Medido en Chromium 141 (Playwright, es-AR, 412 px) con el PosForm
                    de 543405f: teclear "1,3" en un vacío a $18.900/kg dejaba el campo en
                    "13", el total en $245.700 (diez veces el de 1,3 kg) y "Cobrar"
                    habilitado. Asignar "1,3" por JS, en cambio, deja el campo vacío: eso es
                    lo que una versión anterior de este comentario tomó por el tipeo.
                    `inputMode="decimal"` deja el teclado numérico en el celular (no medido
                    en un teléfono real); el parseo (coma y punto valen lo mismo, precisión
                    de gramos) vive en pos-peso.ts. */}
                <Input
                  id={`qty-${l.key}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={l.qtyText}
                  aria-label={isWeight ? "Peso en kg" : "Cantidad"}
                  placeholder={p ? (isWeight ? "Peso" : "Cantidad") : "—"}
                  onChange={(e) => setLine(l.key, { qtyText: e.target.value })}
                  onKeyDown={(e) => {
                    // Enter = cerrar esta línea y saltar al próximo producto (flujo de caja).
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (l.qty > 0) pedirFoco(`prod-${addLine()}`);
                    }
                  }}
                  disabled={!p}
                  aria-invalid={short || l.invalida ? true : undefined}
                  className="pr-8 text-right tabular-nums"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-faint">
                  {p ? (isWeight ? "kg" : "u") : ""}
                </span>
              </div>
              {l.invalida && (
                <p role="alert" className="col-span-2 sm:col-span-3 text-xs text-danger">
                  Eso no es una cantidad. Escribí el {isWeight ? "peso" : "número"}, con coma si
                  {isWeight ? " tiene gramos (1,240)" : " hace falta"}.
                </p>
              )}
              {short && (
                <p role="alert" className="col-span-2 sm:col-span-3 text-xs text-danger">
                  No alcanza el stock: quedan {formatearCantidad(short.available)} {isWeight ? "kg" : "u"} de {p?.name}.
                </p>
              )}
              {avisoStock && (
                <p role="status" className="col-span-2 sm:col-span-3 text-xs text-warning">
                  {avisoStock}
                </p>
              )}
              {aviso && (
                <p className="col-span-2 sm:col-span-3 text-xs text-warning">{aviso}</p>
              )}
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="w-24 text-right text-sm tabular-nums text-body">
                  {lineTotal > 0 ? fmtMoneyARS(lineTotal) : "—"}
                </span>
                <button
                  type="button"
                  onClick={() => removeLine(l.key)}
                  aria-label="Quitar línea"
                  className="inline-flex items-center justify-center min-h-6 min-w-6 text-lg leading-none text-muted px-1 hover:text-danger"
                >
                  ×
                </button>
              </div>
              {/* Inputs que viajan a la server action (mismo patrón getAll del Core) */}
              {p && l.qty > 0 && (
                <>
                  <input type="hidden" name="productId" value={l.productId} />
                  {/* Viaja el valor CANÓNICO (punto decimal), no lo tipeado: el server lo
                      vuelve a parsear igual, pero así no depende de que el navegador y el
                      server se pongan de acuerdo sobre la coma. */}
                  <input type="hidden" name="quantity" value={cantidadParaFormulario(l.qty)} />
                </>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => pedirFoco(`prod-${addLine()}`)} className="chip-btn text-sm">
          + Agregar producto
        </button>
      </div>

      {/* Datos del pedido (solo en modo pedido con retiro/envío) */}
      {isOrder && (
        <div className="grid gap-3 sm:grid-cols-2 border-t border-line pt-4">
          <label className="text-sm">
            <span className="block text-muted mb-1">Cliente *</span>
            <Input name="customerName" required={isOrder} placeholder="Nombre y apellido" value={cliente.customerName} onChange={escribir("customerName")} />
          </label>
          <label className="text-sm">
            <span className="block text-muted mb-1">Teléfono / WhatsApp</span>
            <Input name="customerPhone" placeholder="11…" value={cliente.customerPhone} onChange={escribir("customerPhone")} />
          </label>
          <label className="text-sm">
            <span className="block text-muted mb-1">Entrega</span>
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
            <span className="block text-muted mb-1">Horario deseado</span>
            <Input name="scheduledFor" type="datetime-local" value={cliente.scheduledFor} onChange={escribir("scheduledFor")} />
          </label>
          {fulfillment === "DELIVERY" && (
            <label className="text-sm sm:col-span-2">
              <span className="block text-muted mb-1">Dirección *</span>
              <Input
                name="address"
                required={fulfillment === "DELIVERY"}
                placeholder="Calle, número, barrio"
                value={cliente.address}
                onChange={escribir("address")}
              />
            </label>
          )}
          <label className="text-sm sm:col-span-2">
            <span className="block text-muted mb-1">Nota</span>
            <Input name="notes" placeholder="Ej.: cortar en milanesas, sin grasa" value={cliente.notes} onChange={escribir("notes")} />
          </label>
        </div>
      )}

      {/* Cobro (la venta de mostrador se cobra en el acto).
          Chips y no un select, y NINGUNO elegido de entrada (MAG-1): el select arrancaba en
          EFECTIVO y si el cliente pagaba con MP y nadie lo tocaba, el libro asentaba plata en
          el cajón que nunca entró. Un toque más por venta a cambio de que el cierre cuadre.
          Los valores son string literals (caja/medio-cobro.ts), no el enum de Prisma: esto es
          un client component. */}
      <div className="space-y-3 border-t border-line pt-4">
        <label className="flex min-h-11 w-fit items-center gap-2 text-sm">
          {/* `key` por modo: React deja como `defaultChecked` el valor con que la casilla se
              MONTÓ, y el reseteo automático del <form> de React 19 al terminar la acción la
              vuelve a ese valor. Medido en Chromium: montada en mostrador (tildada) y
              registrado un pedido, la pantalla mostraba «Cobrado» tildado con el estado en
              false. Montándola de nuevo al cambiar de modo, su default es el del modo, que es
              el mismo al que `submit` devuelve `paid` después de cada venta. */}
          <input
            key={isOrder ? "cobrado-pedido" : "cobrado-mostrador"}
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
              // Radios de teclado (patrón WAI-ARIA): las flechas pasan al medio de al lado y lo
              // eligen, igual que un grupo de radios nativo. Es un toque deliberado, no un
              // default: sin tecla ni toque, sigue sin haber medio.
              const paso =
                e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
              if (!paso) return;
              e.preventDefault();
              const n = MEDIOS_DE_COBRO.length;
              const actual = MEDIOS_DE_COBRO.findIndex((m) => `pos-medio-${m.valor}` === (e.target as HTMLElement).id);
              const sig = MEDIOS_DE_COBRO[(Math.max(actual, 0) + paso + n) % n];
              setMedio(sig.valor);
              document.getElementById(`pos-medio-${sig.valor}`)?.focus();
            }}
          >
            {MEDIOS_DE_COBRO.map((m, i) => (
              <button
                key={m.valor}
                id={`pos-medio-${m.valor}`}
                type="button"
                role="radio"
                aria-checked={medio === m.valor}
                // Un solo chip en el orden de Tab: el elegido, o el primero si no hay ninguno.
                tabIndex={(medio ? medio === m.valor : i === 0) ? 0 : -1}
                onClick={() => setMedio(m.valor)}
                className={`chip-btn h-11 px-4 text-sm ${medio === m.valor ? "bg-accent text-on-accent" : ""}`}
              >
                {m.etiqueta}
              </button>
            ))}
            {/* Sólo viaja si se cobra y se eligió: sin medio, el server rechaza (no asume). */}
            {medio && <input type="hidden" name="paymentMethod" value={medio} />}
          </div>
        )}
      </div>

      {yaGrabada && (
        <AvisoError
          titulo={tituloDeYaGrabada(yaGrabada)}
          comoSeguir={
            yaGrabada.anulada
              ? `${detalleDeYaGrabada(yaGrabada)} Para ${yaGrabada.esPedido ? "registrarlo" : "cobrarla"} de nuevo, tocá «Empezar de nuevo» y cargá ${yaGrabada.esPedido ? "el pedido" : "la venta"} otra vez.`
              : faltanteCargable
                ? yaGrabada.esPedido
                  ? `${detalleDeYaGrabada(yaGrabada)} Eso hay que registrarlo APARTE, como otro pedido: tocá «Cargar sólo lo que falta». ` +
                    `«Empezar de nuevo» limpia el ticket y lo que falta NO queda registrado.`
                  : `${detalleDeYaGrabada(yaGrabada)} Eso hay que cobrarlo APARTE: tocá «Cargar sólo lo que falta». ` +
                    `«Empezar de nuevo» limpia el ticket y lo que falta NO queda cobrado.`
                : faltanteFueraDelCatalogo.length > 0
                  ? `${detalleDeYaGrabada(yaGrabada)} ${faltanteFueraDelCatalogo.join(", ")} ya no está en el catálogo: no se puede cargar solo. ` +
                    `Si hay que ${yaGrabada.esPedido ? "registrarlo" : "cobrarlo"}, anotalo antes de tocar «Empezar de nuevo».`
                  : `${detalleDeYaGrabada(yaGrabada)} Si la #${yaGrabada.code} está bien, tocá «Empezar de nuevo»: se limpia este ticket y la ` +
                    `#${yaGrabada.code} queda como está. Si quedó mal, anulala en la bandeja o en Ventas del día y cargá ` +
                    `${yaGrabada.esPedido ? "el pedido" : "la venta"} de nuevo.`
          }
          accion={
            <>
              {faltanteCargable && (
                <button type="button" onClick={() => cargarSoloLoQueFalta(yaGrabada)} className={buttonClasses("solid", "md")}>
                  Cargar sólo lo que falta
                </button>
              )}
              {/* Un botón que se ve: cuando es la única salida, no puede quedar como un texto gris. */}
              <button type="button" onClick={limpiarTicket} className={buttonClasses(faltanteCargable ? "outline" : "solid", "md")}>
                Empezar de nuevo
              </button>
            </>
          }
        />
      )}

      <div className="flex items-center justify-between border-t border-line pt-4">
        <div className="text-sm text-muted">
          Total{" "}
          <span className="ml-1 text-2xl font-semibold tabular-nums text-strong">
            {fmtMoneyARS(subtotal)}
          </span>
        </div>
        <CobrarSubmit
          disabled={!hasValidLine || hasShortfall || hasCantidadInvalida || faltaMedio || yaGrabada !== null}
          label={
            yaGrabada
              ? `Revisá ${yaGrabada.esPedido ? "el pedido" : "la venta"} #${yaGrabada.code}`
              : faltaMedio
                ? "Elegí cómo pagó"
                : isOrder
                  ? "Registrar pedido"
                  : "Cobrar"
          }
        />
      </div>
    </form>
  );
}
