import { ChatMessage, MenuItem } from '@jamanvaar/types';
import { db } from '@jamanvaar/database';

export class CustomerChatbotEngine {
  /**
   * Process a customer inquiry and return actionable suggestions with real menu items & combos
   */
  public static processQuery(query: string, options: { paymentMethods?: string[] } = {}): ChatMessage {
    const q = query.toLowerCase().trim();
    const id = `msg-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const jainOnly = /jain|no onion|no garlic/.test(q);
    const nonVegOnly = /non[ -]?veg|chicken|mutton|fish/.test(q);
    const vegOnly = !nonVegOnly && /veg|vegetarian|shakahari/.test(q);
    const budgetMatch = q.match(/(?:under|below|less than)\s*(?:\u20b9|rs\.?|inr)?\s*(\d+)/);
    const budgetLimit = budgetMatch ? Number(budgetMatch[1]) : null;
    const allItems = db.menuItems.filter(it => it.isAvailable && it.stockQuantity !== 0 && it.isKioskEnabled !== false && (!it.salesChannels || it.salesChannels.includes('KIOSK')) &&
      (!jainOnly || it.dietaryType === 'JAIN') && (!nonVegOnly || it.dietaryType === 'NON_VEG') &&
      (!vegOnly || ['VEG', 'JAIN', 'VEGAN'].includes(it.dietaryType)) && (budgetLimit === null || it.price <= budgetLimit));
    const availableIds = new Set(allItems.map(i => i.id));
    const allCombos = db.combos.filter(c => c.isAvailable && [...c.mainItemIds, ...c.sideItemIds, ...c.drinkItemIds, ...c.dessertItemIds].every(id => availableIds.has(id)));
    const inCategory = (item: MenuItem, pattern: RegExp) => pattern.test(db.categories.find(c => c.id === item.categoryId)?.name ?? '') || pattern.test(item.name);
    // Dietary restrictions apply before every category, budget and combo branch.
    if (allItems.length === 0 && !/pay|coupon|offer|time|wait/.test(q)) return { id, sender: 'ASSISTANT', timestamp,
      text: "No available dishes match that request in this restaurant's menu. Ask staff about ingredients or special preparation.", suggestions: ['Call Staff for Special Prep'] };
    if (/allerg|gluten|nut.free|dairy.free/.test(q)) return { id, sender: 'ASSISTANT', timestamp,
      text: 'Please check dish allergen details and speak with staff. This menu guide cannot verify preparation or cross-contact safety.', suggestions: ['Call Staff for Special Prep'] };
    if (jainOnly && !/starter|main|curry|bread|combo|budget|under|below/.test(q)) return { id, sender: 'ASSISTANT', timestamp,
      text: 'These dishes are marked Jain by the restaurant. Confirm any special dietary requirements with staff.', actionItems: allItems.slice(0, 6), suggestions: ['Show Jain Starters', 'Call Staff for Special Prep'] };
    if (nonVegOnly && !/starter|main|curry|bread|combo|budget|under|below/.test(q)) return { id, sender: 'ASSISTANT', timestamp,
      text: 'Here are the available non-vegetarian dishes matching your request.', actionItems: allItems.slice(0, 6), suggestions: ['Show Starters', 'View my cart'] };

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
      const starters = allItems.filter((i) => inCategory(i, /starter|appetizer|snack|farsan|tikka|kebab/i)).slice(0, 4);
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
      const biryanis = allItems.filter((i) => inCategory(i, /biryani|rice|pulao/i)).slice(0, 4);
      return {
        id,
        sender: 'ASSISTANT',
        text: 'Fragrant, slow-cooked Dum Biryanis infused with saffron and royal spices:',
        timestamp,
        actionItems: biryanis,
        suggestions: ['Add Raita Pairing', 'Show Starters', 'Show Combos']
      };
    }

    // 3. Intent: Main Course / Curries
    if (q.includes('main') || q.includes('curry') || q.includes('paneer') || q.includes('dal') || q.includes('gravy')) {
      const mains = allItems.filter((i) => inCategory(i, /main|curry|curries|shaak|paneer|dal|pizza|pasta/i)).slice(0, 4);
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
      const breads = allItems.filter((i) => inCategory(i, /bread|naan|roti|rotli|bhakri|thepla|kulcha|paratha/i)).slice(0, 4);
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
      const popular = [...allItems].sort((a, b) => Number(b.isPopular) - Number(a.isPopular)).slice(0, 4);
      return {
        id,
        sender: 'ASSISTANT',
        text: 'Here are our most loved signature creations, picked by our chefs:',
        timestamp,
        actionItems: popular,
        suggestions: ['Show Combos', 'Show Vegetarian Dishes', 'Show Today\'s Coupons']
      };
    }

    // 6. Intent: Vegetarian dishes
    if (q.includes('veg') || q.includes('vegetarian') || q.includes('shakahari')) {
      const veg = allItems.filter((i) => ['VEG', 'JAIN', 'VEGAN'].includes(i.dietaryType)).slice(0, 4);
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
        : 'No dishes are currently marked Jain. Ask staff about preparation before ordering.';
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
    if (q.includes('cheap') || q.includes('budget') || q.includes('price') || q.includes('under') || q.includes('below') || q.includes('200') || q.includes('300')) {
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
      const drinks = allItems.filter((i) => inCategory(i, /beverage|drink|coffee|chhas|lassi|shake/i)).slice(0, 4);
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
      const desserts = allItems.filter((i) => inCategory(i, /sweet|dessert|mithai|jamun|ice cream|basundi|shrikhand/i)).slice(0, 4);
      return {
        id,
        sender: 'ASSISTANT',
        text: 'Royal sweets and traditional desserts for a celebratory finish:',
        timestamp,
        actionItems: desserts,
        suggestions: ['Show Drinks', 'Proceed to Checkout']
      };
    }

    // 12. Intent: Offers / Promo codes
    if (q.includes('offer') || q.includes('coupon') || q.includes('discount') || q.includes('promo')) {
      const coupons = db.coupons.filter(c => c.isActive && new Date(c.validFrom).getTime() <= Date.now() && new Date(c.validUntil).getTime() >= Date.now() && (c.usageLimit == null || c.usageCount < c.usageLimit));
      const couponList = coupons.map((c) => `• ${c.code}: ${c.description} (Save ${c.discountType === 'PERCENTAGE' ? `${c.discountValue}%` : `₹${c.discountValue}`})`).join('\n');
      return {
        id,
        sender: 'ASSISTANT',
        text: coupons.length ? `Active promo coupons available right now:\n\n${couponList}\n\nView your cart to apply. Minimum spend and coupon terms apply.` : 'There are no active promo coupons right now.',
        timestamp,
        suggestions: ['Show Combos', 'View Cart', 'Show Starters']
      };
    }

    // 13. Intent: Payment methods
    if (q.includes('pay') || q.includes('payment') || q.includes('upi') || q.includes('card') || q.includes('cash')) {
      return {
        id,
        sender: 'ASSISTANT',
        text: options.paymentMethods?.length ? `Available payment options: ${options.paymentMethods.join(', ')}. Choose a method at checkout.` : 'The checkout screen shows the payment methods currently available at this restaurant.',
        timestamp,
        suggestions: ['Proceed to Checkout', 'Show Popular Dishes']
      };
    }

    // 14. Intent: Prep time / Wait time
    if (q.includes('time') || q.includes('wait') || q.includes('ready') || q.includes('how long')) {
      // Real average, computed from actual KOT createdAt -> readyAt gaps
      // today, instead of a fixed "~10-15 minutes" guess.
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const completedToday = (db.kots || []).filter(
        (k) => k.readyAt && new Date(k.createdAt) >= todayStart
      );
      const avgMinutes = completedToday.length > 0
        ? Math.round(
            completedToday.reduce(
              (acc, k) => acc + (new Date(k.readyAt!).getTime() - new Date(k.createdAt).getTime()) / 60000,
              0
            ) / completedToday.length
          )
        : null;

      const prepTimeText = avgMinutes !== null
        ? `Today's average kitchen preparation time is ~${avgMinutes} minutes`
        : 'Not enough completed kitchen tickets are available to estimate preparation time';

      return {
        id,
        sender: 'ASSISTANT',
        text: `${prepTimeText}. Your order token is shown after placing the order. Please follow the restaurant's pickup instructions.`,
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
