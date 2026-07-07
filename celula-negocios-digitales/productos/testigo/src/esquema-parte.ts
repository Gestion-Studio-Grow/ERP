/**
 * Esquema del PARTE DE TRABAJO estructurado para el rubro CONTROL DE PLAGAS.
 *
 * Es el contrato de salida del núcleo (`estructurar.ts`) y la entrada del render (`plantilla-pdf.ts`).
 * Se define con Zod para: (1) generar el JSON Schema que consume `output_config.format` de Claude,
 * y (2) validar en runtime lo que devuelve el modelo.
 *
 * Regla clave: los campos regulatorios (producto, registro, dosis, plazo de reingreso) admiten el
 * sentinela "PENDIENTE_REVISION" cuando el operario no los mencionó. NUNCA se inventan.
 */
import { z } from "zod";

export const PENDIENTE = "PENDIENTE_REVISION" as const;

/** Producto aplicado — el bloque regulatorio del parte. */
export const ProductoAplicado = z.object({
  nombreComercial: z.string().describe("Nombre comercial del producto, ej 'Klerat'. PENDIENTE_REVISION si no se mencionó."),
  principioActivo: z.string().describe("Principio activo, ej 'Brodifacoum 0.005%'. PENDIENTE_REVISION si no se mencionó."),
  numeroRegistro: z.string().describe("N° de registro SENASA/ANMAT. PENDIENTE_REVISION si no se mencionó — jamás inventar."),
  dosis: z.string().describe("Dosis y concentración aplicada. PENDIENTE_REVISION si no se mencionó."),
  metodoAplicacion: z.string().describe("Método: cebo en estación, pulverización, gel, polvo, etc."),
});

/** Un ítem del checklist de verificación. */
export const ItemChecklist = z.object({
  punto: z.string().describe("Punto verificado, ej 'Estaciones de cebo perimetrales'."),
  estado: z.enum(["ok", "observado", "no_aplica"]).describe("Estado del punto."),
  detalle: z.string().describe("Aclaración breve. Cadena vacía si no aplica."),
});

/** Foto referenciada en el parte. */
export const FotoParte = z.object({
  url: z.string(),
  epigrafe: z.string().describe("Epígrafe descriptivo generado para el parte."),
  momento: z.enum(["antes", "durante", "despues", "indeterminado"]),
});

export const ParteEstructurado = z.object({
  // --- Servicio ---
  tipoServicio: z
    .array(z.enum(["desinsectacion", "desratizacion", "desinfeccion", "desinfestacion"]))
    .describe("Uno o más tipos de servicio realizados."),
  plagasObjetivo: z.array(z.string()).describe("Plagas tratadas, ej ['ratas','cucarachas']."),
  modalidad: z.enum(["preventivo", "correctivo", "mixto"]).describe("Modalidad del servicio."),

  // --- Cliente / establecimiento ---
  tipoEstablecimiento: z
    .enum(["gastronomico", "consorcio", "industria", "domicilio", "comercio", "otro"])
    .describe("Tipo de establecimiento atendido."),

  // --- Diagnóstico (ANTES) ---
  diagnostico: z.string().describe("Situación encontrada al llegar: evidencias, nivel de infestación."),
  nivelInfestacion: z.enum(["bajo", "medio", "alto", "no_evaluado"]).describe("Nivel estimado de infestación."),

  // --- Tratamiento ---
  productosAplicados: z.array(ProductoAplicado).describe("Productos usados. Al menos uno."),
  areasTratadas: z.array(z.string()).describe("Áreas/sectores tratados, ej ['subsuelo','cocina','depósito']."),

  // --- Verificación ---
  checklist: z.array(ItemChecklist).describe("Puntos de control verificados durante el servicio."),

  // --- Resultado (DESPUÉS) ---
  trabajoRealizado: z.string().describe("Resumen de lo realizado, en prosa profesional."),
  observaciones: z.string().describe("Observaciones al cliente. Cadena vacía si no hay."),

  // --- Seguridad ---
  plazoReingreso: z.string().describe("Plazo de reingreso al área tratada, ej '24 horas'. PENDIENTE_REVISION si no se mencionó."),
  advertenciasSeguridad: z.array(z.string()).describe("Advertencias de seguridad para el cliente."),

  // --- Próximo servicio ---
  proximoServicioSugerido: z.string().describe("Fecha o plazo sugerido para el próximo control. Cadena vacía si no corresponde."),

  // --- Fotos ---
  fotos: z.array(FotoParte).describe("Fotos con epígrafe, clasificadas antes/después."),

  // --- Meta de calidad ---
  camposPendientes: z
    .array(z.string())
    .describe("Lista de campos regulatorios que quedaron en PENDIENTE_REVISION y hay que repreguntar. Vacío si el parte está completo."),
});

export type TParteEstructurado = z.infer<typeof ParteEstructurado>;
export type TProductoAplicado = z.infer<typeof ProductoAplicado>;
