# TODO

- [x] model manager
    - [x] download models
- [x] automatically detect silence and trim it
- [x] create a semantic hash of segments (normalized to no punctuation, no case, etc) to reduce formatting difference updates on the UI
- [ ] harmonize `bits-ui` and Tailwind versions with pepo
    - scrybe is on `bits-ui@1.0.0-next.77` + Tailwind 3.4; pepo is on `bits-ui@2.18.0` + Tailwind 4. Pick one set across both apps so we can ship a shared `LanguageSwitcher` (and other UI primitives) from `@synthlabs/i18n` / `@synthlabs/ui` in the future.
    - Likely path: bring scrybe up to match pepo (bits-ui v2 + Tailwind v4). Do it together — bits-ui v2's component APIs assume Tailwind 4 token shapes.
    - Pairs with the Tailwind upgrade below; treat as one piece of work.
- [ ] upgrade tailwind v3 to v4
