import type { MenuTemplate, MenuTemplateCategory, MenuTemplateItem } from './menu_templates_data';
import { normalizeMenuText } from './menu_identity';
import { starterDishPhoto, starterCategoryPhoto } from '../../utils/src/dish_photos';
import { categoryVisual } from '../../utils/src/category_visuals';

// Explicit dish mappings, never a random cuisine image. Unknown dishes show a neutral placeholder.
export const TEMPLATE_DISH_IMAGES: Record<string, string> = {
  'Margherita Pizza': 'pizza/margherita.jpg', 'Margherita Basilico': 'pizza/margherita.jpg',
  'White Sauce Pasta': 'pizza/alfredo-pasta.jpg',
  'Creamy Alfredo White Sauce Penne': 'pizza/alfredo-pasta.jpg',
  'Butter Naan': 'north-indian/butter-naan.jpg', 'Garlic Naan': 'north-indian/garlic-naan.jpg', 'Garlic Butter Naan': 'north-indian/garlic-naan.jpg',
  'Paneer Tikka': 'north-indian/paneer-tikka.jpg', 'Paneer Tikka Angara': 'north-indian/paneer-tikka.jpg',
  'Paneer Butter Masala': 'north-indian/paneer-butter-masala.jpg', 'Dal Makhani': 'north-indian/dal-makhani.jpg', 'Dal Makhani Bukhara': 'north-indian/dal-makhani.jpg',
  'Hara Bhara Kebab': 'north-indian/hara-bhara-kebab.jpg', 'Hara Bhara Kebab (6 Pcs)': 'north-indian/hara-bhara-kebab.jpg',
  'Gulab Jamun': 'desserts/gulab-jamun.jpg', 'Shahi Gulab Jamun (2 Pcs)': 'desserts/gulab-jamun.jpg',
  'Cold Coffee': 'beverages/cold-coffee.jpg', 'Cold Coffee with Vanilla Ice Cream': 'beverages/cold-coffee.jpg',
  'Gujarati Grand Thali': 'thali/gujarati-thali.jpg', 'Authentic Gujarati Special Thali': 'thali/gujarati-thali.jpg',
  'Veg Dum Biryani': 'biryani/royal-veg-biryani.jpg', 'Royal Veg Handi Dum Biryani': 'biryani/royal-veg-biryani.jpg',
  'Masala Dosa': 'south-indian/masala-dosa.jpg', 'Mysore Masala Dosa': 'south-indian/mysore-dosa.jpg',
  'Filter Coffee': 'south-indian/filter-coffee.jpg', 'Cappuccino': 'cafe/cappuccino.jpg',
  'Veg Hakka Noodles': 'chinese/hakka-noodles.jpg', 'Chilli Paneer': 'chinese/chilli-paneer.jpg',
  'Chocolate Brownie': 'bakery/choco-lava.jpg', 'Samosa 2 Pieces': 'snacks/samosa.jpg', 'Cheese Grilled Sandwich': 'fast-food/sandwich.jpg', 
};
const images = new Map(Object.entries(TEMPLATE_DISH_IMAGES).map(([name, file]) => [normalizeMenuText(name), `/assets/menu/${file}`]));
export const templateDishImage = (name: string): string => starterDishPhoto(name) || images.get(normalizeMenuText(name)) || '/assets/menu/common/menu-placeholder-v2.svg';

// Each tuple describes an actual restaurant category and its preparation, with explicit suggested rupee prices.
type Section = [string, string, string];
const pizza: Section[] = [
  ['Pizzas', 'Hand-tossed dough, tomato sauce and mozzarella, baked to order', 'Margherita Pizza:149;Farmhouse Pizza:199;Paneer Tikka Pizza:229;Veggie Supreme Pizza:219;Mexican Green Wave Pizza:229;Peri Peri Paneer Pizza:249;Cheese Burst Margherita:249;Cheese Burst Farmhouse:299;Jalapeno Corn Pizza:199;Mushroom Pizza:219;Chicken Tikka Pizza:279:N;Pepper Chicken Pizza:269:N'],
  ['Garlic Bread', 'Oven-baked bread with garlic butter and herbs', 'Garlic Bread:99;Cheese Garlic Bread:139;Stuffed Garlic Bread:169;Cheese Corn Breadsticks:159'],
  ['Sides', 'Freshly fried sides with seasoning served separately', 'French Fries:89;Peri Peri Fries:109;Potato Wedges:119;Cheese Dip:39;Jalapeno Dip:39'],
  ['Pasta', 'Penne tossed in a freshly prepared sauce', 'White Sauce Pasta:199;Red Sauce Pasta:189;Pink Sauce Pasta:219;Pesto Pasta:249;Chicken Alfredo Pasta:279:N'],
  ['Burgers', 'Toasted buns, fresh vegetables and house dressing', 'Classic Veg Burger:119;Cheese Veg Burger:139;Paneer Burger:179;Chicken Burger:199:N'],
  ['Beverages', 'Made-to-order drinks or sealed beverages', 'Cold Coffee:119;Lemon Iced Tea:89;Fresh Lime Soda:79;Cola 250ml:40;Mineral Water 500ml:20'],
  ['Desserts', 'Individually portioned sweet finishes', 'Chocolate Brownie:99;Chocolate Lava Cake:119;Vanilla Ice Cream:69;Brownie with Ice Cream:149']
];
const indian: Section[] = [
  ['Starters', 'Marinated starters grilled or shallow-fried to order', 'Paneer Tikka:240;Malai Paneer Tikka:260;Hara Bhara Kebab:190;Chicken Tikka:290:N;Tandoori Chicken Half:320:N'],
  ['Main Course', 'Slow-simmered Indian gravies with fresh spices', 'Paneer Butter Masala:260;Kadai Paneer:250;Shahi Paneer:270;Palak Paneer:240;Butter Chicken:340:N;Chicken Curry:290:N'],
  ['Dal', 'Lentils simmered and tempered before serving', 'Dal Makhani:220;Dal Tadka:180;Dal Fry:170;Chana Masala:190'],
  ['Breads', 'Fresh tandoor or griddle breads', 'Butter Naan:50;Garlic Naan:65;Tandoori Roti:30;Lachha Paratha:60;Plain Kulcha:55'],
  ['Rice', 'Steamed or tempered basmati rice', 'Steamed Rice:100;Jeera Rice:130;Peas Pulao:160;Veg Dum Biryani:220'],
  ['Beverages', 'Traditional dairy drinks and fresh citrus refreshments', 'Masala Chaas:45;Sweet Lassi:80;Salted Lassi:70;Fresh Lime Soda:70'],
  ['Desserts', 'Traditional Indian dessert portions', 'Gulab Jamun:80;Rasmalai:110;Rice Kheer:90']
];
const gujarati: Section[] = [
  ['Gujarati Thali', 'Rotli, seasonal shaak, dal, rice, farsan and sweet', 'Gujarati Grand Thali:320;Special Gujarati Thali:250;Mini Gujarati Thali:160'],
  ['Gujarati Shaak (Curries)', 'Gujarati vegetable preparations with fresh regional spices', 'Sev Tameta:130;Ringna Bateta:140;Lasaniya Bateta:140;Bhindi Sambhariya:160;Tindora Nu Shaak:140;Dudhi Chana Dal:140'],
  ['Dal & Kadhi', 'Sweet-sour Gujarati tempering, served hot', 'Gujarati Dal:90;Gujarati Kadhi:90;Dal Dhokli:150'],
  ['Rotli, Bhakri & Thepla', 'Fresh wheat or millet breads cooked on a griddle', 'Phulka:15;Bajra Rotla:35;Thepla:25;Methi Thepla:30;Wheat Bhakri:30'],
  ['Farsan', 'Steamed or crisp Gujarati snacks with chutney', 'Khaman:80;Dhokla:80;Khandvi:100;Fafda:90;Patra:90'],
  ['Rice & Khichdi', 'Comforting rice and lentil preparations', 'Plain Khichdi:100;Vaghareli Khichdi:130;Jeera Rice:120;Masala Rice:130'],
  ['Chutneys', 'Fresh accompaniments in individual portions', 'Green Chutney:20;Garlic Chutney:20;Sweet Tamarind Chutney:20'],
  ['Sweets', 'Gujarati sweet portions for a meal finish', 'Jalebi:70;Basundi:100;Shrikhand:90;Mohanthal:80'],
  ['Beverages', 'Chilled traditional drinks', 'Masala Chaas:35;Plain Chaas:30;Kesar Milk:70']
];
const south: Section[] = [
  ['Dosas', 'Fermented rice-lentil crepes with sambar and coconut chutney', 'Plain Dosa:80;Masala Dosa:110;Mysore Masala Dosa:140;Rava Dosa:130;Onion Rava Dosa:150;Ghee Roast Dosa:140;Paneer Dosa:170'],
  ['Idli & Vada', 'Steamed rice cakes or crisp lentil fritters with chutney', 'Idli 2 Pieces:60;Medu Vada 2 Pieces:70;Idli Vada Plate:80;Mini Idli Sambar:90;Ghee Podi Idli:100'],
  ['Uttapam', 'Thick rice-lentil pancakes with vegetable toppings', 'Plain Uttapam:100;Onion Uttapam:120;Tomato Uttapam:120;Mixed Vegetable Uttapam:140'],
  ['Rice & Meals', 'South Indian rice preparations and complete meals', 'Lemon Rice:100;Curd Rice:100;Tamarind Rice:110;Sambar Rice:110;South Indian Meals:190;Ven Pongal:110'],
  ['Accompaniments', 'Fresh accompaniments for tiffin', 'Extra Sambar:25;Coconut Chutney:20;Tomato Chutney:20;Podi with Ghee:25'],
  ['Beverages', 'Freshly brewed South Indian refreshments', 'Filter Coffee:50;Masala Tea:35;Badam Milk:70'],
  ['Desserts', 'Traditional sweet portions', 'Kesari Bath:60;Payasam:80']
];
const chinese: Section[] = [
  ['Soups', 'Hot vegetable broth finished to order', 'Veg Manchow Soup:100;Veg Hot and Sour Soup:100;Sweet Corn Soup:90;Chicken Manchow Soup:130:N'],
  ['Starters', 'Wok-tossed or crisp starters with house sauces', 'Chilli Paneer:220;Veg Manchurian Dry:180;Crispy Chilli Potato:160;Spring Rolls:150;Chicken Lollipop:250:N;Chilli Chicken:260:N'],
  ['Noodles', 'Wok-tossed noodles and crunchy vegetables', 'Veg Hakka Noodles:160;Veg Schezwan Noodles:180;Chilli Garlic Noodles:180;Singapore Noodles:190;Chicken Hakka Noodles:220:N;Egg Noodles:190:E'],
  ['Fried Rice', 'Rice tossed on high heat with vegetables and seasoning', 'Veg Fried Rice:150;Schezwan Fried Rice:170;Burnt Garlic Fried Rice:180;Chicken Fried Rice:220:N;Egg Fried Rice:180:E'],
  ['Momos', 'Fresh dumplings with dipping sauce', 'Veg Steamed Momos:120;Veg Fried Momos:140;Paneer Momos:150;Chicken Momos:170:N'],
  ['Gravies', 'Wok gravies to pair with rice or noodles', 'Veg Manchurian Gravy:180;Paneer in Black Bean Sauce:230;Mushroom in Hot Garlic Sauce:210'],
  ['Beverages', 'Cold refreshments', 'Lemon Iced Tea:80;Fresh Lime Soda:70;Cola 250ml:40']
];
const fast: Section[] = [
  ['Burgers', 'Toasted buns with freshly cooked patties', 'Classic Veg Burger:89;Cheese Veg Burger:109;Paneer Burger:149;Chicken Burger:169:N;Double Cheese Burger:159'],
  ['Sandwiches', 'Fresh fillings in toasted or grilled bread', 'Veg Club Sandwich:139;Cheese Grilled Sandwich:119;Paneer Grilled Sandwich:159;Corn Cheese Sandwich:139;Chicken Sandwich:179:N'],
  ['Wraps', 'Soft flatbread wraps with salad and sauce', 'Paneer Wrap:149;Falafel Wrap:139;Veg Mexican Wrap:129;Chicken Wrap:179:N'],
  ['Sides', 'Crisp potato sides and bites', 'French Fries:79;Peri Peri Fries:99;Potato Wedges:109;Veg Nuggets:109;Cheese Balls:139'],
  ['Quick Meals', 'Freshly prepared comfort meals', 'Veg Hakka Noodles:139;Red Sauce Pasta:159;White Sauce Pasta:169;Margherita Pizza:149'],
  ['Beverages', 'Fresh shakes and chilled drinks', 'Cold Coffee:99;Chocolate Shake:129;Strawberry Shake:129;Lemon Iced Tea:69;Cola 250ml:40'],
  ['Desserts', 'Sweet snack portions', 'Chocolate Brownie:89;Vanilla Ice Cream:59;Chocolate Lava Cake:99']
];
const cafe: Section[] = [
  ['Hot Coffee', 'Freshly brewed coffee prepared to order', 'Espresso:80;Americano:100;Cappuccino:130;Cafe Latte:140;Flat White:150;Cafe Mocha:170'],
  ['Tea', 'Brewed tea and infusions', 'Masala Tea:50;Ginger Tea:50;Green Tea:70;Earl Grey Tea:80;Hot Chocolate:140'],
  ['Cold Coffee & Shakes', 'Blended drinks served chilled', 'Cold Coffee:140;Iced Americano:120;Iced Latte:150;Chocolate Shake:160;Oreo Shake:170;Vanilla Shake:150'],
  ['Sandwiches', 'Freshly grilled sandwiches', 'Veg Club Sandwich:170;Corn Cheese Sandwich:160;Paneer Grilled Sandwich:190;Chicken Sandwich:220:N'],
  ['Breakfast', 'Made-to-order breakfast plates', 'Cheese Toast:100;Pancakes with Honey:180;Eggs on Toast:170:E;Masala Omelette:140:E;Vegetable Poha:90'],
  ['Bakes & Desserts', 'Bakery snacks and individually portioned desserts', 'Chocolate Brownie:110;Chocolate Lava Cake:130;Banana Bread Slice:100;Butter Croissant:120;Blueberry Muffin:110']
];
const bakery: Section[] = [
  ['Breads', 'Freshly baked breads', 'White Bread Loaf:50;Whole Wheat Bread:65;Multigrain Bread:85;Garlic Bread:90;Dinner Rolls 4 Pieces:60'],
  ['Cakes', 'Eggless celebration cakes; size selection available', 'Chocolate Truffle Cake:450;Vanilla Cream Cake:380;Black Forest Cake:420;Red Velvet Cake:550;Pineapple Cake:400'],
  ['Pastries', 'Individual eggless pastry portions', 'Chocolate Truffle Pastry:90;Black Forest Pastry:85;Red Velvet Pastry:110;Pineapple Pastry:80;Chocolate Eclair:100'],
  ['Cookies', 'Baked cookie packs', 'Butter Cookies 200g:120;Chocolate Chip Cookies 200g:150;Oats Cookies 200g:140;Jeera Cookies 200g:110'],
  ['Savouries', 'Oven-baked savoury snacks', 'Veg Puff:35;Paneer Puff:50;Cheese Croissant:110;Veg Quiche:130'],
  ['Desserts', 'Small sweet bakes', 'Chocolate Brownie:90;Chocolate Lava Cake:110;Blueberry Muffin:95;Vanilla Cupcake:65'],
  ['Beverages', 'Fresh drinks to accompany bakes', 'Masala Tea:35;Cappuccino:100;Cold Coffee:110']
];
const biryani: Section[] = [
  ['Vegetarian Biryani', 'Basmati rice dum-cooked with vegetables and spices', 'Veg Dum Biryani:180;Paneer Biryani:230;Mushroom Biryani:210;Soya Chaap Biryani:220;Kathal Biryani:230'],
  ['Chicken Biryani', 'Dum-cooked chicken and fragrant basmati rice', 'Hyderabadi Chicken Biryani:260:N;Lucknowi Chicken Biryani:270:N;Chicken Tikka Biryani:290:N;Boneless Chicken Biryani:300:N;Chicken 65 Biryani:290:N'],
  ['Mutton & Egg Biryani', 'Traditional dum rice preparations', 'Mutton Dum Biryani:380:N;Mutton Keema Biryani:350:N;Egg Biryani:210:E'],
  ['Starters', 'Freshly cooked accompaniments', 'Paneer Tikka:220;Chicken Tikka:280:N;Chicken 65:260:N;Hara Bhara Kebab:180'],
  ['Rice & Curries', 'Curries and rice sides', 'Jeera Rice:120;Chicken Curry:250:N;Paneer Butter Masala:230;Dal Tadka:150'],
  ['Accompaniments', 'Traditional biryani accompaniments', 'Boondi Raita:50;Onion Raita:45;Mirchi Ka Salan:60;Extra Gravy:45'],
  ['Desserts & Drinks', 'Sweet finishes and chilled refreshments', 'Double Ka Meetha:90;Gulab Jamun:70;Masala Chaas:40;Sweet Lassi:70']
];
const kathiyawadi: Section[] = [
  ['Kathiyawadi Shaak', 'Rustic regional vegetable preparations', 'Sev Tameta:120;Ringna No Olo:150;Lasaniya Bateta:130;Dahi Tikhari:120;Bhindi Masala:140;Ringna Bateta:130'],
  ['Rotla & Breads', 'Fresh millet and wheat breads', 'Bajra Rotla:35;Jowar Rotla:35;Phulka:15;Wheat Bhakri:30;Methi Thepla:30'],
  ['Dal & Kadhi', 'Regional lentils and yoghurt gravies', 'Kathiyawadi Dal:90;Gujarati Kadhi:90;Dal Dhokli:140;Chana Dal:100'],
  ['Rice & Khichdi', 'Rice and lentil comfort meals', 'Plain Khichdi:90;Vaghareli Khichdi:120;Masala Khichdi:130;Steamed Rice:80'],
  ['Thali', 'Complete regional meals', 'Kathiyawadi Thali:240;Special Rotla Shaak Meal:180;Mini Kathiyawadi Thali:150'],
  ['Accompaniments', 'Regional meal accompaniments', 'Garlic Chutney:20;Gor Ghee:30;Roasted Papad:20;Masala Papad:35;Onion Salad:25'],
  ['Sweets & Beverages', 'Traditional sweet portions and buttermilk', 'Sukhdi:60;Shrikhand:80;Masala Chaas:30;Plain Chaas:25']
];
const street: Section[] = [
  ['Chaat', 'Freshly assembled chaat with sweet and spicy chutneys', 'Pani Puri:40;Sev Puri:60;Dahi Puri:70;Bhel Puri:60;Dahi Papdi Chaat:80;Aloo Tikki Chaat:80;Raj Kachori:100'],
  ['Pav & Buns', 'Griddle-cooked snacks in soft pav', 'Pav Bhaji:100;Cheese Pav Bhaji:130;Vada Pav:30;Misal Pav:90;Dabeli:30;Extra Pav Pair:20'],
  ['Hot Snacks', 'Freshly fried snacks', 'Samosa 2 Pieces:40;Kachori 2 Pieces:50;Onion Pakora:70;Bread Pakora:50;Mirchi Bhaji:50'],
  ['Rolls', 'Freshly rolled flatbread snacks', 'Paneer Kathi Roll:110;Veg Frankie:80;Egg Roll:90:E;Chicken Kathi Roll:140:N'],
  ['Regional Favourites', 'Comfort snacks prepared to order', 'Chole Kulche:100;Ragda Pattice:90;Poha:50;Sabudana Khichdi:80'],
  ['Beverages', 'Freshly prepared refreshments', 'Masala Tea:20;Masala Chaas:25;Fresh Lime Soda:50;Rose Milk:60'],
  ['Sweets', 'Small sweet portions', 'Jalebi:50;Gulab Jamun:50;Rabri:80']
];
const dessert: Section[] = [
  ['Ice Cream Scoops', 'Single scoops of chilled ice cream', 'Vanilla Ice Cream:60;Chocolate Ice Cream:70;Strawberry Ice Cream:65;Butterscotch Ice Cream:75;Mango Ice Cream:75;Pista Ice Cream:85'],
  ['Sundaes', 'Ice cream with toppings and sauces', 'Chocolate Sundae:150;Brownie Sundae:180;Fruit Sundae:160;Caramel Sundae:150;Banana Split:190'],
  ['Kulfi & Falooda', 'Traditional chilled dessert portions', 'Malai Kulfi:70;Kesar Pista Kulfi:85;Mango Kulfi:80;Rose Falooda:140;Royal Falooda:180'],
  ['Warm Desserts', 'Desserts served warm', 'Chocolate Brownie:100;Brownie with Ice Cream:170;Chocolate Lava Cake:120;Gulab Jamun:70'],
  ['Indian Sweets', 'Traditional dessert portions', 'Rasmalai:100;Shrikhand:90;Basundi:100;Rabri:110;Rice Kheer:90'],
  ['Shakes', 'Freshly blended milkshakes', 'Chocolate Shake:130;Strawberry Shake:130;Mango Shake:140;Oreo Shake:150;Cold Coffee:120']
];
const jain: Section[] = [
  ['Jain Starters', 'Prepared without onion, garlic or root vegetables', 'Jain Paneer Tikka:220;Jain Hara Bhara Kebab:180;Jain Corn Chaat:100;Jain Raw Banana Cutlets (4 Pcs):150;Jain Mushroom Tikka:200'],
  ['Jain Curries', 'Tomato or cashew gravies without root vegetables', 'Jain Paneer Butter Masala:240;Jain Shahi Paneer:250;Jain Mixed Vegetable Curry:200;Jain Chana Masala:180;Jain Palak Paneer:220'],
  ['Jain Dal', 'Lentils tempered without onion or garlic', 'Jain Dal Tadka:150;Jain Dal Fry:140;Jain Moong Dal:140;Jain Dal Makhani:190'],
  ['Jain Breads', 'Fresh breads without restricted ingredients', 'Jain Phulka:15;Jain Butter Naan:50;Jain Tandoori Roti:25;Jain Wheat Bhakri:30'],
  ['Jain Rice', 'Rice preparations without root vegetables', 'Jain Jeera Rice:110;Jain Veg Pulao:150;Jain Moong Khichdi:120;Jain Steamed Rice:90'],
  ['Jain Thali', 'Complete meals without onion, garlic or root vegetables', 'Jain Special Thali:260;Jain Mini Thali:170;Jain Rotli Shaak Meal:150'],
  ['Sweets & Beverages', 'Traditional dairy sweets and refreshments', 'Jain Gulab Jamun:70;Jain Shrikhand:80;Jain Masala Chaas:35;Jain Sweet Lassi:70']
];
const catalog: Record<string, Section[]> = {
  'tpl-pizza': pizza, 'tpl-gujarati': gujarati, 'tpl-north-indian': indian, 'tpl-punjabi': [...indian, ['Punjabi Specials', 'Traditional Punjabi dishes', 'Amritsari Kulcha:90;Pindi Chhole:190;Sarson Ka Saag:230;Makki Roti:40;Rajma Masala:190']],
  'tpl-south-indian': south, 'tpl-chinese': chinese, 'tpl-fast-food': fast, 'tpl-cafe': cafe, 'tpl-bakery': bakery, 'tpl-biryani': biryani, 'tpl-kathiyawadi': kathiyawadi, 'tpl-chaat': street, 'tpl-desserts': dessert, 'tpl-jain': jain,
  'tpl-multicuisine': [indian[0], indian[1], indian[2], indian[3], south[0], chinese[2], pizza[0], indian[4], dessert[3], cafe[2]],
  'tpl-thali': [gujarati[0], kathiyawadi[4], south[3], jain[5], gujarati[1], gujarati[2], gujarati[3], gujarati[7], gujarati[8]]
};
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Curated synonyms in the bundled catalog only; never used to merge a restaurant's own records.
const starterAliases: Record<string, string> = {
  'Paneer Tikka Angara': 'Paneer Tikka', 'Malai Paneer Tikka': 'Paneer Malai Tikka',
  'Hara Bhara Kebab (6 Pcs)': 'Hara Bhara Kebab', 'Kadai Paneer Peshawari': 'Kadai Paneer',
  'Shahi Paneer Nawabi': 'Shahi Paneer', 'Palak Paneer Lahori': 'Palak Paneer',
  'Dal Makhani Bukhara': 'Dal Makhani', 'Yellow Dal Tadka Desi Ghee': 'Dal Tadka',
  'Masala Chaas (Spiced Buttermilk)': 'Masala Chaas', 'Punjabi Sweet Lassi': 'Sweet Lassi',
  'Shahi Gulab Jamun (2 Pcs)': 'Gulab Jamun', 'Rasmalai Kesar Pista': 'Rasmalai',
  'Surti Nylon Khaman (250g)': 'Khaman', 'Sev Tameta Nu Shaak': 'Sev Tameta',
  'Sweet Gujarati Toor Dal': 'Gujarati Dal', 'Traditional Gujarati Kadhi': 'Gujarati Kadhi',
  'Kathiyawadi Bajra Rotla (Ghee)': 'Bajra Rotla', 'Masala Chaas': 'Masala Chaas',
  'Classic Masala Dosa': 'Masala Dosa', 'Crispy Butter Masala Dosa': 'Masala Dosa',
  'Mysore Spicy Masala Dosa': 'Mysore Masala Dosa'
};
const canonicalStarterName = (name: string) => normalizeMenuText(starterAliases[name] || name);
export function enrichRestaurantTemplates(legacy: MenuTemplate[]): MenuTemplate[] {
  return legacy.map(original => {
    const template = structuredClone(original);
    if (template.id === 'tpl-chaat') template.name = 'Street Food Restaurant';
    if (template.id === 'tpl-desserts') template.name = 'Dessert / Ice Cream';
    if (template.id === 'tpl-pizza') template.categories = [];
    for (const [name, preparation, dishes] of catalog[template.id] || []) {
      let category = template.categories.find(c => normalizeMenuText(c.name) === normalizeMenuText(name));
      if (!category) { category = { name, slug: slug(name), description: preparation, iconName: /coffee|tea|beverage/i.test(name) ? 'Coffee' : /pizza/i.test(name) ? 'Pizza' : 'Utensils', items: [] }; template.categories.push(category); }
      for (const entry of dishes.split(';')) {
        const [dishName, priceText, food] = entry.split(':');
        if (category.items.some(i => normalizeMenuText(i.name) === normalizeMenuText(dishName))) continue;
        const sku = `${template.id.replace('tpl-', '').toUpperCase()}-${slug(dishName).toUpperCase()}`;
        category.items.push({ name: dishName, sku, description: `${dishName}, ${preparation.charAt(0).toLowerCase()}${preparation.slice(1)}.`, suggestedPrice: Number(priceText), dietaryType: template.id === 'tpl-jain' ? 'JAIN' : food === 'N' ? 'NON_VEG' : food === 'E' ? 'EGG' : 'VEG', spiceLevel: 'NONE', prepTimeMinutes: /beverage|dessert|coffee|tea/i.test(name) ? 5 : 15, kitchenStation: /pizza|garlic/i.test(name) ? 'Pizza Station' : /bread|tandoor/i.test(name) ? 'Tandoor' : 'Main Kitchen' });
      }
    }
    const usedNames = new Set<string>();
    template.categories = template.categories.map(c => ({ ...c, items: c.items.filter(i => { const key = canonicalStarterName(i.name); if (usedNames.has(key)) return false; usedNames.add(key); return true; }) })).filter(c => c.items.length);
    for (const category of template.categories) for (const item of category.items) {
      if (item.name === 'Plain Uttapam') item.description = 'Thick, soft rice-lentil pancake without vegetable toppings, served with sambar and coconut chutney.';
      // Preserve original Pizza item identifiers across the catalog upgrade.
      if (template.id === 'tpl-pizza') item.sku = ({ 'Margherita Pizza': 'PIZ-001', 'Farmhouse Pizza': 'PIZ-002', 'Paneer Tikka Pizza': 'PIZ-003', 'Stuffed Garlic Bread': 'PIZ-004', 'White Sauce Pasta': 'PIZ-005' } as Record<string, string>)[item.name] || item.sku;
      item.imageUrl = templateDishImage(item.name); item.imageSource = item.imageUrl.includes('placeholder') ? 'MISSING_PHOTO' : /description-matched-v1|template-photos-v1/.test(item.imageUrl) ? 'AI_GENERATED_STARTER_PHOTO' : 'STORED_DISH_ASSET';
      item.tags = [...new Set([...(item.tags || []), template.cuisine, category.name])];
      if (/pizza/i.test(category.name)) {
        item.subcategory = /chicken/i.test(item.name) ? 'Non-Veg Pizza' : /paneer/i.test(item.name) ? 'Paneer Pizza' : /burst/i.test(item.name) ? 'Cheese Burst Pizza' : 'Veg Pizza';
        item.variants = [{ name: 'Regular', price: item.suggestedPrice }, { name: 'Medium', price: item.suggestedPrice + 100 }, { name: 'Large', price: item.suggestedPrice + 200 }];
        item.addons = [{ name: 'Extra Cheese', price: 40 }, { name: 'Jalapeno', price: 25 }, { name: 'Olives', price: 30 }, { name: 'Mushroom', price: 30 }, { name: 'Paneer', price: 40 }, { name: 'Corn', price: 20 }];
      } else if (/biryani/i.test(item.name)) {
        item.variants = [{ name: 'Regular', price: item.suggestedPrice }, { name: 'Large', price: item.suggestedPrice + 120 }]; item.addons = [{ name: 'Extra Raita', price: 30 }];
      } else if (template.id === 'tpl-bakery' && category.name === 'Cakes') {
        item.variants = [{ name: '500g', price: item.suggestedPrice }, { name: '1kg', price: item.suggestedPrice * 2 }];
      } else if (/Dosa$/i.test(item.name)) item.addons = [{ name: 'Extra Ghee', price: 20 }, { name: 'Extra Sambar', price: 25 }];
      else if (/Pasta$/i.test(item.name)) item.addons = [{ name: 'Extra Cheese', price: 30 }, { name: 'Olives', price: 25 }];
    }
    const all = template.categories.flatMap(c => c.items);
    const first = all.find(i => i.variants === undefined) || all[0];
    const other = all.find(i => i.sku !== first?.sku && !i.variants && /beverage|drink|rice|bread|coffee|tea|chaas|lassi/i.test(i.name)) || all.find(i => i.sku !== first?.sku && !i.variants);
    template.combos = first && other ? [{ id: `${template.id}-meal`, name: `${template.name.replace(' Restaurant', '')} Meal Deal`, description: `${first.name} with ${other.name}. Fixed portions; individual item customisations are not included.`, basePrice: Math.round((first.suggestedPrice + other.suggestedPrice) * .9), itemSkus: [first.sku, other.sku], categorySlug: 'combos', imageUrl: '/assets/menu/common/menu-placeholder-v2.svg' }] : [];
    for (const combo of template.combos) combo.imageUrl = starterDishPhoto(combo.name!) || combo.imageUrl;
    if (template.combos.length) template.categories.push({ name: 'Combos', slug: 'combos', description: 'Fixed portion meal deals', iconName: 'Package', items: [] });
    for (const category of template.categories) {
      category.iconName = categoryVisual(category.name).icon;
      category.imageUrl = starterCategoryPhoto(template.id, category.slug, category.name) || category.items[0]?.imageUrl || template.combos?.find(combo => combo.categorySlug === category.slug)?.imageUrl;
    }
    template.approxItemCount = all.length; template.categoryCount = template.categories.length; template.version = '2.0';
    return template;
  });
}
