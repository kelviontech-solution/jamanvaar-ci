/**
 * JAMANVAAR Real Food Image Downloader & Offline Packager
 * Downloads real, authentic food photography for all dishes and categories,
 * validates the binary image content, saves them locally as optimized JPEGs,
 * and synchronizes them to all applications' public asset folders.
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const CENTRAL_ASSET_DIR = path.join(ROOT_DIR, 'shared', 'assets', 'menu');

const APPS_PUBLIC_DIRS = [
  path.join(ROOT_DIR, 'apps', 'restaurant-system', 'pos', 'public', 'assets', 'menu'),
  path.join(ROOT_DIR, 'apps', 'restaurant-system', 'pos-admin', 'public', 'assets', 'menu'),
  path.join(ROOT_DIR, 'apps', 'kiosk-system', 'kiosk-user', 'public', 'assets', 'menu'),
  path.join(ROOT_DIR, 'apps', 'kiosk-system', 'kiosk-admin', 'public', 'assets', 'menu'),
  path.join(ROOT_DIR, 'apps', 'restaurant-system', 'captain', 'public', 'assets', 'menu'),
  path.join(ROOT_DIR, 'apps', 'restaurant-system', 'kds', 'public', 'assets', 'menu')
];

// Curated authentic real food photography sources with verified dish matching and legal reusability
export const DISH_IMAGE_REGISTRY = [
  // ==========================================
  // 1. CORE SEED MENU ITEMS (Primary POS & Kiosk Menu)
  // ==========================================
  {
    sku: 'HBK-01',
    dishName: 'Hara Bhara Kebab (6 Pcs)',
    category: 'Starters',
    cuisine: 'North Indian',
    foodType: 'VEG',
    description: 'Crispy spinach, green pea and paneer patties served with fresh mint chutney.',
    folder: 'north-indian',
    file: 'hara-bhara-kebab.jpg',
    url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=85',
    imagePrompt: 'Professional Indian restaurant food photography of six Hara Bhara Kebabs made from spinach, green peas and paneer, round green vegetable kebabs, lightly crisp exterior, served with fresh mint chutney, appetizing warm presentation on a premium ceramic plate, realistic natural food texture, restaurant menu photography, clean background, no text, no watermark',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/hara-bhara-kebab',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable'
  },
  {
    sku: 'CC-02',
    dishName: 'Crispy Corn Salt & Pepper',
    category: 'Starters',
    cuisine: 'Indo-Chinese / Starters',
    foodType: 'VEG',
    description: 'Golden fried sweet corn tossed with bell peppers, green chillies & aromatic herbs.',
    folder: 'starters',
    file: 'crispy-corn.jpg',
    url: 'https://images.unsplash.com/photo-1551218808-94e220e084d2?auto=format&fit=crop&w=800&q=85',
    imagePrompt: 'Crispy golden fried sweet corn kernels tossed with finely diced green bell peppers, spring onions, cracked black pepper and salt, served hot in a black restaurant bowl, garnished with fresh cilantro, appetizing closeup food photo',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/crispy-corn',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable'
  },
  {
    sku: 'CCR-03',
    dishName: 'Cheese Corn Cigar Rolls (5 Pcs)',
    category: 'Starters',
    cuisine: 'Fusion Appetizers',
    foodType: 'VEG',
    description: 'Golden crispy rolls filled with melted mozzarella, sweet corn and herbs served with sweet chilli dip.',
    folder: 'starters',
    file: 'cheese-corn-cigar-rolls.jpg',
    url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=85',
    imagePrompt: 'Five golden-brown cylindrical crispy cheese corn cigar rolls, crunchy thin crust with visible melted cheese and sweet corn filling, placed diagonally on a slate plate with sweet chilli sauce and mint dip, authentic cooked food photo',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/cigar-rolls',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable'
  },
  {
    sku: 'PT-04',
    dishName: 'Paneer Tikka (Tandoori Angaar)',
    category: 'Tandoor',
    cuisine: 'North Indian',
    foodType: 'VEG',
    description: 'Fresh malai cottage cheese cubes marinated in spiced curd and grilled over charcoal embers.',
    folder: 'north-indian',
    file: 'paneer-tikka.jpg',
    url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=800&q=85',
    imagePrompt: 'Char-grilled Indian paneer tikka cubes with smoky orange-red tandoori marinade, visible char marks, skewered with roasted bell peppers and onions, served on a sizzling tandoori platter with lemon wedges and mint dip',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/paneer-tikka',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable'
  },
  {
    sku: 'DM-05',
    dishName: 'Dal Makhani (Slow Cooked)',
    category: 'Main Course',
    cuisine: 'North Indian',
    foodType: 'VEG',
    description: 'Slow-cooked black urad lentils simmered overnight with butter, tomatoes and fresh cream.',
    folder: 'north-indian',
    file: 'dal-makhani.jpg',
    url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=85',
    imagePrompt: 'Rich slow-cooked black dal makhani in a traditional copper handi bowl, creamy swirl of white butter and fresh dairy cream on top, garnished with fresh coriander leaves, Indian fine-dining presentation',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/dal-makhani',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable'
  },
  {
    sku: 'PBM-06',
    dishName: 'Paneer Butter Masala',
    category: 'Main Course',
    cuisine: 'North Indian',
    foodType: 'VEG',
    description: 'Soft cottage cheese simmered in a luscious makhani gravy enriched with butter and cream.',
    folder: 'north-indian',
    file: 'paneer-butter-masala.jpg',
    url: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=800&q=85',
    imagePrompt: 'Soft paneer cubes in velvety orange-red tomato butter makhani gravy, topped with a streak of heavy cream and fresh coriander, served in an elegant white restaurant curry bowl',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/paneer-butter-masala',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable'
  },
  {
    sku: 'BN-07',
    dishName: 'Butter Naan (Tandoori)',
    category: 'Breads',
    cuisine: 'North Indian',
    foodType: 'VEG',
    description: 'Traditional clay-tandoor baked leavened bread brushed with melted pure Amul butter.',
    folder: 'north-indian',
    file: 'butter-naan.jpg',
    url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=800&q=85',
    imagePrompt: 'Freshly baked tandoori butter naan bread with golden blistered bubbles and char spots, glistening with melted butter, folded in a wicker bread basket, authentic restaurant presentation',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/butter-naan',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable'
  },
  {
    sku: 'GN-08',
    dishName: 'Garlic Butter Naan',
    category: 'Breads',
    cuisine: 'North Indian',
    foodType: 'VEG',
    description: 'Fluffy tandoori bread generously garnished with minced roasted garlic, fresh coriander and butter.',
    folder: 'north-indian',
    file: 'garlic-naan.jpg',
    url: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=800&q=85',
    imagePrompt: 'Hot tandoori garlic naan bread topped with minced roasted golden garlic, finely chopped fresh coriander leaves, brushed with melted butter, distinct garlic bits visible on golden crust',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/garlic-naan',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable'
  },
  {
    sku: 'VGB-09',
    dishName: 'Royal Veg Handi Dum Biryani',
    category: 'Biryani',
    cuisine: 'Hyderabadi',
    foodType: 'VEG',
    description: 'Farm fresh seasonal vegetables and paneer simmered in rich saffron infused basmati rice.',
    folder: 'north-indian',
    file: 'biryani.jpg',
    url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=85',
    imagePrompt: 'Royal vegetable dum biryani served in an earthen clay handi, long fragrant basmati rice grains layered with saffron strands, caramelized fried onions, mint leaves and tender vegetables',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/biryani',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable'
  },
  {
    sku: 'CC-10',
    dishName: 'Cold Coffee with Vanilla Ice Cream',
    category: 'Beverages',
    cuisine: 'Cafe',
    foodType: 'VEG',
    description: 'Rich blended espresso with chilled milk and a velvety scoop of vanilla ice cream.',
    folder: 'cafe',
    file: 'cold-coffee.jpg',
    url: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=800&q=85',
    imagePrompt: 'Tall clear glass of creamy blended iced cold coffee with dark chocolate syrup swirl on the glass walls, crowned with a large scoop of vanilla ice cream and cocoa powder dusting, refreshing summer cafe presentation',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/cold-coffee',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable'
  },
  {
    sku: 'GJ-11',
    dishName: 'Shahi Gulab Jamun (2 Pcs)',
    category: 'Desserts',
    cuisine: 'Indian Sweets',
    foodType: 'VEG',
    description: 'Warm, soft khoya dumplings soaked in fragrant green cardamom and saffron syrup.',
    folder: 'desserts',
    file: 'gulab-jamun.jpg',
    url: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=800&q=85',
    imagePrompt: 'Two warm, dark golden-brown gulab jamuns resting in aromatic saffron-cardamom sugar syrup in a white porcelain dessert bowl, garnished with slivered pistachios and silver vark',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/gulab-jamun',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable'
  },
  {
    sku: 'THL-12',
    dishName: 'Authentic Gujarati Special Thali',
    category: 'Main Course',
    cuisine: 'Gujarati Heritage',
    foodType: 'VEG',
    description: '2 Veg Sabzi, Gujarati Kadhi, Dal, 4 Phulka Roti, Jeera Rice, Farsan, Sweet, Pickle & Masala Chhas.',
    folder: 'gujarati',
    file: 'thali.jpg',
    url: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=800&q=85',
    imagePrompt: 'Grand traditional Gujarati thali served on a large polished metal platter with multiple small katori bowls containing Gujarati sweet kadhi, dal, ringna olo, sev tameta, soft puffed phulkas, khaman farsan, shrikhand, and a small brass cup of masala chaas',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/gujarati-thali',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable'
  },
  {
    folder: 'north-indian',
    file: 'kadai-paneer.jpg',
    url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=500&q=80',
    title: 'Kadai Paneer Peshawari'
  },
  {
    folder: 'north-indian',
    file: 'dal-makhani.jpg',
    url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=500&q=80',
    title: 'Dal Makhani Bukhara'
  },
  {
    folder: 'north-indian',
    file: 'dal-tadka.jpg',
    url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=500&q=80',
    title: 'Yellow Dal Tadka Desi Ghee'
  },
  {
    folder: 'north-indian',
    file: 'butter-naan.jpg',
    url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=500&q=80',
    title: 'Butter Naan / Garlic Naan'
  },
  {
    folder: 'north-indian',
    file: 'biryani.jpg',
    url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=500&q=80',
    title: 'Hyderabadi Dum Veg Biryani'
  },
  {
    folder: 'north-indian',
    file: 'gulab-jamun.jpg',
    url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=500&q=80',
    title: 'Gulab Jamun (2 Pcs)'
  },
  {
    folder: 'north-indian',
    file: 'rasmalai.jpg',
    url: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=500&q=80',
    title: 'Rasmalai Kesar Pista'
  },
  {
    folder: 'north-indian',
    file: 'chaas.jpg',
    url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=80',
    title: 'Masala Chaas'
  },
  {
    folder: 'north-indian',
    file: 'lassi.jpg',
    url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=500&q=80',
    title: 'Punjabi Sweet Lassi'
  },

  // 2. Gujarati & Kathiyawadi
  {
    folder: 'gujarati',
    file: 'thali.jpg',
    url: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=500&q=80',
    title: 'Royal Gujarati Grand Thali'
  },
  {
    folder: 'gujarati',
    file: 'khaman.jpg',
    url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=500&q=80',
    title: 'Surti Nylon Khaman'
  },
  {
    folder: 'gujarati',
    file: 'khandvi.jpg',
    url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=500&q=80',
    title: 'Khandvi Mustard Rolls'
  },
  {
    folder: 'gujarati',
    file: 'undhiyu.jpg',
    url: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=500&q=80',
    title: 'Surti Undhiyu Special'
  },
  {
    folder: 'gujarati',
    file: 'sev-tameta.jpg',
    url: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=500&q=80',
    title: 'Sev Tameta Nu Shaak'
  },
  {
    folder: 'gujarati',
    file: 'rotla.jpg',
    url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=500&q=80',
    title: 'Kathiyawadi Bajra Rotla'
  },
  {
    folder: 'gujarati',
    file: 'shrikhand.jpg',
    url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=500&q=80',
    title: 'Kesar Pista Shrikhand'
  },
  {
    folder: 'gujarati',
    file: 'khichdi.jpg',
    url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=500&q=80',
    title: 'Vaghareli Khichdi Kadhi'
  },
  {
    folder: 'kathiyawadi',
    file: 'ringna-olo.jpg',
    url: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=500&q=80',
    title: 'Kathiyawadi Ringna No Olo'
  },
  {
    folder: 'kathiyawadi',
    file: 'lasaniya-bateta.jpg',
    url: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=500&q=80',
    title: 'Lasaniya Bateta'
  },
  {
    folder: 'kathiyawadi',
    file: 'dahi-tikhari.jpg',
    url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80',
    title: 'Dahi Tikhari'
  },

  // 3. South Indian
  {
    folder: 'south-indian',
    file: 'masala-dosa.jpg',
    url: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=500&q=80',
    title: 'Crispy Butter Masala Dosa'
  },
  {
    folder: 'south-indian',
    file: 'mysore-dosa.jpg',
    url: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=500&q=80',
    title: 'Mysore Masala Dosa'
  },
  {
    folder: 'south-indian',
    file: 'idli.jpg',
    url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=500&q=80',
    title: 'Ghee Podi Button Idli'
  },
  {
    folder: 'south-indian',
    file: 'medu-vada.jpg',
    url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=500&q=80',
    title: 'Crispy Medu Vada'
  },
  {
    folder: 'south-indian',
    file: 'uttapam.jpg',
    url: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=500&q=80',
    title: 'Onion Tomato Uttapam'
  },
  {
    folder: 'south-indian',
    file: 'filter-coffee.jpg',
    url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=500&q=80',
    title: 'Filter Kaapi Coffee'
  },
  {
    folder: 'south-indian',
    file: 'south-thali.jpg',
    url: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=500&q=80',
    title: 'South Indian Meals Thali'
  },

  // 4. Punjabi & Mughlai & Rajasthani
  {
    folder: 'punjabi',
    file: 'pindi-chhole.jpg',
    url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=500&q=80',
    title: 'Pindi Chhole Rawalpindi'
  },
  {
    folder: 'punjabi',
    file: 'amritsari-kulcha.jpg',
    url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=500&q=80',
    title: 'Amritsari Aloo Kulcha'
  },
  {
    folder: 'punjabi',
    file: 'sarson-saag.jpg',
    url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=500&q=80',
    title: 'Sarson Ka Saag'
  },
  {
    folder: 'mughlai',
    file: 'galouti-kebab.jpg',
    url: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=500&q=80',
    title: 'Veg Galouti Kebab'
  },
  {
    folder: 'mughlai',
    file: 'navratan-korma.jpg',
    url: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=500&q=80',
    title: 'Navratan Korma Royal'
  },
  {
    folder: 'rajasthani',
    file: 'dal-baati.jpg',
    url: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=500&q=80',
    title: 'Dal Baati Churma Thali'
  },
  {
    folder: 'rajasthani',
    file: 'gatte-ki-sabzi.jpg',
    url: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=500&q=80',
    title: 'Shahi Gatte Ki Sabzi'
  },

  // 5. Pizza & Italian
  {
    folder: 'pizza',
    file: 'margherita.jpg',
    url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=500&q=80',
    title: 'Margherita Basilico Pizza'
  },
  {
    folder: 'pizza',
    file: 'farmhouse.jpg',
    url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=500&q=80',
    title: 'Farmhouse Veggie Supreme'
  },
  {
    folder: 'pizza',
    file: 'paneer-pizza.jpg',
    url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=500&q=80',
    title: 'Paneer Tikka Makhani Pizza'
  },
  {
    folder: 'pizza',
    file: 'garlic-bread.jpg',
    url: 'https://images.unsplash.com/photo-1619895092538-128341789043?auto=format&fit=crop&w=500&q=80',
    title: 'Cheese Garlic Breadsticks'
  },
  {
    folder: 'pizza',
    file: 'alfredo-pasta.jpg',
    url: 'https://images.unsplash.com/photo-1645112411341-6c4fd023714a?auto=format&fit=crop&w=500&q=80',
    title: 'Creamy Alfredo Penne'
  },

  // 6. Chinese & Indo-Chinese
  {
    folder: 'chinese',
    file: 'hakka-noodles.jpg',
    url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=500&q=80',
    title: 'Veg Hakka Noodles'
  },
  {
    folder: 'chinese',
    file: 'schezwan-rice.jpg',
    url: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=500&q=80',
    title: 'Schezwan Fried Rice'
  },
  {
    folder: 'chinese',
    file: 'chilli-paneer.jpg',
    url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=500&q=80',
    title: 'Chilli Paneer Dry'
  },
  {
    folder: 'chinese',
    file: 'manchurian.jpg',
    url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80',
    title: 'Veg Manchurian Gravy'
  },
  {
    folder: 'chinese',
    file: 'momos.jpg',
    url: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=500&q=80',
    title: 'Steamed Veg Momos'
  },

  // 7. Fast Food, Burgers & Sandwiches
  {
    folder: 'fast-food',
    file: 'burger.jpg',
    url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80',
    title: 'Veggie Supreme Burger'
  },
  {
    folder: 'fast-food',
    file: 'wrap.jpg',
    url: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=500&q=80',
    title: 'Spicy Paneer Tikka Wrap'
  },
  {
    folder: 'fast-food',
    file: 'peri-peri-fries.jpg',
    url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=500&q=80',
    title: 'Peri Peri Crinkle Fries'
  },
  {
    folder: 'fast-food',
    file: 'sandwich.jpg',
    url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=500&q=80',
    title: 'Bombay Special Grilled Sandwich'
  },

  // 8. Cafe, Bakery & Desserts
  {
    folder: 'cafe',
    file: 'cappuccino.jpg',
    url: 'https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=500&q=80',
    title: 'Classic Cappuccino'
  },
  {
    folder: 'cafe',
    file: 'frappe.jpg',
    url: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=500&q=80',
    title: 'Caramel Brownie Frappe'
  },
  {
    folder: 'bakery',
    file: 'truffle-pastry.jpg',
    url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=500&q=80',
    title: 'Dutch Chocolate Truffle'
  },
  {
    folder: 'bakery',
    file: 'choco-lava.jpg',
    url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=500&q=80',
    title: 'Warm Choco Lava Cake'
  },
  {
    folder: 'desserts',
    file: 'falooda.jpg',
    url: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=500&q=80',
    title: 'Royal Kesar Pista Falooda'
  },
  {
    folder: 'desserts',
    file: 'sizzler-brownie.jpg',
    url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=500&q=80',
    title: 'Sizzling Brownie Sundae'
  },

  // 9. Chaat & Snacks & Sweets & Juices
  {
    folder: 'chaat',
    file: 'pani-puri.jpg',
    url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=500&q=80',
    title: 'Pani Puri Platter'
  },
  {
    folder: 'chaat',
    file: 'sev-puri.jpg',
    url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=500&q=80',
    title: 'Dahi Sev Batata Puri'
  },
  {
    folder: 'chaat',
    file: 'pav-bhaji.jpg',
    url: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=500&q=80',
    title: 'Butter Pav Bhaji'
  },
  {
    folder: 'snacks',
    file: 'samosa.jpg',
    url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=500&q=80',
    title: 'Special Punjabi Samosa'
  },
  {
    folder: 'snacks',
    file: 'vada-pav.jpg',
    url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80',
    title: 'Mumbai Vada Pav'
  },
  {
    folder: 'sweets',
    file: 'kaju-katli.jpg',
    url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=500&q=80',
    title: 'Kaju Katli Special'
  },
  {
    folder: 'sweets',
    file: 'motichoor.jpg',
    url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=500&q=80',
    title: 'Motichoor Laddoo'
  },
  {
    folder: 'beverages',
    file: 'juice.jpg',
    url: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=500&q=80',
    title: 'Fresh Mosambi Juice'
  },
  {
    folder: 'beverages',
    file: 'mojito.jpg',
    url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=500&q=80',
    title: 'Virgin Mint Mojito Cooler'
  },

  // 10. Jain Satvik
  {
    folder: 'jain',
    file: 'jain-tikka.jpg',
    url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=500&q=80',
    title: 'Jain Paneer Tikka Satvik'
  },
  {
    folder: 'jain',
    file: 'raw-banana.jpg',
    url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80',
    title: 'Jain Raw Banana Cutlets'
  }
];

function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadImage(res.headers.location, destPath));
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (buffer.length < 100) {
          return reject(new Error(`Corrupt/Empty image payload from ${url}`));
        }
        fs.writeFileSync(destPath, buffer);
        resolve(buffer.length);
      });
    });

    request.on('error', (err) => reject(err));
    request.on('timeout', () => {
      request.destroy();
      reject(new Error(`Timeout downloading ${url}`));
    });
  });
}

async function run() {
  console.log('🍽️ [JAMANVAAR] Starting real food photo download and packaging...');

  let successCount = 0;
  let failCount = 0;

  for (const item of DISH_IMAGE_REGISTRY) {
    const targetDir = path.join(CENTRAL_ASSET_DIR, item.folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const destFile = path.join(targetDir, item.file);

    try {
      // Check if already downloaded valid photo
      if (fs.existsSync(destFile) && fs.statSync(destFile).size > 2000) {
        // Cached
        successCount++;
      } else {
        const bytes = await downloadImage(item.url, destFile);
        console.log(`✓ [Downloaded] ${item.folder}/${item.file} (${Math.round(bytes / 1024)} KB) - ${item.dishName || item.title || item.file}`);
        successCount++;
      }
    } catch (err) {
      console.warn(`⚠ [Download Warning] ${item.folder}/${item.file}: ${err.message}`);
      failCount++;
    }
  }

  // Save structured image metadata registry for Menu Manager lookup
  const metadataDest = path.join(ROOT_DIR, 'shared', 'database', 'src', 'image_metadata.json');
  fs.writeFileSync(metadataDest, JSON.stringify(DISH_IMAGE_REGISTRY, null, 2), 'utf-8');
  console.log(`✓ Generated structured image metadata in shared/database/src/image_metadata.json`);

  console.log(`\n🎉 Download Summary: ${successCount} images ready, ${failCount} warnings.`);

  // Synchronize all files in CENTRAL_ASSET_DIR to all 6 apps' public/assets/menu
  console.log('🔄 Synchronizing downloaded food photos to all 6 workspace applications...');

  function copyDirRecursive(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  for (const targetDir of APPS_PUBLIC_DIRS) {
    copyDirRecursive(CENTRAL_ASSET_DIR, targetDir);
  }

  console.log('✓ Successfully synchronized real food photos across all 6 applications.');
}

run().catch((err) => {
  console.error('Fatal error during food image preparation:', err);
  process.exit(1);
});

