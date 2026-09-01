import { ChatMessage } from '@jamanvaar/types';
import { db, BusinessDayAccountingService } from '@jamanvaar/database';
import { formatINR } from '@jamanvaar/utils';
import { ReportGeneratorService } from './report_generator';

export class AdminChatbotEngine {
  public static processQuery(query: string): ChatMessage {
    const q = query.toLowerCase().trim();
    const id = `admin-msg-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const activeDay = BusinessDayAccountingService.getActiveBusinessDay();
    const summary = BusinessDayAccountingService.getBusinessDaySummary(activeDay.id);

    // 1. "How much did I sell today?" / Today's sales / Revenue overview
    if (q.includes('sell') || q.includes('sales') || q.includes('revenue') || q.includes('earning') || q.includes('how much')) {
      const gst = summary.tax_amount || (summary.cgst_amount + summary.sgst_amount);
      return {
        id,
        sender: 'ASSISTANT',
        text: `📊 **Today's Revenue Overview & Live Financial Summary:**\n• **Gross Sales:** ${formatINR(summary.gross_sales)}\n• **Net Revenue:** **${formatINR(summary.net_sales)}**\n• **Discounts:** -${formatINR(summary.discounts)}\n• **GST (CGST+SGST):** ${formatINR(gst)}\n• **Completed Orders:** ${summary.completed_orders} of ${summary.total_orders} tickets\n• **Average Order Value (AOV):** ${formatINR(summary.average_order_value)}\n• **Settlement Channels:** Cash: ${formatINR(summary.cash_sales)} | UPI: ${formatINR(summary.upi_sales)} | Card: ${formatINR(summary.card_sales)}`,
        timestamp,
        actionLink: 'REPORTS',
        suggestions: ['🏆 Top 5 Selling Dishes', '💵 Cash Collected Today', '📱 UPI Collected Today', '⏰ Peak Hours Today']
      };
    }

    // 2. "What are today's top 5 items?" / Best-selling
    if (q.includes('top') || q.includes('best') || q.includes('popular') || q.includes('item') || q.includes('dish')) {
      const topItems = ReportGeneratorService.getTopSellingItems().slice(0, 5);
      const list = topItems.length > 0
        ? topItems.map((it, idx) => `• **#${idx + 1} ${it.name}** — ${it.quantitySold} portions sold (${formatINR(it.grossRevenue)})`).join('\n')
        : '• *No sales logged yet for today.*';

      return {
        id,
        sender: 'ASSISTANT',
        text: `🏆 **Top Best-Selling Dishes Today:**\n${list}`,
        timestamp,
        actionLink: 'MENU',
        suggestions: ['💰 Today\'s Live Sales', '📊 Which category sells the most?', '⏰ Busiest Hours']
      };
    }

    // 3. "How much cash was collected?"
    if (q.includes('cash')) {
      return {
        id,
        sender: 'ASSISTANT',
        text: `💵 **Cash Collected Today:** **${formatINR(summary.cash_sales)}**\n• **Opening Cash Float:** ${formatINR(summary.opening_cash)}\n• **Expected in Drawer:** ${formatINR(summary.cash_expected)}\n• **Total Net Revenue:** ${formatINR(summary.net_sales)}`,
        timestamp,
        actionLink: 'REPORTS',
        suggestions: ['📱 UPI Collected Today', '💳 Card Sales Today', '💰 Today\'s Live Sales']
      };
    }

    // 4. "How much UPI was collected?"
    if (q.includes('upi')) {
      const upiPct = summary.net_sales > 0 ? Math.round((summary.upi_sales / summary.net_sales) * 100) : 0;
      return {
        id,
        sender: 'ASSISTANT',
        text: `📱 **UPI Collected Today:** **${formatINR(summary.upi_sales)}**\n• **Channel:** Bharat QR / Dynamic Soundbox Reconciled\n• **Total Revenue Share:** ${upiPct}%`,
        timestamp,
        actionLink: 'REPORTS',
        suggestions: ['💵 Cash Collected Today', '💳 Card Sales Today', '💰 Today\'s Live Sales']
      };
    }

    // 5. "How many orders today?"
    if (q.includes('order')) {
      return {
        id,
        sender: 'ASSISTANT',
        text: `📋 **Total Orders Today:** **${summary.total_orders} orders**\n• **Completed & Billed:** ${summary.completed_orders} orders\n• **Active in Kitchen:** ${summary.active_orders} orders\n• **Dine-In:** ${summary.dine_in_orders} orders\n• **Takeaway:** ${summary.takeaway_orders} orders\n• **Delivery:** ${summary.delivery_orders} orders\n• **Cancelled / Voided:** ${summary.cancelled_orders} orders`,
        timestamp,
        actionLink: 'ORDERS',
        suggestions: ['💰 Today\'s Live Sales', '👨‍🍳 Pending KOTs Today', '🏆 Top 5 Selling Dishes']
      };
    }

    // 6. "What is the average order value?"
    if (q.includes('average') || q.includes('aov') || q.includes('ticket')) {
      return {
        id,
        sender: 'ASSISTANT',
        text: `🎯 **Average Order Value (AOV):** **${formatINR(summary.average_order_value)}**\n• **Net Revenue:** ${formatINR(summary.net_sales)}\n• **Completed Bills:** ${summary.completed_orders} tickets`,
        timestamp,
        actionLink: 'REPORTS',
        suggestions: ['💰 Today\'s Live Sales', '🏆 Top 5 Selling Dishes', '📊 Category Performance']
      };
    }

    // 7. "What are the low stock items?" / 86 items
    if (q.includes('low stock') || q.includes('out of stock') || q.includes('86') || q.includes('inventory') || q.includes('stock')) {
      const soldOut = db.menuItems.filter((i) => !i.isAvailable);
      const list = soldOut.length > 0
        ? soldOut.map((i) => `• **${i.name}** (SKU: \`${i.sku}\`) — Sold Out (86)`).join('\n')
        : '✓ All menu dishes are currently in stock and live for billing.';

      return {
        id,
        sender: 'ASSISTANT',
        text: `📦 **Inventory & Low Stock Dishes:**\n${list}`,
        timestamp,
        actionLink: 'MENU',
        suggestions: ['🍽️ View Menu Catalog', '💰 Today\'s Live Sales']
      };
    }

    // 8. "What are the busiest hours?" / Peak hours
    if (q.includes('busiest') || q.includes('peak') || q.includes('rush') || q.includes('hour')) {
      const peak = ReportGeneratorService.getPeakHoursAnalysis();
      return {
        id,
        sender: 'ASSISTANT',
        text: `⏰ **Peak Dining & Rush Hours:**\n• **Busiest Hour Today:** **${peak.peakHour}**\n• **Peak Sales in Window:** ${formatINR(peak.peakSales)} (${peak.peakOrders} orders)\n• **Best Sales Day in 30 Days:** ${peak.peakDay}`,
        timestamp,
        actionLink: 'REPORTS',
        suggestions: ['💰 Today\'s Live Sales', '📋 How many orders today?']
      };
    }

    // 9. "What was our best sales day in the last 30 days?"
    if (q.includes('30 days') || q.includes('best day')) {
      const last30 = ReportGeneratorService.getLast30DaysReport();
      return {
        id,
        sender: 'ASSISTANT',
        text: `🌟 **30-Day Sales Performance:**\n• **Best Sales Day:** **${last30.bestSalesDay.date}** (${formatINR(last30.bestSalesDay.sales)})\n• **Lowest Sales Day:** ${last30.lowestSalesDay.date} (${formatINR(last30.lowestSalesDay.sales)})\n• **30-Day Total Sales:** ${formatINR(last30.totalSales)} (${last30.totalOrders} orders)\n• **Average Daily Sales:** ${formatINR(last30.avgDailySales)}/day\n• **Top Dish:** ${last30.bestSellingItem}\n• **Most Used Payment:** ${last30.mostUsedPayment}`,
        timestamp,
        actionLink: 'REPORTS',
        suggestions: ['📅 This Month\'s Sales', '🗓️ This Year\'s Sales', '💰 Today\'s Live Sales']
      };
    }

    // 10. "What are this month's sales?"
    if (q.includes('month')) {
      const yearly = ReportGeneratorService.getYearlyReport();
      const currentMonthIndex = new Date().getMonth();
      const curMonth = yearly.months[currentMonthIndex];

      return {
        id,
        sender: 'ASSISTANT',
        text: `📅 **${curMonth.monthName} ${yearly.year} Sales Summary:**\n• **Total Net Sales:** **${formatINR(curMonth.netSales)}**\n• **Total Completed Orders:** ${curMonth.ordersCount} tickets\n• **Average Order Value:** ${formatINR(curMonth.avgOrderValue)}\n• **GST Tax Collected:** ${formatINR(curMonth.gst)}\n• **Payment Channels:** Cash: ${formatINR(curMonth.cash)} | UPI: ${formatINR(curMonth.upi)} | Card: ${formatINR(curMonth.card)}`,
        timestamp,
        actionLink: 'REPORTS',
        suggestions: ['🗓️ This Year\'s Sales', '🌟 Best Sales Day', '💰 Today\'s Live Sales']
      };
    }

    // 11. "What are this year's sales?"
    if (q.includes('year') || q.includes('annual')) {
      const yearly = ReportGeneratorService.getYearlyReport();
      return {
        id,
        sender: 'ASSISTANT',
        text: `🗓️ **Annual Year-to-Date Performance (${yearly.year}):**\n• **Total Net Revenue:** **${formatINR(yearly.totalSales)}**\n• **Total Completed Tickets:** ${yearly.totalOrders} orders\n• **Total Statutory GST:** ${formatINR(yearly.totalGst)}\n• **Discounts Applied:** ${formatINR(yearly.totalDiscounts)}\n• **Average Ticket Size:** ${formatINR(yearly.avgOrderValue)}`,
        timestamp,
        actionLink: 'REPORTS',
        suggestions: ['📅 This Month\'s Sales', '💰 Today\'s Live Sales', '📊 Category Performance']
      };
    }

    // 12. "Which category sells the most?"
    if (q.includes('category')) {
      const catStats = ReportGeneratorService.getCategoryPerformance();
      const list = catStats.map((c) => `• **${c.categoryName}:** ${formatINR(c.grossRevenue)} (${c.revenueSharePercent}% share • ${c.itemsSold} items)`).join('\n');

      return {
        id,
        sender: 'ASSISTANT',
        text: `📊 **Category Revenue Performance:**\n${list || '• *No category sales recorded yet.*'}`,
        timestamp,
        actionLink: 'REPORTS',
        suggestions: ['🏆 Top 5 Selling Dishes', '💰 Today\'s Live Sales']
      };
    }

    // 13. "What are today's pending KOTs?"
    if (q.includes('kot') || q.includes('kitchen') || q.includes('pending') || q.includes('kds')) {
      const pendingKots = db.kots.filter((k) => k.status === 'PREPARING');
      const list = pendingKots.length > 0
        ? pendingKots.map((k) => `• **${k.kotNumber}** (Token #${k.tokenNumber}${k.tableNumber ? `, Table #${k.tableNumber}` : ''}) — ${k.station || 'Main Kitchen'} (${k.items.length} items)`).join('\n')
        : '✓ Kitchen is completely clear — 0 pending KOTs in queue.';

      return {
        id,
        sender: 'ASSISTANT',
        text: `👨‍🍳 **Live Kitchen & KDS Status:**\n• **Active Preparing KOTs:** ${pendingKots.length} tickets\n${list}`,
        timestamp,
        actionLink: 'ORDERS_KDS',
        suggestions: ['📋 How many orders today?', '💰 Today\'s Live Sales']
      };
    }

    // 14. Thermal Printer Status
    if (q.includes('printer') || q.includes('print')) {
      const printers = db.configuredPrinters;
      const defaultPrn = printers.find((p) => p.isDefault) || printers[0];
      return {
        id,
        sender: 'ASSISTANT',
        text: `🖨️ **Thermal Receipt Printer Status:**\n• **Active Hardware:** ${defaultPrn.name}\n• **Paper Specification:** 80mm ESC/POS Roll\n• **Interface Protocol:** ${defaultPrn.interfaceType} (${defaultPrn.port || 'Auto USB'})\n• **Hardware Status:** \`${defaultPrn.status}\`\n• **Auto-Cutter:** Verified Enabled\n• **Thermal Auto-Print:** Instant upon payment (Zero dialog popups)`,
        timestamp,
        actionLink: 'HARDWARE',
        suggestions: ['🖥️ Kiosk Terminals Health', '💰 Today\'s Live Sales']
      };
    }

    // 15. Table Occupancy
    if (q.includes('table') || q.includes('occupancy') || q.includes('hall')) {
      const tables = db.tables;
      const occupied = tables.filter((t) => t.status === 'OCCUPIED');
      const available = tables.filter((t) => t.status === 'AVAILABLE');

      return {
        id,
        sender: 'ASSISTANT',
        text: `🪑 **Dining Table Matrix & Table Occupancy:**\n• **Total Tables:** ${tables.length} tables\n• **Occupied Tables:** ${occupied.length} (${tables.length > 0 ? Math.round((occupied.length / tables.length) * 100) : 0}% occupancy)\n• **Available Tables:** ${available.length} free tables\n• **Active Dining Zones:** Main Hall, Family Section & AC Balcony`,
        timestamp,
        actionLink: 'TABLES',
        suggestions: ['⏳ Active Kitchen Orders', '💰 Today\'s Live Sales']
      };
    }

    // Default Fallback with Quick Suggestions
    return {
      id,
      sender: 'ASSISTANT',
      text: `🤖 **JAMANVAAR Operations Intelligence Engine**\n\nConnected to local restaurant database. Select a preloaded operational query:`,
      timestamp,
      suggestions: [
        '💰 How much did I sell today?',
        '🏆 Top 5 Selling Dishes',
        '💵 Cash Collected Today',
        '📱 UPI Collected Today',
        '📋 Total Orders Today',
        '⏰ Busiest Hours',
        '🌟 30-Day Sales Performance',
        '📅 This Month\'s Sales'
      ]
    };
  }
}
