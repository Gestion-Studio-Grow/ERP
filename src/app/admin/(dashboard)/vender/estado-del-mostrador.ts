// ESTADO DEL MOSTRADOR — la línea de arriba de Vender (diseño nuevo): cómo está la caja, cuánto se
// vendió y, sólo cuando aplica, la regla del día cerrado.
//
// Antes la línea decía «Caja cerrada: lo que cobres en efectivo se anota en el libro del día» y, al
// lado, SIEMPRE la regla «con el día de caja cerrado, una venta cobrada no entra»: dos frases que se
// contradecían a la vista (son dos cierres distintos: el TURNO y el DÍA). Y el enlace iba pegado
// tras un «·» que, al partirse la línea, quedaba colgando al final del renglón.
//
// Ahora: la regla del día cerrado sale sólo con el día cerrado, y el enlace es un dato propio.
// PURO: sin React ni base; page.tsx lo pinta.
import { reglaALaVista } from "@/lib/caja/reglas-a-la-vista";

export type DatoDelMostrador =
  | { tipo: "texto"; fuerte?: string; texto?: string }
  | { tipo: "enlace"; texto: string; href: string };

export type EntradaDelMostrador = {
  /** El KPI «caja-del-dia» si cargó bien; `null` si falló o no corresponde al rol. */
  caja: { valor: string; detalle?: string } | null;
  /** El día de caja de hoy ya se cerró (frontera-cierre.ts). Sólo cuenta con la caja cerrada. */
  diaCerrado: boolean;
  /** El KPI «vender» ya armado («3 ventas $ 12.000»), o `null`. */
  vendido: string | null;
  /** Negocio de mostrador (la regla a la vista sólo se muestra ahí). */
  mostrador: boolean;
  /** La pantalla ya ofrece abrir la caja ACÁ (el atajo «Abrí la caja»): el enlace no se repite. */
  abrirAca?: boolean;
};

export function datosDelMostrador({ caja, diaCerrado, vendido, mostrador, abrirAca = false }: EntradaDelMostrador): DatoDelMostrador[] {
  const datos: DatoDelMostrador[] = [];
  const cerrada = caja?.valor === "Cerrada";
  const hoyCerrado = cerrada && diaCerrado;
  if (caja) {
    if (hoyCerrado) {
      datos.push({ tipo: "texto", fuerte: "Hoy ya está cerrado", texto: ": no se abre la caja." });
      datos.push({ tipo: "enlace", texto: "Ver el cierre", href: "/admin/caja/cierre" });
    } else if (cerrada) {
      datos.push({ tipo: "texto", fuerte: "Caja cerrada", texto: ": el efectivo que cobres va al libro del día, sin turno." });
      if (!abrirAca) datos.push({ tipo: "enlace", texto: "Abrir la caja", href: "/admin/caja" });
    } else {
      datos.push({ tipo: "texto", fuerte: `Caja ${caja.valor.toLowerCase()}${caja.detalle ? ` ${caja.detalle}` : ""}` });
    }
  }
  if (vendido) datos.push({ tipo: "texto", texto: vendido });
  // La regla del día cerrado habla del DÍA, no del turno: sólo cuando el día está cerrado.
  const regla = hoyCerrado ? reglaALaVista("vender", mostrador) : null;
  if (regla) datos.push({ tipo: "texto", texto: regla });
  return datos;
}
