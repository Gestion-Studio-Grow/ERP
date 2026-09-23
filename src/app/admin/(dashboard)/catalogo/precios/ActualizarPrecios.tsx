"use client";

// Actualizar precios en cuatro pasos: qué productos, cuánto, cómo se redondea y la vista
// previa con el antes y el después.
//
// La vista previa se calcula acá, en vivo, con `planificarAumento` (aumento-core.ts): la
// misma función que corre el servidor. Pero lo que se escribe NO sale de acá: "Aplicar" manda
// el pedido y la huella del plan que se ve, y el servidor vuelve a armar el plan contra la
// base dentro de la transacción. Si los precios cambiaron en el medio, no escribe nada y la
// pantalla se refresca con los precios nuevos.
//
// Un cambio de más del 30 % pide una segunda confirmación, que el servidor también exige. Un
// aumento no se pide dos veces por error: al aplicar, el porcentaje queda vacío.

import { useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AvisoError, Badge, Button, buttonClasses, cn, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { CORTE_CATEGORIAS, type CorteCategoria } from "@/lib/carniceria/cortes";
import {
  PASOS_REDONDEO,
  UMBRAL_CONFIRMACION,
  aumentoAplicable,
  gondolaDe,
  leerPorcentaje,
  planificarAumento,
  precioConPorcentaje,
  precioDeVenta,
  textoDelPorcentaje,
  type Alcance,
  type PasoRedondeo,
  type PedidoAumento,
  type ProductoParaPrecios,
  type Sentido,
} from "@/lib/catalogo/aumento-core";
import { normalizarNombre } from "@/lib/catalogo/planilla-core";
import { aplicarAumento } from "@/lib/catalogo/precios-actions";

type TipoAlcance = Alcance["tipo"];

const porForma = (saleUnit: "UNIT" | "WEIGHT") => (saleUnit === "WEIGHT" ? "/kg" : "");
/** Pesos sin centavos si es redondo, con centavos si los tiene: un $12.500,50 no se muestra como $12.501. */
const pesos = (n: number) => fmtMoneyARS(n, Math.round(n * 100) % 100 === 0 ? 0 : 2);

/** Chip de opción: un radio nativo (teclado y lector de pantalla gratis) con forma de botón. */
function Opcion({
  name,
  value,
  checked,
  onChange,
  children,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
        checked ? "border-accent bg-accent-soft text-strong" : "border-line-strong bg-surface-raised text-body",
        className,
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-line bg-surface-raised p-4 sm:p-5">
      <legend className="px-1 text-base font-semibold text-strong">
        <span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-accent-soft text-xs tabular-nums text-strong">
          {n}
        </span>
        {titulo}
      </legend>
      <div className="mt-2 space-y-3">{children}</div>
    </fieldset>
  );
}

export default function ActualizarPrecios({
  productos,
  sustantivo,
  veEtiquetas,
}: {
  productos: ProductoParaPrecios[];
  sustantivo: { uno: string; varios: string };
  veEtiquetas: boolean;
}) {
  const router = useRouter();
  const ids = useId();
  const [tipo, setTipo] = useState<TipoAlcance>("todos");
  const [gondola, setGondola] = useState<CorteCategoria | "">("");
  const [texto, setTexto] = useState("");
  const [tildados, setTildados] = useState<ReadonlySet<string>>(new Set());
  const [filtroLista, setFiltroLista] = useState("");
  const [sentido, setSentido] = useState<Sentido>("subir");
  const [porcentaje, setPorcentaje] = useState("");
  const [redondeo, setRedondeo] = useState<PasoRedondeo>(10);
  const [confirmando, setConfirmando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tono: "error" | "aviso"; titulo: string; comoSeguir: string } | null>(null);
  const [listo, setListo] = useState<{ cambiados: number; porcentaje: string } | null>(null);
  const [pendiente, startTransition] = useTransition();

  // Góndolas con productos, en el orden de siempre. Con una sola no tiene sentido elegir.
  const gondolas = useMemo(() => {
    const cuenta = new Map<CorteCategoria, number>();
    for (const p of productos) cuenta.set(gondolaDe(p), (cuenta.get(gondolaDe(p)) ?? 0) + 1);
    return CORTE_CATEGORIAS.filter((c) => cuenta.has(c.id)).map((c) => ({ ...c, n: cuenta.get(c.id)! }));
  }, [productos]);

  function alcanceElegido(): Alcance {
    switch (tipo) {
      case "gondola":
        // Eligió "una góndola" pero todavía no cuál: no hay nada elegido.
        return gondola ? { tipo: "gondola", gondola } : { tipo: "tildados", ids: [] };
      case "texto":
        return { tipo: "texto", texto };
      case "tildados":
        return { tipo: "tildados", ids: [...tildados] };
      default:
        return { tipo: "todos" };
    }
  }
  const alcance = alcanceElegido();
  const pedido: PedidoAumento = { alcance, sentido, porcentaje, redondeo };
  // Sin memo: son cientos de productos y una cuenta con enteros; recalcular en cada tecla es
  // lo que hace que la vista previa esté siempre al día.
  const plan = planificarAumento(productos, pedido);
  const lecturaPct = leerPorcentaje(porcentaje, sentido);
  const aplicable = aumentoAplicable(plan);

  const listaFiltrada = useMemo(() => {
    const q = normalizarNombre(filtroLista);
    return q ? productos.filter((p) => normalizarNombre(p.name).includes(q)) : productos;
  }, [productos, filtroLista]);

  function cambiar<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
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
    if (!aplicable) return;
    if (plan.pideConfirmacion && !confirmando) {
      setConfirmando(true);
      return;
    }
    const enviado = plan;
    startTransition(async () => {
      const r = await aplicarAumento(pedido, enviado.plan.huella, enviado.pideConfirmacion ? true : false);
      setConfirmando(false);
      if (r.ok) {
        setListo({ cambiados: r.cambiados, porcentaje: textoDelPorcentaje(enviado.sentido, enviado.porcentaje ?? 0) });
        setMensaje(null);
        // El porcentaje queda vacío: la vista previa no vuelve a ofrecer el mismo aumento
        // sobre los precios que ya subieron.
        setPorcentaje("");
        router.refresh();
        return;
      }
      if (r.catalogoCambio) {
        // La pantalla trae los precios de ahora y la vista previa se recalcula sola.
        router.refresh();
        setMensaje({ tono: "aviso", titulo: "Los precios cambiaron mientras mirabas", comoSeguir: r.mensaje });
        return;
      }
      if (r.pideConfirmacion) {
        setConfirmando(true);
        return;
      }
      setMensaje({ tono: "error", titulo: "No se cambiaron los precios", comoSeguir: r.mensaje });
    });
  }

  const conPrecio = (lista: readonly ProductoParaPrecios[]) => lista.filter((p) => precioDeVenta(p) !== null).length;
  const ejemplo = plan.porcentaje !== null ? precioConPorcentaje(10000, plan.porcentaje, sentido, redondeo) : null;

  return (
    <div className="space-y-5">
      {listo && (
        <div role="status" className="rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-sm">
          <p className="font-semibold text-strong">
            Listo: {fmtNumberAR(listo.cambiados)} {listo.cambiados === 1 ? "precio cambiado" : "precios cambiados"} ({listo.porcentaje}).
          </p>
          <p className="mt-0.5 text-body">
            Quedó registrado quién los cambió y cuándo. Los pedidos que ya estaban tomados conservan su precio.
          </p>
          {veEtiquetas && (
            <Link href="/admin/catalogo/etiquetas" className={cn(buttonClasses("solid", "md"), "mt-3")}>
              Imprimir las etiquetas nuevas
            </Link>
          )}
        </div>
      )}

      <Paso n={1} titulo={`¿Qué ${sustantivo.varios}?`}>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Qué ${sustantivo.varios} cambian`}>
          <Opcion name={`${ids}-alcance`} value="todos" checked={tipo === "todos"} onChange={() => cambiar(setTipo)("todos")}>
            Todos ({fmtNumberAR(conPrecio(productos))})
          </Opcion>
          {gondolas.length > 1 && (
            <Opcion name={`${ids}-alcance`} value="gondola" checked={tipo === "gondola"} onChange={() => cambiar(setTipo)("gondola")}>
              Una góndola
            </Opcion>
          )}
          <Opcion name={`${ids}-alcance`} value="texto" checked={tipo === "texto"} onChange={() => cambiar(setTipo)("texto")}>
            Los que dicen…
          </Opcion>
          <Opcion name={`${ids}-alcance`} value="tildados" checked={tipo === "tildados"} onChange={() => cambiar(setTipo)("tildados")}>
            Elegir uno por uno
          </Opcion>
        </div>

        {tipo === "gondola" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-gondola`} className="text-sm font-medium text-strong">
              Góndola
            </label>
            <select
              id={`${ids}-gondola`}
              value={gondola}
              onChange={(e) => cambiar(setGondola)(e.target.value as CorteCategoria | "")}
              className="h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-sm text-strong sm:max-w-xs"
            >
              <option value="">Elegí una…</option>
              {gondolas.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label} ({g.n})
                </option>
              ))}
            </select>
          </div>
        )}

        {tipo === "texto" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-texto`} className="text-sm font-medium text-strong">
              El nombre contiene
            </label>
            <input
              id={`${ids}-texto`}
              value={texto}
              onChange={(e) => cambiar(setTexto)(e.target.value)}
              placeholder="ej: vacuno"
              autoComplete="off"
              className="h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-sm text-strong sm:max-w-xs"
            />
            <p className="text-xs text-muted">Sin importar mayúsculas ni acentos.</p>
          </div>
        )}

        {tipo === "tildados" && (
          <div className="space-y-2">
            <label htmlFor={`${ids}-buscar`} className="sr-only">
              Buscar en la lista
            </label>
            <input
              id={`${ids}-buscar`}
              value={filtroLista}
              onChange={(e) => setFiltroLista(e.target.value)}
              placeholder={`Buscar ${sustantivo.uno}…`}
              autoComplete="off"
              className="h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-sm text-strong"
            />
            <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-md border border-line">
              {listaFiltrada.map((p) => {
                const precio = precioDeVenta(p);
                return (
                  <li key={p.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={tildados.has(p.id)}
                        onChange={() => tildar(p.id)}
                        className="size-5 shrink-0"
                      />
                      <span className="min-w-0 flex-1 break-words text-strong">{p.name}</span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {precio === null ? "sin precio" : `${pesos(precio)}${porForma(p.saleUnit)}`}
                      </span>
                    </label>
                  </li>
                );
              })}
              {listaFiltrada.length === 0 && <li className="px-3 py-3 text-sm text-muted">Ninguno con ese nombre.</li>}
            </ul>
          </div>
        )}

        <p className="text-sm text-body" aria-live="polite">
          {plan.elegidos === 0
            ? `Todavía no elegiste ${sustantivo.varios}.`
            : `Elegiste ${fmtNumberAR(plan.elegidos)} ${plan.elegidos === 1 ? sustantivo.uno : sustantivo.varios}` +
              (plan.sinPrecio.length > 0 ? ` (${fmtNumberAR(plan.sinPrecio.length)} sin precio: esos no se tocan).` : ".")}
        </p>
      </Paso>

      <Paso n={2} titulo="¿Cuánto?">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2" role="radiogroup" aria-label="Suben o bajan">
            <Opcion name={`${ids}-sentido`} value="subir" checked={sentido === "subir"} onChange={() => cambiar(setSentido)("subir")}>
              Suben
            </Opcion>
            <Opcion name={`${ids}-sentido`} value="bajar" checked={sentido === "bajar"} onChange={() => cambiar(setSentido)("bajar")}>
              Bajan
            </Opcion>
          </div>
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
                aria-invalid={lecturaPct.estado === "invalido" || undefined}
                aria-describedby={`${ids}-pct-ayuda`}
                className="h-11 w-28 rounded-md border border-line-strong bg-surface-raised px-3 text-right text-base tabular-nums text-strong aria-invalid:border-danger"
              />
              <span className="text-base text-body">%</span>
            </div>
          </div>
        </div>
        <p id={`${ids}-pct-ayuda`} className={cn("text-xs", lecturaPct.estado === "invalido" ? "text-danger" : "text-muted")} role={lecturaPct.estado === "invalido" ? "alert" : undefined}>
          {lecturaPct.estado === "invalido"
            ? lecturaPct.mensaje
            : `Con coma si hace falta: 8,5. Un cambio de más del ${UMBRAL_CONFIRMACION} % se confirma dos veces.`}
        </p>
      </Paso>

      <Paso n={3} titulo="Redondeo">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Redondear a">
          {PASOS_REDONDEO.map((paso) => (
            <Opcion key={paso} name={`${ids}-redondeo`} value={String(paso)} checked={redondeo === paso} onChange={() => cambiar(setRedondeo)(paso)}>
              {paso === 1 ? "Al peso" : `A $${paso}`}
            </Opcion>
          ))}
        </div>
        <p className="text-xs text-muted">
          {sentido === "subir" ? "En un aumento se redondea siempre para arriba" : "En una baja se redondea siempre para abajo"}
          {ejemplo !== null && `: un precio de $10.000 queda en ${fmtMoneyARS(ejemplo, 0)}`}.
        </p>
      </Paso>

      <Paso n={4} titulo="Vista previa">
        {plan.error ? (
          <p className="text-sm text-muted" aria-live="polite">
            {plan.error}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" aria-live="polite">
              <Badge tone="info">
                {fmtNumberAR(plan.filas.length)} {plan.filas.length === 1 ? "cambia" : "cambian"}
              </Badge>
              {plan.sinCambios > 0 && <Badge>{fmtNumberAR(plan.sinCambios)} quedan igual</Badge>}
              {plan.sinPrecio.length > 0 && <Badge>{fmtNumberAR(plan.sinPrecio.length)} sin precio</Badge>}
              {plan.porcentaje !== null && <Badge tone="accent">{textoDelPorcentaje(plan.sentido, plan.porcentaje)}</Badge>}
            </div>
            {/* Con su propio alto: con 200 cortes, el botón de Aplicar no queda a diez pantallas. */}
            <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto rounded-md border border-line" aria-label="Antes y después">
              {plan.filas.map((f) => (
                <li key={f.productId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                  <span className="min-w-0 break-words text-strong">
                    {f.nombre}
                    {f.pausado && <Badge className="ml-2">pausado</Badge>}
                  </span>
                  <span className="tabular-nums text-body">
                    <span className="text-muted line-through decoration-1">{pesos(f.antes)}</span>
                    {" → "}
                    <span className="font-semibold text-strong">{pesos(f.despues)}</span>
                    {porForma(f.saleUnit)}
                    <span className={cn("ml-2 text-xs", f.porRedondeo ? "font-medium text-warning" : "text-muted")}>
                      {f.efectivo > 0 ? "+" : ""}
                      {f.efectivo.toLocaleString("es-AR")} %{f.porRedondeo ? " por el redondeo" : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {mensaje && (
          <AvisoError tono={mensaje.tono} titulo={mensaje.titulo} comoSeguir={mensaje.comoSeguir} />
        )}

        {confirmando && aplicable ? (
          <div role="alert" aria-labelledby={`${ids}-conf`} className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm">
            <p id={`${ids}-conf`} className="font-semibold text-strong">
              ¿Seguro? Es {plan.sentido === "subir" ? "un aumento" : "una baja"} del{" "}
              {plan.porcentaje?.toLocaleString("es-AR")} %.
            </p>
            <p className="mt-1 text-body">
              {ejemplo !== null && `Un precio de $10.000 pasa a ${fmtMoneyARS(ejemplo, 0)}. `}
              Cambia {fmtNumberAR(plan.filas.length)} {plan.filas.length === 1 ? sustantivo.uno : sustantivo.varios}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="danger" onClick={aplicar} disabled={pendiente}>
                {pendiente ? "Aplicando…" : `Sí, aplicar ${textoDelPorcentaje(plan.sentido, plan.porcentaje ?? 0)}`}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={pendiente}>
                Revisar
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={aplicar} disabled={!aplicable || pendiente} className="w-full sm:w-auto">
            {pendiente
              ? "Aplicando…"
              : aplicable
                ? `Aplicar ${fmtNumberAR(plan.filas.length)} ${plan.filas.length === 1 ? "cambio" : "cambios"}`
                : "Completá los pasos para aplicar"}
          </Button>
        )}
      </Paso>
    </div>
  );
}
