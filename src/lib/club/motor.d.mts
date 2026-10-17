// Tipos escritos a mano para la copia controlada del motor del club (src/lib/club/motor.mjs, BP-1 del plan
// docs/producto/PLAN-TERMINALES-MOSTRADOR.md §4.3).
//
// · Tipan SÓLO lo que el backoffice React va a consumir (estado, respaldo, agenda, cuenta del turno, buffet, caja y
//   crédito). Lo que no está acá no se puede importar desde TypeScript: se suma cuando una pantalla lo necesite.
// · Es `.d.mts` y no `.d.ts` a propósito: para un import que termina en `.mjs`, TypeScript busca la declaración en
//   `motor.d.mts` (con `motor.d.ts` al lado, la ignora y vuelve a inferir del JS).
// · Cada firma está verificada contra el código de motor.mjs (commit fijado en ORIGEN.json). Donde la forma no es
//   segura o no la usa ninguna pantalla todavía, el tipo es `unknown`.
// · El motor tiene un contador de ids a nivel de módulo (`secuenciaIds`): es estado de UN proceso. Se usa en el
//   navegador (client component), nunca compartido entre pedidos de un servidor.
//
// — Elaborado por GSG

// ───────────── básicos ─────────────

/** Fecha civil "AAAA-MM-DD". */
export type Fecha = string;
/** Momento: fecha + minutos desde las 00:00 de esa fecha (la madrugada del día que abrió pasa de 1440). */
export interface Ahora {
  fecha: Fecha;
  min: number;
}
/** Sello que el motor guarda en cada registro (puede no tener hora si se operó sin reloj). */
export interface Sello {
  fecha: Fecha | null;
  min: number | null;
}
/** Quién opera: el usuario del puesto y, para lo sensible, su PIN. */
export interface Auth {
  usuarioId?: string;
  pin?: string;
}

/** Toda operación devuelve `{ ok: true, … }` o `{ ok: false, motivo }` en criollo; nunca tira por una regla. */
export interface Falla {
  ok: false;
  motivo: string;
}
export type Resultado<T extends object = object> = ({ ok: true } & T) | Falla;

export type Medio = "efectivo" | "mercadopago" | "transferencia" | "debito" | "monedero";
export type EstadoReserva = "reservada" | "en_cancha" | "finalizada" | "cancelada" | "no_show" | "suspendida";
export type TipoReserva = "turno" | "fijo" | "clase" | "abierto" | "torneo";
export type Rol = "duenio" | "recepcion";

// ───────────── entidades del estado ─────────────

export interface Tarifa {
  nombre: string;
  desde: number;
  hasta: number;
  precioHora: number;
  pico?: boolean;
}

export interface Politica {
  horasCancelacionLibre: number;
  senaPct: number;
  senaSiempre: boolean;
  senaSinCliente: boolean;
  strikesParaSena: number;
  toleranciaMin: number;
  minutosAvisoSena: number;
  senaWeb: "siempre" | "nuevos" | "politica";
  turnosConfianza: number;
  minutosParaSenar: number;
  liberarSinSena: "manual" | "auto";
  unaCanchaPorHorario: boolean;
  /** null = sin límite: la cancha se abre cuando el club quiere. */
  minutosAntesParaEntrar: number | null;
}

export interface ConfigClub {
  nombre: string;
  apertura: number;
  cierre: number;
  /** Por día de la semana (0 = domingo). */
  horarios: { abre: number; cierra: number }[];
  /** Hora de corte del día de caja, en minutos (12:00 = 720). */
  corteCaja: number;
  bloqueoMin: number;
  cobro: { alias: string };
  /** Grilla de la agenda, en minutos. */
  paso: number;
  duracionTurno: number;
  feriados: Fecha[];
  tarifas: Tarifa[];
  politica: Politica;
  /** Sólo en la jornada real. */
  modo?: "real";
  configurado?: boolean;
}

export interface Cancha {
  id: string;
  nombre: string;
  cubierta: boolean;
  panoramica: boolean;
  estado: "ok" | "mantenimiento";
  motivoMantenimiento?: string;
  camara?: string;
  recargoPct?: number;
}

export interface Usuario {
  id: string;
  nombre: string;
  rol: Rol;
  /** PIN de 2 dígitos del piloto ("" = todavía no lo armó). No es credencial del ERP. */
  pin: string;
  activo: boolean;
}

export interface MovimientoCC extends Sello {
  concepto: string;
  importe: number;
  saldo: number;
}

export interface Fiado extends Sello {
  monto: number;
  novedadId: string;
  aprobo: string;
  usado: boolean;
}

export interface Cliente {
  id: string;
  nombre: string;
  tel: string;
  nivel: string;
  strikes: number;
  /** Créditos del cliente (no entran a la caja). */
  monedero: number;
  /** Cuenta corriente: lo que debe. */
  deuda: number;
  activo: boolean;
  cc: { habilitada: boolean; limite: number };
  movCC: MovimientoCC[];
  fiados: Fiado[];
  aceptaNovedades?: boolean;
}

export interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  costo: number;
  /** null = plato sin stock. */
  stock: number | null;
  minimo: number;
  codigo: string;
  codigoExterno: string;
  alquiler?: boolean;
  plato?: boolean;
  tienda?: boolean;
  activo?: boolean;
  prestados?: number;
}

export interface Jugador {
  nombre: string;
  clienteId?: string | null;
  /** Lo que pagó de la cancha. */
  pagado?: number;
  saldado?: boolean;
  /** Índice del jugador que pagó su parte. */
  pagadoPor?: number;
  /** Índice del jugador que paga su parte de la cancha. */
  aCargoDe?: number;
}

export interface PagoCancha extends Sello {
  medio: Medio;
  monto: number;
  jugador: number | null;
}

export interface Reserva {
  id: string;
  canchaId: string;
  fecha: Fecha;
  inicio: number;
  duracion: number;
  tipo: TipoReserva;
  clienteId: string | null;
  titular: string;
  origen: string;
  notas: string;
  fijoId: string | null;
  jugadores: Jugador[];
  precio: number;
  sena: { monto: number; pagada: boolean };
  pagos: PagoCancha[];
  estado: EstadoReserva;
  checkIn: Ahora | null;
  creada: Ahora | null;
  senaEnSuspenso: boolean;
  /** Código de la seña (BP-XXXX) para el concepto de la transferencia. */
  ref?: string;
  venceSena?: Ahora;
  senaVencida?: boolean;
  cierre?: Ahora | null;
  aCuentaCorriente?: number;
  devolucionPendiente?: number;
  deudaSinFicha?: number;
  faltaCobrada?: number;
  motivoCancelacion?: string;
  interrumpido?: unknown;
}

export interface ItemCuenta extends Sello {
  productoId: string | null;
  nombre: string;
  cant: number;
  /** Negativo = descuento autorizado por un dueño. */
  precioUnit: number;
  alquiler: boolean;
  plato: boolean;
  devuelto: boolean;
  manual?: boolean;
  transferidoDe?: string;
  por?: string | null;
}

export interface PagoCuenta extends Sello {
  medio: Medio;
  monto: number;
  /** Id de la cuenta que pagó (cargos «a cargo de»). */
  pagadoPor?: string;
}

/** Cuenta de cargos (buffet), separada de la cancha. */
export interface Cuenta {
  id: string;
  clienteId: string | null;
  titular: string;
  reservaId: string | null;
  jugadorIdx: number | null;
  items: ItemCuenta[];
  pagos: PagoCuenta[];
  estado: "abierta" | "cerrada";
  abierta: Sello;
  cerrada?: Sello;
  /** Id de la cuenta que paga estos cargos. */
  aCargoDe?: string;
  aCuentaCorriente?: number;
  aCuentaCorrienteDe?: string;
}

export interface MovimientoCaja extends Sello {
  id: string;
  tipo: "ingreso" | "egreso";
  medio: Medio;
  monto: number;
  concepto: string;
  reservaId: string | null;
  usuario: string | null;
  /** Día de caja (de 12 a 12) al que entró. */
  caja?: Fecha;
}

export interface CierreCaja extends Sello {
  dia: Fecha;
  responsable: string;
  esperado: number;
  contado: number;
  diferencia: number;
  ingresos: number;
  egresos: number;
}

export interface Caja {
  fondo: number;
  movimientos: MovimientoCaja[];
  cierres: CierreCaja[];
}

/** Pedido de crédito para el dueño (cuenta corriente o fiado puntual). */
export interface Novedad extends Sello {
  id: string;
  tipo: "cc" | "fiado";
  clienteId: string;
  cuentaId: string | null;
  limite: number;
  monto: number;
  nota: string;
  pidio: string;
  estado: "pendiente" | "aprobada" | "rechazada";
  intentos: number;
  bloqueadoHasta?: Sello;
  resolvio?: string;
  limiteAprobado?: number;
  porCodigo?: boolean;
}

/** Alguien nuevo pidió entrar al sistema desde el mostrador; lo otorga (o rechaza) un dueño. */
export interface SolicitudAcceso extends Sello {
  id: string;
  nombre: string;
  estado: "pendiente" | "otorgada" | "rechazada";
  /** El usuario que se creó al otorgarlo. */
  usuarioId?: string;
}

export interface Bloqueo {
  id: string;
  /** "*" = todo el club. */
  canchaId: string;
  fecha: Fecha;
  desde: number;
  hasta: number;
  motivo: string;
}

/** Turno fijo semanal: se baja a la grilla día por día (`materializarFijos`). */
export interface Fijo {
  id: string;
  clienteId: string | null;
  canchaId: string;
  /** Día de la semana (0 = domingo). */
  dia: number;
  inicio: number;
  duracion: number;
  titular: string;
  /** Fechas liberadas («esta semana no venimos»). */
  excepciones: Fecha[];
}

/** Anotado en la lista de espera: quiere cancha ese día, entre `desde` y `hasta`. */
export interface Espera {
  id: string;
  clienteId: string | null;
  titular: string;
  tel: string;
  fecha: Fecha;
  desde: number;
  hasta: number;
  duracion: number;
  soloCubierta: boolean;
  creado: Ahora | null;
}

export interface EstadoClub {
  config: ConfigClub;
  canchas: Cancha[];
  clientes: Cliente[];
  productos: Producto[];
  usuarios: Usuario[];
  reservas: Reserva[];
  cuentas: Cuenta[];
  caja: Caja;
  novedades: Novedad[];
  bloqueos: Bloqueo[];
  luces: Record<string, boolean>;
  clima: { lluvia: unknown; pronostico?: unknown };
  solicitudesAcceso: SolicitudAcceso[];
  // Lo que todavía no consume ninguna pantalla React: se tipa cuando se porte.
  proveedores: unknown[];
  difusiones: unknown[];
  pedidos: unknown[];
  fijos: Fijo[];
  espera: Espera[];
  remitos: unknown[];
  pagosProveedor: unknown[];
  contenido: unknown[];
  log: { fecha: Fecha | null; min: number | null; texto: string }[];
}

// ───────────── estado y respaldo (jornada real) ─────────────

export declare const VERSION_ESTADO: 1;

/** La foto que se guarda (FORMATO-RESPALDO.md). El app suma `usuario` y `guardado`; el motor los ignora. */
export interface FotoEstado {
  v: typeof VERSION_ESTADO;
  estado: EstadoClub;
  secuencia: number;
}

export interface DatosIniciales {
  config: ConfigClub;
  canchas: readonly Cancha[];
  /** Lo que falte de cada ficha lo completa el motor (nivel, strikes, monedero, deuda, cc…). */
  clientes?: readonly (Pick<Cliente, "id" | "nombre"> & Partial<Cliente>)[];
  productos?: readonly Producto[];
  usuarios?: readonly Usuario[];
  proveedores?: readonly unknown[];
}

export declare function crearEstado(datos: DatosIniciales): EstadoClub;
/** Club en blanco para la jornada real (reinicia el contador de ids). */
export declare function crearClubReal(hoy: Fecha): EstadoClub;
/** Club con vida para la demo (reinicia el contador de ids). `ahoraMin` por defecto 19:10. */
export declare function generarDemo(hoy: Fecha, ahoraMin?: number): EstadoClub;
export declare function serializarEstado(estado: EstadoClub): FotoEstado;
/** Valida el sobre v1 y rearma el estado. Nunca tira: si la foto no sirve, dice por qué. */
export declare function hidratarEstado(foto: unknown): Resultado<{ estado: EstadoClub }>;
export declare function secuenciaIds(): number;
export declare function retomarSecuencia(n: number): void;
export declare function prefijoIds(prefijo?: string): void;

// ───────────── constantes ─────────────

export declare const MEDIOS: Readonly<Record<Medio, string>>;
export declare const ESTADOS: Readonly<Record<EstadoReserva, string>>;
export declare const TIPOS: Readonly<Record<TipoReserva, string>>;
export declare const ROLES: Readonly<Record<Rol, string>>;
export declare const PERMISOS: Readonly<Record<Rol, readonly string[]>>;
export declare const NOMBRE_DIA: readonly string[];
export declare const CONFIG_DEMO: Readonly<ConfigClub>;
export declare const CANCHAS_DEMO: readonly Cancha[];
export declare const USUARIOS_DEMO: readonly Usuario[];
export declare const USUARIOS_REALES: readonly Usuario[];
export declare const PRODUCTOS_DEMO: readonly Producto[];
export declare const PROVEEDORES_DEMO: readonly unknown[];

// ───────────── utilidades ─────────────

export declare function hhmm(min: number): string;
export declare function aMinutos(texto: string): number;
/** 0 = domingo … 6 = sábado. */
export declare function diaSemana(fecha: Fecha): number;
export declare function sumarDias(fecha: Fecha, dias: number): Fecha;
export declare function minutosHasta(ahora: Ahora, fecha: Fecha, min: number): number;
export declare function pesos(n: number): string;
/** Divide en partes que suman exacto. */
export declare function dividir(total: number, n: number): number[];

// ───────────── búsquedas ─────────────

export declare function cancha(estado: EstadoClub, id: string): Cancha | undefined;
export declare function cliente(estado: EstadoClub, id: string): Cliente | undefined;
export declare function reserva(estado: EstadoClub, id: string): Reserva | undefined;
export declare function producto(estado: EstadoClub, id: string): Producto | undefined;
export declare function cuenta(estado: EstadoClub, id: string): Cuenta | undefined;
export declare function usuario(estado: EstadoClub, id: string): Usuario | undefined;
export declare function buscarClientes(estado: EstadoClub, texto: string, opciones?: { inactivos?: boolean }): Cliente[];
export declare function buscarProductos(estado: EstadoClub, texto: string, opciones?: { soloVendibles?: boolean }): Producto[];
/** Lo que manda el lector (código interno o de fábrica, sin distinguir mayúsculas). */
export declare function productoPorCodigo(estado: EstadoClub, codigo: string): Resultado<{ producto: Producto }>;
export declare function altaCliente(estado: EstadoClub, datos: { nombre: string; tel?: string; nivel?: string }, ahora?: Ahora): Resultado<{ cliente: Cliente }>;
/** Lo que no viene (undefined) no se toca; el nombre no puede quedar vacío. */
export declare function editarCliente(estado: EstadoClub, clienteId: string, datos: { nombre?: string; tel?: string; nivel?: string }, ahora?: Ahora): Resultado<{ cliente: Cliente }>;
/** Sólo sin deuda ni cargos abiertos en el buffet. La ficha queda (inactiva), con su historia. */
export declare function bajaCliente(estado: EstadoClub, clienteId: string, ahora?: Ahora): Resultado;
/** El cliente pidió no recibir más novedades (`volver: true` lo vuelve a anotar). */
export declare function bajaNovedades(estado: EstadoClub, clienteId: string, ahora?: Ahora, volver?: boolean): Resultado;

// ───────────── usuarios y PIN (del piloto; en el ERP manda el login) ─────────────

export declare function puede(estado: EstadoClub, usuarioId: string, accion: string): boolean;
export declare function verificarPin(estado: EstadoClub, usuarioId: string, pin: string): Resultado<{ usuario: Usuario }>;
/** null si el PIN viene vacío. */
export declare function usuarioPorPin(estado: EstadoClub, pin: string): Resultado<{ usuario: Usuario }> | null;
/** Alguien nuevo pide acceso desde el mostrador: queda pendiente hasta que un dueño lo otorgue. */
export declare function solicitarAcceso(estado: EstadoClub, nombre: string, ahora?: Ahora): Resultado<{ solicitud: SolicitudAcceso }>;
/** Un dueño (con su PIN) otorga el acceso: el motor genera un PIN de 2 dígitos que se muestra UNA vez. */
export declare function otorgarAcceso(estado: EstadoClub, solicitudId: string, datos: { rol: Rol }, auth: Auth, ahora?: Ahora): Resultado<{ usuario: Usuario; pin: string }>;
export declare function rechazarAcceso(estado: EstadoClub, solicitudId: string, auth: Auth, ahora?: Ahora): Resultado;

// ───────────── agenda de canchas ─────────────

export interface Hueco {
  canchaId: string;
  fecha: Fecha;
  inicio: number;
  duracion: number;
}

export interface DatosReserva {
  canchaId: string;
  fecha: Fecha;
  inicio: number;
  duracion?: number;
  tipo?: TipoReserva;
  clienteId?: string | null;
  titular?: string;
  /** Hasta 4: el nombre solo o el jugador con su ficha. */
  jugadores?: (string | Jugador)[];
  origen?: string;
  notas?: string;
  fijoId?: string | null;
  precio?: number;
  conSena?: boolean;
  plazoSenaMin?: number;
}

export declare function horarioDe(estado: EstadoClub, fecha: Fecha): { abre: number; cierra: number };
export declare function precioTurno(estado: EstadoClub, hueco: Hueco): number;
export declare function franjaDe(estado: EstadoClub, fecha: Fecha, min: number): "pico" | "valle";
/** ¿Este turno pide seña? Reincidentes, clientes con deuda y turnos sin ficha (clases y fijos no). */
export declare function requiereSena(estado: EstadoClub, clienteId: string | null | undefined, tipo: TipoReserva): boolean;
export declare function ocupantes(estado: EstadoClub, fecha: Fecha, canchaId: string, ignorarId?: string): { reservas: Reserva[]; bloqueos: Bloqueo[] };
export declare function validarHueco(estado: EstadoClub, hueco: Hueco, ignorarId?: string): Resultado;
/** Inicios libres (minutos) alineados a la grilla. */
export declare function huecosLibres(estado: EstadoClub, fecha: Fecha, canchaId: string, duracion: number, desde?: number): number[];
export declare function crearReserva(estado: EstadoClub, datos: DatosReserva, ahora?: Ahora): Resultado<{ reserva: Reserva; liberadas: { cliente: string; monto: number }[] }>;
/** Abre la cancha (empieza el juego). */
export declare function checkIn(estado: EstadoClub, id: string, ahora?: Ahora): Resultado;
/** Cierra la CANCHA; los cargos del buffet siguen abiertos. */
export declare function finalizar(estado: EstadoClub, id: string, opciones?: { aCuenta?: boolean }, ahora?: Ahora): Resultado<{ cuentasAbiertas: Cuenta[] }> | (Falla & { saldo?: number });
export declare function marcarNoShow(
  estado: EstadoClub,
  id: string,
  opciones?: { cobrarA?: "titular" | "grupo" | "nadie"; auth?: Auth | null },
  ahora?: Ahora,
): Resultado<{ cargos: { nombre: string; monto: number; sinFicha?: boolean }[]; ofertas: unknown[] }>;
export declare function cancelar(
  estado: EstadoClub,
  id: string,
  opciones?: { porClub?: boolean; motivo?: string },
  ahora?: Ahora,
): Resultado<{ aTiempo: boolean; devuelto: number; devolverEnMano: number; enSuspenso: boolean; ofertas: unknown[] }>;
export declare function mover(estado: EstadoClub, id: string, destino: { canchaId?: string; inicio?: number }, ahora?: Ahora): Resultado;
export declare function extender(estado: EstadoClub, id: string, minutos: number, ahora?: Ahora): Resultado<{ extra: number }>;
export declare function bloquear(
  estado: EstadoClub,
  bloqueo: { canchaId: string; fecha: Fecha; desde: number; hasta: number; motivo: string },
  ahora?: Ahora,
): Resultado<{ bloqueo: Bloqueo }> | (Falla & { choques?: Reserva[] });
export declare function quitarBloqueo(estado: EstadoClub, bloqueoId: string, ahora?: Ahora): Resultado;
/** Baja a la grilla los turnos fijos del día (idempotente); devuelve los que chocan. */
export declare function materializarFijos(estado: EstadoClub, fecha: Fecha): { fijo: Fijo; motivo: string }[];
/** Corte de luz, lesión, lluvia en juego: crédito sólo por el tiempo no jugado (lo pagado de más, a créditos o a devolver). */
export declare function interrumpir(estado: EstadoClub, id: string, motivo: string, ahora: Ahora): Resultado<{ credito: number; noJugados: number }>;
/** Lo que hay que devolver en mano a alguien sin ficha: sale de la caja. */
export declare function marcarDevuelto(estado: EstadoClub, reservaId: string, medio: Medio, ahora?: Ahora): Resultado<{ monto: number }>;
/** La falta de alguien sin ficha, cuando vuelve y paga: entra a la caja. */
export declare function cobrarFaltaSinFicha(estado: EstadoClub, reservaId: string, medio: Medio, ahora?: Ahora): Resultado<{ monto: number }>;
export declare function configurarMantenimiento(estado: EstadoClub, canchaId: string, opciones: { activo: boolean; motivo?: string }, ahora?: Ahora): Resultado;
export interface ResultadoLluvia {
  reservaId: string;
  titular: string;
  accion: "movido" | "cortado" | "suspendido";
  cancha?: string;
  credito?: number;
  noJugados?: number;
  devolverEnMano?: number;
}
/** Mueve a techada lo que se pueda; si no, corta (jugando) o suspende (antes de empezar) devolviendo lo pagado. */
export declare function planLluvia(estado: EstadoClub, fecha: Fecha, desde: number, hasta: number, ahora: Ahora): { ok: true; resultado: ResultadoLluvia[] };
/** No valida el hueco: lo valida quien lo llama (y `materializarFijos`, que no pisa). */
export declare function crearFijo(estado: EstadoClub, datos: { clienteId: string | null; canchaId: string; dia: number; inicio: number; duracion?: number; titular?: string }): Fijo;
/** «Esta semana no venimos»: libera esa fecha sin dar de baja el fijo (y cancela el turno si ya estaba en la grilla). */
export declare function liberarFijo(estado: EstadoClub, fijoId: string, fecha: Fecha, ahora?: Ahora): Resultado;
export declare function anotarEspera(
  estado: EstadoClub,
  datos: { clienteId: string | null; titular: string; tel?: string; fecha: Fecha; desde: number; hasta: number; duracion?: number; soloCubierta?: boolean },
  ahora?: Ahora,
): Espera;
export declare function ofertasEspera(estado: EstadoClub, fecha: Fecha, canchaId: string, inicio: number, duracion: number): (Espera & { canchaId: string; inicio: number; mensaje: string })[];
export declare function asignarDesdeEspera(
  estado: EstadoClub,
  esperaId: string,
  hueco: { canchaId: string; inicio: number },
  ahora?: Ahora,
): Resultado<{ reserva: Reserva; liberadas: { cliente: string; monto: number }[] }>;

// ───────────── la cancha: cobros y partes por jugador ─────────────

export interface ParteCancha {
  propia: number;
  aPagar: number;
  aCargoDe: number | null;
  pago: boolean;
}

export declare function cobrado(r: Reserva): number;
export declare function totalReserva(r: Reserva): number;
export declare function saldo(r: Reserva): number;
export declare function registrarPago(
  estado: EstadoClub,
  reservaId: string,
  pago: { medio: Medio; monto: number; jugador?: number | null; concepto?: string; auth?: Auth | null },
  ahora?: Ahora,
): Resultado<{ saldo: number }>;
export declare function partesCancha(r: Reserva): ParteCancha[];
/** La parte de cancha de `deIdx` pasa a cargo de `aIdx` (null: vuelve a pagar la suya). */
export declare function asignarCargoCancha(estado: EstadoClub, reservaId: string, deIdx: number, aIdx: number | null, ahora?: Ahora): Resultado;
export declare function cobrarParte(
  estado: EstadoClub,
  reservaId: string,
  idx: number,
  opciones: { medio: Medio; auth?: Auth | null },
  ahora?: Ahora,
): Resultado<{ saldo: number; monto: number; cubiertos: string[] }>;

// ───────────── cuentas de cargos (buffet) ─────────────

export declare function totalCuenta(c: Cuenta): number;
export declare function cobradoCuenta(c: Cuenta): number;
export declare function saldoCuenta(c: Cuenta): number;
export declare function abrirCuenta(
  estado: EstadoClub,
  datos: { clienteId?: string | null; titular?: string; reservaId?: string | null; jugadorIdx?: number | null },
  ahora?: Ahora,
): Resultado<{ cuenta: Cuenta; reusada?: true }>;
export declare function cargarEnCuenta(estado: EstadoClub, cuentaId: string, productoId: string, cant?: number, ahora?: Ahora): Resultado<{ item: ItemCuenta; cuenta: Cuenta }>;
export declare function pagarCuenta(estado: EstadoClub, cuentaId: string, pago: { medio: Medio; monto?: number }, ahora?: Ahora): Resultado<{ saldo: number }>;
/** Producto para un jugador del turno: a su cuenta (`cuenta`) o cobrado en el acto (`cobrar`). */
export declare function consumoJugador(
  estado: EstadoClub,
  reservaId: string,
  jugadorIdx: number,
  productoId: string,
  cant: number,
  opciones?: { modo?: "cuenta" | "cobrar"; medio?: Medio },
  ahora?: Ahora,
): Resultado<{ cuenta: Cuenta }>;
export declare function ajustarCargo(estado: EstadoClub, cuentaId: string, itemIdx: number, delta: number, ahora?: Ahora, auth?: Auth | null): Resultado<{ cuenta: Cuenta }>;
export declare function transferirCargo(estado: EstadoClub, deCuentaId: string, itemIdx: number, aCuentaId: string, cant?: number | null, ahora?: Ahora, auth?: Auth | null): Resultado;
/** Monto negativo = descuento: sólo un dueño con su PIN. */
export declare function cargoManual(estado: EstadoClub, cuentaId: string, cargo: { concepto: string; monto: number }, auth: Auth, ahora?: Ahora): Resultado<{ item: ItemCuenta }>;
/** Cobrada (saldo cero) o, con `aCuenta`, el saldo a la cuenta corriente del cliente. */
export declare function cerrarCuenta(estado: EstadoClub, cuentaId: string, opciones?: { aCuenta?: boolean }, ahora?: Ahora): Resultado;
export declare function cuentasAbiertas(estado: EstadoClub): Cuenta[];
/** Venta rápida sin cuenta: se carga, se cobra y se cierra en el acto (sin monedero). */
export declare function ventaMostrador(estado: EstadoClub, items: { productoId: string; cant: number }[], medio: Medio, ahora?: Ahora): Resultado<{ total: number }>;

// ───────────── la cuenta del turno: cancha + cargos en un solo lugar ─────────────

export interface JugadorDelTurno {
  idx: number;
  nombre: string;
  clienteId: string | null;
  cancha: ParteCancha;
  cuenta: Cuenta | null;
  cargos: {
    total: number;
    saldo: number;
    aCargoDe: string | null;
    aCargoDeNombre: string | null;
    deOtros: number;
    aSuCargo: string[];
  };
  aPagar: number;
}

export interface CuentaDelTurno {
  reserva: Reserva;
  abierto: boolean;
  jugadores: JugadorDelTurno[];
  mesa: Cuenta[];
  deOtraMesa: { titular: string; saldo: number; paga: string }[];
  totales: { cancha: number; cargos: number; pendiente: number; totalCargos: number };
  /** La cancha ya se cerró pero la mesa sigue cargando. */
  mesaAbierta: boolean;
}

export declare function cuentaDeJugador(estado: EstadoClub, r: Reserva | null | undefined, idx: number): Cuenta | null;
/** Los cargos de una cuenta pasan a cargo de otra (null: vuelve a pagar los suyos). */
export declare function asignarCargoCargos(estado: EstadoClub, cuentaId: string, aCuentaId: string | null, ahora?: Ahora): Resultado;
export declare function cuentaDelTurno(estado: EstadoClub, reservaId: string): Resultado<CuentaDelTurno>;
export declare function cobrarCuentaYSusCargos(
  estado: EstadoClub,
  cuentaId: string,
  opciones: { medio: Medio; auth?: Auth | null },
  ahora?: Ahora,
): Resultado<{ monto: number; cubiertas: string[] }>;
export declare function cobrarJugador(
  estado: EstadoClub,
  reservaId: string,
  idx: number,
  opciones: { medio: Medio; auth?: Auth | null },
  ahora?: Ahora,
): Resultado<{ cancha: number; cargos: number; total: number; cubiertos: string[] }> | (Falla & { cancha?: number });
/** Todo el turno con un medio (sin monedero: con créditos se cobra jugador por jugador). */
export declare function cobrarTodoElTurno(
  estado: EstadoClub,
  reservaId: string,
  opciones: { medio: Medio; auth?: Auth | null },
  ahora?: Ahora,
): Resultado<{ cancha: number; cargos: number; total: number }> | (Falla & { cobrado?: number });
/** Cobra lo que falte de la cancha y la cierra; la mesa sigue cargando. */
export declare function cerrarCanchaYSeguir(
  estado: EstadoClub,
  reservaId: string,
  opciones?: { medio?: Medio; auth?: Auth | null },
  ahora?: Ahora,
): Resultado<{ cobradoCancha: number; cuentasAbiertas: Cuenta[] }>;
export declare function cerrarCargosDelTurno(
  estado: EstadoClub,
  reservaId: string,
  opciones?: { medio?: Medio; auth?: Auth | null; aCuenta?: boolean },
  ahora?: Ahora,
): Resultado<{ cobrado: number; aCuentaCorriente: number; cerradas: number }>;
export declare function mesasAbiertas(estado: EstadoClub): { reserva: Reserva; cuentas: Cuenta[]; saldo: number }[];

// ───────────── caja (de 12 a 12) ─────────────

export interface ResumenCaja {
  dia: Fecha | null | undefined;
  porMedio: Record<string, number>;
  ingresos: number;
  egresos: number;
  neto: number;
  efectivoEsperado: number;
  movimientos: number;
  lista: MovimientoCaja[];
}

export declare function diaDeCaja(estado: EstadoClub, fecha: Fecha, min: number): Fecha;
export declare function cajaCerrada(estado: EstadoClub, dia: Fecha): boolean;
/** La caja donde entra lo que se cobra ahora (si la del día ya se cerró, la siguiente). */
export declare function cajaAbierta(estado: EstadoClub, ahora: Ahora): Fecha;
/** Sin `dia`: todos los movimientos. */
export declare function resumenCaja(estado: EstadoClub, dia?: Fecha | null): ResumenCaja;
export declare function cajasSinCerrar(estado: EstadoClub, ahora: Ahora): Fecha[];
/** Toda caja con movimientos que nadie cerró (también la de hoy y la siguiente, si hoy ya se cerró), ordenadas. */
export declare function cajasConMovimientosSinCerrar(estado: EstadoClub): Fecha[];
export declare function cerrarCaja(
  estado: EstadoClub,
  datos: { contado: number | string | null; usuarioId?: string; pin?: string; dia?: Fecha | null },
  ahora: Ahora,
): Resultado<{ cierre: CierreCaja }>;
export declare function egresoCaja(estado: EstadoClub, datos: { monto: number; concepto: string; usuarioId?: string; pin?: string }, ahora?: Ahora): Resultado;

// ───────────── crédito: cuenta corriente y fiado con código del dueño ─────────────

export interface DatosAprobacion {
  id: string;
  /** clienteId */
  c: string;
  /** nombre del cliente */
  n: string;
  /** monto */
  m: number;
  /** tipo */
  t: "cc" | "fiado";
  /** quién pidió */
  p: string;
  /** fecha del pedido */
  f: string;
}

export declare function puedeACuenta(c: Cliente | null | undefined, importe: number): Resultado<{ fiado?: Fiado }>;
export declare function solicitarCredito(
  estado: EstadoClub,
  pedido: { clienteId: string; tipo?: "cc" | "fiado"; monto: number; cuentaId?: string | null; nota?: string },
  auth: Auth,
  ahora?: Ahora,
): Resultado<{ novedad: Novedad }>;
export declare function resolverCredito(
  estado: EstadoClub,
  novedadId: string,
  decision: { aprobar: boolean; monto?: number; limite?: number },
  auth: Auth,
  ahora?: Ahora,
): Resultado;
/** Código de 6 letras (ABC-DEF) que calcula el celular del dueño con su PIN y los datos del pedido. */
export declare function codigoAprobacion(datos: { pin: string; novedadId: string; clienteId: string; monto: number; fecha?: string | null }): string;
/** Recepción tipea el código del dueño; 5 mal traban el pedido 30 minutos. */
export declare function aprobarPorCodigo(
  estado: EstadoClub,
  novedadId: string,
  datos: { codigo: string; monto?: number },
  auth: Auth,
  ahora: Ahora,
): Resultado<{ aprobo: string; monto: number }>;
export declare function datosAprobacion(estado: EstadoClub, novedadId: string): DatosAprobacion | null;
/** El cliente paga su cuenta corriente (todo o una parte; sin monedero). */
export declare function cobrarDeuda(estado: EstadoClub, clienteId: string, pago?: { medio?: Medio; monto?: number }, ahora?: Ahora): Resultado<{ monto: number; saldo: number }>;
/** Atajo de recepción: pedir al dueño que habilite la cuenta corriente hasta `limite`. */
export declare function solicitarCC(estado: EstadoClub, clienteId: string, pedido: { limite: number; nota?: string }, auth: Auth, ahora?: Ahora): Resultado<{ novedad: Novedad }>;
/** El dueño habilita, cambia el límite o corta la cuenta corriente sin pedido de por medio. */
export declare function configurarCC(estado: EstadoClub, clienteId: string, datos: { habilitada: boolean; limite?: number }, auth: Auth, ahora?: Ahora): Resultado;
/** Los movimientos de la cuenta corriente, del más viejo al más nuevo, con el saldo corrido. */
export declare function estadoDeCuenta(
  estado: EstadoClub,
  clienteId: string,
): Resultado<{ movimientos: MovimientoCC[]; saldo: number; cc: { habilitada: boolean; limite: number }; creditos: number }>;

// ───────────── tablero del dueño ─────────────

export interface Kpis {
  /** 0..1 */
  ocupacion: number;
  ocupacionValle: number;
  ocupacionPico: number;
  turnos: number;
  vendido: number;
  cobrado: number;
  porCobrar: number;
  ticketPromedio: number;
  buffet: number;
  cuentasAbiertas: number;
  cuentasAbiertasSaldo: number;
  faltas: number;
  cancelados: number;
  /** La caja abierta ahora (la misma que muestra Caja). */
  caja: ResumenCaja;
  stockValorizado: number;
  deudaClientes: number;
  creditos: number;
  deudaProveedores: number;
}

export declare function kpis(estado: EstadoClub, fecha: Fecha, ahora?: Ahora): Kpis;
/** Ocupación día × hora (0..1). `horas` en minutos, cada 60, del que abre más temprano al que cierra más tarde. */
export declare function mapaDeCalor(estado: EstadoClub, fechas: Fecha[]): { horas: number[]; filas: { fecha: Fecha; valores: number[] }[] };
export interface FilaPlato {
  productoId: string;
  plato: string;
  unidades: number;
  facturado: number;
  costo: number;
  margen: number;
  porDia: number;
  /** 0..1 del total facturado en cocina. */
  participacion: number;
}
export declare function metricasPlatos(estado: EstadoClub, rango: { desde?: Fecha; hasta?: Fecha }): { filas: FilaPlato[]; total: number; dias: number };

// ───────────── WhatsApp ─────────────

export type TipoMensajeWhatsApp =
  | "confirmacion"
  | "recordatorio"
  | "espera"
  | "lluvia_movido"
  | "lluvia_suspendido"
  | "lluvia_devolucion"
  | "falta"
  | "deuda"
  | "aprobacion"
  | "aprobado"
  | "pedidoTienda"
  | "pedidoListo"
  | "reposicion";
/** El texto listo para mandar (cada tipo usa sus datos: `deuda` pide `nombre` y `monto`). */
export declare function mensajeWhatsApp(tipo: TipoMensajeWhatsApp, datos: Record<string, string | number | boolean | null | undefined>): string;
/** `https://wa.me/<número>?text=…`; sin número, WhatsApp abre para elegir el chat. */
export declare function linkWhatsApp(tel: string, texto: string): string;

// ═══════════════ Ola 1 de paridad — un bloque por frente (agentes en paralelo: cada uno escribe SÓLO en el suyo) ═══════════════

// ── ola 1 · cuenta y buffet ──

/**
 * Suma un jugador al turno (hasta 4): por nombre o, con `clienteId`, con su ficha (el nombre sale de la ficha). No
 * mira si la cancha sigue abierta ni si la ficha ya juega: eso lo decide quien llama (cuenta-core.ts).
 */
export declare function sumarJugador(estado: EstadoClub, reservaId: string, nombre: string | null, clienteId?: string | null): Resultado;

// ── ola 1 · agenda y tienda ──

// · La bandeja «Para resolver ahora» (motor.mjs `alertas`).
export type NivelAlerta = "alta" | "media" | "info";
export type TipoAlerta =
  | "sena"
  | "no_show"
  | "llega"
  | "cerrar"
  | "termina"
  | "devolucion"
  | "falta_sin_ficha"
  | "luz"
  | "mantenimiento"
  | "lluvia"
  | "espera"
  | "stock"
  | "autorizacion"
  | "pedido"
  | "acceso";
/** Lo que hay que resolver: el texto, el botón (`accion`) y a qué se refiere (según el tipo, uno o dos de los ids). */
export interface Alerta {
  nivel: NivelAlerta;
  tipo: TipoAlerta;
  texto: string;
  accion: string;
  reservaId?: string;
  canchaId?: string;
  esperaId?: string;
  /** Con `espera`: el primer hueco libre que le sirve. */
  inicio?: number;
  productoId?: string;
  novedadId?: string;
  pedidoId?: string;
  solicitudId?: string;
  /** Sólo lo resuelve un dueño (autorizaciones, accesos). */
  paraDuenio?: true;
}
/** Lo que hay que resolver AHORA, de lo más urgente a lo menos (alta → media → info; dentro del nivel, en el orden en que se arma). */
export declare function alertas(estado: EstadoClub, ahora: Ahora): Alerta[];

// · Pedidos de la tienda (se encargan por la web o WhatsApp, se retiran y se pagan en el club).
export type EstadoPedidoTienda = "pendiente" | "entregado" | "a_cuenta" | "cancelado";
export interface LineaPedidoTienda {
  productoId: string;
  nombre: string;
  cant: number;
  precioUnit: number;
}
export interface PedidoTienda extends Sello {
  id: string;
  /** «T-ABCD»: el que viaja en el mensaje de WhatsApp. */
  codigo: string;
  items: LineaPedidoTienda[];
  total: number;
  nombre: string;
  tel: string;
  /** "web" | "whatsapp". */
  origen: string;
  estado: EstadoPedidoTienda;
  /** Al entregarlo: cómo y cuánto se cobró (al precio de ese día). */
  cobrado?: Sello & { medio: Medio; monto: number };
  /** Al pasarlo a la cuenta de un cliente: la cuenta de cargos donde quedó. */
  cuentaId?: string;
}
/** Lo que se ve en la tienda: productos marcados para la tienda, activos y con stock. Sin costos ni códigos. */
export declare function catalogoTienda(estado: EstadoClub): { id: string; nombre: string; categoria: string; precio: number; pocas: boolean }[];
/** El encargo: no descuenta stock ni mueve caja (eso pasa al entregar). Devuelve el mensaje de WhatsApp del cliente. */
export declare function crearPedidoTienda(
  estado: EstadoClub,
  datos: { items: { productoId: string; cant: number }[]; nombre: string; tel?: string; origen?: string },
  ahora?: Ahora,
): Resultado<{ pedido: PedidoTienda; mensaje: string }>;
/** El club pega el mensaje que mandó el cliente: se leen productos, nombre y código, y queda pendiente. */
export declare function pedidoDesdeWhatsApp(estado: EstadoClub, texto: string, ahora?: Ahora): Resultado<{ pedido: PedidoTienda; mensaje: string }>;
export declare function pedidosPendientes(estado: EstadoClub): PedidoTienda[];
/** Se entrega y se cobra en el mostrador (sin créditos): descuenta stock y entra a la caja, al precio de hoy. */
export declare function entregarPedido(estado: EstadoClub, pedidoId: string, opciones: { medio: Medio; auth?: Auth | null }, ahora?: Ahora): Resultado<{ total: number }>;
/** Se lo lleva y queda en la cuenta de cargos del cliente (descuenta stock; no entra a la caja). */
export declare function cargarPedidoACuenta(estado: EstadoClub, pedidoId: string, clienteId: string, ahora?: Ahora): Resultado<{ cuenta: Cuenta }>;
export declare function cancelarPedido(estado: EstadoClub, pedidoId: string, ahora?: Ahora): Resultado;

// ── ola 1 · caja y whatsapp ──

/** El cambio que queda en el cajón al abrir (fondo de caja). Lo carga quien puede `configurar` (un dueño), sin PIN. */
export declare function ajustarFondo(estado: EstadoClub, monto: number | string | null, auth: Auth, ahora?: Ahora): Resultado;
