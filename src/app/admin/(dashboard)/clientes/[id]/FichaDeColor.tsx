// Ficha técnica de color (paquete Peluquerías, T4): qué tono, fórmula, oxidante y tiempo se usó
// cada vez. Sólo en rubros peluqueria/barberia; en el resto (CH incluido) no pinta nada.
// Sin la migración aplicada muestra «migración pendiente» y el resto de la ficha sigue igual.
import { fmtDateTime } from "@/lib/datetime";
import { canCurrentUser } from "@/lib/authz";
import { fichasDeColorDeLaClienta } from "@/lib/clientes/ficha-color.server";
import AltaFichaColor from "./AltaFichaColor";

export default async function FichaDeColor({ clientId }: { clientId: string }) {
  const [r, puedeCargar] = await Promise.all([fichasDeColorDeLaClienta(clientId), canCurrentUser("clients:manage")]);
  if (r.estado === "apagado") return null;
  return (
    <section aria-labelledby="ficha-color-titulo" className="mb-8">
      <h2 id="ficha-color-titulo" className="text-lg font-medium text-strong mb-3">Ficha de color</h2>
      {r.estado === "pendiente" ? (
        <p className="text-sm text-muted">La ficha de color todavía no está habilitada en este negocio (migración pendiente).</p>
      ) : (
        <div className="space-y-2">
          {puedeCargar && <AltaFichaColor clientId={clientId} />}
          {r.fichas.map((f) => (
            <div key={f.id} className="rounded-lg border border-line bg-surface-raised px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-x-2">
                <span className="font-medium text-strong">{f.tono}</span>
                <span className="text-muted">{fmtDateTime(f.fecha)}</span>
              </div>
              <p className="whitespace-pre-line text-body">{f.formula}</p>
              <p className="text-muted">
                {[
                  f.oxidante ? `Oxidante ${f.oxidante} vol.` : null,
                  f.tiempoPose ? `Pose ${f.tiempoPose} min` : null,
                  f.profesional,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {f.notas && <p className="mt-1 whitespace-pre-line text-body">{f.notas}</p>}
            </div>
          ))}
          {r.fichas.length === 0 && <p className="text-sm text-muted">Todavía no hay fichas de color para esta clienta.</p>}
        </div>
      )}
    </section>
  );
}
