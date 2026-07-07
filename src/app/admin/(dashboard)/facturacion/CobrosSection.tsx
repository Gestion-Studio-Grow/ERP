"use client";

// Generar cobro por Mercado Pago (link de pago / Checkout Pro) — módulo Cobros.
// El link se comparte por WhatsApp (cultura argentina, ADR-044). Modo sandbox por
// defecto: sin credenciales devuelve un link de prueba; con MP_MODO=real, uno real.

import { useState } from "react";
import { generarCobro, type GenerarCobroResult } from "@/lib/cobros-actions";
import { useToast } from "../ToastProvider";
import { Input } from "@/components/ui";

export default function CobrosSection({ modo }: { modo: "stub" | "real" }) {
  const [link, setLink] = useState<Extract<GenerarCobroResult, { ok: true }> | null>(null);
  const [enviando, setEnviando] = useState(false);
  const { showError, showSuccess } = useToast();

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      showSuccess("Link copiado. Pegalo en el WhatsApp del cliente.");
    } catch {
      showError("No se pudo copiar. Copialo a mano.");
    }
  }

  return (
    <section>
      <h2 className="mb-1 text-lg font-medium text-strong">Generar cobro (Mercado Pago)</h2>
      <p className="mb-3 text-sm text-muted">
        Creá un link de pago para mandarle al cliente por WhatsApp. Cuando paga, el cobro entra
        solo.
        {modo === "stub" && (
          <span className="ml-2 rounded bg-surface-sunken px-2 py-0.5 text-xs text-muted">
            modo prueba (sandbox) — el link no cobra de verdad
          </span>
        )}
      </p>

      <form
        action={async (fd) => {
          setEnviando(true);
          setLink(null);
          try {
            const res = await generarCobro(fd);
            if (res.ok) {
              setLink(res);
              showSuccess("Link de cobro generado.");
            } else {
              showError(res.error);
            }
          } finally {
            setEnviando(false);
          }
        }}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        <Input name="concepto" required placeholder="Concepto (qué cobrás)" className="col-span-2" />
        <Input name="monto" type="number" step="0.01" min="0" required placeholder="Monto $" />
        <Input name="referenciaExterna" placeholder="Ref. (turno/pedido, opcional)" />
        <Input name="emailPagador" type="email" placeholder="Email del cliente (opcional)" className="col-span-2" />
        <button
          type="submit"
          disabled={enviando}
          className="col-span-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {enviando ? "Generando…" : "Generar link de cobro"}
        </button>
      </form>

      {link && (
        <div className="mt-4 rounded-lg border border-line bg-surface-sunken p-4">
          <p className="mb-1 text-sm font-medium text-strong">Link de cobro listo</p>
          <p className="mb-2 break-all text-sm text-muted">{link.initPoint}</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => copiar(link.initPoint)}
              className="text-sm font-medium"
            >
              Copiar link
            </button>
            <a
              href={link.initPoint}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted underline"
            >
              Abrir
            </a>
            {link.modo === "stub" && (
              <span className="text-xs text-muted">
                (link de prueba — se activa de verdad al cargar las credenciales)
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
