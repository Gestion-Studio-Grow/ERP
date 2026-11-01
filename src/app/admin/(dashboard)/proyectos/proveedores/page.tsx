import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { requireApp } from "@/lib/require-app";
import { pagarGasto } from "@/lib/proyectos/acciones";
import { cambiarEstadoProveedor } from "@/lib/proyectos/acciones-gestion";
import { fechaCorta, MEDIOS, MEDIO_LABEL, pesos, totalDelGasto } from "@/lib/proyectos/core";
import { veLaPlata } from "@/lib/proyectos/datos.server";
import { RUBROS } from "@/lib/proyectos/gestion-core";
import { exigirVer, puede } from "@/lib/proyectos/gestion.server";
import { iniciales } from "@/lib/proyectos/gestion-lecturas-core";
import { listaDeProveedores } from "@/lib/proyectos/gestion-lecturas.server";
import { campo, etiqueta, tarjeta } from "../_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proveedores" };

// Con quién trabaja la productora. Son los mismos proveedores del sistema (`Supplier`): la ficha suma lo que importa en un evento.
export default async function ProveedoresDeProyectos({ searchParams }: { searchParams: Promise<{ rubro?: string; q?: string; bajas?: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("proveedores");
  const sp = await searchParams;
  const rubro = (RUBROS as readonly string[]).includes(sp.rubro ?? "") ? sp.rubro! : "";
  const q = (sp.q ?? "").slice(0, 100);
  const bajas = sp.bajas === "1";
  const { proveedores, pendientes, porPagar, porPagarCuotas, verPlata } = await listaDeProveedores(a, { rubro, q, bajas });
  const edita = puede(a, "proveedores", "editar");
  const paga = verPlata && puede(a, "pagos", "editar") && veLaPlata(a.user);

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-strong">Proveedores</h1>
          <p className="text-sm text-muted" aria-live="polite">{proveedores.length === 1 ? "1 proveedor" : `${proveedores.length} proveedores`}</p>
        </div>
        {edita && <Link href="/admin/proyectos/proveedores/nuevo" className={buttonClasses("solid", "md")}>Nuevo proveedor</Link>}
      </header>

      <form method="get" role="search" className={cn(tarjeta, "grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end")}>
        <label className={etiqueta}>
          Rubro
          <select name="rubro" defaultValue={rubro} className={campo}>
            <option value="">Todos los rubros</option>
            {RUBROS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className={etiqueta}>Buscar<input name="q" defaultValue={q} placeholder="Nombre, CUIT, ciudad, contacto" className={campo} /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-strong"><input type="checkbox" name="bajas" value="1" defaultChecked={bajas} className="h-5 w-5" /> Ver de baja</label>
        <button type="submit" className={buttonClasses("outline", "md")}>Filtrar</button>
      </form>

      {proveedores.length === 0 ? (
        <p className={cn(tarjeta, "text-sm text-muted")}>{q || rubro ? "Nadie coincide con ese filtro." : "Todavía no hay proveedores. También se suman solos al cargar un gasto en un proyecto."}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Lista de proveedores">
          {proveedores.map((s) => {
            const f = s.fichaDeProyecto;
            return (
              <li key={s.id} className={cn(tarjeta, "grid min-w-0 content-start gap-2", !s.active && "opacity-70")}>
                <div className="flex items-start gap-3">
                  <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-ink">{iniciales(s.name)}</span>
                  <div className="min-w-0">
                    <Link href={`/admin/proyectos/proveedores/${s.id}`} className="block break-words font-semibold text-strong underline-offset-2 hover:underline">{s.name}</Link>
                    <p className="text-xs text-muted">{[f?.rubro ?? "Sin rubro", f?.ciudad].filter(Boolean).join(" · ")}{!s.active && " · De baja"}</p>
                  </div>
                </div>
                <p className="text-sm text-strong">
                  {f ? <span aria-label={`Puntaje ${f.evaluacion} de 5`}>★ {f.evaluacion.toLocaleString("es-AR")}</span> : <span className="text-muted">Sin puntaje</span>}
                  <span className="text-muted"> · {s.eventos === 1 ? "1 evento" : `${s.eventos} eventos`}</span>
                </p>
                {f?.condiciones && <p className="break-words text-xs text-muted">{f.condiciones}</p>}
                {(s.phone || s.email) && <p className="break-words text-xs text-muted">{[s.phone, s.email].filter(Boolean).join(" · ")}</p>}
                {s.taxId && <p className="text-xs text-muted">CUIT {s.taxId}</p>}
                {verPlata && s.debe > 0 && <p className="text-sm font-medium text-strong">Debés {pesos(s.debe)}</p>}
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/proyectos/proveedores/${s.id}`} className={buttonClasses("outline", "sm")}>Ver</Link>
                  {edita && <Link href={`/admin/proyectos/proveedores/${s.id}/editar`} className={buttonClasses("outline", "sm")}>Editar</Link>}
                  {edita && (
                    <form action={cambiarEstadoProveedor}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="activo" value={s.active ? "0" : "1"} />
                      <button type="submit" className={buttonClasses("ghost", "sm")} aria-label={`${s.active ? "Dar de baja" : "Reactivar"} a ${s.name}`}>{s.active ? "Dar de baja" : "Reactivar"}</button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {verPlata && (
        <section className={tarjeta} aria-label="Por pagar">
          <h2 className="mb-1 font-semibold text-strong">Por pagar</h2>
          <p className="text-xl font-bold text-strong">{pesos(porPagar + porPagarCuotas)}</p>
          <p className="mb-3 text-xs text-muted">Gastos cargados {pesos(porPagar)} · Cuotas de las fichas de estos proveedores {pesos(porPagarCuotas)}</p>
          {pendientes.length === 0 ? (
            <p className="text-sm text-muted">No hay gastos por pagar.</p>
          ) : (
            <ul className="grid gap-2">
              {pendientes.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-sm">
                  <span className="min-w-0 break-words">
                    <strong className="text-strong">{g.supplier?.name ?? "Sin proveedor"}</strong> · {g.descripcion} · {pesos(totalDelGasto(g))}
                    <span className="block text-muted">
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
        </section>
      )}
    </main>
  );
}
