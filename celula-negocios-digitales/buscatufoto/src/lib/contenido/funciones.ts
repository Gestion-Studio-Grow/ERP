/**
 * Funciones de buscatufoto: una sola fuente para el inicio y para /funciones.
 * Sólo lo que la demo hace de verdad; lo que no, va rotulado "proximamente".
 */

export type Tinte = "naranja" | "amarillo" | "verde" | "azul" | "agua" | "rosa";

export type GrupoFuncion = "vender" | "encontrar" | "equipo" | "pro";

export interface Funcion {
  id: string;
  titulo: string;
  /** una línea, para tarjetas */
  corto: string;
  /** explicación completa, para /funciones */
  largo: string;
  grupo: GrupoFuncion;
  tinte: Tinte;
  /** requiere plan Pro */
  pro?: boolean;
  /** simulado en la demo: se rotula "Modo demostración" */
  demo?: boolean;
  /** todavía no está: se rotula "Próximamente" y se dice por qué */
  proximamente?: string;
}

export const GRUPOS: { id: GrupoFuncion; titulo: string; bajada: string }[] = [
  { id: "vender", titulo: "Para vender", bajada: "Lo que hace que la foto se pague: protección, precio claro y descuentos que empujan a llevar más." },
  { id: "encontrar", titulo: "Para que te encuentren", bajada: "Que el corredor llegue desde el grupo de WhatsApp y se vea en dos toques." },
  { id: "equipo", titulo: "Para trabajar en equipo", bajada: "Cuando el evento es grande y no alcanza con un par de manos." },
  { id: "pro", titulo: "Plan Pro", bajada: "Para quien vende todos los fines de semana y quiere su propia marca." },
];

export const FUNCIONES: Funcion[] = [
  {
    id: "marca-agua",
    titulo: "Marca de agua automática",
    corto: "Subís la foto y sale marcada. El original queda guardado aparte y no se muestra.",
    largo:
      "Cada foto que subís se marca sola en tu navegador antes de publicarse. Lo que ve el comprador es una vista previa de hasta 1280 px con la marca encima; el original queda guardado aparte y sólo se entrega con el pedido pagado.",
    grupo: "vender",
    tinte: "naranja",
  },
  {
    id: "numero",
    titulo: "Búsqueda por número",
    corto: "El corredor escribe su dorsal y ve sólo las fotos donde aparece.",
    largo:
      "Cada foto lleva los dorsales que aparecen en ella. El comprador escribe su número y la galería se queda con las suyas. Los dorsales los cargás a mano o salen del nombre del archivo.",
    grupo: "encontrar",
    tinte: "amarillo",
  },
  {
    id: "paquetes",
    titulo: "Paquetes y descuentos",
    corto: "Precio por foto, paquetes cerrados y descuento por cantidad, por álbum.",
    largo:
      "En cada álbum definís el precio por foto y por video, paquetes (por ejemplo, cinco fotos a precio cerrado, o el álbum entero) y escalones de descuento por cantidad. El carrito elige solo la opción más barata para el comprador y le muestra cuánto ahorra.",
    grupo: "vender",
    tinte: "verde",
  },
  {
    id: "cupones",
    titulo: "Cupones",
    corto: "Códigos por porcentaje o monto fijo, con tope de descuento y cantidad de usos.",
    largo:
      "Armás códigos de descuento por porcentaje o por monto fijo. Al de porcentaje le podés poner un tope en pesos, y a cualquiera un máximo de usos. Los activás y desactivás cuando quieras.",
    grupo: "vender",
    tinte: "verde",
  },
  {
    id: "colaboradores",
    titulo: "Colaboradores",
    corto: "Sumá otros fotógrafos o asistentes a un álbum para cubrir todo el evento.",
    largo:
      "Invitás a otros fotógrafos o asistentes a un álbum puntual, con su rol. Sirve para carreras largas o torneos con varias canchas, donde una sola persona no llega a todo.",
    grupo: "equipo",
    tinte: "azul",
  },
  {
    id: "historias",
    titulo: "Placa para historias",
    corto: "Una imagen vertical con el nombre del álbum y el enlace, lista para Instagram.",
    largo:
      "Con un toque generás una placa vertical (9:16) con el nombre del evento, la fecha y el enlace del álbum, para subir a historias y que la gente llegue directo a buscarse.",
    grupo: "encontrar",
    tinte: "rosa",
  },
  // ---- extras (carrusel del inicio) ----
  {
    id: "marca-propia",
    titulo: "Editor de marca propia",
    corto: "Tu logo o tu texto, con color, escala y ángulo. Lo ves en vivo antes de guardar.",
    largo:
      "Cambiás la marca de buscatufoto por la tuya: subís tu logo o escribís un texto, y ajustás color, opacidad, escala, ángulo y si va en mosaico o al centro. La vista previa se actualiza mientras movés los controles.",
    grupo: "pro",
    tinte: "naranja",
    pro: true,
  },
  {
    id: "sin-comision",
    titulo: "Sin comisión por venta",
    corto: "Pagás una cuota fija y cada venta queda entera para vos.",
    largo:
      "Con el plan Pro no se descuenta ningún porcentaje de lo que vendés: pagás la cuota del mes y listo. Lo único aparte es lo que cobre tu medio de pago.",
    grupo: "pro",
    tinte: "verde",
    pro: true,
  },
  {
    id: "creditos",
    titulo: "Créditos que no se pierden",
    corto: "Lo que no usás en el mes pasa al siguiente.",
    largo:
      "El plan Pro trae créditos por mes para subir y guardar (una foto usa 1, un video 10, y cada GB guardado algunos por mes). Los que no usás pasan al mes siguiente; si te pasás, el excedente se cobra en la renovación.",
    grupo: "pro",
    tinte: "amarillo",
    pro: true,
  },
  {
    id: "dorsal-archivo",
    titulo: "Dorsal desde el nombre del archivo",
    corto: "Si el archivo se llama 1043-318.jpg, la foto queda etiquetada con 1043 y 318.",
    largo:
      "Si nombrás los archivos con los dorsales (por ejemplo, carrera_d1043-d318.jpg o 1043-318.jpg), al subirlos se etiquetan solos. La numeración de la cámara, tipo IMG_4021, no se toma como dorsal.",
    grupo: "encontrar",
    tinte: "amarillo",
  },
  {
    id: "whatsapp",
    titulo: "Entrega por WhatsApp",
    corto: "Después de pagar, el comprador se manda el enlace de descarga por WhatsApp.",
    largo:
      "Después de pagar, el comprador puede mandarse a sí mismo el enlace de descarga por WhatsApp. En esta demo no hay envío automático: el botón abre WhatsApp con el mensaje ya escrito y lo mandás vos.",
    grupo: "vender",
    tinte: "agua",
    demo: true,
  },
  {
    id: "perfil",
    titulo: "Enlace público y perfil",
    corto: "Cada álbum tiene su enlace y vos tenés un perfil con todos tus eventos.",
    largo:
      "Cada álbum tiene un enlace corto para compartir en grupos y redes. Además tenés un perfil público con tu nombre, tu bio, tu Instagram y la lista de tus álbumes publicados.",
    grupo: "encontrar",
    tinte: "azul",
  },
  {
    id: "ventas",
    titulo: "Ventas en el panel",
    corto: "Qué se vendió, de qué álbum, a quién y con qué descuento.",
    largo:
      "En el panel ves cada pedido: el álbum, las fotos, el comprador, el descuento que se aplicó y lo que te queda después de la comisión de tu plan.",
    grupo: "vender",
    tinte: "verde",
  },
  {
    id: "selfie",
    titulo: "Búsqueda por selfie",
    corto: "Encontrarte con una foto de tu cara, sin saber el número.",
    largo:
      "Buscar con una selfie, para quien no recuerda su número o en eventos sin dorsal. La vamos a sumar cuando quede resuelta en el navegador y probada; hasta entonces no mostramos resultados de mentira.",
    grupo: "encontrar",
    tinte: "rosa",
    proximamente: "cuando quede resuelta en el navegador y probada",
  },
];

const porId = (id: string) => {
  const f = FUNCIONES.find((x) => x.id === id);
  if (!f) throw new Error(`Función desconocida: ${id}`);
  return f;
};

/** Las seis de la grilla del inicio, en orden. */
export const FUNCIONES_PRINCIPALES = ["marca-agua", "numero", "paquetes", "cupones", "colaboradores", "historias"].map(porId);

/** Las del carrusel del inicio. */
export const FUNCIONES_EXTRA = ["marca-propia", "dorsal-archivo", "whatsapp", "perfil", "ventas", "selfie"].map(porId);
