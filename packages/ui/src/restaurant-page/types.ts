export type RestaurantPageTemplate = 'HERITAGE' | 'CAFE' | 'MODERN';
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
}
export const DEFAULT_RESTAURANT_PAGE: RestaurantPageContent = {
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
  footer: ''
};
export interface RestaurantPageDish {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  price: number;
  allergens?: string[];
}
export interface RestaurantPageView {
  trackingSlug?: string | null;
  content: RestaurantPageContent;
  restaurantName: string;
  branchName: string;
  table?: string | null;
  currency: string;
  publishedAt?: string;
}
