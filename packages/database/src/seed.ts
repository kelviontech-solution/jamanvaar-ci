import {
  Category,
  Coupon,
  DiningTable,
  MenuItem,
  ModifierGroup,
  Offer,
  Outlet,
  QrOrderingSettings,
  KioskDisplaySettings,
  Restaurant,
  Role,
  TaxGroup,
  User,
  WelcomeScreenSettings
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

export const DEFAULT_KIOSK_DISPLAY_SETTINGS: KioskDisplaySettings = {
  enabledLanguages: ['en', 'hi', 'gu'],
  defaultLanguage: 'en',
  idleWarningAfterSeconds: 45,
  idleResetCountdownSeconds: 15
};

export const DEFAULT_WELCOME_SCREEN_SETTINGS: WelcomeScreenSettings = {
  showHeritageArtwork: true,
  showPromoBanner: false
};

export const SEED_RESTAURANT: Restaurant = {
  id: 'rest-jamanvaar-main',
  // Was the one field on this object left as a generic "My Restaurant"
  // placeholder while every other field (legalName, footerText, gstin,
  // fssaiNumber) already assumes this JAMANVAAR demo identity — inconsistent
  // with itself, and the exact "generic branding" confusion the QA audit
  // flagged. A real cloud-activated device overwrites this with its actual
  // restaurant name anyway (see activation-keys.service.ts's redeem
  // response); this is only what a not-yet-activated local install shows.
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
    translations: {
      hi: { name: 'हरा भरा कबाब (6 पीस)', description: 'पालक, हरी मटर और पनीर से बने कुरकुरे कबाब, ताज़ी पुदीना चटनी के साथ।' },
      gu: { name: 'હરા ભરા કબાબ (6 પીસ)', description: 'પાલક, વટાણા અને પનીરમાંથી બનેલા કડક કબાબ, તાજી ફુદીનાની ચટણી સાથે.' }
    },
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
    translations: {
      hi: { name: 'क्रिस्पी कॉर्न सॉल्ट एंड पेपर', description: 'शिमला मिर्च, हरी मिर्च और सुगंधित मसालों के साथ तली हुई मीठी मक्का।' },
      gu: { name: 'ક્રિસ્પી કોર્ન સોલ્ટ એન્ડ પેપર', description: 'કેપ્સિકમ, લીલા મરચાં અને સુગંધિત મસાલા સાથે તળેલી મીઠી મકાઈ.' }
    },
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
    translations: {
      hi: { name: 'चीज़ कॉर्न सिगार रोल्स (5 पीस)', description: 'पिघले मोज़ेरेला, मीठी मक्की और हर्ब्स से भरे सुनहरे कुरकुरे रोल, स्वीट चिली डिप के साथ।' },
      gu: { name: 'ચીઝ કોર્ન સિગાર રોલ્સ (5 પીસ)', description: 'પીગળેલા મોઝેરેલા, મીઠી મકાઈ અને હર્બ્સથી ભરેલા સોનેરી કડક રોલ્સ, સ્વીટ ચિલી ડિપ સાથે.' }
    },
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
    translations: {
      hi: { name: 'पनीर टिक्का (तंदूरी अंगार)', description: 'ताज़ा मलाई पनीर के टुकड़े मसालेदार दही में मैरीनेट करके कोयले पर भूने गए।' },
      gu: { name: 'પનીર ટિક્કા (તંદૂરી અંગાર)', description: 'તાજા મલાઈ પનીરના ટુકડા મસાલેદાર દહીંમાં મેરીનેટ કરીને કોલસા પર શેકેલા.' }
    },
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
    translations: {
      hi: { name: 'दाल मखनी (धीमी आंच पर पकी)', description: 'रात भर मक्खन, टमाटर और ताज़ी क्रीम के साथ धीमी आंच पर पकी काली उड़द दाल।' },
      gu: { name: 'દાળ મખની (ધીમા તાપે રાંધેલી)', description: 'આખી રાત માખણ, ટામેટા અને તાજી ક્રીમ સાથે ધીમા તાપે રાંધેલી અડદની દાળ.' }
    },
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
    translations: {
      hi: { name: 'पनीर बटर मसाला', description: 'मक्खन और क्रीम से भरपूर लज़ीज़ मखनी ग्रेवी में पका मुलायम पनीर।' },
      gu: { name: 'પનીર બટર મસાલા', description: 'માખણ અને ક્રીમથી ભરપૂર સ્વાદિષ્ટ મખની ગ્રેવીમાં રાંધેલું નરમ પનીર.' }
    },
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
    translations: {
      hi: { name: 'बटर नान (तंदूरी)', description: 'मिट्टी के तंदूर में पकी पारंपरिक रोटी, शुद्ध अमूल मक्खन से सजी।' },
      gu: { name: 'બટર નાન (તંદૂરી)', description: 'માટીના તંદૂરમાં પકાવેલી પરંપરાગત રોટલી, શુદ્ધ અમૂલ માખણથી શણગારેલી.' }
    },
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
    translations: {
      hi: { name: 'गार्लिक बटर नान', description: 'भुने हुए कटे लहसुन, ताज़ा धनिया और मक्खन से सजी मुलायम तंदूरी रोटी।' },
      gu: { name: 'ગાર્લિક બટર નાન', description: 'શેકેલા ઝીણા લસણ, તાજા કોથમીર અને માખણથી શણગારેલી નરમ તંદૂરી રોટલી.' }
    },
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
    translations: {
      hi: { name: 'रॉयल वेज हांडी दम बिरयानी', description: 'ताज़ी मौसमी सब्ज़ियां और पनीर, केसर युक्त बासमती चावल में धीमी आंच पर पकाया गया।' },
      gu: { name: 'રોયલ વેજ હાંડી દમ બિરયાની', description: 'તાજા મોસમી શાકભાજી અને પનીર, કેસર યુક્ત બાસમતી ચોખામાં ધીમા તાપે રાંધેલા.' }
    },
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
    translations: {
      hi: { name: 'कोल्ड कॉफी विथ वनिला आइसक्रीम', description: 'ठंडे दूध और मलाईदार वनिला आइसक्रीम के साथ मिश्रित एस्प्रेसो।' },
      gu: { name: 'કોલ્ડ કોફી વિથ વેનિલા આઇસક્રીમ', description: 'ઠંડા દૂધ અને મલાઈદાર વેનિલા આઇસક્રીમ સાથે મિક્સ કરેલી એસ્પ્રેસો.' }
    },
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
    categoryId: 'cat-beverages',
    sku: 'GJ-11',
    name: 'Shahi Gulab Jamun (2 Pcs)',
    description: 'Warm, soft khoya dumplings soaked in fragrant green cardamom and saffron syrup.',
    translations: {
      hi: { name: 'शाही गुलाब जामुन (2 पीस)', description: 'गरम, मुलायम खोया गोले, सुगंधित हरी इलायची और केसर की चाशनी में डूबे।' },
      gu: { name: 'શાહી ગુલાબ જામુન (2 પીસ)', description: 'ગરમ, નરમ ખોયાના ગોળા, સુગંધિત ઇલાયચી અને કેસરની ચાસણીમાં ડૂબેલા.' }
    },
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
    translations: {
      hi: { name: 'ऑथेंटिक गुजराती स्पेशल थाली', description: '2 वेज सब्ज़ी, गुजराती कढ़ी, दाल, 4 फुल्का रोटी, जीरा राइस, फरसान, मीठा, अचार और मसाला छाछ।' },
      gu: { name: 'ઓથેન્ટિક ગુજરાતી સ્પેશિયલ થાળી', description: '2 વેજ શાક, ગુજરાતી કઢી, દાળ, 4 ફૂલકા રોટલી, જીરા રાઇસ, ફરસાણ, મીઠાઈ, અથાણું અને મસાલા છાસ.' }
    },
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
  { id: 'tbl-1', outletId: 'out-ahmedabad-central', tableNumber: '1', capacity: 2, zone: 'Main Hall', floor: 1, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-001', qrToken: 'jv_qr_tbl_1_a8f3d10e54b6c927e1f40b5d8a23c719e04f', qrCodeUrl: 'http://localhost:5176/?qrTable=1&token=jv_qr_tbl_1_a8f3d10e54b6c927e1f40b5d8a23c719e04f', qrStatus: 'ACTIVE', totalOrdersToday: 0, totalRevenueToday: 0, isActive: true },
  { id: 'tbl-2', outletId: 'out-ahmedabad-central', tableNumber: '2', capacity: 2, zone: 'Main Hall', floor: 1, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-002', qrToken: 'jv_qr_tbl_2_b9c4e21f65c7d038f2a51c6e9b34d820f15a', qrCodeUrl: 'http://localhost:5176/?qrTable=2&token=jv_qr_tbl_2_b9c4e21f65c7d038f2a51c6e9b34d820f15a', qrStatus: 'ACTIVE', totalOrdersToday: 0, totalRevenueToday: 0, isActive: true },
  { id: 'tbl-3', outletId: 'out-ahmedabad-central', tableNumber: '3', capacity: 4, zone: 'Main Hall', floor: 1, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-003', qrToken: 'jv_qr_tbl_3_c0d5f32076d8e149a3b62d7f0c45e931a26b', qrCodeUrl: 'http://localhost:5176/?qrTable=3&token=jv_qr_tbl_3_c0d5f32076d8e149a3b62d7f0c45e931a26b', qrStatus: 'ACTIVE', totalOrdersToday: 0, totalRevenueToday: 0, isActive: true },
  { id: 'tbl-4', outletId: 'out-ahmedabad-central', tableNumber: '4', capacity: 4, zone: 'Main Hall', floor: 1, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-004', qrToken: 'jv_qr_tbl_4_d1e6a43187e9f250b4c73e801d56fa42b37c', qrCodeUrl: 'http://localhost:5176/?qrTable=4&token=jv_qr_tbl_4_d1e6a43187e9f250b4c73e801d56fa42b37c', qrStatus: 'ACTIVE', totalOrdersToday: 0, totalRevenueToday: 0, isActive: true },
  { id: 'tbl-5', outletId: 'out-ahmedabad-central', tableNumber: '5', capacity: 4, zone: 'Main Hall', floor: 1, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-005', qrToken: 'jv_qr_tbl_5_e2f7b54298fa0361c5d84f912e67ab53c48d', qrCodeUrl: 'http://localhost:5176/?qrTable=5&token=jv_qr_tbl_5_e2f7b54298fa0361c5d84f912e67ab53c48d', qrStatus: 'ACTIVE', totalOrdersToday: 0, totalRevenueToday: 0, isActive: true },
  { id: 'tbl-6', outletId: 'out-ahmedabad-central', tableNumber: '6', capacity: 6, zone: 'Family Section', floor: 1, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-006', qrToken: 'jv_qr_tbl_6_f3a8c65309ab1472d6e95a023f78bc64d59e', qrCodeUrl: 'http://localhost:5176/?qrTable=6&token=jv_qr_tbl_6_f3a8c65309ab1472d6e95a023f78bc64d59e', qrStatus: 'ACTIVE', totalOrdersToday: 0, totalRevenueToday: 0, isActive: true },
  { id: 'tbl-7', outletId: 'out-ahmedabad-central', tableNumber: '7', capacity: 6, zone: 'Family Section', floor: 1, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-007', qrToken: 'jv_qr_tbl_7_04b9d76410bc2583e7fa6b134089cd75e6af', qrCodeUrl: 'http://localhost:5176/?qrTable=7&token=jv_qr_tbl_7_04b9d76410bc2583e7fa6b134089cd75e6af', qrStatus: 'ACTIVE', totalOrdersToday: 0, totalRevenueToday: 0, isActive: true },
  { id: 'tbl-8', outletId: 'out-ahmedabad-central', tableNumber: '8', capacity: 8, zone: 'Family Section', floor: 1, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-008', qrToken: 'jv_qr_tbl_8_15cae87521cd3694f8ab7c24519ade86f7b0', qrCodeUrl: 'http://localhost:5176/?qrTable=8&token=jv_qr_tbl_8_15cae87521cd3694f8ab7c24519ade86f7b0', qrStatus: 'ACTIVE', totalOrdersToday: 0, totalRevenueToday: 0, isActive: true },
  { id: 'tbl-9', outletId: 'out-ahmedabad-central', tableNumber: '9', capacity: 4, zone: 'AC Balcony', floor: 2, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-009', qrToken: 'jv_qr_tbl_9_26dbf98632de470509bc8d3562abef9708c1', qrCodeUrl: 'http://localhost:5176/?qrTable=9&token=jv_qr_tbl_9_26dbf98632de470509bc8d3562abef9708c1', qrStatus: 'ACTIVE', totalOrdersToday: 0, totalRevenueToday: 0, isActive: true },
  { id: 'tbl-10', outletId: 'out-ahmedabad-central', tableNumber: '10', capacity: 4, zone: 'AC Balcony', floor: 2, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-010', qrToken: 'jv_qr_tbl_10_37eca09743ef58161acd9e4673bcf0a819d2', qrCodeUrl: 'http://localhost:5176/?qrTable=10&token=jv_qr_tbl_10_37eca09743ef58161acd9e4673bcf0a819d2', qrStatus: 'ACTIVE', totalOrdersToday: 0, totalRevenueToday: 0, isActive: true },
  { id: 'tbl-11', outletId: 'out-ahmedabad-central', tableNumber: '11', capacity: 4, zone: 'AC Balcony', floor: 2, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-011', qrToken: 'jv_qr_tbl_11_48fdb10854fa69272bde0f5784cda1b92ae3', qrCodeUrl: 'http://localhost:5176/?qrTable=11&token=jv_qr_tbl_11_48fdb10854fa69272bde0f5784cda1b92ae3', qrStatus: 'ACTIVE', totalOrdersToday: 0, totalRevenueToday: 0, isActive: true },
  { id: 'tbl-12', outletId: 'out-ahmedabad-central', tableNumber: '12', capacity: 4, zone: 'AC Balcony', floor: 2, status: 'AVAILABLE', qrShortCode: 'QR-TABLE-012', qrToken: 'jv_qr_tbl_12_59aec21965ab7a383cef106895deb2ca3bf4', qrCodeUrl: 'http://localhost:5176/?qrTable=12&token=jv_qr_tbl_12_59aec21965ab7a383cef106895deb2ca3bf4', qrStatus: 'ACTIVE', totalOrdersToday: 0, totalRevenueToday: 0, isActive: true }
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
  },
  {
    id: 'role-captain',
    name: 'Captain / Waiter',
    description: 'Floor staff taking dine-in orders on the Captain app and relaying them to the kitchen',
    permissions: ['pos.view', 'pos.order', 'order.view', 'kiosk.view']
  },
  {
    id: 'role-chef',
    name: 'Kitchen Chef',
    description: 'Kitchen Display station staff moving tickets through preparation',
    permissions: ['order.view']
  }
];

/**
 * A fresh restaurant starts with NO staff and NO working login anywhere (BUG-005/011).
 * The previous four seeded accounts (with plaintext PINs 9999/5678/1234/2222, real names,
 * "@jamanvaar.com" emails) showed up on every install regardless of who the restaurant
 * actually is, and a "Quick Demo Login" button in POS logged straight in as one of them.
 * The owner's real staff, and their PINs, now come only from Restaurant Admin
 * (StaffRepository.createUser / resetPin — see BUG-006).
 */
export const SEED_USERS: User[] = [];

// Was a ~520-line generator fabricating roughly 77 fake historical orders
// (with invented customers, cashiers, captains, tables and payment amounts
// spread across "today" through 5 days ago) plus several fake QR-table
// orders — every restaurant, on every fresh install, saw invented sales
// history before ever taking a real order. Dashboard/Reports/Billing/EOD
// screens now correctly show a genuine empty state until real orders are
// placed through POS/Kiosk/Captain.
export function generateSeedOrders(): import('@jamanvaar/types').Order[] {
  return [];
}

export function generateSeedShifts(): import('@jamanvaar/types').ShiftRecord[] {
  // BUG-012: this used to fabricate an OPEN "POS-01 · Amit Dave · Float ₹2,000" shift (plus a
  // closed one for "yesterday") on every fresh install, so Restaurant Admin's header showed a
  // shift nobody actually opened. A fresh restaurant has no open shift until a real cashier
  // opens one.
  return [];
}



