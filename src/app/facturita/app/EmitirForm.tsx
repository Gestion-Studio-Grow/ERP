"use client";

/**
 * Formulario de emisión de FACTURITA. Lo mínimo que ARCA necesita, en el orden en que se piensa:
 * qué vendiste (productos, servicios o las dos cosas), el total, y a quién. Con servicios pide las
 * fechas que exige ARCA; con CUIT del comprador, su condición frente al IVA (RG 5616); al
 * Responsable Inscripto le pide la alícuota. Toda la validación es la de `facturita-core` (pura).
 */

import { useState, useTransition } from "react";
import { Badge, Button, Field, Input, Select, Segmented, fmtMoneyARS } from "@/components/ui";
import { cuitValido, normalizarCuit } from "@/lib/cuit";
import {
  ALICUOTA_POR_DEFECTO,
  OPCIONES_ALICUOTA,
  OPCIONES_CONCEPTO,
  OPCIONES_CONDICION_RECEPTOR,
  conceptoConFechasDeServicio,
  fechaFiscalAInput,
  type AlicuotaFacturita,
  type ConceptoFacturita,
  type CondicionReceptorConCuit,
} from "@/lib/facturita-core";
import { emitirFacturitaAction, type ResultadoEmisionFacturita } from "@/lib/facturita-actions";

const SELECT = "h-11 w-full";

export default function EmitirForm({
  bloqueado,
  inscripto,
  hoy,
}: {
  bloqueado: boolean;
  /** El emisor es Responsable Inscripto: elige la alícuota de IVA. */
  inscripto: boolean;
  /** Fecha fiscal de hoy (AAAAMMDD), default de las fechas del servicio. */
  hoy: string;
}) {
  const hoyInput = fechaFiscalAInput(hoy);
  const [concepto, setConcepto] = useState<ConceptoFacturita>("productos");
  const [descripcion, setDescripcion] = useState("");
  const [total, setTotal] = useState("");
  const [desde, setDesde] = useState(hoyInput);
  const [hasta, setHasta] = useState(hoyInput);
  const [vencimiento, setVencimiento] = useState(hoyInput);
  const [alicuota, setAlicuota] = useState<AlicuotaFacturita>(ALICUOTA_POR_DEFECTO);
  const [docTipo, setDocTipo] = useState<"" | "80" | "86" | "96">("");
  const [docNro, setDocNro] = useState("");
  const [condicion, setCondicion] = useState<"" | CondicionReceptorConCuit>("");
  const [resultado, setResultado] = useState<ResultadoEmisionFacturita | null>(null);
  const [pendiente, startTransition] = useTransition();

  const conServicio = conceptoConFechasDeServicio(concepto);
  const ejemplo = OPCIONES_CONCEPTO.find((o) => o.id === concepto)?.ejemplo ?? "";

  const docCargado = docTipo !== "" && docNro.trim() !== "";
  const docInvalido =
    docCargado &&
    (docTipo === "96"
      ? !/^\d{7,8}$/.test(docNro.replace(/\D/g, ""))
      : !cuitValido(normalizarCuit(docNro)));
  const faltaCondicion = docTipo === "80" && condicion === "";

  const totalNum = Number(total.replace(/\./g, "").replace(",", "."));
  const listo = descripcion.trim() !== "" && totalNum > 0 && !docInvalido && !faltaCondicion && !bloqueado;

  function emitir() {
    setResultado(null);
    startTransition(async () => {
      const r = await emitirFacturitaAction({
        descripcion: descripcion.trim(),
        total: totalNum,
        concepto,
        ...(conServicio ? { servicioDesde: desde, servicioHasta: hasta, vencimientoPago: vencimiento } : {}),
        ...(inscripto ? { alicuota } : {}),
        ...(docCargado
          ? {
              docTipo: Number(docTipo) as 80 | 86 | 96,
              docNro,
              ...(docTipo === "80" && condicion ? { condicionReceptor: condicion } : {}),
            }
          : {}),
      });
      setResultado(r);
      if (r.ok) {
        setDescripcion("");
        setTotal("");
        setDocTipo("");
        setDocNro("");
        setCondicion("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        name="concepto"
        leyenda="¿Qué vendiste?"
        leyendaVisible
        opciones={OPCIONES_CONCEPTO.map((o) => ({ valor: o.id, etiqueta: o.nombre }))}
        value={concepto}
        // El cambio sube desde el radio elegido hasta el fieldset del grupo.
        onChange={(e) => setConcepto((e.target as unknown as HTMLInputElement).value as ConceptoFacturita)}
        lleno
      />

      <Field label="Detalle" htmlFor="ft-descripcion" hint="Contalo simple: va como detalle en la factura." required>
        <Input
          id="ft-descripcion"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder={ejemplo}
          maxLength={200}
        />
      </Field>

      {conServicio && (
        <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-3">
          <legend className="px-1 text-sm font-medium text-strong">Fechas que pide ARCA para un servicio</legend>
          <Field label="El servicio fue desde" htmlFor="ft-desde">
            <Input id="ft-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <Field label="Hasta" htmlFor="ft-hasta">
            <Input id="ft-hasta" type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
          </Field>
          <Field label="Te lo pagan hasta el" htmlFor="ft-vto" hint="Si ya te pagaron, dejá hoy.">
            <Input
              id="ft-vto"
              type="date"
              value={vencimiento}
              min={hoyInput}
              onChange={(e) => setVencimiento(e.target.value)}
            />
          </Field>
        </fieldset>
      )}

      <div className={inscripto ? "grid gap-4 sm:grid-cols-2" : ""}>
        <Field
          label="Total"
          htmlFor="ft-total"
          hint={inscripto ? "En pesos, con el IVA incluido." : "En pesos."}
          required
        >
          <Input
            id="ft-total"
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="Ej.: 25000"
          />
        </Field>
        {inscripto && (
          <Field label="Alícuota de IVA" htmlFor="ft-alicuota" hint="Si no sabés, casi siempre es la general.">
            <Select
              id="ft-alicuota"
              className={SELECT}
              value={alicuota}
              onChange={(e) => setAlicuota(e.target.value as AlicuotaFacturita)}
            >
              {OPCIONES_ALICUOTA.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Documento del comprador (opcional)" htmlFor="ft-doctipo" hint="Vacío = consumidor final.">
          <Select
            id="ft-doctipo"
            className={SELECT}
            value={docTipo}
            onChange={(e) => setDocTipo(e.target.value as typeof docTipo)}
          >
            <option value="">Consumidor final</option>
            <option value="80">CUIT</option>
            <option value="86">CUIL</option>
            <option value="96">DNI</option>
          </Select>
        </Field>
        {docTipo !== "" && (
          <Field
            label="Número"
            htmlFor="ft-docnro"
            hint={docTipo === "96" ? "El DNI lleva 7 u 8 números." : "11 números, con o sin guiones."}
            error={
              docInvalido
                ? docTipo === "96"
                  ? "El DNI lleva 7 u 8 números."
                  : `El ${docTipo === "86" ? "CUIL" : "CUIT"} no es válido: revisá los 11 números.`
                : undefined
            }
          >
            <Input
              id="ft-docnro"
              inputMode="numeric"
              aria-invalid={docInvalido || undefined}
              value={docNro}
              onChange={(e) => setDocNro(e.target.value)}
              placeholder={docTipo === "96" ? "7 u 8 números" : "11 números, con o sin guiones"}
            />
          </Field>
        )}
        {docTipo === "80" && (
          <Field
            label="¿Cómo está inscripto el comprador?"
            htmlFor="ft-condicion"
            hint="Figura en su constancia de ARCA. De esto depende la letra de la factura."
            required
          >
            <Select
              id="ft-condicion"
              className={SELECT}
              value={condicion}
              onChange={(e) => setCondicion(e.target.value as typeof condicion)}
            >
              <option value="">Elegí una opción</option>
              {OPCIONES_CONDICION_RECEPTOR.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </Select>
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
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {resultado.estado.estado === "autorizada" ? (
                resultado.estado.dePrueba ? (
                  <Badge tone="warning" dot>Autorizada de prueba</Badge>
                ) : (
                  <Badge tone="success" dot>Autorizada por ARCA</Badge>
                )
              ) : (
                <Badge tone="neutral" dot>Pendiente</Badge>
              )}
              <span className="text-sm text-body">{resultado.mensaje}</span>
            </div>
            {resultado.limite.mensaje && <span className="text-sm text-muted">{resultado.limite.mensaje}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
