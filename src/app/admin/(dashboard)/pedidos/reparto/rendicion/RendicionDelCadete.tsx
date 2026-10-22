"use client";

// ============================================================================
// RENDICIÓN DEL CADETE — envío por envío, con el pie de cobro (Magra, tanda 2 · 2C · MG-056).
// ============================================================================
//
// Por cada envío en la calle, cuatro salidas, las cuatro dichas en palabras:
//   · «Cobró» → el PIE DE COBRO (medios que cobran de un toque, billetes con vuelto, dividir): cobra
//     con `cobrarPedido` y entrega (acción `rendirPedido`). El servidor decide el monto: el total del
//     pedido en la base.
//   · «Ya pagó» (sólo si figura cobrado) · «Lo dejó sin cobrar» (pasa a A cobrar) · «Volvió» (con
//     motivo en chips; vuelve a Listos).
// Un envío abierto a la vez: con guantes y apuro, el pie de cobro de uno no se confunde con el de otro.

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { PieDeCobro, type ResultadoDelPie } from "@/components/cobro/PieDeCobro";
import { camposDelPie, textoPlata } from "@/lib/cobro/pie-de-cobro-core";
import { etiquetaDeMedio, type MedioDeCobro } from "@/lib/caja/medio-cobro";
import type { OrderActionState } from "@/lib/order-actions";
import { useToast } from "../../../ToastProvider";
import { useCobroDelNegocio, ventaCobrada } from "../../CobroDelPedido";
import { aFormData, esRedirectDeNext } from "../../formularios-del-pedido";
import { rendirPedido } from "../acciones";
import { MOTIVOS_DE_VUELTA, textoDelResumen, type ResultadoDeRendicion, type ResumenDeLaRendicion } from "../reparto-core";

export type EnvioEnLaCalle = {
  id: string;
  code: number;
  cliente: string;
  telefono: string | null;
  direccion: string | null;
  zona: string | null;
  total: number;
  cobrado: boolean;
  resumen: string;
};

export type SalidaEnLaCalle = { reparto: string; desde: string; cadete: string | null; franja: string; envios: EnvioEnLaCalle[] };

type RendidoDeHoy = {
  id: string;
  code: number;
  cliente: string;
  total: number;
  resultado: ResultadoDeRendicion;
  pagos: { medio: MedioDeCobro; monto: number }[];
};

const TECLA =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-line-strong bg-surface-raised px-4 text-sm font-semibold text-strong " +
  "hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50";

function TarjetaDelEnvio({ e, abierto, onAbrir, puedeOperar }: { e: EnvioEnLaCalle; abierto: boolean; onAbrir: (id: string | null) => void; puedeOperar: boolean }) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const { mostrarCobro } = useCobroDelNegocio();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(false);
  const uid = useId();

  async function enviar(pares: [string, string][], pagoCon: number | null = null): Promise<void> {
    let r: OrderActionState;
    try {
      r = await rendirPedido(aFormData([["id", e.id], ...pares]));
    } catch (err) {
      if (esRedirectDeNext(err)) throw err;
      const msg = `No se pudo rendir el pedido #${e.code}. Revisá la conexión y volvé a intentar: si ya se había cobrado, no se cobra dos veces.`;
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
    showSuccess(r?.mensaje ?? `Pedido #${e.code} rendido.`);
    onAbrir(null);
    router.refresh();
  }

  const otra = (pares: [string, string][]) => startTransition(() => enviar(pares));

  function cobro(res: ResultadoDelPie): Promise<void> {
    const conEfectivo = res.modo === "simple" ? res.medio === "EFECTIVO" : res.pagos.some((p) => p.medio === "EFECTIVO");
    return enviar([["resultado", "cobrado"], ...camposDelPie(e.total, res)], conEfectivo && res.recibido !== undefined ? res.recibido : null);
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4" aria-labelledby={`${uid}-t`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          <p id={`${uid}-t`} className="font-semibold text-strong">
            #{e.code} · {e.cliente}
          </p>
          <p className="text-sm text-body">{[e.direccion, e.zona].filter(Boolean).join(" · ") || "Sin dirección"}</p>
          {e.resumen && <p className="text-sm text-muted">{e.resumen}</p>}
        </div>
        <p className="text-right">
          <span className="block font-display text-2xl leading-none tabular-nums text-strong">{textoPlata(e.total)}</span>
          <span className={`text-xs font-medium ${e.cobrado ? "text-success" : "text-muted"}`}>{e.cobrado ? "Ya pagó" : "A cobrar"}</span>
        </p>
      </div>

      {puedeOperar && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label={`Rendir el pedido #${e.code}`}>
            {e.cobrado ? (
              <Button type="button" disabled={pending} estado={pending ? "cargando" : undefined} onClick={() => otra([["resultado", "ya-pago"]])}>
                Entregado (ya pagó)
              </Button>
            ) : (
              <>
                <Button type="button" aria-expanded={abierto} onClick={() => onAbrir(abierto ? null : e.id)}>
                  {abierto ? "Cerrar el cobro" : "Cobró"}
                </Button>
                <button type="button" className={TECLA} disabled={pending} onClick={() => otra([["resultado", "a-cobrar"]])}>
                  Lo dejó sin cobrar
                </button>
              </>
            )}
            <button type="button" className={TECLA} aria-expanded={vuelta} disabled={pending} onClick={() => setVuelta((v) => !v)}>
              Volvió sin entregar
            </button>
          </div>

          {abierto && !e.cobrado && (
            <div className="rounded-lg border border-line bg-surface-sunken p-3">
              <PieDeCobro total={e.total} textoBoton="Cobró" onCobrar={cobro} />
            </div>
          )}

          {vuelta && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-strong">¿Por qué volvió? (vuelve a Listos)</legend>
              <div className="flex flex-wrap gap-2">
                {MOTIVOS_DE_VUELTA.map((m) => (
                  <button key={m} type="button" className={TECLA} disabled={pending} onClick={() => otra([["resultado", "volvio"], ["motivo", m]])}>
                    {m}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

const PALABRA: Record<ResultadoDeRendicion, string> = { cobrado: "Cobrado", "ya-pago": "Ya pagaba", "a-cobrar": "Quedó a cobrar" };

export default function RendicionDelCadete({
  salidas,
  rendidos,
  resumen,
  puedeOperar,
}: {
  salidas: SalidaEnLaCalle[];
  rendidos: RendidoDeHoy[];
  resumen: ResumenDeLaRendicion;
  puedeOperar: boolean;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const pendientes = salidas.reduce((n, s) => n + s.envios.length, 0);

  return (
    <div className="flex flex-col gap-6">
      {pendientes === 0 ? (
        <p role="status" className="rounded-lg border border-line bg-surface-raised p-4 text-body">
          No hay envíos en la calle. Cuando el cadete salga, marcalo en «Armar reparto» y a la vuelta lo rendís acá.
        </p>
      ) : (
        salidas.map((s) => (
          <section key={s.reparto} aria-label={`Salida de las ${s.desde}`}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              Salió {s.desde} · {s.franja}
              {s.cadete && ` · ${s.cadete}`} · {s.envios.length === 1 ? "1 envío" : `${s.envios.length} envíos`}
            </h2>
            <ul className="flex flex-col gap-3">
              {s.envios.map((e) => (
                <TarjetaDelEnvio key={e.id} e={e} abierto={abierto === e.id} onAbrir={setAbierto} puedeOperar={puedeOperar} />
              ))}
            </ul>
          </section>
        ))
      )}

      <section aria-label="Lo rendido hoy" className="flex flex-col gap-3 rounded-lg border border-line bg-surface-sunken p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Rendido hoy</h2>
        <p className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="text-body">El cadete entrega en efectivo</span>
          <span className="font-display text-4xl leading-none tabular-nums text-strong" aria-live="polite">
            {textoPlata(resumen.efectivo)}
          </span>
        </p>
        <p className="text-sm text-body">
          {textoDelResumen(resumen)}
          {resumen.aCobrar.cantidad > 0 &&
            ` · quedó a cobrar ${textoPlata(resumen.aCobrar.monto)} (${resumen.aCobrar.cantidad === 1 ? "1 pedido" : `${resumen.aCobrar.cantidad} pedidos`})`}
        </p>
        {rendidos.length > 0 && (
          <ul className="flex flex-col divide-y divide-line text-sm">
            {rendidos.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span className="text-strong">
                  #{r.code} · {r.cliente}
                </span>
                <span className="tabular-nums text-body">
                  {r.resultado === "cobrado" && r.pagos.length
                    ? r.pagos.map((p) => `${etiquetaDeMedio(p.medio)} ${textoPlata(p.monto)}`).join(" + ")
                    : `${PALABRA[r.resultado]} · ${textoPlata(r.total)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
