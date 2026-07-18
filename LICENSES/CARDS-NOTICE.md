# Playing-card artwork — attribution & license

The playing cards used in adFreeCell come from the **SVG-cards** project:

- Original author: **David Bellot** — <https://svg-cards.sourceforge.io/>
- Fork used here: **htdebeer/SVG-cards** — <https://github.com/htdebeer/SVG-cards>

## License

The card artwork is licensed under the **GNU Lesser General Public License,
version 2.1 (LGPL-2.1)**. The full license text is in
[`LGPL-2.1.txt`](./LGPL-2.1.txt).

## How adFreeCell uses it (and stays compliant)

- The **complete, unmodified** source of the card set is shipped with this
  repository as [`assets/svg-cards.svg`](../assets/svg-cards.svg). This is the
  "source code" of the artwork in the LGPL sense.
- For convenience and offline/`file://` use, that same SVG is also embedded in
  [`js/cards-sprite.js`](../js/cards-sprite.js). This is a verbatim embedding of
  the artwork — no modifications to the card designs were made.
- adFreeCell references individual cards by id (for example `spade_king`,
  `heart_1`) via SVG `<use>` elements. This is dynamic use of the library and
  does not create a derivative of the card artwork itself.
- Because the LGPL library is provided in full and unmodified, and this notice
  plus the license text accompany the distribution, the requirements of the
  LGPL-2.1 are satisfied while the adFreeCell game code remains under its own
  MIT license.

If you fork or redistribute adFreeCell, **keep `assets/svg-cards.svg`, this
notice and `LGPL-2.1.txt` in place**.

## Card id naming (for reference)

- Suits: `club`, `diamond`, `heart`, `spade`
- Ranks: `1` (Ace) … `10`, `jack`, `queen`, `king`
- Example ids: `heart_1` (Ace of Hearts), `spade_10`, `club_queen`
- Extras present in the source: `back`, `alternate-back`, `joker_black`,
  `joker_red` (unused by the game)
- Natural card size: 169.075 × 244.64
