// Abonos del estudio: «a este cliente facturale todos los meses $X a Fulano».
// Server component: el estudio sale de la sesión (exigirEstudio) y las reglas de SU auditoría.
// La lógica de la regla vive en abonos-core.ts; el guardado y la emisión, en cartera-abonos.ts.

import { exigirEstudio, filasDeCarteraDb } from "@/lib/cartera-gate";
import { leerReglasDelEstudio } from "@/lib/cartera-abonos";
import { mesDelNegocio } from "@/lib/libros/fecha-fiscal";
import { formatearCuit } from "@/lib/fiscal/cuit";
import { Bloque, ButtonLink, Franja, PageContainer, PageHeader, Plata, Renglon } from "@/components/ui";
import { CONDICIONES_RECEPTOR, textoVigencia } from "./abonos-core";
import FormAbono from "./FormAbono";
import BajaRegla from "./BajaRegla";

export const dynamic = "force-dynamic";

export default async function AbonosPage() {
  const gate = await exigirEstudio();
  if (!gate.ok) {
    return (
      <PageContainer>
        <PageHeader title="Abonos" />
        <Franja tono="peligro">{gate.error}</Franja>
      </PageContainer>
    );
  }
  const [reglas, cartera] = await Promise.all([leerReglasDelEstudio(gate.estudioTenantId), filasDeCarteraDb(gate.estudioTenantId)]);
  const alias = new Map(cartera.map((f) => [f.clienteTenantId, f.alias]));
  const clientes = cartera.map((f) => ({ id: f.clienteTenantId, alias: f.alias, pausado: f.estado === "pausada" }));
  const condicion = new Map(CONDICIONES_RECEPTOR.map((c) => [c.valor, c.etiqueta]));

  return (
    <PageContainer>
      <PageHeader
        title="Abonos"
        description="Lo que tus clientes facturan todos los meses, siempre igual: honorarios, alquileres, cuotas. Lo cargás una vez y sale en el lote del mes."
      />
      <nav aria-label="Panel del contador" className="mb-6 flex flex-wrap gap-2">
        <ButtonLink href="/contador" variant="ghost" className="min-h-11">Volver a la cartera</ButtonLink>
        <ButtonLink href="/contador/lote" variant="outline" className="min-h-11">Ir al lote del mes</ButtonLink>
      </nav>

      <Bloque id="abonos-cargados" titulo="Abonos cargados" cuenta={reglas.length} className="mb-8">
        {reglas.length === 0 ? (
          <p className="py-4 text-sm text-muted">Todavía no cargaste ninguno. Empezá con el formulario de abajo.</p>
        ) : (
          <ul>
            {reglas.map((r) => (
              <Renglon
                key={r.id}
                as="li"
                folio={alias.get(r.clienteTenantId) ?? "Fuera de tu cartera"}
                titulo={<span className="break-words">{r.descripcion} · a {r.receptorNombre}</span>}
                detalle={
                  <span className="break-words">
                    {r.receptorDocNro ? `${r.receptorDocTipo} ${r.receptorDocTipo === "CUIT" ? formatearCuit(r.receptorDocNro) : r.receptorDocNro}` : "Consumidor final sin identificar"}
                    {" · "}
                    {condicion.get(r.receptorCondicionIva)} · {r.concepto === "servicios" ? `Servicio, vence a los ${r.diasVencimiento} días` : "Productos"} · {textoVigencia(r)}
                  </span>
                }
                plata={<Plata valor={r.importe} />}
                tecla={<BajaRegla reglaId={r.id} descripcion={r.descripcion} />}
              />
            ))}
          </ul>
        )}
      </Bloque>

      <Bloque id="abono-nuevo" titulo="Cargar un abono">
        {clientes.length === 0 ? (
          <p className="py-4 text-sm text-muted">Primero sumá clientes a tu cartera.</p>
        ) : (
          <FormAbono clientes={clientes} mesActual={mesDelNegocio()} />
        )}
      </Bloque>

      <footer className="mt-2xl border-t border-line pt-4 text-center text-xs text-faint">Con tecnología de Gestión Studio Grow</footer>
    </PageContainer>
  );
}
