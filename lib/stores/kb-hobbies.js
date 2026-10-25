// Stock checking for kb hobbies.
const { sleep, cleanName } = require('../util');
const { fetchJson } = require('../http');
const { GAME_ALIASES, isMatch } = require('../matching');

function parseKbHobbies(res, gameName) {
    const items = res?.data;
    if (!items || !Array.isArray(items) || items.length === 0) return null;
    const products = items.map(item => ({
        title: item.name,
        type: '',
        available: Boolean((item.inventory?.total > 0 || item.inventory?.all_inventory_total > 0) && !item.badges?.out_of_stock && !item.inventory?.all_variations_sold_out),
        price: item.price?.regular_high_formatted || item.price?.high_formatted || (item.price?.high ? `$${item.price.high}` : null),
        url: item.absolute_site_link || (item.site_link ? `https://www.kbhobbies.com/${item.site_link.replace(/^\//, '')}` : null)
    }));
    const match = products.find(p => isMatch(gameName, p));
    if (match) {
        return {
            available: match.available,
            price: match.price,
            url: match.url
        };
    }
    return null;
}

async function fetchKbHobbies(gameName) {
    const clean = cleanName(gameName);
    const queries = [clean];
    const withoutArticle = clean.replace(/^(the|a|an)\s+/i, '');
    if (withoutArticle !== clean && !queries.includes(withoutArticle)) {
        queries.push(withoutArticle);
    }
    const aliases = GAME_ALIASES[gameName] || GAME_ALIASES[clean] || [];
    for (const a of aliases) {
        if (!queries.includes(a)) queries.push(a);
    }

    for (let qi = 0; qi < queries.length; qi++) {
        if (qi > 0) await sleep(200);
        const q = queries[qi];
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages && page <= 3) {
            if (page > 1) await sleep(200);
            const url = `https://cdn5.editmysite.com/app/store/api/v28/editor/users/151297753/sites/680972496472648272/products?q=${encodeURIComponent(q)}&per_page=200&page=${page}`;
            const res = await fetchJson(url);
            if (res !== null) {
                const match = parseKbHobbies(res, gameName);
                if (match) return match;
                totalPages = res?.meta?.pagination?.total_pages || 1;
            } else {
                break;
            }
            page++;
        }
    }
    return { available: false, price: null, url: null };
}

module.exports = { parseKbHobbies, fetchKbHobbies };
