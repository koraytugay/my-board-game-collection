# Board Game Stores

## Active Stores in Pipeline

Canada:
- BoardGameBliss: https://www.boardgamebliss.com (Shopify)
- 401 Games: https://store.401games.ca (Shopify)
- LVLUP Games: https://www.lvlupgames.ca (Shopify)
- As des Jeux: https://www.asdesjeux.com (Shopify)
- Great Boardgames: https://www.greatboardgames.ca (HTML)
- Meeplemart: https://meeplemart.com (HTML)
- KB Hobbies: https://kbhobbies.com (Square Online / REST API)
- Amazon.ca: https://www.amazon.ca (Puppeteer)
- Wood for Sheep: https://www.woodforsheep.ca (Shopify)
- J&J Cards: https://jjcards.com (Custom Sitemap / HTML)
- Boardgames.ca: https://boardgames.ca (Ecwid JSON API)
- Screen Free Games: https://screenfreegames.com (Shopify)
- All Systems Go: https://allsystemsgo.games (Shopify)
- Tabletop Cafe: https://www.tabletopcafe.ca (Shopify)
- Elevated Board Games: https://elevatedboardgames.com (Custom Sitemap / HTML)
- Dice Hollow: https://www.dicehollow.com (Shopify)
- La Pioche: https://boutiquelapioche.com (Shopify)
- Always Games: https://alwaysgames.ca (Shopify)
- Legends Warehouse: https://legendswarehouse.ca (Shopify)
- Board Game Bandit: https://boardgamebandit.ca (Shopify)
- The Gamer's Table: https://gamerstable.ca (Shopify) - Whitby/Oshawa, ON
- Game Shack: https://www.gameshack.ca (Shopify) - Toronto, ON
- Dragons Den Games: https://dragonsdengames.com (Shopify) - Saskatoon, SK
- La Ribouldingue: https://www.laribouldingue.ca (Shopify) - Vaudreuil-Dorion, QC (often stocks French editions)

United States:
- Miniature Market: https://www.miniaturemarket.com (HTML)
- Cardhaus Games: https://www.cardhaus.com (HTML)
- The Game Steward: https://thegamesteward.com (Shopify)

United Kingdom & Europe:
- Zatu Games: https://zatu.com (Shopify)
- Chaos Cards: https://www.chaoscards.co.uk (Custom)
- Philibert: https://www.philibertnet.com (Custom)

Marketplace:
- BGG Market: https://boardgamegeek.com/market (BGG Geekdo API)


## Removed Stores (Do NOT Add Back)

The following stores were evaluated, tracked, and permanently removed due to having zero relevant inventory or unusable catalogs. **Do not re-add them to the pipeline:**

1. **Face to Face Games** (https://facetofacegames.com - 🇨🇦)
   - Reason: 0 games in stock across entire wanted and like-to-have lists. Focuses predominantly on Magic: The Gathering and TCGs rather than modern board games.
2. **Obsidian Games** (https://obsidiangames.ca - 🇨🇦)
   - Reason: 0 games in stock / not listed across entire list. Extremely sparse board game inventory.
3. **Poké Jeux** (https://www.pokejeux.ca - 🇨🇦)
   - Reason: 0 games in stock / not carried (0/22 across Want to Buy and Like to Have lists). Primarily focused on Pokémon and TCG singles. Its ~9,000 item board game catalog consists almost entirely of on-demand distributor "Special Orders" (minimum 2-week lead time, non-cancellable, non-refundable final sale) rather than local shelf stock, and its huge TCG catalog causes high false-positive noise on common title keywords.
4. **Button Shy Games (Etsy)** (https://www.etsy.com/shop/ButtonShyGames - 🇺🇸)
   - Reason: Requires Etsy API key which is fragile with strict limits, and the store only produces their own wallet line (which is already covered by BGG Market or direct).
5. **Spelspul** (https://www.spelspul.nl - 🇳🇱)
   - Reason: 0 games in stock / not listed. European shipping is already covered much better by Philibert and Zatu.
6. **Limolin** (https://www.limolin.com - 🇨🇦)
   - Reason: 0 games in stock / not carried (0/24). A general home, kitchenware, and baby goods retailer with only ~10 mass-market games on the entire site. Triggers false matches on home decor (e.g., "Blink Wall Clock").
7. **Crowdfinder** (https://www.crowdfinder.be - 🇧🇪)
   - Reason: Does not ship to Canada. Tracked inventory is not purchasable for Canadian delivery. Never add back.
8. **Event Horizon Hobbies** (https://www.eventhorizonhobbies.com - 🇨🇦)
   - Reason: Only 1 game carried (1/22 across Want to Buy and Like to Have lists). Store focuses heavily on Magic: The Gathering, Pokémon, and Warhammer miniatures (237k+ items) with an extremely small board game catalog (~288 items total). Titles use custom prefixes ("Boardgames - ", "Board Game - [Publisher] - "), pricing is at or above MSRP, and its massive card singles catalog causes heavy false-positive search noise.
9. **Top Shelf Co** (https://topshelfco.ca - 🇨🇦)
   - Reason: 0 games in stock / not carried (0/63 across Want to Buy, Want in Trade, and Like to Have lists). Store focuses heavily on TCGs (Pokémon, Magic: The Gathering, Lorcana, Altered, Yu-Gi-Oh!), Warhammer miniatures, Gundam models, and paints/hobby supplies (8,200+ items total) with a small board game catalog (~379 items) limited to mass-market/evergreen titles. Its massive card singles and supplies catalog creates significant false-positive noise on common title keywords.
10. **uplay.it** (https://www.uplay.it - 🇮🇹)
   - Reason: Cloudflare returns HTTP 403 to every request from GitHub Actions runners (datacenter IPs), so the pipeline can never check it. It works from a home connection, so the code is fine. The block is IP-based, and Puppeteer will not get around it. Every check failed from when it was added (2026-10-06) until it was removed (2026-10-25). European stock is already covered by Philibert and Zatu. **Never add back.**



## Candidate Stores (To Add / Remove Later)

All candidate stores below have been verified to ship to Canada.

1. Hobbiesville
URL: https://hobbiesville.com
Location: Ottawa & Toronto, Ontario
Platform: Shopify (/search/suggest.json)
Currency: CAD ($)
Shipping: $9.99 flat-rate Canada-wide, free shipping over $175
Notes: Huge Canadian hobby store, deep inventory for board games and expansions.

2. Meeples Corner
URL: https://meeplescorner.co.uk
Location: United Kingdom
Platform: Shopify (/search/suggest.json)
Currency: GBP (£) / CAD display
Shipping: Tracked Royal Mail / Courier to Canada
Notes: European import specialist. Carries hard-to-find German and indie European games. Non-UK orders automatically have 20% UK VAT deducted at checkout.

3. Gamers Guild AZ
URL: https://gamersguildaz.com
Location: Arizona, USA
Platform: Shopify (/search/suggest.json)
Currency: USD ($)
Shipping: DDP (Delivered Duty Paid) shipping to Canada
Notes: Popular US community favorite. Duties and taxes are calculated and collected upfront at checkout so there are no surprise fees at the door. Supports order holds.

4. Game Knight Games
URL: https://gameknight.ca
Location: Winnipeg, Manitoba
Platform: Shopify (/search/suggest.json)
Currency: CAD ($)
Shipping: Canada-wide shipping
Notes: Manitoba's premier hobby store; strong inventory of Euro and solo games.

5. Black Knight Games
URL: https://blackknightgames.ca
Location: Hamilton, Ontario
Platform: Shopify (/search/suggest.json)
Currency: CAD ($)
Shipping: Canada-wide shipping
Notes: Established Ontario FLGS (est. 2007) with active online catalog and broad expansion stock.

6. Strategies Games & Hobbies
URL: https://strategiesgames.ca
Location: Vancouver, British Columbia
Platform: Shopify (/search/suggest.json)
Currency: CAD ($)
Shipping: Canada-wide shipping
Notes: Canada's oldest hobby shop (est. 1974). Great West Coast inventory for classic, indie, and niche games.

8. Rain City Games
URL: https://raincity.games
Location: Vancouver, British Columbia
Platform: Shopify (/search/suggest.json)
Currency: CAD ($)
Shipping: Canada-wide shipping
Notes: Vancouver indie specialist with strong curated selection of modern tabletop and solo games.

9. Ludifolie
URL: https://www.ludifolie.com
Location: France
Platform: PrestaShop (/recherche?controller=search&s=...)
Currency: EUR (€)
Shipping: International postal shipping to Canada
Notes: French discount retailer, often significantly undercutting Philibert on European editions.


## Evaluated and Not Added (2026-10-25 survey)

Candidates came from Board Game Oracle's Canadian store directory (https://boardgameoracle.com/en-CA/store) and UltraBoardGames' Canadian shop list. Each one was searched for all 30 Want to Buy + Like to Have games with the pipeline's real Shopify checker and matcher. Re-check one only if its catalogue changes.

- Too few of our games (1-4 of 30): WiredVillage Games (Pictou, NS), Studio Staja, A Muse N Games, Multizone, Across the Board Game Cafe (Toronto, WooCommerce)
- Shopify, but none of our games: Board Game Emporium, Brimstone Games, C.D. Jeux, Fusion Gaming, Cardboard Memories, Pandora's Boox, The Mana Lounge, Le Roi des Cartes (tcgandgames.com), Tadenac Games, Arctic Board Games (2 listed, 0 in stock)
- F.G. Bradley's (Pickering, ON): site search finds none of our games
- Blocked by Cloudflare (403 to scripts, like uplay): Imaginaire, Amazing Stories
- Online shop closed (Shopify 402): The Kessel Run (Ottawa), Meeples and Milkshakes
- No longer a store / site gone: Starlit Citadel (now a publisher), German Boardgame Company, Sentry Box (broken certificate), Hit Games, Board Game Warriors, Le Monde des Jeux, Rainy Day Games, Captain Boardgames
- Not Shopify, would need a custom scraper: Game Keeper Online, The Connection Games (CrystalCommerce), Snakes & Lattes (Squarespace), Fun Games Cafe, Espace Jeux (no WooCommerce API), Geek Stop, Board Games N More, Magic Stronghold, Supernova, Craving for a Game, Boutique La Revanche, Castle, Playtime Games (Ottawa), Pe Metawe, Owl's Hollow, Toys on Fire, Victory Pints


## How to Add or Remove Stores in Codebase

Every store is defined once, in `store-registry.js`. The pipeline (`check-availability.js`), the alert emails (`notify-availability.js`) and the website (`api.js`, `game-details.js`, every page) all read from it.

To add a **Shopify** store:
1. Add one entry to `STORE_REGISTRY` in `store-registry.js` with `platform: 'shopify'`, its `country` (Shopify localization, e.g. `'CA'`) and `currency` (`CAD`, `USD`, `GBP` or `EUR`). Nothing else is needed.

To add a **custom** store (HTML scraper, JSON API, Puppeteer, etc.):
1. Add its entry to `store-registry.js` with `platform: 'custom'`.
2. Put its parsing/fetching code in a new file under `lib/stores/`, and wire it up under the same key in `getCustomStoreConfigs()` in `lib/store-configs.js`.

The checker throws on startup if a custom store has no checker, or a checker has no registry entry.

To remove a store:
1. Delete its entry from `store-registry.js` (and, if it's custom, its `lib/stores/` file and its entry in `lib/store-configs.js`).
2. Remove its key from the availability JSON files.
3. Move it to **Removed Stores** above with the reason.

## Pipeline Code Layout

`check-availability.js` only runs the check loop. Everything else lives in `lib/`:

- `lib/store-configs.js`: how each store is checked (built from `store-registry.js`)
- `lib/stores/`: one file per custom store (HTML scrapers, APIs, Puppeteer), plus `shopify.js` for all Shopify stores
- `lib/matching.js`: decides whether a store product title is the game we want
- `lib/http.js`: fetching, redirects, 429 backoff and the shared Shopify cooldown
- `lib/deals.js`: price thresholds, baseline prices and deal detection
- `lib/skip-rules.js`: applies `skipped-matches.js`
- `lib/run-log.js`, `lib/run-stats.js`: the run log file and the end-of-run summary
