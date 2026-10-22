export type RestaurantPageTemplate = 'HERITAGE' | 'CAFE' | 'MODERN' | 'INDIAN';
export type RestaurantPageSection = 'FEATURED' | 'ABOUT' | 'GALLERY' | 'VISIT';
export const PAGE_LANGUAGES: Record<string, string> = {
  en: 'English',
  hi: 'हिन्दी',
  gu: 'ગુજરાતી',
  mr: 'मराठी',
  ta: 'தமிழ்',
  te: 'తెలుగు',
  kn: 'ಕನ್ನಡ',
  bn: 'বাংলা'
};
export const PAGE_TRANSLATED_FIELDS = ['title', 'tagline', 'welcome', 'about', 'hours', 'notice', 'footer'] as const;
export type PageTranslation = Partial<Record<(typeof PAGE_TRANSLATED_FIELDS)[number], string>>;
export type PageEngagementAction = 'PAGE_VIEW' | 'MENU_OPEN' | 'CALL_CLICK' | 'WHATSAPP_CLICK' | 'DIRECTIONS_CLICK' | 'INSTAGRAM_CLICK' | 'REVIEW_CLICK';
export interface RestaurantPageContent {
  businessHours?: RestaurantBusinessHours | null;
  seo?: { title: string; description: string; imageUrl: string };
  translations?: Record<string, PageTranslation>;
  defaultLanguage?: string;
  noticeStart?: string;
  noticeEnd?: string;
  engagementEnabled?: boolean;
  heroPositionX?: number;
  enabled: boolean;
  entryMode: 'MENU' | 'PAGE';
  template: RestaurantPageTemplate;
  title: string;
  tagline: string;
  welcome: string;
  about: string;
  accent: string;
  logoUrl: string;
  heroUrl: string;
  heroPosition: number;
  gallery: Array<{ url: string; caption: string }>;
  featuredItemIds: string[];
  sections: RestaurantPageSection[];
  phone: string;
  whatsapp: string;
  instagram: string;
  mapsUrl: string;
  reviewUrl: string;
  address: string;
  hours: string;
  notice: string;
  footer: string;
  testimonials: Array<{ quote: string; author: string }>;
  press: Array<{ label: string; url: string }>;
}
export const DEFAULT_RESTAURANT_PAGE: RestaurantPageContent = {
  businessHours: null,
  seo: { title: '', description: '', imageUrl: '' },
  translations: {},
  defaultLanguage: 'en',
  noticeStart: '',
  noticeEnd: '',
  engagementEnabled: false,
  heroPositionX: 50,
  enabled: false,
  entryMode: 'MENU',
  template: 'HERITAGE',
  title: '',
  tagline: '',
  welcome: '',
  about: '',
  accent: '#A84816',
  logoUrl: '',
  heroUrl: '',
  heroPosition: 50,
  gallery: [],
  featuredItemIds: [],
  sections: ['FEATURED', 'ABOUT', 'GALLERY', 'VISIT'],
  phone: '',
  whatsapp: '',
  instagram: '',
  mapsUrl: '',
  reviewUrl: '',
  address: '',
  hours: '',
  notice: '',
  footer: '',
  testimonials: [],
  press: []
};
export interface RestaurantPageDish {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  price: number;
  allergens?: string[];
  categoryId?: string;
  translations?: Record<string, { name: string; description?: string }>;
}
export interface RestaurantPageCategory { id: string; name: string; translations?: Record<string, {name: string}> }
export interface RestaurantHoursInterval { start: string; end: string }
export interface RestaurantBusinessHours {
  timezone: string;
  weekly: Array<{ day: number; intervals: RestaurantHoursInterval[] }>;
  exceptions: Array<{ date: string; intervals: RestaurantHoursInterval[] }>;
}
export interface RestaurantPageView {
  loyaltyEnabled?: boolean;
  categories?: RestaurantPageCategory[];
  trackingSlug?: string | null;
  /** Where this branch's own menu-only (tableless) ordering code sends a guest, if one exists --
   * the real cart/checkout flow, not a second one built for this page. Null when no such code
   * has been generated yet, or for the restaurant-wide (no single branch) scope. */
  orderOnlineUrl?: string | null;
  /** Whether the Super Admin has granted this restaurant the table-reservations capability --
   * the reservation section only renders when true, same gating pattern as every other optional
   * QR capability (no data means no section, not an empty/broken one). */
  reservationsEnabled?: boolean;
  /** Every other active branch of this restaurant (including this one, flagged via isCurrent) --
   * null when there's only one branch, or the Super Admin hasn't granted the locations capability. */
  locations?: Array<{ branchId: string; name: string; isCurrent: boolean; address: string; hours: string; phone: string }> | null;
  content: RestaurantPageContent;
  restaurantName: string;
  branchName: string;
  table?: string | null;
  currency: string;
  publishedAt?: string;
}
export interface ReservationInput {
  name: string;
  phone: string;
  date: string;
  time: string;
  guests: number;
  note: string;
}
