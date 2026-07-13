# ADC public surfaces recovery

## Accepted

- Keep the React/Astryx homepage and the effective-interact report renderer.
- Establish one repository-owned ADC token and public-surface skin shared by React and static output.
- Make status badges monochrome and communicate state with text and shape.
- Add keyboard-focus, loading, and error acceptance to the real React surface at the canonical `1280x900` desktop viewport.

## Rejected

- Replacing the product with another generated landing page.
- Migrating reports and operations pages to a second React runtime.
- Keeping three active public visual systems and validating only their documentation.

## Translation Notes

- Translate the accepted visual rules into Astryx primitives and local CSS; generated prototype code is reference-only.
- Static report content and navigation remain unchanged while the shell receives ADC tokens and rules.
- `adc-public-surfaces.png` records the accepted React homepage; current browser evidence must cover operations, official-blog, and generated-report surfaces at `1280x900` only. Earlier narrow-screen evidence is superseded by the desktop-only policy.

## Risks

- Existing effective-interact selectors are broad; the ADC layer must be scoped with a public-surface data attribute.
- Vendor classes can change, so browser-computed color checks remain part of acceptance.
- Historical reports are not bulk rewritten in this slice; regenerated/current output proves the contract.
