"use client";

// «Link de pago» de un pedido de la bandeja: un link de Mercado Pago por el total del pedido
// (el monto sale de la base, no de esta pantalla), para mandarle al cliente por WhatsApp.
//
// Cuando el cliente paga, el pedido TODAVÍA NO se cobra solo: el Core sabe hacerlo
// (`cobrarPedidoPorAvisoDePago`, un solo asiento aunque el aviso se repita), pero el webhook de
// producción no se lo pasa al handler (link-de-pago.ts dice qué falta). Por eso, con un link
// de verdad, la pantalla dice que el pago se marca con «Cobrar».
//
// En modo de prueba sin Mercado Pago (el simulador de avisos), el link dice que es de prueba y
// aparece «Simular que pagó», que corre el handler del plugin con el cobro de pedidos conectado
// (sin la ruta del webhook ni su firma).
//
// Las acciones se invocan directo (no `useActionState`): ver caja/libro/LibroForms.tsx.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generarLinkDePagoDePedido,
  simularPagoDePedido,
  type EstadoLinkDePago,
  type EstadoSimulacionDePago,
} from "@/lib/cobros-actions";
import { fmtMoneyARS } from "@/components/ui/format";
import { useToast } from "../ToastProvider";
import type { LinkEnviado } from "./link-de-pago";

function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export default function LinkDePagoPedido({
  id,
  code,
  total,
  cobrado = false,
  enviado,
  whatsappEnviado,
  simulacion,
}: {
  id: string;
  code: number;
  /** El pedido ya está cobrado: sólo queda (en prueba) repetir el aviso, para ver que no asienta dos veces. */
  cobrado?: boolean;
  /** El total del pedido HOY: si se pesó y ajustó después del link, el link ya no alcanza. */
  total: number;
  /** El último link que se generó para este pedido (de la auditoría), si hubo. */
  enviado: LinkEnviado | null;
  /** El WhatsApp al cliente con ese link ya escrito (lo arma la página), o null. */
  whatsappEnviado: string | null;
  /** ¿Se ofrece «Simular que pagó»? Sólo en el modo de prueba con el simulador prendido. */
  simulacion: boolean;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [link, setLink] = useState<Extract<EstadoLinkDePago, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<EstadoSimulacionDePago>(null);
  const [pending, startTransition] = useTransition();

  const url = link?.url ?? enviado?.url ?? null;
  const monto = link?.monto ?? enviado?.monto ?? null;
  const prueba = link?.prueba ?? enviado?.prueba ?? false;
  const whatsapp = link ? link.whatsapp : whatsappEnviado;
  // El pedido cambió después de mandar el link (se pesó y ajustó): ese link cobra otro monto, y
  // el aviso de pago no lo va a cobrar solo. Se ofrece generar uno nuevo.
  const desactualizado = monto != null && Math.abs(monto - total) > 0.009;

  function generar() {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      try {
        const r = await generarLinkDePagoDePedido(null, fd);
        if (r && r.ok) {
          setLink(r);
          setError(null);
          showSuccess(`Link del pedido #${code} listo: ${fmtMoneyARS(r.monto)}.`);
        } else if (r) {
          setError(r.error);
          showError(r.error);
        }
      } catch (e) {
        if (isNextRedirect(e)) throw e;
        const msg = "No se pudo generar el link. Revisá la conexión y volvé a intentar.";
        setError(msg);
        showError(msg);
      }
    });
  }

  function simular() {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      try {
        const r = await simularPagoDePedido(null, fd);
        setAviso(r);
        if (r?.ok) {
          showSuccess(r.mensaje);
          router.refresh();
        } else if (r) {
          showError(r.error);
        }
      } catch (e) {
        if (isNextRedirect(e)) throw e;
        const msg = "No se pudo simular el aviso de pago.";
        setAviso({ ok: false, error: msg });
        showError(msg);
      }
    });
  }

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showSuccess("Link copiado. Pegalo en el WhatsApp del cliente.");
    } catch {
      showError("No se pudo copiar. Copialo a mano.");
    }
  }

  if (cobrado) {
    return (
      <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:items-end">
        {simulacion && (
          <button type="button" onClick={simular} disabled={pending} className="chip-btn h-11 text-xs sm:h-auto">
            {pending ? "Esperando el aviso…" : "Repetir el aviso de pago (prueba)"}
          </button>
        )}
        {aviso && (
          <p role={aviso.ok ? "status" : "alert"} className={`text-xs ${aviso.ok ? "text-success" : "text-danger"}`}>
            {aviso.ok ? aviso.mensaje : aviso.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:items-end">
      {url ? (
        <>
          <p className="text-xs text-muted">
            Link de Mercado Pago{monto != null ? ` por ${fmtMoneyARS(monto)}` : ""}
            {prueba ? " · de prueba, no cobra" : " · cuando veas el pago en Mercado Pago, marcalo con «Cobrar»"}
          </p>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button type="button" onClick={() => void copiar()} className="chip-btn h-11 text-xs sm:h-auto">
              Copiar link
            </button>
            {whatsapp && !desactualizado && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="chip-btn h-11 text-xs sm:h-auto"
              >
                Mandar por WhatsApp
              </a>
            )}
            {simulacion && (
              <button type="button" onClick={simular} disabled={pending} className="chip-btn h-11 text-xs sm:h-auto">
                {pending ? "Esperando el aviso…" : "Simular que pagó (prueba)"}
              </button>
            )}
            {desactualizado && (
              <button type="button" onClick={generar} disabled={pending} className="chip-btn h-11 text-xs sm:h-auto">
                {pending ? "Generando…" : `Generar otro por ${fmtMoneyARS(total)}`}
              </button>
            )}
          </div>
          {desactualizado && (
            <p role="alert" className="text-xs text-warning">
              El pedido cambió: este link cobra {fmtMoneyARS(monto)}. Mandá uno nuevo.
            </p>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={generar}
          disabled={pending}
          className="chip-btn h-11 w-full justify-center text-xs sm:h-auto sm:w-auto"
        >
          {pending ? "Generando…" : "Link de pago"}
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {aviso && (
        <p role={aviso.ok ? "status" : "alert"} className={`text-xs ${aviso.ok ? "text-success" : "text-danger"}`}>
          {aviso.ok ? aviso.mensaje : aviso.error}
        </p>
      )}
    </div>
  );
}
