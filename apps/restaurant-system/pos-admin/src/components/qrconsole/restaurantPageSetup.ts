import { DEFAULT_RESTAURANT_PAGE, type RestaurantPageContent } from '../../../../../../packages/ui/src/restaurant-page/types';
import { restaurantOpeningStatus } from '../../../../../../packages/ui/src/restaurant-page/restaurant-hours';

/** Compare content, independent of the property order returned by the API. */
export function samePage(a: RestaurantPageContent, b: RestaurantPageContent) {
  return Object.keys(DEFAULT_RESTAURANT_PAGE).every(
    (key) => JSON.stringify(a[key as keyof RestaurantPageContent]) === JSON.stringify(b[key as keyof RestaurantPageContent])
  );
}

export function fillPageDetails(draft: RestaurantPageContent, restaurantName: string, address: string): RestaurantPageContent {
  return {
    ...draft,
    title: draft.title.trim() ? draft.title : restaurantName.slice(0, 100),
    welcome: draft.welcome.trim() ? draft.welcome : `Welcome to ${restaurantName}. Explore our menu and make yourself at home.`.slice(0, 400),
    address: draft.address.trim() ? draft.address : address.slice(0, 500)
  };
}

export function pagePublicationStatus(published: RestaurantPageContent | null, draft: RestaurantPageContent, accessible: boolean) {
  if (!accessible) return 'Access not included';
  if (!published) return 'Not published';
  if (!samePage(published, draft)) return 'Changes not published';
  if (!published.enabled) return 'Page switched off';
  return 'Live · restaurant page';
}

/** Optional photos and contact links never block an information-only page. */
export function pagePublishIssue(draft: RestaurantPageContent): string | null {
  if(draft.businessHours&&!restaurantOpeningStatus(draft.businessHours))return 'Opening hours need valid opening and closing times and a restaurant timezone. Check Contact details → Opening status.';
  if (draft.noticeStart && draft.noticeEnd && Date.parse(draft.noticeEnd)<=Date.parse(draft.noticeStart)) return 'Notice end must be after its start. Check More options → Schedule your service notice.';
  if (!draft.enabled) return null;
  if (!draft.title.trim()) return 'Add a page heading before reviewing.';
  if (!draft.welcome.trim()) return 'Add a welcome message before reviewing.';
  return null;
}
