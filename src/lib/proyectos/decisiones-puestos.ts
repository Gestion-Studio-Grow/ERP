// MIA-229 · Las decisiones de puestos de una productora, en UN lugar. Las respuestas P1–P4 son las de ORQ-007 del 20/11
// («seguí», defaults reversibles mientras el dueño contesta): provisionales a confirmar por el dueño. Si elige otra cosa,
// se cambia acá y sólo acá; el alta (`puestos-del-alta.ts`), la matriz (`gestion-core.ts`) y la lista de usuarios leen esto.
// Sin imports de valores: lo importa `gestion-core.ts` y no puede armar un ciclo.

export const DECISIONES_DE_PUESTOS = {
  /** P1 · Dirección dada de alta: rol del ERP. RECEPTION = ve y mueve la plata de Proyectos, no administra usuarios del ERP. */
  rolErpDeDireccion: "RECEPTION",
  /** P2 · Administración: OWNER porque Facturación lo exige (seed-mia-producciones.ts:85). Lo que no hace lo frena `capacidadesNegadas`. */
  rolErpDeAdministracion: "OWNER",
  /**
   * MIA-237 · lo que un puesto no hace aunque su rol del ERP lo traiga. Dueño, 20/11 13:05Z: «Administración no es dirección
   * pero ve toda la adm y los proyectos tmb» → no administra usuarios ni permisos. Lo aplica la sesión (`session.ts`) como
   * negación que `permisoEfectivo` respeta (capabilities.ts): vale para la página, la app y la acción.
   */
  capacidadesNegadas: { ADMINISTRACION: ["users:manage"] } as Readonly<Record<string, readonly string[]>>,
  /** P3 · Los costos de la ficha (presupuestar) NO son plata: Producción los ve. Cobros, pagos, deudas, empresa y liquidaciones, sí. */
  costosSonPlata: false,
  /** P4 · En la lista de usuarios de una productora, cada uno se lee por el puesto de su ficha, no por el rol del ERP. */
  etiquetaPorFicha: true,
} as const;
