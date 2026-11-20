/**
 * A1 de DIR-007 (GSG-MIA-091) · LA matriz de permisos de Proyectos y Administración, en un solo archivo: qué pide cada ruta y
 * cada acción (este archivo) y qué tiene cada rol (`matrizDePermisos`, `gestion-core.ts`). `matriz-permisos.test.ts` la recorre
 * entera: lee el código de cada página y cada acción y exige que la puerta escrita acá sea la que el código pide, que no haya
 * una ruta o una acción sin anotar y que nadie llame a `requireCapabilityFueraDeLaAgenda` suelto. Después cruza cada rol con
 * cada ruta y cada acción. PURA.
 *
 * Cómo se lee una puerta: términos separados por un espacio, hacen falta TODOS; dentro de un término, «a|b» = alcanza uno.
 * - `E:m` editar el módulo m · `V:m` verlo.
 * - `PLATA:ver|editar` `exigirPlataDeDireccion`: el módulo `direccion` (pregunta 2-A, confirmada por el dueño el 18/11) y,
 *   además, el techo del rol ERP (`agenda:manage`), que está fuera de esta matriz.
 * - `DIR` el rol Dirección · `SOLO:<rol>` sólo ese rol (`soloRol`, MIA-50 T10) · `MATRIZ` `cambiaLosPermisos` (pregunta 1-A, confirmada por el dueño el 18/11).
 * - `REND:rendir|revisar` `motivoSinRendiciones` y el rol que rinde o revisa · `ROL:aprueba` Dirección o Administración, nunca lo propio.
 * - `SESION — motivo` cualquiera con sesión: sobre lo suyo, o la regla está adentro (el motivo dice cuál).
 * - `LINK — motivo` sin sesión: el cliente, por un link con clave.
 * Además de la puerta, todo lo que cuelga de un proyecto pide que el actor lo vea (`proyectoVisible`): eso no es del rol.
 *
 * MIA-50 T11 (Adenda 2, C-CF2): las apps del ERP Cuentas a cobrar, Cuentas a pagar y Flujo de fondos, con el panel de Proyectos
 * cerrado, piden además el módulo «Empresa» del rol de Proyectos (`exigirPuertaDeGestion` en cada página, `sinPuertaDeGestion` en
 * cada acción). Van acá con la clave `/admin/…` (rutas) y `<app>/actions#…` (acciones). La matriz modela sólo esa puerta: el rol
 * del ERP (`billing:manage`, `reports:read`) y el panel cerrado (`panelCerrado.apps`) están fuera de ella, igual que `PLATA`.
 */
import { cambiaLosPermisos, matrizDePermisos, motivoSinRendiciones, permisoDe, puedeAprobarRendicion, puedeRendir, revisaRendiciones, ROLES_GESTION, type ModuloGestion, type RolGestion } from "./gestion-core";

type Guardados = Parameters<typeof matrizDePermisos>[0];

/** Cada acción de servidor de Proyectos («archivo#acción», en `src/lib/proyectos/`). */
export const PUERTAS_DE_ACCIONES: Readonly<Record<string, string>> = {
  "acciones-consultas#pedirBorradorConsulta": "E:ia E:pipeline",
  "acciones-consultas#responderConsulta": "E:pipeline",
  "acciones-consultas#aprobarBorrador": "E:pipeline",
  "acciones-consultas#descartarBorrador": "E:pipeline",
  "acciones-consultas#cambiarEstadoConsulta": "E:pipeline",
  "acciones-consultas#convertirEnLead": "E:pipeline",
  "acciones-consultas#registrarRespuestaExterna": "E:pipeline",
  "acciones-diseno#guardarTareaDiseno": "E:diseno",
  "acciones-diseno#moverTareaDiseno": "E:diseno",
  "acciones-diseno#subirVersionDiseno": "E:diseno",
  "acciones-diseno#comentarVersion": "E:diseno",
  "acciones-diseno#resolverComentario": "E:diseno",
  "acciones-diseno#revisarVersion": "E:diseno",
  "acciones-diseno#guardarIdea": "E:diseno",
  "acciones-diseno#proponerIdea": "E:diseno E:ia",
  "acciones-diseno#armarStandConIA": "E:diseno E:ia",
  "acciones-diseno#armarStandsConIA": "E:diseno E:ia",
  "acciones-diseno#alternarImagenIdea": "E:diseno",
  "acciones-diseno#eliminarImagenDelProyecto": "E:diseno",
  "acciones-diseno#agregarMoodboard": "E:diseno",
  "acciones-diseno#quitarMoodboard": "E:diseno",
  "acciones-diseno#generarEnEstudio": "E:diseno E:ia",
  "acciones-diseno#subirAlEstudio": "E:diseno",
  "acciones-diseno#generarPresentacion": "E:diseno",
  "acciones-diseno#enviarPresentacion": "E:diseno",
  "acciones-diseno#registrarRespuestaPresentacion": "E:diseno",
  "acciones-diseno#enviarMensajeChat": "SESION — el chat decide adentro (`accesoChat`: canales del proyecto según el rol)",
  "acciones-diseno#conversarConAgente": "V:ia",
  "acciones-diseno#proponerPiezas": "E:diseno E:ia",
  "acciones-diseno#crearPiezasPropuestas": "E:diseno",
  "acciones-empresa#crearPagoEmpresa": "E:empresa",
  "acciones-empresa#cuentasParaMarcar": "E:empresa",
  "acciones-empresa#marcarCuotaEmpresa": "E:empresa",
  "acciones-empresa#anularCuotaEmpresa": "E:empresa",
  "acciones-empresa#guardarDatoCuota": "E:empresa",
  "acciones-empresa#crearCuenta": "E:empresa",
  "acciones-empresa#guardarSaldo": "E:empresa",
  "acciones-empresa#importarExtracto": "E:empresa",
  "acciones-empresa#conciliarMovimiento": "E:empresa",
  "acciones-empresa#desconciliarMovimiento": "E:empresa",
  "acciones-empresa#enlazarCuotaFactura": "E:empresa",
  "acciones-empresa#desenlazarCuotaFactura": "E:empresa",
  "acciones-empresa#guardarTipoCambio": "E:empresa",
  "acciones-empresa#guardarGastoFijo": "E:empresa",
  "acciones-empresa#bajaGastoFijo": "E:empresa",
  "acciones-empresa#generarLiquidaciones": "E:liquidaciones",
  "acciones-empresa#publicarBorradores": "E:liquidaciones",
  "acciones-empresa#pagarLiquidacion": "E:liquidaciones ROL:aprueba",
  "acciones-empresa#borrarLiquidacion": "E:liquidaciones",
  "acciones-empresa#editarExtrasLiquidacion": "E:liquidaciones",
  "acciones-empresa#marcarLiquidacionVista": "SESION — sólo la liquidación propia (`personaId` del actor)",
  // MIA-50 T10 (O20-O22): la liquidación del proyecto. Declarar es sólo de Administración y aprobar, sólo de Dirección con el
  // código de su app en ese momento (`soloRol`); revisar pide Liquidaciones. Revisar y aprobar, además, nunca quien cobra en el
  // proyecto ni quien no tiene ficha (`exigirQueNoCobre`).
  "acciones-liquidacion-proyecto#declararCostosCompletos": "SOLO:ADMINISTRACION",
  "acciones-liquidacion-proyecto#revisarLiquidacionProyecto": "E:liquidaciones",
  "acciones-liquidacion-proyecto#aprobarLiquidacionProyecto": "SOLO:DIRECCION",
  "acciones-liquidacion-proyecto#aprobarAjusteTardio": "SOLO:DIRECCION",
  // MIA-50 T09 · O04, O05, O07.
  "acciones-etapas#guardarFechasPrevistas": "E:pipeline",
  "acciones-etapas#crearObligacion": "E:pipeline",
  "acciones-etapas#marcarObligacionHecha": "E:pipeline",
  "acciones-etapas#cancelarProyecto": "E:pipeline DIR",
  "acciones-ficha#crearLead": "E:pipeline",
  "acciones-ficha#moverProyecto": "E:pipeline",
  "acciones-ficha#guardarDatos": "E:pipeline",
  "acciones-ficha#guardarCarpeta": "E:pipeline",
  "acciones-ficha#generarPortal": "E:pipeline",
  "acciones-ficha#revocarPortal": "E:pipeline",
  "acciones-ficha#asignarEquipo": "E:pipeline",
  "acciones-ficha#quitarEquipo": "E:pipeline",
  "acciones-ficha#guardarCampoItem": "E:costos E:ficha",
  "acciones-ficha#agregarItemFicha": "E:ficha",
  "acciones-ficha#borrarItemFicha": "E:ficha",
  "acciones-ficha#nuevaVersion": "E:cotizaciones|ficha",
  "acciones-ficha#pedirAprobacion": "E:cotizaciones|ficha",
  "acciones-ficha#aprobarInterno": "E:cotizaciones",
  "acciones-ficha#enviarCotizacion": "E:cotizaciones",
  "acciones-ficha#registrarRespuesta": "E:cotizaciones",
  "acciones-ficha#guardarTextos": "E:cotizaciones",
  "acciones-ficha#marcarCuota": "E:pagos|empresa",
  "acciones-ficha#tiposDeRetencion": "E:pagos|empresa",
  "acciones-ficha#crearMovimientoManual": "E:pagos",
  "acciones-ficha#quitarMovimiento": "E:pagos",
  "acciones-ficha#recalcularCuotas": "E:pagos",
  "acciones-ficha#anularCobroFicha": "E:pagos",
  "acciones-ficha#anularGastoFicha": "E:pagos",
  "acciones-ficha#agregarChecklist": "E:ficha",
  "acciones-ficha#cargarPlantillaChecklist": "E:ficha",
  "acciones-ficha#alternarChecklist": "E:ficha",
  "acciones-ficha#borrarChecklist": "E:ficha",
  "acciones-ficha#subirArchivoFicha": "E:ficha|diseno",
  "acciones-ficha#hayNube": "SESION — sólo dice si hay nube configurada; no lee ni escribe datos",
  "acciones-ficha#pedirSubida": "E:ficha|diseno",
  "acciones-ficha#confirmarSubida": "E:ficha|diseno",
  "acciones-ficha#adjuntosDeItem": "E:ficha|diseno",
  "acciones-ficha#vincularArchivo": "E:ficha|diseno",
  "acciones-ficha#borrarArchivoFicha": "E:ficha|diseno",
  "acciones-ficha#alternarVisibleFicha": "E:ficha|diseno",
  "acciones-gestion#editarReunion": "E:pipeline|diseno",
  "acciones-gestion#cancelarReunion": "E:pipeline|diseno",
  "acciones-gestion#crearReunion": "E:pipeline|diseno",
  "acciones-gestion#guardarProveedor": "E:proveedores",
  "acciones-gestion#cambiarEstadoProveedor": "E:proveedores",
  "acciones-gestion#guardarPersona": "E:equipo",
  "acciones-gestion#cambiarEstadoPersona": "E:equipo",
  "acciones-gestion#reiniciarSegundoFactor": "E:equipo",
  "acciones-gestion#guardarPermisos": "E:equipo MATRIZ",
  "acciones-gestion#marcarAvisoLeido": "SESION — sólo los avisos propios (`destinatario` = la cuenta)",
  "acciones-gestion#marcarTodosLeidos": "SESION — sólo los avisos propios (`destinatario` = la cuenta)",
  "acciones-gestion#guardarPreferenciasAvisos": "SESION — sólo las preferencias propias (la cuenta)",
  "acciones-gestion#responderPresentacion": "LINK — el cliente responde por el link con clave, sin sesión",
  "acciones-parametros#guardarParametro": "DIR",
  "acciones-parametros#volverAlValorDelRubro": "DIR",
  "acciones-precio#guardarPrecio": "E:cotizaciones V:costos — además, con la propuesta aprobada sólo Dirección y con motivo (`momento`); fuera de rango, espera a Dirección",
  "acciones-precio#aprobarPrecio": "E:cotizaciones V:costos — además, sólo Dirección (`a.rol`)",
  "acciones-precio#guardarReparto": "E:cotizaciones V:costos — además, con la propuesta aprobada sólo Dirección y con motivo (`momento`)",
  "acciones-presupuesto#guardarLineaDetalle": "E:cotizaciones|ficha",
  "acciones-presupuesto#guardarAnticipoLinea": "E:cotizaciones|pagos",
  "acciones-presupuesto#marcarPrevision": "E:pagos — además, sólo Administración marca la previsión (`errorDeMarcaPrevision`)",
  "acciones-presupuesto#crearAdicional": "E:cotizaciones",
  "acciones-presupuesto#agregarLineaAdicional": "E:cotizaciones",
  "acciones-presupuesto#borrarLineaAdicional": "E:cotizaciones",
  "acciones-presupuesto#aprobarAdicionalInterno": "E:cotizaciones — además, Dirección fuera del equipo del proyecto (`errorDeAprobador`)",
  "acciones-presupuesto#enviarAdicional": "E:cotizaciones",
  "acciones-presupuesto#responderAdicional": "E:cotizaciones",
  "acciones-rendiciones#rendirGasto": "REND:rendir",
  "acciones-rendiciones#aprobarRendicion": "REND:revisar",
  "acciones-rendiciones#devolverRendicion": "REND:revisar",
  "acciones-rendiciones#rechazarRendicion": "REND:revisar",
  "acciones-rendiciones#reintegrarDirecto": "REND:revisar",
  "acciones-rendiciones#entregarAnticipo": "REND:revisar",
  "acciones-rendiciones#cerrarAnticipo": "REND:revisar",
  "acciones-vistas#guardarVista": "SESION — la lista decide adentro (`veLaLista`)",
  "acciones-vistas#borrarVista": "SESION — sólo las vistas propias o las del rol (`veLaLista`)",
  "acciones#agregarTarea": "E:ficha|diseno",
  "acciones#alternarTarea": "E:ficha|diseno",
  "acciones#borrarTarea": "E:ficha|diseno",
  "acciones#agregarArchivo": "E:ficha|diseno",
  "acciones#responderPropuesta": "LINK — el cliente responde por el link con clave, sin sesión",
  "acciones#registrarCobro": "E:pagos",
  "acciones#registrarGasto": "E:pagos",
  "acciones#pagarGasto": "E:pagos",
  // MIA-50 T05: comprobantes de proveedor (los carga quien edita Proveedores o Pagos) y órdenes de pago (Pagos). Además piden
  // ver la plata del negocio (`veLaPlata`, datos.server.ts): el rol de gestión (Dirección o Administración) y el techo
  // del ERP («agenda:manage»). No es sólo del rol ERP: un puesto que no ve la plata no pasa aunque tenga «Pagos · editar».
  "acciones-comprobantes#cargarComprobante": "E:proveedores|pagos",
  "acciones-comprobantes#imputarComprobante": "E:proveedores|pagos",
  "acciones-comprobantes#enlazarCuota": "E:proveedores|pagos",
  "acciones-comprobantes#desenlazarCuota": "E:proveedores|pagos",
  "acciones-comprobantes#anularComprobante": "E:proveedores|pagos",
  "acciones-orden-pago#crearOrdenPago": "E:pagos",
  "acciones-orden-pago#crearOrdenDesdeForm": "E:pagos",
  "acciones-orden-pago#aprobarYPagarOrden": "E:pagos",
  "acciones-orden-pago#anularOrden": "E:pagos",
  "acciones#crearEntregable": "E:diseno",
  "acciones#guardarEntregable": "E:diseno",
  "acciones#anularEntregable": "E:diseno",
  "acciones#subirVersion": "E:diseno",
  "acciones#descartarBorrador": "E:diseno",
  "acciones#enviarVersion": "E:diseno",
  "acciones#responderEntregable": "LINK — el cliente responde por el link con clave, sin sesión",
  "acciones#crearStand": "E:ficha|diseno",
  "acciones#guardarStand": "E:ficha|diseno",
  "acciones#eliminarStand": "E:ficha|diseno",
  "acciones#computoAlPresupuesto": "E:ficha",
  "acciones#guardarConfig": "PLATA:editar",
  // MIA-50 T11 (C-CF2): las acciones de las apps del ERP Cuentas a cobrar y a pagar (`src/app/admin/(dashboard)/<app>/actions.ts`).
  "cuentas-a-cobrar/actions#registerReceivableCollection": "E:empresa",
  "cuentas-a-pagar/actions#registerPayablePayment": "E:empresa",
  "cuentas-a-pagar/actions#agregarCheque": "E:empresa",
  "cuentas-a-pagar/actions#cambiarEstadoCheque": "E:empresa",
};

/** Cada página de Proyectos (debajo de `/admin/proyectos`) y, con `/admin/…`, las de las apps del ERP que pide la Adenda 2 (T11). */
export const PUERTAS_DE_RUTAS: Readonly<Record<string, string>> = {
  "/[id]/entregable/[entregableId]": "V:diseno",
  "/[id]": "V:pipeline",
  "/[id]/precio": "V:costos",
  "/[id]/precio/calculadora": "V:costos",
  "/[id]/stand/[standId]": "V:ficha",
  "/administracion": "SESION — cada sección pide su módulo (`permisoDe`, `pagaLiquidaciones`); lo propio, para todos",
  "/agentes": "V:ia",
  "/avisos": "SESION — sólo los avisos propios (`misAvisos`)",
  "/buscar": "SESION — busca sólo en lo que el actor ve (`buscarEnGestion`: proyectos visibles y `puede` por tipo)",
  "/calendario": "SESION — cada tipo de entrada con `puede`",
  "/config": "PLATA:editar",
  "/config/parametros": "SESION — verlos Dirección y Administración, cambiarlos Dirección (por rol, adentro)",
  "/configuracion": "SESION — índice: cada enlace con `puede` y el rol",
  "/consultas/[id]": "V:pipeline",
  "/consultas": "V:pipeline",
  "/direccion": "V:direccion",
  "/diseno": "V:diseno",
  "/diseno/version/[versionId]": "V:diseno",
  "/equipo": "V:equipo",
  "/imprimir-liquidacion/[id]": "SESION — la propia, o con Liquidaciones (`puede`)",
  "/imprimir/productora/[id]": "V:cotizaciones",
  "/imprimir/venta/[id]": "V:cotizaciones",
  "/inicio": "SESION — cada tarjeta con `puede`",
  "/mi-liquidacion": "SESION — sólo lo propio (`personaId`)",
  "/mi-liquidacion/rendiciones": "SESION — sólo lo propio (`personaId`)",
  "/nuevo": "E:pipeline V:pipeline",
  "/": "V:pipeline",
  "/presentacion/[id]": "V:diseno",
  "/propuesta-ia": "V:diseno V:ia",
  "/proveedores/[id]/editar": "E:proveedores V:proveedores",
  "/proveedores/[id]": "V:proveedores",
  "/proveedores/nuevo": "E:proveedores V:proveedores",
  "/proveedores": "V:proveedores",
  // MIA-50 T05: lo de adentro (cargar, pagar) lo deciden sus acciones; sin `veLaPlata` la página avisa y no muestra importes.
  "/proveedores/comprobantes": "V:proveedores",
  "/proveedores/comprobantes/[id]": "V:proveedores",
  "/proveedores/ordenes": "V:proveedores",
  "/proveedores/ordenes/[id]": "V:proveedores",
  "/proveedores/ordenes/[id]/imprimir": "V:proveedores",
  "/proveedores/iva": "V:proveedores",
  "/proveedores/vinculadas": "V:proveedores",
  "/reportes": "PLATA:ver",
  "/taller/piezas": "V:costos V:cotizaciones",
  "/taller/valores-hora": "V:costos V:cotizaciones",
  // MIA-50 T11 (Adenda 2): con el panel de Proyectos cerrado, se abren con «Empresa · ver» (la lista y el detalle de cada cuenta).
  "/admin/cuentas-a-cobrar": "V:empresa",
  "/admin/cuentas-a-cobrar/[id]": "V:empresa",
  "/admin/cuentas-a-pagar": "V:empresa",
  "/admin/cuentas-a-pagar/[id]": "V:empresa",
  "/admin/flujo": "V:empresa",
};

/** Los términos de una puerta, sin el motivo. */
export const terminosDe = (puerta: string): string[] => puerta.split(" — ")[0].trim().split(/\s+/);

/** Si un rol pasa una puerta, con lo guardado por Dirección encima de lo de fábrica. */
export function dejaPasar(rol: RolGestion, puerta: string, guardados: Guardados = []): boolean {
  const p = (m: string) => permisoDe(rol, m as ModuloGestion, guardados);
  return terminosDe(puerta).every((t) => {
    const [tipo, arg = ""] = t.split(":");
    const alguno = (f: (m: string) => boolean) => arg.split("|").some(f);
    switch (tipo) {
      case "E": return alguno((m) => p(m).editar);
      case "V": return alguno((m) => p(m).ver);
      case "PLATA": return arg === "editar" ? p("direccion").editar : p("direccion").ver;
      case "DIR": return rol === "DIRECCION";
      case "SOLO": return rol === arg;
      case "MATRIZ": return cambiaLosPermisos(rol);
      case "REND": return arg === "revisar" ? revisaRendiciones(rol, p("rendiciones")) : motivoSinRendiciones(p("rendiciones"), "rendir") === null && puedeRendir(rol, true);
      case "ROL": return puedeAprobarRendicion(rol, "quien-aprueba", "otra-persona");
      case "SESION": case "LINK": return true;
      default: throw new Error(`Puerta desconocida: ${t}`);
    }
  });
}

/** Rol × (ruta y acción): por dónde pasa cada uno. */
export function recorridoDeLaMatriz(guardados: Guardados = []) {
  return [...ROLES_GESTION, "SIN_FICHA" as const].map((rol) => ({
    rol,
    rutas: Object.keys(PUERTAS_DE_RUTAS).filter((r) => dejaPasar(rol, PUERTAS_DE_RUTAS[r], guardados)),
    acciones: Object.keys(PUERTAS_DE_ACCIONES).filter((a) => dejaPasar(rol, PUERTAS_DE_ACCIONES[a], guardados)),
  }));
}
