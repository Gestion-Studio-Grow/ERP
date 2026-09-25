"use client";

// ============================================================================
// COBRAR CON LINK de Mercado Pago (diseño nuevo «Renglón»).
// ============================================================================
//
// Qué se cobra y cuánto, y el link listo para mandar por WhatsApp. La MISMA acción de siempre
// (`generarCobro`, cobros-actions.ts) con los MISMOS campos (concepto, monto, referenciaExterna,
// emailPagador). Cambia el campo de la plata: el de antes era `type="number"`, que en Chromium
// tira la coma al tipear («12,5» → 125); acá se escribe como se escribe la plata («12.500,50»), se
// lee con `leerImporte` (la regla de la caja) y viaja como número canónico («12500.5»), que es lo
// que la acción lee con `Number()`. Lo prueba cobrar-con-link.test.ts.

import { useState } from "react";
import { generarCobro, type GenerarCobroResult } from "@/lib/cobros-actions";
import { generarCobroDePruebaAction } from "@/lib/mercadopago-pruebas-actions";
import type { ModoCobros } from "@/lib/mercadopago-cobros-dispatch";
import { leerImporte } from "@/lib/pos-peso";
import { Button, Field, Input, Plata } from "@/components/ui";
import { useToast } from "../ToastProvider";
import { montoParaElLink } from "./cobrar-con-link";

type LinkListo = Extract<GenerarCobroResult, { ok: true }>;

export default function CobrarConLink({ modo }: { modo: ModoCobros }) {
  const { showError, showSuccess } = useToast();
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [referencia, setReferencia] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [link, setLink] = useState<LinkListo | null>(null);
  const [copiado, setCopiado] = useState(false);
  const lectura = leerImporte(monto);

  async function generar() {
    const canonico = montoParaElLink(monto);
    if (!concepto.trim()) return setError("Escribí qué cobrás (aparece en el link que ve el cliente).");
    if (canonico === null) return setError("Escribí el monto, mayor a cero, con coma si tiene centavos (12.500,50).");
    setError(null);
    setEnviando(true);
    setLink(null);
    const fd = new FormData();
    fd.set("concepto", concepto.trim());
    fd.set("monto", canonico);
    fd.set("referenciaExterna", referencia.trim());
    fd.set("emailPagador", email.trim());
    try {
      const r = await generarCobro(fd);
      if (r.ok) {
        setLink(r);
        showSuccess("Link de cobro listo.");
      } else {
        setError(r.error);
      }
    } catch {
      setError("No se pudo generar el link: revisá la conexión y volvé a intentar.");
    } finally {
      setEnviando(false);
    }
  }

  async function probar() {
    setProbando(true);
    try {
      const r = await generarCobroDePruebaAction();
      if (r.ok) {
        setLink({ ok: true, preferenceId: r.preferenceId, initPoint: r.initPoint, sandboxInitPoint: r.sandboxInitPoint, modo: r.modo });
        showSuccess("Cobro de prueba generado.");
      } else showError(r.error);
    } finally {
      setProbando(false);
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      showError("No se pudo copiar: copialo a mano.");
    }
  }

  const whatsapp = link
    ? `https://wa.me/?text=${encodeURIComponent(`¡Hola! Te paso el link para pagar ${concepto.trim() || "tu compra"} con Mercado Pago:\n${link.initPoint}`)}`
    : null;

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <form
        noValidate
        aria-label="Generar un link de cobro"
        onSubmit={(e) => {
          e.preventDefault();
          if (!enviando) void generar();
        }}
        className="flex max-w-xl flex-col gap-4"
      >
        <Field label="Qué cobrás" htmlFor="link-concepto">
          <Input id="link-concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej.: seña del pedido #483" autoComplete="off" />
        </Field>
        <Field
          label="Cuánto"
          htmlFor="link-monto"
          hint={lectura.estado === "ok" ? undefined : "Con punto para los miles y coma para los centavos: 12.500,50"}
        >
          <Input id="link-monto" importe inputMode="decimal" autoComplete="off" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Referencia (opcional)" htmlFor="link-ref" hint="El pedido o el turno, para encontrarlo después.">
            <Input id="link-ref" value={referencia} onChange={(e) => setReferencia(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Email del cliente (opcional)" htmlFor="link-email">
            <Input id="link-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </Field>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={enviando} estado={enviando ? "cargando" : undefined}>
            {lectura.estado === "ok" ? (
              <>
                Generar el link por <Plata valor={lectura.valor} />
              </>
            ) : (
              "Generar el link"
            )}
          </Button>
          {modo !== "real" && (
            <Button variant="ghost" onClick={probar} disabled={probando} estado={probando ? "cargando" : undefined}>
              Probar con un cobro de prueba
            </Button>
          )}
        </div>
      </form>

      <section aria-live="polite" aria-label="El link">
        <div className="flex items-baseline justify-between gap-3 border-b border-line-strong pb-2">
          <h2 className="text-[15px] font-semibold text-strong">El link</h2>
          {link && link.modo !== "real" && <span className="text-[13px] text-muted">de prueba: no cobra de verdad</span>}
        </div>
        {!link ? (
          <p className="py-3 text-sm text-muted">Cuando lo generes aparece acá, para copiarlo o mandarlo por WhatsApp. Cuando el cliente paga, el cobro entra solo.</p>
        ) : (
          <div className="flex flex-col gap-3 py-3">
            <p className="break-all text-sm text-body">{link.initPoint}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => copiar(link.initPoint)}>
                {copiado ? "¡Copiado!" : "Copiar el link"}
              </Button>
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-ui="button"
                  data-variant="outline"
                  data-size="md"
                  className="inline-flex h-11 items-center rounded-md border border-line-strong px-4 text-sm font-medium"
                >
                  Mandarlo por WhatsApp
                </a>
              )}
              <a href={link.initPoint} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center px-2 text-sm font-medium text-accent-ink underline underline-offset-4">
                Abrir
              </a>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
