import {
  Category,
  Coupon,
  DiningTable,
  MenuItem,
  ModifierGroup,
  Offer,
  Outlet,
  QrOrderingSettings,
  Restaurant,
  Role,
  TaxGroup,
  User
} from '@jamanvaar/types';

export const DEFAULT_QR_SETTINGS: QrOrderingSettings = {
  isQrOrderingActive: true,
  allowCustomerOrdering: true,
  allowCustomerModifications: true,
  allowSpecialInstructions: true,
  allowRepeatOrdering: true,
  requireWaiterApproval: false,
  autoSendToKitchen: true,
  showOrderStatusTimeline: true,
  allowCustomerCancellation: false,
  minOrderValue: 0,
  maxOrderValue: 10000,
  tableQrTemplate: 'SIGNATURE',
  enableNotificationSound: true,
  welcomeMessage: 'Welcome to JAMANVAAR! Scan to order fresh authentic delicacies directly to your table.'
};

export const SEED_RESTAURANT: Restaurant = {
  id: 'rest-jamanvaar-main',
  name: 'JAMANVAAR RESTAURANT',
  legalName: 'JAMANVAAR FOODS & HOSPITALITY PRIVATE LIMITED',
  tagline: 'Authentic Indian Cuisine & Seamless Dining by KELVIONTECH',
  logoUrl: '/assets/branding/jamanvaar-logo.png',
  currency: 'INR',
  phone: '+91 79 4890 1234',
  email: 'hello@jamanvaar.com',
  address: 'Sindhu Bhavan Road, Bodakdev',
  city: 'Ahmedabad',
  state: 'Gujarat',
  pincode: '380054',
  gstin: '24ABCDE1234F1Z5',
  fssaiNumber: '10722001000452',
  msmeNumber: 'UDYAM-GJ-01-0012345',
  website: 'https://jamanvaar.com',
  footerText: 'Official Daily Closing Statement • Powered by JAMANVAAR by KELVIONTECH',
  primaryColor: '#0B253A',
  secondaryColor: '#E66817',
  ownerName: 'Ramesh Patel',
  managerName: 'Pooja Shah',
  instantBillConfig: {
    enabled: true,
    paymentMethod: 'CASH',
    autoPrint: true,
    askConfirmation: false,
    defaultOrderType: 'TAKEAWAY',
    sendKotBeforeBill: false,
    allowedRoles: ['role-super-admin', 'role-manager', 'role-cashier']
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

export const SEED_OUTLET: Outlet = {
  id: 'out-ahmedabad-central',
  restaurantId: 'rest-jamanvaar-main',
  name: 'Ahmedabad Flagship Store',
  code: 'AHM-01',
  address: 'Sindhu Bhavan Road, Bodakdev',
  city: 'Ahmedabad',
  state: 'Gujarat',
  phone: '+91 98765 43210',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

export const SEED_TAX_GROUPS: TaxGroup[] = [
  {
    id: 'tax-gst-5',
    name: 'Restaurant Standard GST (5%)',
    cgstPercent: 2.5,
    sgstPercent: 2.5,
    igstPercent: 5.0,
    isInclusive: true,
    isActive: true
  }
];

export const SEED_CATEGORIES: Category[] = [
  {
    id: 'cat-starters',
    name: 'Starters & Quick Bites',
    slug: 'starters-quick-bites',
    description: 'Crispy appetizers, kebabs, and quick delicacies',
    iconName: 'Sparkles',
    sortOrder: 1,
    isActive: true,
    translations: {
      hi: { name: 'स्टार्टर्स और स्नैक्स' },
      gu: { name: 'સ્ટાર્ટર્સ અને સ્નેક્સ' }
    }
  },
  {
    id: 'cat-tandoor',
    name: 'Tandoor & Kebabs',
    slug: 'tandoor-kebabs',
    description: 'Clay-oven grilled tikkas, seekh kebabs, and platters',
    iconName: 'Flame',
    sortOrder: 2,
    isActive: true,
    translations: {
      hi: { name: 'तंदूर और कबाब' },
      gu: { name: 'તંદૂર અને કબાબ' }
    }
  },
  {
    id: 'cat-main-course',
    name: 'Main Course (Curries)',
    slug: 'main-course-curries',
    description: 'Rich gravies, paneer specialties, and chicken delicacies',
    iconName: 'UtensilsCrossed',
    sortOrder: 3,
    isActive: true,
    translations: {
      hi: { name: 'मुख्य भोजन (करी)' },
      gu: { name: 'મુખ્ય ભોજન (શાક/ગ્રેવી)' }
    }
  },
  {
    id: 'cat-breads',
    name: 'Naan, Roti & Breads',
    slug: 'naan-roti-breads',
    description: 'Fresh tandoori breads, butter naans, and kulchas',
    iconName: 'Wheat',
    sortOrder: 4,
    isActive: true,
    translations: {
      hi: { name: 'नान, रोटी और ब्रेड' },
      gu: { name: 'નાન, રોટી અને પરોઠા' }
    }
  },
  {
    id: 'cat-biryani',
    name: 'Biryani & Rice Bowls',
    slug: 'biryani-rice-bowls',
    description: 'Dum cooked fragrant basmati biryanis with raita',
    iconName: 'Soup',
    sortOrder: 5,
    isActive: true,
    translations: {
      hi: { name: 'बिरयानी और राइस' },
      gu: { name: 'બિરયાની અને પુલાવ' }
    }
  },
  {
    id: 'cat-beverages',
    name: 'Beverages & Desserts',
    slug: 'beverages-desserts',
    description: 'Refreshing shakes, cold coffee, mocktails, and sweet treats',
    iconName: 'CupSoda',
    sortOrder: 6,
    isActive: true,
    translations: {
      hi: { name: 'पेय और मिठाइयाँ' },
      gu: { name: 'પીણાં અને મીઠાઈ' }
    }
  }
];

export const SEED_MODIFIER_GROUPS: ModifierGroup[] = [
  {
    id: 'mod-spice-level',
    name: 'Spice Level',
    description: 'Choose your desired heat level',
    minSelections: 1,
    maxSelections: 1,
    isRequired: true,
    sortOrder: 1,
    options: [
      { id: 'opt-mild', groupId: 'mod-spice-level', name: 'Mild', priceDelta: 0, isDefault: true, isAvailable: true, sortOrder: 1 },
      { id: 'opt-med', groupId: 'mod-spice-level', name: 'Medium (Standard)', priceDelta: 0, isAvailable: true, sortOrder: 2 },
      { id: 'opt-spicy', groupId: 'mod-spice-level', name: 'Extra Spicy 🔥', priceDelta: 0, isAvailable: true, sortOrder: 3 }
    ]
  },
  {
    id: 'mod-portion-size',
    name: 'Portion Size',
    description: 'Choose portion quantity',
    minSelections: 1,
    maxSelections: 1,
    isRequired: true,
    sortOrder: 2,
    options: [
      { id: 'opt-regular', groupId: 'mod-portion-size', name: 'Regular Portion', priceDelta: 0, isDefault: true, isAvailable: true, sortOrder: 1 },
      { id: 'opt-large', groupId: 'mod-portion-size', name: 'Large Portion (Feeds 2-3)', priceDelta: 80, isAvailable: true, sortOrder: 2 }
    ]
  },
  {
    id: 'mod-addons',
    name: 'Add-Ons & Sides',
    description: 'Enhance your feast with delicious extras',
    minSelections: 0,
    maxSelections: 4,
    isRequired: false,
    sortOrder: 3,
    options: [
      { id: 'opt-cheese', groupId: 'mod-addons', name: 'Extra Amul Cheese', priceDelta: 35, isAvailable: true, sortOrder: 1 },
      { id: 'opt-gravy', groupId: 'mod-addons', name: 'Extra Rich Gravy Bowl', priceDelta: 45, isAvailable: true, sortOrder: 2 },
      { id: 'opt-raita', groupId: 'mod-addons', name: 'Boondi Raita Bowl', priceDelta: 30, isAvailable: true, sortOrder: 3 },
      { id: 'opt-chutney', groupId: 'mod-addons', name: 'Special Mint & Garlic Dip', priceDelta: 20, isAvailable: true, sortOrder: 4 }
    ]
  }
];

export const SEED_MENU_ITEMS: MenuItem[] = [
  {
    id: 'item-hbk',
    categoryId: 'cat-starters',
    sku: 'HBK-01',
    name: 'Hara Bhara Kebab (6 Pcs)',
    description: 'Crispy spinach, green pea and paneer patties served with fresh mint chutney.',
    price: 220,
    imageUrl: '/assets/menu/north-indian/hara-bhara-kebab.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'MILD',
    isPopular: true,
    isNew: false,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 12,
    allergens: ['Dairy'],
    modifierGroupIds: ['mod-spice-level', 'mod-addons'],
    taxGroupId: 'tax-gst-5',
    sortOrder: 1,
    kitchenStation: 'Kitchen',
    imagePrompt: 'Professional Indian restaurant food photography of six Hara Bhara Kebabs made from spinach, green peas and paneer, round green vegetable kebabs, lightly crisp exterior, served with fresh mint chutney, appetizing warm presentation on a premium ceramic plate',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/hara-bhara-kebab',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable',
    imageApproved: true
  },
  {
    id: 'item-cc',
    categoryId: 'cat-starters',
    sku: 'CC-02',
    name: 'Crispy Corn Salt & Pepper',
    description: 'Golden fried sweet corn tossed with bell peppers, green chillies & aromatic herbs.',
    price: 240,
    imageUrl: '/assets/menu/starters/crispy-corn.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'MEDIUM',
    isPopular: true,
    isNew: false,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 10,
    allergens: [],
    modifierGroupIds: ['mod-spice-level'],
    taxGroupId: 'tax-gst-5',
    sortOrder: 2,
    kitchenStation: 'Kitchen',
    imagePrompt: 'Crispy golden fried sweet corn kernels tossed with finely diced green bell peppers, spring onions, cracked black pepper and salt, served hot in a black restaurant bowl, garnished with fresh cilantro, appetizing closeup food photo',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/crispy-corn',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable',
    imageApproved: true
  },
  {
    id: 'item-crolls',
    categoryId: 'cat-starters',
    sku: 'CCR-03',
    name: 'Cheese Corn Cigar Rolls (5 Pcs)',
    description: 'Golden crispy rolls filled with melted mozzarella, sweet corn and herbs served with sweet chilli dip.',
    price: 210,
    imageUrl: '/assets/menu/starters/cheese-corn-cigar-rolls.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'MILD',
    isPopular: true,
    isNew: true,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 12,
    allergens: ['Dairy', 'Gluten'],
    modifierGroupIds: ['mod-spice-level', 'mod-addons'],
    taxGroupId: 'tax-gst-5',
    sortOrder: 3,
    kitchenStation: 'Kitchen',
    imagePrompt: 'Five golden-brown cylindrical crispy cheese corn cigar rolls, crunchy thin crust with visible melted cheese and sweet corn filling, placed diagonally on a slate plate with sweet chilli sauce and mint dip, authentic cooked food photo',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/cigar-rolls',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable',
    imageApproved: true
  },
  {
    id: 'item-pt',
    categoryId: 'cat-tandoor',
    sku: 'PT-04',
    name: 'Paneer Tikka (Tandoori Angaar)',
    description: 'Fresh malai cottage cheese cubes marinated in spiced curd and grilled over charcoal embers.',
    price: 260,
    imageUrl: '/assets/menu/north-indian/paneer-tikka.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'MEDIUM',
    isPopular: true,
    isNew: false,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 15,
    allergens: ['Dairy'],
    modifierGroupIds: ['mod-spice-level', 'mod-addons'],
    taxGroupId: 'tax-gst-5',
    sortOrder: 4,
    kitchenStation: 'Tandoor',
    imagePrompt: 'Char-grilled Indian paneer tikka cubes with smoky orange-red tandoori marinade, visible char marks, skewered with roasted bell peppers and onions, served on a sizzling tandoori platter with lemon wedges and mint dip',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/paneer-tikka',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable',
    imageApproved: true
  },
  {
    id: 'item-dm',
    categoryId: 'cat-main-course',
    sku: 'DM-05',
    name: 'Dal Makhani (Slow Cooked)',
    description: 'Slow-cooked black urad lentils simmered overnight with butter, tomatoes and fresh cream.',
    price: 195,
    imageUrl: '/assets/menu/north-indian/dal-makhani.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'MILD',
    isPopular: true,
    isNew: false,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 10,
    allergens: ['Dairy'],
    modifierGroupIds: ['mod-portion-size', 'mod-spice-level', 'mod-addons'],
    taxGroupId: 'tax-gst-5',
    sortOrder: 5,
    kitchenStation: 'Curry Station',
    imagePrompt: 'Rich slow-cooked black dal makhani in a traditional copper handi bowl, creamy swirl of white butter and fresh dairy cream on top, garnished with fresh coriander leaves, Indian fine-dining presentation',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/dal-makhani',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable',
    imageApproved: true
  },
  {
    id: 'item-pbm',
    categoryId: 'cat-main-course',
    sku: 'PBM-06',
    name: 'Paneer Butter Masala',
    description: 'Soft cottage cheese simmered in a luscious makhani gravy enriched with butter and cream.',
    price: 250,
    imageUrl: '/assets/menu/north-indian/paneer-butter-masala.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'MILD',
    isPopular: true,
    isNew: false,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 14,
    allergens: ['Dairy', 'Nuts'],
    modifierGroupIds: ['mod-portion-size', 'mod-spice-level', 'mod-addons'],
    taxGroupId: 'tax-gst-5',
    sortOrder: 6,
    kitchenStation: 'Curry Station',
    imagePrompt: 'Soft paneer cubes in velvety orange-red tomato butter makhani gravy, topped with a streak of heavy cream and fresh coriander, served in an elegant white restaurant curry bowl',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/paneer-butter-masala',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable',
    imageApproved: true
  },
  {
    id: 'item-bn',
    categoryId: 'cat-breads',
    sku: 'BN-07',
    name: 'Butter Naan (Tandoori)',
    description: 'Traditional clay-tandoor baked leavened bread brushed with melted pure Amul butter.',
    price: 60,
    imageUrl: '/assets/menu/north-indian/butter-naan.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'NONE',
    isPopular: true,
    isNew: false,
    isFeatured: false,
    isAvailable: true,
    prepTimeMinutes: 5,
    allergens: ['Gluten', 'Dairy'],
    modifierGroupIds: [],
    taxGroupId: 'tax-gst-5',
    sortOrder: 7,
    kitchenStation: 'Tandoor',
    imagePrompt: 'Freshly baked tandoori butter naan bread with golden blistered bubbles and char spots, glistening with melted butter, folded in a wicker bread basket, authentic restaurant presentation',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/butter-naan',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable',
    imageApproved: true
  },
  {
    id: 'item-gn',
    categoryId: 'cat-breads',
    sku: 'GN-08',
    name: 'Garlic Butter Naan',
    description: 'Fluffy tandoori bread generously garnished with minced roasted garlic, fresh coriander and butter.',
    price: 75,
    imageUrl: '/assets/menu/north-indian/garlic-naan.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'NONE',
    isPopular: true,
    isNew: false,
    isFeatured: false,
    isAvailable: true,
    prepTimeMinutes: 5,
    allergens: ['Gluten', 'Dairy'],
    modifierGroupIds: [],
    taxGroupId: 'tax-gst-5',
    sortOrder: 8,
    kitchenStation: 'Tandoor',
    imagePrompt: 'Hot tandoori garlic naan bread topped with minced roasted golden garlic, finely chopped fresh coriander leaves, brushed with melted butter, distinct garlic bits visible on golden crust',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/garlic-naan',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable',
    imageApproved: true
  },
  {
    id: 'item-vgb-hnd',
    categoryId: 'cat-biryani',
    sku: 'VGB-09',
    name: 'Royal Veg Handi Dum Biryani',
    description: 'Farm fresh seasonal vegetables and paneer simmered in rich saffron infused basmati rice.',
    price: 240,
    imageUrl: '/assets/menu/north-indian/biryani.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'MEDIUM',
    isPopular: true,
    isNew: false,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 15,
    allergens: ['Dairy'],
    modifierGroupIds: ['mod-portion-size', 'mod-spice-level', 'mod-addons'],
    taxGroupId: 'tax-gst-5',
    sortOrder: 9,
    kitchenStation: 'Biryani Station',
    imagePrompt: 'Royal vegetable dum biryani served in an earthen clay handi, long fragrant basmati rice grains layered with saffron strands, caramelized fried onions, mint leaves and tender vegetables',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/biryani',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable',
    imageApproved: true
  },
  {
    id: 'item-cc-ice',
    categoryId: 'cat-beverages',
    sku: 'CC-10',
    name: 'Cold Coffee with Vanilla Ice Cream',
    description: 'Rich blended espresso with chilled milk and a velvety scoop of vanilla ice cream.',
    price: 120,
    imageUrl: '/assets/menu/cafe/cold-coffee.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'NONE',
    isPopular: true,
    isNew: true,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 5,
    allergens: ['Dairy'],
    modifierGroupIds: [],
    taxGroupId: 'tax-gst-5',
    sortOrder: 10,
    kitchenStation: 'Beverages',
    imagePrompt: 'Tall clear glass of creamy blended iced cold coffee with dark chocolate syrup swirl on the glass walls, crowned with a large scoop of vanilla ice cream and cocoa powder dusting, refreshing summer cafe presentation',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/cold-coffee',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable',
    imageApproved: true
  },
  {
    id: 'item-gj-2',
    categoryId: 'cat-desserts',
    sku: 'GJ-11',
    name: 'Shahi Gulab Jamun (2 Pcs)',
    description: 'Warm, soft khoya dumplings soaked in fragrant green cardamom and saffron syrup.',
    price: 80,
    imageUrl: '/assets/menu/desserts/gulab-jamun.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'NONE',
    isPopular: true,
    isNew: false,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 4,
    allergens: ['Dairy', 'Gluten'],
    modifierGroupIds: [],
    taxGroupId: 'tax-gst-5',
    sortOrder: 11,
    kitchenStation: 'Dessert Station',
    imagePrompt: 'Two warm, dark golden-brown gulab jamuns resting in aromatic saffron-cardamom sugar syrup in a white porcelain dessert bowl, garnished with slivered pistachios and silver vark',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/gulab-jamun',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable',
    imageApproved: true
  },
  {
    id: 'item-thali-guj',
    categoryId: 'cat-main-course',
    sku: 'THL-12',
    name: 'Authentic Gujarati Special Thali',
    description: '2 Veg Sabzi, Gujarati Kadhi, Dal, 4 Phulka Roti, Jeera Rice, Farsan, Sweet, Pickle & Masala Chhas.',
    price: 280,
    imageUrl: '/assets/menu/gujarati/thali.jpg',
    dietaryType: 'VEG',
    spiceLevel: 'MILD',
    isPopular: true,
    isNew: false,
    isFeatured: true,
    isAvailable: true,
    prepTimeMinutes: 10,
    allergens: ['Dairy', 'Gluten'],
    modifierGroupIds: ['mod-spice-level'],
    taxGroupId: 'tax-gst-5',
    sortOrder: 12,
    kitchenStation: 'Curry Station',
    imagePrompt: 'Grand traditional Gujarati thali served on a large polished metal platter with multiple small katori bowls containing Gujarati sweet kadhi, dal, ringna olo, sev tameta, soft puffed phulkas, khaman farsan, shrikhand, and a small brass cup of masala chaas',
    imageSource: 'Unsplash Commercial Food Photography',
    imageSourceUrl: 'https://unsplash.com/photos/gujarati-thali',
    imageLicense: 'Unsplash Commercial Free License / Legally Reusable',
    imageApproved: true
  }
];

export const SEED_TABLES: DiningTable[] = [
  { id: 'tbl-1', outletId: 'out-ahmedabad-central', tableNumber: '1', capacity: 2, zone: 'Main Hall', floor: 1, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-001', qrStatus: 'ACTIVE', totalOrdersToday: 4, totalRevenueToday: 1840, lastOrderTime: '12:45 PM', isActive: true },
  { id: 'tbl-2', outletId: 'out-ahmedabad-central', tableNumber: '2', capacity: 2, zone: 'Main Hall', floor: 1, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-002', qrStatus: 'ACTIVE', totalOrdersToday: 2, totalRevenueToday: 760, lastOrderTime: '01:10 PM', isActive: true },
  { id: 'tbl-3', outletId: 'out-ahmedabad-central', tableNumber: '3', capacity: 4, zone: 'Main Hall', floor: 1, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-003', qrStatus: 'ACTIVE', totalOrdersToday: 3, totalRevenueToday: 1280, lastOrderTime: '01:30 PM', isActive: true },
  { id: 'tbl-4', outletId: 'out-ahmedabad-central', tableNumber: '4', capacity: 4, zone: 'Main Hall', floor: 1, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-004', qrStatus: 'ACTIVE', totalOrdersToday: 2, totalRevenueToday: 940, lastOrderTime: '12:15 PM', isActive: true },
  { id: 'tbl-5', outletId: 'out-ahmedabad-central', tableNumber: '5', capacity: 4, zone: 'Main Hall', floor: 1, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-005', qrStatus: 'ACTIVE', totalOrdersToday: 5, totalRevenueToday: 2450, lastOrderTime: '02:05 PM', isActive: true },
  { id: 'tbl-6', outletId: 'out-ahmedabad-central', tableNumber: '6', capacity: 6, zone: 'Family Section', floor: 1, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-006', qrStatus: 'ACTIVE', totalOrdersToday: 3, totalRevenueToday: 1680, lastOrderTime: '01:50 PM', isActive: true },
  { id: 'tbl-7', outletId: 'out-ahmedabad-central', tableNumber: '7', capacity: 6, zone: 'Family Section', floor: 1, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-007', qrStatus: 'ACTIVE', totalOrdersToday: 2, totalRevenueToday: 1120, lastOrderTime: '12:55 PM', isActive: true },
  { id: 'tbl-8', outletId: 'out-ahmedabad-central', tableNumber: '8', capacity: 8, zone: 'Family Section', floor: 1, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-008', qrStatus: 'ACTIVE', totalOrdersToday: 4, totalRevenueToday: 2980, lastOrderTime: '02:15 PM', isActive: true },
  { id: 'tbl-9', outletId: 'out-ahmedabad-central', tableNumber: '9', capacity: 4, zone: 'AC Balcony', floor: 2, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-009', qrStatus: 'ACTIVE', totalOrdersToday: 3, totalRevenueToday: 1450, lastOrderTime: '01:20 PM', isActive: true },
  { id: 'tbl-10', outletId: 'out-ahmedabad-central', tableNumber: '10', capacity: 4, zone: 'AC Balcony', floor: 2, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-010', qrStatus: 'ACTIVE', totalOrdersToday: 3, totalRevenueToday: 1560, lastOrderTime: '01:40 PM', isActive: true },
  { id: 'tbl-11', outletId: 'out-ahmedabad-central', tableNumber: '11', capacity: 4, zone: 'AC Balcony', floor: 2, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-011', qrStatus: 'ACTIVE', totalOrdersToday: 2, totalRevenueToday: 920, lastOrderTime: '12:35 PM', isActive: true },
  { id: 'tbl-12', outletId: 'out-ahmedabad-central', tableNumber: '12', capacity: 4, zone: 'AC Balcony', floor: 2, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-012', qrStatus: 'ACTIVE', totalOrdersToday: 6, totalRevenueToday: 3840, lastOrderTime: '02:25 PM', isActive: true }
];

export const SEED_COUPONS: Coupon[] = [
  {
    id: 'cpn-welcome50',
    code: 'WELCOME50',
    description: 'Get ₹50 OFF on your first kiosk feast',
    discountType: 'FLAT',
    discountValue: 50,
    minOrderValue: 200,
    validFrom: '2026-01-01T00:00:00Z',
    validUntil: '2027-12-31T23:59:59Z',
    usageLimit: 10000,
    usageCount: 42,
    isActive: true
  },
  {
    id: 'cpn-feast20',
    code: 'FEAST20',
    description: '20% OFF on grand orders above ₹500',
    discountType: 'PERCENTAGE',
    discountValue: 20,
    minOrderValue: 500,
    maxDiscountAmount: 150,
    validFrom: '2026-01-01T00:00:00Z',
    validUntil: '2027-12-31T23:59:59Z',
    usageLimit: 5000,
    usageCount: 18,
    isActive: true
  },
  {
    id: 'cpn-flat100',
    code: 'FLAT100',
    description: 'Flat ₹100 Discount on family meals above ₹800',
    discountType: 'FLAT',
    discountValue: 100,
    minOrderValue: 800,
    validFrom: '2026-01-01T00:00:00Z',
    validUntil: '2027-12-31T23:59:59Z',
    usageLimit: 5000,
    usageCount: 9,
    isActive: true
  }
];

export const SEED_OFFERS: Offer[] = [
  {
    id: 'ofr-biryani-fest',
    title: 'Royal Biryani Feast',
    description: 'Complimentary Gulab Jamun (2 Pcs) with any Dum Biryani Combo',
    discountType: 'FLAT',
    discountValue: 80,
    minOrderValue: 300,
    bannerImageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=1200&q=80',
    isActive: true,
    channel: 'ALL'
  },
  {
    id: 'ofr-happy-hours',
    title: 'Happy Hours Starter Treat',
    description: 'Order any 2 Starters and get Cold Coffee at 50% OFF',
    discountType: 'PERCENTAGE',
    discountValue: 15,
    minOrderValue: 400,
    bannerImageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=80',
    isActive: true,
    channel: 'KIOSK_ONLY'
  }
];

export const SEED_ROLES: Role[] = [
  {
    id: 'role-super-admin',
    name: 'Super Admin / Owner',
    description: 'Unrestricted control across all restaurant outlets, POS terminals and kiosk terminals',
    permissions: [
      'kiosk.view', 'kiosk.create', 'kiosk.edit', 'kiosk.lock', 'kiosk.restart',
      'pos.view', 'pos.order', 'pos.discount', 'pos.high_discount', 'pos.void', 'pos.refund', 'pos.shift', 'pos.settings', 'pos.reports',
      'menu.view', 'menu.create', 'menu.edit', 'menu.delete',
      'pricing.view', 'pricing.edit',
      'coupon.view', 'coupon.create', 'coupon.edit',
      'order.view', 'order.cancel', 'order.refund',
      'payment.view', 'payment.configure',
      'staff.view', 'staff.manage',
      'reports.view', 'audit.view', 'settings.edit'
    ],
    isSystemRole: true
  },
  {
    id: 'role-manager',
    name: 'Restaurant Manager',
    description: 'Store and POS manager responsible for overrides, refunds, voids, menu availability and shifts',
    permissions: [
      'pos.view', 'pos.order', 'pos.discount', 'pos.high_discount', 'pos.void', 'pos.refund', 'pos.shift', 'pos.reports',
      'kiosk.view', 'kiosk.edit', 'kiosk.lock',
      'menu.view', 'menu.edit',
      'pricing.view',
      'coupon.view',
      'order.view', 'order.cancel', 'order.refund',
      'reports.view'
    ]
  },
  {
    id: 'role-cashier',
    name: 'Cashier / Billing Staff',
    description: 'Front desk and counter operator handling billing, KOTs, payments, shifts and basic discounts',
    permissions: ['pos.view', 'pos.order', 'pos.discount', 'pos.shift', 'order.view', 'kiosk.view']
  }
];

export const SEED_USERS: (User & { pinCode?: string })[] = [
  {
    id: 'usr-admin-1',
    restaurantId: 'rest-jamanvaar-main',
    username: 'admin',
    fullName: 'Ramesh Patel (Owner)',
    email: 'admin@jamanvaar.com',
    phone: '+91 98765 00001',
    roleId: 'role-super-admin',
    pinCode: '9999',
    isActive: true,
    lastLoginAt: '2026-08-25T08:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-08-25T08:00:00.000Z'
  },
  {
    id: 'usr-mgr-1',
    restaurantId: 'rest-jamanvaar-main',
    username: 'manager',
    fullName: 'Pooja Shah (Floor Manager)',
    email: 'manager@jamanvaar.com',
    phone: '+91 98765 00003',
    roleId: 'role-manager',
    pinCode: '5678',
    isActive: true,
    lastLoginAt: '2026-08-25T08:30:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-08-25T08:30:00.000Z'
  },
  {
    id: 'usr-cashier-1',
    restaurantId: 'rest-jamanvaar-main',
    username: 'cashier',
    fullName: 'Amit Dave (Lead Cashier)',
    email: 'cashier1@jamanvaar.com',
    phone: '+91 98765 00002',
    roleId: 'role-cashier',
    pinCode: '1234',
    isActive: true,
    lastLoginAt: '2026-08-25T09:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-08-25T09:00:00.000Z'
  }
];

export function generateSeedOrders(): import('@jamanvaar/types').Order[] {
  const dishes = [
    { id: 'item-pt', name: 'Paneer Tikka (Tandoori)', sku: 'PT', price: 240, station: 'Tandoor Station' },
    { id: 'item-bn', name: 'Butter Naan', sku: 'BN', price: 60, station: 'Tandoor Station' },
    { id: 'item-dm', name: 'Dal Makhani', sku: 'DM', price: 180, station: 'Main Kitchen' },
    { id: 'item-vbir', name: 'Royal Veg Dum Biryani', sku: 'VBIR', price: 280, station: 'Main Kitchen' },
    { id: 'item-guj-thali', name: 'Gujarati Heritage Thali', sku: 'GUJ-TH', price: 280, station: 'Main Kitchen' },
    { id: 'item-cc-ice', name: 'Cold Coffee with Ice Cream', sku: 'CC-ICE', price: 120, station: 'Beverage Counter' },
    { id: 'item-gj', name: 'Shahi Gulab Jamun (2 pcs)', sku: 'GJ', price: 90, station: 'Dessert Station' },
    { id: 'item-corn', name: 'Crispy Corn Salt & Pepper', sku: 'CORN', price: 160, station: 'Starters Station' }
  ];

  const customers = [
    { name: 'Ramesh Patel', phone: '9876543210' },
    { name: 'Dr. Neha Shah', phone: '9822334455' },
    { name: 'Amit Verma', phone: '9899001122' },
    { name: 'Priya Joshi', phone: '9811223344' },
    { name: 'Sanjay Mehta', phone: '9833445566' },
    { name: 'Walk-in Guest', phone: '' }
  ];

  const cashiers = ['Amit Dave', 'Ramesh Shah', 'Priya Patel'];
  const captains = ['Rahul Sharma', 'Vikram Mehta', 'Suresh Kumar'];
  const paymentModes: Array<import('@jamanvaar/types').PaymentMethod> = ['UPI_QR', 'CASH', 'CARD_TERMINAL', 'SPLIT'];
  const orderTypes: Array<import('@jamanvaar/types').OrderType> = ['DINE_IN', 'DINE_IN', 'TAKEAWAY', 'DELIVERY', 'TOKEN'];

  const orders: import('@jamanvaar/types').Order[] = [];
  const now = new Date();
  let orderSeq = 9900;
  let tokenSeq = 100;

  // Generate orders for Day 0 (Today), Day 1 (Yesterday), Day 2 (28 Aug), Day 3 (27 Aug), Day 4 (26 Aug), Day 5 (25 Aug)
  const dayConfigs = [
    { daysAgo: 0, count: 14 },
    { daysAgo: 1, count: 18 },
    { daysAgo: 2, count: 15 },
    { daysAgo: 3, count: 12 },
    { daysAgo: 4, count: 10 },
    { daysAgo: 5, count: 8 }
  ];

  dayConfigs.forEach(({ daysAgo, count }) => {
    const baseDate = new Date(now);
    baseDate.setDate(baseDate.getDate() - daysAgo);

    for (let i = 0; i < count; i++) {
      orderSeq++;
      tokenSeq = (tokenSeq % 900) + 1;

      // Realistic hours between 12 PM (lunch) and 10 PM (dinner)
      const hour = 12 + Math.floor((i / count) * 10);
      const minute = (i * 7) % 60;
      const orderDate = new Date(baseDate);
      orderDate.setHours(hour, minute, 0, 0);

      const cust = customers[i % customers.length];
      const cashier = cashiers[i % cashiers.length];
      const captain = captains[i % captains.length];
      const oType = orderTypes[i % orderTypes.length];
      const pMethod = paymentModes[i % paymentModes.length];
      const tableNumber = oType === 'DINE_IN' ? String((i % 12) + 1) : undefined;

      // Pick 2 to 4 random dishes
      const item1 = dishes[i % dishes.length];
      const item2 = dishes[(i + 2) % dishes.length];
      const item3 = dishes[(i + 4) % dishes.length];

      const orderItems = [
        {
          id: `oi-${orderSeq}-1`,
          orderId: `ord-${orderSeq}`,
          menuItemId: item1.id,
          name: item1.name,
          sku: item1.sku,
          quantity: (i % 2) + 1,
          unitPrice: item1.price,
          modifiers: [],
          specialInstructions: i % 3 === 0 ? 'Less spicy' : undefined,
          totalPrice: item1.price * ((i % 2) + 1),
          kitchenStatus: 'SERVED' as const
        },
        {
          id: `oi-${orderSeq}-2`,
          orderId: `ord-${orderSeq}`,
          menuItemId: item2.id,
          name: item2.name,
          sku: item2.sku,
          quantity: 2,
          unitPrice: item2.price,
          modifiers: [],
          totalPrice: item2.price * 2,
          kitchenStatus: 'SERVED' as const
        }
      ];

      if (i % 2 === 0) {
        orderItems.push({
          id: `oi-${orderSeq}-3`,
          orderId: `ord-${orderSeq}`,
          menuItemId: item3.id,
          name: item3.name,
          sku: item3.sku,
          quantity: 1,
          unitPrice: item3.price,
          modifiers: [],
          totalPrice: item3.price,
          kitchenStatus: 'SERVED' as const
        });
      }

      const subtotal = orderItems.reduce((s, it) => s + it.totalPrice, 0);
      const discountAmount = i % 4 === 0 ? 50 : 0;
      const taxable = Math.max(0, subtotal - discountAmount);
      const cgstAmount = Math.round(taxable * 0.025 * 100) / 100;
      const sgstAmount = Math.round(taxable * 0.025 * 100) / 100;
      const taxAmount = cgstAmount + sgstAmount;
      const totalAmount = Math.round(taxable + taxAmount);

      const isCancelled = daysAgo > 0 && i === count - 1;
      const isRefunded = daysAgo > 0 && i === count - 2;

      let orderStatus: import('@jamanvaar/types').OrderStatus = 'COMPLETED';
      let paymentStatus: import('@jamanvaar/types').PaymentStatus = 'SUCCESS';

      if (isCancelled) {
        orderStatus = 'CANCELLED';
        paymentStatus = 'CANCELLED';
      } else if (isRefunded) {
        orderStatus = 'REFUNDED';
        paymentStatus = 'REFUNDED';
      }

      const yyyy = orderDate.getFullYear();
      const mm = String(orderDate.getMonth() + 1).padStart(2, '0');
      const dd = String(orderDate.getDate()).padStart(2, '0');
      const dayId = `BD-${yyyy}${mm}${dd}`;

      const shiftId = daysAgo === 0 ? 'shift-today-01' : daysAgo === 1 ? 'shift-yesterday-01' : undefined;

      orders.push({
        id: `ord-${orderSeq}`,
        orderNumber: `ORD-${orderSeq}`,
        tokenNumber: String(tokenSeq),
        businessDayId: dayId,
        shiftId,
        restaurantId: 'rest-jamanvaar-main',
        outletId: 'out-ahmedabad-central',
        kioskId: 'POS-01',
        sessionId: `sess-${orderSeq}`,
        idempotencyKey: `idemp_${orderSeq}`,
        orderType: oType,
        tableId: tableNumber ? `tbl-${tableNumber}` : undefined,
        tableNumber,
        guestCount: tableNumber ? 4 : undefined,
        customerName: cust.name,
        customerPhone: cust.phone,
        cashierName: cashier,
        captainName: captain,
        items: orderItems,
        subtotal,
        discountAmount,
        cgstAmount,
        sgstAmount,
        taxAmount,
        serviceChargeAmount: 0,
        tipAmount: 0,
        roundOffAmount: 0,
        totalAmount,
        paymentMethod: pMethod,
        paymentStatus,
        orderStatus,
        estimatedWaitMinutes: 15,
        createdAt: orderDate.toISOString(),
        updatedAt: orderDate.toISOString(),
        isSynced: true
      });
    }
  });

  // Dedicated Real-time Seed QR Table Orders
  const todayDayId = `BD-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const qrSeedConfigs = [
    {
      orderNumber: 'QR-1042',
      tokenNumber: '1042',
      tableNumber: '12',
      zone: 'AC Balcony',
      customerName: 'Guest (Table 12)',
      customerNotes: 'Please serve extra green chutney and ensure tikkas are well-roasted',
      orderStatus: 'PREPARING' as const,
      paymentMethod: 'UPI' as const,
      paymentStatus: 'SUCCESS' as const,
      minutesAgo: 15,
      items: [
        {
          id: 'oi-qr-1042-1',
          orderId: 'ord-qr-1042',
          menuItemId: 'item-pt-malai',
          name: 'Paneer Tikka (Tandoori)',
          sku: 'PT-01',
          quantity: 2,
          unitPrice: 260,
          modifiers: [{ groupId: 'mod-addons', groupName: 'Add-ons', optionId: 'opt-chutney', optionName: 'Extra Chutney', priceDelta: 0 }],
          specialInstructions: 'Extra spicy, well roasted',
          totalPrice: 520,
          kitchenStatus: 'PREPARING' as const
        },
        {
          id: 'oi-qr-1042-2',
          orderId: 'ord-qr-1042',
          menuItemId: 'item-bn-amul',
          name: 'Butter Naan',
          sku: 'BN-07',
          quantity: 2,
          unitPrice: 60,
          modifiers: [],
          totalPrice: 120,
          kitchenStatus: 'PREPARING' as const
        },
        {
          id: 'oi-qr-1042-3',
          orderId: 'ord-qr-1042',
          menuItemId: 'item-vgb-hnd',
          name: 'Royal Veg Handi Dum Biryani',
          sku: 'VGB-09',
          quantity: 1,
          unitPrice: 240,
          modifiers: [{ groupId: 'mod-spice-level', groupName: 'Spice Level', optionId: 'opt-med', optionName: 'Medium', priceDelta: 0 }],
          totalPrice: 240,
          kitchenStatus: 'PREPARING' as const
        }
      ]
    },
    {
      orderNumber: 'QR-1041',
      tokenNumber: '1041',
      tableNumber: '5',
      zone: 'Main Hall',
      customerName: 'Guest (Table 5)',
      customerNotes: 'Less spicy gravy for kids',
      orderStatus: 'COMPLETED' as const,
      paymentMethod: 'CASH' as const,
      paymentStatus: 'SUCCESS' as const,
      minutesAgo: 45,
      items: [
        {
          id: 'oi-qr-1041-1',
          orderId: 'ord-qr-1041',
          menuItemId: 'item-dm-shahi',
          name: 'Dal Makhani Shahi',
          sku: 'DM-03',
          quantity: 1,
          unitPrice: 220,
          modifiers: [],
          totalPrice: 220,
          kitchenStatus: 'SERVED' as const
        },
        {
          id: 'oi-qr-1041-2',
          orderId: 'ord-qr-1041',
          menuItemId: 'item-bn-amul',
          name: 'Butter Naan',
          sku: 'BN-07',
          quantity: 3,
          unitPrice: 60,
          modifiers: [],
          totalPrice: 180,
          kitchenStatus: 'SERVED' as const
        },
        {
          id: 'oi-qr-1041-3',
          orderId: 'ord-qr-1041',
          menuItemId: 'item-cc-ice',
          name: 'Cold Coffee with Ice Cream',
          sku: 'CC-10',
          quantity: 1,
          unitPrice: 120,
          modifiers: [],
          totalPrice: 120,
          kitchenStatus: 'SERVED' as const
        }
      ]
    },
    {
      orderNumber: 'QR-1040',
      tokenNumber: '1040',
      tableNumber: '1',
      zone: 'Main Hall',
      customerName: 'Guest (Table 1)',
      customerNotes: 'Served with sliced onions',
      orderStatus: 'READY' as const,
      paymentMethod: 'UPI' as const,
      paymentStatus: 'SUCCESS' as const,
      minutesAgo: 22,
      items: [
        {
          id: 'oi-qr-1040-1',
          orderId: 'ord-qr-1040',
          menuItemId: 'item-pt-malai',
          name: 'Paneer Tikka (Tandoori)',
          sku: 'PT-01',
          quantity: 2,
          unitPrice: 260,
          modifiers: [{ groupId: 'mod-addons', groupName: 'Add-ons', optionId: 'opt-cheese', optionName: 'Extra Cheese', priceDelta: 40 }],
          totalPrice: 600,
          kitchenStatus: 'READY' as const
        },
        {
          id: 'oi-qr-1040-2',
          orderId: 'ord-qr-1040',
          menuItemId: 'item-gj-2',
          name: 'Shahi Gulab Jamun (2 Pcs)',
          sku: 'GJ-11',
          quantity: 1,
          unitPrice: 80,
          modifiers: [],
          totalPrice: 80,
          kitchenStatus: 'READY' as const
        }
      ]
    },
    {
      orderNumber: 'QR-1039',
      tokenNumber: '1039',
      tableNumber: '12',
      zone: 'AC Balcony',
      customerName: 'Guest (Table 12)',
      customerNotes: 'No onion in starters please',
      orderStatus: 'NEW' as const,
      paymentMethod: 'CASH' as const,
      paymentStatus: 'PENDING' as const,
      minutesAgo: 4,
      items: [
        {
          id: 'oi-qr-1039-1',
          orderId: 'ord-qr-1039',
          menuItemId: 'item-pt-malai',
          name: 'Paneer Tikka (Tandoori)',
          sku: 'PT-01',
          quantity: 2,
          unitPrice: 260,
          modifiers: [{ groupId: 'mod-addons', groupName: 'Add-ons', optionId: 'opt-chutney', optionName: 'Extra Chutney', priceDelta: 0 }],
          specialInstructions: 'No onion',
          totalPrice: 520,
          kitchenStatus: 'PENDING' as const
        },
        {
          id: 'oi-qr-1039-2',
          orderId: 'ord-qr-1039',
          menuItemId: 'item-bn-amul',
          name: 'Butter Naan',
          sku: 'BN-07',
          quantity: 1,
          unitPrice: 60,
          modifiers: [],
          totalPrice: 60,
          kitchenStatus: 'PENDING' as const
        }
      ]
    },
    {
      orderNumber: 'QR-1038',
      tokenNumber: '1038',
      tableNumber: '8',
      zone: 'Family Section',
      customerName: 'Guest (Table 8)',
      customerNotes: 'Family dinner, quick service requested',
      orderStatus: 'SERVED' as const,
      paymentMethod: 'CARD' as const,
      paymentStatus: 'SUCCESS' as const,
      minutesAgo: 50,
      items: [
        {
          id: 'oi-qr-1038-1',
          orderId: 'ord-qr-1038',
          menuItemId: 'item-thali-guj',
          name: 'Authentic Gujarati Special Thali',
          sku: 'THL-12',
          quantity: 3,
          unitPrice: 280,
          modifiers: [],
          totalPrice: 840,
          kitchenStatus: 'SERVED' as const
        },
        {
          id: 'oi-qr-1038-2',
          orderId: 'ord-qr-1038',
          menuItemId: 'item-vgb-hnd',
          name: 'Royal Veg Handi Dum Biryani',
          sku: 'VGB-09',
          quantity: 1,
          unitPrice: 240,
          modifiers: [],
          totalPrice: 240,
          kitchenStatus: 'SERVED' as const
        },
        {
          id: 'oi-qr-1038-3',
          orderId: 'ord-qr-1038',
          menuItemId: 'item-gj-2',
          name: 'Shahi Gulab Jamun (2 Pcs)',
          sku: 'GJ-11',
          quantity: 2,
          unitPrice: 80,
          modifiers: [],
          totalPrice: 160,
          kitchenStatus: 'SERVED' as const
        }
      ]
    },
    {
      orderNumber: 'QR-1037',
      tokenNumber: '1037',
      tableNumber: '3',
      zone: 'Main Hall',
      customerName: 'Guest (Table 3)',
      orderStatus: 'ACCEPTED' as const,
      paymentMethod: 'UPI' as const,
      paymentStatus: 'SUCCESS' as const,
      minutesAgo: 8,
      items: [
        {
          id: 'oi-qr-1037-1',
          orderId: 'ord-qr-1037',
          menuItemId: 'item-dm-shahi',
          name: 'Dal Makhani Shahi',
          sku: 'DM-03',
          quantity: 1,
          unitPrice: 220,
          modifiers: [],
          totalPrice: 220,
          kitchenStatus: 'PENDING' as const
        },
        {
          id: 'oi-qr-1037-2',
          orderId: 'ord-qr-1037',
          menuItemId: 'item-gbn-garlic',
          name: 'Garlic Butter Naan',
          sku: 'GBN-08',
          quantity: 2,
          unitPrice: 80,
          modifiers: [],
          totalPrice: 160,
          kitchenStatus: 'PENDING' as const
        }
      ]
    }
  ];

  qrSeedConfigs.forEach((cfg) => {
    const subtotal = cfg.items.reduce((s, it) => s + it.totalPrice, 0);
    const cgstAmount = Math.round(subtotal * 0.025 * 100) / 100;
    const sgstAmount = Math.round(subtotal * 0.025 * 100) / 100;
    const taxAmount = cgstAmount + sgstAmount;
    const totalAmount = Math.round(subtotal + taxAmount);
    const createdAt = new Date(Date.now() - cfg.minutesAgo * 60000).toISOString();

    orders.unshift({
      id: `ord-${cfg.orderNumber.toLowerCase()}`,
      orderNumber: cfg.orderNumber,
      tokenNumber: cfg.tokenNumber,
      businessDayId: todayDayId,
      restaurantId: 'rest-jamanvaar-main',
      outletId: 'out-ahmedabad-central',
      kioskId: `QR-TABLE-${cfg.tableNumber.padStart(3, '0')}`,
      sessionId: `sess-qr-${cfg.orderNumber}`,
      idempotencyKey: `idemp_qr_${cfg.orderNumber}`,
      orderType: 'QR_TABLE',
      source_type: 'QR_TABLE',
      tableId: `tbl-${cfg.tableNumber}`,
      tableNumber: cfg.tableNumber,
      guestCount: 2,
      customerName: cfg.customerName,
      customerNotes: cfg.customerNotes,
      items: cfg.items,
      subtotal,
      discountAmount: 0,
      cgstAmount,
      sgstAmount,
      taxAmount,
      serviceChargeAmount: 0,
      tipAmount: 0,
      roundOffAmount: 0,
      totalAmount,
      paymentMethod: cfg.paymentMethod,
      paymentStatus: cfg.paymentStatus,
      orderStatus: cfg.orderStatus,
      estimatedWaitMinutes: 15,
      createdAt,
      updatedAt: createdAt,
      kitchenRouting: {
        stationBreakdown: {
          Tandoor: cfg.items.filter((i) => i.name.includes('Tikka') || i.name.includes('Naan')).length,
          Curry: cfg.items.filter((i) => i.name.includes('Dal') || i.name.includes('Thali')).length,
          Biryani: cfg.items.filter((i) => i.name.includes('Biryani')).length,
          Beverage: cfg.items.filter((i) => i.name.includes('Coffee') || i.name.includes('Gulab')).length
        },
        summaryText: `${cfg.items.length} items routed across kitchen stations`
      },
      timeline: [
        { status: 'NEW', title: 'QR Order Placed', timestamp: createdAt, note: `Customer scanned QR at Table ${cfg.tableNumber}` },
        ...(cfg.orderStatus !== 'NEW' ? [{ status: 'ACCEPTED', title: 'Order Accepted by POS', timestamp: new Date(Date.now() - (cfg.minutesAgo - 1) * 60000).toISOString(), actor: 'POS Terminal' }] : []),
        ...(cfg.orderStatus === 'PREPARING' || cfg.orderStatus === 'READY' || cfg.orderStatus === 'SERVED' || cfg.orderStatus === 'COMPLETED' ? [{ status: 'PREPARING', title: 'Sent to Kitchen (KOT)', timestamp: new Date(Date.now() - (cfg.minutesAgo - 3) * 60000).toISOString(), actor: 'Kitchen Router' }] : []),
        ...(cfg.orderStatus === 'READY' || cfg.orderStatus === 'SERVED' || cfg.orderStatus === 'COMPLETED' ? [{ status: 'READY', title: 'Order Prepared & Ready', timestamp: new Date(Date.now() - (cfg.minutesAgo - 10) * 60000).toISOString(), actor: 'Kitchen Lead' }] : []),
        ...(cfg.orderStatus === 'SERVED' || cfg.orderStatus === 'COMPLETED' ? [{ status: 'SERVED', title: 'Served at Table', timestamp: new Date(Date.now() - (cfg.minutesAgo - 12) * 60000).toISOString(), actor: 'Floor Waiter' }] : []),
        ...(cfg.orderStatus === 'COMPLETED' ? [{ status: 'COMPLETED', title: 'Order Billed & Settled', timestamp: new Date(Date.now() - (cfg.minutesAgo - 14) * 60000).toISOString(), actor: 'POS Cashier' }] : [])
      ],
      isSynced: true
    });
  });

  return orders;
}

export function generateSeedShifts(): import('@jamanvaar/types').ShiftRecord[] {
  const now = new Date();
  
  // Today's active shift opened in the morning
  const todayShiftOpen = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);
  
  // Yesterday's closed shift
  const yestShiftOpen = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 9, 0, 0, 0);
  const yestShiftClose = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 30, 0, 0);

  return [
    {
      id: 'shift-today-01',
      posId: 'POS-01',
      cashierId: 'usr-cashier-1',
      cashierName: 'Amit Dave (Lead Cashier)',
      openedAt: todayShiftOpen.toISOString(),
      status: 'OPEN',
      openingCash: 2000,
      expectedCash: 2000,
      totalCashSales: 0,
      totalUpiSales: 0,
      totalCardSales: 0,
      totalSales: 0,
      totalDiscounts: 0,
      totalOrders: 0,
      notes: 'Morning shift opening float ₹2,000 verified'
    },
    {
      id: 'shift-yesterday-01',
      posId: 'POS-01',
      cashierId: 'usr-cashier-1',
      cashierName: 'Amit Dave (Lead Cashier)',
      openedAt: yestShiftOpen.toISOString(),
      closedAt: yestShiftClose.toISOString(),
      status: 'CLOSED',
      openingCash: 2000,
      closingCash: 2000,
      actualCash: 2000,
      expectedCash: 2000,
      cashVariance: 0,
      totalCashSales: 0,
      totalUpiSales: 0,
      totalCardSales: 0,
      totalSales: 0,
      totalDiscounts: 0,
      totalOrders: 0,
      notes: 'Yesterday evening closing verified'
    }
  ];
}



