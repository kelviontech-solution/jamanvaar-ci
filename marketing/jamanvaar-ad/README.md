# Jamanvaar restaurant technology advertisement

A 50-second introduction for Indian restaurant owners. Warm restaurant imagery, real product component captures, natural Indian English narration, licensed instrumental music, the official Super Admin logo and a clear demo invitation.

## Deliverables

- `output/jamanvaar-vertical.mp4` — 1080x1920, H.264/AAC, 30fps, 50 seconds.
- `output/jamanvaar-landscape.mp4` — 1920x1080, independently composed, same timing/audio.
- `output/jamanvaar-preview-540p.mp4` — smaller vertical review copy.
- `output/jamanvaar-ad.en.srt` — narration timing as a separate subtitle file. Short marketing headlines appear in the video; the full narration is not burned over the product screens.
- `config/video_config.json` — scene text, timing, contact details and assets.
- `config/media-manifest.json` — asset hashes, metadata, sources and missing material.
- `output/capture-results.json` and `*.validation.json` — actual capture/export checks.
- `REVIEW.md` — visual assessment, measurements and limitations.

The portrait layout reserves generous space below the main message for social-app overlays. The landscape layout is recomposed, not stretched. Do not crop away the closing music credit.

## Authenticity

The logo is copied unchanged from `cloud/super-admin-web/public/assets/branding/jamanvaar-logo.png`.

All product pictures are captured using Playwright from real repository components with fictional River House Kitchen data:

- POS: actual `PosBillingWorkspace`, `PosCatalog`, `PosCart` and store; dish selection updates the local cart. No billing/payment success is simulated.
- QR: actual guest application and menu, with isolated local HTTP responses; menu browsing only. No live order, payment or customer account claim.
- Kiosk: actual welcome and product-card components; welcome-to-product preview switch. These are component previews, not an activated terminal or successful checkout demonstration.
- KDS: actual `KdsTicketCard` components with fictional tickets. No incoming cloud order or kitchen state change is presented as verified.
- Management: actual QR owner workspace, including the Today attention panel, with isolated local responses. The on-screen labels identify local demo data.

No runnable Vartalaap/WhatsApp ordering application was found here. Its scene uses an AI-generated restaurant phone photograph and a product-introduction line from the user's brief. No chat conversation, bot action, payment or integration result is fabricated.

Three restaurant/phone/kitchen stills were generated using the built-in image tool. Gentle camera motion animates the stills; these are not generated live-action video clips. Originals and JPEG derivatives remain in `assets/restaurant-footage/`. No real customers or production restaurant records appear.

## Audio and credit

Voice: free online Microsoft Edge speech, `en-IN-PrabhatNeural`, generated per scene and mixed locally. The editable narration is in `assets/voiceover/NARRATION.md`.

Music: **Inspired — Kevin MacLeod (incompetech.com)**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), from the [official track listing](https://remote.incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1600022). The final video includes an on-screen credit and metadata credit. The 50-second excerpt is trimmed, faded, ducked under narration and normalized. Preserve the attribution when reposting; copy-ready wording is in `assets/music/ATTRIBUTION.txt`.

Font: Plus Jakarta Sans, SIL Open Font License 1.1; source and license in `assets/fonts/`. GSAP is vendored for offline composition playback. No external paid API was called.

## Reproduce

Requirements: repository Node dependencies, Node 22+, Python with Pillow available for optional contact sheets, FFmpeg/FFprobe, Chrome and internet for the pinned HyperFrames CLI. Product captures run against a temporary isolated Vite server on port 5470 and close it afterward. They do not start or migrate the production API/database.

From the repository root:

```powershell
node marketing/jamanvaar-ad/scripts/capture-products.cjs
python marketing/jamanvaar-ad/scripts/inspect_assets.py
```

Audio is already supplied. To regenerate speech, install the free package into the ignored local tools folder and run:

```powershell
python -m pip install --target marketing/jamanvaar-ad/.tools edge-tts
python marketing/jamanvaar-ad/scripts/prepare-audio.py --refresh
```

Rebuild and render either layout from the root:

```powershell
python marketing/jamanvaar-ad/scripts/render_video.py --format portrait --quality delivery
python marketing/jamanvaar-ad/scripts/render_video.py --format landscape --quality delivery
```

The helper rebuilds the selected editable layout, runs HyperFrames check, captures review frames, opens the background preview, renders, adds attribution metadata and validates. It uses the pinned `hyperframes@0.8.185`. It outputs `jamanvaar-vertical.mp4` or `jamanvaar-landscape.mp4`; portrait also creates the smaller preview copy.

To add faststart and attribution metadata to a raw export:

```powershell
python marketing/jamanvaar-ad/scripts/finalize_video.py input.mp4 output.mp4
```

From `marketing/jamanvaar-ad`, open the editable project with `npm run dev`, or `npx hyperframes@0.8.185 preview --background`. The preview URL printed by the command is the local editing surface. `config/video_config.json` is the authoritative scene manifest; rebuilding regenerates HTML. Review changes in the editor before rebuilding if you have manually edited the composition files.

The user confirmed `kelviontech@gmail.com` in the conversation. No unverified telephone number or website was placed in the CTA. No production app source was changed to make this advertisement.
