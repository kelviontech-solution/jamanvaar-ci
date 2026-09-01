import { Category, ComboDeal, DietaryType, MenuItem, ModifierGroup, SpiceLevel } from '@jamanvaar/types';

export interface MenuTemplateItem {
  name: string;
  sku: string;
  description: string;
  suggestedPrice: number;
  dietaryType: DietaryType;
  spiceLevel: SpiceLevel;
  prepTimeMinutes: number;
  imageUrl?: string;
  imagePrompt?: string;
  imageSource?: string;
  imageSourceUrl?: string;
  imageLicense?: string;
  isPopular?: boolean;
  kitchenStation?: string;
  tags?: string[];
  modifierGroupIds?: string[];
}

export interface MenuTemplateCategory {
  name: string;
  slug: string;
  iconName: string;
  description: string;
  imageUrl?: string;
  items: MenuTemplateItem[];
}

export interface MenuTemplate {
  id: string;
  name: string;
  cuisine: string;
  categoryCount: number;
  approxItemCount: number;
  description: string;
  icon: string;
  badge?: string;
  categoryTypeGroup?: 'INDIAN' | 'FAST_FOOD' | 'CAFE_BAKERY' | 'STREET_FOOD' | 'BEVERAGES_SWEETS' | 'MULTI_CUISINE';
  priceRange?: string;
  version?: string;
  categories: MenuTemplateCategory[];
  modifierGroups?: ModifierGroup[];
  combos?: Partial<ComboDeal>[];
}

// 30 Comprehensive, Culturally Authentic Restaurant Menu Starter Templates
export const PREBUILT_MENU_TEMPLATES_ALL: MenuTemplate[] = [
  // 1. North Indian Restaurant
  {
    id: 'tpl-north-indian',
    name: 'North Indian Restaurant',
    cuisine: 'Mughlai & Heritage Indian',
    categoryTypeGroup: 'INDIAN',
    priceRange: '₹60 - ₹380',
    categoryCount: 7,
    approxItemCount: 28,
    description: 'Rich slow-cooked curries, tandoori starters, creamy dal makhani, fragrant biryanis, soft naans & traditional desserts.',
    icon: '🍛',
    badge: 'Popular',
    version: '1.0',
    categories: [
      {
        name: 'Tandoori Starters & Kebabs',
        slug: 'tandoor-starters',
        iconName: 'Flame',
        description: 'Charcoal clay-oven roasted kebabs and tikkas',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Paneer Tikka Angara', sku: 'NI-001', description: 'Fresh cottage cheese cubes marinated in Kashmiri chilli-yogurt masala, roasted in clay oven with bell peppers', suggestedPrice: 280, dietaryType: 'VEG', spiceLevel: 'SPICY', prepTimeMinutes: 15, isPopular: true, kitchenStation: 'Tandoor', tags: ['BESTSELLER', 'TANDOORI'], imageUrl: '/assets/menu/north-indian/paneer-tikka.jpg' },
          { name: 'Hara Bhara Kebab (6 Pcs)', sku: 'NI-002', description: 'Crisp spinach, green pea and potato patties stuffed with spiced cashews and herbs', suggestedPrice: 220, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 12, isPopular: true, kitchenStation: 'Tandoor', tags: ['CHEF_SPECIAL'], imageUrl: '/assets/menu/north-indian/hara-bhara-kebab.jpg' },
          { name: 'Tandoori Stuffed Mushroom', sku: 'NI-003', description: 'Button mushrooms filled with spiced processed cheese and herbs, charred in tandoor', suggestedPrice: 260, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 14, kitchenStation: 'Tandoor', imageUrl: '/assets/menu/north-indian/tandoori-mushroom.jpg' },
          { name: 'Veg Seekh Kebab Mughlai', sku: 'NI-004', description: 'Minced mixed vegetables and cottage cheese skewered and roasted with aromatic garam masala', suggestedPrice: 240, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 14, kitchenStation: 'Tandoor', imageUrl: '/assets/menu/north-indian/seekh-kebab.jpg' }
        ]
      },
      {
        name: 'Royal Paneer Curries',
        slug: 'paneer-curries',
        iconName: 'Utensils',
        description: 'Velvety tomato, cashew and onion gravies with fresh paneer',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Paneer Butter Masala', sku: 'NI-005', description: 'Soft paneer cubes simmered in a rich, buttery tomato gravy infused with kasuri methi and cream', suggestedPrice: 290, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 14, isPopular: true, kitchenStation: 'Curry Station', tags: ['BESTSELLER'], imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' },
          { name: 'Kadai Paneer Peshawari', sku: 'NI-006', description: 'Cottage cheese wok-tossed with freshly pounded coriander seeds, bell peppers and whole red chillies', suggestedPrice: 290, dietaryType: 'VEG', spiceLevel: 'SPICY', prepTimeMinutes: 14, kitchenStation: 'Curry Station', tags: ['SPICY'], imageUrl: '/assets/menu/north-indian/kadai-paneer.jpg' },
          { name: 'Shahi Paneer Nawabi', sku: 'NI-007', description: 'Royal white cashew and almond gravy with fragrant cardamom and tender paneer cubes', suggestedPrice: 310, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 15, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' },
          { name: 'Palak Paneer Lahori', sku: 'NI-008', description: 'Fresh spinach puree garlic tempered with spices and soft paneer cubes', suggestedPrice: 270, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 12, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' }
        ]
      },
      {
        name: 'Dal & Heritage Curries',
        slug: 'dal-curries',
        iconName: 'Utensils',
        description: 'Overnight slow-cooked dals and rich vegetable curries',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Dal Makhani Bukhara', sku: 'NI-009', description: 'Whole black lentils slow-cooked overnight with white butter, cream and sun-dried fenugreek', suggestedPrice: 250, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 10, isPopular: true, kitchenStation: 'Curry Station', tags: ['BESTSELLER'], imageUrl: '/assets/menu/north-indian/dal-makhani.jpg' },
          { name: 'Yellow Dal Tadka Desi Ghee', sku: 'NI-010', description: 'Yellow toor dal tempered with pure desi ghee, cumin seeds, garlic, onions and whole red chillies', suggestedPrice: 200, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 8, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/north-indian/dal-tadka.jpg' },
          { name: 'Malai Kofta Mughlai', sku: 'NI-011', description: 'Paneer and potato dumplings stuffed with dry fruits in a velvety cashew and saffron sauce', suggestedPrice: 320, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 16, kitchenStation: 'Curry Station', tags: ['CHEF_SPECIAL'], imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' },
          { name: 'Mixed Vegetable Kolhapuri', sku: 'NI-012', description: 'Seasonal vegetables cooked in a spicy, roasted coconut and red chilli Kolhapuri gravy', suggestedPrice: 240, dietaryType: 'VEG', spiceLevel: 'SPICY', prepTimeMinutes: 12, kitchenStation: 'Curry Station', tags: ['SPICY'], imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' }
        ]
      },
      {
        name: 'Tandoori Roti & Naan Breads',
        slug: 'tandoori-breads',
        iconName: 'Bread',
        description: 'Freshly baked clay oven flatbreads',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Butter Naan', sku: 'NI-013', description: 'Refined flour leavened flatbread brushed with molten butter from the clay tandoor', suggestedPrice: 55, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 5, isPopular: true, kitchenStation: 'Tandoor', tags: ['BESTSELLER'], imageUrl: '/assets/menu/north-indian/butter-naan.jpg' },
          { name: 'Garlic Butter Naan', sku: 'NI-014', description: 'Tandoori naan topped with roasted chopped garlic and fresh coriander leaves', suggestedPrice: 70, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 5, isPopular: true, kitchenStation: 'Tandoor', imageUrl: '/assets/menu/pizza/garlic-bread.jpg' },
          { name: 'Tandoori Roti (Butter)', sku: 'NI-015', description: 'Whole wheat flatbread baked crisp in clay oven topped with butter', suggestedPrice: 35, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 4, kitchenStation: 'Tandoor', imageUrl: '/assets/menu/north-indian/butter-naan.jpg' },
          { name: 'Laccha Paratha', sku: 'NI-016', description: 'Multi-layered crispy whole wheat paratha baked in tandoor', suggestedPrice: 65, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 6, kitchenStation: 'Tandoor', imageUrl: '/assets/menu/north-indian/butter-naan.jpg' }
        ]
      },
      {
        name: 'Basmati Rice & Biryani',
        slug: 'rice-biryani',
        iconName: 'Flame',
        description: 'Long-grain fragrant basmati rice dishes',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Hyderabadi Dum Veg Biryani', sku: 'NI-017', description: 'Fragrant basmati rice layered with spiced vegetables, saffron, mint and fried onions, served with raita', suggestedPrice: 280, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 15, isPopular: true, kitchenStation: 'Curry Station', tags: ['BESTSELLER'], imageUrl: '/assets/menu/north-indian/biryani.jpg' },
          { name: 'Jeera Rice (Desi Ghee)', sku: 'NI-018', description: 'Steamed basmati rice tempered with roasted cumin seeds and desi ghee', suggestedPrice: 170, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 6, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' },
          { name: 'Veg Pulao Shahi', sku: 'NI-019', description: 'Basmati rice cooked with garden green peas, carrots, beans and mild whole spices', suggestedPrice: 190, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 8, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/north-indian/biryani.jpg' }
        ]
      },
      {
        name: 'Beverages & Chaas',
        slug: 'beverages',
        iconName: 'Coffee',
        description: 'Chilled traditional refreshers and lassi',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Masala Chaas (Spiced Buttermilk)', sku: 'NI-020', description: 'Traditional churned yogurt drink tempered with roasted cumin, rock salt, ginger and fresh mint', suggestedPrice: 50, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 3, isPopular: true, kitchenStation: 'Beverages & Bar', imageUrl: '/assets/menu/north-indian/chaas.jpg' },
          { name: 'Punjabi Sweet Lassi (Malai Maar Ke)', sku: 'NI-021', description: 'Thick creamy sweetened curd topped with clotted cream and crushed cardamom', suggestedPrice: 90, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 4, isPopular: true, kitchenStation: 'Beverages & Bar', imageUrl: '/assets/menu/north-indian/lassi.jpg' },
          { name: 'Fresh Lime Soda (Sweet & Salt)', sku: 'NI-022', description: 'Fresh squeezed lime juice in carbonated soda with rock salt and sugar syrup', suggestedPrice: 65, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 3, kitchenStation: 'Beverages & Bar', imageUrl: '/assets/menu/beverages/mojito.jpg' }
        ]
      },
      {
        name: 'Heritage Desserts',
        slug: 'desserts',
        iconName: 'Award',
        description: 'Warm gulab jamuns, rasmalai and seasonal halwas',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Gulab Jamun (2 Pcs)', sku: 'NI-023', description: 'Golden fried milk solid dumplings soaked in rose water and cardamom scented sugar syrup', suggestedPrice: 90, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 3, isPopular: true, kitchenStation: 'Dessert Counter', tags: ['BESTSELLER'], imageUrl: '/assets/menu/north-indian/gulab-jamun.jpg' },
          { name: 'Rasmalai Kesar Pista (2 Pcs)', sku: 'NI-024', description: 'Soft spongy cottage cheese patties steeped in thickened saffron infused milk garnished with pistachios', suggestedPrice: 120, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 3, kitchenStation: 'Dessert Counter', tags: ['CHEF_SPECIAL'], imageUrl: '/assets/menu/north-indian/rasmalai.jpg' }
        ]
      }
    ]
  },

  // 2. Gujarati Restaurant
  {
    id: 'tpl-gujarati',
    name: 'Gujarati Restaurant',
    cuisine: 'Authentic Gujarati Heritage',
    categoryTypeGroup: 'INDIAN',
    priceRange: '₹30 - ₹340',
    categoryCount: 8,
    approxItemCount: 30,
    description: 'Traditional Gujarati Thalis, fresh morning farsan, authentic shaak, sweet dal & kadhi, kathiyawadi specials, rotli & chaas.',
    icon: '🥘',
    badge: 'Heritage',
    version: '1.0',
    categories: [
      {
        name: 'Gujarati Thali Special',
        slug: 'gujarati-thali',
        iconName: 'Award',
        description: 'Complete authentic balanced Gujarati dining feast',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Royal Gujarati Grand Thali', sku: 'GUJ-001', description: '3 Shaak, Sweet Gujarati Dal, Kadhi, 4 Phulka Rotli, Basmati Rice, Farsan, Sweet, Papad, Pickle & Chilled Chaas', suggestedPrice: 299, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 10, isPopular: true, kitchenStation: 'Main Kitchen', tags: ['BESTSELLER', 'COMPLETE_MEAL'], imageUrl: '/assets/menu/gujarati/thali.jpg' },
          { name: 'Deluxe Gujarati Executive Thali', sku: 'GUJ-002', description: '2 Shaak, Gujarati Dal, Kadhi, 3 Phulkas, Rice, Farsan & Masala Chaas', suggestedPrice: 220, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 8, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/gujarati/thali.jpg' }
        ]
      },
      {
        name: 'Fresh Farsan (Snacks)',
        slug: 'farsan',
        iconName: 'Utensils',
        description: 'Steamed and fried Gujarati snack specialties',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Surti Nylon Khaman (250g)', sku: 'GUJ-003', description: 'Super soft, airy steamed gram flour cakes tempered with mustard seeds, green chillies and curry leaves', suggestedPrice: 90, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 4, isPopular: true, kitchenStation: 'Main Kitchen', tags: ['BESTSELLER'], imageUrl: '/assets/menu/gujarati/khaman.jpg' },
          { name: 'Khandvi with Mustard Tempering', sku: 'GUJ-004', description: 'Silky spiced gram flour rolls garnished with fresh grated coconut and chopped coriander', suggestedPrice: 110, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 5, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/gujarati/khandvi.jpg' },
          { name: 'Methi Na Gota (Pakoda)', sku: 'GUJ-005', description: 'Crispy fried fenugreek and gram flour fritters served with sweet Kadhi dip', suggestedPrice: 100, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 8, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' },
          { name: 'Patra Steamed Rolls', sku: 'GUJ-006', description: 'Colocasia leaf rolls coated with spiced sweet and tangy gram flour paste', suggestedPrice: 100, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 6, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/fast-food/wrap.jpg' }
        ]
      },
      {
        name: 'Gujarati Shaak (Curries)',
        slug: 'gujarati-shaak',
        iconName: 'Flame',
        description: 'Authentic seasonal vegetable curries',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Surti Undhiyu Special', sku: 'GUJ-007', description: 'Heritage mixed vegetable slow-cooked with fresh surti papdi, purple yam, baby eggplants and methi muthias', suggestedPrice: 240, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 12, isPopular: true, kitchenStation: 'Curry Station', tags: ['CHEF_SPECIAL'], imageUrl: '/assets/menu/gujarati/undhiyu.jpg' },
          { name: 'Sev Tameta Nu Shaak', sku: 'GUJ-008', description: 'Sweet and tangy tomato curry topped with crisp ratlami sev', suggestedPrice: 180, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 8, isPopular: true, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/gujarati/sev-tameta.jpg' },
          { name: 'Ringna Bateta Nu Shaak', sku: 'GUJ-009', description: 'Tender eggplants and potatoes cooked in traditional Gujarati spices with a hint of jaggery', suggestedPrice: 170, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 10, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/kathiyawadi/ringna-olo.jpg' },
          { name: 'Bhindanu Shaak (Okra)', sku: 'GUJ-010', description: 'Crisp stir-fried okra with roasted peanuts, sesame seeds and dry Gujarati spices', suggestedPrice: 170, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 10, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' }
        ]
      },
      {
        name: 'Dal & Kadhi',
        slug: 'dal-kadhi',
        iconName: 'Soup',
        description: 'Authentic Gujarati sweet-tangy dal and spiced buttermilk kadhi',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Sweet Gujarati Toor Dal', sku: 'GUJ-011', description: 'Thin pigeon pea lentil soup balanced with kokum, peanuts, jaggery and mustard tempering', suggestedPrice: 150, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 6, isPopular: true, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/gujarati/khichdi.jpg' },
          { name: 'Traditional Gujarati Kadhi', sku: 'GUJ-012', description: 'Silky smooth yogurt and besan soup tempered with cinnamon, cloves, curry leaves and ginger', suggestedPrice: 150, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 6, isPopular: true, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/gujarati/khichdi.jpg' }
        ]
      },
      {
        name: 'Rotli, Bhakri & Thepla',
        slug: 'rotli-bhakri',
        iconName: 'Bread',
        description: 'Freshly made phulkas, biscuit bhakri and bajra rotla',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Phulka Rotli (Ghee, 4 Pcs)', sku: 'GUJ-013', description: 'Paper-thin whole wheat puffed rotlis smeared with pure desi ghee', suggestedPrice: 50, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 4, isPopular: true, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/gujarati/rotla.jpg' },
          { name: 'Kathiyawadi Bajra Rotla (Ghee)', sku: 'GUJ-014', description: 'Thick hand-flattened pearl millet flatbread roasted on clay tava with white butter and jaggery', suggestedPrice: 45, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 6, isPopular: true, kitchenStation: 'Main Kitchen', tags: ['TRADITIONAL'], imageUrl: '/assets/menu/gujarati/rotla.jpg' },
          { name: 'Methi Thepla (4 Pcs)', sku: 'GUJ-015', description: 'Spiced fenugreek and whole wheat flatbreads served with sweet mango chundo', suggestedPrice: 70, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 5, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/gujarati/rotla.jpg' },
          { name: 'Biscuit Bhakri (2 Pcs)', sku: 'GUJ-016', description: 'Crisp golden layered wheat and semolina disc roasted with ghee', suggestedPrice: 50, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 5, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/gujarati/rotla.jpg' }
        ]
      },
      {
        name: 'Khichdi & Rice',
        slug: 'khichdi-rice',
        iconName: 'Flame',
        description: 'Comforting khichdi varieties and steamed basmati rice',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Vaghareli Khichdi with Kadhi', sku: 'GUJ-017', description: 'Rice and moong dal tempered with garlic, onions, cloves and whole spices, paired with Gujarati Kadhi', suggestedPrice: 180, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 8, isPopular: true, kitchenStation: 'Curry Station', tags: ['COMFORT_FOOD'], imageUrl: '/assets/menu/gujarati/khichdi.jpg' },
          { name: 'Steamed Surti Basmati Rice', sku: 'GUJ-018', description: 'Fluffy steamed rice, best enjoyed with Gujarati toor dal', suggestedPrice: 120, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 5, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' }
        ]
      },
      {
        name: 'Sweets & Mithai',
        slug: 'gujarati-sweets',
        iconName: 'Award',
        description: 'Authentic Gujarati festive sweets',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Kesar Pista Shrikhand (150g)', sku: 'GUJ-019', description: 'Thick hung curd dessert flavoured with saffron strands, green cardamom and sliced pistachios', suggestedPrice: 90, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 2, isPopular: true, kitchenStation: 'Dessert Counter', imageUrl: '/assets/menu/gujarati/shrikhand.jpg' },
          { name: 'Rich Basundi Bowl', sku: 'GUJ-020', description: 'Slow-simmered condensed whole milk infused with nutmeg and almonds', suggestedPrice: 110, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 2, kitchenStation: 'Dessert Counter', imageUrl: '/assets/menu/gujarati/shrikhand.jpg' }
        ]
      },
      {
        name: 'Chaas & Beverages',
        slug: 'gujarati-drinks',
        iconName: 'Coffee',
        description: 'Digestive chaas and chilled coolers',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Kathiyawadi Masala Chaas', sku: 'GUJ-021', description: 'Smoky spiced buttermilk tempered with roasted cumin, green chilli paste, ginger and black salt', suggestedPrice: 40, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 2, isPopular: true, kitchenStation: 'Beverages & Bar', imageUrl: '/assets/menu/north-indian/chaas.jpg' }
        ]
      }
    ]
  },

  // 3. South Indian Restaurant
  {
    id: 'tpl-south-indian',
    name: 'South Indian Restaurant',
    cuisine: 'Traditional South Indian',
    categoryTypeGroup: 'INDIAN',
    priceRange: '₹40 - ₹260',
    categoryCount: 6,
    approxItemCount: 26,
    description: 'Crispy dosas, fluffy steamed idlis, medu vadas, authentic drumstick sambar, trio of chutneys & traditional filter coffee.',
    icon: '🥞',
    badge: 'Popular',
    version: '1.0',
    categories: [
      {
        name: 'Signature Dosas & Crepes',
        slug: 'dosas',
        iconName: 'Flame',
        description: 'Golden fermented rice-lentil crepes with sambar & coconut chutneys',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Crispy Butter Masala Dosa', sku: 'SI-001', description: 'Crisp golden crepe roasted with pure Amul butter, filled with aromatic spiced potato and onion masala', suggestedPrice: 150, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 8, isPopular: true, kitchenStation: 'South Indian Station', tags: ['BESTSELLER'], imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' },
          { name: 'Mysore Masala Dosa', sku: 'SI-002', description: 'Spread with spicy red garlic-chilli chutney inside and filled with seasoned potato mash', suggestedPrice: 170, dietaryType: 'VEG', spiceLevel: 'SPICY', prepTimeMinutes: 9, isPopular: true, kitchenStation: 'South Indian Station', tags: ['SPICY'], imageUrl: '/assets/menu/south-indian/mysore-dosa.jpg' },
          { name: 'Cheese Burst Rava Dosa', sku: 'SI-003', description: 'Crisp lacy semolina crepe studded with green chillies, ginger, cashews and melted cheese', suggestedPrice: 190, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 10, kitchenStation: 'South Indian Station', imageUrl: '/assets/menu/south-indian/masala-dosa.jpg' },
          { name: 'Paper Plain Roast Dosa', sku: 'SI-004', description: 'Extra-large ultra-thin crispy crepe roasted in ghee', suggestedPrice: 120, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 6, kitchenStation: 'South Indian Station', imageUrl: '/assets/menu/south-indian/masala-dosa.jpg' }
        ]
      },
      {
        name: 'Idli & Vada Specialties',
        slug: 'idli-vada',
        iconName: 'Utensils',
        description: 'Soft steamed cakes and crisp lentil fritters',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Steamed Ghee Podi Idli (2 Pcs)', sku: 'SI-005', description: 'Pillow-soft steamed idlis drenched in pure desi ghee and spicy gun powder (karam podi)', suggestedPrice: 120, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 5, isPopular: true, kitchenStation: 'South Indian Station', tags: ['BESTSELLER'], imageUrl: '/assets/menu/south-indian/idli.jpg' },
          { name: 'Crispy Medu Vada (2 Pcs)', sku: 'SI-006', description: 'Golden crunchy black gram donuts infused with crushed black peppercorns and curry leaves', suggestedPrice: 110, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 6, kitchenStation: 'South Indian Station', imageUrl: '/assets/menu/south-indian/medu-vada.jpg' },
          { name: 'Idli Vada Combo (1+1)', sku: 'SI-007', description: 'One soft idli and one crispy medu vada served with hot sambar and fresh chutneys', suggestedPrice: 115, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 5, isPopular: true, kitchenStation: 'South Indian Station', imageUrl: '/assets/menu/south-indian/idli.jpg' }
        ]
      },
      {
        name: 'Uttapam & Thick Pancakes',
        slug: 'uttapam',
        iconName: 'Flame',
        description: 'Thick fermented rice pancakes with delicious toppings',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Onion Tomato Chilli Uttapam', sku: 'SI-008', description: 'Soft pancake topped with diced red onions, juicy tomatoes, cilantro and green chillies', suggestedPrice: 150, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 9, isPopular: true, kitchenStation: 'South Indian Station', imageUrl: '/assets/menu/south-indian/uttapam.jpg' },
          { name: 'Mixed Vegetable Cheese Uttapam', sku: 'SI-009', description: 'Loaded with finely chopped bell peppers, carrots, sweet corn and grated mozzarella', suggestedPrice: 180, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 10, kitchenStation: 'South Indian Station', imageUrl: '/assets/menu/south-indian/uttapam.jpg' }
        ]
      },
      {
        name: 'South Indian Rice Meals',
        slug: 'south-rice',
        iconName: 'Award',
        description: 'Traditional flavoured rice and complete meals',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'South Indian Thali Meal', sku: 'SI-010', description: 'Rice, Sambar, Rasam, Kootu, Poriyal, Curd, Appalam, Pickle and Payasam', suggestedPrice: 210, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 8, isPopular: true, kitchenStation: 'Main Kitchen', tags: ['COMPLETE_MEAL'], imageUrl: '/assets/menu/gujarati/thali.jpg' },
          { name: 'Curd Rice with Pomegranate', sku: 'SI-011', description: 'Creamy cooled curd mixed with soft rice, tempered with mustard, ginger and curry leaves', suggestedPrice: 140, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 4, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' },
          { name: 'Bisi Bele Bath (Hot Lentil Rice)', sku: 'SI-012', description: 'Karnataka specialty rice cooked with lentils, vegetables, tamarind and special aromatic spices', suggestedPrice: 160, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 7, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' }
        ]
      },
      {
        name: 'Traditional Filter Coffee & Drinks',
        slug: 'south-beverages',
        iconName: 'Coffee',
        description: 'Authentic decoction brewed filter kaapi',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Authentic Kumbakonam Filter Coffee', sku: 'SI-013', description: 'Strong chicory-blended coffee decoction frothed with boiling whole milk, served in traditional dabarah set', suggestedPrice: 60, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 3, isPopular: true, kitchenStation: 'Beverages & Bar', tags: ['BESTSELLER'], imageUrl: '/assets/menu/south-indian/filter-coffee.jpg' }
        ]
      }
    ]
  },

  // 4. Punjabi Restaurant
  {
    id: 'tpl-punjabi',
    name: 'Punjabi Dhaba & Restaurant',
    cuisine: 'Authentic Punjabi & Dhaba',
    categoryTypeGroup: 'INDIAN',
    priceRange: '₹50 - ₹360',
    categoryCount: 6,
    approxItemCount: 25,
    description: 'Sarson da saag, makki di roti, Amritsari kulcha, pindi chhole, dal makhani, paneer tikka & sweet lassi.',
    icon: '🥘',
    badge: 'Popular',
    version: '1.0',
    categories: [
      {
        name: 'Dhaba Starters & Tikkas',
        slug: 'punjabi-starters',
        iconName: 'Flame',
        description: 'Hearty highway dhaba style appetizers',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Amritsari Paneer Tikka', sku: 'PUN-001', description: 'Thick spiced cottage cheese slabs infused with ajwain and mustard oil, charred in clay oven', suggestedPrice: 280, dietaryType: 'VEG', spiceLevel: 'SPICY', prepTimeMinutes: 14, isPopular: true, kitchenStation: 'Tandoor', imageUrl: '/assets/menu/north-indian/paneer-tikka.jpg' },
          { name: 'Dhaba Dahi Kebab (6 Pcs)', sku: 'PUN-002', description: 'Crispy fried hung curd and paneer patties with cardamom and mint', suggestedPrice: 240, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 12, kitchenStation: 'Tandoor', imageUrl: '/assets/menu/north-indian/seekh-kebab.jpg' }
        ]
      },
      {
        name: 'Dhaba Special Curries',
        slug: 'punjabi-curries',
        iconName: 'Utensils',
        description: 'Desi ghee tempered dhaba curries',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Pindi Chhole (Rawalpindi Style)', sku: 'PUN-003', description: 'Dark slow-cooked chickpeas steeped with tea leaves, anardana, dried mango and desi spices', suggestedPrice: 230, dietaryType: 'VEG', spiceLevel: 'SPICY', prepTimeMinutes: 10, isPopular: true, kitchenStation: 'Curry Station', tags: ['BESTSELLER'], imageUrl: '/assets/menu/punjabi/pindi-chhole.jpg' },
          { name: 'Paneer Bhurji Desi Ghee', sku: 'PUN-004', description: 'Scrambled fresh cottage cheese wok-fried with onions, tomatoes, ginger and green chillies', suggestedPrice: 270, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 10, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' },
          { name: 'Sarson Ka Saag (Seasonal)', sku: 'PUN-005', description: 'Traditional mustard leaves cooked with bathua, spinach and desi makhan', suggestedPrice: 260, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 12, kitchenStation: 'Curry Station', tags: ['SEASONAL'], imageUrl: '/assets/menu/punjabi/sarson-saag.jpg' }
        ]
      },
      {
        name: 'Amritsari Kulchas & Rotis',
        slug: 'punjabi-breads',
        iconName: 'Bread',
        description: 'Stuffed crisp tandoori kulchas with butter',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Amritsari Aloo Pyaaz Kulcha', sku: 'PUN-006', description: 'Crisp flaky tandoori flatbread stuffed with spiced potatoes and onions, topped with dollop of butter', suggestedPrice: 90, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 8, isPopular: true, kitchenStation: 'Tandoor', tags: ['BESTSELLER'], imageUrl: '/assets/menu/north-indian/butter-naan.jpg' },
          { name: 'Paneer Kulcha Stuffed', sku: 'PUN-007', description: 'Leavened flatbread packed with spiced shredded paneer and fresh coriander', suggestedPrice: 120, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 8, kitchenStation: 'Tandoor', imageUrl: '/assets/menu/north-indian/butter-naan.jpg' },
          { name: 'Makki Di Roti (2 Pcs)', sku: 'PUN-008', description: 'Cornmeal flatbread roasted on tava with white butter and jaggery', suggestedPrice: 60, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 6, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/north-indian/butter-naan.jpg' }
        ]
      }
    ]
  },

  // 5. Mughlai Restaurant
  {
    id: 'tpl-mughlai',
    name: 'Mughlai & Awadhi Restaurant',
    cuisine: 'Royal Mughlai & Awadhi',
    categoryTypeGroup: 'INDIAN',
    priceRange: '₹80 - ₹420',
    categoryCount: 6,
    approxItemCount: 24,
    description: 'Nawabi shahi kormas, galouti kebabs, dum biryani, sheermal, roomali roti & saffron desserts.',
    icon: '👑',
    badge: 'Royal Dining',
    version: '1.0',
    categories: [
      {
        name: 'Nawabi Starters',
        slug: 'mughlai-starters',
        iconName: 'Flame',
        description: 'Delicate melt-in-mouth Awadhi kebabs',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Veg Galouti Kebab (4 Pcs)', sku: 'MUG-001', description: 'Melt-in-mouth smoked yam and lentil patties flavored with potli masala, served over mini ulta tawa paratha', suggestedPrice: 270, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 14, isPopular: true, kitchenStation: 'Tandoor', tags: ['CHEF_SPECIAL'], imageUrl: '/assets/menu/north-indian/seekh-kebab.jpg' },
          { name: 'Paneer Pasanda Tikka', sku: 'MUG-002', description: 'Layered cottage cheese stuffed with mint, nuts and khoya, glazed in tandoor', suggestedPrice: 300, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 15, kitchenStation: 'Tandoor', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' }
        ]
      },
      {
        name: 'Shahi Kormas & Gravies',
        slug: 'mughlai-gravies',
        iconName: 'Utensils',
        description: 'Nut-rich and saffron scented royal gravies',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Navratan Korma Royal', sku: 'MUG-003', description: 'Nine jewels of vegetables, fruits and nuts simmered in a mildly sweet cashew and khoya gravy', suggestedPrice: 310, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 14, isPopular: true, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/mughlai/navratan-korma.jpg' },
          { name: 'Mughlai Paneer Lababdar', sku: 'MUG-004', description: 'Paneer batons in a velvety tomato and melon seed gravy topped with grated cheese', suggestedPrice: 320, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 14, isPopular: true, kitchenStation: 'Curry Station', tags: ['BESTSELLER'], imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' }
        ]
      },
      {
        name: 'Awadhi Breads & Rice',
        slug: 'mughlai-breads',
        iconName: 'Bread',
        description: 'Sheermal, roomali roti and dum biryanis',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Khamiri Roti (2 Pcs)', sku: 'MUG-005', description: 'Traditional Mughal leavened bread with a slight sourdough tang', suggestedPrice: 60, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 5, kitchenStation: 'Tandoor', imageUrl: '/assets/menu/north-indian/butter-naan.jpg' },
          { name: 'Roomali Roti', sku: 'MUG-006', description: 'Handkerchief-thin soft bread tossed on inverted wok', suggestedPrice: 40, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 4, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/north-indian/butter-naan.jpg' },
          { name: 'Lucknowi Dum Biryani Handi', sku: 'MUG-007', description: 'Scented basmati rice cooked on slow dum with royal spices and kewra essence', suggestedPrice: 310, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 16, isPopular: true, kitchenStation: 'Curry Station', tags: ['BESTSELLER'], imageUrl: '/assets/menu/north-indian/biryani.jpg' }
        ]
      }
    ]
  },

  // 6. Kathiyawadi Restaurant
  {
    id: 'tpl-kathiyawadi',
    name: 'Kathiyawadi Dhaba & Bhojanalaya',
    cuisine: 'Rustic Saurashtra & Kathiyawadi',
    categoryTypeGroup: 'INDIAN',
    priceRange: '₹30 - ₹280',
    categoryCount: 5,
    approxItemCount: 22,
    description: 'Ringna no olo, sev dungri, lasaniya bataka, bajra no rotlo with makhan, khichdi kadhi & garlic chutney.',
    icon: '🌶️',
    badge: 'Spicy & Rustic',
    version: '1.0',
    categories: [
      {
        name: 'Kathiyawadi Special Shaak',
        slug: 'kathiyawadi-shaak',
        iconName: 'Flame',
        description: 'Fiery garlic and red chilli tempered village curries',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Kathiyawadi Ringna No Olo', sku: 'KAT-001', description: 'Charcoal roasted smoked eggplants mashed and cooked with garlic, green chillies, spring onions and oil', suggestedPrice: 200, dietaryType: 'VEG', spiceLevel: 'SPICY', prepTimeMinutes: 10, isPopular: true, kitchenStation: 'Curry Station', tags: ['BESTSELLER', 'RUSTIC'], imageUrl: '/assets/menu/kathiyawadi/ringna-olo.jpg' },
          { name: 'Lasaniya Bateta (Garlic Potatoes)', sku: 'KAT-002', description: 'Baby potatoes simmered in a bold fiery garlic and Kashmiri chilli paste gravy', suggestedPrice: 180, dietaryType: 'VEG', spiceLevel: 'SPICY', prepTimeMinutes: 8, isPopular: true, kitchenStation: 'Curry Station', tags: ['SPICY'], imageUrl: '/assets/menu/kathiyawadi/lasaniya-bateta.jpg' },
          { name: 'Sev Dungri Nu Shaak', sku: 'KAT-003', description: 'Caramelized onions cooked with crisp sev in a tangy rustic sauce', suggestedPrice: 170, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 8, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/gujarati/sev-tameta.jpg' },
          { name: 'Dahi Tikhari (Kathiyawadi Dip)', sku: 'KAT-004', description: 'Yogurt tempered with sizzling garlic, red chilli powder and cumin in groundnut oil', suggestedPrice: 130, dietaryType: 'VEG', spiceLevel: 'SPICY', prepTimeMinutes: 5, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/kathiyawadi/dahi-tikhari.jpg' }
        ]
      },
      {
        name: 'Rotla & Accompaniments',
        slug: 'rotla-chutney',
        iconName: 'Bread',
        description: 'Millet flatbreads with fresh white butter, jaggery and garlic chutney',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Kathiyawadi Bajra Rotla (White Butter)', sku: 'KAT-005', description: 'Hand-shaped bajra flatbread roasted over slow heat with dollop of fresh churned makhan and jaggery', suggestedPrice: 50, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 6, isPopular: true, kitchenStation: 'Main Kitchen', tags: ['BESTSELLER'], imageUrl: '/assets/menu/gujarati/rotla.jpg' },
          { name: 'Leelvanu Lasan Chutney', sku: 'KAT-006', description: 'Pounded green garlic and red chilli chutney', suggestedPrice: 40, dietaryType: 'VEG', spiceLevel: 'SPICY', prepTimeMinutes: 2, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' }
        ]
      }
    ]
  },

  // 7. Rajasthani Restaurant
  {
    id: 'tpl-rajasthani',
    name: 'Rajasthani Marwari Bhojanalaya',
    cuisine: 'Royal Rajasthani & Marwari',
    categoryTypeGroup: 'INDIAN',
    priceRange: '₹40 - ₹340',
    categoryCount: 5,
    approxItemCount: 22,
    description: 'Dal baati churma, gatte ki sabzi, ker sangri, papad mangodi, missi roti & spiced chaas.',
    icon: '🏰',
    badge: 'Heritage',
    version: '1.0',
    categories: [
      {
        name: 'Dal Baati Churma Specialties',
        slug: 'dal-baati',
        iconName: 'Award',
        description: 'Authentic Marwari feast with pure desi ghee',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Marwari Dal Baati Churma Thali', sku: 'RAJ-001', description: 'Panchmel Dal, 4 Baked Baatis drenched in desi ghee, Sweet Wheat Churma, Gatte Ki Sabzi, Garlic Chutney & Chaas', suggestedPrice: 320, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 12, isPopular: true, kitchenStation: 'Main Kitchen', tags: ['BESTSELLER', 'ROYAL_FEAST'], imageUrl: '/assets/menu/gujarati/thali.jpg' }
        ]
      },
      {
        name: 'Rajasthani Royal Curries',
        slug: 'rajasthani-curries',
        iconName: 'Flame',
        description: 'Authentic yogurt and dried berry curries',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Shahi Gatte Ki Sabzi', sku: 'RAJ-002', description: 'Steamed gram flour dumplings simmered in a spiced tangy yogurt and mustard seed gravy', suggestedPrice: 220, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 10, isPopular: true, kitchenStation: 'Curry Station', tags: ['BESTSELLER'], imageUrl: '/assets/menu/rajasthani/gatte-ki-sabzi.jpg' },
          { name: 'Authentic Ker Sangri Special', sku: 'RAJ-003', description: 'Desert beans and wild capers cooked with red chillies, raw mango powder and mustard oil', suggestedPrice: 290, dietaryType: 'VEG', spiceLevel: 'SPICY', prepTimeMinutes: 10, kitchenStation: 'Curry Station', tags: ['CHEF_SPECIAL'], imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' },
          { name: 'Pithod Ki Sabzi', sku: 'RAJ-004', description: 'Spiced besan diamond cakes cooked in a creamy Rajasthani kadhi gravy', suggestedPrice: 210, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 10, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' }
        ]
      }
    ]
  },

  // 8. South Indian Tiffin
  {
    id: 'tpl-south-tiffin',
    name: 'South Indian Tiffin & Breakfast',
    cuisine: 'Fast South Indian Tiffin',
    categoryTypeGroup: 'INDIAN',
    priceRange: '₹35 - ₹160',
    categoryCount: 4,
    approxItemCount: 18,
    description: 'Fast-moving morning and evening tiffin: mini ghee idlis, vada sambar, rava dosa, ven pongal, poori masala & filter coffee.',
    icon: '☕',
    badge: 'High Speed',
    version: '1.0',
    categories: [
      {
        name: 'Quick Tiffin Plates',
        slug: 'tiffin-plates',
        iconName: 'Utensils',
        description: 'Steamed tiffin breakfast options',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Ghee Mini Podi Idli (14 Pcs)', sku: 'TIF-001', description: 'Cocktail bite-sized idlis coated in spicy podi powder and hot melted ghee', suggestedPrice: 110, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 4, isPopular: true, kitchenStation: 'South Indian Station', tags: ['BESTSELLER'], imageUrl: '/assets/menu/south-indian/idli.jpg' },
          { name: 'Hot Ven Pongal with Ghee Cashews', sku: 'TIF-002', description: 'Moong dal and rice porridge cooked with cumin, pepper, ginger and fried cashews in ghee', suggestedPrice: 100, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 5, kitchenStation: 'South Indian Station', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' }
        ]
      }
    ]
  },

  // 9. Pure Vegetarian Restaurant
  {
    id: 'tpl-pure-veg',
    name: 'Pure Vegetarian Family Restaurant',
    cuisine: '100% Pure Veg Multi-Cuisine',
    categoryTypeGroup: 'INDIAN',
    priceRange: '₹50 - ₹340',
    categoryCount: 6,
    approxItemCount: 26,
    description: 'Pure vegetarian dining with separate satvik preparation: North Indian paneer curries, dal tadka, pulav, snacks & mocktails.',
    icon: '🥬',
    badge: 'Pure Veg',
    version: '1.0',
    categories: [
      {
        name: 'Vegetarian Starters',
        slug: 'veg-starters',
        iconName: 'Utensils',
        description: 'Crispy snacks and tikkas made with pure vegetarian ingredients',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Crispy Corn Salt & Pepper', sku: 'PV-001', description: 'Sweet corn kernels wok-tossed with crushed black peppercorns, scallions and bell peppers', suggestedPrice: 210, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 8, isPopular: true, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/fast-food/peri-peri-fries.jpg' }
        ]
      }
    ]
  },

  // 10. Jain Restaurant
  {
    id: 'tpl-jain',
    name: 'Jain Satvik Bhojanalaya',
    cuisine: 'Authentic Jain & No Root-Veg',
    categoryTypeGroup: 'INDIAN',
    priceRange: '₹40 - ₹320',
    categoryCount: 5,
    approxItemCount: 20,
    description: 'Strictly 100% Jain food prepared with zero onion, garlic, potato, or root vegetables. Raw banana dishes, pure ghee dals & satvik sweets.',
    icon: '🌾',
    badge: 'Strictly Jain',
    version: '1.0',
    categories: [
      {
        name: 'Jain Starters & Tikkas',
        slug: 'jain-starters',
        iconName: 'Flame',
        description: 'Prepared without any root vegetables, onions or garlic',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Jain Paneer Tikka Satvik', sku: 'JAI-001', description: 'Cottage cheese marinated in pure curd, carom seeds and yellow chilli powder, roasted with capsicum', suggestedPrice: 280, dietaryType: 'JAIN', spiceLevel: 'MILD', prepTimeMinutes: 14, isPopular: true, kitchenStation: 'Tandoor', tags: ['JAIN_CERTIFIED'], imageUrl: '/assets/menu/north-indian/paneer-tikka.jpg' },
          { name: 'Jain Raw Banana Cutlets (4 Pcs)', sku: 'JAI-002', description: 'Steamed green plantain and green pea cutlets spiced with ginger and green chillies', suggestedPrice: 190, dietaryType: 'JAIN', spiceLevel: 'MILD', prepTimeMinutes: 10, kitchenStation: 'Main Kitchen', tags: ['JAIN_CERTIFIED'], imageUrl: '/assets/menu/jain/raw-banana.jpg' }
        ]
      },
      {
        name: 'Jain Curries & Dals',
        slug: 'jain-curries',
        iconName: 'Utensils',
        description: 'Rich satvik gravies with raw banana, paneer and yellow dals',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Jain Paneer Butter Masala', sku: 'JAI-003', description: 'Paneer in smooth tomato-cashew gravy made strictly without onion, garlic or ginger paste', suggestedPrice: 290, dietaryType: 'JAIN', spiceLevel: 'MILD', prepTimeMinutes: 12, isPopular: true, kitchenStation: 'Curry Station', tags: ['BESTSELLER', 'JAIN_CERTIFIED'], imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' },
          { name: 'Jain Kela Nu Shaak (Raw Banana Curry)', sku: 'JAI-004', description: 'Raw bananas cooked in sweet and tangy Gujarati style with crushed peanuts and cumin', suggestedPrice: 200, dietaryType: 'JAIN', spiceLevel: 'MILD', prepTimeMinutes: 10, kitchenStation: 'Curry Station', tags: ['JAIN_CERTIFIED'], imageUrl: '/assets/menu/jain/raw-banana.jpg' }
        ]
      }
    ]
  },

  // 11. Indian Multi-Cuisine Restaurant
  {
    id: 'tpl-multicuisine',
    name: 'Indian Multi-Cuisine Diner',
    cuisine: 'North Indian, South Indian & Chinese',
    categoryTypeGroup: 'MULTI_CUISINE',
    priceRange: '₹50 - ₹360',
    categoryCount: 8,
    approxItemCount: 32,
    description: 'Full multi-cuisine menu covering North Indian curries, South Indian dosas, Indo-Chinese noodles & Italian pizzas.',
    icon: '🍱',
    badge: 'All-Rounder',
    version: '1.0',
    categories: [
      {
        name: 'North Indian Curries',
        slug: 'mc-north',
        iconName: 'Utensils',
        description: 'Paneer butter masala, dal tadka, kadai veg and naans',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Paneer Lababdar Special', sku: 'MC-001', description: 'Paneer batons cooked in rich tomato and onion gravy with grated paneer garnish', suggestedPrice: 290, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 14, isPopular: true, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' }
        ]
      }
    ]
  },

  // 12. Indian Family Restaurant
  {
    id: 'tpl-family-diner',
    name: 'Indian Family Restaurant & Banquet',
    cuisine: 'North Indian & Family Meals',
    categoryTypeGroup: 'MULTI_CUISINE',
    priceRange: '₹60 - ₹380',
    categoryCount: 6,
    approxItemCount: 26,
    description: 'Designed for family dining: large sharing platters, baby corn starters, signature dals, biryani handis and ice cream sundaes.',
    icon: '👨‍👩‍👧‍👦',
    badge: 'Family Favorite',
    version: '1.0',
    categories: [
      {
        name: 'Family Sharing Platters',
        slug: 'family-platters',
        iconName: 'Award',
        description: 'Generous sharing portions for family tables',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Grand Tandoori Veg Kebab Platter', sku: 'FAM-001', description: 'Assortment of Paneer Tikka, Hara Bhara Kebab, Stuffed Mushrooms and Veg Seekh (16 Pcs)', suggestedPrice: 580, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 18, isPopular: true, kitchenStation: 'Tandoor', tags: ['FAMILY_PLATTER'], imageUrl: '/assets/menu/north-indian/seekh-kebab.jpg' }
        ]
      }
    ]
  },

  // 13. Indian Thali Restaurant
  {
    id: 'tpl-thali',
    name: 'Grand Indian Thali Restaurant',
    cuisine: 'Unlimited & Executive Thalis',
    categoryTypeGroup: 'INDIAN',
    priceRange: '₹180 - ₹450',
    categoryCount: 4,
    approxItemCount: 16,
    description: 'Full-course Indian thali dining: Rajasthani, Gujarati, Punjabi & South Indian unlimited meal platters.',
    icon: '🍱',
    badge: 'High Value',
    version: '1.0',
    categories: [
      {
        name: 'Signature Thali Offerings',
        slug: 'thali-options',
        iconName: 'Award',
        description: 'Complete multi-bowl thali meals',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Maharaja Unlimited Royal Thali', sku: 'THL-001', description: '4 Curries, 2 Dals, 4 Bread Varieties, Pulav, 2 Farsan, 2 Desserts, Raita, Papad, Chutney and Chaas', suggestedPrice: 380, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 8, isPopular: true, kitchenStation: 'Main Kitchen', tags: ['UNLIMITED', 'BESTSELLER'], imageUrl: '/assets/menu/gujarati/thali.jpg' },
          { name: 'Quick Business Lunch Thali', sku: 'THL-002', description: '2 Curries, Yellow Dal, 3 Phulkas, Steamed Rice, Sweet and Chaas', suggestedPrice: 199, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 6, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/gujarati/thali.jpg' }
        ]
      }
    ]
  },

  // 14. Chinese Restaurant
  {
    id: 'tpl-chinese',
    name: 'Authentic Chinese & Wok',
    cuisine: 'Pan-Asian & Chinese Wok',
    categoryTypeGroup: 'MULTI_CUISINE',
    priceRange: '₹120 - ₹320',
    categoryCount: 5,
    approxItemCount: 22,
    description: 'Wok-charred fried rice, Hakka noodles, dim sums, Manchurian gravies, spring rolls & sweet corn soup.',
    icon: '🥡',
    badge: 'Popular',
    version: '1.0',
    categories: [
      {
        name: 'Wok Tossed Noodles & Rice',
        slug: 'chinese-mains',
        iconName: 'Flame',
        description: 'High flame wok tossed noodles and basmati rice',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Veg Hakka Noodles', sku: 'CHI-001', description: 'Thin noodles wok tossed with shredded cabbage, bell peppers, carrots, spring onions and dark soy sauce', suggestedPrice: 190, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 10, isPopular: true, kitchenStation: 'Chinese Wok', tags: ['BESTSELLER'], imageUrl: '/assets/menu/chinese/hakka-noodles.jpg' },
          { name: 'Schezwan Fried Rice', sku: 'CHI-002', description: 'Basmati rice tossed with fiery Sichuan pepper sauce and diced crunchy vegetables', suggestedPrice: 210, dietaryType: 'VEG', spiceLevel: 'SPICY', prepTimeMinutes: 10, isPopular: true, kitchenStation: 'Chinese Wok', tags: ['SPICY'], imageUrl: '/assets/menu/chinese/schezwan-rice.jpg' }
        ]
      },
      {
        name: 'Chinese Starters & Gravies',
        slug: 'chinese-starters',
        iconName: 'Utensils',
        description: 'Crispy appetizers and savoury gravies',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Chilli Paneer Dry', sku: 'CHI-003', description: 'Crisp coated paneer cubes tossed with onion petals, green chillies, garlic and soy glaze', suggestedPrice: 250, dietaryType: 'VEG', spiceLevel: 'SPICY', prepTimeMinutes: 12, isPopular: true, kitchenStation: 'Chinese Wok', tags: ['BESTSELLER'], imageUrl: '/assets/menu/chinese/chilli-paneer.jpg' },
          { name: 'Veg Manchurian Gravy', sku: 'CHI-004', description: 'Vegetable dumplings simmered in rich garlic, coriander and soy sauce gravy', suggestedPrice: 220, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 12, kitchenStation: 'Chinese Wok', imageUrl: '/assets/menu/chinese/manchurian.jpg' }
        ]
      }
    ]
  },

  // 15. Indo-Chinese Restaurant
  {
    id: 'tpl-indo-chinese',
    name: 'Desi Indo-Chinese Food Corner',
    cuisine: 'Desi Chinese & Fast Asian',
    categoryTypeGroup: 'MULTI_CUISINE',
    priceRange: '₹90 - ₹280',
    categoryCount: 4,
    approxItemCount: 18,
    description: 'Spicy Schezwan noodles, Triple Schezwan rice with gravy, Chinese bhel, chilli garlic momos & manchow soup.',
    icon: '🥢',
    badge: 'Desi Fusion',
    version: '1.0',
    categories: [
      {
        name: 'Desi Chinese Favorites',
        slug: 'desi-chinese',
        iconName: 'Flame',
        description: 'Spicy fusion Chinese dishes',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Triple Schezwan Rice with Gravy', sku: 'IC-001', description: 'Combo of wok rice, fried noodles, and hot Schezwan Manchurian gravy bowl', suggestedPrice: 260, dietaryType: 'VEG', spiceLevel: 'SPICY', prepTimeMinutes: 12, isPopular: true, kitchenStation: 'Chinese Wok', tags: ['BESTSELLER'], imageUrl: '/assets/menu/chinese/schezwan-rice.jpg' },
          { name: 'Crispy Chinese Bhel', sku: 'IC-002', description: 'Fried noodles tossed with cabbage, capsicum, sweet chilli and schezwan dips', suggestedPrice: 140, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 6, kitchenStation: 'Chinese Wok', imageUrl: '/assets/menu/chaat/sev-puri.jpg' }
        ]
      }
    ]
  },

  // 16. Fast Food Restaurant
  {
    id: 'tpl-fast-food',
    name: 'Fast Food & Quick Service Restaurant',
    cuisine: 'Fast Food & American',
    categoryTypeGroup: 'FAST_FOOD',
    priceRange: '₹60 - ₹280',
    categoryCount: 6,
    approxItemCount: 24,
    description: 'Crispy burgers, cheesy wraps, golden french fries, garlic breads, pizza slices, cold soft drinks & sundaes.',
    icon: '🍟',
    badge: 'Youth Favourite',
    version: '1.0',
    categories: [
      {
        name: 'Burgers & Wraps',
        slug: 'burgers-wraps',
        iconName: 'Flame',
        description: 'Brioche bun burgers and toasted tortilla wraps',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Crispy Veggie Supreme Burger', sku: 'FF-001', description: 'Crisp vegetable patty with cheese slice, iceberg lettuce and smoky mayo on a toasted sesame bun', suggestedPrice: 130, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 6, isPopular: true, kitchenStation: 'Fry Station', tags: ['BESTSELLER'], imageUrl: '/assets/menu/pizza/farmhouse.jpg' },
          { name: 'Spicy Paneer Tikka Wrap', sku: 'FF-002', description: 'Grilled spiced paneer cubes rolled in a warm tortilla with mint mayo and pickled onions', suggestedPrice: 160, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 7, isPopular: true, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/north-indian/paneer-tikka.jpg' }
        ]
      },
      {
        name: 'Fries & Quick Sides',
        slug: 'fries-sides',
        iconName: 'Utensils',
        description: 'Crisp salted and seasoned sides',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Peri Peri Crinkle Fries', sku: 'FF-003', description: 'Golden potato fries shaken with fiery African peri peri spice mix', suggestedPrice: 120, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 5, isPopular: true, kitchenStation: 'Fry Station', tags: ['BESTSELLER'], imageUrl: '/assets/menu/fast-food/peri-peri-fries.jpg' },
          { name: 'Cheesy Jalapeno Poppers (6 Pcs)', sku: 'FF-004', description: 'Crisp golden bites filled with molten cheese and spicy jalapenos', suggestedPrice: 150, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 6, kitchenStation: 'Fry Station', imageUrl: '/assets/menu/fast-food/peri-peri-fries.jpg' }
        ]
      }
    ]
  },

  // 17. Burger & Sandwich Restaurant
  {
    id: 'tpl-burger-sandwich',
    name: 'Burger & Grilled Sandwich Bar',
    cuisine: 'Gourmet Burgers & Sandwiches',
    categoryTypeGroup: 'FAST_FOOD',
    priceRange: '₹80 - ₹280',
    categoryCount: 4,
    approxItemCount: 18,
    description: 'Bombay grilled sandwiches, triple-decker cheese toasties, gourmet smash veg burgers & loaded crinkle fries.',
    icon: '🥪',
    badge: 'Popular',
    version: '1.0',
    categories: [
      {
        name: 'Grilled Sandwiches',
        slug: 'grilled-sandwiches',
        iconName: 'Bread',
        description: 'Jumbo 3-tier grilled sandwiches with melted cheese',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Bombay Special Grilled Sandwich', sku: 'BS-001', description: 'Spiced potato mash, beetroot, cucumber, tomato and processed cheese with spicy coriander chutney', suggestedPrice: 160, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 8, isPopular: true, kitchenStation: 'Main Kitchen', tags: ['BESTSELLER'], imageUrl: '/assets/menu/fast-food/sandwich.jpg' },
          { name: 'Paneer Makhani Cheese Toastie', sku: 'BS-002', description: 'Spiced cottage cheese tossed in makhani sauce loaded with mozzarella in golden toasted bread', suggestedPrice: 180, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 8, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' }
        ]
      }
    ]
  },

  // 18. Cafe
  {
    id: 'tpl-cafe',
    name: 'Artisan Café & Coffee Bar',
    cuisine: 'Specialty Coffee & Continental',
    categoryTypeGroup: 'CAFE_BAKERY',
    priceRange: '₹90 - ₹340',
    categoryCount: 6,
    approxItemCount: 24,
    description: 'Espresso coffees, cold brews, frappes, hot artisan teas, garlic toasts, pastas & chocolate desserts.',
    icon: '☕',
    badge: 'Trendy',
    version: '1.0',
    categories: [
      {
        name: 'Hot Espresso & Coffees',
        slug: 'hot-coffee',
        iconName: 'Coffee',
        description: 'Freshly ground Arabica espresso coffees',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Classic Cappuccino', sku: 'CAF-001', description: 'Rich double espresso topped with silky steamed whole milk foam and dark cocoa dust', suggestedPrice: 140, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 4, isPopular: true, kitchenStation: 'Beverages & Bar', tags: ['BESTSELLER'], imageUrl: '/assets/menu/north-indian/lassi.jpg' },
          { name: 'Roasted Hazelnut Latte', sku: 'CAF-002', description: 'Velvety espresso with steamed milk and aromatic roasted hazelnut syrup', suggestedPrice: 170, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 4, kitchenStation: 'Beverages & Bar', imageUrl: '/assets/menu/south-indian/masala-dosa.jpg' }
        ]
      },
      {
        name: 'Iced Frappes & Coolers',
        slug: 'iced-frappes',
        iconName: 'Coffee',
        description: 'Blended cold coffees and fruit coolers',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Caramel Brownie Frappe', sku: 'CAF-003', description: 'Chilled blended espresso with chocolate brownie crumbs, caramel drizzle and whipped cream', suggestedPrice: 200, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 5, isPopular: true, kitchenStation: 'Beverages & Bar', tags: ['BESTSELLER'], imageUrl: '/assets/menu/cafe/frappe.jpg' }
        ]
      }
    ]
  },

  // 19. Bakery & Cafe
  {
    id: 'tpl-bakery',
    name: 'Bakery, Patisserie & Cafe',
    cuisine: 'Baking & Confectionery',
    categoryTypeGroup: 'CAFE_BAKERY',
    priceRange: '₹60 - ₹450',
    categoryCount: 5,
    approxItemCount: 22,
    description: 'Fresh pastries, whole cream cakes, butter croissants, chocolate lava cakes, cookies & cold shakes.',
    icon: '🥐',
    badge: 'Sweet & Savory',
    version: '1.0',
    categories: [
      {
        name: 'Pastries & Slices',
        slug: 'bakery-pastries',
        iconName: 'Award',
        description: 'Fresh daily baked layered pastries',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Dutch Chocolate Truffle Slice', sku: 'BAK-001', description: 'Rich dark chocolate sponge layered with 55% cocoa ganache', suggestedPrice: 130, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 2, isPopular: true, kitchenStation: 'Dessert Counter', tags: ['BESTSELLER'], imageUrl: '/assets/menu/bakery/truffle-pastry.jpg' },
          { name: 'Warm Choco Lava Cake', sku: 'BAK-002', description: 'Molten chocolate filled warm sponge cake dusted with icing sugar', suggestedPrice: 110, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 4, isPopular: true, kitchenStation: 'Dessert Counter', imageUrl: '/assets/menu/bakery/choco-lava.jpg' }
        ]
      }
    ]
  },

  // 20. Pizza Restaurant
  {
    id: 'tpl-pizza',
    name: 'Pizza Restaurant',
    cuisine: 'Italian & Pizza',
    categoryTypeGroup: 'FAST_FOOD',
    priceRange: '₹140 - ₹420',
    categoryCount: 6,
    approxItemCount: 25,
    description: 'Hand-tossed pan pizzas, gourmet cheese burst varieties, garlic breads, Italian red & white pastas & dips.',
    icon: '🍕',
    badge: 'Popular',
    version: '1.0',
    categories: [
      {
        name: 'Hand-Tossed Pizzas',
        slug: 'pizzas',
        iconName: 'Pizza',
        description: 'Fresh dough pizzas baked with San Marzano sauce and 100% mozzarella',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Margherita Basilico', sku: 'PIZ-001', description: 'Classic 100% mozzarella cheese, fresh basil leaves and Italian herb tomato sauce', suggestedPrice: 240, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 12, isPopular: true, kitchenStation: 'Pizza Station', tags: ['BESTSELLER'], imageUrl: '/assets/menu/pizza/margherita.jpg' },
          { name: 'Farmhouse Veggie Supreme', sku: 'PIZ-002', description: 'Crunchy bell peppers, button mushrooms, sweet corn, red onions and diced tomatoes', suggestedPrice: 320, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 14, isPopular: true, kitchenStation: 'Pizza Station', tags: ['BESTSELLER'], imageUrl: '/assets/menu/pizza/farmhouse.jpg' },
          { name: 'Paneer Tikka Makhani Pizza', sku: 'PIZ-003', description: 'Tandoori marinated cottage cheese, roasted capsicum and makhani drizzle on hand-tossed crust', suggestedPrice: 350, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 14, kitchenStation: 'Pizza Station', tags: ['FUSION'], imageUrl: '/assets/menu/north-indian/paneer-tikka.jpg' }
        ]
      },
      {
        name: 'Garlic Breads & Pastas',
        slug: 'garlic-bread-pasta',
        iconName: 'Bread',
        description: 'Cheesy garlic baguettes and Italian pastas',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Cheese Stuffed Garlic Breadsticks', sku: 'PIZ-004', description: 'Baked baguettes loaded with garlic butter, herbs and melted mozzarella', suggestedPrice: 160, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 10, isPopular: true, kitchenStation: 'Pizza Station', tags: ['BESTSELLER'], imageUrl: '/assets/menu/pizza/garlic-bread.jpg' },
          { name: 'Creamy Alfredo White Sauce Penne', sku: 'PIZ-005', description: 'Penne pasta tossed in rich parmesan cheese cream sauce with garlic and mushrooms', suggestedPrice: 260, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 12, kitchenStation: 'Main Kitchen', imageUrl: '/assets/menu/pizza/garlic-bread.jpg' }
        ]
      }
    ]
  },

  // 21. Street Food / Chaat Restaurant
  {
    id: 'tpl-chaat',
    name: 'Chaat Bazaar & Street Food',
    cuisine: 'Authentic Indian Chaat',
    categoryTypeGroup: 'STREET_FOOD',
    priceRange: '₹40 - ₹180',
    categoryCount: 4,
    approxItemCount: 20,
    description: 'Pani puri shots, sev puri, dahi bhel, samosa chaat, butter pav bhaji & sweet mango lassi.',
    icon: '🥙',
    badge: 'Quick Bites',
    version: '1.0',
    categories: [
      {
        name: 'Puri & Chaat Specialties',
        slug: 'chaats',
        iconName: 'Utensils',
        description: 'Tangy and sweet street food delights',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Pani Puri Platter (6 Pcs)', sku: 'CHT-001', description: 'Crispy puris stuffed with spiced chickpea mash, tangy mint-coriander water and sweet date chutney', suggestedPrice: 70, dietaryType: 'VEG', spiceLevel: 'SPICY', prepTimeMinutes: 3, isPopular: true, kitchenStation: 'Chaat Counter', tags: ['BESTSELLER'], imageUrl: '/assets/menu/cafe/cappuccino.jpg' },
          { name: 'Dahi Sev Batata Puri', sku: 'CHT-002', description: 'Crispy puris filled with potato mash, sweet chilled curd, sev, pomegranate and mint chutney', suggestedPrice: 110, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 4, isPopular: true, kitchenStation: 'Chaat Counter', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' },
          { name: 'Butter Pav Bhaji (2 Pav)', sku: 'CHT-003', description: 'Mashed spicy mixed vegetable gravy simmered with Amul butter, served with toasted butter pav', suggestedPrice: 150, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 8, isPopular: true, kitchenStation: 'Chaat Counter', tags: ['BESTSELLER'], imageUrl: '/assets/menu/chaat/pav-bhaji.jpg' }
        ]
      }
    ]
  },

  // 22. Snacks & Quick Bites
  {
    id: 'tpl-snacks',
    name: 'Snacks & Quick Bites Corner',
    cuisine: 'Indian Teatime Snacks',
    categoryTypeGroup: 'STREET_FOOD',
    priceRange: '₹30 - ₹150',
    categoryCount: 4,
    approxItemCount: 16,
    description: 'Punjabi samosas, kachoris, vada pav, pakodas, maska bun & hot kulhad masala chai.',
    icon: '🥟',
    badge: 'High Frequency',
    version: '1.0',
    categories: [
      {
        name: 'Hot Fried Snacks',
        slug: 'fried-snacks',
        iconName: 'Utensils',
        description: 'Fresh morning and evening snacks',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Special Punjabi Samosa (2 Pcs)', sku: 'SNK-001', description: 'Crisp pastry triangles stuffed with spiced potato and green peas with saunth chutney', suggestedPrice: 50, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 3, isPopular: true, kitchenStation: 'Main Kitchen', tags: ['BESTSELLER'], imageUrl: '/assets/menu/snacks/samosa.jpg' },
          { name: 'Mumbai Vada Pav with Chutney', sku: 'SNK-002', description: 'Spiced potato batata vada in a pav with dry garlic coconut chutney and fried green chilli', suggestedPrice: 45, dietaryType: 'VEG', spiceLevel: 'SPICY', prepTimeMinutes: 3, isPopular: true, kitchenStation: 'Main Kitchen', tags: ['BESTSELLER'], imageUrl: '/assets/menu/south-indian/medu-vada.jpg' }
        ]
      }
    ]
  },

  // 23. Biryani Restaurant
  {
    id: 'tpl-biryani',
    name: 'Biryani & Kebab Darbar',
    cuisine: 'Royal Dum Biryanis & Kebabs',
    categoryTypeGroup: 'INDIAN',
    priceRange: '₹90 - ₹380',
    categoryCount: 5,
    approxItemCount: 20,
    description: 'Slow-cooked handi dum biryanis, saffron rice, mirchi ka salan, boondi raita, seekh kebabs & firni.',
    icon: '🍚',
    badge: 'High Volume',
    version: '1.0',
    categories: [
      {
        name: 'Handi Dum Biryanis',
        slug: 'dum-biryanis',
        iconName: 'Flame',
        description: 'Cooked in sealed pots with royal spices and saffron',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Paneer Dum Biryani Handi', sku: 'BIR-001', description: 'Charred paneer cubes marinated in yogurt masala, layered with aged basmati rice and saffron', suggestedPrice: 280, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 14, isPopular: true, kitchenStation: 'Curry Station', tags: ['BESTSELLER'], imageUrl: '/assets/menu/north-indian/biryani.jpg' },
          { name: 'Shahi Subz Dum Biryani', sku: 'BIR-002', description: 'Medley of vegetables, mint and browned onions slow-cooked on dum, served with mirchi salan and raita', suggestedPrice: 250, dietaryType: 'VEG', spiceLevel: 'MEDIUM', prepTimeMinutes: 14, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/north-indian/biryani.jpg' }
        ]
      }
    ]
  },

  // 24. Tandoor Restaurant
  {
    id: 'tpl-tandoor',
    name: 'Tandoori Grills & Clay-Oven Specialist',
    cuisine: 'Authentic Charcoal Tandoor',
    categoryTypeGroup: 'INDIAN',
    priceRange: '₹60 - ₹360',
    categoryCount: 4,
    approxItemCount: 18,
    description: 'Charcoal clay-oven roasted paneer tikkas, soya chaap, stuffed mushrooms, garlic naans & pudina rotis.',
    icon: '🔥',
    badge: 'Grill Specialist',
    version: '1.0',
    categories: [
      {
        name: 'Tandoori Grills & Chaap',
        slug: 'tandoor-grills',
        iconName: 'Flame',
        description: 'Marinated appetizers charred on high heat',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Malai Soya Chaap Tandoori', sku: 'TAN-001', description: 'Tender soya chaap marinated in creamy cashew, cheese and green cardamom paste, roasted to perfection', suggestedPrice: 260, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 14, isPopular: true, kitchenStation: 'Tandoor', tags: ['BESTSELLER'], imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' },
          { name: 'Tandoori Afghani Paneer Tikka', sku: 'TAN-002', description: 'Cottage cheese cubes bathed in mild white pepper cream marinade, charred with bell peppers', suggestedPrice: 290, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 14, kitchenStation: 'Tandoor', imageUrl: '/assets/menu/north-indian/paneer-tikka.jpg' }
        ]
      }
    ]
  },

  // 25. Sweets & Mithai
  {
    id: 'tpl-sweets',
    name: 'Royal Indian Sweets & Mithai',
    cuisine: 'Traditional Indian Mithai',
    categoryTypeGroup: 'BEVERAGES_SWEETS',
    priceRange: '₹80 - ₹480',
    categoryCount: 4,
    approxItemCount: 18,
    description: 'Desi ghee kaju katli, motichoor laddoos, milk pedas, gulab jamuns, rasgullas & dry fruit sweets.',
    icon: '🍬',
    badge: 'Mithai Counter',
    version: '1.0',
    categories: [
      {
        name: 'Desi Ghee Mithai',
        slug: 'ghee-sweets',
        iconName: 'Award',
        description: 'Fresh daily sweets made in pure desi ghee',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Kaju Katli Special (250g)', sku: 'SWT-001', description: 'Diamond cut cashew nut fudge made with premium cashews and silver vark', suggestedPrice: 250, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 2, isPopular: true, kitchenStation: 'Dessert Counter', tags: ['BESTSELLER'], imageUrl: '/assets/menu/sweets/kaju-katli.jpg' },
          { name: 'Motichoor Laddoo (250g)', sku: 'SWT-002', description: 'Tiny gram flour pearls fried in pure desi ghee and soaked in saffron sugar syrup', suggestedPrice: 180, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 2, kitchenStation: 'Dessert Counter', imageUrl: '/assets/menu/sweets/motichoor.jpg' }
        ]
      }
    ]
  },

  // 26. Juice / Beverages
  {
    id: 'tpl-juice-beverages',
    name: 'Fresh Juice & Mocktail Bar',
    cuisine: 'Cold-Pressed Juices & Shakes',
    categoryTypeGroup: 'BEVERAGES_SWEETS',
    priceRange: '₹60 - ₹180',
    categoryCount: 4,
    approxItemCount: 18,
    description: 'Freshly squeezed fruit juices, thick milkshakes, detox green juices, iced coolers & mojitos.',
    icon: '🍹',
    badge: 'Refreshing',
    version: '1.0',
    categories: [
      {
        name: 'Fresh Cold Juices',
        slug: 'fruit-juices',
        iconName: 'Coffee',
        description: '100% natural fruit juices with no added preservatives',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Fresh Mosambi (Sweet Lime) Juice', sku: 'JUC-001', description: 'Freshly squeezed sweet lime juice with a pinch of black salt', suggestedPrice: 90, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 3, isPopular: true, kitchenStation: 'Beverages & Bar', tags: ['BESTSELLER'], imageUrl: '/assets/menu/beverages/juice.jpg' },
          { name: 'Virgin Mint Mojito Cooler', sku: 'JUC-002', description: 'Crushed fresh mint, lime wedges, simple syrup topped with sparkling soda and ice', suggestedPrice: 110, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 3, isPopular: true, kitchenStation: 'Beverages & Bar', imageUrl: '/assets/menu/beverages/mojito.jpg' }
        ]
      }
    ]
  },

  // 27. Desserts & Ice Cream
  {
    id: 'tpl-desserts',
    name: 'Dessert & Ice Cream Parlour',
    cuisine: 'Gourmet Ice Creams & Sundaes',
    categoryTypeGroup: 'BEVERAGES_SWEETS',
    priceRange: '₹70 - ₹240',
    categoryCount: 4,
    approxItemCount: 16,
    description: 'Artisanal stone ice creams, brownie sizzling sundaes, faloodas, Belgian waffles & kulfi falooda.',
    icon: '🍨',
    badge: 'Dessert Heaven',
    version: '1.0',
    categories: [
      {
        name: 'Sundaes & Faloodas',
        slug: 'sundaes-falooda',
        iconName: 'Award',
        description: 'Loaded ice cream desserts',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Royal Kesar Pista Falooda', sku: 'ICE-001', description: 'Rose syrup, basil seeds, falooda sev, chilled condensed milk topped with saffron ice cream and nuts', suggestedPrice: 160, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 4, isPopular: true, kitchenStation: 'Dessert Counter', tags: ['BESTSELLER'], imageUrl: '/assets/menu/desserts/falooda.jpg' },
          { name: 'Sizzling Chocolate Brownie Sundae', sku: 'ICE-002', description: 'Warm dark chocolate brownie on a sizzling plate with vanilla scoop and hot fudge sauce', suggestedPrice: 190, dietaryType: 'VEG', spiceLevel: 'NONE', prepTimeMinutes: 5, isPopular: true, kitchenStation: 'Dessert Counter', tags: ['BESTSELLER'], imageUrl: '/assets/menu/desserts/sizzler-brownie.jpg' }
        ]
      }
    ]
  },

  // 28. South Indian + North Indian
  {
    id: 'tpl-south-north-combo',
    name: 'South & North Indian Fusion Diner',
    cuisine: 'Dual Heritage Indian',
    categoryTypeGroup: 'INDIAN',
    priceRange: '₹50 - ₹340',
    categoryCount: 6,
    approxItemCount: 26,
    description: 'Perfect harmony of North Indian curries and South Indian dosas, idlis, naans, biryanis & filter coffee.',
    icon: '🍛',
    badge: 'Popular Fusion',
    version: '1.0',
    categories: [
      {
        name: 'South Indian Breakfast & Dosas',
        slug: 'sn-south',
        iconName: 'Flame',
        description: 'Crisp dosas, idlis and filter coffee',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Butter Masala Dosa Classic', sku: 'SN-001', description: 'Crisp crepe with spiced potato filling, coconut chutney and drumstick sambar', suggestedPrice: 150, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 8, isPopular: true, kitchenStation: 'South Indian Station', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' }
        ]
      },
      {
        name: 'North Indian Curries & Naans',
        slug: 'sn-north',
        iconName: 'Utensils',
        description: 'Paneer butter masala, dal makhani and tandoori naans',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Paneer Butter Masala', sku: 'SN-002', description: 'Paneer cubes in creamy buttery tomato gravy', suggestedPrice: 290, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 12, isPopular: true, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' }
        ]
      }
    ]
  },

  // 29. Premium Fine Dining Indian
  {
    id: 'tpl-fine-dining',
    name: 'Fine Dining Gourmet Indian',
    cuisine: 'Gourmet Modern Indian',
    categoryTypeGroup: 'INDIAN',
    priceRange: '₹120 - ₹650',
    categoryCount: 6,
    approxItemCount: 24,
    description: 'Modern Indian culinary art: truffle naans, smoked paneer tikka carpaccio, slow-simmered dal heritage & artisanal desserts.',
    icon: '✨',
    badge: 'Fine Dining',
    version: '1.0',
    categories: [
      {
        name: 'Gourmet Indian Appetizers',
        slug: 'fine-starters',
        iconName: 'Award',
        description: 'Artfully plated progressive Indian starters',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Smoked Truffle Paneer Tikka', sku: 'FD-001', description: 'Artisanal cottage cheese infused with black truffle oil and charcoal smoke, served with edamame dip', suggestedPrice: 380, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 16, isPopular: true, kitchenStation: 'Tandoor', tags: ['GOURMET', 'CHEF_SPECIAL'], imageUrl: '/assets/menu/north-indian/paneer-tikka.jpg' }
        ]
      }
    ]
  },

  // 30. Cloud Kitchen / Multi-Cuisine
  {
    id: 'tpl-cloud-kitchen',
    name: 'Cloud Kitchen Multi-Brand Menu',
    cuisine: 'Delivery-Optimized Multi-Brand',
    categoryTypeGroup: 'MULTI_CUISINE',
    priceRange: '₹80 - ₹340',
    categoryCount: 7,
    approxItemCount: 28,
    description: 'High-speed delivery menu: Biryani bowls, combo meals, paneer rice bowls, noodles, burgers & quick beverages.',
    icon: '📦',
    badge: 'Delivery Fast',
    version: '1.0',
    categories: [
      {
        name: 'Delivery Meal Bowls',
        slug: 'meal-bowls',
        iconName: 'Flame',
        description: 'All-in-one convenient packaging meal bowls',
        imageUrl: '/assets/menu/common/fallback-dish.svg',
        items: [
          { name: 'Paneer Makhani Rice Bowl', sku: 'CK-001', description: 'Portion of rich paneer butter masala served over steamed jeera basmati rice in single packaging', suggestedPrice: 220, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 7, isPopular: true, kitchenStation: 'Main Kitchen', tags: ['DELIVERY_HERO'], imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg' },
          { name: 'Dal Makhani with 2 Paratha Combo', sku: 'CK-002', description: 'Creamy slow-cooked dal makhani with 2 warm parathas and pickled onion salad', suggestedPrice: 190, dietaryType: 'VEG', spiceLevel: 'MILD', prepTimeMinutes: 7, isPopular: true, kitchenStation: 'Curry Station', imageUrl: '/assets/menu/north-indian/dal-makhani.jpg' }
        ]
      }
    ]
  }
];
