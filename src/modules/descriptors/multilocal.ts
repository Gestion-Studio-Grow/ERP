// ============================================================================
// Descriptor del módulo MULTILOCAL — la casa de una marca con varios locales.
// ============================================================================
//
// Una marca con varios locales (MAGRA con sus cinco carnicerías) se arma con N negocios del
// sistema, uno por local, como hoy. Lo único que cambia es un VÍNCULO: la "casa" (el negocio
// que tiene este módulo) queda unida a sus locales. Pasar de locales sueltos a una marca es
// vincular; volver atrás es dar de baja el vínculo. No se mueve ningún dato.
//
// Es kind "capability" (nativo del Core), igual que `cartera`, y por el mismo motivo: su
// asignación es la BARRERA de acceso a datos de otros negocios. Por eso:
//   - nunca viene por default de un rubro ni de un producto (sin `nucleoPara`): lo asigna
//     GSG desde la consola, negocio por negocio, y ese cambio queda auditado
//     (toggleTenantModule, src/lib/operator-actions.ts);
//   - sus apps exigen el módulo SIEMPRE, aun con el gate apagado (`moduloDuro`), y su página
//     y sus actions llaman a `exigirCasa()`;
//   - `cartera` y `multilocal` se excluyen entre sí: los dos guardan el vínculo en la misma
//     tabla (CarteraCliente) y juntos mezclarían los locales de la marca con los clientes de
//     un estudio contable. La ficha del negocio en la consola ya rechaza esa combinación
//     (apps-del-negocio.ts); el alta todavía no.
//
// En la ola 1 el módulo existe sin apps: se puede asignar y auditar, pero no abre ninguna
// pantalla. Las apps de "Mis locales" las suma el frente de locales en su catálogo
// (src/apps/catalogo/locales.ts); este descriptor no declara rutas (una pantalla se declara
// como app, nunca en `scopeItems`).

import type { ModuleDescriptor } from "../contract";

export const multilocalModule: ModuleDescriptor = {
  id: "multilocal",
  version: "0.1.0",
  nombre: "Mis locales",
  descripcion:
    "Para la casa de una marca con varios locales: ver las ventas, las cajas y el stock de los locales que GSG le vinculó. Cada local sigue siendo un negocio con sus datos separados.",
  kind: "capability",
  capability: "multilocal:manage",
  rubros: "todos",
  // Es operación de los locales (ventas, cajas, stock): el estante más cercano de la tienda.
  grupo: "ventas-mostrador",
  resumen: "La dueña de una marca ve todos sus locales juntos, sin mezclar los datos de cada uno.",
  fit: "Una marca con varios locales, cada uno dado de alta como su propio negocio.",
  // El vínculo casa → local reusa la tabla de la cartera del contador. Es la misma migración
  // que declara `cartera`; se repite acá porque este módulo tampoco funciona sin ella.
  migraciones: [
    {
      carpeta: "prisma/migrations/20260711140000_add_cartera_cliente",
      descripcion: "Tabla CarteraCliente: acá se guarda el vínculo de la casa con cada local.",
      aditiva: true,
    },
  ],
};
