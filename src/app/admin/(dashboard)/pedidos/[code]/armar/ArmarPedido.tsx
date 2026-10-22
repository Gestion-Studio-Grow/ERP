"use client";

// ============================================================================
// ARMAR Y PESAR — la pantalla (Magra, tanda 1 · 1C; wireframe en magra-DISENO.md §2.2).
// ============================================================================
//
//   · Arriba, el campo único «Escaneá o buscá» (CampoUnico): la etiqueta de la balanza tilda el
//     renglón de ese producto con su peso; el código de un producto por unidad lo tilda; el nombre
//     lo deja activo. Al lado, el peso en vivo por cable (TomarPesoParaElTicket, Chrome de PC): va
//     al renglón ACTIVO (el que se tocó), no al último (MG-029).
//   · Cada renglón: lo que pidió la clienta, lo que pesó, la diferencia en kg y en $ al precio del
//     PEDIDO (MG-024, MG-026), «Quitar», y − / + en lo que va por unidad.
//   · El peso implausible («1500») FRENA y pregunta «¿Son 1.500 kg de verdad?» (MG-027).
//   · Abajo, «Pedido $X → Real $Y (+$Z)», el aviso de la diferencia por WhatsApp cuando el desvío
//     pasa la tolerancia (MG-025), «Listo y avisar» (MG-028) y «Guardar y seguir después».
//
// Las cuentas son las de `armar-core.ts` (las mismas del servidor). Nada se anima: se usa con
// guantes, cien veces por día. Tokens de color, nunca hex.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CampoUnico, type LecturaUnica, type ProductoDelCampo } from "@/components/lector/CampoUnico";
import TomarPesoParaElTicket from "@/components/balanza/TomarPesoParaElTicket";
import { Button, buttonClasses, atributosBoton, cn } from "@/components/ui";
import type { FormatoBalanza } from "@/lib/supermercado/balanza";
import { confirmacionDePeso, formatearCantidad, redondearCantidad } from "@/lib/pos-peso";
import { textoPlata } from "@/lib/cobro/pie-de-cobro-core";
import { textoDelDescuentoDelAjuste, type CuponDelPedido } from "@/lib/venta-reglas";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { useToast } from "../../../ToastProvider";
import { guardarArmado, listoYAvisar, registrarAvisoDeDiferencia } from "./acciones";
import {
  aplicarLectura,
  camposDelArmado,
  cantidadDe,
  confirmarPeso,
  corregirPeso,
  cuentaDelArmado,
  renglonesDelArmado,
  rotuloDeLineaAMano,
  textoDeLaDiferencia,
  textoDelDesvio,
  textoDifCantidad,
  textoDifPlata,
  type LineaDelPedido,
  type PedidoOriginal,
  type RenglonDelArmado,
} from "./armar-core";

type Pedido = {
  id: string;
  code: number;
  cliente: string;
  telefono: string | null;
  encabezado: string;
  subtotal: number;
  descuento: number;
  total: number;
  items: LineaDelPedido[];
};

function esRedirectDeNext(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function aFormData(campos: readonly [string, string][]): FormData {
  const fd = new FormData();
  for (const [k, v] of campos) fd.append(k, v);
  return fd;
}

const CAMPO_PESO =
  "h-12 w-28 rounded-md border border-line-strong bg-surface-raised px-3 text-right text-lg tabular-nums text-strong " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:border-danger";

const TECLA_CHICA =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-line-strong bg-surface-raised px-3 " +
  "text-sm font-medium text-strong hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50";

/** Al volver del servidor (guardado), los renglones nuevos conservan lo tildado. */
function conservarTildes(nuevos: RenglonDelArmado[], viejos: readonly RenglonDelArmado[]): RenglonDelArmado[] {
  return nuevos.map((n) => {
    const v = viejos.find((x) => x.productId === n.productId);
    return v ? { ...n, listo: v.listo } : n;
  });
}

export default function ArmarPedido({
  pedido,
  original,
  cupon,
  productos,
  balanza,
  negocio,
  negocioId,
}: {
  pedido: Pedido;
  original: PedidoOriginal | null;
  cupon: CuponDelPedido | null;
  productos: ProductoDelCampo[];
  balanza: { formato: FormatoBalanza } | null;
  negocio: string;
  negocioId: string;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [pending, startTransition] = useTransition();
  const [renglones, setRenglones] = useState(() => renglonesDelArmado(pedido.items, original));
  // Lo guardado cambió (se guardó, u otra pantalla lo pesó): se rearman los renglones.
  const firma = JSON.stringify(pedido.items.map((it) => [it.productId, it.quantity])) + JSON.stringify(original?.lineas ?? null);
  const [firmaVista, setFirmaVista] = useState(firma);
  if (firma !== firmaVista) {
    setFirmaVista(firma);
    setRenglones(conservarTildes(renglonesDelArmado(pedido.items, original), renglones));
  }
  const [activo, setActivo] = useState<number | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tono: "ok" | "error" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waPendiente, setWaPendiente] = useState<string | null>(null);

  const aMano = useMemo(() => pedido.items.filter((it) => !it.productId), [pedido.items]);
  const totalPedido = original?.total ?? pedido.total;
  const cuenta = cuentaDelArmado(renglones, aMano, { subtotal: pedido.subtotal, descuento: pedido.descuento, cupon, totalPedido });
  const textoDescuento = cuenta.descuento > 0 ? textoDelDescuentoDelAjuste({ descuento: cuenta.descuento, porcentaje: cuenta.porcentajeDescuento }, cupon) : null;
  const faltan = cuenta.renglones.filter((r) => !r.listo);
  const porKilo = renglones.filter((r) => r.unidad === "WEIGHT");

  // A dónde va el peso de la balanza por cable: el renglón activo si es por kilo; si no, el
  // primero por kilo sin tildar.
  const activoRenglon = renglones.find((r) => r.key === activo) ?? null;
  const destinoDelPeso =
    activoRenglon && activoRenglon.unidad === "WEIGHT" ? activoRenglon : (porKilo.find((r) => !r.listo) ?? null);

  const cambiar = (key: number, cambio: Partial<RenglonDelArmado>) => {
    setError(null);
    setRenglones((rs) => rs.map((r) => (r.key === key ? { ...r, ...cambio } : r)));
  };

  function alLeer(l: LecturaUnica) {
    const r = aplicarLectura(renglones, l);
    setRenglones(r.renglones);
    if (r.activo !== null) setActivo(r.activo);
    setAviso({ texto: r.aviso, tono: r.tono });
  }

  // Lo que frena «Listo y avisar» y «Guardar», dicho en palabras.
  const motivo = cuenta.porConfirmar
    ? `Confirmá el peso de ${cuenta.porConfirmar.nombre}.`
    : cuenta.hayInvalida
      ? "Hay un peso que no se entiende: escribilo con coma (0,620)."
      : cuenta.sinLineas
        ? "Dejá al menos un producto. Si el pedido no va, anulalo desde la bandeja."
        : null;
  const motivoListo = motivo ?? (faltan.length ? `Tildá lo que falta: ${faltan.map((r) => r.nombre).join(", ")}.` : null);

  const detalleDiferencia = cuenta.renglones.map((r) => ({ nombre: r.nombre, unidad: r.unidad, pidio: r.pidio, qty: r.qty }));
  const textoDif = textoDeLaDiferencia({
    cliente: pedido.cliente,
    code: pedido.code,
    negocio,
    renglones: detalleDiferencia,
    totalPedido: cuenta.totalPedido,
    total: cuenta.total,
  });
  const waDiferencia = waLinkClienta(pedido.telefono, textoDif) ?? `https://wa.me/?text=${encodeURIComponent(textoDif)}`;

  function enfocarPregunta() {
    if (!cuenta.porConfirmar) return;
    document.getElementById(`pregunta-${cuenta.porConfirmar.key}`)?.querySelector<HTMLButtonElement>("button")?.focus();
  }

  function guardar() {
    if (motivo) {
      enfocarPregunta();
      setError(motivo);
      return;
    }
    const fd = aFormData(camposDelArmado(pedido.id, renglones));
    startTransition(async () => {
      let r;
      try {
        r = await guardarArmado(null, fd);
      } catch (e) {
        if (esRedirectDeNext(e)) throw e;
        const msg = "No se pudo guardar. Revisá la conexión y volvé a intentar.";
        setError(msg);
        showError(msg);
        return;
      }
      if (!r || !r.ok) {
        const msg = r?.error ?? "No se pudo guardar.";
        setError(msg);
        showError(msg);
        router.refresh();
        return;
      }
      setError(null);
      showSuccess(r.mensaje ?? `Pedido #${pedido.code} guardado.`);
      router.refresh();
    });
  }

  function listo() {
    if (motivoListo) {
      enfocarPregunta();
      setError(motivoListo);
      return;
    }
    // La ventana del WhatsApp se abre YA, en el toque (después de esperar al servidor el navegador
    // la bloquearía); cuando el pedido quedó Listo se le pone el aviso con el total grabado.
    const ventana = typeof window !== "undefined" ? window.open("", "_blank") : null;
    const fd = aFormData(cuenta.cambio ? camposDelArmado(pedido.id, renglones) : [["id", pedido.id]]);
    startTransition(async () => {
      let r;
      try {
        r = await listoYAvisar(fd);
      } catch (e) {
        ventana?.close();
        if (esRedirectDeNext(e)) throw e;
        const msg = "No se pudo pasar a Listo. Revisá la conexión y volvé a intentar.";
        setError(msg);
        showError(msg);
        return;
      }
      if (!r.ok) {
        ventana?.close();
        setError(r.error);
        showError(r.error);
        router.refresh();
        return;
      }
      setError(null);
      showSuccess(r.mensaje);
      if (ventana && !ventana.closed) {
        ventana.opener = null;
        ventana.location.href = r.wa;
        router.push("/admin/pedidos");
      } else {
        // El navegador no dejó abrir la ventana: el aviso queda a un toque, acá.
        setWaPendiente(r.wa);
        router.refresh();
      }
    });
  }

  return (
    <main data-ui="pagina" className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4 sm:py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/admin/pedidos" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-ink underline underline-offset-4">
            ← Pedidos
          </Link>
          <h1 className="font-display text-3xl leading-tight text-strong">Armar #{pedido.code}</h1>
          <p className="text-sm text-muted">{pedido.encabezado}</p>
        </div>
        <p className="text-sm font-semibold tabular-nums text-strong" aria-live="polite">
          {cuenta.listos} de {renglones.length} listos
        </p>
      </header>

      <section aria-label="Escanear o pesar" className="grid gap-3 rounded-lg border border-line bg-surface-raised p-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <CampoUnico
          productos={productos}
          balanza={balanza}
          onLectura={alLeer}
          id="armar-campo-unico"
          etiqueta="Escaneá el paquete o buscá"
        />
        {porKilo.length > 0 && (
          <div className="min-w-56">
            <TomarPesoParaElTicket
              negocio={negocioId}
              renglones={destinoDelPeso ? [{ key: destinoDelPeso.key, productId: destinoDelPeso.productId }] : []}
              porKilo={(id) => renglones.some((r) => r.productId === id && r.unidad === "WEIGHT")}
              nombreDe={(id) => renglones.find((r) => r.productId === id)?.nombre ?? ""}
              alPoner={(key, qtyText) => cambiar(key, { texto: qtyText, listo: true, confirmado: null })}
            />
          </div>
        )}
        {aviso && (
          <p role={aviso.tono === "error" ? "alert" : "status"} className={cn("text-sm sm:col-span-2", aviso.tono === "error" ? "font-medium text-danger" : "text-body")}>
            {aviso.texto}
          </p>
        )}
      </section>

      <ul aria-label={`Lo que lleva el pedido #${pedido.code}`} className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-raised">
        {cuenta.renglones.map((r) => {
          const esPeso = r.unidad === "WEIGHT";
          const quitado = r.qty === 0 && !r.invalida && r.texto.trim() === "0";
          const pregunta = r.frena ? confirmacionDePeso({ valor: r.qty, saleUnit: r.unidad }) : null;
          const esActivo = activo === r.key;
          const idCampo = `armar-peso-${r.key}`;
          return (
            <li
              key={r.key}
              data-activo={esActivo || undefined}
              className={cn("flex flex-col gap-2 p-3", esActivo && "bg-accent-soft")}
              onClick={() => setActivo(r.key)}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-6"
                    checked={r.listo}
                    onChange={(e) => cambiar(r.key, { listo: e.target.checked })}
                    aria-label={`${r.nombre} listo`}
                  />
                  <span className="text-base font-semibold text-strong">{r.nombre}</span>
                </label>
                <span className="text-sm text-muted">
                  pidió {formatearCantidad(r.pidio)} {esPeso ? "kg" : "u"}
                </span>
                {quitado ? (
                  <span className="text-sm font-medium text-warning">Se saca del pedido</span>
                ) : esPeso ? (
                  <span className="flex items-center gap-2">
                    <label htmlFor={idCampo} className="text-sm text-muted">
                      pesó
                    </label>
                    <input
                      id={idCampo}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      data-tipo="peso"
                      className={CAMPO_PESO}
                      value={r.texto}
                      aria-invalid={r.invalida || r.frena || undefined}
                      onFocus={() => setActivo(r.key)}
                      onChange={(e) => {
                        const texto = e.target.value;
                        const q = cantidadDe({ texto });
                        cambiar(r.key, { texto, confirmado: null, ...(q.qty > 0 ? { listo: true } : {}) });
                      }}
                    />
                    <span className="text-sm text-muted">kg</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2" role="group" aria-label={`Cantidad de ${r.nombre}`}>
                    <button
                      type="button"
                      className={TECLA_CHICA}
                      aria-label={`Una ${r.nombre} menos`}
                      disabled={r.qty <= 1}
                      onClick={() => cambiar(r.key, { texto: formatearCantidad(Math.max(1, redondearCantidad(r.qty - 1))) })}
                    >
                      −
                    </button>
                    <span className="min-w-12 text-center text-lg font-semibold tabular-nums text-strong">{formatearCantidad(r.qty)} u</span>
                    <button
                      type="button"
                      className={TECLA_CHICA}
                      aria-label={`Una ${r.nombre} más`}
                      onClick={() => cambiar(r.key, { texto: formatearCantidad(redondearCantidad(r.qty + 1)) })}
                    >
                      +
                    </button>
                  </span>
                )}
                {!quitado && r.qty > 0 && r.difCantidad !== 0 && (
                  <span className={cn("text-sm font-semibold tabular-nums", r.avisar ? "text-warning" : "text-body")}>
                    {textoDifCantidad(r.difCantidad, r.unidad)} · {textoDifPlata(r.difPlata)}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  {esPeso && !quitado && (
                    <button
                      type="button"
                      className={TECLA_CHICA}
                      aria-pressed={esActivo}
                      onClick={() => setActivo(r.key)}
                    >
                      {esActivo ? "Pesando acá" : "Pesar acá"}
                    </button>
                  )}
                  {quitado ? (
                    <button
                      type="button"
                      className={TECLA_CHICA}
                      onClick={() => cambiar(r.key, { texto: formatearCantidad(r.guardado > 0 ? r.guardado : r.pidio), listo: false })}
                    >
                      Volver a poner
                    </button>
                  ) : (
                    <button type="button" className={TECLA_CHICA} onClick={() => cambiar(r.key, { texto: "0", listo: true, confirmado: null })}>
                      Quitar
                    </button>
                  )}
                </span>
              </div>
              <p className="text-xs text-muted">
                al precio del pedido {textoPlata(r.precio)}
                {esPeso ? "/kg" : " c/u"}
                {r.qty > 0 && <> · {textoPlata(r.total)}</>}
              </p>
              {r.invalida && (
                <p role="alert" className="text-sm font-medium text-danger">
                  Eso no es un peso: escribilo con coma (0,620).
                </p>
              )}
              {pregunta && (
                <div id={`pregunta-${r.key}`} role="alert" className="flex flex-col gap-2 rounded-md border border-danger bg-danger-soft p-3">
                  <p className="text-sm font-semibold text-danger">{pregunta.pregunta}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="md" onClick={() => setRenglones((rs) => rs.map((x) => (x.key === r.key ? corregirPeso(x) : x)))}>
                      {pregunta.corregir}
                    </Button>
                    <Button type="button" size="md" variant="outline" onClick={() => setRenglones((rs) => rs.map((x) => (x.key === r.key ? confirmarPeso(x) : x)))}>
                      {pregunta.confirmar}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {aMano.map((l, i) => (
          <li key={`a-${i}`} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm text-muted">
            <span>
              {rotuloDeLineaAMano(l)} · {l.name}
            </span>
            <span className="tabular-nums">{textoPlata(l.lineTotal)} · queda igual</span>
          </li>
        ))}
      </ul>

      <section aria-label="Total del pedido" className="sticky bottom-0 flex flex-col gap-3 rounded-lg border border-line-strong bg-surface-sunken p-3">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-base text-body" aria-live="polite">
          <span>
            Pedido <span className="tabular-nums">{textoPlata(cuenta.totalPedido)}</span>
          </span>
          <span aria-hidden>→</span>
          <span>
            Real <strong className="font-display text-3xl tabular-nums text-strong">{textoPlata(cuenta.total)}</strong>
          </span>
          {cuenta.diferencia !== 0 && <span className="font-semibold tabular-nums">({textoDifPlata(cuenta.diferencia)})</span>}
          {cuenta.envio > 0 && <span className="text-sm text-muted">Envío {textoPlata(cuenta.envio)}</span>}
          {textoDescuento && <span className="text-sm text-muted">{textoDescuento}</span>}
        </p>
        {cuenta.mayorDesvio && cuenta.mayorDesvio.desvio !== null && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-warning">
              {cuenta.mayorDesvio.nombre} pesó {textoDelDesvio(cuenta.mayorDesvio.desvio)} que lo pedido.
            </p>
            <a
              href={waDiferencia}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses("outline", "md")}
              {...atributosBoton("outline", "md")}
              onClick={() => {
                void registrarAvisoDeDiferencia(pedido.id, {
                  renglones: cuenta.renglones
                    .filter((x) => x.unidad === "WEIGHT" && x.qty > 0 && x.difCantidad !== 0)
                    .map((x) => ({ nombre: x.nombre, pidio: x.pidio, peso: x.qty })),
                  totalPedido: cuenta.totalPedido,
                  total: cuenta.total,
                }).catch(() => undefined);
              }}
            >
              Avisar la diferencia por WhatsApp
            </a>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        {!error && motivoListo && <p className="text-sm text-muted">{motivoListo}</p>}
        {waPendiente && (
          <p role="status" className="flex flex-wrap items-center gap-3 text-sm text-body">
            Quedó listo.
            <a href={waPendiente} target="_blank" rel="noopener noreferrer" className={buttonClasses("solid", "md")} {...atributosBoton("solid", "md")}>
              Abrir el WhatsApp del aviso
            </a>
            <Link href="/admin/pedidos" className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-4">
              Volver a Pedidos
            </Link>
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:justify-between">
          <Button
            type="button"
            size="lg"
            className="w-full sm:w-auto"
            disabled={pending || !!waPendiente}
            estado={pending ? "cargando" : undefined}
            onClick={listo}
          >
            Listo y avisar ▶
          </Button>
          <Button type="button" size="lg" variant="outline" className="w-full sm:w-auto" disabled={pending || !cuenta.cambio} onClick={guardar}>
            Guardar y seguir después
          </Button>
        </div>
      </section>
    </main>
  );
}
