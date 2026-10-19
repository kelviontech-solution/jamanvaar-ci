# Mobile refinement and recommended next improvements

## Changes made

- Shorter Heritage hero (510px minimum instead of 600px), with padding and type that adapt to narrow screens. Long content can expand rather than being clipped.
- A compact header with two-line restaurant identity, readable Order online action and a 44px navigation control. Very narrow screens omit the decorative monogram to preserve space for the actual name.
- Hero actions retain comfortable touch heights and wrap when needed.
- The mobile bottom action remains hidden while the hero is visible, appears after the hero scrolls away, and hides again when the footer enters view. This reduces duplicate buttons and keeps footer links clear.
- Form/search controls use 16px text on small layouts; reservation inputs have adequate height and width. Very narrow date/time/guest layouts stack into one column.
- The full-screen menu has separate header, scrolling content and order-action areas. The order action cannot cover dish entries. Search works across all published dishes; Enter dismisses the search field’s focus after filtering.
- Explicit keyboard focus wrapping keeps Tab/Shift+Tab within the menu. Escape closes it and returns focus to the visible trigger.
- Bottom actions include safe-area padding. Footer contact links have larger separated tap areas.
- The full menu remains absent from the landing-page scroll. Navbar Order online continues into the existing ordering screen; no second checkout was added.

The work changes presentation and navigation, not saved restaurant content, licenses, payments or order records.

## Most useful next improvements

| Priority | Improvement | Existing support / remaining work |
| --- | --- | --- |
| 1 | **Use stronger restaurant content** | The editor already supports cover, gallery, story and featured dishes. Choose a real dining-room or hero food photo, a short distinctive headline, and three dishes from different categories. The demo currently starts with three pizzas because they are its first published dishes; an owner can select more varied dishes today. |
| 2 | **Category filters in the browse-only menu** | The actual ordering menu already has categories. Add those published categories to the standalone browsing view too, using the same menu data rather than maintaining another website catalogue. |
| 3 | **Structured opening hours and holiday exceptions** | Today’s page displays the owner’s opening-hours text. A trustworthy Open now / Closed / Next opens indicator needs structured branch hours and exceptions; it should not guess from free text. |
| 4 | **Restaurant-specific search and sharing previews** | Add restaurant/branch page titles, descriptions and social preview images with server-rendered metadata. A generic SPA title or client-only change is insufficient evidence that link previews and search indexing work. |
| 5 | **Translate the complete page interface** | Owner-entered translated content is supported. Extend translation to fixed labels such as Menu, Explore the menu, directions, reservation fields and menu-dialog messages for a consistent language experience. |

The largest immediate visual improvement is better owner-supplied photography and concise copy. The controls for that already exist in **QR Admin → Branding → Business Page**.

## Verification scope

The mobile browser pass checks the real local public page at 320, 360, 390 and 430 pixels, plus a 667×375 landscape viewport. Checks include hidden initial catalogue, all 40 dishes in the on-demand menu, search, viewport bounds, non-overlapping menu/footer, touch-target size, input font size, conditional bottom action, keyboard-scrollable signatures and navigation.

All four designs are checked at 320px and 390px using sample content with a long restaurant name. One 390px editor check uses isolated authentication/API transport to verify preview menu safety, draft save and reviewed publication. These are browser checks, not physical Safari/Android keyboard acceptance or a production deployment.

Successful scenarios are recorded in `mobile-results.json`. Screenshots use the `mobile-refinement-` prefix. Partial results from a failed run must not be interpreted as a full pass.

### Completed results

- **14/14 mobile browser scenarios passed:** five real-page viewport checks, eight design checks and one isolated editor check.
- **21/21 targeted tests passed.**
- The real same-tab ordering navigation check passed again: 40 dishes loaded, without creating an order or initiating payment.
- Guest and Restaurant Admin standard production builds passed; the existing admin bundle-size warning remains.
- Root TypeScript result is recorded with the other gate results in `mobile-verification-summary.json`.

Useful screenshots: `mobile-refinement-public-390.png`, `mobile-refinement-public-320.png`, `mobile-refinement-menu-390.png` and `mobile-refinement-heritage-320.png` (long restaurant name).

Changes are local. No production deployment, tenant publication, Git commit or push was performed.
