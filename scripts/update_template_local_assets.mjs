import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const TEMPLATES_DATA_PATH = path.join(ROOT_DIR, 'shared', 'database', 'src', 'menu_templates_data.ts');
const SEED_DATA_PATH = path.join(ROOT_DIR, 'shared', 'database', 'src', 'seed.ts');

function getLocalImagePath(dishName, categoryName) {
  const text = `${categoryName} ${dishName}`.toLowerCase();

  // Distinct Dish Specifics First
  if (text.includes('hara bhara')) return '/assets/menu/north-indian/hara-bhara-kebab.jpg';
  if (text.includes('crispy corn') || text.includes('salt & pepper') || text.includes('salt and pepper')) return '/assets/menu/fast-food/peri-peri-fries.jpg';
  if (text.includes('cigar rolls') || text.includes('cheese corn')) return '/assets/menu/chinese/momos.jpg';
  if (text.includes('paneer tikka')) return '/assets/menu/north-indian/paneer-tikka.jpg';
  if (text.includes('dal makhani')) return '/assets/menu/north-indian/dal-makhani.jpg';
  if (text.includes('paneer butter') || text.includes('butter masala') || text.includes('paneer makhani') || text.includes('shahi paneer') || text.includes('paneer lababdar')) return '/assets/menu/north-indian/paneer-butter-masala.jpg';
  if (text.includes('garlic naan') || text.includes('garlic butter naan') || text.includes('garlic bread')) return '/assets/menu/pizza/garlic-bread.jpg';
  if (text.includes('butter naan') || text.includes('tandoori naan')) return '/assets/menu/north-indian/butter-naan.jpg';
  if (text.includes('biryani') || text.includes('dum biryani') || text.includes('pulao')) return '/assets/menu/north-indian/biryani.jpg';
  if (text.includes('cold coffee') || text.includes('frappe') || text.includes('ice cream')) return '/assets/menu/cafe/frappe.jpg';
  if (text.includes('gulab jamun') || text.includes('jamun')) return '/assets/menu/north-indian/gulab-jamun.jpg';
  if (text.includes('thali') || text.includes('gujarati special') || text.includes('bhojanalaya') || text.includes('meal')) return '/assets/menu/gujarati/thali.jpg';

  // North Indian & Tandoori
  if (text.includes('mushroom')) return '/assets/menu/north-indian/tandoori-mushroom.jpg';
  if (text.includes('seekh') || text.includes('kebab')) return '/assets/menu/north-indian/seekh-kebab.jpg';
  if (text.includes('kadai') || text.includes('kadhai')) return '/assets/menu/north-indian/kadai-paneer.jpg';
  if (text.includes('dal tadka') || text.includes('yellow dal')) return '/assets/menu/north-indian/dal-tadka.jpg';
  if (text.includes('naan') || text.includes('paratha') || text.includes('roti') || text.includes('kulcha') || text.includes('sheermal') || text.includes('roomali') || text.includes('bread')) return '/assets/menu/north-indian/butter-naan.jpg';
  if (text.includes('rasmalai') || text.includes('rabri')) return '/assets/menu/north-indian/rasmalai.jpg';
  if (text.includes('chaas') || text.includes('buttermilk')) return '/assets/menu/north-indian/chaas.jpg';
  if (text.includes('lassi')) return '/assets/menu/north-indian/lassi.jpg';

  // Gujarati & Kathiyawadi
  if (text.includes('thali') || text.includes('bhojanalaya') || text.includes('meal')) return '/assets/menu/gujarati/thali.jpg';
  if (text.includes('khaman') || text.includes('dhokla')) return '/assets/menu/gujarati/khaman.jpg';
  if (text.includes('khandvi')) return '/assets/menu/gujarati/khandvi.jpg';
  if (text.includes('undhiyu')) return '/assets/menu/gujarati/undhiyu.jpg';
  if (text.includes('sev tameta') || text.includes('sev dungri')) return '/assets/menu/gujarati/sev-tameta.jpg';
  if (text.includes('rotla') || text.includes('bhakri') || text.includes('thepla') || text.includes('phulka')) return '/assets/menu/gujarati/rotla.jpg';
  if (text.includes('shrikhand') || text.includes('basundi')) return '/assets/menu/gujarati/shrikhand.jpg';
  if (text.includes('khichdi') || text.includes('kadhi') || text.includes('dal')) return '/assets/menu/gujarati/khichdi.jpg';
  if (text.includes('olo') || text.includes('ringna')) return '/assets/menu/kathiyawadi/ringna-olo.jpg';
  if (text.includes('lasaniya') || text.includes('bateta')) return '/assets/menu/kathiyawadi/lasaniya-bateta.jpg';
  if (text.includes('dahi tikhari')) return '/assets/menu/kathiyawadi/dahi-tikhari.jpg';

  // South Indian
  if (text.includes('mysore masala') || text.includes('mysore dosa')) return '/assets/menu/south-indian/mysore-dosa.jpg';
  if (text.includes('dosa') || text.includes('roast')) return '/assets/menu/south-indian/masala-dosa.jpg';
  if (text.includes('idli')) return '/assets/menu/south-indian/idli.jpg';
  if (text.includes('vada')) return '/assets/menu/south-indian/medu-vada.jpg';
  if (text.includes('uttapam')) return '/assets/menu/south-indian/uttapam.jpg';
  if (text.includes('coffee') || text.includes('kaapi')) return '/assets/menu/south-indian/filter-coffee.jpg';
  if (text.includes('south indian meal') || text.includes('sambar')) return '/assets/menu/south-indian/south-thali.jpg';

  // Rajasthani & Punjabi
  if (text.includes('baati') || text.includes('churma')) return '/assets/menu/rajasthani/dal-baati.jpg';
  if (text.includes('gatte') || text.includes('gatta')) return '/assets/menu/rajasthani/gatte-ki-sabzi.jpg';
  if (text.includes('chhole') || text.includes('chole')) return '/assets/menu/punjabi/pindi-chhole.jpg';
  if (text.includes('amritsari') || text.includes('kulcha')) return '/assets/menu/punjabi/amritsari-kulcha.jpg';
  if (text.includes('saag') || text.includes('makki')) return '/assets/menu/punjabi/sarson-saag.jpg';

  // Mughlai
  if (text.includes('galouti')) return '/assets/menu/mughlai/galouti-kebab.jpg';
  if (text.includes('korma') || text.includes('navratan')) return '/assets/menu/mughlai/navratan-korma.jpg';

  // Chinese & Indo-Chinese
  if (text.includes('noodle') || text.includes('hakka') || text.includes('chowmein')) return '/assets/menu/chinese/hakka-noodles.jpg';
  if (text.includes('schezwan') || text.includes('fried rice') || text.includes('triple')) return '/assets/menu/chinese/schezwan-rice.jpg';
  if (text.includes('chilli paneer')) return '/assets/menu/chinese/chilli-paneer.jpg';
  if (text.includes('manchurian') || text.includes('soup')) return '/assets/menu/chinese/manchurian.jpg';
  if (text.includes('momo') || text.includes('dimsum')) return '/assets/menu/chinese/momos.jpg';

  // Pizza & Italian
  if (text.includes('margherita')) return '/assets/menu/pizza/margherita.jpg';
  if (text.includes('farmhouse') || text.includes('veggie supreme') || text.includes('pizza')) return '/assets/menu/pizza/farmhouse.jpg';
  if (text.includes('garlic bread') || text.includes('breadsticks')) return '/assets/menu/pizza/garlic-bread.jpg';
  if (text.includes('pasta') || text.includes('penne') || text.includes('alfredo')) return '/assets/menu/pizza/garlic-bread.jpg';

  // Fast Food & Burgers
  if (text.includes('burger')) return '/assets/menu/fast-food/burger.jpg';
  if (text.includes('wrap') || text.includes('roll')) return '/assets/menu/fast-food/wrap.jpg';
  if (text.includes('fries') || text.includes('popper') || text.includes('finger')) return '/assets/menu/fast-food/peri-peri-fries.jpg';
  if (text.includes('sandwich') || text.includes('toastie')) return '/assets/menu/fast-food/sandwich.jpg';

  // Cafe & Bakery
  if (text.includes('cappuccino') || text.includes('latte')) return '/assets/menu/cafe/cappuccino.jpg';
  if (text.includes('frappe') || text.includes('cold coffee')) return '/assets/menu/cafe/frappe.jpg';
  if (text.includes('truffle') || text.includes('pastry')) return '/assets/menu/bakery/truffle-pastry.jpg';
  if (text.includes('choco lava') || text.includes('lava cake')) return '/assets/menu/bakery/choco-lava.jpg';

  // Chaat & Street Food
  if (text.includes('pani puri') || text.includes('golgappa')) return '/assets/menu/chaat/pani-puri.jpg';
  if (text.includes('sev puri') || text.includes('bhel') || text.includes('papdi')) return '/assets/menu/chaat/sev-puri.jpg';
  if (text.includes('pav bhaji')) return '/assets/menu/chaat/pav-bhaji.jpg';
  if (text.includes('samosa')) return '/assets/menu/snacks/samosa.jpg';
  if (text.includes('vada pav') || text.includes('batata vada')) return '/assets/menu/snacks/vada-pav.jpg';

  // Sweets & Desserts & Juices
  if (text.includes('kaju') || text.includes('katli')) return '/assets/menu/sweets/kaju-katli.jpg';
  if (text.includes('laddoo') || text.includes('laddu') || text.includes('mithai')) return '/assets/menu/sweets/motichoor.jpg';
  if (text.includes('falooda') || text.includes('kulfi')) return '/assets/menu/desserts/falooda.jpg';
  if (text.includes('brownie') || text.includes('sundae') || text.includes('cake')) return '/assets/menu/desserts/sizzler-brownie.jpg';
  if (text.includes('juice') || text.includes('mosambi') || text.includes('shake') || text.includes('smoothie')) return '/assets/menu/beverages/juice.jpg';
  if (text.includes('mojito') || text.includes('cooler') || text.includes('soda')) return '/assets/menu/beverages/mojito.jpg';

  // Jain
  if (text.includes('jain') && text.includes('tikka')) return '/assets/menu/jain/jain-tikka.jpg';
  if (text.includes('banana') || text.includes('kela')) return '/assets/menu/jain/raw-banana.jpg';

  return '/assets/menu/north-indian/paneer-butter-masala.jpg';
}

// 1. Process menu_templates_data.ts
let tplContent = fs.readFileSync(TEMPLATES_DATA_PATH, 'utf8');
const lines = tplContent.split('\n');
let currentCatName = 'General';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('name:') && line.includes('slug:')) {
    const match = line.match(/name:\s*'([^']+)'/);
    if (match) currentCatName = match[1];
  }
  if (line.includes('name:') && line.includes('sku:') && line.includes('imageUrl:')) {
    const dishMatch = line.match(/name:\s*'([^']+)'/);
    if (dishMatch) {
      const dishName = dishMatch[1];
      const localPath = getLocalImagePath(dishName, currentCatName);
      lines[i] = lines[i].replace(/imageUrl:\s*'[^']+'/, `imageUrl: '${localPath}'`);
    }
  }
}

fs.writeFileSync(TEMPLATES_DATA_PATH, lines.join('\n'), 'utf8');
console.log('✓ Updated shared/database/src/menu_templates_data.ts with real photo JPG asset paths');

// 2. Process seed.ts
let seedContent = fs.readFileSync(SEED_DATA_PATH, 'utf8');
const seedLines = seedContent.split('\n');
let seedCat = 'General';

for (let i = 0; i < seedLines.length; i++) {
  const line = seedLines[i];
  if (line.includes('name:') && (line.includes('slug:') || line.includes('cat-'))) {
    const match = line.match(/name:\s*'([^']+)'/);
    if (match) seedCat = match[1];
  }
  if (line.includes('imageUrl:') && !line.includes('heroImageUrl')) {
    let dishName = 'Dish';
    for (let k = i - 1; k >= Math.max(0, i - 10); k--) {
      const match = seedLines[k].match(/name:\s*'([^']+)'/);
      if (match) {
        dishName = match[1];
        break;
      }
    }
    const localPath = getLocalImagePath(dishName, seedCat);
    seedLines[i] = seedLines[i].replace(/imageUrl:\s*'[^']+'/, `imageUrl: '${localPath}'`);
  }
}

fs.writeFileSync(SEED_DATA_PATH, seedLines.join('\n'), 'utf8');
console.log('✓ Updated shared/database/src/seed.ts with real photo JPG asset paths');
