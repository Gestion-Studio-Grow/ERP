import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { gestionaClases } from "@/lib/padel/plata-guardia";
import { getCurrentTenantId } from "@/lib/tenant";
import { basePrisma } from "@/lib/prisma-base";
import { badgePendientes } from "@/lib/padel/datos.server";
import { cn } from "@/components/ui";
import { DIAS_ARREPENTIMIENTO, PRECIO_PROVISIONAL, precioEnPesos } from "@/lib/profeturnos/planes";
import { leerPlan } from "@/lib/profeturnos/plan.server";
import { pagosDisponibles } from "@/lib/profeturnos/cobro-mp";
import { mensajeDelTramite, esTipoTramite, PROFETURNOS, type Efecto } from "@/lib/factoque-tramites";
import { tarjeta } from "../_vista";
import { Cabecera } from "../_cabecera";
import { contactoParaPagarElAbono } from "../config/contacto-gsg";
import { pagarAbono, tramiteDesdeMiPlan } from "./_acciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Mi plan", generator: "Gestión Studio Grow" };

// «MI PLAN» (ProfeTurnos T2): estado de la prueba o del abono, el precio (provisional a confirmar) y el
// pago por Mercado Pago con la cuenta de GSG. Plata: sólo OWNER o quien gestiona Clases.

const boton =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl px-4 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const TITULO: Record<string, string> = {
  prueba: "Estás en la prueba gratis",
  activo: "Tu abono está al día",
  vencido: "Tu plan está vencido",
  libre: "Tu cuenta no tiene vencimiento",
};

const fechaLarga = (s: string) =>
  new Date(`${s}T12:00:00Z`).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const EFECTOS: readonly Efecto[] = ["plan_a_gratis", "ya_era_gratis", "registrado"];

export default async function MiPlan({ searchParams }: { searchParams: Promise<{ error?: string; volviste?: string; tramite?: string; tipo?: string; efecto?: string }> }) {
  const user = await requireApp("padel-clases");
  if (user.role !== "OWNER" && !gestionaClases(user)) redirect("/admin/clases");
  const tenantId = await getCurrentTenantId();
  const [plan, pendientes, sp, negocio] = await Promise.all([
    leerPlan(tenantId),
    badgePendientes().catch(() => 0),
    searchParams,
    basePrisma.tenant.findUnique({ where: { id: tenantId }, select: { subdomain: true, slug: true } }),
  ]);
  const conPagos = pagosDisponibles();
  const contacto = contactoParaPagarElAbono(negocio?.subdomain || negocio?.slug || "");
  const tramite =
    sp.tramite && esTipoTramite(sp.tipo) && EFECTOS.includes(sp.efecto as Efecto)
      ? { numero: String(sp.tramite).slice(0, 40), texto: mensajeDelTramite(sp.tipo, sp.efecto as Efecto, false, PROFETURNOS) }
      : null;

  const detalle =
    plan.estado === "prueba"
      ? `Te ${plan.diasRestantes === 1 ? "queda 1 día" : `quedan ${plan.diasRestantes} días`} de prueba${plan.hasta ? `, hasta el ${fechaLarga(plan.hasta)}` : ""}.`
      : plan.estado === "activo"
        ? `Pago hasta el ${fechaLarga(plan.hasta as string)} (${plan.diasRestantes === 1 ? "1 día" : `${plan.diasRestantes} días`}).`
        : plan.estado === "vencido"
          ? "Podés ver todo, pero para agendar o confirmar clases y que tu turnero tome pedidos, pagá el abono. No se borró nada."
          : "Tu cuenta la dio de alta Gestión Studio Grow: no se cobra por acá.";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <Cabecera titulo="Mi plan" detalle="Tu prueba gratis y tu abono de ProfeTurnos." pendientes={pendientes} actual="config" />

      {tramite && (
        <section className={cn(tarjeta, "mb-4 grid gap-1")} role="status" data-qa="plan-tramite">
          <p className="text-base font-semibold text-strong">Trámite {tramite.numero}</p>
          <p className="text-sm text-body">{tramite.texto}</p>
        </section>
      )}
      {sp.volviste === "1" && !tramite && (
        <p className={cn(tarjeta, "mb-4 text-sm text-body")} role="status" data-qa="plan-volviste">
          Si el pago se aprobó, se acredita solo en unos minutos. Actualizá esta pantalla para verlo.
        </p>
      )}
      {sp.error && (
        <p className={cn(tarjeta, "mb-4 text-sm text-danger")} role="alert" data-qa="plan-error">
          {sp.error === "sin-pagos" ? "Pagos no disponibles todavía, escribinos." : "Mercado Pago no respondió. Probá de nuevo en un rato."}
        </p>
      )}

      <section className={cn(tarjeta, "mb-4 grid gap-2")} aria-labelledby="t-estado" data-qa={`plan-estado-${plan.estado}`}>
        <h2 id="t-estado" className="text-lg font-bold text-strong">{TITULO[plan.estado]}</h2>
        <p className="text-base text-body">{detalle}</p>
        {plan.baja && plan.estado !== "vencido" && (
          <p className="text-sm text-muted" data-qa="plan-baja">Pediste la baja: no se renueva y lo pagado sigue hasta el final.</p>
        )}
      </section>

      {plan.estado !== "libre" && (
        <section className={cn(tarjeta, "mb-4 grid gap-3")} aria-labelledby="t-abono">
          <h2 id="t-abono" className="text-base font-bold text-strong">Abono mensual</h2>
          <p className="text-2xl font-bold text-strong" data-qa="plan-precio">
            {precioEnPesos()} <span className="text-base font-normal text-muted">por mes, final</span>
          </p>
          {PRECIO_PROVISIONAL && <p className="text-sm text-muted">Precio provisional a confirmar.</p>}
          <p className="text-sm text-muted">Pagás un mes por vez: no hay débito automático. Si pagás antes de que venza, se suma al final.</p>
          {conPagos ? (
            <form action={pagarAbono}>
              <button type="submit" className={cn(boton, "bg-accent text-on-accent hover:opacity-90")} data-qa="plan-pagar-mp">
                Pagar con Mercado Pago
              </button>
            </form>
          ) : (
            <div className="grid gap-2" data-qa="plan-sin-pagos">
              <p className="text-sm text-body">Pagos no disponibles todavía, escribinos.</p>
              <a href={contacto.href} className={cn(boton, "border border-line-strong text-strong hover:bg-surface-sunken")}>
                {contacto.rotulo}
              </a>
            </div>
          )}
        </section>
      )}

      {plan.estado !== "libre" && user.role === "OWNER" && (
        <section className={cn(tarjeta, "grid gap-3")} aria-labelledby="t-tramites">
          <h2 id="t-tramites" className="text-base font-bold text-strong">Arrepentimiento y baja</h2>
          <p className="text-sm text-muted">
            Tenés {DIAS_ARREPENTIMIENTO} días desde cada pago para arrepentirte: te devolvemos lo pagado por el mismo medio. La baja corta la renovación y no borra tus datos.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <form action={tramiteDesdeMiPlan}>
              <input type="hidden" name="tipo" value="arrepentimiento" />
              <button type="submit" className={cn(boton, "border border-line-strong text-strong hover:bg-surface-sunken")} data-qa="plan-arrepentimiento">
                Me arrepiento
              </button>
            </form>
            <form action={tramiteDesdeMiPlan}>
              <input type="hidden" name="tipo" value="baja" />
              <button type="submit" className={cn(boton, "border border-line-strong text-strong hover:bg-surface-sunken")} data-qa="plan-baja-boton">
                Darme de baja
              </button>
            </form>
          </div>
        </section>
      )}
    </main>
  );
}
