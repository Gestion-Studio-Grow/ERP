"use client";

// Planilla de cortes y precios: bajar a Excel, editar, subir con vista previa, aplicar.
//
// Se monta SÓLO en la rama retail de /admin/catalogo (CH no la ve), y las acciones vuelven
// a chequear el rubro del lado del servidor. El navegador sólo decodifica el archivo a texto:
// la vista previa la arma el servidor, y "Aplicar" vuelve a armarla desde el texto dentro de
// la transacción que escribe. Lo que se ve acá es lo que el servidor leyó, no una cuenta
// hecha en el navegador que después se manda como verdad.

import { useRef, useState, useTransition } from "react";
import { Badge, Button, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { decodificarArchivo, planAplicable, type PlanPlanilla } from "@/lib/catalogo/planilla-core";
import { aplicarPlanilla, previsualizarPlanilla } from "@/lib/catalogo/planilla-actions";

const precio = (n: number | null) => (n == null ? "sin precio" : fmtMoneyARS(n));
const porForma = (s: "UNIT" | "WEIGHT") => (s === "WEIGHT" ? "/kg" : "/u");

export default function PlanillaCortes() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<string>("");
  const [plan, setPlan] = useState<PlanPlanilla | null>(null);
  const [mensaje, setMensaje] = useState<{ tono: "danger" | "success"; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();

  function limpiar() {
    setTexto(null);
    setPlan(null);
    setArchivo("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setMensaje(null);
    setPlan(null);
    const leido = decodificarArchivo(new Uint8Array(await f.arrayBuffer()));
    setTexto(leido);
    setArchivo(f.name);
    startTransition(async () => {
      const r = await previsualizarPlanilla(leido);
      if (r.ok) setPlan(r.plan);
      else setMensaje({ tono: "danger", texto: r.mensaje });
    });
  }

  function aplicar() {
    if (!texto || !plan) return;
    startTransition(async () => {
      const r = await aplicarPlanilla(texto, plan.huella);
      if (r.ok) {
        limpiar();
        setMensaje({
          tono: "success",
          texto: `Listo: ${r.altas} corte${r.altas === 1 ? "" : "s"} nuevo${r.altas === 1 ? "" : "s"} y ${r.cambios} cambio${r.cambios === 1 ? "" : "s"} guardados.`,
        });
      } else {
        // Si el servidor armó un plan distinto (el catálogo cambió), se muestra ése: es el
        // que se aplicaría ahora, y la persona lo tiene que ver antes de volver a apretar.
        if (r.plan) setPlan(r.plan);
        setMensaje({ tono: "danger", texto: r.mensaje });
      }
    });
  }

  const aplicable = plan != null && planAplicable(plan);

  return (
    <section aria-labelledby="planilla-titulo" className="rounded-lg border border-line bg-surface-raised p-4 sm:p-5">
      <h2 id="planilla-titulo" className="text-base font-semibold text-strong">
        Planilla de cortes y precios
      </h2>
      <p className="mt-1 text-sm text-muted">
        Bajá la planilla, cambiá precios o sumá cortes en Excel, y subila. Antes de guardar te
        mostramos qué cambia. El stock no se carga desde acá: se carga con un recuento en Ajustes.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <a href="/admin/catalogo/planilla" download className={buttonClasses("outline", "md")}>
          Bajar planilla
        </a>
        <label className={`${buttonClasses("solid", "md")} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus`}>
          {pendiente && !plan ? "Leyendo…" : "Subir planilla"}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={alElegir}
            disabled={pendiente}
          />
        </label>
      </div>

      {mensaje && (
        <p
          role={mensaje.tono === "danger" ? "alert" : "status"}
          className={`mt-4 rounded-md px-3 py-2.5 text-sm ${
            mensaje.tono === "danger" ? "border border-danger/30 bg-danger-soft text-danger" : "bg-success-soft text-success"
          }`}
        >
          {mensaje.texto}
        </p>
      )}

      {plan && (
        <div className="mt-5 space-y-5" aria-live="polite">
          <div>
            <p className="text-xs uppercase tracking-wide text-faint">Vista previa de {archivo || "la planilla"} — todavía no se guardó nada</p>
            {plan.errorGeneral ? (
              <p role="alert" className="mt-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
                {plan.errorGeneral}
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone="accent">{plan.altas.length} nuevos</Badge>
                <Badge tone="info">{plan.cambios.length} cambios</Badge>
                <Badge tone={plan.errores.length > 0 ? "danger" : "neutral"}>{plan.errores.length} con error</Badge>
                <Badge>{plan.sinCambios} sin cambios</Badge>
              </div>
            )}
          </div>

          {plan.errores.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-danger">Filas con error</h3>
              <p className="text-xs text-muted">Con una sola fila con error no se aplica nada. Corregilas en Excel y volvé a subir.</p>
              <ul className="mt-2 divide-y divide-line rounded-md border border-danger/30">
                {plan.errores.map((e) => (
                  <li key={e.fila} className="px-3 py-2 text-sm">
                    <span className="font-medium text-strong tabular-nums">Fila {e.fila}</span>
                    {e.nombre && <span className="text-body"> · {e.nombre}</span>}
                    <span className="block text-danger">{e.motivo}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.altas.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-strong">Cortes nuevos</h3>
              <p className="text-xs text-muted">
                No están en el catálogo con ese nombre. Si alguno es un corte que renombraste, se va a crear
                otro: corregí el nombre en la planilla.
              </p>
              <ul className="mt-2 divide-y divide-line rounded-md border border-line">
                {plan.altas.map((a) => (
                  <li key={a.fila} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-sm">
                    <span className="text-strong">{a.data.name}</span>
                    <span className="tabular-nums text-body">
                      {precio(a.data.saleUnit === "WEIGHT" ? a.data.pricePerKg : a.data.price)}
                      {porForma(a.data.saleUnit)}
                      {!a.data.trackStock && <span className="text-muted"> · sin control de stock</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.cambios.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-strong">Cambios</h3>
              <ul className="mt-2 divide-y divide-line rounded-md border border-line">
                {plan.cambios.map((c) => (
                  <li key={c.productId} className="px-3 py-2 text-sm">
                    <span className="text-strong">{c.nombre}</span>
                    {c.inactivo && <Badge className="ml-2">pausado</Badge>}
                    {c.precioDespues !== null && (
                      <span className="block tabular-nums text-body">
                        {precio(c.precioAntes)} → <span className="font-medium text-strong">{precio(c.precioDespues)}</span>
                        {porForma(c.saleUnit)}
                      </span>
                    )}
                    {c.controlDespues !== null && (
                      <span className="block text-body">
                        Control de stock: {c.controlAntes ? "sí" : "no"} → <span className="font-medium text-strong">{c.controlDespues ? "sí" : "no"}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.stockIgnorado > 0 && (
            <p className="rounded-md bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">
              {plan.stockIgnorado} fila{plan.stockIgnorado === 1 ? " trae" : "s traen"} un stock distinto del que tiene
              el sistema. La planilla no carga stock: para corregirlo, hacé un recuento en Ajustes.
            </p>
          )}

          {!plan.errorGeneral && plan.noEstanEnPlanilla.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer py-2 text-muted">
                {plan.noEstanEnPlanilla.length} producto{plan.noEstanEnPlanilla.length === 1 ? "" : "s"} del catálogo no
                {plan.noEstanEnPlanilla.length === 1 ? " está" : " están"} en la planilla: no se tocan.
              </summary>
              <p className="text-xs text-faint">{plan.noEstanEnPlanilla.map((p) => p.nombre).join(" · ")}</p>
            </details>
          )}

          <div className="flex flex-wrap gap-3">
            <Button onClick={aplicar} disabled={!aplicable || pendiente}>
              {pendiente
                ? "Aplicando…"
                : aplicable
                  ? `Aplicar ${plan.altas.length + plan.cambios.length} cambio${plan.altas.length + plan.cambios.length === 1 ? "" : "s"}`
                  : plan.errorGeneral || plan.errores.length > 0
                    ? "Corregí los errores para aplicar"
                    : "0 cambios: no hay nada para aplicar"}
            </Button>
            <Button variant="ghost" onClick={limpiar} disabled={pendiente}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
