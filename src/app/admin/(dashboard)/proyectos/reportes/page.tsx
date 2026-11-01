import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { reporteProyectos, veLaPlata } from "@/lib/proyectos/datos.server";
import { etapaLabel, pesos, redondear } from "@/lib/proyectos/core";
import { BarraProyectos, tarjeta } from "../_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rentabilidad de proyectos" };

export default async function RentabilidadProyectos() {
  const user = await requireApp("proyectos");
  await requireCapability("agenda:manage");
  const filas = await reporteProyectos();
  const con = filas.filter((f) => f.t);
  const suma = (g: (f: (typeof con)[number]) => number) => redondear(con.reduce((s, f) => s + g(f), 0));
  const neto = suma((f) => f.t!.neto);
  const ganancia = suma((f) => f.t!.ganancia);
  const porCobrar = suma((f) => Math.max(0, f.saldo));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <h1 className="mb-4 text-2xl font-bold text-strong">Rentabilidad</h1>
      <BarraProyectos activa="/admin/proyectos/reportes" conPlata={veLaPlata(user)} />
      <dl className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={tarjeta}><dt className="text-sm text-muted">Vendido (neto, aprobado)</dt><dd className="text-xl font-bold text-strong">{pesos(neto)}</dd></div>
        <div className={tarjeta}><dt className="text-sm text-muted">Ganancia presupuestada</dt><dd className="text-xl font-bold text-strong">{pesos(ganancia)}{neto > 0 && ` · ${redondear((ganancia / neto) * 100)}%`}</dd></div>
        <div className={tarjeta}><dt className="text-sm text-muted">Por cobrar</dt><dd className="text-xl font-bold text-strong">{pesos(porCobrar)}</dd></div>
      </dl>
      <div className={`${tarjeta} overflow-x-auto`}>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr><th className="py-1 pr-2 font-medium">Proyecto</th><th className="pr-2 font-medium">Etapa</th><th className="pr-2 text-right font-medium">Neto</th><th className="pr-2 text-right font-medium">Ganancia</th><th className="pr-2 text-right font-medium">Cobrado</th><th className="text-right font-medium">Saldo</th></tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t border-line">
                <td className="py-1.5 pr-2"><a href={`/admin/proyectos/${f.id}`} className="underline">#{f.numero} {f.nombre}</a><span className="block text-xs text-muted">{f.client.name}</span></td>
                <td className="pr-2">{etapaLabel(f.etapa, f.servicio)}</td>
                <td className="pr-2 text-right">{f.t ? pesos(f.t.neto) : "—"}</td>
                <td className="pr-2 text-right">{f.t ? `${pesos(f.t.ganancia)} (${f.t.margenPct}%)` : "—"}</td>
                <td className="pr-2 text-right">{pesos(f.cobrado)}</td>
                <td className="text-right font-medium text-strong">{f.t ? pesos(f.saldo) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-muted">La ganancia sale del costo presupuestado, no del gasto real: compará con tus facturas de proveedores antes de cerrar un trabajo.</p>
    </main>
  );
}
