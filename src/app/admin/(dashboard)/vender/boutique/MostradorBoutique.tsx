// EL MOSTRADOR BOUTIQUE, ARMADO CON LO YA LEÍDO (Magra · tanda perf, P-1 y P-2).
//
// La rama boutique de `MostradorDeVenta`, sin leer nada: recibe `cargarMostradorBoutique()` (una
// tanda) y arma `VenderForm` con las MISMAS reglas (precios, factura, balanza, teclas). El pedido de
// WhatsApp va diferido (`WhatsAppDiferido`): su código baja cuando se abre, no con la pantalla.
// Sin «use client» ni lecturas: es un componente de servidor síncrono.
import "server-only";
import { ButtonLink } from "@/components/ui";
import { esteticaBackoffice } from "@/lib/estetica-backoffice";
import { posEmptyState } from "@/lib/stock/pos-stock-rules";
import { roleHasCapability, type Role } from "@/lib/capabilities";
import { UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, vigenteEn } from "@/lib/fiscal/vigencias";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import type { TenantIdentity } from "@/lib/identidad-rubro";
import { motivoSinFactura, textoDelReceptor } from "../factura-del-mostrador";
import VenderForm from "../VenderForm";
import { TECLAS_BOUTIQUE, teclasDelMostrador, topeDeDescuento, topeDePrecioAMano, type BalanzaDeVender } from "../reglas-venta";
import type { MostradorBoutique as Datos } from "./cargar";
import WhatsAppDiferido from "./WhatsAppDiferido";

/** La balanza de Vender con el formato ya leído (la regla de `balanzaDeVender`). */
export function balanzaDelMostrador(d: Pick<Datos, "products" | "formatoBalanza" | "puedeBalanza">, role: Role): BalanzaDeVender | null {
  if (!d.products.some((p) => p.saleUnit === "WEIGHT" || p.codigo)) return null;
  // Sin el formato real del negocio, el campo no se muestra (un formato supuesto carga mal el peso).
  if (!d.formatoBalanza || d.formatoBalanza.porDefecto) return null;
  const configurar = d.puedeBalanza && roleHasCapability(role, "catalog:manage") ? "/admin/balanza" : null;
  return { formato: d.formatoBalanza.formato, porDefecto: d.formatoBalanza.porDefecto, configurar };
}

export default function MostradorBoutique({
  datos: d,
  user,
  tenantId,
  identidad,
  pedidoInicial = false,
  conVendedor = false,
}: {
  datos: Datos;
  user: { id: string; name: string; role: Role };
  tenantId: string;
  identidad: TenantIdentity;
  pedidoInicial?: boolean;
  conVendedor?: boolean;
}) {
  const balanza = identidad.isRetail ? balanzaDelMostrador(d, user.role) : null;
  // Sin el módulo ni la balanza configurada, los códigos no viajan al navegador.
  const productos = d.terminal || balanza
    ? d.products
    : d.products.map(({ codigo: _codigo, ...p }) => {
        void _codigo;
        return p;
      });
  const sinPrecios =
    d.products.length === 0 ? posEmptyState({ activeProducts: d.activos, canManageCatalog: d.canManageCatalog }) : null;
  const quienCompra = esteticaBackoffice(identidad.slug) === "beauty-spa" ? "clienta" : "cliente";
  const rolFactura = roleHasCapability(user.role, "billing:manage");
  const factura = {
    receptor: textoDelReceptor(vigenteEn(UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, fechaFiscalDelDia())?.valor ?? null, quienCompra, {
      conDocumento: true,
    }),
    sinFactura: motivoSinFactura({ puedeFacturar: d.puedeFacturar, rolFactura, conDocumento: true }),
  };
  const pedidoDeWhatsApp = identidad.isRetail && roleHasCapability(user.role, "orders:manage");
  const teclas = teclasDelMostrador(
    d.rapidos,
    d.products.map((p) => p.id),
    TECLAS_BOUTIQUE,
  );

  return (
    <div className="space-y-4">
      {sinPrecios && (
        <div role="status" className="rounded-lg border border-warning/40 bg-warning-soft/40 p-3 text-sm">
          <p className="font-medium text-strong">{sinPrecios.title}</p>
          <p className="mt-1 text-body">
            {sinPrecios.description} Mientras tanto, lo que haya que cobrar se carga con «Precio a
            mano», con su motivo.
          </p>
          {sinPrecios.linkToCatalog && (
            <ButtonLink href="/admin/catalogo#productos" variant="outline" className="mt-2">
              Ir al catálogo a cargar precios
            </ButtonLink>
          )}
        </div>
      )}
      {pedidoDeWhatsApp && (
        <WhatsAppDiferido
          productos={d.products.map(({ id, name, saleUnit, price, pricePerKg }) => ({ id, name, saleUnit, price, pricePerKg }))}
          stockById={d.stockById}
          hoy={d.hoy}
          negocio={d.negocio}
          envios={d.envios}
          boutique
        />
      )}
      <VenderForm
        products={productos}
        stockById={d.stockById}
        rapidos={teclas.ids}
        rotuloRapidos={teclas.rotulo}
        negocio={d.negocio}
        topeDescuentoPct={topeDeDescuento(user.role)}
        pedidoInicial={pedidoInicial}
        aCuentaDisponible={d.puedeCuentas && d.cuentasCorrientes}
        puedeFacturar={d.puedeFacturar}
        factura={factura}
        topePrecioAMano={topeDePrecioAMano(user.role)}
        negocioId={tenantId}
        usuarioId={user.id}
        balanza={balanza}
        terminal={d.terminal}
        {...(conVendedor ? { vendedor: user.name, sustantivo: identidad.rubro?.wording.itemNoun ?? "producto" } : {})}
        conPeso={quienCompra !== "clienta"}
        quienCompra={quienCompra}
        envios={null}
        boutique={{
          envios: d.envios,
          diaCerrado: d.diaCerrado,
          rolFactura,
          puedeEditarFicha: roleHasCapability(user.role, "clients:manage"),
          teclas: d.teclas,
          desdeLaFicha: d.desdeLaFicha,
        }}
      />
    </div>
  );
}
