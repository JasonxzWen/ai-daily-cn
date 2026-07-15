always respond in Chinese unless the user explicitly asks for another language.

# Website Cloner Harness

This harness is for explicit, authorized website reconstruction and browser-verifiable report pages. Use it only when the user asks to clone, reverse-engineer, or rebuild a site they own or are authorized to reproduce.

## Operating Rules

- Start with `docs/research/SOURCE.md` and record the URL, capture date, permission assumption, and replacement-content requirement.
- Do not copy third-party logos, brand assets, proprietary copy, analytics, forms, or tracking scripts unless permission is explicit.
- Use `site/index.html` as the default output for lightweight smoke clones and reports.
- Keep generated screenshots in `docs/design-references/`.
- Run `npm run check` before handoff.

## Completion Evidence

Before finishing, record:

- source URL and inspection method;
- changed sections and replacement content;
- validation command output;
- desktop screenshot path;
- remaining visual or legal limitations.
