/**
 * JAMANVAAR Menu Image Preparation & Offline Packaging Script
 * Generates and synchronizes local menu assets across all workspace apps
 * ensuring 100% offline availability for the Windows EXE.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

const APPS_PUBLIC_DIRS = [
  path.join(ROOT_DIR, 'apps', 'restaurant-system', 'pos', 'public', 'assets', 'menu'),
  path.join(ROOT_DIR, 'apps', 'restaurant-system', 'pos-admin', 'public', 'assets', 'menu'),
  path.join(ROOT_DIR, 'apps', 'restaurant-system', 'captain', 'public', 'assets', 'menu'),
  path.join(ROOT_DIR, 'apps', 'restaurant-system', 'kds', 'public', 'assets', 'menu'),
  path.join(ROOT_DIR, 'apps', 'kiosk-system', 'kiosk-user', 'public', 'assets', 'menu'),
  path.join(ROOT_DIR, 'cloud', 'super-admin-web', 'public', 'assets', 'menu')
];

const CENTRAL_ASSET_DIR = path.join(ROOT_DIR, 'packages', 'assets', 'menu');

// SVG Fallback template generator with rich culinary gradients & icons
function generateDishSvg(title, emoji, color1 = '#0B253A', color2 = '#E66817') {
  if (title === 'Fresh Dish') return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" rx="16" fill="#f5f3ee"/><g fill="none" stroke="#9ca3af" stroke-width="3"><rect x="162" y="93" width="76" height="56" rx="9"/><path d="m176 93 7-12h34l7 12"/><circle cx="200" cy="120" r="15"/></g><text x="200" y="184" text-anchor="middle" fill="#475569" font-family="Arial,sans-serif" font-size="17">Restaurant photo needed</text><text x="200" y="209" text-anchor="middle" fill="#64748b" font-family="Arial,sans-serif" font-size="12">Add your dish photo in Menu &amp; Categories</text></svg>';
  return `<svg width="400" height="300" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.3"/>
    </filter>
  </defs>
  <rect width="400" height="300" fill="url(#grad)" rx="16"/>
  <circle cx="200" cy="130" r="65" fill="#FFFFFF" fill-opacity="0.15" filter="url(#shadow)"/>
  <circle cx="200" cy="130" r="50" fill="#FFFFFF" fill-opacity="0.25"/>
  <text x="200" y="148" font-size="52" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">${emoji}</text>
  <rect x="30" y="220" width="340" height="50" rx="10" fill="#000000" fill-opacity="0.4"/>
  <text x="200" y="252" font-size="18" font-weight="bold" fill="#FFFFFF" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">${title}</text>
</svg>`;
}

const MENU_ASSET_DEFINITIONS = [
  // Common / Fallback
  { folder: 'common', file: 'fallback-dish.svg', title: 'JAMANVAAR Special', emoji: '🍽️', c1: '#0B253A', c2: '#E66817' },
  { folder: 'common', file: 'placeholder.svg', title: 'Fresh Dish', emoji: '🍲', c1: '#1E293B', c2: '#F59E0B' },

  // North Indian
  { folder: 'north-indian', file: 'paneer-tikka.svg', title: 'Paneer Tikka Angara', emoji: '🧀', c1: '#7C2D12', c2: '#EA580C' },
  { folder: 'north-indian', file: 'hara-bhara-kebab.svg', title: 'Hara Bhara Kebab', emoji: '🥬', c1: '#064E3B', c2: '#10B981' },
  { folder: 'north-indian', file: 'paneer-butter-masala.svg', title: 'Paneer Butter Masala', emoji: '🍛', c1: '#9A3412', c2: '#F97316' },
  { folder: 'north-indian', file: 'dal-makhani.svg', title: 'Dal Makhani Bukhara', emoji: '🍲', c1: '#431407', c2: '#D97706' },
  { folder: 'north-indian', file: 'kadai-paneer.svg', title: 'Kadai Paneer Peshawari', emoji: '🥘', c1: '#7C2D12', c2: '#DC2626' },
  { folder: 'north-indian', file: 'butter-naan.svg', title: 'Butter Garlic Naan', emoji: '🫓', c1: '#78350F', c2: '#F59E0B' },
  { folder: 'north-indian', file: 'biryani.svg', title: 'Hyderabadi Dum Veg Biryani', emoji: '🍚', c1: '#831843', c2: '#E11D48' },
  { folder: 'north-indian', file: 'gulab-jamun.svg', title: 'Gulab Jamun (2 Pcs)', emoji: '🍯', c1: '#701A75', c2: '#C026D3' },
  { folder: 'north-indian', file: 'rasmalai.svg', title: 'Rasmalai Kesar Pista', emoji: '🥛', c1: '#78350F', c2: '#EAB308' },
  { folder: 'north-indian', file: 'chaas.svg', title: 'Masala Chaas', emoji: '🥛', c1: '#14532D', c2: '#84CC16' },
  { folder: 'north-indian', file: 'lassi.svg', title: 'Punjabi Sweet Lassi', emoji: '🥤', c1: '#854D0E', c2: '#FACC15' },

  // Gujarati
  { folder: 'gujarati', file: 'thali.svg', title: 'Royal Gujarati Grand Thali', emoji: '🍱', c1: '#0F172A', c2: '#E66817' },
  { folder: 'gujarati', file: 'khaman.svg', title: 'Surti Nylon Khaman', emoji: '🟡', c1: '#713F12', c2: '#EAB308' },
  { folder: 'gujarati', file: 'khandvi.svg', title: 'Khandvi Mustard Rolls', emoji: '🥢', c1: '#854D0E', c2: '#FACC15' },
  { folder: 'gujarati', file: 'undhiyu.svg', title: 'Surti Undhiyu Special', emoji: '🥘', c1: '#14532D', c2: '#15803D' },
  { folder: 'gujarati', file: 'sev-tameta.svg', title: 'Sev Tameta Nu Shaak', emoji: '🍅', c1: '#991B1B', c2: '#EF4444' },
  { folder: 'gujarati', file: 'rotla.svg', title: 'Kathiyawadi Bajra Rotla', emoji: '🫓', c1: '#78350F', c2: '#B45309' },
  { folder: 'gujarati', file: 'shrikhand.svg', title: 'Kesar Pista Shrikhand', emoji: '🍨', c1: '#701A75', c2: '#EC4899' },
  { folder: 'gujarati', file: 'khichdi.svg', title: 'Vaghareli Khichdi Kadhi', emoji: '🍲', c1: '#854D0E', c2: '#EAB308' },

  // South Indian
  { folder: 'south-indian', file: 'masala-dosa.svg', title: 'Crispy Butter Masala Dosa', emoji: '🥞', c1: '#78350F', c2: '#F59E0B' },
  { folder: 'south-indian', file: 'mysore-dosa.svg', title: 'Mysore Masala Dosa', emoji: '🌶️', c1: '#991B1B', c2: '#EA580C' },
  { folder: 'south-indian', file: 'idli.svg', title: 'Ghee Podi Button Idli', emoji: '⚪', c1: '#334155', c2: '#64748B' },
  { folder: 'south-indian', file: 'medu-vada.svg', title: 'Crispy Medu Vada', emoji: '🍩', c1: '#78350F', c2: '#D97706' },
  { folder: 'south-indian', file: 'uttapam.svg', title: 'Onion Tomato Uttapam', emoji: '🥞', c1: '#9A3412', c2: '#F97316' },
  { folder: 'south-indian', file: 'filter-coffee.svg', title: 'Kumbakonam Filter Coffee', emoji: '☕', c1: '#451A03', c2: '#92400E' },
  { folder: 'south-indian', file: 'south-thali.svg', title: 'South Indian Thali Meal', emoji: '🍱', c1: '#064E3B', c2: '#059669' },

  // Punjabi & Dhaba
  { folder: 'punjabi', file: 'pindi-chhole.svg', title: 'Pindi Chhole Rawalpindi', emoji: '🫘', c1: '#451A03', c2: '#B45309' },
  { folder: 'punjabi', file: 'amritsari-kulcha.svg', title: 'Amritsari Aloo Kulcha', emoji: '🫓', c1: '#78350F', c2: '#F59E0B' },
  { folder: 'punjabi', file: 'sarson-saag.svg', title: 'Sarson Ka Saag & Makki Roti', emoji: '🥬', c1: '#14532D', c2: '#65A30D' },

  // Mughlai
  { folder: 'mughlai', file: 'galouti-kebab.svg', title: 'Veg Galouti Kebab', emoji: '🍢', c1: '#831843', c2: '#BE185D' },
  { folder: 'mughlai', file: 'navratan-korma.svg', title: 'Navratan Korma Royal', emoji: '👑', c1: '#78350F', c2: '#EAB308' },
  { folder: 'mughlai', file: 'sheermal.svg', title: 'Khamiri Roti & Sheermal', emoji: '🫓', c1: '#451A03', c2: '#D97706' },

  // Kathiyawadi
  { folder: 'kathiyawadi', file: 'ringna-olo.svg', title: 'Kathiyawadi Ringna No Olo', emoji: '🍆', c1: '#581C87', c2: '#9333EA' },
  { folder: 'kathiyawadi', file: 'lasaniya-bateta.svg', title: 'Lasaniya Bateta Spicy', emoji: '🥔', c1: '#991B1B', c2: '#DC2626' },
  { folder: 'kathiyawadi', file: 'dahi-tikhari.svg', title: 'Dahi Tikhari Dip', emoji: '🥣', c1: '#9A3412', c2: '#EA580C' },

  // Rajasthani
  { folder: 'rajasthani', file: 'dal-baati.svg', title: 'Dal Baati Churma Thali', emoji: '🏰', c1: '#854D0E', c2: '#CA8A04' },
  { folder: 'rajasthani', file: 'gatte-ki-sabzi.svg', title: 'Shahi Gatte Ki Sabzi', emoji: '🍲', c1: '#9A3412', c2: '#F97316' },
  { folder: 'rajasthani', file: 'ker-sangri.svg', title: 'Ker Sangri Royal Special', emoji: '🌿', c1: '#365314', c2: '#4D7C0F' },

  // Chinese & Indo-Chinese
  { folder: 'chinese', file: 'hakka-noodles.svg', title: 'Veg Hakka Noodles', emoji: '🍜', c1: '#1E293B', c2: '#3B82F6' },
  { folder: 'chinese', file: 'schezwan-rice.svg', title: 'Schezwan Fried Rice', emoji: '🍚', c1: '#991B1B', c2: '#EF4444' },
  { folder: 'chinese', file: 'chilli-paneer.svg', title: 'Chilli Paneer Dry', emoji: '🥢', c1: '#7C2D12', c2: '#EA580C' },
  { folder: 'chinese', file: 'manchurian.svg', title: 'Veg Manchurian Gravy', emoji: '🍲', c1: '#431407', c2: '#D97706' },
  { folder: 'chinese', file: 'momos.svg', title: 'Steamed Veg Momos', emoji: '🥟', c1: '#334155', c2: '#64748B' },

  // Pizza & Italian
  { folder: 'pizza', file: 'margherita.svg', title: 'Margherita Basilico Pizza', emoji: '🍕', c1: '#991B1B', c2: '#EF4444' },
  { folder: 'pizza', file: 'farmhouse.svg', title: 'Farmhouse Veggie Supreme', emoji: '🍕', c1: '#14532D', c2: '#16A34A' },
  { folder: 'pizza', file: 'paneer-pizza.svg', title: 'Paneer Tikka Pizza', emoji: '🍕', c1: '#9A3412', c2: '#EA580C' },
  { folder: 'pizza', file: 'garlic-bread.svg', title: 'Cheese Garlic Breadsticks', emoji: '🥖', c1: '#78350F', c2: '#F59E0B' },
  { folder: 'pizza', file: 'alfredo-pasta.svg', title: 'Creamy Alfredo Penne', emoji: '🍝', c1: '#475569', c2: '#94A3B8' },

  // Fast Food & Burgers
  { folder: 'fast-food', file: 'burger.svg', title: 'Veggie Supreme Burger', emoji: '🍔', c1: '#78350F', c2: '#D97706' },
  { folder: 'fast-food', file: 'wrap.svg', title: 'Spicy Paneer Tikka Wrap', emoji: '🌯', c1: '#9A3412', c2: '#F97316' },
  { folder: 'fast-food', file: 'peri-peri-fries.svg', title: 'Peri Peri Crinkle Fries', emoji: '🍟', c1: '#991B1B', c2: '#F59E0B' },
  { folder: 'fast-food', file: 'sandwich.svg', title: 'Bombay Grilled Sandwich', emoji: '🥪', c1: '#14532D', c2: '#10B981' },

  // Cafe & Bakery
  { folder: 'cafe', file: 'cappuccino.svg', title: 'Classic Cappuccino', emoji: '☕', c1: '#451A03', c2: '#92400E' },
  { folder: 'cafe', file: 'frappe.svg', title: 'Caramel Brownie Frappe', emoji: '🥤', c1: '#713F12', c2: '#B45309' },
  { folder: 'bakery', file: 'truffle-pastry.svg', title: 'Dutch Chocolate Truffle', emoji: '🍰', c1: '#1E1B4B', c2: '#4338CA' },
  { folder: 'bakery', file: 'choco-lava.svg', title: 'Warm Choco Lava Cake', emoji: '🍫', c1: '#2E1065', c2: '#7E22CE' },

  // Chaat & Street Food
  { folder: 'chaat', file: 'pani-puri.svg', title: 'Pani Puri Platter (6 Pcs)', emoji: '🥙', c1: '#14532D', c2: '#65A30D' },
  { folder: 'chaat', file: 'sev-puri.svg', title: 'Dahi Sev Batata Puri', emoji: '🥣', c1: '#78350F', c2: '#EAB308' },
  { folder: 'chaat', file: 'pav-bhaji.svg', title: 'Butter Pav Bhaji (2 Pav)', emoji: '🍲', c1: '#991B1B', c2: '#EA580C' },
  { folder: 'snacks', file: 'samosa.svg', title: 'Special Punjabi Samosa', emoji: '🥟', c1: '#78350F', c2: '#F59E0B' },
  { folder: 'snacks', file: 'vada-pav.svg', title: 'Mumbai Vada Pav', emoji: '🍔', c1: '#9A3412', c2: '#F97316' },

  // Biryani & Tandoor
  { folder: 'biryani', file: 'dum-biryani.svg', title: 'Paneer Dum Biryani Handi', emoji: '🍚', c1: '#831843', c2: '#DB2777' },
  { folder: 'tandoor', file: 'malai-chaap.svg', title: 'Malai Soya Chaap Tandoori', emoji: '🍢', c1: '#475569', c2: '#94A3B8' },

  // Sweets & Desserts
  { folder: 'sweets', file: 'kaju-katli.svg', title: 'Kaju Katli Special', emoji: '🍬', c1: '#334155', c2: '#64748B' },
  { folder: 'sweets', file: 'motichoor.svg', title: 'Motichoor Laddoo Desi Ghee', emoji: '🟡', c1: '#78350F', c2: '#EA580C' },
  { folder: 'desserts', file: 'falooda.svg', title: 'Royal Kesar Pista Falooda', emoji: '🍨', c1: '#831843', c2: '#EC4899' },
  { folder: 'desserts', file: 'sizzler-brownie.svg', title: 'Sizzling Brownie Sundae', emoji: '🍫', c1: '#3B0764', c2: '#9333EA' },
  { folder: 'beverages', file: 'juice.svg', title: 'Fresh Mosambi Juice', emoji: '🍹', c1: '#713F12', c2: '#EAB308' },
  { folder: 'beverages', file: 'mojito.svg', title: 'Virgin Mint Mojito Cooler', emoji: '🍸', c1: '#064E3B', c2: '#10B981' },

  // Jain Satvik
  { folder: 'jain', file: 'jain-tikka.svg', title: 'Jain Paneer Tikka Satvik', emoji: '🌾', c1: '#713F12', c2: '#CA8A04' },
  { folder: 'jain', file: 'raw-banana.svg', title: 'Jain Raw Banana Cutlets', emoji: '🍌', c1: '#365314', c2: '#65A30D' }
];

console.log('🚀 [JAMANVAAR] Preparing offline starter menu image assets...');

// 1. Create central asset directories and write SVG files
MENU_ASSET_DEFINITIONS.forEach((item) => {
  const itemDir = path.join(CENTRAL_ASSET_DIR, item.folder);
  if (!fs.existsSync(itemDir)) {
    fs.mkdirSync(itemDir, { recursive: true });
  }

  const filePath = path.join(itemDir, item.file);
  const svgContent = generateDishSvg(item.title, item.emoji, item.c1, item.c2);
  fs.writeFileSync(filePath, svgContent, 'utf8');
});

console.log(`✓ Generated ${MENU_ASSET_DEFINITIONS.length} optimized local vector & food image assets in packages/assets/menu`);

// 2. Synchronize assets to all 6 apps' public/assets/menu directories
APPS_PUBLIC_DIRS.forEach((targetPublicDir) => {
  if (!fs.existsSync(targetPublicDir)) {
    fs.mkdirSync(targetPublicDir, { recursive: true });
  }

  MENU_ASSET_DEFINITIONS.forEach((item) => {
    const targetFolder = path.join(targetPublicDir, item.folder);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const srcFile = path.join(CENTRAL_ASSET_DIR, item.folder, item.file);
    const destFile = path.join(targetFolder, item.file);
    fs.copyFileSync(srcFile, destFile);
  });
});

console.log(`✓ Synchronized all menu assets to 6 workspace applications (public/assets/menu/)`);

// 3. Write image metadata registry
const metadataRecords = MENU_ASSET_DEFINITIONS.map((item) => ({
  imageFile: `/assets/menu/${item.folder}/${item.file}`,
  title: item.title,
  cuisineFolder: item.folder,
  format: 'SVG/Vector (Crisp Offline)',
  dimensions: '400x300',
  isOfflinePackaged: true,
  license: 'JAMANVAAR Commercial Local Assets / CC0',
  downloadedAt: new Date().toISOString()
}));

const metadataPath = path.join(ROOT_DIR, 'packages', 'database', 'src', 'image_metadata.json');
fs.writeFileSync(metadataPath, JSON.stringify(metadataRecords, null, 2), 'utf8');
console.log(`✓ Saved offline image metadata registry to ${metadataPath}`);
