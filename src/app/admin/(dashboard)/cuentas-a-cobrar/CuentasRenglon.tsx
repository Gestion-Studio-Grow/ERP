// ============================================================================
// FIADO y CUENTAS A PAGAR — la bandeja y la cuenta (diseño nuevo «Renglón»). Servidor.
// ============================================================================
//
// BANDEJA: un bloque por prioridad (bandeja-cuentas.ts), un renglón por cuenta —cuándo, quién, de
// qué, el saldo en su columna— y UNA tecla: «Cobrar» / «Pagar», que abre la cuenta con su
// formulario. Nada de tarjetas con el total grande: el total va en la línea de estado.
//
// CUENTA: la cuenta como se lleva en un libro (total · cobrado o pagado · saldo) con el formulario
// de SIEMPRE para registrar lo que entra o sale (RegisterCollectionForm, con su tope y su medio
// obligatorio) y, a pagar, los cheques propios (ChequesDeLaDeuda). Al lado, la historia.
//
// Lo usan las dos apps (cuentas-a-cobrar y cuentas-a-pagar); cada página conserva su guardia.

import Link from "next/link";
import { Bloque, LineaDeEstado, Marca, Plata, Renglon, atributosBoton, fmtMoneyARS, type TipoMarca } from "@/components/ui";
import { fmtShortDate } from "@/lib/datetime";
import { RegisterCollectionForm } from "@/components/cuentas/RegisterCollectionForm";
import { ChequesDeLaDeuda, type AccionCheque, type ChequeVista } from "@/components/cuentas/ChequesDeLaDeuda";
import type { Aging } from "@/lib/cuentas/aging";
import type { DebtAccountDetail } from "@/lib/cuentas/types";
import type { EstadoFormularioCuenta } from "@/lib/debts/formularios";
import { LineaDeCuenta } from "@/components/ui/LineaDeCuenta";
import { diaMes } from "../caja/_renglon/fechas";
import { folioDeLaCuenta, type GrupoDeBandeja } from "./bandeja-cuentas";

type Tipo = "cobrar" | "pagar";

const VERBO: Record<Tipo, string> = { cobrar: "Cobrar", pagar: "Pagar" };

/** La bandeja: un bloque por prioridad. */
export function BandejaDeCuentas({ grupos, hoy, tipo, base }: { grupos: GrupoDeBandeja[]; hoy: string; tipo: Tipo; base: string }) {
  return (
    <div className="max-w-5xl">
      {grupos.map((g) => (
        <Bloque
          key={g.clave}
          id={`grupo-${g.clave}`}
          titulo={g.clave === "vencido" ? <Marca tipo="atencion">{g.titulo}</Marca> : g.titulo}
          cuenta={g.cuentas.length === 1 ? "1 cuenta" : `${g.cuentas.length} cuentas`}
          nota={<Plata valor={g.suma} />}
        >
          {g.cuentas.map((c) => (
            <Renglon
              key={c.id}
              // El renglón entero lleva a la cuenta (el nombre se estira sobre el renglón): el blanco
              // del dedo es el renglón, no sólo el nombre. La tecla queda por encima.
              className="relative"
              folio={c.vence ? diaMes(c.vence) : diaMes(c.desde)}
              titulo={
                <Link href={`${base}/${c.id}`} className="after:absolute after:inset-0 hover:underline">
                  {c.quien}
                </Link>
              }
              detalle={[folioDeLaCuenta(c, hoy), c.concepto, c.total !== c.saldo ? `de ${fmtMoneyARS(c.total)}` : null, c.nota]
                .filter(Boolean)
                .join(" · ")}
              plata={<Plata valor={c.saldo} tono={g.clave === "vencido" ? "peligro" : undefined} />}
              tecla={
                <Link
                  href={`${base}/${c.id}`}
                  {...atributosBoton(g.clave === "vencido" ? "solid" : "outline", "sm")}
                  aria-label={`${VERBO[tipo]}: ${c.quien}, ${fmtMoneyARS(c.saldo)}`}
                  className="relative z-10 inline-flex h-11 items-center rounded-md px-3 text-sm font-medium sm:h-9"
                >
                  {VERBO[tipo]}
                </Link>
              }
            />
          ))}
        </Bloque>
      ))}
    </div>
  );
}

const MARCA_DEL_AGING: Record<Aging["state"], TipoMarca> = {
  vencida: "atencion",
  "por-vencer": "medias",
  "al-dia": "hecho",
  "sin-vencimiento": "pendiente",
};

type AccionFormulario = (prev: EstadoFormularioCuenta, formData: FormData) => Promise<EstadoFormularioCuenta>;

/** La cuenta de un cliente o de un proveedor. */
export function CuentaRenglon({
  detail,
  aging,
  tipo,
  volver,
  desde,
  action,
  asientaEnLibro,
  anulada,
  cheques,
}: {
  detail: DebtAccountDetail;
  aging: Aging;
  tipo: Tipo;
  volver: { href: string; texto: string };
  /** Día en que nació la deuda, si se sabe. */
  desde: string | null;
  action: AccionFormulario;
  asientaEnLibro: boolean;
  anulada: boolean;
  cheques?: { lista: ChequeVista[]; libre: number; agregar: AccionCheque; cambiarEstado: AccionCheque };
}) {
  const hecho = tipo === "cobrar" ? "Cobrado" : "Pagado";
  const movs = tipo === "cobrar" ? "cobros" : "pagos";
  return (
    <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
      <Link href={volver.href} className="inline-flex min-h-11 items-center text-sm font-medium text-accent-ink hover:underline">
        ← {volver.texto}
      </Link>
      <header data-ui="page-header" className="mb-5">
        <h1 className="text-2xl font-bold text-strong">{detail.contraparte}</h1>
        <LineaDeEstado
          datos={[
            <strong key="t">{tipo === "cobrar" ? "Te debe" : "Le debés"}</strong>,
            detail.referencia,
            desde ? `desde el ${diaMes(desde)}` : null,
            anulada ? <Marca key="a" tipo="anulado">Anulada</Marca> : <Marca key="a" tipo={MARCA_DEL_AGING[aging.state]}>{aging.label}</Marca>,
          ]}
        />
      </header>
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="min-w-0">
          <section aria-label="La cuenta" className="mb-6 max-w-xl">
            <LineaDeCuenta concepto="Total de la deuda" importe={<Plata valor={detail.total} />} />
            <LineaDeCuenta concepto={`Menos lo ${hecho.toLowerCase()}`} importe={<Plata valor={detail.saldado} />} />
            <LineaDeCuenta total concepto="Saldo" importe={<Plata valor={detail.saldo} tono={aging.state === "vencida" && detail.saldo > 0 ? "peligro" : undefined} />} />
          </section>
          <div className="max-w-xl">
            <RegisterCollectionForm
              accountId={detail.id}
              saldo={detail.saldo}
              kind={tipo}
              action={action}
              asientaEnLibro={asientaEnLibro}
              anulada={anulada}
              tope={cheques?.libre}
            />
          </div>
          {cheques && !anulada && (
            <div className="mt-8 max-w-xl">
              <ChequesDeLaDeuda
                cuentaId={detail.id}
                cheques={cheques.lista}
                libre={cheques.libre}
                agregar={cheques.agregar}
                cambiarEstado={cheques.cambiarEstado}
                asientaEnLibro={asientaEnLibro}
              />
            </div>
          )}
        </div>
        <aside className="min-w-0" aria-labelledby="historia">
          <div className="flex items-baseline justify-between gap-3 border-b border-line-strong pb-2">
            <h2 id="historia" className="text-[15px] font-semibold text-strong">
              Historia de {movs}
            </h2>
            <span className="text-[13px] text-muted">{detail.historial.length === 0 ? "ninguno todavía" : detail.historial.length}</span>
          </div>
          {detail.historial.length === 0 && <p className="py-3 text-sm text-muted">Todavía no se registró ningún {tipo === "cobrar" ? "cobro" : "pago"}.</p>}
          {detail.historial.map((h) => (
            <Renglon
              key={h.id}
              folio={fmtShortDate(h.fecha).slice(0, 5)}
              titulo={<span className="font-normal">{h.metodo}</span>}
              detalle={h.nota ?? undefined}
              plata={<Plata valor={h.monto} />}
            />
          ))}
        </aside>
      </div>
    </main>
  );
}
