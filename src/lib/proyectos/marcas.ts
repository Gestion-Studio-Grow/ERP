// La marca que deja en `CashMovement.createdBy` el pago de un gasto de proyecto (y su reversa): así el libro sabe que
// lo asentó el sistema, no lo deja borrar y el estudio contable lo ve como gasto y no como un egreso tipeado a mano.
// Módulo puro: lo importa el libro de caja, que llega a un client component.

export const GASTO_PROYECTO_ACTOR_PREFIX = "gasto-proyecto:";

export const marcaDeGastoProyecto = (gastoId: string): string => `${GASTO_PROYECTO_ACTOR_PREFIX}${gastoId}`;
