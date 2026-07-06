const PREGUNTAS = [
  {
    q: "¿Cómo recibo la plantilla después de pagar?",
    a: "Al instante. Apenas se acredita el pago te llega un email con el archivo (o el link para hacer tu copia del Google Sheet / duplicar el Notion). También te redirigimos a una página con las instrucciones.",
  },
  {
    q: "¿En qué formato viene?",
    a: "Según la plantilla: Google Sheets y/o Excel (la mayoría), y algunas también en Notion. Podés usarla en la compu o el celular, sin instalar nada.",
  },
  {
    q: "¿Necesito saber de Excel o de contabilidad?",
    a: "No. Cargás tus datos en las celdas de color y la planilla calcula sola. Cada una viene con una hoja de instrucciones en criollo.",
  },
  {
    q: "¿Está actualizada a la normativa argentina?",
    a: "Sí. Las plantillas de monotributo, sueldos y demás tienen los topes, escalas y reglas vigentes de ARCA/AFIP y la LCT. Cuando cambia la normativa, actualizamos y te avisamos por email.",
  },
  {
    q: "¿Puedo pagar en pesos?",
    a: "El cobro es en dólares con tarjeta (procesado de forma segura). Estamos sumando pago en pesos por Mercado Pago. El precio en pesos que ves es de referencia.",
  },
  {
    q: "¿Esto reemplaza a mi contador?",
    a: "No. Son herramientas para ordenarte y ver tus números con claridad. No reemplazan el asesoramiento de un profesional matriculado; verificá siempre los valores vigentes en ARCA.",
  },
];

export default function FAQ() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      {PREGUNTAS.map((item) => (
        <details
          key={item.q}
          style={{
            background: "var(--bg-alt)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: "16px 20px",
            marginBottom: 12,
          }}
        >
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: "1.05rem" }}>{item.q}</summary>
          <p style={{ marginBottom: 0, marginTop: 10, color: "var(--ink-soft)" }}>{item.a}</p>
        </details>
      ))}
    </div>
  );
}
