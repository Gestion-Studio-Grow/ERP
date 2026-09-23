"use client";

// «Pesar y ajustar»: el pedido de la tienda se pesa al envasar y se cobra el peso real.
//
// La vidriera le dice al cliente que "el total puede ajustarse al peso real de cada pieza" y
// hasta ahora no había botón para hacerlo: `updateOrderItems` existía sin pantalla. El pedido
// de 0,5 kg que pesó 1,240 se cobraba 0,5 o se anotaba la diferencia en un papel.
//
// Sólo mientras el pedido NO está cobrado (la regla y el porqué, en `planEdicionDeLineas`):
// si ya se cobró, se anula y se rehace. El precio por kilo es el del pedido, no el de hoy, y
// las líneas con precio a mano quedan como están (`lineasDelAjuste`). El stock se mueve por la
// diferencia. El descuento a mano conserva su PORCENTAJE (`descuentoDelAjuste`): si conservara
// los pesos, una pesada a la baja lo subiría hasta el 100 % y pasaría el tope de recepción. El
// de un CUPÓN se recalcula con la regla del cupón (`cupon`, la que escribió el alta): el de
// monto fijo sigue siendo el mismo monto. La cuenta que se ve acá es la misma función que usa
// el servidor, con el mismo cupón, redondeada igual.
//
// Se invoca directo, como CobrarPedidoForm: al salir bien la bandeja se refresca y el
// resultado —el total de antes y el de ahora— va al toast.

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrderItems } from "@/lib/order-actions";
import { leerCantidad, cantidadParaFormulario, formatearCantidad, avisoDeCantidad } from "@/lib/pos-peso";
import { fmtMoneyARS } from "@/components/ui/format";
import { round2 } from "@/lib/round";
import {
  descuentoDelAjuste,
  envioDeLasLineas,
  esLineaDeEnvio,
  textoDelDescuentoDelAjuste,
  type CuponDelPedido,
} from "../vender/reglas-venta";
import { useToast } from "../ToastProvider";

type Linea = {
  productId: string | null;
  name: string;
  saleUnit: "UNIT" | "WEIGHT";
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export default function AjustarPedidoForm({
  id,
  code,
  items,
  subtotal: subtotalAntes,
  descuento,
  cupon = null,
  etiqueta = "Pesar y ajustar",
}: {
  id: string;
  code: number;
  items: Linea[];
  /** Subtotal guardado del pedido: la base sobre la que se calculó el descuento. */
  subtotal: number;
  /** Descuento guardado, en pesos. */
  descuento: number;
  /** El cupón con el que se tomó el pedido (`leerCuponDelPedido`), o nada si no tuvo. */
  cupon?: CuponDelPedido | null;
  etiqueta?: string;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const uid = useId();
  const conProducto = items.filter((it): it is Linea & { productId: string } => it.productId != null);
  const aMano = items.filter((it) => it.productId == null);
  const [textos, setTextos] = useState<string[]>(() => conProducto.map((it) => formatearCantidad(it.quantity)));

  const leidas = conProducto.map((it, i) => {
    const l = leerCantidad(textos[i]);
    const qty = l.estado === "ok" ? l.valor : 0;
    return { ...it, qty, invalida: l.estado === "invalida", total: round2(qty * it.unitPrice) };
  });
  const subtotal = round2(
    leidas.reduce((s, l) => s + l.total, 0) + aMano.reduce((s, l) => s + l.lineTotal, 0),
  );
  // El envío (una línea sin producto que el ajuste no toca) no es base del descuento.
  const desc = descuentoDelAjuste({
    descuentoAntes: descuento,
    subtotalAntes,
    subtotalNuevo: subtotal,
    envio: envioDeLasLineas(aMano),
    cupon,
  });
  const textoDescuento = textoDelDescuentoDelAjuste(desc, cupon);
  const total = round2(subtotal - desc.descuento);
  const hayInvalida = leidas.some((l) => l.invalida);
  const sinLineas = !leidas.some((l) => l.qty > 0) && aMano.length === 0;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      let r;
      try {
        r = await updateOrderItems(null, fd);
      } catch (err) {
        if (isNextRedirect(err)) throw err;
        const msg = "No se pudo ajustar el pedido. Revisá la conexión y volvé a intentar.";
        setError(msg);
        showError(msg);
        return;
      }
      if (r && !r.ok) {
        setError(r.error);
        showError(r.error);
        router.refresh();
        return;
      }
      setError(null);
      setAbierto(false);
      showSuccess(r?.mensaje ?? `Pedido #${code} ajustado.`);
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-expanded={false}
        className="chip-btn text-xs h-11 sm:h-auto w-full sm:w-auto"
      >
        {etiqueta}
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      role="group"
      aria-labelledby={`${uid}-titulo`}
      className="flex w-80 max-w-full flex-col gap-2 whitespace-normal rounded-md border border-line bg-surface-sunken p-3"
    >
      <input type="hidden" name="id" value={id} />
      <p id={`${uid}-titulo`} className="text-xs font-medium text-strong">
        Peso real del pedido #{code}
      </p>
      {leidas.map((l, i) => {
        const esPeso = l.saleUnit === "WEIGHT";
        const aviso = !l.invalida ? avisoDeCantidad({ valor: l.qty, saleUnit: l.saleUnit }) : null;
        const inputId = `${uid}-q-${i}`;
        return (
          <div key={`${l.productId}-${i}`} className="space-y-1">
            <div className="grid grid-cols-[1fr_6.5rem] items-center gap-2">
              <label htmlFor={inputId} className="min-w-0 text-xs text-body">
                <span className="block truncate">{l.name}</span>
                <span className="text-faint">
                  {fmtMoneyARS(l.unitPrice)}
                  {esPeso ? "/kg" : "/u"} · {l.total > 0 ? fmtMoneyARS(l.total) : "se saca"}
                </span>
              </label>
              <div className="relative">
                <input
                  id={inputId}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={textos[i]}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTextos((ts) => ts.map((t, j) => (j === i ? v : t)));
                    setError(null);
                  }}
                  aria-invalid={l.invalida ? true : undefined}
                  className="h-11 w-full rounded-md border border-line-strong bg-surface-raised pl-2 pr-7 text-right text-sm tabular-nums text-strong focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:border-danger"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-faint">
                  {esPeso ? "kg" : "u"}
                </span>
              </div>
            </div>
            {l.invalida && (
              <p role="alert" className="text-xs text-danger">
                Eso no es una cantidad: escribí el {esPeso ? "peso con coma (1,240)" : "número"}.
              </p>
            )}
            {aviso && <p className="text-xs text-warning">{aviso}</p>}
            {l.qty > 0 && (
              <>
                <input type="hidden" name="productId" value={l.productId} />
                <input type="hidden" name="quantity" value={cantidadParaFormulario(l.qty)} />
              </>
            )}
          </div>
        );
      })}
      {aMano.map((l, i) => (
        <p key={`a-${i}`} className="text-xs text-muted">
          {l.name} ({esLineaDeEnvio(l) ? "envío" : "precio a mano"}) · {fmtMoneyARS(l.lineTotal)} — queda igual
        </p>
      ))}
      <p className="text-xs text-body">
        {textoDescuento && <>{textoDescuento} · </>}
        Total nuevo <strong className="tabular-nums text-strong">{fmtMoneyARS(total)}</strong>
      </p>
      {sinLineas && (
        <p role="alert" className="text-xs text-danger">
          Dejá al menos un producto con cantidad. Si el pedido no va, anulalo.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending || hayInvalida || sinLineas}
          className="chip-btn text-xs h-11 sm:h-auto disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar peso real"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setError(null);
            setTextos(conProducto.map((it) => formatearCantidad(it.quantity)));
          }}
          className="h-11 px-2 text-xs text-muted hover:underline sm:h-8"
        >
          Volver
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
