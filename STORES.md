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
- Amazon.ca: https://www.amazon.ca (Custom)
- Wood for Sheep: https://www.woodforsheep.ca (Shopify)
- J&J Cards: https://jjcards.com (Shopify)
- Boardgames.ca: https://boardgames.ca (Shopify)
- Screen Free Games: https://screenfreegames.com (Shopify)
- All Systems Go: https://allsystemsgo.games (Shopify)
- Tabletop Cafe: https://www.tabletopcafe.ca (Shopify)
- Elevated Board Games: https://elevatedboardgames.com (Shopify)
- Dice Hollow: https://www.dicehollow.com (Shopify)
- La Pioche: https://boutiquelapioche.com (Shopify)
- Always Games: https://alwaysgames.ca (Shopify)
- Legends Warehouse: https://legendswarehouse.ca (Shopify)
- Board Game Bandit: https://boardgamebandit.ca (Shopify)

United States:
- Miniature Market: https://www.miniaturemarket.com (Custom)
- Cardhaus Games: https://www.cardhaus.com (HTML)
- The Game Steward: https://thegamesteward.com (Shopify)

United Kingdom & Europe:
- Zatu Games: https://www.zatugames.co.uk (HTML)
- Chaos Cards: https://www.chaoscards.co.uk (HTML)
- Philibert: https://www.philibertnet.com (Custom)
- Crowdfinder: https://www.crowdfinder.be (Custom)

Marketplace:
- BGG Market: https://boardgamegeek.com/market (BGG Geekdo API)


## Removed Stores (Do NOT Add Back)

The following stores were evaluated, tracked, and permanently removed due to having zero relevant inventory or unusable catalogs. **Do not re-add them to the pipeline:**

1. **Face to Face Games** (https://facetofacegames.com - 🇨🇦)
   - Reason: 0 games in stock across entire wanted and like-to-have lists. Focuses predominantly on Magic: The Gathering and TCGs rather than modern board games.
2. **Obsidian Games** (https://obsidiangames.ca - 🇨🇦)
   - Reason: 0 games in stock / not listed across entire list. Extremely sparse board game inventory.
3. **Poké Jeux** (https://www.pokejeux.ca - 🇨🇦)
   - Reason: 0 games in stock / not listed. Almost exclusively Pokémon/TCG products.
4. **Button Shy Games (Etsy)** (https://www.etsy.com/shop/ButtonShyGames - 🇺🇸)
   - Reason: Requires Etsy API key which is fragile with strict limits, and the store only produces their own wallet line (which is already covered by BGG Market or direct).
5. **Spelspul** (https://www.spelspul.nl - 🇳🇱)
   - Reason: 0 games in stock / not listed. European shipping is already covered much better by Philibert, Zatu, and Crowdfinder.
6. **Limolin** (https://www.limolin.com - 🇨🇦)
   - Reason: 0 games in stock / not carried (0/24). A general home, kitchenware, and baby goods retailer with only ~10 mass-market games on the entire site. Triggers false matches on home decor (e.g., "Blink Wall Clock").


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

7. Dragons Den Games
URL: https://dragonsdengames.com
Location: Saskatoon, Saskatchewan
Platform: Shopify (/search/suggest.json)
Currency: CAD ($)
Shipping: Canada-wide shipping
Notes: Saskatchewan's largest hobby store. Great alternative source when Ontario/Quebec stock runs dry.

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


## How to Add or Remove Stores in Codebase

To add a new store:
1. check-availability.js:
   - Add store config to storeConfigs (type: 'shopify', baseUrl, currencySymbol: '$', or custom checker).
2. notify-availability.js:
   - Add to STORE_META with display name and flag emoji icon.
3. stores.js:
   - Add to STORES array ({ key: '...', name: '🇨🇦 ...' }).
   - If foreign currency, add conversion in formatPrice().
4. wanttobuy.js:
   - Add to STORES array.
   - Add fallback entry { available: false, price: null, url: null } in fetchCollection().
   - If foreign currency, add conversion in formatPrice().
5. liketohave.js:
   - Add to STORES array.
   - If foreign currency, add conversion in formatPrice().
6. game-details.js:
   - Add to storeNames mapping.
   - If foreign currency, add conversion in formatGdPrice().

To remove a store:
- Reverse the edits in the 6 files listed above.
