import { PLANES } from "@/lib/planes";
import { plata } from "@/lib/dinero";

/** Preguntas frecuentes. Respuestas propias; todo lo simulado se dice simulado. */
export interface Pregunta {
  id: string;
  pregunta: string;
  respuesta: string[];
  enlace?: { href: string; texto: string };
}

const pct = (n: number) => `${Math.round(n * 100)} %`;

export const PREGUNTAS: Pregunta[] = [
  {
    id: "que-es",
    pregunta: "¿Qué es buscatufoto?",
    respuesta: [
      "Una plataforma para que fotógrafos de carreras, torneos y fiestas publiquen sus fotos y videos y los vendan. La gente entra desde el enlace, se busca por número, elige y paga.",
      "Hay dos modos. Con una cuenta habilitada (por invitación), los álbumes se guardan en nuestro servidor y los cobros son reales. En el modo de prueba, todo funciona en tu navegador y lo simulado está rotulado «Modo demostración».",
    ],
  },
  {
    id: "empezar",
    pregunta: "¿Cómo empiezo?",
    respuesta: [
      "Entrás a «Soy fotógrafo», creás tu cuenta de prueba, cargás tus datos de cobro y armás el primer álbum: nombre, fecha, precio por foto. Después subís las fotos y compartís el enlace.",
    ],
    enlace: { href: "/panel", texto: "Crear mi álbum" },
  },
  {
    id: "costo",
    pregunta: "¿Cuánto cuesta?",
    respuesta: [
      `El plan Libre no tiene costo fijo: se descuenta un ${pct(PLANES.libre.comision)} de cada venta. El plan Pro cuesta ${plata(PLANES.pro.mensual)} por mes (${plata(PLANES.pro.mensualEnAnual)} por mes si pagás el año) y no cobra comisión por venta.`,
      "Todos los precios son provisionales a confirmar y no incluyen impuestos.",
    ],
    enlace: { href: "/calculadora", texto: "Calculá qué plan te conviene" },
  },
  {
    id: "comision-medio",
    pregunta: "¿Y la comisión del medio de pago?",
    respuesta: [
      "Es aparte. Mercado Pago o el medio que uses cobra su propia comisión por cada operación, según tu cuenta y el plazo de acreditación. Esa parte no la fijamos nosotros y no está incluida en nuestros precios.",
    ],
  },
  {
    id: "cobro",
    pregunta: "¿Cómo cobro lo que vendo?",
    respuesta: [
      "El comprador paga con Mercado Pago, en tu propia cuenta (la plata entra directo a vos), o por transferencia a los datos que cargaste en el panel; en ese caso marcás el pedido como pagado cuando te llega.",
      "En el modo de prueba el pago es simulado y no se mueve plata real; la pantalla lo avisa.",
    ],
  },
  {
    id: "vista-previa",
    pregunta: "¿Qué ve el comprador antes de pagar?",
    respuesta: [
      "Una vista previa de hasta 1280 px con la marca de agua encima. El original nunca se muestra antes del pago: se entrega sólo con el pedido pagado.",
    ],
  },
  {
    id: "buscar",
    pregunta: "¿Cómo se encuentra la gente en las fotos?",
    respuesta: [
      "Por número de dorsal: escribe su número y la galería le muestra las fotos donde aparece.",
      "La búsqueda por selfie viene más adelante, cuando quede resuelta en el navegador y probada. No la simulamos.",
    ],
  },
  {
    id: "dorsal-archivo",
    pregunta: "¿Tengo que etiquetar foto por foto?",
    respuesta: [
      "No necesariamente. Si el nombre del archivo trae los dorsales (por ejemplo, carrera_d1043-d318.jpg o 1043-318.jpg), se cargan solos al subir. Igual podés corregirlos a mano en el panel.",
    ],
    enlace: { href: "/blog/nombrar-archivos-dorsal", texto: "Cómo nombrar los archivos" },
  },
  {
    id: "videos",
    pregunta: "¿Puedo vender videos?",
    respuesta: [
      "Sí. Los subís al mismo álbum y les ponés su propio precio, o el mismo que a las fotos. En el plan Pro, cada video usa 10 créditos y cada foto, 1.",
    ],
  },
  {
    id: "cupones",
    pregunta: "¿Cómo funcionan los cupones?",
    respuesta: [
      "Creás un código con descuento por porcentaje o por monto fijo. Al de porcentaje le podés poner un tope en pesos, y a cualquiera una cantidad máxima de usos. Cuando se agotan, el código deja de aplicar.",
    ],
  },
  {
    id: "colaboradores",
    pregunta: "¿Puedo trabajar con otros fotógrafos?",
    respuesta: [
      "Sí. En cada álbum sumás colaboradores, con rol de fotógrafo o de asistente, para repartir la cobertura del evento.",
    ],
  },
  {
    id: "datos",
    pregunta: "¿Qué pasa con mis datos?",
    respuesta: [
      "Con una cuenta habilitada, los originales se guardan en un almacenamiento privado y sólo se entregan con el pedido pagado; lo público son las vistas previas con marca de agua. En el modo de prueba todo queda en tu navegador (IndexedDB) y, si borrás los datos del sitio, se pierde.",
      "Si aparecés en una foto (o aparece un menor a tu cargo) y no querés que se publique, en la vista ampliada tocá «Pedir que saquen esta foto» y le escribís al fotógrafo, que la puede ocultar.",
      "Tampoco procesamos rostros.",
    ],
    enlace: { href: "/privacidad", texto: "Leer la política de privacidad" },
  },
  {
    id: "formatos",
    pregunta: "¿Qué formatos y pesos acepta?",
    respuesta: [
      "Fotos JPG, PNG y WebP de hasta 40 MB, y videos MP4, WebM o MOV de hasta 300 MB. Como todo se procesa en tu navegador, el límite práctico depende de tu computadora: conviene usar videos cortos (límites provisionales a confirmar).",
    ],
  },
  {
    id: "contacto",
    pregunta: "¿Cómo me contacto?",
    respuesta: ["Desde la página de contacto. Mientras sea una demo, el formulario no envía mensajes: te dejamos el correo para escribirnos."],
    enlace: { href: "/contacto", texto: "Ir a contacto" },
  },
];
