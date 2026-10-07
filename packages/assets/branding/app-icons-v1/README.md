# JAMANVAAR product icon pack

Five matching hospitality icons, generated with the built-in `image_gen` tool from the prompt set in `prompts.json`. Each mark depicts a golden serving cloche and tray, a presenting hand with a navy sleeve and gold cuff, and three curling steam wisps. No text or wordmark is baked into the artwork. The restaurant's existing header logos remain separate.

| Application | Accent | Asset folder |
| --- | --- | --- |
| POS | Emerald `#0E4D3C` | `pos/` |
| Restaurant Admin (including its Kiosk Admin workspace) | Navy `#0B253A` | `restaurant-admin/` |
| Captain | Amber `#B5651D` | `captain/` |
| KDS | Terracotta `#9A3324` | `kds/` |
| Kiosk | Blue `#1E6FA8` | `kiosk/` |

Open `preview.html` or `preview.png` to compare all five at launcher and taskbar sizes.

`variants/` also contains three 1024×1024 opaque navy master concepts: `classic-presenting.png` (used by the five-app family), `heritage-wide.png` (broader saffron dome and gold steam) and `modern-compact.png` (simpler hand and shorter, solid steam). These are review alternatives; changing the selected family is a separate deliberate swap. Their generation prompts are saved in `variants/prompts.json`.

Each application folder contains:

- `master-windows.png`: **1024×1024** with transparent rounded tile corners, suitable for desktop icon conversion.
- `master-opaque.png`: **1024×1024**, fully opaque square master for legacy mobile launchers and store assets.
- `icon.ico`: embedded PNG frames at **16, 24, 32, 48, 64, 128 and 256 px**.
- `background.png`: exact solid accent background for the adaptive launcher.
- `tauri-icon.json`: local Tauri icon-generator manifest with separate Android background, foreground and monochrome inputs.

`adaptive-foreground.png` and `adaptive-monochrome.png` are shared transparent launcher layers. The generated mark is scaled and centered within a 60dp circle on the 108dp layer, inside Android's guaranteed 66dp safe circle. This differs from simply rounding a square icon or baking a rounded tile into the foreground. Android 13+ themed icons have their own monochrome layer. See [Android's adaptive-icon guidance](https://developer.android.com/develop/ui/views/launch/icon_design_adaptive).

The five app `src-tauri/icons/` directories contain the matching Windows ICO, ICNS, PNG/StoreLogo sizes, Android resources for mdpi through xxxhdpi, v26/v33 adaptive XML, and opaque iOS sizes. PWA icons and favicons are copied to each app's `public/` directory. Manifests and icon links use relative application paths so `/pos/`, `/captain/`, `/kds/`, `/kiosk/` and the merged admin roots do not load another app's root favicon. Icon content hashes update browser cache URLs.

Recreate formats from the saved artwork without generating new images:

```powershell
node tooling/packaging/build_product_icons.mjs
node tooling/packaging/verify_product_icons.mjs
# Optional native Windows reader verification:
powershell -ExecutionPolicy Bypass -File tooling/packaging/verify_product_icons_windows.ps1
```

The normal image-preparation hooks run the lightweight `sync_product_icons.mjs` so shared branding preparation cannot permanently replace these with the old common icon. That synchronization preserves identical files without rewriting them.

`VERIFICATION.json` records checks for all five apps: master dimensions/alpha, all ICO frames, configured Tauri bundle paths, Android foreground clipping at each density, monochrome XML, opaque iOS icons and relative PWA paths. The art was visually checked at 16–48px. Tiny icons necessarily simplify the hand/steam detail; the cloche remains the primary silhouette.

All five web apps compile successfully with the updated icon/manifest links (`BUILD_RESULTS.json`). Native Windows `LoadImage` verification successfully decoded every ICO frame for all five applications. In the downloadable ZIP, each application's `platform/` folder contains its complete platform size set.

**Packaging limitation:** replacing source icon files does not change an already compiled EXE, installer or APK. Rebuild the relevant Tauri bundle and reinstall it to update embedded icons. Existing Windows shortcuts or Android launchers can retain cached icons until the new package is installed. This task prepares the assets; it does not claim to have built or installed new binaries or tested a physical Android launcher. APK project creation/signing is separate from icon preparation. If a generated Android project already exists, the packaging script copies the launcher resources to its `app/src/main/res/` folder.

Image generation is raster artwork in a flat-vector style. The SVG favicon compatibility file embeds the generated PNG; it is not an independently editable vector illustration.
