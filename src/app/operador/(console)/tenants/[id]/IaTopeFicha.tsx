// Bloque de la ficha: tope mensual de IA paga y lo consumido este mes (Etapa 2 de MIA · T4). Servidor.
// Se lee con el RLS del negocio (`consumoDelMes` → tenantTransaction). Sin la migración aplicada, lo dice
// y no ofrece guardar: la IA paga del negocio queda negada hasta entonces (fail-closed).
import { Bloque } from "@/components/ui/Renglon";
import { IA_ESPERA_ACTUALIZACION, usd } from "@/lib/proyectos/ia-tope-core";
import { consumoDelMes } from "@/lib/proyectos/ia-tope.server";
import { IaTopeForm } from "./IaTopeForm";

const enTexto = (micro: bigint): string => usd(micro).replace(/^US\$ /, "").replace(/\./g, "");

export async function IaTopeFicha({ tenantId }: { tenantId: string }) {
  const c = await consumoDelMes(tenantId);
  return (
    <Bloque titulo="IA paga del negocio" id="ia-tope" nota="Tope mensual en dólares · lo decide el dueño de GSG">
      {!c ? (
        <p role="note" className="py-3 text-sm text-muted">{IA_ESPERA_ACTUALIZACION} Mientras tanto la IA paga de este negocio no sale; la gratis sigue.</p>
      ) : (
        <>
          <p className="py-2 text-sm">
            Este mes ({c.mes}): <strong>{usd(c.gastado)}</strong> de {usd(c.tope)}
            {c.reservado > BigInt(0) ? ` · ${usd(c.reservado)} en curso` : ""} · {c.llamadas} {c.llamadas === 1 ? "llamada paga" : "llamadas pagas"} y {c.llamadasGratis} gratis.
          </p>
          <IaTopeForm tenantId={tenantId} actual={enTexto(c.tope)} />
        </>
      )}
    </Bloque>
  );
}
