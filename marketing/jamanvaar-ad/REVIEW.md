# Final review

## Creative choice

Followed the supplied restaurant-owner storyboard: natural Indian hospitality imagery, short product messages, actual product component captures, cream/teal/bronze styling and the unchanged Jamanvaar logo. The user's later direction reinforced a simple, rich, realistic marketing treatment. The alternative object-across-apps and abstract orchestration routes are recorded in `STORYLINES.md` and were not built.

These are AI-assisted motion advertisements: three generated photographic stills have gentle camera motion; captured UI is framed and revealed; kiosk preview changes to actual product cards. No generated live-action people footage is claimed.

## Corrections during review

- Removed duplicate headings caused by combining authored span lines with editable text bindings.
- Loaded the QR owner's product stylesheet in the isolated capture, correcting an oversized header logo.
- Corrected isolated asset routing so all five product captures load their logos and food photos.
- Added explicit scene depth order to crossfades; reviewed early and midpoint frames to remove stale prior-scene overlays.
- Replaced the oversized generated PNG playback sources with JPEG derivatives while preserving originals.
- Shortened narration for the brand, owner workspace and close so these beats do not need rushed speech.
- Changed the kitchen beat from a static card alone to illustrative kitchen photography followed by the actual ticket component.
- Used portrait detail crops for POS cart and KDS ticket to keep the useful part larger. Landscape preserves the wider context.

## What was checked

- Five capture scenarios completed: POS local cart selection, QR menu rendering, kiosk component preview switch, KDS ticket rendering and QR owner Today screen. Captures reported no browser runtime errors; every image on the captured final screens loaded.
- Both compositions passed HyperFrames lint, runtime, layout, motion and contrast gates with zero errors. One craft warning remains in each layout for the two 26px closing disclosure/credit lines. They are intentionally secondary, held for almost seven seconds, and visually inspected; main headlines and the CTA use larger text.
- Reviewed scene beginnings, midpoints, cut seams and phone-scale contact sheets; then inspected final exported contact sheets. The final MP4s were decoded fully and checked for codec, frame size, frame rate, duration, audio presence, black-frame runs and clipping. Exact values are in their validation JSON files.
- Sound was measured, not listened to. The vertical export measured about -16.77 LUFS integrated and -4.42 dBTP; the preview is about -16.79 LUFS. Narration uses a synthetic Indian English voice, not a recorded human presenter.

## Boundaries and weakest shot

WhatsApp/Vartalaap is the weakest proof beat: no runnable application or authentic chat recording was found, so it is a clearly illustrative phone scene using the user's product positioning. An authentic Vartalaap ordering capture would make that scene more concrete. No bot behavior, successful order, payment or live integration is shown.

The POS and KDS screens are component captures, not verified terminal operations. QR and owner screens use isolated transport with fictional data. Actual payment, printer, phone-delivery and cross-device order synchronization are outside this marketing capture. Plan wording explicitly avoids saying every product is included.

No production source, production data, authentication or database schema was changed to produce the film. No paid API was used. Preserve the included Kevin MacLeod CC BY 4.0 attribution when reposting the video.
