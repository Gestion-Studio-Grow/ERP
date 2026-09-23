import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { prisma } from "@/lib/prisma";
import { roleHasCapability } from "@/lib/capabilities";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { EmptyState, PageHeader, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { cargarBandeja } from "@/lib/crm/lecturas";
import { contextoCrm, nombreDelNegocio, urlDelSitio } from "@/lib/crm/cargas.server";
import { textoContacto } from "@/lib/crm/textos";
import { CRM_REGLAS } from "@/lib/crm/reglas";
import EnlacesClientes from "../EnlacesClientes";
import FilaContacto, { type FilaContactoVista } from "./FilaContacto";

export const dynamic = "force-dynamic";

// PARA CONTACTAR HOY — la bandeja comercial de la recepción, 1 a 1 por WhatsApp.
//
// La lista la arma el motor comercial (src/lib/crm/bandeja.ts) con la MISMA lectura que el
// número del Inicio (`cargarBandeja`). El texto de cada motivo es provisional (textos.ts) y la
// recepción lo puede cambiar en el chat antes de mandarlo: el botón sólo lo deja escrito.
// Tocar WhatsApp deja la constancia (crm-actions.ts) y la clienta sale de la bandeja 14 días.

export default async function ParaContactarHoyPage() {
  const user = await requireApp("para-contactar-hoy");
  const c = await contextoCrm();
  const [{ bandeja }, negocio, sitio] = await Promise.all([cargarBandeja(prisma, c), nombreDelNegocio(), urlDelSitio()]);
  const verPlata = roleHasCapability(user.role, "reports:read");
  const puedeContactar = roleHasCapability(user.role, "clients:manage");

  const filas: FilaContactoVista[] = bandeja.filas.flatMap((f) => {
    const texto = textoContacto(
      f.motivo,
      {
        nombre: f.nombre,
        negocio,
        servicio: f.servicio,
        diasParaCumple: f.diasParaCumple,
        linkResena: f.appointmentId && sitio ? `${sitio}/reserva/turno/${f.appointmentId}` : null,
      },
      c.rubro,
    );
    // La bandeja ya excluye los teléfonos que no son celulares: esto es sólo para el tipo.
    const wa = waLinkClienta(f.telefono, texto);
    if (!wa) return [];
    const recuperar = f.motivo === "recuperar" || f.motivo === "pasada";
    return [
      {
        clientId: f.clientId,
        nombre: f.nombre,
        telefono: f.telefono,
        motivo: f.motivo,
        explicacion: f.explicacion,
        wa,
        valor: verPlata && recuperar && f.valorAnual > 0 ? `${fmtMoneyARS(f.valorAnual, 0)} por año` : null,
      },
    ];
  });

  const ex = bandeja.excluidas;
  const fuera = [
    ex.contactoReciente && `${ex.contactoReciente} contactadas hace menos de ${CRM_REGLAS.contactoRecienteDias} días`,
    ex.conTurno && `${ex.conTurno} con turno reservado`,
    ex.baja && `${ex.baja} ${ex.baja === 1 ? "pidió" : "pidieron"} no recibir mensajes`,
    ex.sinCelular && `${ex.sinCelular} sin un celular válido en la ficha`,
  ].filter(Boolean);
  const topeCumplido = bandeja.contactadasHoy >= bandeja.tope;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Para contactar hoy"
        description={`${filas.length} para escribir hoy · ${bandeja.contactadasHoy} ya ${bandeja.contactadasHoy === 1 ? "contactada" : "contactadas"} (hasta ${bandeja.tope} por día).`}
      />
      <EnlacesClientes role={user.role} actual="para-contactar-hoy" />

      {!puedeContactar && (
        <p className="mb-4 rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm text-muted">
          Podés ver la bandeja, pero dejar la constancia del contacto lo hace quien atiende a los clientes.
        </p>
      )}

      {filas.length === 0 ? (
        <EmptyState
          title={topeCumplido ? `Ya se contactaron las ${bandeja.tope} de hoy` : "No hay nadie para contactar hoy"}
          description={
            topeCumplido
              ? "El tope es para que los mensajes sigan siendo de a uno. Mañana la bandeja propone más."
              : "Cuando alguien cumpla años, deje de venir o haya que pedirle una reseña, aparece acá."
          }
          action={
            <Link href="/admin/clientes/recuperar" className={buttonClasses("outline", "md")}>
              Ver clientes por recuperar
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-line/60 rounded-lg border border-line bg-surface-raised">
          {filas.map((f) => (
            <FilaContacto key={f.clientId} fila={f} />
          ))}
        </ul>
      )}

      {fuera.length > 0 && <p className="mt-4 text-sm text-muted">No se muestran: {fuera.join(" · ")}.</p>}

      <details className="mt-6 rounded-lg border border-line bg-surface-raised text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 font-medium text-strong">Cómo se arma esta lista</summary>
        <ul className="list-disc space-y-1 px-8 pb-4 text-muted">
          {c.rubro === "servicios" && <li>Pedir reseña: vino ayer, el turno quedó completado y todavía no dejó su opinión.</li>}
          <li>Cumpleaños: cumple de hoy a dentro de {CRM_REGLAS.cumpleAvisoDias} días (sólo si la ficha tiene la fecha).</li>
          <li>
            Por recuperar: pasó entre {String(CRM_REGLAS.riesgoDesdeCiclos).replace(".", ",")} y {CRM_REGLAS.perdidaDespuesDeCiclos} veces su
            ciclo sin volver; primero las que más gastan.
          </li>
          <li>
            No entra quien ya tiene turno, a quien se le escribió hace menos de {CRM_REGLAS.contactoRecienteDias} días, ni quien pidió
            no recibir mensajes.
          </li>
          <li>Hasta {CRM_REGLAS.topeBandejaPorDia} por día. Los números son provisionales y se ajustan con la dueña.</li>
        </ul>
      </details>
    </main>
  );
}
