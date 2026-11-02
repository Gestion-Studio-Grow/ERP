import { KpiTile } from "@/components/ui";
import { ETAPAS, etapaLabel, pesos, porcentaje } from "@/lib/proyectos/core";
import { estaConfirmado, sumarPor, tasaDeConversion } from "@/lib/proyectos/empresa-core";
import { proyectosConNumeros } from "@/lib/proyectos/empresa.server";
import { motivoBase } from "@/lib/proyectos/gestion-core";
import { BarrasAcostadas } from "../administracion/_graficos";
import { tarjeta } from "../_vista";

const TOPE_CLIENTES = 10;

export async function TabComerciales({ tenantId }: { tenantId: string }) {
  const proyectos = await proyectosConNumeros(tenantId);
  const confirmados = proyectos.filter(estaConfirmado);
  const perdidos = proyectos.filter((p) => p.perdidoEl);
  const vivos = proyectos.filter((p) => !p.perdidoEl);
  const embudo = ETAPAS.map((e) => {
    const suyos = vivos.filter((p) => p.etapa === e);
    return { nombre: etapaLabel(e), valor: suyos.length, texto: `${suyos.length} · ${pesos(suyos.reduce((s, p) => s + p.ventaOEstimado, 0))}` };
  });
  const aFilas = (l: { nombre: string; valor: number }[]) => l.map((x) => ({ ...x, texto: pesos(x.valor) }));
  const porCliente = sumarPor(confirmados, (p) => p.cliente, (p) => p.venta);
  const porTipo = sumarPor(confirmados, (p) => p.tipoEvento || "Sin tipo", (p) => p.venta);
  const motivos = sumarPor(perdidos, (p) => (p.motivoPerdida ? motivoBase(p.motivoPerdida) : "") || "Sin motivo cargado", () => 1);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile label="Conversión" value={porcentaje(tasaDeConversion(confirmados.length, perdidos.length))} sub="confirmados sobre decididos" />
        <KpiTile label="Confirmados" value={confirmados.length} />
        <KpiTile label="Perdidos" value={perdidos.length} />
      </div>
      <section className={tarjeta}>
        <h2 className="mb-3 font-semibold text-strong">Embudo por etapa</h2>
        <BarrasAcostadas filas={embudo} />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={tarjeta}>
          <h2 className="mb-3 font-semibold text-strong">Facturación por cliente</h2>
          {porCliente.length === 0 ? <p className="text-sm text-muted">Sin eventos confirmados todavía.</p> : <BarrasAcostadas filas={aFilas(porCliente.slice(0, TOPE_CLIENTES))} />}
          {porCliente.length > TOPE_CLIENTES && <p className="mt-2 text-sm text-muted">Los {TOPE_CLIENTES} primeros de {porCliente.length}.</p>}
        </section>
        <section className={tarjeta}>
          <h2 className="mb-3 font-semibold text-strong">Facturación por tipo de evento</h2>
          {porTipo.length === 0 ? <p className="text-sm text-muted">Sin eventos confirmados todavía.</p> : <BarrasAcostadas filas={aFilas(porTipo)} />}
        </section>
      </div>
      <section className={tarjeta}>
        <h2 className="mb-3 font-semibold text-strong">Motivos de pérdida</h2>
        {motivos.length === 0 ? <p className="text-sm text-muted">No hay proyectos perdidos.</p> : <BarrasAcostadas filas={motivos.map((m) => ({ ...m, texto: String(m.valor) }))} />}
      </section>
    </div>
  );
}
