// ============================================================================
// EQUIPO DE AGENTES · catálogo del equipo de ADMINISTRACIÓN (01 §4, 02 §1, 03 §2).
// ============================================================================
// Los 5 puestos con sus tareas, niveles iniciales y techos. El nivel nunca supera el techo del código
// (permisos-core.ts). En la tanda 1 reciben pedidos Cobranzas (sólo lectura) y Coordinación (parte a
// pedido); los otros tres existen en el catálogo y entran con sus tandas (`activo: false`).
// Los nombres de herramientas los implementa el rubro (src/lib/proyectos/agentes/, brief 1B).
// Los módulos son los del rubro productora (gestion-core.ts, MODULOS): el motor no los interpreta,
// sólo los compara con los permisos que le pasa el rubro.

import type { Equipo, Puesto } from "../tipos";

const COORDINACION: Puesto = {
  id: "administracion.coordinacion",
  nombre: "Coordinación",
  modulos: ["pagos", "empresa"],
  tareas: [
    { id: "K1", nombre: "Parte del día", clase: "lectura", inicial: 2, techo: 2 },
    { id: "K2", nombre: "Avisar compromisos que vencen o vencieron", clase: "ejecuta", inicial: 2, techo: 2 },
    { id: "K3", nombre: "Informe mensual", clase: "lectura", inicial: 2, techo: 2 },
    { id: "DERIVAR", nombre: "Pasárselo a una persona", clase: "deriva", inicial: 3, techo: 3 },
  ],
  frecuentes: [{ id: "parte_del_dia", etiqueta: "Parte del día", herramienta: "coordinacion.parte_del_dia", tope: "partes_a_pedido" }],
  modelos: {},
  activo: true,
};

const COBRANZAS: Puesto = {
  id: "administracion.cobranzas",
  nombre: "Cobranzas",
  modulos: ["pagos", "empresa"],
  tareas: [
    { id: "C1", nombre: "Consultar cobros", clase: "lectura", inicial: 0, techo: 0 },
    { id: "C2", nombre: "Preparar recordatorio de cobro", clase: "prepara", inicial: 1, techo: 1 },
    { id: "C3", nombre: "Anotar una promesa de pago o un seguimiento", clase: "prepara", inicial: 1, techo: 1 },
    { id: "C4", nombre: "Marcar una cuota como cobrada", clase: "ejecuta", inicial: 3, techo: 3 },
    { id: "DERIVAR", nombre: "Pasárselo a una persona", clase: "deriva", inicial: 3, techo: 3 },
  ],
  frecuentes: [
    { id: "cobranzas_pendientes", etiqueta: "Cobranzas pendientes", herramienta: "cobranzas.resumen" },
    { id: "cuotas_vencidas", etiqueta: "Cuotas vencidas", herramienta: "cobranzas.cuotas_vencidas" },
    { id: "vencimientos_7_dias", etiqueta: "Vencimientos de los próximos 7 días", herramienta: "cobranzas.cuotas_por_vencer" },
    { id: "cuotas_de_cliente", etiqueta: "Cuotas de un cliente", herramienta: "cobranzas.cuotas_de_cliente" },
  ],
  modelos: {},
  activo: true,
};

const CUENTAS_A_PAGAR: Puesto = {
  id: "administracion.pagos",
  nombre: "Cuentas a pagar",
  modulos: ["proveedores", "empresa"],
  tareas: [
    { id: "P1", nombre: "Consultar pagos", clase: "lectura", inicial: 0, techo: 0 },
    { id: "P2", nombre: "Proponer los pagos de la semana", clase: "prepara", inicial: 1, techo: 1 },
    { id: "P3", nombre: "Avisar pagos sin factura cargada", clase: "ejecuta", inicial: 2, techo: 2 },
    { id: "P4", nombre: "Pagar o marcar pagado", clase: "ejecuta", inicial: 3, techo: 3 },
  ],
  frecuentes: [],
  modelos: {},
  activo: false,
};

const BANCOS: Puesto = {
  id: "administracion.bancos",
  nombre: "Bancos",
  modulos: ["empresa"],
  tareas: [
    { id: "B1", nombre: "Consultar movimientos sin conciliar", clase: "lectura", inicial: 0, techo: 0 },
    { id: "B2", nombre: "Proponer conciliación", clase: "prepara", inicial: 1, techo: 1 },
  ],
  frecuentes: [],
  modelos: {},
  activo: false,
};

const COMPROBANTES: Puesto = {
  id: "administracion.comprobantes",
  nombre: "Comprobantes",
  modulos: ["rendiciones"],
  tareas: [
    { id: "R1", nombre: "Revisar rendiciones enviadas", clase: "lectura", inicial: 0, techo: 0 },
    { id: "R2", nombre: "Preparar la carga de un comprobante", clase: "prepara", inicial: 1, techo: 1 },
    { id: "R3", nombre: "Aprobar o reintegrar", clase: "ejecuta", inicial: 3, techo: 3 },
  ],
  frecuentes: [],
  modelos: {},
  activo: false,
};

export const EQUIPO_ADMINISTRACION: Equipo = {
  id: "administracion",
  nombre: "Administración",
  rolBase: "ADMINISTRACION",
  modulosParaVer: ["agentes"],
  puestos: [COORDINACION, COBRANZAS, CUENTAS_A_PAGAR, BANCOS, COMPROBANTES],
};
