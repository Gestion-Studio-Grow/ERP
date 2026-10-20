import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { puedeAbrirApp } from "../vender/puede-abrir";
import { PageContainer, PageHeader } from "@/components/ui";
import { leerConfigCaja } from "@/lib/supermercado/config-repo";
import EtiquetaDeLaBalanza from "./EtiquetaDeLaBalanza";
import PluDeProductos from "./PluDeProductos";
import BalanzaPorCable from "./BalanzaPorCable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Balanza y lector", generator: "Gestión Studio Grow" };

// BALANZA Y LECTOR — cómo entra el peso al mostrador, sin saber marca ni modelo de la balanza:
//   · la ETIQUETA que imprime la balanza, leída con el lector (formato detectado con una
//     etiqueta real, o el habitual de la marca);
//   · el PESO EN VIVO por cable, en Chrome de computadora (Web Serial);
//   · qué PLU de la balanza es cada producto.
// Lo configura el dueño (catalog:manage, la capability de la app): cambia cómo se cobra.
export default async function BalanzaPage() {
  await requireApp("balanza");
  const tenantId = await getCurrentTenantId();
  const [config, productos, conTerminal] = await Promise.all([
    leerConfigCaja(prisma, tenantId),
    prisma.product.findMany({
      where: { tenantId, active: true, deletedAt: null, OR: [{ price: { not: null } }, { pricePerKg: { not: null } }] },
      orderBy: [{ saleUnit: "desc" }, { name: "asc" }],
      select: { id: true, name: true, saleUnit: true, codigo: true },
    }),
    puedeAbrirApp("terminal"),
  ]);
  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Balanza y lector"
        description="Cómo entra el peso al mostrador: con la etiqueta que imprime la balanza o por cable. No hace falta saber la marca."
      />
      <nav aria-label="Probar mi balanza" className="mb-6 space-y-2 rounded-md border border-line bg-surface-raised p-4 text-sm">
        <p className="font-semibold text-strong">Probar mi balanza: ¿cómo te da el peso?</p>
        <ul className="space-y-1">
          <li>
            <a href="#etiqueta" className="inline-flex min-h-11 items-center font-medium text-accent-ink underline">
              Imprime una etiqueta con código de barras
            </a>{" "}
            <span className="text-muted">→ la pasás por el lector y entra el producto con su peso.</span>
          </li>
          <li>
            <a href="#cable" className="inline-flex min-h-11 items-center font-medium text-accent-ink underline">
              Se conecta con un cable a la computadora
            </a>{" "}
            <span className="text-muted">→ «Tomar peso» trae lo que marca la balanza.</span>
          </li>
          <li className="text-muted">Ninguna de las dos: el peso se escribe a mano, como siempre.</li>
        </ul>
      </nav>

      <div className="space-y-10">
        <section id="etiqueta" aria-labelledby="etiqueta-titulo" className="space-y-4">
          <h2 id="etiqueta-titulo" className="text-lg font-semibold text-strong">
            Con etiqueta
          </h2>
          <EtiquetaDeLaBalanza formato={config.formato} version={config.version} guardado={!config.porDefecto} />
        </section>

        <section id="cable" aria-labelledby="cable-titulo" className="space-y-4">
          <h2 id="cable-titulo" className="text-lg font-semibold text-strong">
            Con cable
          </h2>
          <BalanzaPorCable tenantId={tenantId} />
        </section>

        <section id="plu" aria-labelledby="plu-titulo" className="space-y-4">
          <h2 id="plu-titulo" className="text-lg font-semibold text-strong">
            Qué producto es cada número de la balanza
          </h2>
          <PluDeProductos
            productos={productos.map((p) => ({ id: p.id, name: p.name, porKilo: p.saleUnit === "WEIGHT", codigo: p.codigo }))}
          />
        </section>

        <section id="lector" aria-labelledby="lector-titulo" className="space-y-2 text-sm">
          <h2 id="lector-titulo" className="text-lg font-semibold text-strong">
            El lector
          </h2>
          <p className="text-body">
            El lector de códigos se enchufa por USB y escribe como un teclado: no hay que instalar nada. Para probarlo, pasá
            una etiqueta en «Detectar con una etiqueta», arriba: si aparecen los números, anda.
          </p>
          {conTerminal && (
            <p className="text-body">
              Para que lea solo, sin tocar la pantalla, y para el ticket de 58 u 80 mm, configurá{" "}
              <a href="/admin/ajustes/terminal" className="font-medium text-accent-ink underline">
                Este equipo
              </a>
              .
            </p>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
