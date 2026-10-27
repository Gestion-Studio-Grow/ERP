// EL MOSTRADOR DE VENTA — un componente, dos entradas: Vender (/admin/vender) y la venta de
// mostrador de Pedidos en un comercio (/admin/pedidos). Carga lo que necesita el formulario
// (catálogo, stock, más vendidos, quién puede facturar o dejar a cuenta, balanza, lector) y arma
// VenderForm. Antes Pedidos tenía su propio formulario (PosForm) sin vuelto, sin factura ni
// etiqueta de balanza: dos mostradores que hacían lo mismo con capacidades distintas.
import "server-only";
import { ButtonLink } from "@/components/ui";
import { cuentasCorrientesDe } from "@/lib/settlement/cuentas-corrientes.server";
import { todayInBusinessTz } from "@/lib/datetime";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { esteticaBackoffice } from "@/lib/estetica-backoffice";
import { getPosStockSnapshot } from "@/lib/stock/pos-stock";
import { posEmptyState } from "@/lib/stock/pos-stock-rules";
import { terminalDelEquipo } from "@/lib/terminal/terminal.server";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { roleHasCapability, type Role } from "@/lib/capabilities";
import { UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, vigenteEn } from "@/lib/fiscal/vigencias";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import { motivoSinFactura, textoDelReceptor } from "./factura-del-mostrador";
import VenderForm from "./VenderForm";
import PedidoDesdeWhatsApp from "./PedidoDesdeWhatsApp";
import { cargarBoutique, cargarEnvios, cargarVender } from "./datos";
import { puedeAbrirApp } from "./puede-abrir";
import { balanzaDeVender } from "./balanza.server";
import { cargarTeclasDelMostrador } from "./teclas.server";
import type { ClienteElegido } from "@/lib/clientes/buscar-para-venta";
import type { RepetirPedido } from "@/lib/clientes/fiado";
import { TECLAS_BOUTIQUE, teclasDelMostrador, topeDeDescuento, topeDePrecioAMano } from "./reglas-venta";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { mostradorBoutiquePrendido } from "@/cambios/interruptores";

type Quien = Parameters<typeof terminalDelEquipo>[0] & { id: string; name: string; role: Role };

export default async function MostradorDeVenta({
  user,
  tenantId,
  pedidoInicial = false,
  conVendedor = false,
  desdeLaFicha = null,
}: {
  user: Quien;
  tenantId: string;
  pedidoInicial?: boolean;
  conVendedor?: boolean;
  /**
   * «Venderle» / «Repetir» desde la ficha (Magra 2D): el cliente y los renglones a precargar, ya
   * leídos por la página con `pedidoDeVentaDesdeLaFicha` (acotados al negocio). Sólo el boutique.
   */
  desdeLaFicha?: { cliente: ClienteElegido; repetir: RepetirPedido | null } | null;
}) {
  const hoy = todayInBusinessTz();
  const [datos, stockSnap, identidad, puedeCuentas, puedeFacturar, nuevo, rubro, terminal, interruptores] = await Promise.all([
    cargarVender(tenantId, hoy),
    getPosStockSnapshot(),
    getTenantIdentity(),
    // «A cuenta» y «Facturar» se ofrecen con la MISMA regla que exige su action: la app de
    // Cuentas a cobrar / Facturación para este negocio y este rol (módulo, capability, rubro).
    puedeAbrirApp("cuentas-a-cobrar"),
    puedeAbrirApp("facturacion"),
    // Diseño nuevo: la misma lectura de interruptores del layout (cacheada), y el rubro (cacheado,
    // largado en la tanda del layout) para las palabras del buscador («corte» en una carnicería).
    disenoNuevo(),
    getCurrentTenantRubro(),
    // El perfil de este equipo (ticket 58/80, imprimir solo, avisos, lector) vale sólo si el negocio
    // tiene el módulo `terminal`: lo decide el servidor con la regla de «Este equipo».
    terminalDelEquipo(user),
    // El mostrador boutique (Magra): la misma lectura cacheada de interruptores del layout.
    interruptoresDelNegocio(),
  ]);
  // MOSTRADOR BOUTIQUE: sólo con el interruptor prendido en ESTE negocio (CH lo tiene apagado: su
  // mostrador sigue igual). Suma las zonas de envío y si el día está cerrado.
  const boutique = mostradorBoutiquePrendido(interruptores);
  // Tanda 2 · 2A: las teclas fijas del dueño y la góndola de cada producto, en la misma tanda.
  const [extras, teclasFijas] = boutique
    ? await Promise.all([cargarBoutique(tenantId, hoy), cargarTeclasDelMostrador(tenantId, user.role)])
    : [null, null];
  // O-2: en el Vender de siempre de un COMERCIO (interruptor apagado), las zonas de envío también:
  // si el negocio tiene zonas, el servidor exige la zona en el pedido con envío y la pantalla tiene
  // que poder elegirla. CH (no es comercio) no lee nada nuevo.
  const enviosDeSiempre = !boutique && identidad.isRetail ? await cargarEnvios(tenantId) : null;
  // «A cuenta» por NEGOCIO (2D): el interruptor «cuentas-corrientes» de este negocio (sin fila de
  // la consola, la variable de siempre). La misma lectura que exige `createOrder` con `aCuenta`.
  // Sólo se lee si quien vende puede abrir la app (sin ella no se ofrece igual).
  const cuentasCorrientes = puedeCuentas ? await cuentasCorrientesDe(tenantId) : false;
  const balanza = identidad.isRetail ? await balanzaDeVender(tenantId, datos.products, user.role) : null;
  // Sin el módulo ni la balanza configurada, los códigos no viajan al navegador: la lista es la de
  // siempre. Con la balanza, el campo de la etiqueta necesita el PLU de cada producto.
  const productos = terminal || balanza
    ? datos.products
    : datos.products.map(({ codigo: _codigo, ...p }) => {
        void _codigo;
        return p;
      });
  // Sin ningún producto con precio, el aviso dice por qué y qué hacer, pero el formulario
  // SIGUE: «Precio a mano» es justamente para cobrar lo que no tiene precio cargado. Antes el
  // aviso reemplazaba al formulario y la venta se perdía igual.
  const sinPrecios =
    datos.products.length === 0
      ? posEmptyState({ activeProducts: stockSnap.activeProducts, canManageCatalog: stockSnap.canManageCatalog })
      : null;
  // La factura, en palabras: a quién sale (el umbral, de la tabla de vigencias) o por qué no se ofrece.
  // En CH la que compra es «la clienta», como en el resto de su panel.
  const quienCompra = esteticaBackoffice(rubro.slug) === "beauty-spa" ? "clienta" : "cliente";
  // En el boutique el bloque Cliente tiene «CUIT/DNI» (ClienteDeLaVenta): el texto dice que se carga ahí.
  const rolFactura = roleHasCapability(user.role, "billing:manage");
  const factura = {
    receptor: textoDelReceptor(vigenteEn(UMBRAL_IDENTIFICACION_CONSUMIDOR_FINAL, fechaFiscalDelDia())?.valor ?? null, quienCompra, {
      conDocumento: boutique,
    }),
    sinFactura: motivoSinFactura({ puedeFacturar, rolFactura, conDocumento: boutique }),
  };
  // Boutique: teclas del catálogo aunque no haya ventas (las vendidas primero), hasta 24.
  // MAGRA T2 · 2B: «Nuevo pedido de WhatsApp» (pegar el chat → propuesta → confirmar renglón por
  // renglón → `createOrder`). Sólo con el mostrador boutique y para quien puede tomar pedidos (la
  // misma capability que exige `createOrder`). Apagado, Vender queda igual que siempre.
  const pedidoDeWhatsApp = boutique && identidad.isRetail && roleHasCapability(user.role, "orders:manage");
  const teclas = teclasDelMostrador(
    datos.rapidos,
    datos.products.map((p) => p.id),
    boutique ? TECLAS_BOUTIQUE : undefined,
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
        <PedidoDesdeWhatsApp
          productos={datos.products.map(({ id, name, saleUnit, price, pricePerKg }) => ({ id, name, saleUnit, price, pricePerKg }))}
          stockById={stockSnap.stockById}
          hoy={hoy}
          negocio={datos.negocio}
          envios={extras?.envios ?? null}
          boutique={boutique}
        />
      )}
      <VenderForm
        products={productos}
        stockById={stockSnap.stockById}
        // Diseño nuevo: el primer día (sin ventas) las teclas se completan con el catálogo.
        // Apagado, igual que hoy: sólo los más vendidos.
        rapidos={nuevo || boutique ? teclas.ids : datos.rapidos}
        rotuloRapidos={nuevo || boutique ? teclas.rotulo : undefined}
        negocio={datos.negocio}
        topeDescuentoPct={topeDeDescuento(user.role)}
        pedidoInicial={pedidoInicial}
        // Detrás de las cuentas corrientes DEL NEGOCIO: sin el asiento del cobro del fiado en el
        // libro, una deuda nacida en el mostrador no se podría cobrar bien.
        aCuentaDisponible={puedeCuentas && cuentasCorrientes}
        puedeFacturar={puedeFacturar}
        factura={factura}
        topePrecioAMano={topeDePrecioAMano(user.role)}
        // Separa, en el almacén de la pestaña, el cobro sin confirmar de cada negocio.
        negocioId={tenantId}
        // La duda guardada de otra persona no se restaura en esta pestaña.
        usuarioId={user.id}
        balanza={balanza}
        terminal={terminal}
        {...(conVendedor ? { vendedor: user.name, sustantivo: rubro.rubro?.wording.itemNoun ?? "producto" } : {})}
        // CH no pesa: sin «Tomar peso» aunque algún producto quedara cargado por kilo. Otro negocio
        // que no es comercio (una heladería) sigue como estaba.
        conPeso={quienCompra !== "clienta"}
        quienCompra={quienCompra}
        envios={enviosDeSiempre}
        {...(extras
          ? {
              boutique: {
                envios: extras.envios,
                diaCerrado: extras.diaCerrado,
                rolFactura,
                puedeEditarFicha: roleHasCapability(user.role, "clients:manage"),
                teclas: teclasFijas,
                desdeLaFicha,
              },
            }
          : {})}
      />
    </div>
  );
}
