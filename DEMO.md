# Demo en vivo — 2 minutos, costo $0

Guion para mostrarle el sistema a un cliente **sin gastar un peso** y **sin tocar
producción ni Neon**. Todo corre en tu máquina contra una base **efímera en
memoria** (PGlite = Postgres en WASM): se crea al arrancar, se borra al cortar, no
deja residuo. El tenant de ejemplo es **magra** (carnicería premium, Canning).

---

## 1. Arrancar (una sola vez, ~30 s)

Requisito: haber corrido `npm install` alguna vez en el repo. Después:

```bash
npm run demo
```

Eso levanta la base local, la siembra (catálogo de cortes + 3 pedidos + dueño) y
arranca la app. Cuando veas el cartel verde, está lista:

```
  Vidriera (cliente):   http://localhost:3000/tienda
  Backoffice / Caja:    http://localhost:3000/admin/login
     email:    dueno@magra.demo
     password: magra1234
```

> La primera carga de cada página tarda unos segundos (compila al vuelo). Refrescá
> una vez si la primera queda pensando.

---

## 2. El guion (seguí este orden)

### 🛒 Beat 1 — La vidriera, lo que ve el cliente
Abrí **http://localhost:3000/tienda**.
- Mostrá el catálogo real de cortes con **precio por kilo** (Asado de tira, Vacío,
  Bife de chorizo…) y los productos por unidad (Pollo entero, Maple de huevos).
- Armá un pedido: agregá **Asado de tira 1,5 kg** y **Vacío 0,8 kg**, poné un
  nombre y teléfono, elegí **retiro** o **envío a domicilio**, y confirmá.
- Cae en **/tienda/gracias**. *Mensaje al cliente: "esto es tu tienda online, sin
  comisiones de terceros, con tu marca."*

### 🔐 Beat 2 — Entrar al backoffice
Abrí **http://localhost:3000/admin/login** e ingresá con
`dueno@magra.demo` / `magra1234`.

### 🧾 Beat 3 — Caja y pedidos (el mostrador)
En **Caja y pedidos** (`/admin/pedidos`):
- El pedido que acabás de cargar en la vidriera **aparece en la bandeja**, junto
  a los de ejemplo (uno listo para retirar, uno a domicilio pendiente).
- Avanzá su estado con un botón: **Confirmar → A preparar → Listo → Entregar**.
- O vendé por mostrador: elegí un corte, **pesalo (por kg)** o cargá unidades,
  y cobrá. *Mensaje: "el mismo sistema atiende el mostrador y los pedidos online."*

### 💵 Beat 4 — Facturación electrónica (simulador ARCA)
En otra terminal (dejá la demo corriendo):

```bash
npm run demo:factura
```

Emite la **factura electrónica** de la venta de mostrador en **modo simulador**:
elige el tipo de comprobante (Factura B a consumidor final), desglosa neto + IVA
21%, numera y devuelve un **CAE simulado** — todo el circuito de ARCA **sin
certificado ni conexión a AFIP**. *Mensaje: "la facturación ya está integrada;
para producción se enchufa el certificado del negocio y sale el CAE real."*

### 📊 Beat 5 — Reportes
En **/admin/reportes**: ingresos del día, ventas por producto y por profesional.
*Mensaje: "cierra el día solo; sabés cuánto vendiste sin sumar a mano."*

---

## 3. Cortar y resetear

- **Cortar:** `Ctrl-C` en la terminal de `npm run demo`. La base se borra sola.
- **Volver a empezar de cero:** corré `npm run demo` de nuevo. Cada arranque es una
  base limpia con los mismos datos — probá lo que quieras, no se ensucia nada.

---

## 4. Por qué esto no cuesta nada (y no toca prod)

- La base es **PGlite en memoria** (Postgres 16 en WebAssembly): no hay servidor,
  no se instala nada, no hay Neon ni nube. Vive en la RAM del proceso y muere al
  cortar.
- La app se conecta igual que siempre (`DATABASE_URL`), pero apuntando a un
  **socket local** que sirve esa base. **Cero cambios en el código** de la app:
  corre exactamente como en producción, con datos de juguete.
- Los datos son **de ejemplo, marcados como provisionales** (cortes, precios/kg y
  stock razonables de referencia, no la lista real de magra).

## 5. Si algo falla

- **"port 3000 en uso":** ya hay algo corriendo ahí. Cerralo (o cortá una demo
  previa) y reintentá.
- **La vidriera tarda o queda cargando la primera vez:** es la compilación al
  vuelo de Next; refrescá una vez.
- **`npm run demo:factura` no depende del server:** es puro cálculo fiscal, corre
  aunque hayas cortado la demo.
