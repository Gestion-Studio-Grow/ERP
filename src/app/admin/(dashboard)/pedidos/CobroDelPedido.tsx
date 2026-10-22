"use client";

// ============================================================================
// COBRAR / ENTREGAR un pedido — la tecla del paso que sigue, en el pie del cajón (diseño nuevo).
// ============================================================================
//
// Los medios como segmentado (Efectivo · Mercado Pago · Transferencia) y la tecla que dice lo que
// va a pasar («Cobrar $52.340 y entregar»). SIN medio por defecto: el medio se elige, no se asume
// (caja/medio-cobro.ts). Entregar sin cobrar exige tildar «Queda a cobrar», como siempre.
//
// Llama las MISMAS acciones de la bandeja (`cobrarPedido`, `entregarPedido`) con los MISMOS campos
// (formularios-del-pedido.ts). Se invocan directo y no con `useActionState`, por lo mismo que
// CobrarPedidoForm: al salir bien el pedido cambia y esto se desmonta; el resultado va al aviso.

//
// MOSTRADOR BOUTIQUE (interruptor «mostrador-boutique», Magra tanda 1 · 1C): con el interruptor
// prendido, el cobro y la entrega usan el PIE DE COBRO único (`PieDeCobro`: medios que cobran de un
// toque, billetes con vuelto, pago dividido) y, al cobrar, el ticket de la venta (`TicketVenta`) con
// el vuelto en grande, WhatsApp e Imprimir. El ticket vive en `CobroDelNegocio` (un nivel arriba de
// la bandeja): cuando el pedido cobrado y entregado se va de la lista, la fila y el cajón se
// desmontan y el ticket tiene que seguir a la vista. Apagado, todo como siempre.

import { createContext, useContext, useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cobrarPedido, entregarPedido, type OrderActionState } from "@/lib/order-actions";
import { MEDIOS_DE_COBRO } from "@/lib/caja/medio-cobro";
import { Button, Segmented } from "@/components/ui";
import { Dialogo } from "@/components/ui/Cajon";
import { Icono, iconoDelMedio } from "@/components/ui/Icono";
import { fmtMoneyARS } from "@/components/ui/format";
import { PieDeCobro, type ResultadoDelPie } from "@/components/cobro/PieDeCobro";
import { camposDelPie, textoPlata } from "@/lib/cobro/pie-de-cobro-core";
import TicketVenta from "../vender/TicketVenta";
import type { VentaTicket } from "../vender/reglas-venta";
import { useToast } from "../ToastProvider";
import { aFormData, camposDeLaEntrega, camposDelCobro, esRedirectDeNext, textoDeLaEntrega } from "./formularios-del-pedido";

// ── El negocio del cobro: ¿mostrador boutique? y el ticket del último cobro ──────────────────

type CobroMostrado = { venta: VentaTicket; vuelto: number | null; pagoCon: number | null };

type ContextoDelCobro = {
  /** Interruptor «mostrador-boutique» prendido (lo decide el servidor, pedidos/page.tsx). */
  boutique: boolean;
  negocio: string;
  mostrarCobro: (c: CobroMostrado) => void;
};

const Contexto = createContext<ContextoDelCobro>({ boutique: false, negocio: "", mostrarCobro: () => {} });

export function useCobroDelNegocio(): ContextoDelCobro {
  return useContext(Contexto);
}

/** ¿La venta del ticket quedó cobrada? (con medio, o con varios medios). */
export function ventaCobrada(v: Pick<VentaTicket, "medio" | "pagos">): boolean {
  return v.medio != null || (v.pagos?.length ?? 0) > 0;
}

/**
 * Lo que va arriba de la bandeja: el interruptor para los formularios de cobro y el ticket del
 * último cobro (un diálogo que sobrevive al refresco de la lista).
 */
export function CobroDelNegocio({ boutique, negocio, children }: { boutique: boolean; negocio: string; children: ReactNode }) {
  const [cobro, setCobro] = useState<CobroMostrado | null>(null);
  return (
    <Contexto.Provider value={{ boutique, negocio, mostrarCobro: setCobro }}>
      {children}
      {cobro && (
        <Dialogo
          abierto
          onCerrar={() => setCobro(null)}
          titulo={`Pedido #${cobro.venta.code} cobrado`}
          descripcion={`${cobro.venta.cliente ?? "Cliente"} · ${textoPlata(cobro.venta.total)}`}
          pie={
            <Button size="lg" onClick={() => setCobro(null)}>
              Listo
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            {cobro.vuelto !== null && cobro.vuelto > 0 && (
              <p className="flex items-baseline justify-between gap-3" aria-live="polite">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">Vuelto</span>
                <span className="font-display text-5xl leading-none tabular-nums text-strong">{textoPlata(cobro.vuelto)}</span>
              </p>
            )}
            <TicketVenta venta={cobro.venta} negocio={negocio} pagoCon={cobro.pagoCon} imprimirAlCobrar />
          </div>
        </Dialogo>
      )}
    </Contexto.Provider>
  );
}

/**
 * Cobrar o entregar con el PIE DE COBRO (mostrador boutique). Manda los MISMOS campos que lee el
 * servidor (`leerPagos`, cobro/leer-pagos.ts): `id` y lo que escribe el pie (`camposDelPie`). Con
 * «Queda a cobrar» se entrega sin medio (`quedaACobrar=on`), como siempre (MG-014).
 */
export function CobroConPie({
  id,
  code,
  total,
  modo,
  onHecho,
}: {
  id: string;
  code: number;
  total: number;
  /** `entregar`: un pedido Listo sin cobrar (cobra y entrega, o entrega sin cobrar). `cobrar`: sólo cobra. */
  modo: "entregar" | "cobrar";
  onHecho?: () => void;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const { mostrarCobro } = useCobroDelNegocio();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function enviar(fd: FormData, pagoCon: number | null): Promise<void> {
    let r: OrderActionState;
    try {
      r = modo === "cobrar" ? await cobrarPedido(null, fd) : await entregarPedido(null, fd);
    } catch (e) {
      if (esRedirectDeNext(e)) throw e;
      const msg = `No se pudo ${modo === "cobrar" ? "cobrar" : "entregar"} el pedido #${code}. Revisá la conexión y volvé a intentar: si ya se había cobrado, no se cobra dos veces.`;
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
    if (r?.venta && ventaCobrada(r.venta)) mostrarCobro({ venta: r.venta, vuelto: r.vuelto ?? null, pagoCon });
    showSuccess(r?.mensaje ?? (modo === "cobrar" ? `Pedido #${code} cobrado.` : `Pedido #${code} entregado.`));
    onHecho?.();
    router.refresh();
  }

  function cobrar(res: ResultadoDelPie): Promise<void> {
    const fd = aFormData([["id", id], ...camposDelPie(total, res)]);
    // Lo que entregó en efectivo, también en un pago dividido: el ticket dice «Pagó con $X · Vuelto $Y» (O-3).
    const conEfectivo = res.modo === "simple" ? res.medio === "EFECTIVO" : res.pagos.some((p) => p.medio === "EFECTIVO");
    const pagoCon = conEfectivo && res.recibido !== undefined ? res.recibido : null;
    return enviar(fd, pagoCon);
  }

  return (
    <div className="flex w-full flex-col gap-2 whitespace-normal" aria-label={modo === "cobrar" ? `Cobrar el pedido #${code}` : `Entregar el pedido #${code}`} role="group">
      <PieDeCobro total={total} textoBoton={modo === "cobrar" ? "Cobrar" : "Cobrar y entregar"} onCobrar={cobrar} />
      {modo === "entregar" && (
        <Button
          type="button"
          variant="outline"
          size="md"
          disabled={pending}
          estado={pending ? "cargando" : undefined}
          onClick={() => startTransition(() => enviar(aFormData([["id", id], ["quedaACobrar", "on"]]), null))}
        >
          Queda a cobrar: entregar sin cobrar
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export default function CobroDelPedido(props: Parameters<typeof CobroDeSiempre>[0]) {
  const { boutique } = useCobroDelNegocio();
  const conMedios = props.modo === "cobrar" || !props.cobrado;
  if (boutique && conMedios) return <CobroConPie id={props.id} code={props.code} total={props.total} modo={props.modo} />;
  return <CobroDeSiempre {...props} />;
}

function CobroDeSiempre({
  id,
  code,
  total,
  cobrado,
  modo,
}: {
  id: string;
  code: number;
  total: number;
  cobrado: boolean;
  /** `entregar`: un pedido Listo (cobra y entrega, o entrega sin cobrar). `cobrar`: sólo cobra. */
  modo: "entregar" | "cobrar";
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [medio, setMedio] = useState("");
  const [quedaACobrar, setQuedaACobrar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const uid = useId();

  function enviar() {
    const fd = aFormData(
      modo === "cobrar" ? camposDelCobro({ id, medio }) : camposDeLaEntrega({ id, medio, quedaACobrar, cobrado }),
    );
    startTransition(async () => {
      let r;
      try {
        r = modo === "cobrar" ? await cobrarPedido(null, fd) : await entregarPedido(null, fd);
      } catch (e) {
        if (esRedirectDeNext(e)) throw e;
        const msg = `No se pudo ${modo === "cobrar" ? "cobrar" : "entregar"} el pedido #${code}. Revisá la conexión y volvé a intentar: si ya se había cobrado, no se cobra dos veces.`;
        setError(msg);
        showError(msg);
        return;
      }
      if (r && !r.ok) {
        setError(r.error);
        showError(r.error);
        // Si otra pantalla ya lo cobró o lo movió, el tablero tiene que mostrarlo.
        router.refresh();
        return;
      }
      setError(null);
      showSuccess(r?.mensaje ?? (modo === "cobrar" ? `Pedido #${code} cobrado.` : `Pedido #${code} entregado.`));
      router.refresh();
    });
  }

  const conMedios = modo === "cobrar" || !cobrado;
  const texto =
    modo === "cobrar" ? `Cobrar ${fmtMoneyARS(total)}` : textoDeLaEntrega({ cobrado, medio, quedaACobrar, total: fmtMoneyARS(total) });

  return (
    <form
      noValidate
      aria-label={modo === "cobrar" ? `Cobrar el pedido #${code}` : `Entregar el pedido #${code}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) enviar();
      }}
      className="flex flex-col gap-3"
    >
      {conMedios && (
        <Segmented
          name="paymentMethod"
          leyenda={`¿Cómo pagó el pedido #${code}?`}
          leyendaVisible
          tono="acento"
          lleno
          value={quedaACobrar ? "" : medio}
          // Cada medio con su ícono; el elegido, con el tilde (además del acento).
          opciones={MEDIOS_DE_COBRO.map((m) => ({
            valor: m.valor,
            etiqueta: m.etiqueta,
            icono: <Icono nombre={!quedaACobrar && medio === m.valor ? "listo" : iconoDelMedio(m.valor)} />,
            disabled: quedaACobrar,
          }))}
          onChange={(e) => {
            const t = e.target as unknown as HTMLInputElement;
            if (t.name === "paymentMethod") {
              setMedio(t.value);
              setError(null);
            }
          }}
        />
      )}
      {modo === "entregar" && !cobrado && (
        <label htmlFor={`${uid}-queda`} className="flex min-h-11 items-center gap-2 text-sm text-body">
          <input
            id={`${uid}-queda`}
            type="checkbox"
            checked={quedaACobrar}
            onChange={(e) => {
              setQuedaACobrar(e.target.checked);
              if (e.target.checked) setMedio("");
              setError(null);
            }}
            className="size-5"
          />
          Queda a cobrar: se lo lleva sin pagar
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} estado={pending ? "cargando" : undefined} className="w-full">
        {pending ? (modo === "cobrar" ? "Cobrando…" : "Entregando…") : texto}
      </Button>
    </form>
  );
}
