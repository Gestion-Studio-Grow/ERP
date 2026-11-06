// «Obtené asistencia» del asistente ARCA (server component, sin JS de cliente): <details> nativo
// (teclado y lector de pantalla incluidos, entra en 390 px). Dos opciones: elegir UN estudio que usa los
// sistemas de GSG (módulo `cartera`, leído de la base) o escribirle a soporte de GSG. Lo puro vive en
// src/lib/fiscal/contador-arca.ts. GSG no entra al ARCA del cliente.
import { ButtonLink, Button, Marca } from "@/components/ui";
import {
  ETIQUETA_ESTADO_CONTADOR,
  textoDelPedidoAlContador,
  type ContadorDeLaRed,
  type PedidoAlContador,
} from "@/lib/fiscal/contador-arca";

type Accion = (formData: FormData) => void | Promise<void>;

interface Props {
  contador: PedidoAlContador | null;
  contadores: ContadorDeLaRed[];
  avisoAlContador: string | null;
  soporte: string | null;
  /** Sin acciones (plano del operador o sólo lectura): sólo se muestra el estado. */
  acciones?: { pedir: Accion; cancelar: Accion };
}

const MARCA = { pedido: "pendiente", "en-curso": "atencion", listo: "hecho" } as const;
const RESUMEN =
  "cursor-pointer rounded py-3 font-medium text-accent-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2";

function Soporte({ soporte }: { soporte: string | null }) {
  return (
    <div className="space-y-2 rounded border border-line p-3">
      <p className="font-semibold text-strong">Contactate con nuestro equipo</p>
      <p className="text-muted">Te guiamos por WhatsApp. El trámite en ARCA lo hacés vos: nunca te pedimos la clave fiscal.</p>
      {soporte ? (
        <ButtonLink href={soporte} target="_blank" rel="noopener noreferrer" variant="outline">
          Escribirnos por WhatsApp
        </ButtonLink>
      ) : (
        <p className="text-warning">El WhatsApp de soporte está provisional a confirmar: por ahora escribinos por mail.</p>
      )}
    </div>
  );
}

export function ObtenerAsistencia({ contador, contadores, avisoAlContador, soporte, acciones }: Props) {
  if (contador) {
    return (
      <div className="border-b border-line py-3 text-sm" role="status">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold text-strong">Tu contador · {contador.estudioNombre}</h3>
          <Marca tipo={MARCA[contador.estado]}>{ETIQUETA_ESTADO_CONTADOR[contador.estado]}</Marca>
        </div>
        <p className="mt-2">{textoDelPedidoAlContador(contador)}</p>
        {acciones && contador.estado !== "listo" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {avisoAlContador ? (
              <ButtonLink href={avisoAlContador} target="_blank" rel="noopener noreferrer">
                Avisale por WhatsApp
              </ButtonLink>
            ) : (
              <p className="w-full text-muted">Este estudio todavía no cargó su WhatsApp: el aviso le llega por nuestro equipo.</p>
            )}
            <form action={acciones.cancelar}>
              <Button type="submit" variant="outline">
                Elegir otro o hacerlo yo
              </Button>
            </form>
          </div>
        )}
      </div>
    );
  }
  if (!acciones) return null;

  return (
    <details className="border-b border-line py-1 text-sm">
      <summary className={RESUMEN}>¿Te trabaste? Obtené asistencia</summary>
      <div className="mt-1 space-y-3 pb-2">
        <div className="space-y-2 rounded border border-line p-3">
          <p className="font-semibold text-strong">Elegí tu contador</p>
          <p className="text-muted">
            Estudios que usan los sistemas de GSG. Lo hacen con su relación con vos en ARCA; GSG no entra a tu ARCA.
          </p>
          {contadores.length > 0 ? (
            <form action={acciones.pedir} className="space-y-3">
              <fieldset>
                <legend className="sr-only">Estudios contables</legend>
                <ul className="space-y-1">
                  {contadores.map((c) => (
                    <li key={c.tenantId}>
                      <label className="flex min-h-11 items-center gap-2">
                        <input type="radio" name="estudioTenantId" value={c.tenantId} required />
                        <span>{c.nombre}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
              <Button type="submit">Pedirle el certificado</Button>
            </form>
          ) : (
            <p>Todavía no hay contadores disponibles: contactate con nuestro equipo.</p>
          )}
        </div>
        <Soporte soporte={soporte} />
      </div>
    </details>
  );
}
