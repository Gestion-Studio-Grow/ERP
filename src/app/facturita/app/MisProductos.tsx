"use client";

/**
 * «Tu facturación en dos toques»: los productos guardados como botones grandes. Toque 1 = el
 * producto (muestra qué se va a emitir); toque 2 = «Emitir factura por $X» a consumidor final.
 * Lo que no entra en dos toques (un servicio con sus fechas, el inscripto con su alícuota, otro
 * comprador u otro monto) se abre en el formulario completo, precargado. La máquina de estados y
 * las reglas son puras (`facturita-atajos`), y la emisión viaja con una clave por intento: un
 * doble toque o un reintento devuelve la misma factura, no otro CAE.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Field, Input, fmtMoneyARS } from "@/components/ui";
import {
  emisionDesdeAtajo,
  esCaminoCorto,
  nuevaClaveEmision,
  textoEmitirAtajo,
  tocar,
  type Atajo,
  type EstadoCaminoCorto,
} from "@/lib/facturita-atajos";
import type {
  ResultadoAtajo,
  ResultadoEmisionFacturita,
  emitirFacturitaAction,
  guardarAtajoFacturitaAction,
  quitarAtajoFacturitaAction,
} from "@/lib/facturita-actions";

/** Las acciones de servidor, por props: la pantalla real pasa las de verdad y la prueba, dobles. */
export interface AccionesMisProductos {
  emitir: typeof emitirFacturitaAction;
  guardar: typeof guardarAtajoFacturitaAction;
  quitar: typeof quitarAtajoFacturitaAction;
}

const BOTON_ATAJO =
  "flex min-h-16 w-full flex-col items-start justify-center gap-0.5 rounded-xl border border-line bg-surface-raised px-4 py-3 text-left " +
  "hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "aria-pressed:border-accent aria-pressed:bg-accent-soft disabled:opacity-60";

export default function MisProductos({
  productos,
  ultima,
  condicionEmisor,
  bloqueado,
  onEditar,
  acciones,
}: {
  acciones: AccionesMisProductos;
  productos: Atajo[];
  ultima: Atajo | null;
  /** `null` = sin perfil fiscal cargado: ningún atajo emite directo. */
  condicionEmisor: string | null;
  bloqueado: boolean;
  /** Abre el formulario completo con el atajo precargado. */
  onEditar: (a: Atajo) => void;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoCaminoCorto>({ paso: "eligiendo" });
  const [resultado, setResultado] = useState<ResultadoEmisionFacturita | null>(null);
  const [editando, setEditando] = useState(false);
  const [agregando, setAgregando] = useState(false);
  // Un toque que llega antes de que React vuelva a pintar no dispara un segundo pedido.
  const enCurso = useRef(false);

  const atajos = ultima ? [ultima, ...productos] : productos;
  const elegido = estado.paso === "confirmando" || estado.paso === "emitiendo" ? estado.atajo : null;

  function elegir(a: Atajo) {
    if (enCurso.current) return;
    setResultado(null);
    // El mismo producto otra vez, todavía sin factura: es el mismo intento (misma clave).
    const mismo = estado.paso === "confirmando" && estado.atajo.id === a.id;
    const t = { tipo: "atajo", atajo: a, condicionEmisor, clave: mismo ? estado.clave : nuevaClaveEmision() } as const;
    const siguiente = tocar(estado, t);
    if (siguiente.paso === "formulario") {
      setEstado({ paso: "eligiendo" });
      onEditar(a);
      return;
    }
    setEstado(siguiente);
  }

  async function emitir() {
    if (enCurso.current || estado.paso !== "confirmando" || bloqueado) return;
    enCurso.current = true;
    const { atajo, clave } = estado;
    setEstado(tocar(estado, { tipo: "emitir" }));
    try {
      const r = await acciones.emitir(emisionDesdeAtajo(atajo, clave));
      setResultado(r);
      // Sin factura conocida (error antes o durante la grabación) queda listo para reintentar con la
      // MISMA clave: si la factura llegó a grabarse, el servidor devuelve esa y no pide otro CAE.
      setEstado(r.ok || r.invoiceId ? { paso: "eligiendo" } : { paso: "confirmando", atajo, clave });
      router.refresh();
    } catch {
      // Sin respuesta (red): se puede volver a tocar y viaja con la MISMA clave.
      setResultado({ ok: false, error: "No hubo respuesta. Tocá «Emitir» de nuevo: si ya se emitió, no se duplica." });
      setEstado({ paso: "confirmando", atajo, clave });
    } finally {
      enCurso.current = false;
    }
  }

  return (
    <section aria-labelledby="mis-productos" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="mis-productos" className="text-base font-semibold text-strong">
          Mis productos
        </h2>
        {productos.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setEditando((v) => !v)} aria-pressed={editando}>
            {editando ? "Listo" : "Editar"}
          </Button>
        )}
      </div>

      {atajos.length === 0 ? (
        <p className="text-sm text-muted">
          Guardá lo que facturás seguido y la próxima vez lo emitís en dos toques.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2" role="list">
          {atajos.map((a) => (
            <li key={a.id} className="flex flex-col gap-1">
              <button
                type="button"
                className={BOTON_ATAJO}
                aria-pressed={elegido?.id === a.id}
                disabled={estado.paso === "emitiendo"}
                onClick={() => elegir(a)}
              >
                <span className="line-clamp-2 text-sm font-medium text-strong">
                  {a.id === "ultima" ? `Repetir la última: ${a.detalle}` : a.detalle}
                </span>
                <span className="text-sm tabular-nums text-body">{fmtMoneyARS(a.precio)}</span>
                {!esCaminoCorto(a, condicionEmisor) && <span className="text-xs text-muted">Pide más datos</span>}
              </button>
              {editando && a.id !== "ultima" && (
                <QuitarProducto atajo={a} quitar={acciones.quitar} onQuitado={() => router.refresh()} />
              )}
            </li>
          ))}
        </ul>
      )}

      {elegido && (
        <div className="flex flex-col gap-3 rounded-xl border border-accent bg-surface-raised p-4" aria-live="polite">
          <p className="text-sm text-body">
            Vas a emitir una factura a <strong className="text-strong">consumidor final</strong> por{" "}
            <strong className="text-strong">{elegido.detalle}</strong>.
          </p>
          <Button size="lg" className="w-full" onClick={emitir} disabled={bloqueado || estado.paso === "emitiendo"}>
            {estado.paso === "emitiendo" ? "Emitiendo…" : textoEmitirAtajo(fmtMoneyARS(elegido.precio))}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={estado.paso === "emitiendo"}
            onClick={() => {
              onEditar(elegido);
              setEstado({ paso: "eligiendo" });
            }}
          >
            Cambiar el monto o el comprador
          </Button>
        </div>
      )}

      <div aria-live="polite">
        {resultado && !resultado.ok && (
          <p role="alert" className="text-sm font-medium text-danger">
            {resultado.error}
          </p>
        )}
        {resultado?.ok && (
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
            {resultado.limite.mensaje && <span className="text-sm text-muted">{resultado.limite.mensaje}</span>}
          </div>
        )}
      </div>

      {agregando ? (
        <AgregarProducto guardar={acciones.guardar} onListo={() => { setAgregando(false); router.refresh(); }} onCancelar={() => setAgregando(false)} />
      ) : (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setAgregando(true)}>
          Guardar un producto
        </Button>
      )}
    </section>
  );
}

function QuitarProducto({ atajo, quitar, onQuitado }: { atajo: Atajo; quitar: AccionesMisProductos["quitar"]; onQuitado: () => void }) {
  const [pendiente, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pendiente}
      aria-label={`Sacar «${atajo.detalle}» de Mis productos`}
      onClick={() =>
        start(async () => {
          const r = await quitar(atajo.id);
          if (r.ok) onQuitado();
        })
      }
    >
      {pendiente ? "Sacando…" : "Sacar"}
    </Button>
  );
}

function AgregarProducto({
  guardar,
  onListo,
  onCancelar,
}: {
  guardar: AccionesMisProductos["guardar"];
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [detalle, setDetalle] = useState("");
  const [precio, setPrecio] = useState("");
  const [servicio, setServicio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r: ResultadoAtajo = await guardar({ detalle, precio, concepto: servicio ? "servicios" : "productos" });
          if (r.ok) onListo();
          else setError(r.error);
        });
      }}
    >
      <Field label="Qué es" htmlFor="ft-atajo-detalle" hint="Va como detalle en la factura." required>
        <Input id="ft-atajo-detalle" value={detalle} onChange={(e) => setDetalle(e.target.value)} maxLength={200} placeholder="Ej.: Torta de chocolate" />
      </Field>
      <Field label="Precio" htmlFor="ft-atajo-precio" hint="En pesos." required>
        <Input id="ft-atajo-precio" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Ej.: 25000" />
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-sm text-body">
        <input type="checkbox" checked={servicio} onChange={(e) => setServicio(e.target.checked)} className="size-5" />
        Es un servicio (al emitir, ARCA pide las fechas)
      </label>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancelar} disabled={pendiente}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
