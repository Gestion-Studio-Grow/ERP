import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { buttonClasses, cn, EmptyState } from "@/components/ui";
import { roleHasCapability } from "@/lib/capabilities";
import { listaContratos } from "@/lib/inmobiliaria/datos.server";
import { diaCorto, ESTADO_CONTRATO_LABEL, INDICE_LABEL, pesos, type EstadoContrato, type IndiceAjuste } from "@/lib/inmobiliaria/core";
import { BarraInmo, RAIZ, tarjeta, titulo } from "../_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inmobiliaria · Alquileres" };

export default async function Alquileres() {
  const user = await requireApp("inmobiliaria");
  await requireCapability("agenda:manage");
  const contratos = await listaContratos();
  const vigentes = contratos.filter((c) => c.estado === "VIGENTE");
  const debe = vigentes.reduce((s, c) => s + c.debe, 0);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={titulo}>Alquileres administrados</h1>
          <p className="text-sm text-muted">
            {vigentes.length} contrato{vigentes.length === 1 ? "" : "s"} vigente{vigentes.length === 1 ? "" : "s"}
            {debe > 0 ? ` · ${pesos(debe)} vencidos sin cobrar` : " · nadie debe"}
          </p>
        </div>
        <Link href={`${RAIZ}/alquileres/nuevo`} className={cn(buttonClasses("solid", "lg"), "w-full justify-center sm:w-auto")}>
          + Nuevo contrato
        </Link>
      </header>

      <BarraInmo activa={`${RAIZ}/alquileres`} conPlata esDuenio={roleHasCapability(user.role, "users:manage")} />

      {contratos.length === 0 ? (
        <EmptyState title="Todavía no hay contratos" description="Cargá el primero: propiedad, inquilino, fechas, alquiler y cómo se actualiza. Las cuotas se arman solas." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {contratos.map((c) => {
            const ajuste = c.avisos.find((a) => a.tipo === "ajuste");
            const fin = c.avisos.find((a) => a.tipo === "vence-contrato");
            return (
              <li key={c.id} className={cn(tarjeta, "relative flex flex-col gap-1.5")} style={{ borderLeft: `4px solid ${c.estado !== "VIGENTE" ? "var(--text-faint)" : c.debe > 0 ? "var(--danger)" : "var(--success)"}` }}>
                <span className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    Contrato Nº {c.numero} · {ESTADO_CONTRATO_LABEL[c.estado as EstadoContrato] ?? c.estado}
                  </span>
                  <span>
                    {diaCorto(c.inicio)} → {diaCorto(c.fin)}
                  </span>
                </span>
                <Link href={`${RAIZ}/alquileres/${c.id}`} className="font-semibold text-strong after:absolute after:inset-0 after:content-['']">
                  {c.propiedad}
                </Link>
                <span className="text-sm text-muted">
                  Alquila {c.inquilino} · dueño {c.propietario}
                </span>
                <span className="mt-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>
                    <strong className="tabular-nums text-strong">{pesos(c.alquilerVigente)}</strong>
                    <span className="text-muted">
                      {" "}
                      · {INDICE_LABEL[c.indice as IndiceAjuste] ?? c.indice}
                      {c.indice !== "SIN_AJUSTE" ? ` cada ${c.cadaMeses} meses` : ""}
                    </span>
                  </span>
                  {c.debe > 0 && (
                    <strong style={{ color: "var(--danger)" }}>
                      Debe {pesos(c.debe)} ({c.cuotasVencidas} cuota{c.cuotasVencidas > 1 ? "s" : ""})
                    </strong>
                  )}
                </span>
                {(ajuste || fin) && (
                  <span className="text-xs font-semibold text-strong">
                    {ajuste && (ajuste.faltan < 0 ? `⚠️ Falta aplicar la actualización del ${diaCorto(ajuste.dia)}` : `⚠️ Se actualiza el ${diaCorto(ajuste.dia)}`)}
                    {ajuste && fin && " · "}
                    {fin && (fin.faltan < 0 ? `Venció el ${diaCorto(fin.dia)}` : `Vence el ${diaCorto(fin.dia)}`)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
