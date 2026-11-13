// ============================================================================
// PEDÍ LOCAL · LA CARTA DE BITÁCORA CAFÉ — productos, categorías, fotos y destacados. DATOS.
// ============================================================================
//
// Fuente: su menú público de Fudo (menu.fu.do, link dado por un dueño del local, 13/11/2026). Uso de
// marca autorizado sólo para su tienda (docs/tenants/bitacora/AUTORIZACION-MARCA.md).
//   · El seed de la prueba cerrada (qa-seed.ts) toma de acá código, nombre y precio.
//   · La vidriera (config.ts → `carta`) toma categoría, orden, descripción, foto y destacado, por
//     NOMBRE del producto (carta-del-local.ts): `Product` no guarda esos campos y no hay migración.
//     Lo que el local cargue con otro nombre cae en la regla por palabras (carta.ts → categoriaDe).
// PROVISIONAL A CONFIRMAR con el local: precios (cambian seguido: revalidar antes de publicar), los
// 6 destacados (elegidos por criterio, sin datos de venta), las 19 descripciones vacías y las
// 9 fotos que faltan. Las fotos son URL del almacenamiento de Fudo (dependencia externa): pasarlas
// a almacenamiento propio antes de salir de la prueba. Sin descripción inventada (alérgenos).
// «Diferencia combo almuerzo» ($3.000) no es producto: es la opción «Hacelo combo» (opciones-bitacora.ts).

import type { CartaDelLocal } from "./carta-del-local";

export const CARTA_BITACORA: CartaDelLocal = [
  {
    id: "combos",
    titulo: "Combos y promos",
    dibujo: "cafe",
    productos: [
      { codigo: "bit-cafe-con-2-medialunas", nombre: "Café con 2 medialunas", precio: 5900, descripcion: "Un café a elección con dos medialunas de manteca.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/45?updatedAt=1786542465", destacado: true },
      { codigo: "bit-cafe-con-alfajor", nombre: "Café con alfajor", precio: 5900, descripcion: "Un café a elección con un alfajor artesanal.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/46?updatedAt=1786537274" },
      { codigo: "bit-cafe-con-chipa", nombre: "Café con chipa", precio: 6900, descripcion: "Un café a elección con un chipa de queso.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/47?updatedAt=1786541026" },
      { codigo: "bit-cafe-con-cookie", nombre: "Café con cookie", precio: 6900, descripcion: "Un café a elección con una cookie artesanal.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/70?updatedAt=1786541084" },
      { codigo: "bit-cafe-con-roll-de-canela", nombre: "Café con roll de canela", precio: 6900, descripcion: "Un café a elección con un roll de canela.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/105?updatedAt=1786541261" },
      { codigo: "bit-cafe-con-lemon-pie", nombre: "Café con lemon pie", precio: 9900, descripcion: "Un café a elección con una porción de lemon pie.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/104?updatedAt=1786541453" },
      { codigo: "bit-cafe-con-torta-de-ricota", nombre: "Café con torta de ricota", precio: 9900, descripcion: "Un café a elección con torta de ricota y dulce de leche.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/118" },
      { codigo: "bit-2-exprimidos-con-2-tostados-de-jamon-y-queso", nombre: "2 exprimidos con 2 tostados de jamón y queso", precio: 19900, descripcion: "Para dos: dos exprimidos de naranja y dos tostados.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/48?updatedAt=1786542164" },
      { codigo: "bit-box-bondiolita-para-2-o-3", nombre: "Box bondiolita para 2 o 3", precio: 20000, imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/109" },
    ],
  },
  {
    id: "cafeteria",
    titulo: "Cafetería",
    dibujo: "cafe",
    productos: [
      { codigo: "bit-espresso", nombre: "Espresso", precio: 3500, descripcion: "Extracción corta, intensa y concentrada.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/11?updatedAt=1786622571" },
      { codigo: "bit-ristretto", nombre: "Ristretto", precio: 3500, descripcion: "Espresso ultraconcentrado.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/10?updatedAt=1786622556" },
      { codigo: "bit-cortado", nombre: "Cortado", precio: 3500, descripcion: "Un espresso cortado con leche.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/12?updatedAt=1786622585" },
      { codigo: "bit-americano", nombre: "Americano", precio: 3500, descripcion: "Espresso alargado con agua caliente.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/13?updatedAt=1786622608" },
      { codigo: "bit-cafe-con-leche", nombre: "Café con leche", precio: 3500, descripcion: "Espresso y leche caliente.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/14?updatedAt=1786622642" },
      { codigo: "bit-lagrima", nombre: "Lágrima", precio: 5500, descripcion: "Leche caliente y espumada con un toque de espresso.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/19?updatedAt=1786622725" },
      { codigo: "bit-flat-white", nombre: "Flat white", precio: 5500, descripcion: "Espresso doble con leche vaporizada y espuma fina.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/18?updatedAt=1786622665", destacado: true },
      { codigo: "bit-capuccino", nombre: "Capuccino", precio: 5500, descripcion: "Espresso, leche vaporizada y una buena capa de espuma.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/15?updatedAt=1786622708" },
      { codigo: "bit-latte", nombre: "Latte", precio: 5500, descripcion: "Un tercio de espresso y dos tercios de leche vaporizada.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/16?updatedAt=1786622885" },
      { codigo: "bit-latte-macchiato", nombre: "Latte macchiato", precio: 5500, descripcion: "Leche vaporizada con un toque de espresso y mucha espuma.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/17?updatedAt=1786622683" },
      { codigo: "bit-caramel-macchiato", nombre: "Caramel macchiato", precio: 5500, imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/121?updatedAt=1793187215" },
      { codigo: "bit-moccacino", nombre: "Moccacino", precio: 5500, imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/120?updatedAt=1793187244" },
      { codigo: "bit-submarino", nombre: "Submarino", precio: 5500, descripcion: "Leche caliente con una barra de chocolate para sumergir.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/20?updatedAt=1786622959" },
      { codigo: "bit-te", nombre: "Té", precio: 3500, descripcion: "Variedad a elección.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/21?updatedAt=1786623111" },
      { codigo: "bit-ice-americano", nombre: "Ice americano", precio: 3500, imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/124?updatedAt=1793291510" },
      { codigo: "bit-ice-latte", nombre: "Ice latte", precio: 5500, imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/122?updatedAt=1793477969" },
      { codigo: "bit-ice-caramel-latte", nombre: "Ice caramel latte", precio: 5500, imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/123?updatedAt=1793187203" },
    ],
  },
  {
    id: "bebidas-frias",
    titulo: "Bebidas frías",
    dibujo: "bebidas",
    productos: [
      { codigo: "bit-exprimido-de-naranja", nombre: "Exprimido de naranja", precio: 4500, descripcion: "Naranja exprimida en el momento.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/26?updatedAt=1786542940" },
      { codigo: "bit-limonada", nombre: "Limonada", precio: 4500, descripcion: "Limonada natural con jengibre.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/27?updatedAt=1786542963" },
      { codigo: "bit-smoothie", nombre: "Smoothie", precio: 7900 },
      { codigo: "bit-milkshake", nombre: "Milkshake", precio: 10900 },
      { codigo: "bit-gaseosa", nombre: "Gaseosa", precio: 4500, descripcion: "Línea Coca-Cola, sabor a elección.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/24?updatedAt=1786542772" },
      { codigo: "bit-agua-saborizada", nombre: "Agua saborizada", precio: 4500, descripcion: "Aquarius 500 ml, sabor a elección.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/23?updatedAt=1786542727" },
      { codigo: "bit-agua-con-o-sin-gas", nombre: "Agua con o sin gas", precio: 3000, descripcion: "Ivess en botella de vidrio.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/22?updatedAt=1786542558" },
      { codigo: "bit-cerveza-artesanal", nombre: "Cerveza artesanal", precio: 4500, descripcion: "Guten Bier, estilo a elección. Sólo para mayores de 18.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/25?updatedAt=1786542807" },
    ],
  },
  {
    id: "panaderia-salados",
    titulo: "Medialunas y salados",
    dibujo: "brunch",
    productos: [
      { codigo: "bit-medialuna-de-manteca", nombre: "Medialuna de manteca", precio: 1950, descripcion: "Por unidad.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/95" },
      { codigo: "bit-duo-de-medialunas", nombre: "Dúo de medialunas", precio: 3500, descripcion: "Dos medialunas 100 % manteca de 50 g.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/28?updatedAt=1786461849" },
      { codigo: "bit-medialunas-con-jamon-y-queso", nombre: "Medialunas con jamón y queso", precio: 5900, descripcion: "Dúo de medialunas de manteca prensadas con jamón y queso.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/38?updatedAt=1786539139" },
      { codigo: "bit-croissant", nombre: "Croissant", precio: 2900, imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/135?updatedAt=1793128328" },
      { codigo: "bit-croissant-de-crudo-y-rucula", nombre: "Croissant de crudo y rúcula", precio: 13900 },
      { codigo: "bit-chipa", nombre: "Chipa", precio: 4900, descripcion: "Chipa de 120 g de mandioca y queso sardo, con queso rallado arriba.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/31?updatedAt=1786538988" },
      { codigo: "bit-chipa-xl", nombre: "Chipa XL", precio: 6900 },
      { codigo: "bit-chipa-prensado", nombre: "Chipa prensado", precio: 6900, descripcion: "Chipa de queso de 120 g prensado con jamón y queso fundido.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/32?updatedAt=1786539156", destacado: true },
      { codigo: "bit-chipa-prensado-xl", nombre: "Chipa prensado XL", precio: 9900 },
      { codigo: "bit-tostadas", nombre: "Tostadas", precio: 6500, descripcion: "Pan de molde tostado con queso crema y mermelada casera de frutos rojos." },
      { codigo: "bit-tostado-de-jamon-y-queso", nombre: "Tostado de jamón y queso", precio: 7900, descripcion: "En pan brioche, con jamón natural y queso.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/37?updatedAt=1786539478" },
      { codigo: "bit-mc-tostado", nombre: "MC Tostado", precio: 8900, descripcion: "Brioche redondo con lomo ahumado, cheddar y huevo.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/40?updatedAt=1786539566" },
      { codigo: "bit-french-toast", nombre: "French toast", precio: 14900 },
    ],
  },
  {
    id: "dulces",
    titulo: "Alfajores, cookies y budines",
    dibujo: "pasteleria",
    productos: [
      { codigo: "bit-alfajor-marplatense", nombre: "Alfajor marplatense", precio: 3500, descripcion: "Bañado en chocolate semiamargo, con mucho dulce de leche.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/29?updatedAt=1786461858" },
      { codigo: "bit-alfajor-glaseado", nombre: "Alfajor glaseado", precio: 3500, descripcion: "Artesanal, glaseado y con mucho dulce de leche.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/78?updatedAt=1786461884" },
      { codigo: "bit-alfajor-de-maicena", nombre: "Alfajor de maicena", precio: 3500, descripcion: "El clásico, con mucho dulce de leche y coco rallado.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/53?updatedAt=1786461873" },
      { codigo: "bit-alfajor-de-mermelada", nombre: "Alfajor de mermelada", precio: 3500 },
      { codigo: "bit-roll-de-canela", nombre: "Roll de canela", precio: 4900, descripcion: "Masa en capas con canela y glaseado de vainilla y queso crema.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/93?updatedAt=1786537426" },
      { codigo: "bit-pan-de-chocolate", nombre: "Pan de chocolate", precio: 4900, imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/128?updatedAt=1793128353" },
      { codigo: "bit-cookie-de-vainilla", nombre: "Cookie de vainilla", precio: 4900, descripcion: "Cookie de 120 g, crocante por fuera, con trozos de chocolate con leche y semiamargo.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/30?updatedAt=1786537452" },
      { codigo: "bit-cookie-de-cacao", nombre: "Cookie de cacao", precio: 4900, descripcion: "Cookie de 120 g con chocolate con leche, semiamargo y blanco.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/74?updatedAt=1786537467" },
      { codigo: "bit-cookie-nutella", nombre: "Cookie Nutella", precio: 7900, imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/115" },
      { codigo: "bit-cookie-ferrero", nombre: "Cookie Ferrero", precio: 7900, imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/116" },
      { codigo: "bit-cookie-kinder", nombre: "Cookie Kinder", precio: 7900, imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/117" },
      { codigo: "bit-cookie-y-cream", nombre: "Cookie & cream", precio: 10500 },
      { codigo: "bit-budin-de-limon", nombre: "Budín de limón", precio: 6500, descripcion: "Porción con amapolas, almíbar y glasé de limón.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/33?updatedAt=1786539053" },
      { codigo: "bit-budin-marmolado", nombre: "Budín marmolado", precio: 6500, descripcion: "Porción de vainilla y chocolate, con chocolate con leche y maní.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/34?updatedAt=1786539016" },
      { codigo: "bit-budin-de-banana", nombre: "Budín de banana", precio: 6500, descripcion: "Porción bien húmeda, con azúcar mascabo y trozos de chocolate.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/72?updatedAt=1786539080" },
    ],
  },
  {
    id: "tortas",
    titulo: "Tortas",
    dibujo: "pasteleria",
    productos: [
      { codigo: "bit-lemon-pie", nombre: "Lemon pie", precio: 7500, descripcion: "Porción: curd de limón, base sablé y merengue italiano.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/43?updatedAt=1786537793" },
      { codigo: "bit-torta-de-ricota", nombre: "Torta de ricota", precio: 7500, descripcion: "Porción de la clásica, con dulce de leche.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/64?updatedAt=1786537820" },
      { codigo: "bit-torta-vasca", nombre: "Torta vasca", precio: 10500, descripcion: "Porción de la torta de queso española, bien cremosa. Especial de la casa.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/41?updatedAt=1786537924", destacado: true },
      { codigo: "bit-cheesecake", nombre: "Cheesecake", precio: 10500, descripcion: "Porción con base de galletitas de vainilla y mermelada casera de frutos rojos.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/42?updatedAt=1786538112" },
      { codigo: "bit-tiramisu", nombre: "Tiramisú", precio: 10500, descripcion: "Individual: vainillas húmedas, crema de mascarpone y cacao amargo.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/79" },
      { codigo: "bit-key-lime-pie", nombre: "Key lime pie", precio: 10500, descripcion: "Base crocante de coco y mascabo con relleno cremoso de lima.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/112" },
      { codigo: "bit-torta-chocolatosa", nombre: "Torta chocolatosa", precio: 14500, descripcion: "Porción para compartir: bizcocho húmedo y namelaka de chocolate.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/44?updatedAt=1786538250" },
      { codigo: "bit-torta-balcarce", nombre: "Torta Balcarce", precio: 14500, descripcion: "Porción con crema, nueces, dulce de leche, merenguitos y pionono.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/94?updatedAt=1786538177" },
    ],
  },
  {
    id: "almuerzos",
    titulo: "Almuerzos",
    dibujo: "brunch",
    productos: [
      { codigo: "bit-avocado-toast", nombre: "Avocado toast", precio: 11900, descripcion: "Pan de campo tostado, huevos revueltos y palta.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/102?updatedAt=1786461374" },
      { codigo: "bit-sandwich-primavera", nombre: "Sándwich primavera", precio: 15900, descripcion: "Focaccia con jamón, queso, lechuga y tomate. Para compartir, con chips de papa.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/39?updatedAt=1786461198" },
      { codigo: "bit-sandwich-de-bondiola", nombre: "Sándwich de bondiola", precio: 15900, descripcion: "Focaccia con bondiola braseada y queso. Con papas fritas triple cocción.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/59?updatedAt=1786461237", destacado: true },
      { codigo: "bit-sandwich-de-pulled-pork", nombre: "Sándwich de pulled pork", precio: 15900, descripcion: "Cerdo mechado con cheddar en pan brioche casero. Con papas fritas triple cocción.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/88?updatedAt=1786461336" },
      { codigo: "bit-sandwich-de-pollo-y-cheddar", nombre: "Sándwich de pollo y cheddar", precio: 15900, descripcion: "Pan blanco casero con pollo, lechuga, tomate y cheddar. Con papas fritas.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/134?updatedAt=1794066366" },
      { codigo: "bit-sandwich-de-atun", nombre: "Sándwich de atún", precio: 15900, descripcion: "Brioche casero con atún, queso crema, pickles y cebolla. Con papas fritas.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/133?updatedAt=1794066353" },
      { codigo: "bit-quiche-lorraine-de-jamon-y-queso", nombre: "Quiche lorraine de jamón y queso", precio: 15900, descripcion: "Masa crocante y relleno cremoso, con ensalada de verdes.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/75?updatedAt=1786460979" },
      { codigo: "bit-quiche-lorraine-de-zucchini", nombre: "Quiche lorraine de zucchini", precio: 15900, descripcion: "Masa crocante y relleno cremoso con zucchini, con ensalada de verdes.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/97?updatedAt=1786461055" },
      { codigo: "bit-ensalada-caesar", nombre: "Ensalada Caesar", precio: 15900, descripcion: "Verdes, pollo, parmesano, crutones y salsa caesar casera. Abundante.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/98?updatedAt=1786461348" },
    ],
  },
  {
    id: "para-casa",
    titulo: "Para llevar a casa",
    dibujo: "granos",
    productos: [
      { codigo: "bit-media-docena-de-medialunas", nombre: "Media docena de medialunas", precio: 7900, descripcion: "Seis medialunas de manteca para llevar.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/106?updatedAt=1786541710", destacado: true },
      { codigo: "bit-docena-de-medialunas", nombre: "Docena de medialunas", precio: 14900, descripcion: "Doce medialunas de manteca para llevar.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/107?updatedAt=1786542199" },
      { codigo: "bit-granola-150-g", nombre: "Granola 150 g", precio: 4900, descripcion: "Granola artesanal con frutos secos, coco y semillas, con miel y mascabo.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/84?updatedAt=1786623126" },
      { codigo: "bit-granola-250-g", nombre: "Granola 250 g", precio: 7900, descripcion: "Granola artesanal con frutos secos, coco y semillas, con miel y mascabo.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/85?updatedAt=1786622136" },
      { codigo: "bit-cafe-en-grano-puerto-blest-250-g", nombre: "Café en grano Puerto Blest 250 g", precio: 22500, descripcion: "Café de especialidad en grano.", imagen: "https://fudo-apps-storage.s3.sa-east-1.amazonaws.com/production/354552/common/products/90?updatedAt=1786540845" },
    ],
  },
];
