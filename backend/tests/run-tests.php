<?php
/**
 * Offline test harness for backend/lib/property-parser.php.
 *
 * IMPORTANT: this makes NO network calls and never touches Scrape.do —
 * it only exercises the parsing/normalization functions against fixture
 * HTML checked into tests/fixtures/. Run this (`php run-tests.php`)
 * instead of hitting the live endpoint whenever the parsing logic
 * changes. See the budget warning at the top of property-lookup.php and
 * in MEMORY.md for why.
 */

require __DIR__ . '/../lib/property-parser.php';

$failures = 0;
$passed = 0;

function check($label, $actual, $expected) {
    global $failures, $passed;
    $ok = $actual === $expected;
    if ($ok) {
        $passed++;
    } else {
        $failures++;
        echo "FAIL: $label\n  expected: " . var_export($expected, true) . "\n  actual:   " . var_export($actual, true) . "\n";
    }
}

function fixture($name) {
    return file_get_contents(__DIR__ . '/fixtures/' . $name);
}

// --- extractRedfinId ---
check('redfin id: standard /home/ URL', extractRedfinId('https://www.redfin.com/CO/Denver/123-Main-St-80202/home/12345678'), '12345678');
check('redfin id: takes LAST long digit run, not the zip', extractRedfinId('https://www.redfin.com/CO/Denver/123-Main-St-80202/home/98765432'), '98765432');
check('redfin id: none present', extractRedfinId('https://www.redfin.com/CO/Denver/some-street'), null);

// --- parseAddressFromRedfinUrl ---
check('address from URL', parseAddressFromRedfinUrl('https://www.redfin.com/CO/Denver/123-Main-St-80202/home/12345678'), '123 Main St 80202, Denver, CO');
check('address from URL: no match', parseAddressFromRedfinUrl('https://www.redfin.com/'), null);

// --- normalizeAddressKey ---
check('address key ignores case/punctuation', normalizeAddressKey('123 Main St, Denver, CO'), normalizeAddressKey('123 MAIN ST DENVER CO'));

// --- lotSizeLabel ---
check('lot size: acres for large lots', lotSizeLabel(6500), '0.15 Acres');
check('lot size: sq ft for small lots', lotSizeLabel(3000), '3,000 sq ft');
check('lot size: null for zero/empty', lotSizeLabel(0), null);
check('lot size: null for null', lotSizeLabel(null), null);

// --- parsePropertyHtml: active listing (clean __NEXT_DATA__) ---
$active = parsePropertyHtml(fixture('active-listing.html'));
check('active: address', $active['address'], '123 Main St, Denver, CO 80202');
check('active: price', $active['price'], 525000.0);
check('active: hoaFee', $active['hoaFee'], 45.0);
check('active: propertyTaxRate', $active['propertyTaxRate'], 0.0055);
check('active: beds', $active['beds'], 3.0);
check('active: baths', $active['baths'], 2.0);
check('active: sqft', $active['sqft'], 1850.0);
check('active: lotSqFt', $active['lotSqFt'], 6500.0);
check('active: photoUrl', $active['photoUrl'], 'https://ssl.cdn-redfin.com/photo/1/bigphoto/123/main1.jpg');
check('active: foundSomething', $active['foundSomething'], true);

// --- parsePropertyHtml: off-market page with decoy sale-history "price" ---
// Regression check for the ordering bug documented in the original
// mls-proxy.php: a bare "price" key from unrelated sale-history/comps
// data must NOT win over redfin_estimate.
$offMarket = parsePropertyHtml(fixture('off-market-with-history.html'));
check('off-market: uses redfin_estimate, not decoy sale-history price', $offMarket['price'], 495520.0);

// --- parsePropertyHtml: backslash-escaped nested JSON ---
$escaped = parsePropertyHtml(fixture('escaped-nested-json.html'));
check('escaped JSON: price', $escaped['price'], 389900.0);
check('escaped JSON: beds', $escaped['beds'], 4.0);
check('escaped JSON: baths', $escaped['baths'], 3.0);
check('escaped JSON: sqft', $escaped['sqft'], 2200.0);

// --- parsePropertyHtml: Redfin sqFtFinished & totalSqFt keys ---
$sqftFinishedHtml = '<html><head><title>9454 Wolfe Pl | Redfin</title></head><body><script>var x = {"sqFtFinished": 2551, "totalSqFt": 2599};</script></body></html>';
$parsedSqft = parsePropertyHtml($sqftFinishedHtml);
check('sqFtFinished key parsing', $parsedSqft['sqft'], 2551.0);

// --- parsePropertyHtml: twitter:text:sqft advertised total precedence ---
$mlsPrecedenceHtml = '<html><head><title>5200 S Memphis Ct | Redfin</title><meta name="twitter:text:sqft" content="3,516" /></head><body><script id="__NEXT_DATA__">var x = {"sqFtFinished": 2291, "totalSqFt": 2291};</script></body></html>';
$parsedMlsSqft = parsePropertyHtml($mlsPrecedenceHtml);
check('advertised sqft meta takes precedence over tax record sqFtFinished', $parsedMlsSqft['sqft'], 3516.0);

// --- parsePropertyHtml: Schema.org LD+JSON floorSize ---
$ldJsonSqftHtml = '<html><head><title>123 Test St | Redfin</title></head><body><script type="application/ld+json">{"@type":"SingleFamilyResidence","floorSize":{"@type":"QuantitativeValue","value":3516}}</script></body></html>';
$parsedLdSqft = parsePropertyHtml($ldJsonSqftHtml);
check('LD+JSON floorSize parsing', $parsedLdSqft['sqft'], 3516.0);

// --- parsePropertyHtml: yearBuilt ---
$yearBuiltHtml = '<html><head><title>16623 E Powers Pl | Redfin</title></head><body><script>var x = {"yearBuilt": 1998};</script></body></html>';
$parsedYear = parsePropertyHtml($yearBuiltHtml);
check('yearBuilt key parsing', $parsedYear['yearBuilt'], 1998.0);
check('yearBuilt: counts toward foundSomething', $parsedYear['foundSomething'], true);

// yearBuilt sanity bounds — reject an implausible year rather than surface
// a false match (e.g. a "yearBuilt" key that's actually something else,
// or corrupted/misformatted data), which would otherwise show up as a
// silently wrong value instead of just "unspecified".
$yearTooOldHtml = '<html><head><title>Old House | Redfin</title></head><body><script>var x = {"yearBuilt": 1500};</script></body></html>';
check('yearBuilt: rejects implausibly old year', parsePropertyHtml($yearTooOldHtml)['yearBuilt'], null);

$yearFutureHtml = '<html><head><title>Future House | Redfin</title></head><body><script>var x = {"yearBuilt": 2099};</script></body></html>';
check('yearBuilt: rejects implausibly future year', parsePropertyHtml($yearFutureHtml)['yearBuilt'], null);

$noYearHtml = '<html><head><title>No Year | Redfin</title></head><body><script>var x = {"price": 450000};</script></body></html>';
check('yearBuilt: absent when not present in page', parsePropertyHtml($noYearHtml)['yearBuilt'], null);

// --- parsePropertyHtml: nothing parseable ---
$noData = parsePropertyHtml(fixture('no-data.html'), 'Fallback Address, Denver, CO');
check('no-data: foundSomething is false', $noData['foundSomething'], false);
// The fixture has its own <title> tag ("Redfin - Page Not Found"), which
// correctly takes precedence over the fallback address — the fallback
// path only matters when there's no <title> tag at all.
check('no-data: address comes from the page title when present', $noData['address'], 'Redfin - Page Not Found');

$noTitle = parsePropertyHtml('<html><body>no title tag here, no fields either</body></html>', 'Fallback Address, Denver, CO');
check('no title tag: falls back to supplied fallback address', $noTitle['address'], 'Fallback Address, Denver, CO');

require_once __DIR__ . '/../lib/multi-site-parser.php';

// --- detectProviderDomain ---
check('domain: redfin', detectProviderDomain('https://www.redfin.com/CO/Denver/123-Main-St/home/123'), 'redfin');
check('domain: zillow', detectProviderDomain('https://www.zillow.com/homedetails/123-Main-St-Denver-CO/123456_zpid/'), 'zillow');
check('domain: trulia', detectProviderDomain('https://www.trulia.com/p/co/denver/123-main-st-123456'), 'zillow');
check('domain: realtor', detectProviderDomain('https://www.realtor.com/realestateandhomes-detail/123-Main-St_Denver_CO_80202'), 'realtor');
check('domain: homes.com', detectProviderDomain('https://www.homes.com/property/123-main-st-denver-co/abc1234/'), 'homes');

// --- isAllowedImportUrl ---
check('allowed import URL: redfin', isAllowedImportUrl('https://www.redfin.com/CO/Denver/123-Main-St/home/123'), true);
check('allowed import URL: zillow', isAllowedImportUrl('https://www.zillow.com/homedetails/123'), true);
check('allowed import URL: rejected bad domain', isAllowedImportUrl('https://www.evildomain.com/hack'), false);

// --- parseZillowHtml LD+JSON & gdpClientCache ---
$zillowHtml = '<html><head><title>123 Main St, Denver, CO 80202 | Zillow</title><script type="application/ld+json">{"@type":"SingleFamilyResidence","name":"123 Main St","address":{"@type":"PostalAddress","streetAddress":"123 Main St","addressLocality":"Denver","addressRegion":"CO","postalCode":"80202"},"offers":{"@type":"Offer","price":650000},"numberOfBedrooms":4,"numberOfBathroomsTotal":3,"floorSize":{"@type":"QuantitativeValue","value":2400}}</script></head><body></body></html>';
$parsedZillow = parsePropertyHtmlByUrl($zillowHtml, 'https://www.zillow.com/homedetails/123-Main-St-Denver-CO/123456_zpid/');
check('zillow: provider', $parsedZillow['provider'], 'zillow');
check('zillow: price', $parsedZillow['price'], 650000.0);
check('zillow: beds', $parsedZillow['beds'], 4.0);
check('zillow: baths', $parsedZillow['baths'], 3.0);
check('zillow: sqft', $parsedZillow['sqft'], 2400.0);
check('zillow: address', $parsedZillow['address'], '123 Main St, Denver, CO 80202');
check('zillow: foundSomething', $parsedZillow['foundSomething'], true);

// --- parseZillowHtml gdpClientCache / __NEXT_DATA__ fields ---
$zillowFullHtml = '<html><head><title>3231 N Elk Way, Aurora, CO 80019 | Zillow</title></head><body><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"gdpClientCache":{"Property":{"price":"585,000","bedrooms":"4","bathrooms":"3","livingArea":"2,090","monthlyHoaFee":"$150","taxAnnualAmount":"$4,212","lotAreaValue":"0.22","lotAreaUnits":"Acres","yearBuilt":"2018","hiResImageLink":"https://photos.zillowstatic.com/fp/test.jpg"}}}}}</script></body></html>';
$parsedZillowFull = parsePropertyHtmlByUrl($zillowFullHtml, 'https://www.zillow.com/homedetails/3231-N-Elk-Way-Aurora-CO-80019/464768226_zpid/');
check('zillow full: price', $parsedZillowFull['price'], 585000.0);
check('zillow full: beds', $parsedZillowFull['beds'], 4.0);
check('zillow full: baths', $parsedZillowFull['baths'], 3.0);
check('zillow full: sqft', $parsedZillowFull['sqft'], 2090.0);
check('zillow full: hoaFee', $parsedZillowFull['hoaFee'], 150.0);
check('zillow full: propertyTaxRate (4212/585000*100)', $parsedZillowFull['propertyTaxRate'], 0.72);
check('zillow full: lotSqFt (0.22 acres)', $parsedZillowFull['lotSqFt'], 9583.2);
check('zillow full: yearBuilt', $parsedZillowFull['yearBuilt'], 2018.0);
check('zillow full: photoUrl', $parsedZillowFull['photoUrl'], 'https://photos.zillowstatic.com/fp/test.jpg');

// --- parseZillowHtml HTML DOM text regex fallbacks (with HTML tags & classes) ---
$zillowDomHtml = '<html><head><title>697 N Ukraine St, Aurora, CO 80018 | Zillow</title></head><body><div><span>$516,995</span><span>4 bd</span><span>3 ba</span><span>2,090 sqft</span><span class="label">HOA fee</span><span class="val">$120/mo</span><span class="label">Annual Taxes</span><span class="val">$3,618.96</span><li class="fact-lot-size"><span>0.18 Acres</span></li></div></body></html>';
$parsedZillowDom = parsePropertyHtmlByUrl($zillowDomHtml, 'https://www.zillow.com/homedetails/697-N-Ukraine-St-Aurora-CO-80018/459315670_zpid/');
check('zillow DOM text: price', $parsedZillowDom['price'], 516995.0);
check('zillow DOM text: hoaFee', $parsedZillowDom['hoaFee'], 120.0);
check('zillow DOM text: propertyTaxRate', round($parsedZillowDom['propertyTaxRate'], 2), 0.7);
check('zillow DOM text: lotSqFt (0.18 Acres)', $parsedZillowDom['lotSqFt'], 7840.8);

// --- parseZillowHtml Lot dimensions fallback ---
$zillowDimHtml = '<html><head><title>123 Test | Zillow</title></head><body><div><span>Lot dimensions: 45 x 100</span></div></body></html>';
$parsedDim = parsePropertyHtmlByUrl($zillowDimHtml, 'https://www.zillow.com/homedetails/123/1_zpid/');
check('zillow lot dimensions (45x100)', $parsedDim['lotSqFt'], 4500.0);

// --- rentalEstimate now flows through every per-site parser, not just Redfin ---
// Regression coverage for the rent-vs-sell "Auto-Fetch" bug: rentalEstimate
// used to be extracted only inside parsePropertyHtml (Redfin) — Zillow,
// Realtor.com, Homes.com and the generic LD+JSON path never set the key at
// all, so any caller reading $data['rentalEstimate'] silently got null for
// three of the four supported providers.

// Zillow: explicit rentZestimate key in gdpClientCache-style JSON wins over the algorithmic fallback.
$zillowRentHtml = '<html><head><title>44 Rent Ave, Denver, CO 80202 | Zillow</title></head><body><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"gdpClientCache":{"Property":{"price":"450000","livingArea":"1800","rentZestimate":"2450"}}}}}</script></body></html>';
$parsedZillowRent = parsePropertyHtmlByUrl($zillowRentHtml, 'https://www.zillow.com/homedetails/44-Rent-Ave-Denver-CO/111_zpid/');
check('zillow: rentalEstimate from rentZestimate key', $parsedZillowRent['rentalEstimate'], 2450.0);

// Zillow: no rent field present anywhere -> algorithmic sqft-based fallback, not null.
$zillowNoRentHtml = '<html><head><title>55 No Rent Blvd, Denver, CO 80202 | Zillow</title></head><body><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"gdpClientCache":{"Property":{"price":"450000","livingArea":"2000"}}}}}</script></body></html>';
$parsedZillowNoRent = parsePropertyHtmlByUrl($zillowNoRentHtml, 'https://www.zillow.com/homedetails/55-No-Rent-Blvd-Denver-CO/112_zpid/');
check('zillow: rentalEstimate algorithmic sqft fallback when absent from page', $parsedZillowNoRent['rentalEstimate'], round((2000 * 1.35) / 25) * 25);

// Realtor.com (routed through parseGenericLdJsonHtml): LD+JSON has no rent field -> price-based algorithmic fallback.
$realtorHtml = '<html><head><title>66 Realtor Way, Denver, CO 80202 | Realtor.com</title><script type="application/ld+json">{"@type":"SingleFamilyResidence","offers":{"@type":"Offer","price":410000}}</script></head><body></body></html>';
$parsedRealtor = parsePropertyHtmlByUrl($realtorHtml, 'https://www.realtor.com/realestateandhomes-detail/66-Realtor-Way_Denver_CO_80202');
check('realtor.com: rentalEstimate is populated (not silently null)', $parsedRealtor['rentalEstimate'] !== null, true);
check('realtor.com: rentalEstimate price-based algorithmic fallback', $parsedRealtor['rentalEstimate'], round((410000 * 0.0065) / 50) * 50);

// Homes.com (routed through the generic/default LD+JSON path): explicit "estimatedRent" key.
$homesHtml = '<html><head><title>77 Homes Dr, Denver, CO 80202 | Homes.com</title></head><body><script>var x = {"price": 395000, "estimatedRent": 2100};</script></body></html>';
$parsedHomes = parsePropertyHtmlByUrl($homesHtml, 'https://www.homes.com/property/77-homes-dr-denver-co/222abc/');
check('homes.com: rentalEstimate from estimatedRent key', $parsedHomes['rentalEstimate'], 2100.0);

echo "\n$passed passed, $failures failed.\n";
exit($failures > 0 ? 1 : 0);

