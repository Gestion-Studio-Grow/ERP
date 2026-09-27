#!/usr/bin/env python3
# Genera el catálogo semilla del supermercado. Desde la raíz del repo:
#   python3 scripts/tenants/supermercado-catalogo.py > src/blueprints/retail/supermercado-catalogo.ts
# Los EAN-13 se CALCULAN (prefijo 779 de Argentina + empresa ficticia + artículo + verificador GS1).
# Precios de ejemplo (ARS, fines de 2026).
import sys

def dv(cuerpo):
    s = 0
    peso = 3
    for ch in reversed(cuerpo):
        s += int(ch) * peso
        peso = 1 if peso == 3 else 3
    return (10 - s % 10) % 10

EMPRESAS = {}
def ean(marca, item):
    if marca not in EMPRESAS:
        EMPRESAS[marca] = 1100 + len(EMPRESAS) * 7
    cuerpo = f"779{EMPRESAS[marca]:04d}{item:05d}"
    assert len(cuerpo) == 12
    return cuerpo + str(dv(cuerpo))

IVA21, IVA105, EXENTO = 5, 4, 2
items = []
contador = {}

def u(seccion, marca, nombre, pres, precio, stock=24, minimo=6, iva=IVA21, validar=None):
    contador[marca] = contador.get(marca, 0) + 1
    items.append(dict(seccion=seccion, sale="u", name=nombre, presentacion=pres, price=precio,
                      stock=stock, minimo=minimo, iva=iva, validar=validar,
                      codigo=ean(marca, contador[marca] * 13)))

PLU = {"verduleria": 100, "fiambreria": 200, "carniceria": 300, "panaderia": 400}
def kg(seccion, nombre, precio, stock=20, minimo=5, iva=IVA21, validar=None):
    PLU[seccion] += 1
    items.append(dict(seccion=seccion, sale="kg", name=nombre, presentacion="kg", pricePerKg=precio,
                      stock=stock, minimo=minimo, iva=iva, validar=validar, codigo=f"{PLU[seccion]:05d}"))

V_CERDO_POLLO = "Carne de cerdo o de ave fresca: 10,5 % según art. 28 de la Ley de IVA para algunas carnes; confirmar si alcanza a esta."
V_LECHE = "Leche fluida sin aditivos vendida a consumidor final: exenta (art. 7 Ley de IVA). El sistema todavía no factura exentos: se factura desde ARCA."
V_PAN_ENVASADO = "Pan y galletitas de harina de trigo van al 10,5 % sólo sin envasar; envasado para la venta, 21 %. Confirmar."
V_HUEVOS = "Huevos frescos: confirmar alícuota con el contador."
V_ARROZ = "Los granos van al 10,5 % excluido el arroz: confirmar."
V_LEGUMBRES = "Legumbres secas (lentejas, porotos, garbanzos): 10,5 % por art. 28; confirmar si el envasado cambia la alícuota."
V_PESCADO = "Pescado fresco o congelado: confirmar alícuota con el contador."
V_HORTALIZA_CONG = "Hortalizas congeladas sin cocción: 10,5 %; si están prefritas o cocidas, 21 %. Confirmar."

# ---------------- ALMACÉN ----------------
A = "almacen"
u(A, "Playadito", "Yerba mate Playadito 1 kg", "1 kg", 5900, 40, 12)
u(A, "Playadito", "Yerba mate Playadito 500 g", "500 g", 3150, 30, 10)
u(A, "Taragüí", "Yerba mate Taragüí con palo 1 kg", "1 kg", 5400, 36, 10)
u(A, "Taragüí", "Yerba mate Taragüí despalada 500 g", "500 g", 2990, 24, 8)
u(A, "La Merced", "Yerba mate La Merced barbacuá 500 g", "500 g", 3490, 18, 6)
u(A, "Cruz de Malta", "Yerba mate Cruz de Malta 1 kg", "1 kg", 5200, 24, 8)
u(A, "Ledesma", "Azúcar Ledesma 1 kg", "1 kg", 1690, 60, 20)
u(A, "Chango", "Azúcar Chango 1 kg", "1 kg", 1590, 40, 12)
u(A, "Ledesma", "Azúcar mascabo Ledesma 500 g", "500 g", 1890, 12, 4)
u(A, "Hileret", "Edulcorante líquido Hileret 200 ml", "200 ml", 2390, 18, 6)
u(A, "Natura", "Aceite de girasol Natura 1,5 L", "1,5 L", 4390, 36, 10)
u(A, "Natura", "Aceite de girasol Natura 900 ml", "900 ml", 2790, 30, 10)
u(A, "Cocinero", "Aceite de girasol Cocinero 1,5 L", "1,5 L", 4190, 30, 10)
u(A, "Cañuelas", "Aceite de maíz Cañuelas 900 ml", "900 ml", 3390, 12, 4)
u(A, "Nucete", "Aceite de oliva extra virgen Nucete 500 ml", "500 ml", 8900, 10, 3)
u(A, "Lucchetti", "Fideos tallarín Lucchetti 500 g", "500 g", 1450, 48, 12)
u(A, "Lucchetti", "Fideos mostachol Lucchetti 500 g", "500 g", 1450, 48, 12)
u(A, "Lucchetti", "Fideos spaghetti Lucchetti 500 g", "500 g", 1450, 40, 12)
u(A, "Matarazzo", "Fideos tirabuzón Matarazzo 500 g", "500 g", 1790, 36, 10)
u(A, "Matarazzo", "Fideos moñito Matarazzo 500 g", "500 g", 1790, 30, 10)
u(A, "Don Vicente", "Fideos al huevo Don Vicente 500 g", "500 g", 2490, 20, 6)
u(A, "Gallo", "Arroz largo fino Gallo Oro 1 kg", "1 kg", 2690, 40, 12, IVA21, V_ARROZ)
u(A, "Gallo", "Arroz doble carolina Gallo 1 kg", "1 kg", 2490, 30, 10, IVA21, V_ARROZ)
u(A, "Gallo", "Arroz integral Gallo 1 kg", "1 kg", 2890, 12, 4, IVA21, V_ARROZ)
u(A, "Dos Hermanos", "Arroz parboil Dos Hermanos 1 kg", "1 kg", 2290, 24, 8, IVA21, V_ARROZ)
u(A, "Blancaflor", "Harina leudante Blancaflor 1 kg", "1 kg", 1690, 24, 8)
u(A, "Pureza", "Harina 000 Pureza 1 kg", "1 kg", 990, 40, 12, IVA105)
u(A, "Morixe", "Harina 0000 Morixe 1 kg", "1 kg", 1090, 30, 10, IVA105)
u(A, "Presto Pronta", "Polenta Presto Pronta 500 g", "500 g", 1290, 24, 8)
u(A, "Maizena", "Almidón de maíz Maizena 500 g", "500 g", 1990, 12, 4)
u(A, "Arcor", "Puré de tomate Arcor 520 g", "520 g", 1090, 48, 12)
u(A, "Arcor", "Tomate triturado Arcor 520 g", "520 g", 1190, 36, 12)
u(A, "La Campagnola", "Tomate perita La Campagnola 400 g", "400 g", 1590, 24, 8)
u(A, "Knorr", "Caldo de carne Knorr x 12 u", "x 12 u", 1690, 30, 10)
u(A, "Knorr", "Caldo de verdura Knorr x 12 u", "x 12 u", 1690, 24, 8)
u(A, "Knorr", "Sopa crema de choclo Knorr 65 g", "65 g", 1390, 20, 6)
u(A, "Hellmann's", "Mayonesa Hellmann's 475 g", "475 g", 3590, 30, 10)
u(A, "Hellmann's", "Mayonesa Hellmann's 237 g", "237 g", 2090, 24, 8)
u(A, "Natura", "Mayonesa Natura 500 g", "500 g", 2890, 24, 8)
u(A, "Hellmann's", "Ketchup Hellmann's 250 g", "250 g", 1990, 18, 6)
u(A, "Savora", "Mostaza Savora 250 g", "250 g", 1790, 18, 6)
u(A, "Menoyo", "Vinagre de alcohol Menoyo 1 L", "1 L", 1290, 18, 6)
u(A, "Dos Anclas", "Sal fina Dos Anclas 500 g", "500 g", 890, 36, 12)
u(A, "Celusal", "Sal gruesa Celusal 1 kg", "1 kg", 1190, 18, 6)
u(A, "Alicante", "Pimienta negra molida Alicante 25 g", "25 g", 1290, 12, 4)
u(A, "Alicante", "Orégano Alicante 25 g", "25 g", 990, 12, 4)
u(A, "La Virginia", "Café molido La Virginia 500 g", "500 g", 9900, 18, 6)
u(A, "Cabrales", "Café molido Cabrales 250 g", "250 g", 5990, 12, 4)
u(A, "Nescafé", "Café instantáneo Nescafé Clásico 170 g", "170 g", 9490, 12, 4)
u(A, "La Virginia", "Té negro La Virginia x 50 u", "x 50 u", 1690, 24, 8)
u(A, "Taragüí", "Té Taragüí x 100 u", "x 100 u", 2790, 18, 6)
u(A, "Cachamate", "Mate cocido Cachamate x 50 u", "x 50 u", 2190, 18, 6)
u(A, "Nesquik", "Cacao en polvo Nesquik 360 g", "360 g", 4390, 18, 6)
u(A, "Toddy", "Cacao en polvo Toddy 360 g", "360 g", 3790, 12, 4)
u(A, "Arcor", "Mermelada de durazno Arcor 454 g", "454 g", 2490, 18, 6)
u(A, "BC", "Mermelada light de frutilla BC 390 g", "390 g", 3190, 12, 4)
u(A, "Chimbote", "Dulce de batata Chimbote 500 g", "500 g", 2190, 12, 4)
u(A, "Arcor", "Duraznos en almíbar Arcor 820 g", "820 g", 3290, 18, 6)
u(A, "La Campagnola", "Arvejas La Campagnola 350 g", "350 g", 990, 30, 10)
u(A, "La Campagnola", "Choclo amarillo cremoso La Campagnola 300 g", "300 g", 1490, 24, 8)
u(A, "Gomes da Costa", "Atún al natural Gomes da Costa 170 g", "170 g", 3490, 24, 8)
u(A, "La Campagnola", "Atún en aceite La Campagnola 170 g", "170 g", 3290, 24, 8)
u(A, "Marolio", "Caballa en aceite Marolio 380 g", "380 g", 2990, 12, 4)
u(A, "Egran", "Lentejas Egran 400 g", "400 g", 1590, 18, 6, IVA105, V_LEGUMBRES)
u(A, "Egran", "Porotos alubia Egran 400 g", "400 g", 1690, 12, 4, IVA105, V_LEGUMBRES)
u(A, "Egran", "Garbanzos Egran 400 g", "400 g", 1890, 12, 4, IVA105, V_LEGUMBRES)
u(A, "Quaker", "Avena arrollada Quaker 400 g", "400 g", 2390, 18, 6)
u(A, "Kellogg's", "Copos de maíz Zucaritas 290 g", "290 g", 4590, 12, 4)
u(A, "Granix", "Galletas de arroz Granix 100 g", "100 g", 1190, 24, 8)
u(A, "Bagley", "Galletitas Criollitas Bagley 3 x 100 g", "3 x 100 g", 1990, 36, 12, IVA21, V_PAN_ENVASADO)
u(A, "Terrabusi", "Galletitas Express Terrabusi 3 x 101 g", "3 x 101 g", 2090, 36, 12, IVA21, V_PAN_ENVASADO)
u(A, "Bagley", "Galletitas Chocolinas 170 g", "170 g", 1690, 36, 12)
u(A, "Oreo", "Galletitas Oreo 118 g", "118 g", 1390, 36, 12)
u(A, "Terrabusi", "Galletitas Variedad Terrabusi 400 g", "400 g", 3190, 24, 8)
u(A, "Bagley", "Galletitas Rumba 112 g", "112 g", 1190, 30, 10)
u(A, "Arcor", "Alfajor triple Tatín x 6 u", "x 6 u", 3490, 18, 6)
u(A, "Havanna", "Alfajores de chocolate Havanna x 6 u", "x 6 u", 12900, 8, 2)
u(A, "Arcor", "Chocolate con leche Arcor 100 g", "100 g", 1890, 30, 10)
u(A, "Milka", "Chocolate Milka con leche 155 g", "155 g", 4590, 18, 6)
u(A, "Georgalos", "Maní con chocolate Georgalos 110 g", "110 g", 1590, 18, 6)
u(A, "Lay's", "Papas fritas Lay's clásicas 134 g", "134 g", 3290, 24, 8)
u(A, "Pehuamar", "Papas fritas Pehuamar 145 g", "145 g", 2690, 24, 8)
u(A, "Doritos", "Snack Doritos queso 150 g", "150 g", 3490, 18, 6)
u(A, "Pehuamar", "Palitos salados Pehuamar 150 g", "150 g", 1990, 18, 6)
u(A, "Fanacoa", "Aceitunas verdes descarozadas Fanacoa 180 g", "180 g", 2190, 18, 6)
u(A, "Ser", "Gelatina de frutilla Ser 25 g", "25 g", 990, 18, 6)
u(A, "Exquisita", "Bizcochuelo de vainilla Exquisita 540 g", "540 g", 2890, 12, 4)
u(A, "Royal", "Polvo de hornear Royal 50 g", "50 g", 890, 12, 4)
u(A, "Ledesma", "Miel pura envasada Ledesma 500 g", "500 g", 4590, 10, 3)
u(A, "Preferido", "Pan rallado Preferido 500 g", "500 g", 1490, 18, 6)
u(A, "Taverniti", "Tapas para empanadas Taverniti x 12 u", "x 12 u", 1890, 20, 6)
u(A, "La Salteña", "Tapas para tarta La Salteña x 2 u", "x 2 u", 2190, 16, 6)
u(A, "Maggi", "Salsa de soja Maggi 150 ml", "150 ml", 1590, 10, 3)
u(A, "Marolio", "Puré de papas instantáneo Marolio 125 g", "125 g", 1290, 12, 4)

# ---------------- BEBIDAS ----------------
B = "bebidas"
u(B, "Coca-Cola", "Gaseosa Coca-Cola 2,25 L", "2,25 L", 4600, 60, 18)
u(B, "Coca-Cola", "Gaseosa Coca-Cola 1,5 L", "1,5 L", 3500, 48, 12)
u(B, "Coca-Cola", "Gaseosa Coca-Cola Sin Azúcar 2,25 L", "2,25 L", 4600, 40, 12)
u(B, "Coca-Cola", "Gaseosa Coca-Cola lata 354 ml", "354 ml", 1490, 72, 24)
u(B, "Coca-Cola", "Gaseosa Sprite 2,25 L", "2,25 L", 4200, 30, 10)
u(B, "Coca-Cola", "Gaseosa Fanta naranja 2,25 L", "2,25 L", 4200, 30, 10)
u(B, "Pepsi", "Gaseosa Pepsi 2 L", "2 L", 3600, 36, 12)
u(B, "Pepsi", "Gaseosa 7Up 2 L", "2 L", 3500, 24, 8)
u(B, "Pepsi", "Gaseosa Paso de los Toros pomelo 1,5 L", "1,5 L", 2900, 24, 8)
u(B, "Manaos", "Gaseosa Manaos cola 2,25 L", "2,25 L", 1990, 48, 12)
u(B, "Manaos", "Gaseosa Manaos lima limón 2,25 L", "2,25 L", 1990, 36, 12)
u(B, "Manaos", "Gaseosa Manaos uva 2,25 L", "2,25 L", 1990, 30, 10)
u(B, "Villavicencio", "Agua mineral Villavicencio sin gas 2 L", "2 L", 1790, 48, 12)
u(B, "Villavicencio", "Agua mineral Villavicencio sin gas 500 ml", "500 ml", 990, 48, 12)
u(B, "Villa del Sur", "Agua mineral Villa del Sur con gas 2 L", "2 L", 1690, 36, 12)
u(B, "Eco de los Andes", "Agua mineral Eco de los Andes 1,5 L", "1,5 L", 1390, 36, 12)
u(B, "Levité", "Agua saborizada Levité pomelo 1,5 L", "1,5 L", 2190, 36, 12)
u(B, "Levité", "Agua saborizada Levité manzana 1,5 L", "1,5 L", 2190, 30, 10)
u(B, "Aquarius", "Agua saborizada Aquarius naranja 1,5 L", "1,5 L", 2390, 24, 8)
u(B, "Cepita", "Jugo Cepita naranja 1 L", "1 L", 2490, 24, 8)
u(B, "Baggio", "Jugo Baggio multifruta 1 L", "1 L", 1490, 36, 12)
u(B, "Tang", "Jugo en polvo Tang naranja 18 g", "18 g", 490, 60, 20)
u(B, "Clight", "Jugo en polvo Clight limonada 8 g", "8 g", 590, 48, 12)
u(B, "Powerade", "Bebida isotónica Powerade 500 ml", "500 ml", 1690, 24, 8)
u(B, "Speed", "Bebida energizante Speed 250 ml", "250 ml", 1590, 24, 8)
u(B, "Quilmes", "Cerveza Quilmes Clásica 1 L", "1 L", 2590, 48, 12)
u(B, "Quilmes", "Cerveza Quilmes Clásica lata 473 ml", "473 ml", 1690, 72, 24)
u(B, "Brahma", "Cerveza Brahma lata 473 ml", "473 ml", 1590, 60, 18)
u(B, "Stella Artois", "Cerveza Stella Artois 1 L", "1 L", 3790, 30, 10)
u(B, "Stella Artois", "Cerveza Stella Artois lata 473 ml", "473 ml", 2290, 48, 12)
u(B, "Heineken", "Cerveza Heineken lata 473 ml", "473 ml", 2390, 48, 12)
u(B, "Andes", "Cerveza Andes Origen roja lata 473 ml", "473 ml", 2190, 36, 12)
u(B, "Patagonia", "Cerveza Patagonia Amber Lager 730 ml", "730 ml", 4590, 18, 6)
u(B, "Corona", "Cerveza Corona 710 ml", "710 ml", 4290, 24, 8)
u(B, "Quilmes", "Pack cerveza Quilmes 6 x 473 ml", "6 x 473 ml", 9490, 12, 4)
u(B, "Toro", "Vino tinto Toro Viejo 1 L", "1 L", 2890, 24, 8)
u(B, "Termidor", "Vino tinto Termidor tetra 1 L", "1 L", 2490, 24, 8)
u(B, "Santa Julia", "Vino Malbec Santa Julia 750 ml", "750 ml", 6490, 18, 6)
u(B, "Alamos", "Vino Malbec Alamos 750 ml", "750 ml", 9900, 12, 4)
u(B, "Trapiche", "Vino Cabernet Trapiche Roble 750 ml", "750 ml", 7490, 12, 4)
u(B, "López", "Vino tinto López 750 ml", "750 ml", 7990, 12, 4)
u(B, "Emilia", "Vino blanco dulce Emilia 750 ml", "750 ml", 5990, 12, 4)
u(B, "Chandon", "Espumante Chandon Extra Brut 750 ml", "750 ml", 18900, 8, 2)
u(B, "Branca", "Fernet Branca 750 ml", "750 ml", 16900, 18, 6)
u(B, "Branca", "Fernet Branca 450 ml", "450 ml", 10900, 12, 4)
u(B, "Gancia", "Aperitivo Gancia americano 950 ml", "950 ml", 7490, 12, 4)
u(B, "Campari", "Aperitivo Campari 750 ml", "750 ml", 12900, 8, 2)
u(B, "Cinzano", "Vermut Cinzano rosso 1 L", "1 L", 7990, 8, 2)
u(B, "Smirnoff", "Vodka Smirnoff 700 ml", "700 ml", 11900, 8, 2)
u(B, "Terma", "Amargo serrano Terma 1,35 L", "1,35 L", 3290, 12, 4)
u(B, "Schweppes", "Agua tónica Schweppes 1,5 L", "1,5 L", 3190, 18, 6)
u(B, "Coca-Cola", "Soda Cimes sifón 2 L", "2 L", 1490, 24, 8)
u(B, "Hielo", "Hielo en cubos 2 kg", "2 kg", 1990, 20, 6)
u(B, "Arizona", "Té helado Arizona 473 ml", "473 ml", 2290, 18, 6)
u(B, "Tropicana", "Jugo Tropicana naranja exprimido 1 L", "1 L", 4290, 10, 3)

# ---------------- LÁCTEOS ----------------
L = "lacteos"
u(L, "La Serenísima", "Leche entera La Serenísima sachet 1 L", "1 L", 1890, 60, 24, EXENTO, V_LECHE)
u(L, "La Serenísima", "Leche descremada La Serenísima sachet 1 L", "1 L", 1890, 48, 18, EXENTO, V_LECHE)
u(L, "La Serenísima", "Leche entera larga vida La Serenísima 1 L", "1 L", 2190, 48, 12, EXENTO, V_LECHE)
u(L, "Sancor", "Leche entera Sancor sachet 1 L", "1 L", 1790, 48, 18, EXENTO, V_LECHE)
u(L, "Sancor", "Leche chocolatada Sancor Yogs 1 L", "1 L", 2890, 18, 6)
u(L, "Ilolay", "Leche en polvo entera Ilolay 800 g", "800 g", 9900, 12, 4, EXENTO, V_LECHE)
u(L, "La Serenísima", "Leche cero lactosa La Serenísima 1 L", "1 L", 2590, 18, 6)
u(L, "La Serenísima", "Yogur bebible frutilla La Serenísima 1 L", "1 L", 3290, 24, 8)
u(L, "Yogurísimo", "Yogur entero con cereales Yogurísimo 165 g", "165 g", 1490, 30, 10)
u(L, "Ser", "Yogur descremado Ser vainilla 190 g", "190 g", 1390, 24, 8)
u(L, "Danone", "Postre Danette chocolate 95 g", "95 g", 1190, 30, 10)
u(L, "La Serenísima", "Manteca La Serenísima 200 g", "200 g", 3490, 30, 10)
u(L, "Sancor", "Manteca Sancor 100 g", "100 g", 1890, 24, 8)
u(L, "La Serenísima", "Crema de leche La Serenísima 200 ml", "200 ml", 2390, 24, 8)
u(L, "La Serenísima", "Dulce de leche La Serenísima clásico 400 g", "400 g", 3190, 30, 10)
u(L, "Sancor", "Dulce de leche Sancor 400 g", "400 g", 2990, 24, 8)
u(L, "Casancrem", "Queso crema Casancrem 290 g", "290 g", 3590, 24, 8)
u(L, "Finlandia", "Queso untable Finlandia 180 g", "180 g", 2990, 24, 8)
u(L, "Mendicrim", "Queso untable Mendicrim 290 g", "290 g", 3290, 18, 6)
u(L, "La Paulina", "Queso rallado La Paulina 150 g", "150 g", 3990, 24, 8)
u(L, "Sancor", "Queso cremoso Sancor horma 500 g", "500 g", 6490, 12, 4)
u(L, "Tregar", "Queso tybo en fetas Tregar 150 g", "150 g", 2990, 18, 6)
u(L, "Milkaut", "Ricota Milkaut 500 g", "500 g", 3490, 12, 4)
u(L, "Ilolay", "Crema chantilly Ilolay 350 ml", "350 ml", 3490, 8, 2)
u(L, "Granja", "Huevos blancos x 12 u", "x 12 u", 4290, 30, 10, IVA21, V_HUEVOS)
u(L, "Granja", "Huevos color x 30 u", "x 30 u", 9900, 12, 4, IVA21, V_HUEVOS)
u(L, "La Serenísima", "Leche Protein La Serenísima 1 L", "1 L", 2790, 12, 4)
u(L, "Sancor", "Yogur firme Sancor frutilla 190 g", "190 g", 1290, 24, 8)
u(L, "Actimel", "Leche fermentada Actimel x 6 u", "x 6 u", 4990, 12, 4)
u(L, "Ser", "Leche Ser descremada 1 L", "1 L", 2390, 18, 6)
u(L, "Nestlé", "Leche condensada Nestlé 395 g", "395 g", 3690, 12, 4)
u(L, "Sancor", "Crema de leche Sancor 350 ml", "350 ml", 3690, 12, 4)
u(L, "Tregar", "Postre de vainilla Tregar 120 g", "120 g", 990, 24, 8)
u(L, "La Serenísima", "Queso Port Salut La Serenísima trozado", "500 g", 6990, 10, 3)
u(L, "Veronica", "Leche entera Verónica sachet 1 L", "1 L", 1690, 36, 12, EXENTO, V_LECHE)
u(L, "Ilolay", "Dulce de leche Ilolay repostero 400 g", "400 g", 2990, 18, 6)

# ---------------- FIAMBRERÍA (al peso y envasados) ----------------
F = "fiambreria"
kg(F, "Jamón cocido natural", 14900, 12, 3)
kg(F, "Jamón cocido Paladini", 17900, 10, 3)
kg(F, "Jamón crudo", 29900, 6, 2)
kg(F, "Paleta cocida", 10900, 12, 3)
kg(F, "Salame milán", 19900, 8, 2)
kg(F, "Salamín picado fino", 21900, 6, 2)
kg(F, "Mortadela con pistacho", 9900, 10, 3)
kg(F, "Bondiola curada", 27900, 5, 1)
kg(F, "Queso cremoso", 12990, 20, 5)
kg(F, "Queso tybo", 13900, 15, 4)
kg(F, "Queso pategrás", 17900, 10, 3)
kg(F, "Queso reggianito", 22900, 8, 2)
kg(F, "Queso provolone", 19900, 6, 2)
kg(F, "Queso azul", 21900, 5, 1)
kg(F, "Queso mozzarella", 11900, 15, 4)
kg(F, "Aceitunas verdes", 8900, 10, 3)
kg(F, "Aceitunas negras", 10900, 8, 2)
kg(F, "Salchichón primavera", 9900, 8, 2)
kg(F, "Pastrón", 24900, 4, 1)
kg(F, "Lomito ahumado", 23900, 4, 1)
u(F, "Paladini", "Salchichas Paladini x 6 u", "x 6 u", 2190, 30, 10)
u(F, "Vienissima", "Salchichas Vienissima x 12 u", "x 12 u", 3490, 24, 8)
u(F, "Paladini", "Jamón cocido en fetas Paladini 150 g", "150 g", 3490, 18, 6)
u(F, "Cagnoli", "Salame tipo milán Cagnoli 250 g", "250 g", 5990, 10, 3)
u(F, "Swift", "Paté de foie Swift 90 g", "90 g", 990, 24, 8)

# ---------------- CARNICERÍA (al peso) ----------------
C = "carniceria"
kg(C, "Asado de tira", 17900, 40, 10, IVA105)
kg(C, "Vacío", 19900, 25, 6, IVA105)
kg(C, "Matambre vacuno", 18900, 12, 3, IVA105)
kg(C, "Bife de chorizo", 22900, 20, 5, IVA105)
kg(C, "Bife ancho", 20900, 15, 4, IVA105)
kg(C, "Lomo", 29900, 10, 3, IVA105)
kg(C, "Cuadril", 19900, 15, 4, IVA105)
kg(C, "Nalga", 20900, 20, 5, IVA105)
kg(C, "Peceto", 22900, 10, 3, IVA105)
kg(C, "Carne picada común", 9900, 30, 8, IVA105)
kg(C, "Carne picada especial", 13900, 25, 6, IVA105)
kg(C, "Osobuco", 9900, 15, 4, IVA105)
kg(C, "Falda", 9490, 12, 3, IVA105)
kg(C, "Roast beef", 16900, 12, 3, IVA105)
kg(C, "Milanesa de nalga", 21900, 20, 5, IVA21)
kg(C, "Hígado vacuno", 5900, 8, 2, IVA105)
kg(C, "Pollo entero", 5490, 40, 10, IVA105, V_CERDO_POLLO)
kg(C, "Pata muslo de pollo", 5990, 30, 8, IVA105, V_CERDO_POLLO)
kg(C, "Pechuga de pollo", 8490, 25, 6, IVA105, V_CERDO_POLLO)
kg(C, "Suprema de pollo", 10900, 20, 5, IVA105, V_CERDO_POLLO)
kg(C, "Milanesa de pollo", 11900, 15, 4, IVA21)
kg(C, "Bondiola de cerdo", 13900, 12, 3, IVA105, V_CERDO_POLLO)
kg(C, "Costilla de cerdo", 11900, 15, 4, IVA105, V_CERDO_POLLO)
kg(C, "Chorizo parrillero", 9900, 20, 5, IVA21)
kg(C, "Morcilla", 7900, 12, 3, IVA21)

# ---------------- VERDULERÍA ----------------
V = "verduleria"
for nombre, precio, stock in [
    ("Papa", 1490, 120), ("Batata", 1990, 40), ("Cebolla", 1690, 80), ("Cebolla morada", 2290, 20),
    ("Tomate redondo", 2990, 50), ("Tomate perita", 2790, 40), ("Zanahoria", 1590, 50), ("Zapallo anco", 1790, 40),
    ("Zapallito redondo", 2490, 25), ("Morrón rojo", 5990, 20), ("Morrón verde", 3990, 20), ("Berenjena", 2790, 15),
    ("Pepino", 2490, 15), ("Ajo", 7900, 8), ("Remolacha", 1990, 20), ("Choclo", 1990, 20),
    ("Manzana roja", 3290, 60), ("Manzana verde", 3490, 30), ("Pera", 3290, 30), ("Banana", 2690, 70),
    ("Naranja de jugo", 1490, 80), ("Mandarina", 1990, 50), ("Limón", 2490, 40), ("Pomelo rosado", 1990, 25),
    ("Frutilla", 7900, 12), ("Uva blanca", 5490, 15), ("Durazno", 4290, 20), ("Kiwi", 6900, 10),
]:
    kg(V, nombre, precio, stock, max(3, stock // 5), IVA105)
u(V, "Huerta", "Lechuga mantecosa", "1 u", 1490, 30, 10, IVA105)
u(V, "Huerta", "Acelga atado", "1 u", 1690, 20, 6, IVA105)
u(V, "Huerta", "Espinaca atado", "1 u", 1990, 20, 6, IVA105)
u(V, "Huerta", "Perejil atado", "1 u", 790, 20, 6, IVA105)
u(V, "Huerta", "Palta Hass", "1 u", 1990, 30, 10, IVA105)
u(V, "Huerta", "Ananá", "1 u", 4990, 10, 3, IVA105)
u(V, "Huerta", "Champiñones bandeja 200 g", "200 g", 3490, 12, 4, IVA105)

# ---------------- PANADERÍA ----------------
P = "panaderia"
kg(P, "Pan francés", 3990, 30, 8, IVA105)
kg(P, "Pan de campo", 5490, 12, 3, IVA105)
kg(P, "Pan de salvado", 5990, 8, 2, IVA105)
kg(P, "Galletitas de agua sueltas", 5990, 6, 2, IVA105)
u(P, "Panadería", "Facturas surtidas x 12 u", "x 12 u", 9900, 10, 3, IVA105)
u(P, "Panadería", "Medialunas de manteca x 6 u", "x 6 u", 4990, 12, 4, IVA105)
u(P, "Panadería", "Prepizza x 2 u", "x 2 u", 3490, 12, 4, IVA21)
u(P, "Panadería", "Pan de hamburguesa casero x 4 u", "x 4 u", 2490, 12, 4, IVA105)
u(P, "Panadería", "Chipá 250 g", "250 g", 3490, 10, 3, IVA21)
u(P, "Panadería", "Budín de limón casero", "1 u", 4490, 8, 2, IVA21)
u(P, "Panadería", "Torta de ricota", "1 u", 12900, 4, 1, IVA21)
u(P, "Bimbo", "Pan lactal blanco Bimbo 390 g", "390 g", 3590, 20, 6, IVA21, V_PAN_ENVASADO)
u(P, "Bimbo", "Pan lactal integral Bimbo 390 g", "390 g", 3790, 15, 4, IVA21, V_PAN_ENVASADO)
u(P, "Fargo", "Pan lactal Fargo 350 g", "350 g", 3290, 15, 4, IVA21, V_PAN_ENVASADO)
u(P, "Bimbo", "Pan para hamburguesa Bimbo x 4 u", "x 4 u", 2690, 18, 6, IVA21, V_PAN_ENVASADO)
u(P, "Bimbo", "Pan para pancho Bimbo x 6 u", "x 6 u", 2390, 18, 6, IVA21, V_PAN_ENVASADO)
u(P, "Lactal", "Tostadas de pan Lactal 200 g", "200 g", 2290, 12, 4, IVA21, V_PAN_ENVASADO)
u(P, "Bimbo", "Budín marmolado Bimbo 215 g", "215 g", 2490, 12, 4)
u(P, "Don Satur", "Bizcochos de grasa Don Satur 200 g", "200 g", 1690, 24, 8, IVA21, V_PAN_ENVASADO)
u(P, "Panadería", "Grisines 200 g", "200 g", 1990, 12, 4, IVA21, V_PAN_ENVASADO)

# ---------------- CONGELADOS ----------------
Z = "congelados"
u(Z, "Paty", "Hamburguesas Paty clásicas x 4 u", "x 4 u", 5490, 24, 8)
u(Z, "Swift", "Hamburguesas Swift x 4 u", "x 4 u", 4990, 18, 6)
u(Z, "Granja del Sol", "Medallones de pollo Granja del Sol x 4 u", "x 4 u", 3990, 18, 6)
u(Z, "Granja del Sol", "Bocaditos de pollo Granja del Sol 400 g", "400 g", 4990, 12, 4)
u(Z, "Granja del Sol", "Espinaca congelada Granja del Sol 500 g", "500 g", 2890, 12, 4, IVA105, V_HORTALIZA_CONG)
u(Z, "McCain", "Papas prefritas McCain 720 g", "720 g", 4590, 18, 6)
u(Z, "McCain", "Papas noisettes McCain 500 g", "500 g", 4290, 12, 4)
u(Z, "La Salteña", "Ravioles de verdura La Salteña 500 g", "500 g", 3990, 12, 4)
u(Z, "Sibarita", "Pizza muzzarella congelada Sibarita", "1 u", 5990, 10, 3)
u(Z, "Frigor", "Helado Frigor vainilla y chocolate 1 kg", "1 kg", 7990, 10, 3)
u(Z, "Grido", "Helado Grido dulce de leche 1 kg", "1 kg", 8490, 8, 2)
u(Z, "Frigor", "Palitos helados Frigor x 6 u", "x 6 u", 4490, 10, 3)
u(Z, "Pescadería", "Filet de merluza congelado 1 kg", "1 kg", 11900, 10, 3, IVA21, V_PESCADO)
u(Z, "Granja del Sol", "Medallones de merluza x 4 u", "x 4 u", 4290, 12, 4, IVA21, V_PESCADO)
u(Z, "Granja del Sol", "Arvejas congeladas 500 g", "500 g", 2690, 10, 3, IVA105, V_HORTALIZA_CONG)
u(Z, "Granja del Sol", "Mix de vegetales congelados 500 g", "500 g", 2990, 10, 3, IVA105, V_HORTALIZA_CONG)
u(Z, "Granja del Sol", "Choclo desgranado congelado 500 g", "500 g", 2790, 10, 3, IVA105, V_HORTALIZA_CONG)
u(Z, "La Salteña", "Empanadas de carne congeladas x 12 u", "x 12 u", 9900, 8, 2)
u(Z, "Sadia", "Nuggets de pollo Sadia 300 g", "300 g", 4990, 12, 4)
u(Z, "Swift", "Milanesas de soja Swift x 4 u", "x 4 u", 3490, 12, 4)
u(Z, "Frutas", "Frutillas congeladas 500 g", "500 g", 4490, 8, 2, IVA105, V_HORTALIZA_CONG)
u(Z, "Frigor", "Postre helado almendrado 1 u", "1 u", 6990, 6, 2)
u(Z, "Swift", "Patitas de pollo Swift 500 g", "500 g", 3990, 12, 4)
u(Z, "Vigor", "Hielo en rolitos 3 kg", "3 kg", 2690, 15, 5)
u(Z, "Granja del Sol", "Brócoli congelado 400 g", "400 g", 3290, 8, 2, IVA105, V_HORTALIZA_CONG)

# ---------------- LIMPIEZA ----------------
Q = "limpieza"
u(Q, "Ayudín", "Lavandina Ayudín 2 L", "2 L", 2290, 30, 10)
u(Q, "Ayudín", "Lavandina Ayudín en gel 700 ml", "700 ml", 2490, 18, 6)
u(Q, "Magistral", "Detergente Magistral limón 500 ml", "500 ml", 2990, 30, 10)
u(Q, "Magistral", "Detergente Magistral 300 ml", "300 ml", 1990, 24, 8)
u(Q, "Cif", "Detergente Cif limón 750 ml", "750 ml", 3290, 18, 6)
u(Q, "Ala", "Jabón líquido Ala para diluir 500 ml", "500 ml", 4290, 18, 6)
u(Q, "Skip", "Jabón líquido Skip 3 L", "3 L", 14900, 12, 4)
u(Q, "Skip", "Jabón en polvo Skip 800 g", "800 g", 6990, 12, 4)
u(Q, "Ariel", "Jabón en polvo Ariel 800 g", "800 g", 6490, 12, 4)
u(Q, "Comfort", "Suavizante Comfort 900 ml", "900 ml", 3990, 18, 6)
u(Q, "Vivere", "Suavizante Vivere 900 ml", "900 ml", 3490, 18, 6)
u(Q, "Cif", "Limpiador cremoso Cif 750 ml", "750 ml", 3490, 18, 6)
u(Q, "Mr. Músculo", "Limpiador de cocina Mr. Músculo 500 ml", "500 ml", 3990, 12, 4)
u(Q, "Procenex", "Limpiador de pisos Procenex lavanda 900 ml", "900 ml", 1990, 24, 8)
u(Q, "Poett", "Limpiador de pisos Poett primavera 1,8 L", "1,8 L", 3490, 18, 6)
u(Q, "Lysoform", "Desinfectante en aerosol Lysoform 360 ml", "360 ml", 5490, 12, 4)
u(Q, "Glade", "Desodorante de ambiente Glade 360 ml", "360 ml", 3990, 12, 4)
u(Q, "Raid", "Insecticida Raid mata moscas y mosquitos 360 ml", "360 ml", 5990, 10, 3)
u(Q, "Fuyi", "Espiral Fuyi x 12 u", "x 12 u", 2490, 12, 4)
u(Q, "Higienol", "Papel higiénico Higienol x 4 u", "x 4 u", 2990, 36, 12)
u(Q, "Elite", "Papel higiénico Elite doble hoja x 4 u", "x 4 u", 3890, 30, 10)
u(Q, "Sussex", "Rollo de cocina Sussex x 3 u", "x 3 u", 3490, 24, 8)
u(Q, "Elite", "Servilletas Elite x 70 u", "x 70 u", 1290, 18, 6)
u(Q, "Virulana", "Esponja de acero Virulana x 10 u", "x 10 u", 1290, 18, 6)
u(Q, "Mortimer", "Esponja multiuso Mortimer x 3 u", "x 3 u", 1590, 18, 6)
u(Q, "Consorcio", "Bolsas de residuo 50 x 70 x 10 u", "x 10 u", 1690, 24, 8)
u(Q, "Harpic", "Limpiador de inodoros Harpic 500 ml", "500 ml", 3690, 10, 3)
u(Q, "Blem", "Lustramuebles Blem 360 ml", "360 ml", 4290, 8, 2)
u(Q, "Off", "Repelente Off crema 60 g", "60 g", 5490, 10, 3)
u(Q, "Vim", "Lavavajillas Vim polvo 500 g", "500 g", 1990, 10, 3)
u(Q, "Querubín", "Trapo de piso gris", "1 u", 1990, 18, 6)
u(Q, "Querubín", "Rejilla de cocina x 2 u", "x 2 u", 1490, 18, 6)
u(Q, "Clorox", "Lavandina Clorox 1 L", "1 L", 1690, 18, 6)
u(Q, "Ala", "Jabón en pan Ala 200 g", "200 g", 1190, 18, 6)
u(Q, "Fósforos", "Fósforos Tres Patitos x 10 cajas", "x 10 u", 1690, 12, 4)

# ---------------- PERFUMERÍA ----------------
R = "perfumeria"
u(R, "Dove", "Jabón de tocador Dove 90 g", "90 g", 1690, 36, 12)
u(R, "Rexona", "Jabón de tocador Rexona x 3 u", "x 3 u", 2990, 24, 8)
u(R, "Lux", "Jabón de tocador Lux 125 g", "125 g", 1190, 30, 10)
u(R, "Plusbelle", "Shampoo Plusbelle 1 L", "1 L", 4990, 12, 4)
u(R, "Sedal", "Shampoo Sedal 340 ml", "340 ml", 4290, 18, 6)
u(R, "Sedal", "Acondicionador Sedal 340 ml", "340 ml", 4290, 18, 6)
u(R, "Pantene", "Shampoo Pantene 400 ml", "400 ml", 6490, 12, 4)
u(R, "Head & Shoulders", "Shampoo Head & Shoulders 375 ml", "375 ml", 7490, 12, 4)
u(R, "Rexona", "Desodorante Rexona aerosol 150 ml", "150 ml", 3990, 24, 8)
u(R, "Axe", "Desodorante Axe aerosol 150 ml", "150 ml", 4290, 18, 6)
u(R, "Dove", "Desodorante Dove aerosol 150 ml", "150 ml", 4290, 18, 6)
u(R, "Colgate", "Pasta dental Colgate Total 90 g", "90 g", 3290, 24, 8)
u(R, "Colgate", "Pasta dental Colgate triple acción 70 g", "70 g", 1990, 30, 10)
u(R, "Oral-B", "Cepillo de dientes Oral-B", "1 u", 2490, 18, 6)
u(R, "Colgate", "Enjuague bucal Colgate Plax 250 ml", "250 ml", 3990, 10, 3)
u(R, "Gillette", "Máquina de afeitar Gillette Prestobarba x 2 u", "x 2 u", 3490, 12, 4)
u(R, "Gillette", "Espuma de afeitar Gillette 150 ml", "150 ml", 4990, 8, 2)
u(R, "Always", "Toallas femeninas Always x 8 u", "x 8 u", 2490, 18, 6)
u(R, "Doncella", "Toallas femeninas Doncella x 8 u", "x 8 u", 1990, 18, 6)
u(R, "Carefree", "Protectores diarios Carefree x 20 u", "x 20 u", 2690, 12, 4)
u(R, "Pampers", "Pañales Pampers Confort Sec G x 36 u", "x 36 u", 19900, 8, 2)
u(R, "Huggies", "Pañales Huggies Classic M x 40 u", "x 40 u", 18900, 8, 2)
u(R, "Estrella", "Algodón Estrella 70 g", "70 g", 1590, 12, 4)
u(R, "Johnson's", "Hisopos Johnson's x 100 u", "x 100 u", 1990, 12, 4)
u(R, "Nivea", "Crema Nivea lata 150 ml", "150 ml", 5990, 10, 3)
u(R, "Hinds", "Crema de manos Hinds 125 ml", "125 ml", 3490, 10, 3)
u(R, "Johnson's", "Shampoo Johnson's baby 400 ml", "400 ml", 5990, 8, 2)
u(R, "Espadol", "Alcohol en gel Espadol 250 ml", "250 ml", 2990, 12, 4)
u(R, "Porta", "Alcohol etílico Porta 500 ml", "500 ml", 2490, 12, 4)
u(R, "Curitas", "Apósitos Curitas x 20 u", "x 20 u", 2290, 10, 3)

# ---------------- salida ----------------
codigos = [i["codigo"] for i in items]
assert len(codigos) == len(set(codigos)), "códigos repetidos"
nombres = [i["name"] for i in items]
assert len(nombres) == len(set(nombres)), [n for n in nombres if nombres.count(n) > 1]

def ts_str(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'

out = []
out.append("// ============================================================================")
out.append("// CATÁLOGO SEMILLA DEL SUPERMERCADO — generado, no editar a mano.")
out.append("// ============================================================================")
out.append("//")
out.append("// Lo genera scripts/tenants/supermercado-catalogo.py (EAN-13 CALCULADOS con su dígito")
out.append("// verificador; los productos al peso llevan el código de la balanza, PLU de 5 dígitos).")
out.append("// PRECIOS DE EJEMPLO (ARS, fines de 2026) y CÓDIGOS DE EJEMPLO: prefijo 779 de Argentina con")
out.append("// números de empresa inventados. No son los de ningún proveedor: el negocio los reemplaza por")
out.append("// los de su mercadería (el lector los toma solo al cargar el producto). Las marcas están para")
out.append("// que la demo se parezca a una góndola de acá; no hay acuerdo con ninguna.")
out.append("//")
out.append("// IVA: `alicuotaIva` es el código de ARCA (5 = 21 %, 4 = 10,5 %, 2 = exento). `ivaAValidar`")
out.append("// dice por qué esa alícuota hay que confirmarla con el contador del negocio.")
out.append("")
out.append('import type { SuperCatalogItem } from "./supermercado-tipos";')
out.append("")
out.append("export const CATALOGO_SUPERMERCADO: readonly SuperCatalogItem[] = [")
for i in items:
    campos = [f"name: {ts_str(i['name'])}", f"seccion: \"{i['seccion']}\"", f"codigo: \"{i['codigo']}\""]
    if i["sale"] == "kg":
        campos.append('sale: "kg"')
        campos.append(f"pricePerKg: {i['pricePerKg']}")
    else:
        campos.append('sale: "u"')
        campos.append(f"price: {i['price']}")
        campos.append(f"presentacion: {ts_str(i['presentacion'])}")
    campos.append(f"stock: {i['stock']}")
    campos.append(f"minimo: {i['minimo']}")
    campos.append(f"alicuotaIva: {i['iva']}")
    if i["validar"]:
        campos.append(f"ivaAValidar: {ts_str(i['validar'])}")
    out.append("  { " + ", ".join(campos) + " },")
out.append("];")
print("\n".join(out))
from collections import Counter
print(f"// {len(items)} productos: " + ", ".join(f"{k} {v}" for k, v in Counter(i['seccion'] for i in items).items()), file=sys.stderr)
