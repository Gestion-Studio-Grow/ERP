import { requireApp } from "@/lib/require-app";
import { requireCapabilityFueraDeLaAgenda } from "@/lib/authz";
import { reporteProyectos, veLaPlata } from "@/lib/proyectos/datos.server";
import { etapaLabel, pesos, porcentaje, redondear } from "@/lib/proyectos/core";
import { BarraProyectos, tarjeta } from "../_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rentabilidad de proyectos" };

export default async function RentabilidadProyectos() {
  const user = await requireApp("proyectos");
  await requireCapabilityFueraDeLaAgenda("agenda:manage");
  const filas = await reporteProyectos();
  const con = filas.filter((f) => f.t);
  const suma = (g: (f: (typeof con)[number]) => number) => redondear(con.reduce((s, f) => s + g(f), 0));
  const neto = suma((f) => f.t!.neto);
  const ganancia = suma((f) => f.t!.ganancia);
  const gananciaReal = suma((f) => f.real.gananciaReal ?? 0);
  const conGastos = con.filter((f) => f.real.gananciaReal !== null).length;
  const porCobrar = suma((f) => Math.max(0, f.saldo));
  const porPagar = redondear(filas.reduce((s, f) => s + f.real.porPagar, 0));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <h1 className="mb-4 text-2xl font-bold text-strong">Rentabilidad</h1>
      <BarraProyectos activa="/admin/proyectos/reportes" conPlata={veLaPlata(user)} />
      <dl className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className={tarjeta}><dt className="text-sm text-muted">Vendido (neto, aprobado)</dt><dd className="text-xl font-bold text-strong">{pesos(neto)}</dd></div>
        <div className={tarjeta}><dt className="text-sm text-muted">Ganancia presupuestada</dt><dd className="text-xl font-bold text-strong">{pesos(ganancia)}{neto > 0 && ` · ${porcentaje(redondear((ganancia / neto) * 100))}`}</dd></div>
        <div className={tarjeta}><dt className="text-sm text-muted">Ganancia real ({conGastos === 1 ? "1 proyecto" : `${conGastos} proyectos`} con gastos)</dt><dd className="text-xl font-bold text-strong">{conGastos ? pesos(gananciaReal) : "—"}</dd></div>
        <div className={tarjeta}><dt className="text-sm text-muted">Por cobrar</dt><dd className="text-xl font-bold text-strong">{pesos(porCobrar)}</dd></div>
        <div className={tarjeta}><dt className="text-sm text-muted">Por pagar a proveedores</dt><dd className="text-xl font-bold text-strong">{pesos(porPagar)}</dd></div>
      </dl>
      <div className={`${tarjeta} overflow-x-auto`}>
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 pr-2 font-medium">Proyecto</th>
              <th className="pr-2 font-medium">Etapa</th>
              <th className="pr-2 text-right font-medium">Neto</th>
              <th className="pr-2 text-right font-medium">Costo presup.</th>
              <th className="pr-2 text-right font-medium">Costo real</th>
              <th className="pr-2 text-right font-medium">Ganancia real</th>
              <th className="pr-2 text-right font-medium">Cobrado</th>
              <th className="pr-2 text-right font-medium">Por cobrar</th>
              <th className="text-right font-medium">Por pagar</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t border-line">
                <td className="py-1.5 pr-2"><a href={`/admin/proyectos/${f.id}`} className="underline">#{f.numero} {f.nombre}</a><span className="block text-xs text-muted">{f.client.name}</span></td>
                <td className="pr-2">{etapaLabel(f.etapa, f.servicio)}</td>
                <td className="pr-2 text-right">{f.t ? pesos(f.t.neto) : "—"}</td>
                <td className="pr-2 text-right">{f.t ? pesos(f.t.costo) : "—"}</td>
                <td className="pr-2 text-right">{f.real.conGastos ? pesos(f.real.costoReal) : "—"}</td>
                <td className="pr-2 text-right font-medium text-strong">{f.real.gananciaReal !== null ? `${pesos(f.real.gananciaReal)} (${porcentaje(f.real.margenReal ?? 0)})` : "—"}</td>
                <td className="pr-2 text-right">{pesos(f.cobrado)}</td>
                <td className="pr-2 text-right">{f.t ? pesos(f.saldo) : "—"}</td>
                <td className="text-right">{f.real.porPagar > 0 ? pesos(f.real.porPagar) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-muted">La ganancia real sale de los gastos cargados en cada proyecto, sin IVA: mientras un trabajo siga abierto puede faltar algo por cargar.</p>
    </main>
  );
}
