import { getReportData } from "@/lib/actions";

function Table({ title, rows }: { title: string; rows: { label: string; total: number }[] }) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="font-medium mb-3">{title}</h3>
      {rows.length === 0 && <p className="text-sm text-neutral-500">Sin datos aún.</p>}
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between text-sm">
            <span className="text-neutral-500">{r.label}</span>
            <span className="font-medium">${r.total.toLocaleString("es-AR")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function ReportesPage() {
  const data = await getReportData();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Reportes</h1>
      <p className="text-neutral-500 mb-8">
        Ingresos confirmados (turnos con pago recibido).
      </p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-neutral-500">Ingresos totales</p>
          <p className="text-2xl font-semibold">
            ${data.totalIngresos.toLocaleString("es-AR")}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-neutral-500">Turnos pagados</p>
          <p className="text-2xl font-semibold">{data.cantidadPagos}</p>
        </div>
      </div>

      <div className="grid gap-4 mb-4">
        <Table title="Ingresos por día" rows={data.porDia} />
        <Table title="Ingresos por profesional" rows={data.porProfesional} />
        <Table title="Ingresos por servicio" rows={data.porServicio} />
      </div>

      <div className="rounded-lg border p-4">
        <h3 className="font-medium mb-1">Comisiones a pagar</h3>
        <p className="text-xs text-neutral-500 mb-3">
          Sobre turnos completados (servicio ya realizado), según el % configurado por profesional.
        </p>
        {data.comisiones.length === 0 && (
          <p className="text-sm text-neutral-500">
            Todavía no hay turnos completados con comisión configurada.
          </p>
        )}
        <div className="space-y-2">
          {data.comisiones.map((c) => (
            <div key={c.label} className="flex justify-between text-sm">
              <span className="text-neutral-500">
                {c.label} <span className="text-neutral-400">(sobre ${c.ingresos.toLocaleString("es-AR")})</span>
              </span>
              <span className="font-medium">${c.comision.toLocaleString("es-AR")}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
