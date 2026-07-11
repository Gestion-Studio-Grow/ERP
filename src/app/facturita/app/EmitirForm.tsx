"use client";

/**
 * Formulario de emisión de FACTURITA: la factura en tres clics. Receptor vacío
 * = consumidor final; CUIT/CUIL con validación en vivo (dígito verificador).
 */

import { useState, useTransition } from "react";
import { Badge, Button, Field, Input, fmtMoneyARS } from "@/components/ui";
import { cuitValido, normalizarCuit } from "@/plugins/bancos/domain/cuit";
import {
  emitirFacturitaAction,
  type ResultadoEmisionFacturita,
} from "@/lib/facturita-actions";

export default function EmitirForm({ bloqueado }: { bloqueado: boolean }) {
  const [descripcion, setDescripcion] = useState("");
  const [total, setTotal] = useState("");
  const [docTipo, setDocTipo] = useState<"" | "80" | "86" | "96">("");
  const [docNro, setDocNro] = useState("");
  const [resultado, setResultado] = useState<ResultadoEmisionFacturita | null>(null);
  const [pendiente, startTransition] = useTransition();

  const docCargado = docTipo !== "" && docNro.trim() !== "";
  const docInvalido =
    docCargado &&
    (docTipo === "96"
      ? !/^\d{7,8}$/.test(docNro.replace(/\D/g, ""))
      : !cuitValido(normalizarCuit(docNro)));

  const totalNum = Number(total.replace(/\./g, "").replace(",", "."));
  const listo = descripcion.trim() !== "" && totalNum > 0 && !docInvalido && !bloqueado;

  function emitir() {
    setResultado(null);
    startTransition(async () => {
      const r = await emitirFacturitaAction({
        descripcion: descripcion.trim(),
        total: totalNum,
        ...(docCargado ? { docTipo: Number(docTipo) as 80 | 86 | 96, docNro } : {}),
      });
      setResultado(r);
      if (r.ok) {
        setDescripcion("");
        setTotal("");
        setDocTipo("");
        setDocNro("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="¿Qué vendiste?"
        htmlFor="ft-descripcion"
        hint="Contalo simple: va como detalle en la factura."
        required
      >
        <Input
          id="ft-descripcion"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej.: Servicio de diseño — logo y tarjetas"
          maxLength={200}
        />
      </Field>

      <Field label="Total" htmlFor="ft-total" hint="En pesos, IVA incluido si corresponde." required>
        <Input
          id="ft-total"
          inputMode="decimal"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          placeholder="Ej.: 25000"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Documento del comprador (opcional)"
          htmlFor="ft-doctipo"
          hint="Vacío = consumidor final."
        >
          <select
            id="ft-doctipo"
            className="h-11 w-full rounded-lg border border-line bg-surface-raised px-3 text-sm text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            value={docTipo}
            onChange={(e) => setDocTipo(e.target.value as typeof docTipo)}
          >
            <option value="">Consumidor final</option>
            <option value="80">CUIT</option>
            <option value="86">CUIL</option>
            <option value="96">DNI</option>
          </select>
        </Field>
        {docTipo !== "" && (
          <Field
            label="Número"
            htmlFor="ft-docnro"
            hint={docTipo === "96" ? "El DNI lleva 7 u 8 dígitos." : "Los 11 números, con o sin guiones."}
            error={
              docInvalido
                ? docTipo === "96"
                  ? "El DNI lleva 7 u 8 dígitos."
                  : "El CUIT no es válido: revisá los 11 números."
                : undefined
            }
          >
            <Input
              id="ft-docnro"
              inputMode="numeric"
              aria-invalid={docInvalido || undefined}
              value={docNro}
              onChange={(e) => setDocNro(e.target.value)}
              placeholder={docTipo === "96" ? "Ej.: 30123456" : "Ej.: 20-37683309-8"}
            />
          </Field>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={emitir} disabled={!listo || pendiente}>
          {pendiente
            ? "Emitiendo…"
            : totalNum > 0
              ? `Emitir factura por ${fmtMoneyARS(totalNum)}`
              : "Emitir factura"}
        </Button>
      </div>

      <div aria-live="polite">
        {resultado && !resultado.ok && (
          <p role="alert" className="text-sm font-medium text-danger">
            {resultado.error}
          </p>
        )}
        {resultado?.ok && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success" dot>
              Factura emitida
            </Badge>
            {resultado.limite.mensaje && (
              <span className="text-sm text-muted">{resultado.limite.mensaje}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
