export interface ProductIcon {
  key: string;
  label: string;
  url: string;
  category?: string;
}

export const PRODUCT_ICONS: ProductIcon[] = [
  // Comidas rápidas
  { key: 'pizza', label: 'Pizza', url: '/placeholders/pizza.svg', category: 'Comidas' },
  { key: 'empanadas', label: 'Empanadas', url: '/placeholders/empanadas.svg', category: 'Comidas' },
  { key: 'hamburguesa', label: 'Hamburguesa', url: '/placeholders/hamburguesa.svg', category: 'Comidas' },
  { key: 'milanesa', label: 'Milanesa', url: '/placeholders/milanesa.svg', category: 'Comidas' },
  { key: 'pollo', label: 'Pollo', url: '/placeholders/pollo.svg', category: 'Comidas' },
  { key: 'papas', label: 'Papas fritas', url: '/placeholders/papas.svg', category: 'Comidas' },
  { key: 'sandwich', label: 'Sándwich', url: '/placeholders/sandwich.svg', category: 'Comidas' },
  { key: 'pan', label: 'Pan / Bocadito', url: '/placeholders/pan.svg', category: 'Comidas' },
  { key: 'pasta', label: 'Pasta', url: '/placeholders/pasta.svg', category: 'Comidas' },
  { key: 'ravioles', label: 'Ravioles', url: '/placeholders/pasta.svg', category: 'Comidas' },
  { key: 'ñoquis', label: 'Ñoquis', url: '/placeholders/pasta.svg', category: 'Comidas' },
  { key: 'lasaña', label: 'Lasaña', url: '/placeholders/pasta.svg', category: 'Comidas' },
  { key: 'tacos', label: 'Tacos', url: '/placeholders/pizza.svg', category: 'Comidas' },
  { key: 'burritos', label: 'Burritos', url: '/placeholders/sandwich.svg', category: 'Comidas' },
  { key: 'kebab', label: 'Kebab', url: '/placeholders/sandwich.svg', category: 'Comidas' },
  { key: 'shawarma', label: 'Shawarma', url: '/placeholders/sandwich.svg', category: 'Comidas' },
  { key: 'hotdog', label: 'Panchos', url: '/placeholders/sandwich.svg', category: 'Comidas' },
  { key: 'lomito', label: 'Lomito', url: '/placeholders/hamburguesa.svg', category: 'Comidas' },
  { key: 'chivito', label: 'Chivito', url: '/placeholders/hamburguesa.svg', category: 'Comidas' },
  { key: 'asado', label: 'Asado', url: '/placeholders/pollo.svg', category: 'Comidas' },
  { key: 'parrilla', label: 'Parrilla', url: '/placeholders/pollo.svg', category: 'Comidas' },
  { key: 'sushi', label: 'Sushi', url: '/placeholders/sushi.svg', category: 'Comidas' },
  { key: 'sashimi', label: 'Sashimi', url: '/placeholders/sushi.svg', category: 'Comidas' },
  { key: 'comida-china', label: 'Comida China', url: '/placeholders/sushi.svg', category: 'Comidas' },
  { key: 'wok', label: 'Wok', url: '/placeholders/pasta.svg', category: 'Comidas' },

  // Saludables
  { key: 'ensalada', label: 'Ensalada', url: '/placeholders/ensalada.svg', category: 'Saludable' },
  { key: 'bowls', label: 'Bowls', url: '/placeholders/ensalada.svg', category: 'Saludable' },
  { key: 'wrap', label: 'Wrap Saludable', url: '/placeholders/sandwich.svg', category: 'Saludable' },
  { key: 'vegano', label: 'Vegano/Vegetariano', url: '/placeholders/ensalada.svg', category: 'Saludable' },

  // Bebidas
  { key: 'bebidas', label: 'Bebidas', url: '/placeholders/bebidas.svg', category: 'Bebidas' },
  { key: 'gaseosa', label: 'Gaseosa', url: '/placeholders/bebidas.svg', category: 'Bebidas' },
  { key: 'agua', label: 'Agua', url: '/placeholders/agua.svg', category: 'Bebidas' },
  { key: 'agua-gas', label: 'Agua con gas', url: '/placeholders/agua.svg', category: 'Bebidas' },
  { key: 'jugo', label: 'Jugo', url: '/placeholders/bebidas.svg', category: 'Bebidas' },
  { key: 'jugo-natural', label: 'Jugo Natural', url: '/placeholders/bebidas.svg', category: 'Bebidas' },
  { key: 'smoothie', label: 'Smoothie', url: '/placeholders/bebidas.svg', category: 'Bebidas' },
  { key: 'licuado', label: 'Licuado', url: '/placeholders/bebidas.svg', category: 'Bebidas' },
  { key: 'cafe', label: 'Café', url: '/placeholders/cafe.svg', category: 'Bebidas' },
  { key: 'capuccino', label: 'Capuchino', url: '/placeholders/cafe.svg', category: 'Bebidas' },
  { key: 'latte', label: 'Latte', url: '/placeholders/cafe.svg', category: 'Bebidas' },
  { key: 'te', label: 'Té / Infusión', url: '/placeholders/cafe.svg', category: 'Bebidas' },
  { key: 'mate', label: 'Mate', url: '/placeholders/cafe.svg', category: 'Bebidas' },
  { key: 'terere', label: 'Tereré', url: '/placeholders/cafe.svg', category: 'Bebidas' },
  { key: 'cerveza', label: 'Cerveza', url: '/placeholders/cerveza.svg', category: 'Bebidas' },
  { key: 'cerveza-artesanal', label: 'Cerveza Artesanal', url: '/placeholders/cerveza.svg', category: 'Bebidas' },
  { key: 'vino', label: 'Vino', url: '/placeholders/vino.svg', category: 'Bebidas' },
  { key: 'whisky', label: 'Whisky', url: '/placeholders/vino.svg', category: 'Bebidas' },
  { key: 'ron', label: 'Ron', url: '/placeholders/vino.svg', category: 'Bebidas' },
  { key: 'gin', label: 'Gin', url: '/placeholders/vino.svg', category: 'Bebidas' },
  { key: 'fernet', label: 'Fernet', url: '/placeholders/vino.svg', category: 'Bebidas' },
  { key: 'coctel', label: 'Cóctel', url: '/placeholders/bebidas.svg', category: 'Bebidas' },

  // Postres
  { key: 'helado', label: 'Helado', url: '/placeholders/helado.svg', category: 'Postres' },
  { key: 'helado-palito', label: 'Palito', url: '/placeholders/helado.svg', category: 'Postres' },
  { key: 'helado-cucurucho', label: 'Cucurucho', url: '/placeholders/helado.svg', category: 'Postres' },
  { key: 'postre', label: 'Postre', url: '/placeholders/postre.svg', category: 'Postres' },
  { key: 'flan', label: 'Flan', url: '/placeholders/postre.svg', category: 'Postres' },
  { key: 'chocotorta', label: 'Chocotorta', url: '/placeholders/torta.svg', category: 'Postres' },
  { key: 'torta', label: 'Torta', url: '/placeholders/torta.svg', category: 'Postres' },
  { key: 'torta-cumple', label: 'Torta de Cumpleaños', url: '/placeholders/torta.svg', category: 'Postres' },
  { key: 'cheesecake', label: 'Cheesecake', url: '/placeholders/torta.svg', category: 'Postres' },
  { key: 'brownie', label: 'Brownie', url: '/placeholders/postre.svg', category: 'Postres' },
  { key: 'alfajor', label: 'Alfajor', url: '/placeholders/postre.svg', category: 'Postres' },
  { key: 'factura', label: 'Factura', url: '/placeholders/pan.svg', category: 'Postres' },
  { key: 'medialuna', label: 'Medialuna', url: '/placeholders/pan.svg', category: 'Postres' },
  { key: 'croissant', label: 'Croissant', url: '/placeholders/pan.svg', category: 'Postres' },
  { key: 'donut', label: 'Donut', url: '/placeholders/postre.svg', category: 'Postres' },
  { key: 'mousse', label: 'Mousse', url: '/placeholders/postre.svg', category: 'Postres' },
  { key: 'fruta', label: 'Fruta', url: '/placeholders/ensalada.svg', category: 'Postres' },

  // Desayuno/Merienda
  { key: 'desayuno', label: 'Desayuno', url: '/placeholders/pan.svg', category: 'Desayuno' },
  { key: 'merienda', label: 'Merienda', url: '/placeholders/pan.svg', category: 'Desayuno' },
  { key: 'toast', label: 'Tostado', url: '/placeholders/sandwich.svg', category: 'Desayuno' },
  { key: 'tostadas', label: 'Tostadas', url: '/placeholders/pan.svg', category: 'Desayuno' },
  { key: 'yogurt', label: 'Yogurt', url: '/placeholders/bebidas.svg', category: 'Desayuno' },
  { key: 'granola', label: 'Granola/Cereal', url: '/placeholders/bebidas.svg', category: 'Desayuno' },
  { key: 'huevos', label: 'Huevos', url: '/placeholders/pan.svg', category: 'Desayuno' },

  // Almacén / Kiosco
  { key: 'almacen', label: 'Almacén', url: '/placeholders/almacen.svg', category: 'Almacén' },
  { key: 'golosinas', label: 'Golosinas', url: '/placeholders/postre.svg', category: 'Almacén' },
  { key: 'chicles', label: 'Chicles', url: '/placeholders/postre.svg', category: 'Almacén' },
  { key: 'galletas', label: 'Galletas', url: '/placeholders/postre.svg', category: 'Almacén' },
  { key: 'snacks', label: 'Snacks', url: '/placeholders/papas.svg', category: 'Almacén' },
  { key: 'papas-bolsa', label: 'Papas en bolsa', url: '/placeholders/papas.svg', category: 'Almacén' },
  { key: 'maní', label: 'Maní', url: '/placeholders/postre.svg', category: 'Almacén' },
  { key: 'cigarrillos', label: 'Cigarrillos', url: '/placeholders/cigarrillos.svg', category: 'Almacén' },
  { key: 'tabaco', label: 'Tabaco', url: '/placeholders/cigarrillos.svg', category: 'Almacén' },
  { key: 'encendedores', label: 'Encendedores', url: '/placeholders/almacen.svg', category: 'Almacén' },

  // Limpieza / Hogar
  { key: 'limpieza', label: 'Limpieza', url: '/placeholders/almacen.svg', category: 'Hogar' },
  { key: 'detergente', label: 'Detergente', url: '/placeholders/almacen.svg', category: 'Hogar' },
  { key: 'papel-higienico', label: 'Papel Higiénico', url: '/placeholders/almacen.svg', category: 'Hogar' },
  { key: 'jabón', label: 'Jabón', url: '/placeholders/almacen.svg', category: 'Hogar' },
  { key: 'desodorante', label: 'Desodorante', url: '/placeholders/almacen.svg', category: 'Hogar' },

  // Farmacia / Cuidado
  { key: 'farmacia', label: 'Farmacia', url: '/placeholders/almacen.svg', category: 'Salud' },
  { key: 'medicamentos', label: 'Medicamentos', url: '/placeholders/almacen.svg', category: 'Salud' },
  { key: 'vitaminas', label: 'Vitaminas', url: '/placeholders/almacen.svg', category: 'Salud' },
  { key: 'higiene', label: 'Higiene Personal', url: '/placeholders/almacen.svg', category: 'Salud' },

  // Mascotas
  { key: 'mascotas', label: 'Mascotas', url: '/placeholders/almacen.svg', category: 'Mascotas' },
  { key: 'alimento-perro', label: 'Alimento Perro', url: '/placeholders/almacen.svg', category: 'Mascotas' },
  { key: 'alimento-gato', label: 'Alimento Gato', url: '/placeholders/almacen.svg', category: 'Mascotas' },
  { key: 'juguetes-mascotas', label: 'Juguetes', url: '/placeholders/almacen.svg', category: 'Mascotas' },

  // Comercios varios
  { key: 'ferreteria', label: 'Ferretería', url: '/placeholders/ferreteria.svg', category: 'Varios' },
  { key: 'indumentaria', label: 'Indumentaria', url: '/placeholders/indumentaria.svg', category: 'Varios' },
  { key: 'tecnologia', label: 'Tecnología', url: '/placeholders/tecnologia.svg', category: 'Varios' },
  { key: 'regalos', label: 'Regalos', url: '/placeholders/postre.svg', category: 'Varios' },
  { key: 'flores', label: 'Flores', url: '/placeholders/ensalada.svg', category: 'Varios' },
  { key: 'cigarreria', label: 'Cigarrería', url: '/placeholders/cigarrillos.svg', category: 'Varios' },
  { key: 'kiosco', label: 'Kiosco', url: '/placeholders/almacen.svg', category: 'Varios' },
  { key: 'minimercado', label: 'Minimercado', url: '/placeholders/almacen.svg', category: 'Varios' },
  { key: 'panaderia', label: 'Panadería', url: '/placeholders/pan.svg', category: 'Varios' },
  { key: 'pasteleria', label: 'Pastelería', url: '/placeholders/torta.svg', category: 'Varios' },
  { key: 'pizzeria', label: 'Pizzería', url: '/placeholders/pizza.svg', category: 'Varios' },
  { key: 'rotiseria', label: 'Rotisería', url: '/placeholders/pollo.svg', category: 'Varios' },
  { key: 'confiteria', label: 'Confitería', url: '/placeholders/postre.svg', category: 'Varios' },

  // Extras
  { key: 'combo', label: 'Combo', url: '/placeholders/hamburguesa.svg', category: 'Extras' },
  { key: 'menu', label: 'Menú', url: '/placeholders/sandwich.svg', category: 'Extras' },
  { key: 'promocion', label: 'Promoción', url: '/placeholders/postre.svg', category: 'Extras' },
  { key: 'adicional', label: 'Adicional', url: '/placeholders/papas.svg', category: 'Extras' },
  { key: 'guarnicion', label: 'Guarnición', url: '/placeholders/papas.svg', category: 'Extras' },
  { key: 'salsa', label: 'Salsa', url: '/placeholders/almacen.svg', category: 'Extras' },
];