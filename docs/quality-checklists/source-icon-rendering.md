# Source Icon Rendering Checklist

Use this checklist when a daily report item should render a source icon but falls back to initials.

- [ ] High-frequency source names are present in `CACHED_SOURCE_ICONS`.
- [ ] Source URL domains are present in `CACHED_DOMAIN_ICONS` when domain fallback is expected.
- [ ] The rendered report was regenerated after changing the icon cache.
- [ ] The affected title renders an `img.inline-site-icon` before the link text.
- [ ] The icon `src` is a concrete image data URI or trusted favicon URL, not a generated initials SVG.
- [ ] The icon image is loaded and has non-zero rendered dimensions on desktop and mobile viewports.
- [ ] The public page quality checklist still passes after regeneration.
