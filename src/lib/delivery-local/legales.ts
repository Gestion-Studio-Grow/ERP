// ============================================================================
// DELIVERY LOCAL · LOS TEXTOS LEGALES — términos, privacidad y arrepentimiento. CONTENIDO PURO.
// ============================================================================
//
// La idea que protege a todos: Gestión Studio Grow PROVEE EL SOFTWARE y nada más. No vende, no
// elabora, no transporta, no cobra y no contrata repartidores. El vendedor es el comercio, que
// cobra directo y coordina con su propio repartidor. Eso es lo que separa este producto de las
// apps de comisión (y de sus juicios laborales con los repartidores).
//
// FUENTES Y LÍMITES: docs/tenants/bitacora/investigacion-referentes-y-legal.md. Las cláusulas son
// un BORRADOR razonado sobre Ley 24.240, CCyC arts. 1105-1116, Disp. SSDCyLC 954/2025 y Ley 25.326:
// las revisa un abogado antes de salir con clientes reales (provisional a confirmar). Lo que el
// comercio no confirmó todavía (CUIT, razón social) sale marcado como provisional.

import type { ConfigDeliveryLocal } from "./config";

export type SeccionDeTexto = { titulo: string; parrafos: string[] };
export type DocumentoDeTexto = { titulo: string; vigencia: string; secciones: SeccionDeTexto[] };

export const VIGENCIA = "Versión 1 · 10/11/2026 · borrador sujeto a revisión legal (provisional a confirmar)";

/** Minutos que tiene el comercio para confirmar; pasado eso, el cliente puede darlo de baja sin costo. */
export const MINUTOS_PARA_CONFIRMAR = 30;

function vendedor(cfg: ConfigDeliveryLocal): string {
  return `${cfg.razonSocial}${cfg.cuit ? `, CUIT ${cfg.cuit}` : ", CUIT provisional a confirmar"}, con domicilio en ${cfg.direccion}`;
}

export function terminos(cfg: ConfigDeliveryLocal): DocumentoDeTexto {
  return {
    titulo: `Términos y condiciones · pedidos a ${cfg.nombre}`,
    vigencia: VIGENCIA,
    secciones: [
      {
        titulo: "Quién te vende",
        parrafos: [
          `Todo lo que pedís en esta página te lo vende ${vendedor(cfg)} (en adelante, «el local»). El local fija la oferta y los precios, prepara el pedido, lo entrega, te lo cobra, te emite el comprobante y atiende cualquier reclamo.`,
          "Gestión Studio Grow (GSG) es la empresa que hizo y mantiene este sistema de pedidos. GSG no vende, no elabora, no transporta, no cobra y no recibe tu plata: le provee el software al local, que le paga un abono fijo, sin comisión por pedido.",
        ],
      },
      {
        titulo: "Precio, envío y zona",
        parrafos: [
          "El precio que ves es el precio final, en pesos, con impuestos incluidos. El costo del envío se muestra antes de confirmar y se suma al total. No hay cargos de servicio ocultos.",
          `El local reparte con su propio repartidor${cfg.radioKm !== null ? `, hasta unos ${cfg.radioKm} km del local` : ""}. Si tu dirección queda fuera de la zona, el local te avisa y podés retirarlo o cancelar sin costo.`,
          "Los tiempos de entrega son estimados: dependen de la demanda, del clima y del tránsito.",
        ],
      },
      {
        titulo: "Cómo se paga",
        parrafos: [
          "Pagás directo al local: por transferencia a su cuenta, en efectivo al recibir, o con un link de Mercado Pago que te manda el local. GSG nunca te pide datos de tarjeta ni de tu cuenta.",
          "Si pagás por transferencia, el pedido queda «recibido» hasta que el local vea la plata en su cuenta; ahí lo confirma. Mandale el comprobante por WhatsApp para que sea más rápido.",
          "Si pagás en efectivo, decinos con cuánto pagás para que el repartidor lleve el vuelto.",
        ],
      },
      {
        titulo: "Confirmación y cancelación",
        parrafos: [
          `El pedido queda tomado cuando el local lo confirma. Si en ${MINUTOS_PARA_CONFIRMAR} minutos no te lo confirmó, podés darlo de baja sin costo y, si ya pagaste, el local te devuelve todo por el mismo medio.`,
          "Antes de la confirmación podés cancelar sin costo, escribiéndole al local por WhatsApp o desde «Arrepentimiento».",
          "Una vez confirmado, el local empieza a preparar alimentos frescos: por su naturaleza perecedera, no corre el derecho de revocación del artículo 1116 del Código Civil y Comercial. Si algo llegó mal, faltó o no es lo que pediste, el local te lo repone o te devuelve la plata.",
        ],
      },
      {
        titulo: "Productos y alergias",
        parrafos: [
          "Las fotos son ilustrativas. Si tenés alguna alergia o restricción, escribila en la nota del pedido y consultá al local antes de confirmar: el local es responsable de la elaboración, la higiene y la conservación de los alimentos hasta la entrega.",
        ],
      },
      {
        titulo: "Los repartidores",
        parrafos: [
          "El repartidor trabaja para el local o es contratado por el local, en las condiciones que el local acuerde con él. GSG no contrata, no asigna, no remunera, no califica ni bloquea repartidores, y no es parte de esa relación.",
        ],
      },
      {
        titulo: "Uso del sistema",
        parrafos: [
          "Usá la página para hacer pedidos reales. No cargues datos de otra persona sin su permiso ni pedidos falsos. El local puede no tomar pedidos que no pueda verificar.",
          "GSG responde por el funcionamiento del software. Lo que hace a la compra (producto, precio, entrega, cobro y comprobante) lo responde el local, sin perjuicio de los derechos que te da la Ley 24.240 de Defensa del Consumidor.",
        ],
      },
      {
        titulo: "Reclamos",
        parrafos: [
          "Primero, al local, por WhatsApp o en el local. Si no te dan una respuesta, podés hacer tu reclamo ante la autoridad de Defensa del Consumidor (Ventanilla Federal: argentina.gob.ar/produccion/defensadelconsumidor) o la oficina municipal de Esteban Echeverría.",
        ],
      },
    ],
  };
}

export function privacidad(cfg: ConfigDeliveryLocal): DocumentoDeTexto {
  return {
    titulo: `Privacidad · pedidos a ${cfg.nombre}`,
    vigencia: VIGENCIA,
    secciones: [
      {
        titulo: "Quién guarda tus datos",
        parrafos: [
          `El responsable de tus datos es el local (${vendedor(cfg)}). Gestión Studio Grow los guarda por cuenta del local, en su sistema, y no los usa para nada más (encargado del tratamiento, art. 25 de la Ley 25.326).`,
        ],
      },
      {
        titulo: "Qué datos y para qué",
        parrafos: [
          "Tu nombre, tu teléfono, la dirección de entrega, lo que pediste y la nota que escribas. Sólo para preparar, entregar y cobrar tu pedido, y para avisarte cómo va.",
          "Tu ubicación, sólo si tocás «Usar mi ubicación»: es optativa, la tomamos una vez al hacer el pedido (no te seguimos) y sirve para que el repartidor encuentre la puerta. Si no la compartís, alcanza con la dirección escrita.",
          "No usamos tus datos para publicidad, no los vendemos y no se los pasamos a nadie más que al repartidor del local, que ve lo justo para entregarte.",
        ],
      },
      {
        titulo: "Cuánto tiempo",
        parrafos: [
          "Los datos del pedido se guardan mientras haga falta para el comprobante, los reclamos y las obligaciones contables e impositivas del local.",
        ],
      },
      {
        titulo: "Tus derechos",
        parrafos: [
          "Podés pedir ver, corregir o borrar tus datos escribiéndole al local. Es gratis y te tienen que contestar en los plazos de la Ley 25.326 (10 días para el acceso; 5 días hábiles para corregir o borrar).",
          "El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley N° 25.326.",
          "La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.",
        ],
      },
    ],
  };
}

export function arrepentimiento(cfg: ConfigDeliveryLocal): DocumentoDeTexto {
  return {
    titulo: "Arrepentimiento y cancelación",
    vigencia: VIGENCIA,
    secciones: [
      {
        titulo: "Si el local todavía no confirmó tu pedido",
        parrafos: [
          `Podés cancelarlo sin costo y sin dar explicaciones. Tocá «Quiero cancelar mi pedido» y mandale el mensaje a ${cfg.nombre}. Si ya pagaste, te devuelven todo por el mismo medio.`,
        ],
      },
      {
        titulo: "Si ya está confirmado",
        parrafos: [
          "Son alimentos que se preparan en el momento: por su naturaleza perecedera no corre la revocación del artículo 1116 del Código Civil y Comercial. Igual, escribile al local: si todavía no empezó a prepararlo, puede aceptarte la baja.",
          "Si algo llegó mal o faltó, el local te lo repone o te devuelve la plata.",
        ],
      },
    ],
  };
}
