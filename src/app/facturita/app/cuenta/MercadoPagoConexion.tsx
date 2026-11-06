// FACTOQUE · Mi cuenta → Mercado Pago: conectar (OAuth), ver el estado y desconectar.
// Server component: lee el estado (sin abrir secretos) y, si el token vence pronto, lo renueva.
// Lo que se ve está en MercadoPagoTarjeta (pura, probada a 390 px en mp-cuenta-pantalla.test.ts).

import { conexionMPDisponible, estadoMPDelNegocio, renovarMPSiHaceFalta } from "@/lib/facturita-mp.server";
import { avisoDe } from "@/lib/facturita-mp-flujo";
import DesconectarMP from "./DesconectarMP";
import MercadoPagoTarjeta from "./MercadoPagoTarjeta";

export default async function MercadoPagoConexion({ tenantId, aviso }: { tenantId: string; aviso?: string }) {
  const disponible = conexionMPDisponible() !== null;
  if (disponible) await renovarMPSiHaceFalta(tenantId);
  const estado = await estadoMPDelNegocio(tenantId);
  return <MercadoPagoTarjeta estado={estado} disponible={disponible} aviso={avisoDe(aviso)} desconectar={<DesconectarMP />} />;
}
