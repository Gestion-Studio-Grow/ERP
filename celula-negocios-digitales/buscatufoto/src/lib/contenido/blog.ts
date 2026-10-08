import { PLANES } from "@/lib/planes";
import { plata } from "@/lib/dinero";

/**
 * Notas del blog. Propias. Cuando hay números, son cuentas de ejemplo explícitas: nada de cifras de
 * mercado. Los precios de planes salen de src/lib/planes.ts (provisionales a confirmar).
 */
export type Bloque =
  | { tipo: "p"; texto: string }
  | { tipo: "h2"; texto: string }
  | { tipo: "lista"; items: string[] }
  | { tipo: "codigo"; lineas: string[] }
  | { tipo: "cuenta"; titulo: string; filas: { concepto: string; valor: string }[]; nota?: string };

export interface Nota {
  slug: string;
  titulo: string;
  bajada: string;
  /** AAAA-MM-DD */
  fecha: string;
  autor: string;
  minutos: number;
  cuerpo: Bloque[];
}

const AUTOR = "Equipo buscatufoto";

// Cuenta de ejemplo de la nota de precios (valores inventados para el ejemplo, no de mercado).
const EJ = { fotos: 900, compran: 60, porPersona: 3, precio: 4500 };
const ejVentas = EJ.compran * EJ.porPersona * EJ.precio;
const ejComision = Math.round(ejVentas * PLANES.libre.comision);
const pctLibre = `${Math.round(PLANES.libre.comision * 100)} %`;

export const NOTAS: Nota[] = [
  {
    slug: "nombrar-archivos-dorsal",
    titulo: "Cómo nombrar los archivos para que el dorsal se cargue solo",
    bajada: "Un par de reglas al exportar te ahorran la tarde de etiquetar foto por foto.",
    fecha: "2026-09-14",
    autor: AUTOR,
    minutos: 4,
    cuerpo: [
      {
        tipo: "p",
        texto:
          "Después de una carrera, lo que más tiempo lleva no es subir: es etiquetar. Cada foto necesita los números de los corredores que aparecen, porque así es como la gente se va a buscar. Si esos números ya vienen en el nombre del archivo, buscatufoto los lee al subir y te saltás ese paso.",
      },
      { tipo: "h2", texto: "Las dos formas que se leen" },
      {
        tipo: "lista",
        items: [
          "Con marca delante de cada número: «d», «n», «nro», «dorsal» o «#». Por ejemplo, costanera_d1043-d318.jpg queda etiquetada con 1043 y 318.",
          "Sólo números separados por guion, guion bajo, coma o espacio. Por ejemplo, 1043-318.jpg da el mismo resultado.",
        ],
      },
      {
        tipo: "codigo",
        lineas: ["costanera_d1043-d318.jpg   →  1043, 318", "1043-318.jpg               →  1043, 318", "llegada_#73.jpg            →  73", "IMG_4021.jpg               →  (nada)"],
      },
      { tipo: "h2", texto: "Lo que a propósito no se toma" },
      {
        tipo: "p",
        texto:
          "La numeración de la cámara (IMG_4021, DSC_0001) no se lee como dorsal. Si lo hiciera, cada foto quedaría etiquetada con un corredor que no existe y la búsqueda se llenaría de ruido. Los ceros de adelante se ignoran: d0073 es el 73.",
      },
      { tipo: "h2", texto: "Un flujo que anda" },
      {
        tipo: "lista",
        items: [
          "Elegí las fotos en tu programa de edición, como siempre.",
          "Al revisar cada una, agregale al nombre los dorsales que se leen bien: un prefijo con el evento y después d más el número.",
          "Exportá con ese nombre. Si tu programa permite plantillas de nombre, armá una con el evento al principio.",
          "Subí todo al álbum. Las que no traían número quedan sin etiqueta y las completás a mano desde el panel.",
        ],
      },
      {
        tipo: "p",
        texto:
          "No hace falta que sea perfecto. Con que la mayoría de las fotos lleguen etiquetadas, lo que queda para corregir a mano es poco, y cada corrección se hace en un campo de texto con los números separados por coma.",
      },
    ],
  },
  {
    slug: "cuanto-cobrar-foto-carrera",
    titulo: "Cuánto cobrar una foto de carrera: una cuenta simple",
    bajada: "No hay precio mágico, pero sí una cuenta que te ordena: cuánto vendés, cuánto te queda y qué plan te sirve.",
    fecha: "2026-09-28",
    autor: AUTOR,
    minutos: 5,
    cuerpo: [
      {
        tipo: "p",
        texto:
          "No te vamos a decir cuánto cobra el resto: no tenemos esos datos y no queremos inventarlos. Lo que sí podemos es mostrarte una cuenta que te ayuda a decidir, con números de ejemplo que cambiás por los tuyos.",
      },
      { tipo: "h2", texto: "Arrancá por lo que vendés, no por lo que sacás" },
      {
        tipo: "p",
        texto:
          "Sacar mil fotos no significa vender mil. Lo que importa es cuánta gente compra y cuántas fotos se lleva cada uno. Esos dos números los conocés vos mejor que nadie después de un par de eventos.",
      },
      {
        tipo: "cuenta",
        titulo: "Cuenta de ejemplo (números inventados para el ejemplo)",
        filas: [
          { concepto: "Fotos publicadas del evento", valor: `${EJ.fotos}` },
          { concepto: "Personas que compran", valor: `${EJ.compran}` },
          { concepto: "Fotos por persona, en promedio", valor: `${EJ.porPersona}` },
          { concepto: "Precio por foto", valor: plata(EJ.precio) },
          { concepto: "Ventas del evento", valor: plata(ejVentas) },
          { concepto: `Comisión del plan Libre (${pctLibre})`, valor: `− ${plata(ejComision)}` },
          { concepto: "Te queda, antes del medio de pago", valor: plata(ejVentas - ejComision) },
        ],
        nota: "La comisión del medio de pago (Mercado Pago u otro) va aparte y depende de tu cuenta.",
      },
      { tipo: "h2", texto: "El precio por foto y el paquete se empujan entre sí" },
      {
        tipo: "p",
        texto:
          "Si la foto suelta es barata, poca gente se lleva cinco. Si armás un paquete de cinco a un precio cerrado que sale menos que cinco sueltas, el que iba a llevar dos mira el paquete. El carrito de buscatufoto elige solo la opción más barata para el comprador y le muestra cuánto ahorra, así que no hay que explicarle nada.",
      },
      {
        tipo: "lista",
        items: [
          "Una foto suelta a un precio que se pague sin pensarlo mucho.",
          "Un paquete de varias fotos que convenga claramente frente a las sueltas.",
          "Si querés, un descuento por cantidad (por ejemplo, 10 % llevando tres o más) para el que no llega al paquete.",
        ],
      },
      { tipo: "h2", texto: "¿Libre o Pro?" },
      {
        tipo: "p",
        texto: `En el plan Libre pagás un ${pctLibre} de cada venta y nada fijo. En el Pro pagás ${plata(PLANES.pro.mensual)} por mes y nada por venta, con ${PLANES.pro.creditosMes.toLocaleString("es-AR")} créditos para subir y guardar. Mientras vendas poco, el Libre suele ser más barato; cuando la comisión del mes supera lo que cuesta el Pro, conviene pasarse. Todos estos precios son provisionales a confirmar.`,
      },
      {
        tipo: "p",
        texto: "Para no hacer la cuenta a mano, la calculadora la hace con tus números: ventas, fotos, videos y gigas guardados.",
      },
    ],
  },
  {
    slug: "marca-de-agua-que-proteja",
    titulo: "Marca de agua: que proteja sin arruinar la foto",
    bajada: "La marca tiene que molestar lo justo para que la captura de pantalla no sirva, y no tanto como para que nadie se reconozca.",
    fecha: "2026-10-05",
    autor: AUTOR,
    minutos: 4,
    cuerpo: [
      {
        tipo: "p",
        texto:
          "La marca de agua tiene dos trabajos que tiran para lados opuestos. Tiene que hacer que la vista previa no sirva como foto final, y al mismo tiempo dejar que el corredor se reconozca y le den ganas de comprarla. Si gana el primero, nadie compra; si gana el segundo, se la llevan con una captura.",
      },
      { tipo: "h2", texto: "Lo que ya hace buscatufoto por vos" },
      {
        tipo: "lista",
        items: [
          "La vista previa sale achicada a 1280 px como máximo: sirve para mirar en el celular, no para imprimir.",
          "La marca se aplica en tu navegador antes de publicar, sobre esa vista previa.",
          "El original queda guardado aparte y sólo se entrega con el pedido pagado.",
        ],
      },
      { tipo: "h2", texto: "Cómo ajustarla si tenés plan Pro" },
      {
        tipo: "lista",
        items: [
          "Mosaico antes que centro: una marca repetida en diagonal cubre toda la foto y no se recorta con un encuadre.",
          "Opacidad media: que se lea bien sobre cielo y sobre asfalto. Probala en una foto clara y en una oscura.",
          "Ángulo inclinado: entre 20 y 35 grados cruza las caras y los dorsales sin taparlos del todo.",
          "Tu logo o tu nombre: además de proteger, el que la ve sabe de quién es la foto.",
        ],
      },
      {
        tipo: "p",
        texto:
          "El editor muestra cada cambio en vivo sobre una foto de muestra, así que no hace falta adivinar: movés la escala o el ángulo y ves cómo queda antes de guardar.",
      },
      { tipo: "h2", texto: "Lo que una marca de agua no resuelve" },
      {
        tipo: "p",
        texto:
          "Ninguna marca es imposible de sacar para alguien decidido. Su trabajo es que el camino corto sea pagar. Por eso lo que más protege no es la marca sino no mostrar nunca el original antes de cobrar.",
      },
    ],
  },
];

export function notaPorSlug(slug: string): Nota | undefined {
  return NOTAS.find((n) => n.slug === slug);
}

