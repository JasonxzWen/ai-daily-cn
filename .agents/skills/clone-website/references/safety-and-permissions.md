# Clone Website Safety And Permissions

Website cloning has legal, security, and trust boundaries. Apply these before extraction or implementation.

## Allowed

- Rebuilding a site the user owns or is authorized to migrate.
- Recovering a lost source implementation for a live site the user controls.
- Creating a learning or internal analysis artifact with replaced content and no brand impersonation.
- Using a public page as a visual reference while substituting original copy, neutral marks, and local assets.

## Not Allowed

- Phishing, login spoofing, impersonation, or credential collection.
- Copying third-party logos, brand assets, original copy, proprietary images, or tracking scripts without permission.
- Reproducing gated, authenticated, paywalled, or ToS-prohibited content.
- Deploying a clone in a way that confuses users about ownership or affiliation.

## Required Handling

- Keep source URL, inspection date, and permission assumption in `docs/research/SOURCE.md`.
- Replace third-party identity content unless the user clearly owns it.
- Disable or omit forms that could collect credentials or personal data.
- Do not preserve analytics, ad pixels, A/B testing scripts, or third-party embeds unless explicitly required and reviewed.
- In the handoff, state what was copied structurally versus what was replaced.
