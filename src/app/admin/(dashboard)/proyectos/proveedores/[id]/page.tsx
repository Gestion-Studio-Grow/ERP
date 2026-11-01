import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { requireApp } from "@/lib/require-app";
import { pagarGasto } from "@/lib/proyectos/acciones";
import { cambiarEstadoProveedor } from "@/lib/proyectos/acciones-gestion";
import { fechaCorta, MEDIOS, MEDIO_LABEL, pesos, totalDelGasto } from "@/lib/proyectos/core";
import { veLaPlata } from "@/lib/proyectos/datos.server";
import { codigoProyecto, ESTADO_ITEM_LABEL, plataEn } from "@/lib/proyectos/gestion-core";
import { exigirVer, puede } from "@/lib/proyectos/gestion.server";
import { iniciales } from "@/lib/proyectos/gestion-lecturas-core";
import { detalleDeProveedor } from "@/lib/proyectos/gestion-lecturas.server";
import { campo, tarjeta } from "../../_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proveedor" };

export default async function DetalleProveedor({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("proveedores");
  const { id } = await params;
  const d = await detalleDeProveedor(a, id);
  if (!d) notFound();
  const { proveedor: s, historial, cuotas, gastosPorPagar, verPlata, verCostos } = d;
  const f = s.fichaDeProyecto;
  const edita = puede(a, "proveedores", "editar");
  const paga = verPlata && puede(a, "pagos", "editar") && veLaPlata(a.user);
  const datos = [
    ["Rubro", f?.rubro ?? "Sin rubro"],
    ["Ciudad", f?.ciudad ?? "—"],
    ["Teléfono", s.phone ?? "—"],
    ["Mail", s.email ?? "—"],
    ["CUIT", s.taxId ?? "—"],
    ["Condiciones", f?.condiciones ?? "—"],
    ["% de anticipo", f ? `${f.anticipoPct.toLocaleString("es-AR")} %` : "50 % (sin ficha)"],
    ["Evaluación", f ? `★ ${f.evaluacion.toLocaleString("es-AR")} de 5` : "Sin puntaje"],
    ["Moneda habitual", f?.moneda === "USD" ? "Dólares" : "Pesos"],
    ["Eventos", String(d.eventos)],
  ];

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-5">
      <Link href="/admin/proyectos/proveedores" className="inline-flex min-h-11 items-center text-sm text-strong underline">Volver a proveedores</Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-ink">{iniciales(s.name)}</span>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold text-strong">{s.name}</h1>
            {!s.active && <p className="text-sm text-danger">De baja</p>}
          </div>
        </div>
        {edita && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/proyectos/proveedores/${s.id}/editar`} className={buttonClasses("outline", "md")}>Editar</Link>
            <form action={cambiarEstadoProveedor}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="activo" value={s.active ? "0" : "1"} />
              <button type="submit" className={buttonClasses("ghost", "md")}>{s.active ? "Dar de baja" : "Reactivar"}</button>
            </form>
          </div>
        )}
      </header>

      <section className={tarjeta} aria-label="Datos">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {datos.map(([t, v]) => (
            <div key={t} className="min-w-0">
              <dt className="text-xs text-muted">{t}</dt>
              <dd className="break-words text-strong">{v}</dd>
            </div>
          ))}
        </dl>
        {f?.notas && <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-sm text-strong">{f.notas}</p>}
      </section>

      {verPlata && (
        <section className={tarjeta} aria-label="Lo que se le debe y lo gastado">
          <dl className="mb-3 grid grid-cols-2 gap-3">
            <div><dt className="text-xs text-muted">Le debés</dt><dd className="text-xl font-bold text-strong">{pesos(d.debe)}</dd></div>
            <div><dt className="text-xs text-muted">Gastado</dt><dd className="text-xl font-bold text-strong">{pesos(d.gastado)}</dd></div>
          </dl>
          <p className="mb-3 text-xs text-muted">Gastado suma lo cargado como gasto (neto) y las cuotas pagadas, en pesos al tipo de cambio de hoy.</p>
          {cuotas.length > 0 && (
            <ul className="grid gap-2" aria-label="Cuotas pendientes">
              {cuotas.map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2 border-t border-line pt-2 text-sm">
                  <span className="min-w-0 break-words text-strong">
                    {c.concepto}
                    <span className="block text-xs text-muted">{c.proyecto?.nombre ?? "Empresa"} · vence {fechaCorta(c.venceEl)}</span>
                  </span>
                  <strong className="whitespace-nowrap text-strong">{plataEn(c.monto, c.moneda)}</strong>
                </li>
              ))}
            </ul>
          )}
          {gastosPorPagar.length > 0 && (
            <ul className="mt-2 grid gap-2" aria-label="Gastos por pagar">
              {gastosPorPagar.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-sm">
                  <span className="min-w-0 break-words text-strong">
                    {g.descripcion} · {pesos(totalDelGasto(g))}
                    <span className="block text-xs text-muted">
                      <Link href={`/admin/proyectos/${g.proyecto.id}`} className="underline">#{g.proyecto.numero} {g.proyecto.nombre}</Link> · {fechaCorta(g.fecha)}
                    </span>
                  </span>
                  {paga && (
                    <form action={pagarGasto} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={g.id} />
                      <select name="medio" aria-label={`Medio de pago de ${g.descripcion}`} defaultValue="TRANSFERENCIA" className={cn(campo, "w-auto")}>
                        {MEDIOS.map((m) => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
                      </select>
                      <SubmitButton className={buttonClasses("outline", "md")}>Pagar</SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {cuotas.length === 0 && gastosPorPagar.length === 0 && <p className="text-sm text-muted">No hay nada pendiente con este proveedor.</p>}
        </section>
      )}

      <section className={tarjeta} aria-label="Historial de eventos y precios">
        <h2 className="mb-2 font-semibold text-strong">Historial de eventos y precios</h2>
        {historial.length === 0 ? (
          <p className="text-sm text-muted">Todavía no participó de ningún evento que puedas ver.</p>
        ) : (
          <ul className="grid">
            {historial.map((h) => (
              <li key={h.id} className="grid gap-1 border-t border-line py-2 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto_auto_auto] sm:items-center sm:gap-3">
                <Link href={`/admin/proyectos/${h.proyecto.id}`} className="min-w-0 break-words text-strong underline-offset-2 hover:underline">
                  {h.proyecto.nombre}
                  <span className="block text-xs text-muted">{codigoProyecto(h.proyecto.numero, h.proyecto.createdAt)} · {fechaCorta(h.proyecto.fechaEvento)}</span>
                </Link>
                <span className="min-w-0 break-words text-strong">{h.descripcion}</span>
                <span className="text-xs text-muted">Cant. {h.cantidad.toLocaleString("es-AR")}</span>
                <span className="text-xs text-strong">{verCostos && h.precioUnitario !== null && h.moneda ? `${plataEn(h.precioUnitario, h.moneda)} c/u` : "Precio oculto"}</span>
                <span className="text-xs text-muted">{ESTADO_ITEM_LABEL[h.estadoItem] ?? h.estadoItem}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
