# Template dish photographs

These are AI-generated starter images of the named dishes, generated with the built-in OpenAI image tool. They are illustrations for onboarding; restaurant owners can replace them with photographs of their actual dishes.

`generation-plan.json` freezes each subject, description, dietary type, cuisine, category and affected templates. `metadata/*.json` records the individual WebP dimensions, byte count and SHA-256. `manifest.json` lists the packaged assets. The PNG originals remain in the image tool's generated-images directory; the apps use the optimised WebP copies.

Each of the 453 distinct dishes, 27 meal combos and 199 template categories uses a separate generation call and asset. The same named dish can occur in multiple templates; different dish names do not share photos. Every template category has its own separately generated editorial cover, showing a curated selection of its actual dishes. Category icons use the existing Lucide icon system.

The prompt for each dish follows this specification:

> Use case: product-mockup. Asset: a restaurant menu food photograph. Subject: {name}. Description: {description; for combos, named component dishes and their descriptions}. Cuisine: {cuisine}; category: {category}. {diet restriction}. Create one accurate, appetizing professional food photograph matching this exact dish and preparation, with appropriate Indian or regional serving vessels. Landscape 4:3, warm soft natural light, neutral ivory tabletop, food fills the composition, entire serving comfortably framed. No unrelated dishes, text, labels, logos, watermarks, people or hands. Save the image locally for packaging in the restaurant app.

Diet instructions specify no meat, fish, seafood or eggs for vegetarian subjects; no onion, garlic, root vegetables or meat for Jain subjects; no dairy, eggs, meat or honey for vegan subjects. Egg subjects exclude meat and fish. Non-vegetarian subjects require the explicitly named protein.

Category cover prompts include the restaurant niche, category description and up to three named dishes with their descriptions and dietary types. They request a cohesive arrangement of those dishes, tasteful regional serving vessels, a warm ivory tabletop, soft natural light and balanced editorial composition. Collage panels, repeated plates, unrelated dishes, text and logos are excluded. The later uniqueness batch additionally requests a distinct original composition for each exact subject and any explicitly described serving portions.

Visual review prompted five replacement generations: Plain Uttapam explicitly excludes vegetable toppings; Ghee Mini Podi Idli (14 Pcs) specifies two rows of seven idlis; Chocolate Brownie excludes ice cream and cream; Chocolate Ice Cream and Vanilla Ice Cream each specify exactly one scoop. The replacements keep their subject IDs and receive updated checksums. Contact sheets and individual replacement images were inspected before final packaging.

After packaging any new asset with `tooling/dev/pack_template_photo.mjs`, run `node tooling/dev/finalize_template_photos.mjs --complete` to check the generation plan and rebuild the browser catalogue and manifest. App prebuild/predev hooks run `tooling/dev/sync_description_photos.mjs`, which verifies checksums and copies photos to every frontend's public assets. QR Guest shares POS public assets. Public copies are ignored by Git; the canonical assets here must be committed and included in the Docker build context.
