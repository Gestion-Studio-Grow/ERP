import Link from "next/link";
import type { getFichaProveedor } from "@/lib/suppliers/supplier-repo";
import { fmtShortDate } from "@/lib/datetime";
import { formatearCantidad } from "@/lib/pos-peso";
import {
  Bloque,
  DosColumnas,
  Marca,
  PageContainer,
  PageHeader,
  Plata,
  Renglon,
  atributosBoton,
  buttonClasses,
  fmtCuit,
} from "@/components/ui";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { EstadoProveedorForm, ProveedorForm } from "../ProveedorForm";

const KIND: Record<string, string> = {
  COMPRA: "Compra",
  REPOSICION: "Reposición",
};

type Ficha = NonNullable<Awaited<ReturnType<typeof getFichaProveedor>>>;

// LA FICHA DEL PROVEEDOR con el diseño nuevo («Renglón»). El momento: el proveedor está en la
// puerta con la mercadería o del otro lado del teléfono, y el encargado necesita tres cosas en
// este orden: cuánto le debe (arriba, en el encabezado), recibirle lo que trae (la tecla) y lo
// último que le compró. Las deudas abiertas son renglones con su tecla a la cuenta, en vez de un
// número suelto en una tarjeta. La misma lectura (getFichaProveedor) y los mismos formularios.
export function FichaProveedorRenglon({
  ficha,
  alta,
  ve,
}: {
  ficha: Ficha;
  alta: boolean;
  ve: { recibir: boolean; pagar: boolean };
}) {
  const {
    proveedor: p,
    compras,
    totalDeCompras,
    comprado,
    deuda,
    devoluciones,
    totalDeDevoluciones,
    devuelto,
    codigoDeCompra,
  } = ficha;
  const recibir = `/admin/compras?proveedor=${encodeURIComponent(p.id)}`;
  const wa = p.active ? waLinkClienta(p.phone) : null;
  const debe = deuda.ok && deuda.saldo > 0;

  return (
    <PageContainer>
      <Link
        href="/admin/proveedores"
        className="inline-flex min-h-11 items-center text-sm text-muted hover:text-strong hover:underline"
      >
        ← Proveedores
      </Link>
      <PageHeader
        title={<span className="[overflow-wrap:anywhere]">{p.name}</span>}
        estado={[
          debe ? (
            <strong key="d" className="text-danger">
              Le debés <Plata valor={deuda.saldo} sinCentavos tono="peligro" />
            </strong>
          ) : deuda.ok ? (
            <span key="d">No le debés nada</span>
          ) : null,
          p.taxId ? (
            <span key="c">CUIT {fmtCuit(p.taxId)}</span>
          ) : (
            <Marca key="c" tipo="atencion">
              sin CUIT
            </Marca>
          ),
          p.phone ? (
            <span key="t" className="[overflow-wrap:anywhere]">
              {p.phone}
            </span>
          ) : null,
          !p.active ? (
            <Marca key="b" tipo="anulado">
              dado de baja
            </Marca>
          ) : null,
        ]}
        actions={
          <>
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses("outline", "md")}
              >
                Escribirle
              </a>
            )}
            {p.active && ve.recibir && (
              <Link href={recibir} className={buttonClasses("solid", "md")}>
                Recibir mercadería
              </Link>
            )}
          </>
        }
      />
      {alta && (
        <p role="status" className="-mt-2 mb-6 text-sm text-strong">
          Proveedor dado de alta.
          {ve.recibir ? " Ya lo podés elegir al recibir mercadería." : ""}
        </p>
      )}

      <DosColumnas>
        {/* En el celular va primero la plata (lo que se viene a mirar); en la PC, a la derecha. */}
        <div className="space-y-8 lg:order-2">
          <Bloque titulo="La plata" id="proveedor-plata">
            <ul data-sin-folio="">
              {!deuda.ok ? (
                <Renglon as="li" titulo="Le debés" detalle={deuda.motivo} />
              ) : deuda.abiertas.length === 0 ? (
                <Renglon
                  as="li"
                  titulo="Le debés"
                  detalle="ninguna cuenta abierta"
                  plata={<span className="text-muted">Nada</span>}
                />
              ) : (
                deuda.abiertas.map((a) => (
                  <Renglon
                    key={a.id}
                    as="li"
                    titulo={a.concept || "Cuenta a pagar"}
                    detalle={`${a.dueDate ? `vence el ${fmtShortDate(a.dueDate)}` : "sin vencimiento"}${a.chequesCommitted > 0 ? " · con cheques sin acreditar" : ""}`}
                    plata={
                      <Plata
                        valor={a.balance}
                        tono={a.balance > 0 ? "peligro" : undefined}
                      />
                    }
                    tecla={
                      ve.pagar && (
                        <Link
                          href={`/admin/cuentas-a-pagar/${encodeURIComponent(a.id)}`}
                          className={buttonClasses("outline", "sm")}
                          {...atributosBoton("outline", "sm")}
                          aria-label={`Pagar: ${a.concept || "cuenta a pagar"}`}
                        >
                          Pagar
                        </Link>
                      )
                    }
                  />
                ))
              )}
              <Renglon
                as="li"
                titulo="Le compraste"
                detalle={
                  totalDeCompras === 1
                    ? "1 compra en total"
                    : `${totalDeCompras} compras en total`
                }
                plata={<Plata valor={comprado} sinCentavos />}
              />
              {devuelto > 0 && (
                <Renglon
                  as="li"
                  titulo="Le devolviste"
                  detalle="a costo de la compra, en total"
                  plata={<Plata valor={devuelto} sinCentavos />}
                />
              )}
            </ul>
          </Bloque>

          {/* Los datos ya están en el encabezado: el formulario va plegado, para que en el celular
              las compras no queden debajo de cinco campos. */}
          <Bloque titulo="Sus datos" id="proveedor-datos">
            <details>
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-body underline underline-offset-2">
                Cambiar nombre, CUIT, teléfono o notas
              </summary>
              <div className="pt-2">
                <ProveedorForm modo="edicion" datos={p} />
              </div>
            </details>
            <div className="mt-6 border-t border-line pt-4">
              <p className="mb-2 text-sm text-muted">
                {p.active
                  ? "Si ya no le comprás, dalo de baja: deja de aparecer para elegir y su historial queda acá."
                  : "Está dado de baja: no aparece para elegir al recibir mercadería."}
              </p>
              <EstadoProveedorForm id={p.id} activo={p.active} />
            </div>
          </Bloque>
        </div>

        <div className="space-y-8 lg:order-1">
          <Bloque
            titulo="Compras"
            cuenta={totalDeCompras > 0 ? totalDeCompras : undefined}
            nota={
              totalDeCompras > compras.length
                ? `las últimas ${compras.length}`
                : undefined
            }
            id="proveedor-compras"
          >
            {compras.length === 0 ? (
              <p
                data-ui="vacio"
                className="border-b border-line py-4 text-sm text-body"
              >
                Todavía no le compraste nada. Cuando te traiga mercadería y la
                recibas, la compra queda acá.
              </p>
            ) : (
              <ul>
                {compras.map((c) => (
                  <Renglon
                    key={c.id}
                    as="li"
                    folio={`#${c.code}`}
                    titulo={KIND[c.kind] ?? c.kind}
                    detalle={`${fmtShortDate(c.createdAt)} · ${c._count.items === 1 ? "1 producto" : `${c._count.items} productos`}`}
                    plata={
                      c.totalCost > 0 ? (
                        <Plata valor={c.totalCost} sinCentavos />
                      ) : (
                        <span className="text-muted">sin costo</span>
                      )
                    }
                  />
                ))}
              </ul>
            )}
          </Bloque>

          <Bloque
            titulo="Devoluciones"
            cuenta={totalDeDevoluciones > 0 ? totalDeDevoluciones : undefined}
            nota={
              totalDeDevoluciones > devoluciones.length
                ? `las últimas ${devoluciones.length}`
                : undefined
            }
            id="proveedor-devoluciones"
          >
            {devoluciones.length === 0 ? (
              <p
                data-ui="vacio"
                className="border-b border-line py-4 text-sm text-body"
              >
                No se le devolvió nada.
              </p>
            ) : (
              <ul data-sin-folio="">
                {devoluciones.map((m) => (
                  <Renglon
                    key={m.id}
                    as="li"
                    titulo={m.product?.name ?? "Producto borrado"}
                    detalle={[
                      fmtShortDate(m.createdAt),
                      `${formatearCantidad(Math.abs(m.qty))} ${m.product?.unit ?? ""}`.trim(),
                      m.purchaseId && codigoDeCompra.has(m.purchaseId)
                        ? `de la compra #${codigoDeCompra.get(m.purchaseId)}`
                        : null,
                      m.reason || null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    plata={
                      m.unitCost ? (
                        <Plata
                          valor={Math.abs(m.qty) * m.unitCost}
                          sinCentavos
                        />
                      ) : undefined
                    }
                  />
                ))}
              </ul>
            )}
          </Bloque>
        </div>
      </DosColumnas>
    </PageContainer>
  );
}
