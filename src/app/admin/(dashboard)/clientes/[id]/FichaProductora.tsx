// LA FICHA DE UN CLIENTE EN UNA PRODUCTORA: sus datos y sus proyectos. Un cliente de MIA es una marca que encarga
// trabajos: «última visita», «faltó sin avisar» o «cumpleaños» (FichaUnica) no le dicen nada, y sus cobros están en
// los proyectos, así que ahí su «Gastó en el último año» daba $0. Es una empresa: pide CUIT y razón social, no cumpleaños.

import { enmascararContacto } from "@/lib/clientes/telefono";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { getClient } from "@/lib/actions";
import { permisoEfectivo } from "@/lib/capabilities";
import { proyectosDelCliente, veLaPlata } from "@/lib/proyectos/datos.server";
import { etapaLabel, pesos, redondear, SERVICIO_LABEL, type Servicio } from "@/lib/proyectos/core";
import type { SessionUser } from "@/lib/session";
import { claseBotonWhatsApp } from "../boton-whatsapp";
import { contactoDeLaFicha } from "../contacto-ficha";
import { tarjeta } from "../../proyectos/_vista";
import EditarClienteForm from "./EditarClienteForm";
import FichaFiscalForm from "./FichaFiscalForm";

export default async function FichaProductora({ id, user }: { id: string; user: SessionUser }) {
  const [crudo, proyectos] = await Promise.all([getClient(id), proyectosDelCliente(id)]);
  if (!crudo) notFound();
  // Sin `clients:contact` (casilla 5 de la matriz) teléfono y mail salen enmascarados del servidor.
  const client = enmascararContacto(crudo, user);
  const puedeEditar = permisoEfectivo(user, "clients:manage");
  const conPlata = veLaPlata(user);
  const contacto = contactoDeLaFicha({ telefono: client.phone, noQuiere: false, puedeEditar });
  const vendido = redondear(proyectos.reduce((s, p) => s + (p.t?.total ?? 0), 0));
  const cobrado = redondear(proyectos.reduce((s, p) => s + p.cobrado, 0));
  const porCobrar = redondear(proyectos.reduce((s, p) => s + (p.t ? Math.max(0, p.saldo) : 0), 0));

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <Link href="/admin/clientes" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-strong hover:underline">
        ← Clientes
      </Link>
      <h1 className="mt-1 text-2xl font-semibold text-strong [overflow-wrap:anywhere]">{client.name}</h1>
      <div className="mb-6 mt-1 flex flex-wrap items-center gap-2 text-muted">
        <span className="min-w-0 [overflow-wrap:anywhere]">
          {client.phone} {client.email ? `· ${client.email}` : ""}
        </span>
        {contacto.tipo === "whatsapp" && (
          <a href={contacto.href} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp a ${client.name}`} className={claseBotonWhatsApp("solid")}>
            WhatsApp
          </a>
        )}
        {contacto.tipo === "sin-celular" && <p className="w-full text-sm text-warning">{contacto.texto}</p>}
      </div>
      {(client.razonSocial || client.docNro) && (
        <p className="-mt-4 mb-6 text-sm text-muted [overflow-wrap:anywhere]" data-qa="ficha-fiscal-resumen">
          {[client.razonSocial, client.docNro ? `${client.docTipo === 80 ? "CUIT" : "Doc."} ${client.docNro}` : null].filter(Boolean).join(" · ")}
        </p>
      )}

      {conPlata && (
        <dl className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={tarjeta}><dt className="text-sm text-muted">Vendido (aprobado, con IVA)</dt><dd className="text-xl font-bold text-strong">{pesos(vendido)}</dd></div>
          <div className={tarjeta}><dt className="text-sm text-muted">Cobrado</dt><dd className="text-xl font-bold text-strong">{pesos(cobrado)}</dd></div>
          <div className={tarjeta}><dt className="text-sm text-muted">Por cobrar</dt><dd className="text-xl font-bold text-strong">{pesos(porCobrar)}</dd></div>
        </dl>
      )}

      <section className="mb-6" aria-label="Proyectos del cliente">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium text-strong">Proyectos</h2>
          <ButtonLink href="/admin/proyectos/nuevo">Nuevo proyecto</ButtonLink>
        </div>
        {proyectos.length === 0 ? (
          <p className="text-sm text-muted">Todavía no tiene proyectos.</p>
        ) : (
          <ul className="space-y-2">
            {proyectos.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/proyectos/${p.id}`} className={`${tarjeta} flex flex-wrap items-center justify-between gap-2 hover:border-accent`}>
                  <span className="min-w-0">
                    <span className="block font-medium text-strong [overflow-wrap:anywhere]">#{p.numero} {p.nombre}</span>
                    <span className="block text-sm text-muted">
                      {SERVICIO_LABEL[p.servicio as Servicio] ?? p.servicio} · {etapaLabel(p.etapa, p.servicio)}
                    </span>
                  </span>
                  {conPlata && (
                    <span className="text-sm text-muted">
                      {p.t ? `${pesos(p.t.total)} · cobrado ${pesos(p.cobrado)}` : "Sin presupuesto aprobado"}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {puedeEditar && (
        <div className="mb-6">
          <EditarClienteForm
            cliente={{
              id: client.id,
              name: client.name,
              phone: client.phone,
              email: client.email,
              notes: client.notes,
              birthDate: client.birthDate ? client.birthDate.toISOString().slice(0, 10) : null,
            }}
            sinCumpleanos
          />
        </div>
      )}

      {/* Un cliente de productora es una empresa: CUIT y razón social, no cumpleaños (QA MIA #8). Mismos campos y
          acción que «Datos para facturar» (guardarFichaFiscal, con clients:manage y auditoría). */}
      {puedeEditar && (
        <section className="mb-6" aria-labelledby="ficha-fiscal">
          <h2 id="ficha-fiscal" className="mb-2 text-lg font-medium text-strong">Datos para facturar</h2>
          <FichaFiscalForm
            clienteId={client.id}
            ficha={{ docTipo: client.docTipo, docNro: client.docNro, razonSocial: client.razonSocial, condicionIva: client.condicionIva, domicilio: client.domicilio }}
          />
        </section>
      )}

      {client.notes && (
        <div className="mb-6 rounded-lg border border-line bg-surface-raised p-4">
          <p className="mb-1 text-sm font-medium text-strong">Notas internas</p>
          <p className="whitespace-pre-line text-sm text-muted">{client.notes}</p>
        </div>
      )}
    </main>
  );
}
