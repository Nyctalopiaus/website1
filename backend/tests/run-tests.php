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

// --- cache key derivation logic (mirrors property-lookup.php's own logic) ---
function deriveCacheKey($url) {
    $redfinId = extractRedfinId($url);
    $fallbackAddress = parseAddressFromRedfinUrl($url);
    return $redfinId ? ('rid_' . $redfinId) : ('addr_' . normalizeAddressKey($fallbackAddress ?: $url));
}
$keyByUrlA = deriveCacheKey('https://www.redfin.com/CO/Denver/123-Main-St-80202/home/12345678');
$keyByUrlB = deriveCacheKey('https://www.redfin.com/CO/Denver/123-Main-St-Unit-2-80202/home/12345678');
check('cache key: same redfin ID collapses to same key even if slug differs', $keyByUrlA, $keyByUrlB);

echo "\n$passed passed, $failures failed.\n";
exit($failures > 0 ? 1 : 0);
