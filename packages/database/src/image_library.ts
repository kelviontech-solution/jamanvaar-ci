import { STARTER_DISH_PHOTOS, TEMPLATE_DISH_PHOTOS, starterDishPhoto, menuDishImage } from '../../utils/src/dish_photos';
export interface FoodImageAsset {
  id: string;
  title: string;
  category: string;
  cuisine: string;
  url: string;
  thumbnailUrl: string;
  tags: string[];
}

const BUNDLED_FOOD_IMAGE_LIBRARY: FoodImageAsset[] = [
  // Flagship Verified Indian Dishes
  {
    id: 'img-hbk-01',
    title: 'Hara Bhara Kebab (6 Pcs)',
    category: 'Starters',
    cuisine: 'North Indian',
    url: '/assets/menu/north-indian/hara-bhara-kebab.jpg',
    thumbnailUrl: '/assets/menu/north-indian/hara-bhara-kebab.jpg',
    tags: ['kebab', 'spinach', 'paneer', 'starters', 'veg', 'hara bhara']
  },
  {
    id: 'img-cc-02',
    title: 'Crispy Corn Salt & Pepper',
    category: 'Starters',
    cuisine: 'Indo-Chinese / Starters',
    url: '/assets/menu/starters/crispy-corn.jpg',
    thumbnailUrl: '/assets/menu/starters/crispy-corn.jpg',
    tags: ['crispy corn', 'sweet corn', 'salt and pepper', 'starters', 'veg']
  },
  {
    id: 'img-ccr-03',
    title: 'Cheese Corn Cigar Rolls (5 Pcs)',
    category: 'Starters',
    cuisine: 'Fusion Appetizers',
    url: '/assets/menu/starters/cheese-corn-cigar-rolls.jpg',
    thumbnailUrl: '/assets/menu/starters/cheese-corn-cigar-rolls.jpg',
    tags: ['cheese corn', 'cigar rolls', 'mozzarella', 'starters', 'rolls']
  },
  {
    id: 'img-pt-04',
    title: 'Paneer Tikka (Tandoori Angaar)',
    category: 'Tandoor & Kebab',
    cuisine: 'North Indian',
    url: '/assets/menu/north-indian/paneer-tikka.jpg',
    thumbnailUrl: '/assets/menu/north-indian/paneer-tikka.jpg',
    tags: ['paneer tikka', 'tandoori', 'cottage cheese', 'starters']
  },
  {
    id: 'img-dm-05',
    title: 'Dal Makhani (Slow Cooked)',
    category: 'Main Course',
    cuisine: 'North Indian',
    url: '/assets/menu/north-indian/dal-makhani.jpg',
    thumbnailUrl: '/assets/menu/north-indian/dal-makhani.jpg',
    tags: ['dal makhani', 'black dal', 'makhani', 'main course', 'lentils']
  },
  {
    id: 'img-pbm-06',
    title: 'Paneer Butter Masala',
    category: 'Main Course',
    cuisine: 'North Indian',
    url: '/assets/menu/north-indian/paneer-butter-masala.jpg',
    thumbnailUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg',
    tags: ['paneer butter masala', 'makhani', 'paneer curry', 'main course']
  },
  {
    id: 'img-bn-07',
    title: 'Butter Naan (Tandoori)',
    category: 'Naan & Roti',
    cuisine: 'North Indian',
    url: '/assets/menu/north-indian/butter-naan.jpg',
    thumbnailUrl: '/assets/menu/north-indian/butter-naan.jpg',
    tags: ['butter naan', 'tandoori naan', 'bread', 'roti']
  },
  {
    id: 'img-gn-08',
    title: 'Garlic Butter Naan',
    category: 'Naan & Roti',
    cuisine: 'North Indian',
    url: '/assets/menu/north-indian/garlic-naan.jpg',
    thumbnailUrl: '/assets/menu/north-indian/garlic-naan.jpg',
    tags: ['garlic naan', 'garlic butter naan', 'bread', 'tandoori']
  },
  {
    id: 'img-vgb-09',
    title: 'Royal Veg Handi Dum Biryani',
    category: 'Biryani & Rice',
    cuisine: 'Mughlai & Heritage',
    url: '/assets/menu/biryani/royal-veg-biryani.jpg',
    thumbnailUrl: '/assets/menu/biryani/royal-veg-biryani.jpg',
    tags: ['biryani', 'veg biryani', 'dum biryani', 'handi', 'rice']
  },
  {
    id: 'img-cc-10',
    title: 'Cold Coffee with Vanilla Ice Cream',
    category: 'Beverages',
    cuisine: 'Cafe & Drinks',
    url: '/assets/menu/beverages/cold-coffee.jpg',
    thumbnailUrl: '/assets/menu/beverages/cold-coffee.jpg',
    tags: ['cold coffee', 'ice cream', 'vanilla', 'beverages', 'frappe']
  },
  {
    id: 'img-gj-11',
    title: 'Shahi Gulab Jamun (2 Pcs)',
    category: 'Desserts',
    cuisine: 'Indian Sweets',
    url: '/assets/menu/desserts/gulab-jamun.jpg',
    thumbnailUrl: '/assets/menu/desserts/gulab-jamun.jpg',
    tags: ['gulab jamun', 'desserts', 'sweet', 'shahi gulab jamun']
  },
  {
    id: 'img-thl-12',
    title: 'Authentic Gujarati Special Thali',
    category: 'Main Course',
    cuisine: 'Gujarati Heritage',
    url: '/assets/menu/thali/gujarati-thali.jpg',
    thumbnailUrl: '/assets/menu/thali/gujarati-thali.jpg',
    tags: ['gujarati thali', 'thali', 'farsan', 'rotli', 'dal', 'kadhi']
  },

  // Pizzas & Italian
  {
    id: 'img-piz-1',
    title: 'Margherita Pizza',
    category: 'Pizza',
    cuisine: 'Italian',
    url: '/assets/menu/pizza/margherita.svg',
    thumbnailUrl: '/assets/menu/pizza/margherita.svg',
    tags: ['pizza', 'cheese', 'margherita', 'italian', 'veg']
  },
  {
    id: 'img-piz-2',
    title: 'Farmhouse Veggie Pizza',
    category: 'Pizza',
    cuisine: 'Italian',
    url: '/assets/menu/pizza/farmhouse.svg',
    thumbnailUrl: '/assets/menu/pizza/farmhouse.svg',
    tags: ['pizza', 'veggie', 'farmhouse', 'toppings']
  },
  {
    id: 'img-piz-3',
    title: 'Creamy Alfredo Pasta',
    category: 'Pasta',
    cuisine: 'Italian',
    url: '/assets/menu/pizza/alfredo-pasta.svg',
    thumbnailUrl: '/assets/menu/pizza/alfredo-pasta.svg',
    tags: ['pasta', 'alfredo', 'white sauce', 'penne']
  },
  {
    id: 'img-piz-4',
    title: 'Cheese Garlic Breadsticks',
    category: 'Sides',
    cuisine: 'Italian',
    url: '/assets/menu/pizza/garlic-bread.svg',
    thumbnailUrl: '/assets/menu/pizza/garlic-bread.svg',
    tags: ['garlic bread', 'cheese', 'bread', 'sides']
  },

  // Indian Curries & Tandoor
  {
    id: 'img-ind-1',
    title: 'Paneer Butter Masala',
    category: 'Main Course',
    cuisine: 'North Indian',
    url: '/assets/menu/north-indian/paneer-butter-masala.svg',
    thumbnailUrl: '/assets/menu/north-indian/paneer-butter-masala.svg',
    tags: ['paneer', 'curry', 'butter masala', 'north indian']
  },
  {
    id: 'img-ind-2',
    title: 'Paneer Tikka Angara',
    category: 'Starters',
    cuisine: 'North Indian',
    url: '/assets/menu/north-indian/paneer-tikka.svg',
    thumbnailUrl: '/assets/menu/north-indian/paneer-tikka.svg',
    tags: ['paneer tikka', 'tandoor', 'kebab', 'spicy']
  },
  {
    id: 'img-ind-3',
    title: 'Dal Makhani Slow Cooked',
    category: 'Main Course',
    cuisine: 'North Indian',
    url: '/assets/menu/north-indian/dal-makhani.svg',
    thumbnailUrl: '/assets/menu/north-indian/dal-makhani.svg',
    tags: ['dal makhani', 'dal', 'butter', 'lentils']
  },
  {
    id: 'img-ind-4',
    title: 'Butter Garlic Naan',
    category: 'Breads',
    cuisine: 'North Indian',
    url: '/assets/menu/north-indian/butter-naan.svg',
    thumbnailUrl: '/assets/menu/north-indian/butter-naan.svg',
    tags: ['naan', 'roti', 'bread', 'tandoor']
  },

  // Biryanis & Rice
  {
    id: 'img-bir-1',
    title: 'Dum Hyderabadi Biryani',
    category: 'Biryani',
    cuisine: 'Hyderabadi',
    url: '/assets/menu/north-indian/biryani.svg',
    thumbnailUrl: '/assets/menu/north-indian/biryani.svg',
    tags: ['biryani', 'rice', 'dum biryani', 'saffron']
  },

  // South Indian
  {
    id: 'img-sou-1',
    title: 'Crispy Butter Masala Dosa',
    category: 'Dosa',
    cuisine: 'South Indian',
    url: '/assets/menu/south-indian/masala-dosa.svg',
    thumbnailUrl: '/assets/menu/south-indian/masala-dosa.svg',
    tags: ['dosa', 'butter masala', 'south indian', 'crispy']
  },
  {
    id: 'img-sou-2',
    title: 'Ghee Podi Button Idli',
    category: 'Idli',
    cuisine: 'South Indian',
    url: '/assets/menu/south-indian/idli.svg',
    thumbnailUrl: '/assets/menu/south-indian/idli.svg',
    tags: ['idli', 'ghee', 'podi', 'south indian', 'steamed']
  },
  {
    id: 'img-sou-3',
    title: 'Filter Kaapi Coffee',
    category: 'Beverages',
    cuisine: 'South Indian',
    url: '/assets/menu/south-indian/filter-coffee.svg',
    thumbnailUrl: '/assets/menu/south-indian/filter-coffee.svg',
    tags: ['coffee', 'filter coffee', 'beverage', 'hot']
  },

  // Gujarati & Kathiyawadi
  {
    id: 'img-guj-1',
    title: 'Surti Nylon Khaman',
    category: 'Farsan',
    cuisine: 'Gujarati',
    url: '/assets/menu/gujarati/khaman.svg',
    thumbnailUrl: '/assets/menu/gujarati/khaman.svg',
    tags: ['khaman', 'dhokla', 'farsan', 'gujarati']
  },
  {
    id: 'img-guj-2',
    title: 'Royal Gujarati Grand Thali',
    category: 'Thali',
    cuisine: 'Gujarati',
    url: '/assets/menu/gujarati/thali.svg',
    thumbnailUrl: '/assets/menu/gujarati/thali.svg',
    tags: ['thali', 'gujarati thali', 'undhiyu', 'dal']
  },

  // Fast Food & Burgers
  {
    id: 'img-ff-1',
    title: 'Crispy Veggie Burger',
    category: 'Burgers',
    cuisine: 'Fast Food',
    url: '/assets/menu/fast-food/burger.svg',
    thumbnailUrl: '/assets/menu/fast-food/burger.svg',
    tags: ['burger', 'fast food', 'veggie', 'crispy']
  },
  {
    id: 'img-ff-2',
    title: 'Peri Peri Crinkle Fries',
    category: 'Sides',
    cuisine: 'Fast Food',
    url: '/assets/menu/fast-food/peri-peri-fries.svg',
    thumbnailUrl: '/assets/menu/fast-food/peri-peri-fries.svg',
    tags: ['fries', 'peri peri', 'crispy', 'snack']
  },

  // Chinese
  {
    id: 'img-chi-1',
    title: 'Veg Hakka Noodles',
    category: 'Noodles',
    cuisine: 'Chinese',
    url: '/assets/menu/chinese/hakka-noodles.svg',
    thumbnailUrl: '/assets/menu/chinese/hakka-noodles.svg',
    tags: ['noodles', 'hakka', 'chinese', 'wok']
  },
  {
    id: 'img-chi-2',
    title: 'Schezwan Fried Rice',
    category: 'Rice',
    cuisine: 'Chinese',
    url: '/assets/menu/chinese/schezwan-rice.svg',
    thumbnailUrl: '/assets/menu/chinese/schezwan-rice.svg',
    tags: ['fried rice', 'schezwan', 'chinese', 'spicy']
  },

  // Desserts & Sweets
  {
    id: 'img-des-1',
    title: 'Gulab Jamun with Rabri',
    category: 'Desserts',
    cuisine: 'Indian Desserts',
    url: '/assets/menu/north-indian/gulab-jamun.svg',
    thumbnailUrl: '/assets/menu/north-indian/gulab-jamun.svg',
    tags: ['gulab jamun', 'sweet', 'dessert', 'rabri']
  },
  {
    id: 'img-des-2',
    title: 'Warm Choco Lava Cake',
    category: 'Desserts',
    cuisine: 'Continental',
    url: '/assets/menu/bakery/choco-lava.svg',
    thumbnailUrl: '/assets/menu/bakery/choco-lava.svg',
    tags: ['choco lava', 'cake', 'chocolate', 'dessert']
  }
];

// Only photo entries reviewed against their dish names are offered automatically.
const reviewedPhotoIds = new Set(['img-hbk-01','img-cc-02','img-ccr-03','img-pt-04','img-dm-05','img-pbm-06','img-bn-07','img-gn-08','img-vgb-09','img-cc-10','img-gj-11','img-thl-12','img-piz-1']);
const photoCandidates: FoodImageAsset[] = [
  ...TEMPLATE_DISH_PHOTOS.map(photo => ({ id: photo.id, title: photo.name, category: photo.category, cuisine: photo.cuisine, url: starterDishPhoto(photo.name)!, thumbnailUrl: starterDishPhoto(photo.name)!, tags: [photo.name, photo.category, photo.cuisine, 'AI generated starter image'] })),
  ...STARTER_DISH_PHOTOS.map(photo => ({ id: `description-photo-${photo.file}`, title: photo.names[0], category: 'Description-matched starter photos', cuisine: photo.file === 'paneer-rice-meal' ? 'Indian' : 'Gujarati', url: starterDishPhoto(photo.names[0])!, thumbnailUrl: starterDishPhoto(photo.names[0])!, tags: [...photo.names, 'AI generated starter image'] })),
  ...BUNDLED_FOOD_IMAGE_LIBRARY.filter(image => reviewedPhotoIds.has(image.id)).map(image => ({ ...image, url: starterDishPhoto(image.title) || menuDishImage(image.url, image.title)!, thumbnailUrl: starterDishPhoto(image.title) || menuDishImage(image.thumbnailUrl, image.title)! })).filter(image => !image.url.endsWith('.svg'))
];
// Different aliases can describe the same starter photo; offer it once and retain all search tags.
export const FOOD_IMAGE_LIBRARY: FoodImageAsset[] = [...photoCandidates.reduce((photos, image) => {
  const existing = photos.get(image.url);
  photos.set(image.url, existing ? { ...existing, tags: [...new Set([...existing.tags, image.title, ...image.tags])] } : image);
  return photos;
}, new Map<string, FoodImageAsset>()).values()];

export const FALLBACK_FOOD_IMAGE = '/assets/menu/common/fallback-dish.svg';
