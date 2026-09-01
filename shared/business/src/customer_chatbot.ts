import { ChatMessage, MenuItem } from '@jamanvaar/types';
import { db } from '@jamanvaar/database';

export class CustomerChatbotEngine {
  /**
   * Process a customer inquiry and return actionable suggestions with real menu items & combos
   */
  public static processQuery(query: string): ChatMessage {
    const q = query.toLowerCase().trim();
    const id = `msg-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const allItems = db.menuItems.filter((it) => it.isAvailable && it.dietaryType !== 'NON_VEG' && !it.name.toLowerCase().includes('chicken'));
    const allCombos = db.combos.filter((c) => c.isAvailable);

    // 0. Intent: Combos / Value Meals / Thali
    if (q.includes('combo') || q.includes('thali') || q.includes('feast') || q.includes('deal') || q.includes('package')) {
      return {
        id,
        sender: 'ASSISTANT',
        text: 'Here are our Chef\'s Value Combos & Signature Thalis — packaged with maximum taste and instant savings:',
        timestamp,
        actionCombos: allCombos,
        suggestions: ['Show vegetarian dishes', 'Show today\'s coupons', 'View my cart']
      };
    }

    // 1. Intent: Starters / Appetizers
    if (q.includes('starter') || q.includes('appetizer') || q.includes('snack') || q.includes('tikka') || q.includes('kebab')) {
      const starters = allItems.filter((i) => i.categoryId === 'cat-starters' || i.name.toLowerCase().includes('tikka')).slice(0, 4);
      return {
        id,
        sender: 'ASSISTANT',
        text: 'Here are our sizzling tandoori starters and appetizers:',
        timestamp,
        actionItems: starters,
        suggestions: ['Show Main Course', 'Show Cold Beverages', 'Show Jain Starters']
      };
    }

    // 2. Intent: Biryani & Rice
    if (q.includes('biryani') || q.includes('rice') || q.includes('pulao') || q.includes('dum')) {
      const biryanis = allItems.filter((i) => i.categoryId === 'cat-biryani' || i.name.toLowerCase().includes('biryani')).slice(0, 4);
      return {
        id,
        sender: 'ASSISTANT',
        text: 'Fragrant, slow-cooked Dum Biryanis infused with saffron and royal spices:',
        timestamp,
        actionItems: biryanis.length > 0 ? biryanis : allItems.slice(0, 3),
        suggestions: ['Add Raita Pairing', 'Show Starters', 'Show Combos']
      };
    }

    // 3. Intent: Main Course / Curries
    if (q.includes('main') || q.includes('curry') || q.includes('paneer') || q.includes('dal') || q.includes('gravy')) {
      const mains = allItems.filter((i) => i.categoryId === 'cat-mains' || i.name.toLowerCase().includes('paneer') || i.name.toLowerCase().includes('dal')).slice(0, 4);
      return {
        id,
        sender: 'ASSISTANT',
        text: 'Rich, slow-simmered heritage curries and gravies:',
        timestamp,
        actionItems: mains,
        suggestions: ['Show Tandoori Breads', 'Show Starters', 'Show Jain Curries']
      };
    }

    // 4. Intent: Breads & Naan
    if (q.includes('bread') || q.includes('naan') || q.includes('roti') || q.includes('kulcha') || q.includes('paratha')) {
      const breads = allItems.filter((i) => i.categoryId === 'cat-breads' || i.name.toLowerCase().includes('naan') || i.name.toLowerCase().includes('roti')).slice(0, 4);
      return {
        id,
        sender: 'ASSISTANT',
        text: 'Fresh, tandoor-baked breads to pair with your curries:',
        timestamp,
        actionItems: breads,
        suggestions: ['Show Curries', 'Show Combos', 'View my cart']
      };
    }

    // 5. Intent: Popular items / What should I order / Recommendations
    if (q.includes('order') || q.includes('popular') || q.includes('recommend') || q.includes('best') || q.includes('special')) {
      const popular = allItems.filter((i) => i.isPopular).slice(0, 4);
      return {
        id,
        sender: 'ASSISTANT',
        text: 'Based on live customer orders today, here are our most loved signature creations:',
        timestamp,
        actionItems: popular,
        suggestions: ['Show Combos', 'Show Vegetarian Dishes', 'Show Today\'s Coupons']
      };
    }

    // 6. Intent: Vegetarian dishes
    if (q.includes('veg') || q.includes('vegetarian') || q.includes('shakahari')) {
      const veg = allItems.filter((i) => i.dietaryType === 'VEG').slice(0, 4);
      return {
        id,
        sender: 'ASSISTANT',
        text: 'Here are authentic 100% pure vegetarian delicacies crafted with pure ingredients:',
        timestamp,
        actionItems: veg,
        suggestions: ['Show Jain Food', 'Show Combos', 'Show Desserts']
      };
    }

    // 7. Intent: Jain dishes
    if (q.includes('jain') || q.includes('no onion') || q.includes('no garlic')) {
      const jain = allItems.filter((i) => i.dietaryType === 'JAIN').slice(0, 4);
      const text = jain.length > 0
        ? 'Here are our certified Jain options prepared strictly without onion, garlic, or root vegetables:'
        : 'Our kitchen prepares fresh Jain-friendly dishes upon request. You can also customize any curry with "No Onion & Garlic" note!';
      return {
        id,
        sender: 'ASSISTANT',
        text,
        timestamp,
        actionItems: jain,
        suggestions: ['Show Vegetarian Dishes', 'Call Staff for Special Prep']
      };
    }

    // 8. Intent: Spicy food
    if (q.includes('spicy') || q.includes('tikha') || q.includes('heat') || q.includes('mirchi')) {
      const spicy = allItems.filter((i) => i.spiceLevel === 'SPICY' || i.spiceLevel === 'MEDIUM').slice(0, 4);
      return {
        id,
        sender: 'ASSISTANT',
        text: 'Craving fiery spices? Here are our chef\'s boldest spicy dishes:',
        timestamp,
        actionItems: spicy,
        suggestions: ['Show Cold Drinks to Cool Down', 'Show Mild Dishes']
      };
    }

    // 9. Intent: Budget / Cheapest / Under ₹200 / ₹300
    if (q.includes('cheap') || q.includes('budget') || q.includes('price') || q.includes('under') || q.includes('200') || q.includes('300')) {
      const budget = [...allItems].sort((a, b) => a.price - b.price).slice(0, 4);
      return {
        id,
        sender: 'ASSISTANT',
        text: 'Here are our most budget-friendly specialties with unbeatable value:',
        timestamp,
        actionItems: budget,
        suggestions: ['Show Today\'s Coupons', 'Show Combos']
      };
    }

    // 10. Intent: Beverages & Drinks
    if (q.includes('drink') || q.includes('beverage') || q.includes('coffee') || q.includes('cold') || q.includes('lassi') || q.includes('shake')) {
      const drinks = allItems.filter((i) => i.categoryId === 'cat-beverages' || i.name.toLowerCase().includes('coffee') || i.name.toLowerCase().includes('chhas')).slice(0, 4);
      return {
        id,
        sender: 'ASSISTANT',
        text: 'Cool down with our chilled beverages, shakes, and traditional coolers:',
        timestamp,
        actionItems: drinks,
        suggestions: ['Show Desserts', 'View Cart']
      };
    }

    // 11. Intent: Desserts / Sweets
    if (q.includes('sweet') || q.includes('dessert') || q.includes('mithai') || q.includes('jamun') || q.includes('ice cream')) {
      const desserts = allItems.filter((i) => i.name.toLowerCase().includes('jamun') || i.description.toLowerCase().includes('dessert')).slice(0, 4);
      return {
        id,
        sender: 'ASSISTANT',
        text: 'Royal sweets and traditional desserts for a celebratory finish:',
        timestamp,
        actionItems: desserts.length > 0 ? desserts : allItems.slice(0, 3),
        suggestions: ['Show Drinks', 'Proceed to Checkout']
      };
    }

    // 12. Intent: Offers / Promo codes
    if (q.includes('offer') || q.includes('coupon') || q.includes('discount') || q.includes('promo')) {
      const coupons = db.coupons.filter((c) => c.isActive);
      const couponList = coupons.map((c) => `• ${c.code}: ${c.description} (Save ₹${c.discountValue})`).join('\n');
      return {
        id,
        sender: 'ASSISTANT',
        text: `Active promo coupons available right now:\n\n${couponList}\n\nTap below to copy or view your cart to apply!`,
        timestamp,
        suggestions: ['Show Combos', 'View Cart', 'Show Starters']
      };
    }

    // 13. Intent: Payment methods
    if (q.includes('pay') || q.includes('payment') || q.includes('upi') || q.includes('card') || q.includes('cash')) {
      return {
        id,
        sender: 'ASSISTANT',
        text: 'We accept:\n1. 📲 UPI Dynamic QR (GPay / PhonePe / Paytm)\n2. 💳 Credit / Debit Cards (Tap & Pay POS)\n3. 💵 Cash at Pickup Counter 1\n\nAll payments are processed securely in real-time.',
        timestamp,
        suggestions: ['Proceed to Checkout', 'Show Popular Dishes']
      };
    }

    // 14. Intent: Prep time / Wait time
    if (q.includes('time') || q.includes('wait') || q.includes('ready') || q.includes('how long')) {
      return {
        id,
        sender: 'ASSISTANT',
        text: 'Current average kitchen preparation time is ~10-15 minutes. Once your order is placed, you will receive a Live Token with instant voice announcement when ready!',
        timestamp,
        suggestions: ['Start Ordering', 'Show Combos']
      };
    }

    // Fallback: General keyword matching
    const directMatch = allItems.filter((i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)).slice(0, 4);
    if (directMatch.length > 0) {
      return {
        id,
        sender: 'ASSISTANT',
        text: `Here is what I found for "${query}":`,
        timestamp,
        actionItems: directMatch,
        suggestions: ['Show Combos', 'Show Vegetarian Dishes', 'View Cart']
      };
    }

    // Default friendly assistant response
    return {
      id,
      sender: 'ASSISTANT',
      text: `I'm your JAMANVAAR Food Assistant! You can ask me for recommendations, vegetarian or Jain dishes, spicy food, value combos, or active coupons. How can I help with your order?`,
      timestamp,
      actionItems: allItems.slice(0, 3),
      suggestions: ['Show Starters', 'Show Combos', 'Show Pure Veg', 'Show Active Coupons']
    };
  }
}
