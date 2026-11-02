export const ESTADO_LABEL: Record<string, string> = {
  NUEVA: "Nueva",
  EN_CALIFICACION: "Se está calificando",
  PARA_PERSONA: "Para una persona",
  CONVERTIDA: "Ya es proyecto",
  DESCARTADA: "Descartada",
};

export const INTENCION_LABEL: Record<string, string> = { NUEVA: "Consulta", PRECIO: "Pide precio", ESCALAR: "Hay que atenderla ya", NO_CLIENTE: "No parece un cliente" };

export const ENVIO_LABEL: Record<string, string> = {
  ENVIADO: "Enviado por mail",
  SIMULADO: "No salió: no hay mail conectado o falta el mail del cliente",
  FALLIDO: "Falló el envío",
  BORRADOR: "Borrador: espera a una persona",
  DESCARTADO: "Borrador descartado",
  NO_APLICA: "",
};

export const cuando = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
