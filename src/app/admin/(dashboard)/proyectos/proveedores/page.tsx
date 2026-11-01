import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { alternarProveedor, pagarGasto } from "@/lib/proyectos/acciones";
import { proveedoresConGastos, veLaPlata } from "@/lib/proyectos/datos.server";
import { fechaCorta, MEDIOS, MEDIO_LABEL, pesos, totalDelGasto } from "@/lib/proyectos/core";
import { BarraProyectos, campo, tarjeta } from "../_vista";
import { FormProveedor } from "./FormProveedor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proveedores" };

// Con quién trabaja la productora, cuánto lleva gastado con cada uno y qué le debe. Son los mismos proveedores del
// sistema (tabla `Supplier`): acá se ven por lo que importa en un proyecto.
export default async function ProveedoresDeProyectos() {
  const user = await requireApp("proyectos");
  await requireCapability("agenda:manage");
  const { proveedores, pendientes, porPagar } = await proveedoresConGastos();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <h1 className="mb-4 text-2xl font-bold text-strong">Proveedores</h1>
      <BarraProyectos activa="/admin/proyectos/proveedores" conPlata={veLaPlata(user)} />

      <section className={cn(tarjeta, "mb-4")} aria-label="Por pagar">
        <h2 className="mb-1 font-semibold text-strong">Por pagar</h2>
        <p className="mb-3 text-xl font-bold text-strong">{pesos(porPagar)}</p>
        {pendientes.length === 0 ? (
          <p className="text-sm text-muted">No hay gastos por pagar.</p>
        ) : (
          <ul className="grid gap-2">
            {pendientes.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-sm">
                <span className="min-w-0">
                  <strong className="text-strong">{g.supplier?.name ?? "Sin proveedor"}</strong> · {g.descripcion} · {pesos(totalDelGasto(g))}
                  <span className="block text-muted">
                    <Link href={`/admin/proyectos/${g.proyecto.id}`} className="underline">#{g.proyecto.numero} {g.proyecto.nombre}</Link> · {fechaCorta(g.fecha)}
                  </span>
                </span>
                <form action={pagarGasto} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={g.id} />
                  <select name="medio" aria-label={`Medio de pago de ${g.descripcion}`} defaultValue="TRANSFERENCIA" className={cn(campo, "w-auto")}>
                    {MEDIOS.map((m) => <option key={m} value={m}>{MEDIO_LABEL[m]}</option>)}
                  </select>
                  <SubmitButton className={buttonClasses("outline", "md")}>Pagar</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cn(tarjeta, "mb-4")} aria-label="Sumar proveedor">
        <h2 className="mb-3 font-semibold text-strong">Sumar proveedor</h2>
        <FormProveedor />
      </section>

      <section className={cn(tarjeta, "overflow-x-auto")} aria-label="Lista de proveedores">
        {proveedores.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay proveedores. También se suman solos al cargar un gasto en un proyecto.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">Proveedor</th>
                <th className="pr-2 font-medium">Contacto</th>
                <th className="pr-2 text-right font-medium">Gastado (neto)</th>
                <th className="pr-2 text-right font-medium">Por pagar</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {proveedores.map((s) => (
                <tr key={s.id} className={cn("border-t border-line", !s.active && "text-muted")}>
                  <td className="py-1.5 pr-2 font-medium">{s.name}{!s.active && " (de baja)"}{s.taxId && <span className="block text-xs font-normal text-muted">CUIT {s.taxId}</span>}</td>
                  <td className="pr-2 text-muted">{[s.phone, s.email].filter(Boolean).join(" · ")}</td>
                  <td className="pr-2 text-right">{pesos(s.gastado)}</td>
                  <td className="pr-2 text-right font-medium text-strong">{pesos(s.porPagar)}</td>
                  <td className="text-right">
                    <form action={alternarProveedor}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="activo" value={s.active ? "0" : "1"} />
                      <button type="submit" className={buttonClasses("ghost", "md")} aria-label={`${s.active ? "Dar de baja" : "Reactivar"} a ${s.name}`}>{s.active ? "Dar de baja" : "Reactivar"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
