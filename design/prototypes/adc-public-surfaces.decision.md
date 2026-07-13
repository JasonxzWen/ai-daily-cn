# ADC public surfaces recovery

## Accepted

- Keep the React/Astryx homepage and the effective-interact report renderer.
- Establish one repository-owned ADC token and public-surface skin shared by React and static output.
- Make status badges monochrome and communicate state with text and shape.
- Add keyboard-focus, loading, and error acceptance to the real React surface at the canonical `1280x900` desktop viewport.
- Organize the homepage by report edition and editorial story order: one lead, three secondary stories, then compact rows; event dates remain metadata instead of deciding edition membership.
- Bootstrap the homepage from a bounded `home.json` reader projection while retaining `articles.json` as an optional public data artifact.
- Keep Source Watch after the edition content and omit internal quality scores from reader-facing cards.

## Rejected

- Replacing the product with another generated landing page.
- Migrating reports and operations pages to a second React runtime.
- Keeping three active public visual systems and validating only their documentation.
- Treating `article.date` as the edition key or loading the full article archive for the initial homepage view.
- Reintroducing public search, mobile variants, or a new component library as part of the hierarchy correction.

## Translation Notes

- Translate the accepted visual rules into Astryx primitives and local CSS; generated prototype code is reference-only.
- Static report content and navigation remain unchanged while the shell receives ADC tokens and rules.
- `adc-public-surfaces.png` records the accepted edition-first React homepage at `1280x900`; current browser evidence also covers operations, official-blog, and generated-report surfaces at that viewport only. Earlier narrow-screen evidence is superseded by the desktop-only policy.
- The user-provided black-glasses character image is translated into a six-size ICO only; the large source PNG is not duplicated in the repository.

## Favicon provenance

- Source: user-supplied 1254×1254 PNG in the 2026-07-13 task; SHA-256 `f311c669c2c207f4b09068f76e34b1fc8e1befb8e06024639fb86c4133074a0d`.
- Translation: PNG frames at 16, 32, 48, 64, 128, and 256 pixels, packed into `apps/web/public/favicon.ico` without adding the 1.44 MB source file.
- Output: 77,920-byte ICO; SHA-256 `ab469ad3008662915bff88ecb155aa9009f7ff48194cdc88d61b13184fcff26b`.

## Risks

- Existing effective-interact selectors are broad; the ADC layer must be scoped with a public-surface data attribute.
- Vendor classes can change, so browser-computed color checks remain part of acceptance.
- Historical reports are regenerated only to add the shared favicon link; their content structure remains unchanged.
