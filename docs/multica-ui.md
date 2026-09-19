# Multica interface contract

Multica follows the pinned Mattermost v11.1.1 interface geometry and typography,
with its own Glacier palette. Keep its route outside the Mattermost shell and
its styles inside the shadow root. Shared appearance must not reintroduce shared
global theme state.

## Source of truth

The following upstream Sass is compiled directly into Multica's shadow stylesheet:

- `components/widgets/team_icon/team_icon.scss`: small team icons and active rings.
- `components/sidebar/sidebar_header/sidebar_header.scss`: 55px sidebar heading.
- `sass/layout/_headers.scss`: 56px content header, 16px Metropolis title and corners.

`scripts/apply-mattermost-customizations.mjs` resolves these imports against the
pinned submodule. The scoped variables in `ai_crew_console.scss` adapt their colors;
they do not change the document's Mattermost theme variables.

## Typography and layout

- Body: Open Sans, 14px / 20px, weight 400, antialiased rendering.
- Titles and workspace initials: Metropolis; content titles are 16px / 20px, weight 600.
- Use the font assets already loaded by the Mattermost application. Standalone
  previews must load those same assets; naming the font without loading it is insufficient.
- Desktop: 44px product bar, 65px workspace rail, 264px project navigation,
  55px sidebar heading, 56px content header, 12px content panel corners.
- Navigation rows: 32px, regular-weight labels, subtle active background and a
  narrow leading indicator. Bold labels do not imply unread content here.
- Issue rows keep identifiers, titles and status aligned. Status has a label as
  well as a colored indicator. Avoid oversized cards, pills and repeated bold titles.
- Below 1000px the navigation narrows; below 521px it stacks above the content.
  Long labels truncate without causing horizontal page overflow.

## Palette and interactions

Glacier swatch colors sampled from the user's reference:
ice blue `#7ED3FC`, blue-gray `#88B4CD`, lavender `#C8A0F0`.
The pale blue surfaces and darker text are supporting shades. The gray background
of the reference's preset picker is not part of this palette.

Both products use `ProductSwitcher`: exactly two destinations, one current item,
no checkmark or checkbox. Preserve keyboard navigation, Escape, focus return and
outside-click dismissal. Loading, empty and error states retain their accessible
text, and reduced-motion preferences disable decorative animation.

## Verification

Run focused component tests after applying the customization, root/BFF tests and
the Mattermost production build. In a browser, compare computed styles against
the actual Mattermost page, not only a standalone screenshot. Verify both product
switching directions, desktop and narrow layouts, and global CSS isolation.
