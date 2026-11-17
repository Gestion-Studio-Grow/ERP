# Consola de la Cuadrilla · recorrido de QA (GSG-MIA-062)

Manual corto de cada puesto para el QA en navegador real. El «Camino» del registro de turno cita estas
secciones (`operador §2`, `supervision §3`, `agente §1`). Base: Postgres LOCAL efímera con las migraciones del
repo y RLS (`app_rls`), nunca Neon. Negocios ficticios: Productora Ficticia Norte (`localhost`) y Estudio
Ficticio Sur (`127.0.0.1`). La contraseña no se escribe en ningún lado: vive en un archivo fuera del repo.

## Operador GSG (rol dueño) · `/operador/cuadrilla`
- **operador §1 · Entrar:** `/operador/login` con nombre y contraseña; «Cuadrilla» en la cabecera (en el celular,
  la cápsula). La primera excepción pendiente se abre sola. Se cuentan los clics desde la portada.
- **operador §2 · Filtrar:** negocio, agente, estado y tipo; el filtro se conserva al decidir.
- **operador §3 · Hablar:** «Hilo» de un agente o de un equipo; se escribe y queda con nombre y hora.
- **operador §4 · Nivel 0 (plata o envío a terceros):** se abre de a una, se lee el contenido entero y se
  aprueba o rechaza ahí. No existe «aprobar todo»: el lote con plata o envío se niega.
- **operador §5 · Lote:** casillas + rechazar, aprobar (sin plata ni envíos), pausar sus agentes o reasignar.
  Un lote va de a un negocio: mezclar negocios se niega.

## Supervisión del cliente (OWNER) · `/admin/cuadrilla`
- **supervision §1 · Entrar:** `/admin/login`; la clave provisoria obliga a cambiarla. La franja «Cuadrilla:
  N esperan tu decisión · Abrir la primera» lleva a la más vieja.
- **supervision §2 · Sólo su negocio:** no hay filtro de negocio; un id de otro negocio en la URL o en una
  acción no muestra ni cambia nada.
- **supervision §3 · Nivel 0:** igual que operador §4.
- **supervision §4 · Lote:** igual que operador §5, dentro de su negocio.
- **supervision §5 · Hablar:** hilo del agente o del equipo.

## Usuario de agente · `/admin/cuadrilla`
- **agente §1 · Su hilo:** ve sólo su hilo y sus excepciones; responde.
- **agente §2 · Sin supervisión:** no ve la bandeja ni puede aprobar (tampoco con `?ex=` en la URL).
- **agente §3 · Levantar:** pide una aprobación o avisa que se frenó.

## Registro de turno
Tabla `| # | Pedido | Entendí | Fuente | Camino | Esperado | Hice | Vi | Captura | Par | Estado |`. Quien
recorre deja «sin confirmar»; el verificador visual (otra sesión) mira la captura y pone «coincide …» y «hecho».
Se valida con `Factory-GSG/entorno/controles/registro-agente.mjs`.
