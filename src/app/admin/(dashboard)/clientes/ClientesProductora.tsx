// LA LISTA DE CLIENTES DE UNA PRODUCTORA: quién es cada marca, cuántos trabajos tiene abiertos y cuánto falta cobrarle.
// Las vistas de un negocio de turnos (Frecuentes, Hace mucho, Cumplen, Sin visitas) no le dicen nada a quien vende
// proyectos, y sus cobros no están en los turnos: esa lista marcaba a todos «Nunca compró».

import Link from "next/link";
import { permisoEfectivo } from "@/lib/capabilities";
import { clientesConProyectos, veLaPlata } from "@/lib/proyectos/datos.server";
import { pesos } from "@/lib/proyectos/core";
import type { SessionUser } from "@/lib/session";
import { campo, tarjeta } from "../proyectos/_vista";
import NuevaFicha from "./NuevaFicha";

export default async function ClientesProductora({ user, q }: { user: SessionUser; q: string }) {
  const clientes = await clientesConProyectos(q);
  const conPlata = veLaPlata(user);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <h1 className="text-2xl font-bold text-strong">Clientes</h1>
      <p className="mb-4 text-sm text-muted">{clientes.length === 1 ? "1 cliente" : `${clientes.length} clientes`}{q ? ` con «${q}»` : ""}</p>
      {permisoEfectivo(user, "clients:manage") && <NuevaFicha sinFicha={[]} />}
      <form method="get" className="my-4 flex gap-2">
        <input name="q" type="search" defaultValue={q} placeholder="Nombre, teléfono o correo" aria-label="Buscar cliente" className={campo} />
        <button type="submit" className="min-h-11 shrink-0 rounded-lg border border-line bg-surface-raised px-4 text-sm font-medium text-strong">Buscar</button>
      </form>
      {clientes.length === 0 ? (
        <p className="text-sm text-muted">{q ? "No encontramos clientes con esa búsqueda." : "Todavía no hay clientes. Se cargan acá o al crear un proyecto."}</p>
      ) : (
        <div className={`${tarjeta} overflow-x-auto`}>
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-2 font-medium">Cliente</th>
                <th className="pr-2 font-medium">Contacto</th>
                <th className="pr-2 text-right font-medium">Proyectos abiertos</th>
                <th className="pr-2 text-right font-medium">Total</th>
                {conPlata && <th className="text-right font-medium">Por cobrar</th>}
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="py-2 pr-2"><Link href={`/admin/clientes/${c.id}`} className="font-medium text-strong underline">{c.name}</Link></td>
                  <td className="pr-2 text-muted">{[c.phone, c.email].filter(Boolean).join(" · ")}</td>
                  <td className="pr-2 text-right">{c.abiertos}</td>
                  <td className="pr-2 text-right">{c.total}</td>
                  {conPlata && <td className="text-right font-medium text-strong">{pesos(c.porCobrar)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
