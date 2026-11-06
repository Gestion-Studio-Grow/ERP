import { redirect } from "next/navigation";
import { KpiTile, Pestanas } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { actorActual, puede } from "@/lib/proyectos/gestion.server";
import { faltaCambio, recuadrosDeCuotas } from "@/lib/proyectos/empresa.server";
import { pesos } from "@/lib/proyectos/core";
import { TabCuentas } from "./_cuentas";
import { TabCashflow } from "./_cashflow";
import { TabBancos } from "./_bancos";
import { TabMonedas } from "./_monedas";
import { TabLiquidaciones } from "./_liquidaciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administración" };

const DE_EMPRESA = [
  { id: "cobrar", label: "Cuentas a cobrar" },
  { id: "pagar", label: "Cuentas a pagar" },
  { id: "cashflow", label: "Cashflow" },
  { id: "bancos", label: "Bancos" },
  { id: "monedas", label: "Monedas y gastos fijos" },
] as const;

type Busqueda = { tab?: string; estado?: string; q?: string; mes?: string };

export default async function Administracion({ searchParams }: { searchParams: Promise<Busqueda> }) {
  await requireApp("gestion-administracion");
  const a = await actorActual();
  const veEmpresa = puede(a, "empresa", "ver");
  const veLiquidaciones = puede(a, "liquidaciones", "ver");
  if (!veEmpresa && !veLiquidaciones) redirect("/admin/proyectos/inicio");
  const sp = await searchParams;
  const pedida = sp.tab ?? "";
  const tab = pedida === "liquidaciones" && veLiquidaciones ? "liquidaciones" : veEmpresa && DE_EMPRESA.some((t) => t.id === pedida) ? pedida : veEmpresa ? "cobrar" : "liquidaciones";
  const pestanas = [
    ...(veEmpresa ? DE_EMPRESA.map((t) => ({ href: `/admin/proyectos/administracion?tab=${t.id}`, etiqueta: t.label, actual: tab === t.id })) : []),
    ...(veLiquidaciones ? [{ href: "/admin/proyectos/administracion?tab=liquidaciones", etiqueta: "Liquidaciones", actual: tab === "liquidaciones" }] : []),
  ];
  const editaEmpresa = puede(a, "empresa", "editar");
  // La cuota de un proyecto la marca quien edita pagos del evento o las cuentas de la empresa: lo mismo que pide la acción.
  const editaPagos = editaEmpresa || puede(a, "pagos", "editar");
  // Quien sólo liquida sueldos no tiene por qué ver lo que se cobra y se paga.
  const datos = veEmpresa ? await recuadrosDeCuotas(a.tenantId) : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <h1 className="mb-4 text-2xl font-bold text-strong">Administración</h1>
      {datos && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile label="A cobrar" value={pesos(datos.resumen.aCobrar)} sub={`${pesos(datos.resumen.aCobrar7)} en 7 días`} />
          <KpiTile label="Cobros vencidos" value={pesos(datos.resumen.cobrosVencidos)} sub={datos.resumen.cantCobrosVencidos === 1 ? "1 cobro" : `${datos.resumen.cantCobrosVencidos} cobros`} />
          <KpiTile label="A pagar" value={pesos(datos.resumen.aPagar)} sub={`${pesos(datos.resumen.aPagar7)} en 7 días`} />
          <KpiTile label="Pagos vencidos" value={pesos(datos.resumen.pagosVencidos)} sub={datos.resumen.cantPagosVencidos === 1 ? "1 pago" : `${datos.resumen.cantPagosVencidos} pagos`} />
        </div>
      )}
      {datos && faltaCambio(datos.tc, datos.cuotas.filter((c) => !c.pagadoEl)) && (
        <p role="alert" className="mb-4 rounded-lg border border-line bg-surface-raised p-3 text-sm text-danger">Hay importes en dólares sin tipo de cambio: no suman a estos totales hasta que lo cargues en Monedas y gastos fijos.</p>
      )}
      <Pestanas pestanas={pestanas} etiqueta="Vistas de Administración" conRaya className="mb-4" />
      {(tab === "cobrar" || tab === "pagar") && datos && (
        <TabCuentas tipo={tab === "cobrar" ? "COBRO" : "PAGO"} estado={sp.estado} q={sp.q} cuotas={datos.cuotas} tc={datos.tc} tenantId={a.tenantId} editaEmpresa={editaEmpresa} editaPagos={editaPagos} />
      )}
      {tab === "cashflow" && <TabCashflow tenantId={a.tenantId} />}
      {tab === "bancos" && <TabBancos tenantId={a.tenantId} editaEmpresa={editaEmpresa} editaPagos={editaPagos} />}
      {tab === "monedas" && <TabMonedas tenantId={a.tenantId} editaEmpresa={editaEmpresa} />}
      {tab === "liquidaciones" && <TabLiquidaciones tenantId={a.tenantId} mes={sp.mes} edita={puede(a, "liquidaciones", "editar")} paga={a.rol === "DIRECCION" || a.rol === "ADMINISTRACION"} />}
    </main>
  );
}
