"use client";

// Pegar la lista, ver la comparación con el catálogo y guardarla. La lectura y la comparación
// son las mismas funciones que usa el servidor (supermercado/listas-proveedor.ts).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink, cn, fmtMoneyARS } from "@/components/ui";
import { compararConElCatalogo, leerPlanillaDeLista } from "@/lib/supermercado/listas-proveedor";
import { guardarListaDeProveedor } from "@/lib/supermercado/listas-actions";

type ListaResumen = { proveedorId: string; cantidad: number; vigenteDesde: string; cargada: string; version: string };

export default function ListasDeProveedores({
  proveedores,
  listas,
  productos,
  hoy,
}: {
  proveedores: { id: string; name: string }[];
  listas: ListaResumen[];
  productos: { id: string; name: string; codigo: string | null; costo: number | null }[];
  hoy: string;
}) {
  const router = useRouter();
  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id ?? "");
  const [texto, setTexto] = useState("");
  const [vigenteDesde, setVigenteDesde] = useState(hoy);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();
  const lectura = useMemo(() => leerPlanillaDeLista(texto), [texto]);
  const comparacion = useMemo(() => compararConElCatalogo(lectura.renglones, productos), [lectura, productos]);
  const actual = listas.find((l) => l.proveedorId === proveedorId);
  const nombreDe = new Map(proveedores.map((p) => [p.id, p.name]));

  if (proveedores.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line-strong p-6 text-sm text-body">
        <p>Todavía no hay proveedores cargados. Dalos de alta con su CUIT y volvé para cargar su lista.</p>
        <ButtonLink href="/admin/proveedores" className="mt-3">
          Ir a Proveedores
        </ButtonLink>
      </div>
    );
  }

  function guardar() {
    setMensaje(null);
    startTransition(async () => {
      const r = await guardarListaDeProveedor({ proveedorId, texto, vigenteDesde, version: actual?.version ?? null });
      setMensaje(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error });
      if (r.ok) {
        setTexto("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {listas.length > 0 && (
        <section aria-label="Listas cargadas" className="rounded-md border border-line bg-surface-raised p-4">
          <h2 className="text-base font-semibold text-strong">Listas cargadas</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {listas.map((l) => (
              <li key={l.proveedorId} className="text-body">
                <strong className="text-strong">{nombreDe.get(l.proveedorId) ?? "Proveedor"}</strong>: {l.cantidad} productos, vale desde el{" "}
                {`${l.vigenteDesde.slice(8, 10)}/${l.vigenteDesde.slice(5, 7)}/${l.vigenteDesde.slice(0, 4)}`}.
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3 rounded-md border border-line bg-surface-raised p-4">
        <h2 className="text-base font-semibold text-strong">Cargar una lista</h2>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="text-strong">Proveedor</span>
            <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className="mt-1 block h-11 min-w-56 rounded-md border border-line-strong bg-surface-raised px-3">
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-strong">Vale desde</span>
            <input type="date" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)} className="mt-1 block h-11 rounded-md border border-line-strong px-3" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-strong">La lista (código; descripción; costo — una fila por producto)</span>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={8}
            placeholder={"7790895000997;Gaseosa 2,25 L;3.250,50\n7790040000017;Yerba 1 kg;4.100"}
            className="mt-1 block w-full rounded-md border border-line-strong bg-surface-raised px-3 py-2 font-mono text-sm"
          />
        </label>
        <p className="text-xs text-muted">Se puede copiar de Excel o del mail: sirve con punto y coma, coma o tabulación. Los importes, como se escriben acá (3.250,50).</p>
        {texto.trim() && (
          <p className="text-sm text-body" aria-live="polite">
            {lectura.renglones.length} renglones leídos · {comparacion.encontrados.length} están en tu catálogo · {comparacion.sinProducto.length} no
            {lectura.errores.length > 0 && ` · ${lectura.errores.length} con problemas`}
          </p>
        )}
        {lectura.errores.length > 0 && (
          <ul className="space-y-0.5 text-sm text-danger">
            {lectura.errores.slice(0, 8).map((e, i) => (
              <li key={i}>
                Fila {e.fila}: {e.motivo}
              </li>
            ))}
          </ul>
        )}
        {comparacion.encontrados.length > 0 && (
          <ul aria-label="Costos que cambian" className="max-h-80 divide-y divide-line overflow-y-auto rounded-md border border-line">
            {comparacion.encontrados.map((e) => (
              <li key={e.productId} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 text-strong">{e.nombre}</span>
                <span className="tabular-nums text-body">
                  {e.costoHoy != null ? fmtMoneyARS(e.costoHoy) : "sin costo"} → <strong className="text-strong">{fmtMoneyARS(e.costoLista)}</strong>
                  {e.variacion != null && (
                    <span className={cn("ml-2 text-xs", Math.abs(e.variacion) >= 10 ? "font-semibold text-warning" : "text-muted")}>
                      {e.variacion > 0 ? "+" : ""}
                      {e.variacion.toLocaleString("es-AR")} %
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {mensaje && (
          <p role={mensaje.ok ? "status" : "alert"} className={mensaje.ok ? "text-sm text-success" : "text-sm font-medium text-danger"}>
            {mensaje.texto}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={guardar} disabled={pendiente || lectura.renglones.length === 0}>
            {pendiente ? "Guardando…" : actual ? "Reemplazar la lista" : "Guardar la lista"}
          </Button>
          {mensaje?.ok && (
            <ButtonLink href="/admin/catalogo/precios" variant="outline">
              Poner precios por margen
            </ButtonLink>
          )}
        </div>
      </section>
    </div>
  );
}
