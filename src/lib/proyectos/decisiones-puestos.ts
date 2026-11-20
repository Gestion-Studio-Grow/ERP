// MIA-229 · Las decisiones de puestos de una productora, en UN lugar. Las respuestas P1–P4 son las de ORQ-007 del 20/11
// («seguí», defaults reversibles mientras el dueño contesta): provisionales a confirmar por el dueño. Si elige otra cosa,
// se cambia acá y sólo acá; el alta (`puestos-del-alta.ts`), la matriz (`gestion-core.ts`) y la lista de usuarios leen esto.
// Sin imports de valores: lo importa `gestion-core.ts` y no puede armar un ciclo.

export const DECISIONES_DE_PUESTOS = {
  /** P1 · Dirección dada de alta: rol del ERP. RECEPTION = ve y mueve la plata de Proyectos, no administra usuarios del ERP. */
  rolErpDeDireccion: "RECEPTION",
  /** P2 · Administración: OWNER porque Facturación lo exige (seed-mia-producciones.ts:85). Riesgo: OWNER también da usuarios y precios. */
  rolErpDeAdministracion: "OWNER",
  /** P3 · Los costos de la ficha (presupuestar) NO son plata: Producción los ve. Cobros, pagos, deudas, empresa y liquidaciones, sí. */
  costosSonPlata: false,
  /** P4 · En la lista de usuarios de una productora, cada uno se lee por el puesto de su ficha, no por el rol del ERP. */
  etiquetaPorFicha: true,
} as const;
