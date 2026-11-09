import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/session";
import { isColumnMissing } from "@/lib/prisma-errors";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { vouchersPrendidos } from "@/cambios/interruptores";
import { AvisoError, Seccion } from "@/components/ui";
import { motivoParaNoEditarValor, VALOR_SIN_MIGRAR, valorDeLaFila } from "@/lib/vouchers/valor-voucher";
import { FormValorVoucher } from "./FormValorVoucher";

/**
 * El valor del voucher en la configuración del negocio (orden del dueño, 09/11/2026). Sólo para la dueña y
 * sólo si el negocio tiene los vouchers prendidos; con la columna sin migrar, un aviso en vez del form.
 */
export async function ValorDelVoucher() {
  const user = await getCurrentUser();
  if (!user || motivoParaNoEditarValor(user)) return null;
  if (!vouchersPrendidos(await interruptoresDelNegocio())) return null;
  const tenantId = await getCurrentTenantId();
  let valor: number | null;
  try {
    const fila = await prisma.businessSettings.findUnique({ where: { tenantId }, select: { voucherValor: true } });
    valor = valorDeLaFila(fila?.voucherValor?.toString());
  } catch (e) {
    if (!isColumnMissing(e, "voucherValor")) throw e;
    return (
      <Seccion id="valor-voucher" titulo="Vouchers de La Alameda">
        <AvisoError className="mt-3" tono="aviso" titulo="Falta un paso de base de datos" comoSeguir={VALOR_SIN_MIGRAR} />
      </Seccion>
    );
  }
  return (
    <Seccion id="valor-voucher" titulo="Vouchers de La Alameda">
      <FormValorVoucher valor={valor} />
    </Seccion>
  );
}
