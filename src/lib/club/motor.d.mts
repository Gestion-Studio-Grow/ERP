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

export interface Bloqueo {
  id: string;
  /** "*" = todo el club. */
  canchaId: string;
  fecha: Fecha;
  desde: number;
  hasta: number;
  motivo: string;
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
  // Lo que todavía no consume ninguna pantalla React: se tipa cuando se porte.
  proveedores: unknown[];
  solicitudesAcceso: unknown[];
  difusiones: unknown[];
  pedidos: unknown[];
  fijos: unknown[];
  espera: unknown[];
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

// ───────────── usuarios y PIN (del piloto; en el ERP manda el login) ─────────────

export declare function puede(estado: EstadoClub, usuarioId: string, accion: string): boolean;
export declare function verificarPin(estado: EstadoClub, usuarioId: string, pin: string): Resultado<{ usuario: Usuario }>;
/** null si el PIN viene vacío. */
export declare function usuarioPorPin(estado: EstadoClub, pin: string): Resultado<{ usuario: Usuario }> | null;

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
export declare function materializarFijos(estado: EstadoClub, fecha: Fecha): unknown[];

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
