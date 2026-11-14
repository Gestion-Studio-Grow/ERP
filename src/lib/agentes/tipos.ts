// ============================================================================
// EQUIPO DE AGENTES · contratos del motor (docs/tenants/mia-producciones/agentes/03 §2, §4, §5, §10)
// ============================================================================
// PURO: sólo tipos y constantes. El motor (src/lib/agentes/) no sabe nada de un rubro: lo propio de
// cada rubro (herramientas, la vista de la persona, sus reglas de visibilidad) llega por parámetro.
// Nada de acá importa src/lib/proyectos/ (03 §6.1).

import type { Prisma } from "@/generated/prisma/client";

/** Conexión de la transacción corta de la fase ESCRIBIR. Adentro sólo existe `tx` (03 §4.1). */
export type Tx = Prisma.TransactionClient;

// ── Equipos, puestos y tareas (catálogo en puestos/*.ts) ───────────────────────────────────────

/** Identificador de puesto, con el equipo adelante: "administracion.cobranzas". */
export type PuestoId = `${string}.${string}`;
export type TareaId = string;
/** 0 consulta · 1 prepara y una persona aprueba · 2 ejecuta dentro de topes · 3 siempre una persona. */
export type Nivel = 0 | 1 | 2 | 3;
export type Clase = "lectura" | "prepara" | "ejecuta" | "deriva";

export interface Tarea {
  id: TareaId;
  nombre: string;
  clase: Clase;
  inicial: Nivel;
  /** Lo máximo que el código permite. Un nivel guardado mayor se ignora y se registra. */
  techo: Nivel;
}

/** Un pedido de la lista: lo resuelve el código con una herramienta de lectura, sin modelo. */
export interface Frecuente {
  id: string;
  etiqueta: string;
  herramienta: string;
  /** Cupo extra que consume (además del de pedidos por persona), si lo tiene. */
  tope?: TopeId;
}

/** Un modelo de Prisma que `ctx.db` deja leer, con las relaciones que se pueden anidar en `select`. */
export interface ModeloDeLectura {
  /** campo de relación → modelo destino (también tiene que estar declarado). */
  relaciones?: Readonly<Record<string, string>>;
}

export interface Puesto {
  id: PuestoId;
  nombre: string;
  /** Módulos del rubro que el puesto necesita. Obligatorio: un puesto sin módulos no lee nada (03 §5). */
  modulos: readonly string[];
  tareas: readonly Tarea[];
  frecuentes: readonly Frecuente[];
  /** Modelos que `ctx.db` deja leer a este puesto (03 §6.1). Las tablas Agente* nunca. */
  modelos: Readonly<Record<string, ModeloDeLectura>>;
  /** ¿Entra en la tanda que se entrega? Los demás existen en el catálogo pero no reciben pedidos. */
  activo: boolean;
}

export interface Equipo {
  id: string;
  nombre: string;
  /** El rol base de sus agentes (para Administración, ADMINISTRACION). */
  rolBase: string;
  /** Módulos que hay que tener para ver el equipo. */
  modulosParaVer: readonly string[];
  puestos: readonly Puesto[];
}

// ── Topes (03 §6; catálogo en permisos-core.ts) ─────────────────────────────────────────────────

export type TopeId =
  | "pedidos_por_dia"
  | "partes_a_pedido"
  | "propuestas_por_dia"
  | "compromisos_abiertos"
  | "notas_activas"
  | "avisos_por_dia"
  | "pares_conciliacion";

// ── Identidad (03 §5) ──────────────────────────────────────────────────────────────────────────

/** El agente no tiene usuario ni sesión: su identidad es `agente:<puesto>`. */
export interface ActorAgente {
  puesto: PuestoId;
  /** "agente:administracion.cobranzas": va a `actor` del registro. */
  id: `agente:${string}`;
  rolBase: string;
  /** Módulos del puesto ya recortados por los permisos del rol base en ese negocio. */
  modulos: readonly string[];
}

/**
 * La persona que dejó el pedido, armada con SU sesión por el rubro (actor-agente.server.ts) antes de
 * `after()`. Es la segunda mitad de la intersección de §5: lo que se ve es lo que ven el agente Y
 * ella. El motor no arma nunca una vista desde un `userId` (03 §4.3, punto 3).
 */
export interface Vista {
  tenantId: string;
  userId: string;
  nombre: string;
  /** Capa 1 · módulo (para MIA, `puede(actor, modulo, "ver")`). */
  puedeVer(modulo: string): boolean;
  /** Capa 2 · proyectos visibles: "todos" o el conjunto de ids. */
  proyectos: "todos" | ReadonlySet<string>;
  /** Capa 2 · ¿ve los renglones sin proyecto (cuotas de la empresa)? */
  veSinProyecto: boolean;
  /** Capa 3 · columnas ocultas de la ficha (costoUnit, costoTotal, recargo, margen…). */
  columnasOcultas: ReadonlySet<string>;
}

/**
 * `AgentePedido.recorte` (06 C4): lo que veía la persona AL DEJAR el pedido, tomado de su `Vista`.
 * Sirve para que la ficha de la bandeja (brief 1D) respete ese recorte sin armar una persona desde
 * un `userId` (03 §5). Sólo nombres de módulo y de columna e ids de proyecto: nada de terceros.
 */
export interface RecorteGuardado {
  /** Módulos del catálogo del equipo que la persona ve. */
  modulos: string[];
  proyectos: "todos" | string[];
  veSinProyecto: boolean;
  columnasOcultas: string[];
}

// ── Contrato de herramientas (03 §4) ───────────────────────────────────────────────────────────

/** Esquema JSON de los argumentos: siempre un objeto cerrado, nunca `tenantId` ni importes a ejecutar. */
export interface EsquemaArgumentos {
  type: "object";
  properties: Readonly<Record<string, { type: "string" | "number" | "integer" | "boolean"; description?: string; enum?: readonly string[]; maxLength?: number }>>;
  required?: readonly string[];
  additionalProperties: false;
}

export interface Origen {
  /** Pantalla de donde sale: "Cobranzas · cuota 3 de Fiesta Pérez". */
  etiqueta: string;
  enlace: string;
  /** ISO de la lectura. */
  leidoEl: string;
}

export interface Cifra {
  tipo: "importe" | "fecha" | "porcentaje" | "cantidad";
  valor: number;
  moneda?: string;
  /** Como se muestra: "$ 1.234,56". */
  texto: string;
  /** Columna de la ficha a la que corresponde, si alguna (capa 3 del recorte). */
  columna?: string;
}

/** Un renglón de un resultado: lo arma el código, con su entidad, sus cifras y su origen. */
export interface Fila {
  id: string;
  entidad: string;
  entidadId: string;
  proyectoId: string | null;
  /** Cliente, evento, concepto: lo que nombra al renglón. */
  etiquetas: string[];
  cifras: Cifra[];
  origen: Origen;
}

export type MotivoFalla = "sin_permiso" | "no_existe" | "tope" | "pausado" | "invalido" | "error";

export type Resultado<D> =
  | { ok: true; datos: D; filas: Fila[] }
  | { ok: false; motivo: MotivoFalla; mensaje: string };

/** Acceso de SÓLO LECTURA al negocio (lectura.server.ts). Cada modelo expone sólo lecturas. */
export interface LecturaDeModelo {
  findMany(args?: Record<string, unknown>): Promise<unknown[]>;
  findFirst(args?: Record<string, unknown>): Promise<unknown | null>;
  count(args?: Record<string, unknown>): Promise<number>;
  aggregate(args: Record<string, unknown>): Promise<unknown>;
  groupBy(args: Record<string, unknown>): Promise<unknown[]>;
}
export type LecturaDelNegocio = Readonly<Record<string, LecturaDeModelo>>;

/** Lo que recibe `leer` (fase 1). Nunca dentro de una transacción. */
export interface Contexto {
  tenantId: string;
  puesto: PuestoId;
  actor: ActorAgente;
  humano: Vista | null;
  ahora: Date;
  db: LecturaDelNegocio;
}

/** Lo que recibe `ejecutar` (fase 3). No trae ningún cliente: adentro sólo existe `tx`. */
export interface Escritura {
  tenantId: string;
  puesto: PuestoId;
  actor: ActorAgente;
  humano: Vista | null;
  ahora: Date;
}

export interface Tarjeta {
  titulo: string;
  renglones: { etiqueta: string; valor: string }[];
}

export interface Herramienta<A = Record<string, unknown>, D = unknown> {
  nombre: string; // "cobranzas.cuotas_vencidas"
  descripcion: string; // para el modelo
  esquema: EsquemaArgumentos;
  clase: Clase;
  tarea: TareaId;
  /** Módulo del rubro que hay que poder ver (capa 1 del recorte, para el agente y para la persona). */
  modulo: string;
  leer(ctx: Contexto, a: A): Promise<Resultado<D>>;
  /**
   * Si el recorte de la persona quitó renglones o cifras, recalcula `datos` sobre lo que quedó.
   * Sin esta función y con algo recortado, el motor descarta `datos` y sigue sólo con `filas`:
   * nunca sale un total que incluya lo que la persona no ve (03 §5).
   */
  recalcular?(datos: D, filas: Fila[]): D;
  huella?(tx: Tx, tenantId: string, a: A): Promise<string | null>;
  tarjeta?(a: A, d: D): Tarjeta;
  ejecutar?(tx: Tx, e: Escritura, a: A): Promise<Resultado<unknown>>;
}

/** Las herramientas de un rubro, por nombre. Llegan al motor por parámetro. */
export type RegistroDeHerramientas = ReadonlyMap<string, Herramienta>;

// ── Proveedor de IA (03 §10) ───────────────────────────────────────────────────────────────────

export interface DefHerramienta {
  nombre: string;
  descripcion: string;
  esquema: EsquemaArgumentos;
}

export interface Llamada {
  id: string;
  herramienta: string;
  argumentos: unknown;
}

export type Mensaje =
  | { rol: "persona"; texto: string }
  | { rol: "agente"; texto: string; llamadas: Llamada[] }
  | { rol: "resultado"; llamadaId: string; contenido: string; error?: boolean };

export interface UsoDeTokens {
  entrada: number;
  salida: number;
}

export type RespuestaDelProveedor =
  | { ok: true; texto: string; llamadas: Llamada[]; uso: UsoDeTokens; corte: string; modelo?: string }
  | { ok: false; motivo: "caida" | "saturada" | "clave" | "rechazo" | "tiempo" };

export interface ProveedorIA {
  id: string;
  turno(p: { sistema: string; mensajes: Mensaje[]; herramientas: DefHerramienta[]; maxTokens: number; corte: AbortSignal }): Promise<RespuestaDelProveedor>;
}

// ── Gasto (03 §11; la implementación es gasto.server.ts, brief 1C) ──────────────────────────────

/**
 * Puerta del gasto. El motor la recibe por parámetro: `reservar` va en la MISMA transacción que la
 * vigencia, antes de cada llamada; `cerrar` vale aunque la vigencia se haya caído (es plata ya gastada).
 */
export interface PuertaDeGasto {
  reservar(tx: Tx, p: { tenantId: string; estimadoMicroUsd: number; ahora: Date }): Promise<{ ok: true; reservaId: string } | { ok: false; motivo: "sin_saldo" }>;
  cerrar(tx: Tx, p: { tenantId: string; reservaId: string; realMicroUsd: number; ahora: Date }): Promise<void>;
  /** Costo en micro-dólares: estimado (antes) y real (con el uso que devolvió el proveedor). */
  estimar(p: { modelo: string; caracteresDeEntrada: number; maxTokens: number }): number;
  costo(p: { modelo: string; uso: UsoDeTokens }): number;
}

// ── Buzón (03 §4.3) ────────────────────────────────────────────────────────────────────────────

export const ESTADOS_PEDIDO = ["RECIBIDO", "EN_CURSO", "RESPONDIDO", "NECESITA_PERSONA", "SIN_RESPONDER", "EN_BANDEJA"] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];
export type TipoPedido = "LISTA" | "LIBRE";

export const TIPOS_ACCION = [
  "LECTURA",
  "RESPUESTA",
  "VENCIDO",
  "PROPUESTA",
  "DECISION",
  "EJECUCION",
  "DERIVACION",
  "TOPE",
  "RECHAZO",
  "ERROR",
  "PAUSA",
  "LECTURA_GSG",
  "RESPUESTA_GSG",
] as const;
export type TipoAccion = (typeof TIPOS_ACCION)[number];

/** Lo que el buzón muestra y lo que cuentan las métricas: una fila de AgentePedido. */
export interface PedidoDelBuzon {
  id: string;
  puesto: string;
  userId: string;
  tipo: TipoPedido;
  frecuente: string | null;
  texto: string | null;
  estado: EstadoPedido;
  pedidoEl: Date;
  venceEl: Date;
  tomadoHasta: Date | null;
  intentos: number;
  respondidoEl: Date | null;
  respuesta: string | null;
  filas: Fila[] | null;
  motivo: string | null;
  conModelo: boolean;
  respondidoPor: string | null;
}

/** Por qué no se puede escribir: interruptor del negocio apagado o puesto en pausa (03 §12.1). */
export type MotivoSinVigencia = "apagado" | "pausado";

export type Vigencia =
  | { vigente: true; niveles: Readonly<Record<string, number>> }
  | { vigente: false; motivo: MotivoSinVigencia; pausadoPor: string | null };

/** El reloj se inyecta siempre: nada de `Date.now()` en reglas ni en tests. */
export type Reloj = () => Date;

/** Variable de la clave propia del equipo. NUNCA `ANTHROPIC_API_KEY` (03 §10). */
export const VARIABLE_CLAVE_IA = "AGENTES_ANTHROPIC_API_KEY";
