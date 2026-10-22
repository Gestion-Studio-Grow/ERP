"use client";

// Subir precios de servicios en cuatro pasos: qué servicios, cuánto, cómo se redondea (y si también
// la seña y el precio vecina) y la vista previa con el antes y el después de cada uno (CH-039).
//
// La vista previa se calcula acá, en vivo, con `planificarAumentoServicios`: la misma función que corre
// el servidor. Lo que se escribe NO sale de acá: «Aplicar» manda el pedido, la huella del plan que se ve
// y una clave por «Aplicar»; el servidor arma el plan de nuevo contra la base y se niega si no da lo
// mismo («El catálogo cambió, volvé a mirar»). Más del 30 % pide una segunda confirmación, que el
// servidor también exige. Al aplicar, el porcentaje queda vacío: el mismo aumento no se ofrece dos veces.

import { useId, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AvisoError, Button, cn, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import {
  PASOS_REDONDEO_SERVICIOS,
  REDONDEO_POR_DEFECTO,
  UMBRAL_CONFIRMACION,
  aumentoServiciosAplicable,
  buscarServicios,
  categoriasConServicios,
  elegirServicios,
  planificarAumentoServicios,
  subirImporte,
  textoDelAumento,
  type AlcanceServicios,
  type PasoServicios,
  type PedidoAumentoServicios,
  type ServicioParaAumento,
} from "@/lib/catalogo/aumento-servicios";
import { aplicarAumentoServicios } from "@/lib/catalogo/aumento-servicios-actions";

type TipoAlcance = AlcanceServicios["tipo"];

const pesos = (n: number) => fmtMoneyARS(n, Math.round(n * 100) % 100 === 0 ? 0 : 2);

/** Un radio nativo (teclado y lector de pantalla gratis) con forma de tecla. */
function Opcion({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
        checked ? "border-accent bg-accent-soft text-strong" : "border-line-strong bg-surface-raised text-body",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}

/** Un paso: rótulo con raya, sin caja (piel «Renglón»). */
function Paso({ n, titulo, children, className }: { n: number; titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="float-left w-full border-b border-line-strong pb-2 text-[15px] font-semibold text-strong">
        <span className="mr-2 tabular-nums text-muted">{n}.</span>
        {titulo}
      </legend>
      <div className="clear-both space-y-3 pt-3">{children}</div>
    </fieldset>
  );
}

export default function SubirPrecios({ servicios }: { servicios: ServicioParaAumento[] }) {
  const router = useRouter();
  const ids = useId();
  const [tipo, setTipo] = useState<TipoAlcance>("todos");
  const [categoria, setCategoria] = useState("");
  const [tildados, setTildados] = useState<ReadonlySet<string>>(new Set());
  const [buscar, setBuscar] = useState("");
  const [porcentaje, setPorcentaje] = useState("");
  const [redondeo, setRedondeo] = useState<PasoServicios>(REDONDEO_POR_DEFECTO);
  const [senia, setSenia] = useState(false);
  const [vecina, setVecina] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tono: "error" | "aviso"; titulo: string; comoSeguir: string } | null>(null);
  const [listo, setListo] = useState<{ cambiados: number; porcentaje: string } | null>(null);
  const [pendiente, startTransition] = useTransition();
  // Una clave por intento de «Aplicar»: si el pedido se manda dos veces (doble envío, reintento de
  // la red), el servidor reconoce el lote y no aplica dos veces. Se renueva al cambiar el pedido.
  const clave = useRef<string | null>(null);

  const categorias = useMemo(() => categoriasConServicios(servicios), [servicios]);
  const conSenia = servicios.filter((s) => (s.depositAmount ?? 0) > 0).length;
  const conVecina = servicios.filter((s) => (s.residentPrice ?? 0) > 0).length;

  const alcance: AlcanceServicios =
    tipo === "categoria"
      ? categoria
        ? { tipo: "categoria", categoryId: categoria }
        : { tipo: "tildados", ids: [] }
      : tipo === "tildados"
        ? { tipo: "tildados", ids: [...tildados] }
        : { tipo: "todos" };
  const pedido: PedidoAumentoServicios = { alcance, porcentaje, redondeo, senia, vecina };
  const plan = planificarAumentoServicios(servicios, pedido);
  const aplicable = aumentoServiciosAplicable(plan);
  const elegidos = plan.elegidos || elegirServicios(servicios, alcance).length;
  const lista = useMemo(() => buscarServicios(servicios, buscar), [servicios, buscar]);
  const ejemplo = plan.porcentaje !== null ? subirImporte(14000, plan.porcentaje, redondeo) : null;

  function cambiar<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      clave.current = null;
      setConfirmando(false);
      setListo(null);
      setMensaje(null);
    };
  }

  function tildar(id: string) {
    const nuevo = new Set(tildados);
    if (nuevo.has(id)) nuevo.delete(id);
    else nuevo.add(id);
    cambiar(setTildados)(nuevo);
  }

  function aplicar() {
    if (!aplicable || pendiente) return;
    if (plan.pideConfirmacion && !confirmando) {
      setConfirmando(true);
      return;
    }
    const enviado = plan;
    // `randomUUID` sólo existe en contexto seguro (https/localhost): afuera, una clave igual de única.
    clave.current ??= typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    const laClave = clave.current;
    startTransition(async () => {
      const r = await aplicarAumentoServicios(pedido, enviado.huella, enviado.pideConfirmacion, laClave);
      setConfirmando(false);
      if (r.ok) {
        clave.current = null;
        setListo({ cambiados: r.cambiados, porcentaje: textoDelAumento(enviado.porcentaje ?? 0) });
        setMensaje(null);
        setPorcentaje("");
        router.refresh();
        return;
      }
      if (r.catalogoCambio) {
        clave.current = null;
        router.refresh(); // trae los precios de ahora; la vista previa se recalcula sola
        setMensaje({ tono: "aviso", titulo: "El catálogo cambió, volvé a mirar", comoSeguir: r.mensaje });
        return;
      }
      if (r.pideConfirmacion) {
        setConfirmando(true);
        return;
      }
      setMensaje({ tono: "error", titulo: "No se subieron los precios", comoSeguir: r.mensaje });
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-start">
      <div className="min-w-0 space-y-8">
        {listo && (
          <div role="status" className="border-l-2 border-success bg-success-soft px-4 py-3 text-sm">
            <p className="font-semibold text-strong">
              Listo: {fmtNumberAR(listo.cambiados)} {listo.cambiados === 1 ? "servicio subió" : "servicios subieron"} ({listo.porcentaje}).
            </p>
            <p className="mt-0.5 text-body">Quedó anotado quién los subió y cuándo. Los turnos ya dados conservan su precio.</p>
          </div>
        )}

        <Paso n={1} titulo="¿Qué servicios?">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Qué servicios suben">
            <Opcion name={`${ids}-alcance`} checked={tipo === "todos"} onChange={() => cambiar(setTipo)("todos")}>
              Todos ({fmtNumberAR(servicios.length)})
            </Opcion>
            {categorias.length > 1 && (
              <Opcion name={`${ids}-alcance`} checked={tipo === "categoria"} onChange={() => cambiar(setTipo)("categoria")}>
                Una categoría
              </Opcion>
            )}
            <Opcion name={`${ids}-alcance`} checked={tipo === "tildados"} onChange={() => cambiar(setTipo)("tildados")}>
              Elegir uno por uno
            </Opcion>
          </div>

          {tipo === "categoria" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${ids}-cat`} className="text-sm font-medium text-strong">
                Categoría
              </label>
              <select
                id={`${ids}-cat`}
                value={categoria}
                onChange={(e) => cambiar(setCategoria)(e.target.value)}
                className="h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-sm text-strong sm:max-w-xs"
              >
                <option value="">Elegí una…</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.n})
                  </option>
                ))}
              </select>
            </div>
          )}

          {tipo === "tildados" && (
            <div className="space-y-2">
              <label htmlFor={`${ids}-buscar`} className="sr-only">
                Buscar servicio
              </label>
              <input
                id={`${ids}-buscar`}
                type="search"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar servicio o categoría…"
                autoComplete="off"
                className="h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-sm text-strong"
              />
              <ul className="max-h-80 divide-y divide-line overflow-y-auto border-y border-line">
                {lista.map((s) => (
                  <li key={s.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                      <input type="checkbox" checked={tildados.has(s.id)} onChange={() => tildar(s.id)} className="size-5 shrink-0" />
                      <span className="min-w-0 flex-1 break-words text-strong">
                        {s.name}
                        {s.categoria && <span className="ml-2 text-xs text-muted">{s.categoria}</span>}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">{pesos(s.price)}</span>
                    </label>
                  </li>
                ))}
                {lista.length === 0 && <li className="px-3 py-3 text-sm text-muted">Ninguno con ese nombre.</li>}
              </ul>
            </div>
          )}

          <p className="text-sm text-body" aria-live="polite">
            {elegidos === 0 ? "Todavía no elegiste servicios." : `Elegiste ${fmtNumberAR(elegidos)} ${elegidos === 1 ? "servicio" : "servicios"}.`}
          </p>
        </Paso>

        <Paso n={2} titulo="¿Cuánto suben?">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-pct`} className="text-sm font-medium text-strong">
              Porcentaje
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`${ids}-pct`}
                value={porcentaje}
                onChange={(e) => cambiar(setPorcentaje)(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="8"
                aria-describedby={`${ids}-pct-ayuda`}
                className="h-11 w-28 rounded-md border border-line-strong bg-surface-raised px-3 text-right text-base tabular-nums text-strong"
              />
              <span className="text-base text-body">%</span>
            </div>
          </div>
          <p id={`${ids}-pct-ayuda`} className="text-xs text-muted">
            Con coma si hace falta: 8,5. Un aumento de más del {UMBRAL_CONFIRMACION} % se confirma dos veces.
          </p>
        </Paso>

        <Paso n={3} titulo="Redondeo y qué más sube">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Redondear a">
            {PASOS_REDONDEO_SERVICIOS.map((paso) => (
              <Opcion key={paso} name={`${ids}-redondeo`} checked={redondeo === paso} onChange={() => cambiar(setRedondeo)(paso)}>
                {`A $${paso.toLocaleString("es-AR")}`}
              </Opcion>
            ))}
          </div>
          <p className="text-xs text-muted">
            Se redondea siempre para arriba{ejemplo !== null && `: un servicio de $14.000 queda en ${pesos(ejemplo)}`}.
          </p>
          <div className="space-y-1">
            <label className={cn("flex min-h-11 items-center gap-3 text-sm", conSenia === 0 ? "text-muted" : "cursor-pointer text-strong")}>
              <input type="checkbox" checked={senia} disabled={conSenia === 0} onChange={(e) => cambiar(setSenia)(e.target.checked)} className="size-5 shrink-0" />
              <span>
                Subir también la seña <span className="text-muted">({fmtNumberAR(conSenia)} {conSenia === 1 ? "servicio la pide" : "servicios la piden"})</span>
              </span>
            </label>
            <label className={cn("flex min-h-11 items-center gap-3 text-sm", conVecina === 0 ? "text-muted" : "cursor-pointer text-strong")}>
              <input type="checkbox" checked={vecina} disabled={conVecina === 0} onChange={(e) => cambiar(setVecina)(e.target.checked)} className="size-5 shrink-0" />
              <span>
                Subir también el precio vecina <span className="text-muted">({fmtNumberAR(conVecina)} con precio vecina)</span>
              </span>
            </label>
          </div>
        </Paso>
      </div>

      <Paso n={4} titulo="Así quedan" className="lg:sticky lg:top-4">
        {plan.error ? (
          <p className="text-sm text-muted" aria-live="polite">
            {plan.error}
          </p>
        ) : (
          <>
            <p className="text-sm text-body" aria-live="polite">
              <strong className="text-strong">{`${fmtNumberAR(plan.filas.length)} ${plan.filas.length === 1 ? "sube" : "suben"}`}</strong>
              {plan.porcentaje !== null && ` · ${textoDelAumento(plan.porcentaje)} · redondeo a $${redondeo.toLocaleString("es-AR")}`}
              {plan.sinPrecio.length > 0 && ` · ${fmtNumberAR(plan.sinPrecio.length)} sin precio`}
            </p>
            <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto border-y border-line" aria-label="Antes y después">
              {plan.filas.map((f) => (
                <li key={f.serviceId} className="px-1 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="min-w-0 break-words text-strong">
                      {f.nombre}
                      {f.pausado && <span className="ml-2 text-xs text-muted">(pausado)</span>}
                    </span>
                    <span className="tabular-nums text-body">
                      <span className="text-muted line-through decoration-1">{pesos(f.precio.antes)}</span>
                      {" → "}
                      <span className="font-semibold text-strong">{pesos(f.precio.despues)}</span>
                      <span className={cn("ml-2 text-xs", f.porRedondeo ? "font-medium text-warning" : "text-muted")}>
                        +{f.efectivo.toLocaleString("es-AR")} %{f.porRedondeo ? " por el redondeo" : ""}
                      </span>
                    </span>
                  </div>
                  {(f.senia || f.vecina) && (
                    <p className="mt-0.5 text-xs tabular-nums text-muted">
                      {f.senia && `Seña ${pesos(f.senia.antes)} → ${pesos(f.senia.despues)}`}
                      {f.senia && f.vecina && " · "}
                      {f.vecina && `Vecina ${pesos(f.vecina.antes)} → ${pesos(f.vecina.despues)}`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">Los turnos ya dados conservan el precio con el que se dieron.</p>
          </>
        )}

        {mensaje && <AvisoError tono={mensaje.tono} titulo={mensaje.titulo} comoSeguir={mensaje.comoSeguir} />}

        {confirmando && aplicable ? (
          <div role="alert" aria-labelledby={`${ids}-conf`} className="border-l-2 border-warning bg-warning-soft p-4 text-sm">
            <p id={`${ids}-conf`} className="font-semibold text-strong">
              ¿Seguro? Es un aumento del {plan.porcentaje?.toLocaleString("es-AR")} %.
            </p>
            <p className="mt-1 text-body">
              {ejemplo !== null && `Un servicio de $14.000 pasa a ${pesos(ejemplo)}. `}
              Suben {fmtNumberAR(plan.filas.length)} {plan.filas.length === 1 ? "servicio" : "servicios"}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="danger" onClick={aplicar} disabled={pendiente}>
                {pendiente ? "Subiendo…" : `Sí, subir ${textoDelAumento(plan.porcentaje ?? 0)}`}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={pendiente}>
                Revisar
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={aplicar} disabled={!aplicable || pendiente} className="w-full sm:w-auto">
            {pendiente
              ? "Subiendo…"
              : aplicable
                ? `Subir ${fmtNumberAR(plan.filas.length)} ${plan.filas.length === 1 ? "precio" : "precios"}`
                : "Completá los pasos para subir"}
          </Button>
        )}
        <p className="text-xs text-muted">
          <Link href="/admin/auditoria" className="inline-flex min-h-11 items-center underline underline-offset-2">
            Ver quién cambió qué en Auditoría
          </Link>
        </p>
      </Paso>
    </div>
  );
}
