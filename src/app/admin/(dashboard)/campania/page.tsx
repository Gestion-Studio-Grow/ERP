import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { fmtDateTime } from "@/lib/datetime";
import { EmptyState } from "@/components/ui";
import { leerAnotados } from "./anotados";

export const dynamic = "force-dynamic";

/**
 * Anotados de la campaña presencial (QR del evento).
 *
 * Pantalla de mostrador: se mira en el celular mientras entra gente. Por eso
 * lo primero y más grande es CUÁNTOS van, y la lista está en orden inverso —
 * el último que se anotó arriba, que es el que está parado enfrente.
 */
export default async function CampaniaPage() {
  // La guardia de la app, como la descarga (export/route.ts): una app oculta no es una app
  // protegida. Antes la página pedía sólo el permiso (clients:read) y se abría tecleando la URL
  // aunque el negocio no tuviera la campaña. El permiso lo aplica requireApp desde el registro.
  await requireApp("campanias");

  // Donde la tabla todavía no existe, la pantalla lo dice en vez de caer en la pantalla de
  // error genérica. Cualquier otra falla sigue (anotados.ts).
  const anotados = await leerAnotados(() =>
    prisma.leadCampania.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  );
  if (anotados.estado === "sin-tabla") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="font-serif text-3xl mb-6" style={{ color: "var(--text-strong)" }}>
          Anotados del obsequio
        </h1>
        <EmptyState
          title="La campaña todavía no está habilitada en este negocio"
          description="Cuando GSG la habilite, acá se ven quiénes se anotaron desde el QR, con su permiso para recibir novedades."
        />
      </main>
    );
  }
  const leads = anotados.leads;

  const conDifusion = leads.filter((l) => l.aceptaDifusion).length;
  const conInstagram = leads.filter((l) => l.instagram).length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10 flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-3xl" style={{ color: "var(--text-strong)" }}>
            Anotados del obsequio
          </h1>
          <p style={{ color: "var(--text-muted)" }}>
            Quienes completaron el formulario del QR en el evento de apertura. La
            inscripción ya está cerrada; esta lista queda acá.
          </p>
        </div>
        {/* Los datos son de ella: que pueda bajarlos sin depender de nadie. */}
        <a
          href="/admin/campania/export"
          download
          className="shrink-0 max-sm:inline-flex max-sm:min-h-11 max-sm:items-center rounded-lg border border-line-strong px-3 py-2 text-sm font-medium text-strong hover:bg-surface-sunken"
        >
          Descargar CSV
        </a>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Dato valor={leads.length} etiqueta="anotados" destacado />
        <Dato valor={conDifusion} etiqueta="aceptan difusión" />
        <Dato valor={conInstagram} etiqueta="dejaron Instagram" />
      </div>

      {leads.length === 0 ? (
        <p
          className="rounded-md px-5 py-8 text-center"
          style={{ background: "var(--color-surface-sunken)", color: "var(--text-muted)" }}
        >
          Todavía no se anotó nadie. En cuanto alguien complete el formulario, aparece acá.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md" style={{ border: "1px solid var(--color-line)" }}>
          <table className="w-full text-sm" style={{ minWidth: 620 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-line)" }}>
                <Th>Nombre</Th>
                <Th>Teléfono</Th>
                <Th>Instagram</Th>
                <Th>Difusión</Th>
                <Th>Se anotó</Th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} style={{ borderBottom: "1px solid var(--color-line)" }}>
                  <Td strong>
                    {l.nombre} {l.apellido}
                  </Td>
                  {/* Toca para llamar: en el mostrador se usa desde el celular. */}
                  <Td>
                    <a href={`tel:${l.telefono}`} style={{ color: "var(--accent)" }}>
                      {l.telefono}
                    </a>
                  </Td>
                  <Td>
                    {l.instagram ? (
                      <a
                        href={`https://instagram.com/${l.instagram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--accent)" }}
                      >
                        @{l.instagram}
                      </a>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </Td>
                  <Td>{l.aceptaDifusion ? "Sí" : "No"}</Td>
                  <Td muted>{fmtDateTime(l.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Sólo se puede contactar con novedades a quienes tienen “Difusión: Sí”. Es el
        consentimiento que dieron al anotarse, y quedó registrado con su fecha.
      </p>
    </main>
  );
}

function Dato({
  valor,
  etiqueta,
  destacado,
}: {
  valor: number;
  etiqueta: string;
  destacado?: boolean;
}) {
  return (
    <div
      className="rounded-md px-4 py-5 text-center"
      style={{
        background: destacado ? "var(--accent)" : "var(--color-surface-sunken)",
        color: destacado ? "var(--text-on-accent)" : "var(--text-strong)",
        border: destacado ? "none" : "1px solid var(--color-line)",
      }}
    >
      <div className="text-4xl font-semibold tabular-nums leading-none">{valor}</div>
      <div className="mt-1.5 text-xs uppercase tracking-wider" style={{ opacity: 0.85 }}>
        {etiqueta}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  strong,
  muted,
}: {
  children: React.ReactNode;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={`px-4 py-3 ${strong ? "font-medium" : ""}`}
      style={{ color: muted ? "var(--text-muted)" : "var(--text-strong)" }}
    >
      {children}
    </td>
  );
}
