<?php
/**
 * Pure parsing/normalization helpers for property-lookup.php, split out
 * into their own file so they can be unit-tested against fixture HTML
 * without making any network call (no curl, no Scrape.do, no live
 * redfin.com fetch). See backend/tests/ for the test harness — run those
 * instead of hitting the live endpoint whenever the parsing logic changes.
 */

// Redfin property URLs end in a run of 6+ digits (e.g.
// /CO/Denver/123-Main-St-80202/home/12345678). Take the LAST such run so
// an incidental shorter number earlier in the slug (a street number or
// zip) isn't mistaken for the property ID.
function extractRedfinId($url) {
    if (preg_match_all('/\d{6,}/', $url, $matches) && !empty($matches[0])) {
        return end($matches[0]);
    }
    return null;
}

function normalizeAddressKey($input) {
    return sha1(strtolower(trim(preg_replace('/[^a-zA-Z0-9]/', '', $input))));
}

function parseAddressFromRedfinUrl($url) {
    if (preg_match('#redfin\.com/([A-Z]{2})/([^/]+)/([^/]+)/home#i', $url, $m)) {
        $state = strtoupper($m[1]);
        $city = str_replace('-', ' ', $m[2]);
        $street = str_replace('-', ' ', $m[3]);
        return trim("$street, $city, $state");
    }
    return null;
}

function lotSizeLabel($lotSqFt) {
    if (!$lotSqFt || $lotSqFt <= 0) return null;
    $acres = $lotSqFt / 43560;
    return ($acres >= 0.1) ? number_format($acres, 2) . ' Acres' : number_format($lotSqFt) . ' sq ft';
}

// Tolerates an optional leading/trailing backslash before the quote,
// since Redfin frequently embeds this data as a JSON string nested
// inside another JSON blob, where inner quotes come through
// backslash-escaped rather than plain.
function extractNumericField($keyNames, $haystacks) {
    $pattern = '/\\\\?"(' . $keyNames . ')\\\\?"\s*:\s*([0-9.]+)/i';
    foreach ($haystacks as $haystack) {
        if (!$haystack) continue;
        if (preg_match($pattern, $haystack, $m)) {
            return floatval($m[2]);
        }
    }
    return null;
}

/**
 * Parses a fetched Redfin page (HTML string) into the canonical field set.
 * $fallbackAddress is used only if the <title> tag doesn't yield one.
 * Returns an array with keys: address, price, propertyTaxRate, hoaFee,
 * beds, baths, sqft, lotSqFt, yearBuilt, photoUrl, foundSomething (bool).
 */
function parsePropertyHtml($html, $fallbackAddress = null) {
    $nextData = null;
    if (preg_match('/id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s', $html, $m)) {
        $nextData = $m[1];
    }
    $haystacks = $nextData ? [$nextData, $html] : [$html];

    $address = null;
    if (preg_match('/<title>(.*?)<\/title>/i', $html, $titleMatches)) {
        $addrParts = explode('|', $titleMatches[1]);
        $address = trim($addrParts[0]);
    }
    if (!$address) {
        $address = $fallbackAddress;
    }

    // Price: specific/confirmed keys before the generic "price" fallback.
    // IMPORTANT ORDERING NOTE: "price" is NOT safe to check first/second —
    // an off-market page embeds multiple unrelated JSON blobs (sale-history
    // events, nearby comps, etc.) that can also contain a bare "price"
    // field unrelated to the current value shown on the page.
    // redfin_estimate is Redfin's own current-value estimate and is far
    // more reliable when an active listingPrice isn't present.
    $price = extractNumericField('listingPrice|redfin_estimate|avmValue|estimatedValue|predictedValue', $haystacks);
    if ($price === null) {
        $price = extractNumericField('price', $haystacks);
    }
    if ($price === null) {
        foreach ($haystacks as $haystack) {
            if ($haystack && preg_match('/class="[^"]*statsValue[^"]*"[^>]*>\s*\$([0-9,]+)/i', $haystack, $m)) {
                $price = floatval(str_replace(',', '', $m[1]));
                break;
            }
        }
    }

    $propertyTaxRate = extractNumericField('propertyTaxRate', $haystacks);
    $hoaFee = extractNumericField('hoa_fee|hoaFee|monthlyHoaDues|hoaDues', $haystacks);
    $beds = extractNumericField('beds|numBeds|bedrooms', $haystacks);
    $baths = extractNumericField('baths|numBaths|bathrooms', $haystacks);
    // Sq Ft Parsing Order:
    // Redfin's displayed hero stats / MLS marketing specs (which include finished basements)
    // take precedence over raw tax record fields in __NEXT_DATA__ (which often record only
    // above-grade square footage, e.g. 2,291 sq ft vs 3,516 total finished sq ft).
    $sqft = null;
    if (preg_match('/<meta\s+(?:name|property)=["\']twitter:text:sqft["\']\s+content=["\']([0-9,]+)["\']/i', $html, $m)) {
        $sqft = floatval(str_replace(',', '', $m[1]));
    } elseif (preg_match('/<meta\s+content=["\']([0-9,]+)["\']\s+(?:name|property)=["\']twitter:text:sqft["\']/i', $html, $m)) {
        $sqft = floatval(str_replace(',', '', $m[1]));
    } elseif (preg_match('/\\\\?"floorSize\\\\?"\s*:\s*\{\s*\\\\?"@type\\\\?"\s*:\s*\\\\?"QuantitativeValue\\\\?"\s*,\s*\\\\?"value\\\\?"\s*:\s*([0-9.]+)/i', $html, $m)) {
        $sqft = floatval($m[1]);
    } elseif (preg_match('/(?:sqft-section|abp-sqFt)[^>]*>\s*<span\s+class="statsValue">\s*([0-9,]+)\s*<\/span>/i', $html, $m)) {
        $sqft = floatval(str_replace(',', '', $m[1]));
    }

    if ($sqft === null) {
        $sqft = extractNumericField('sqft|livingSquareFeet|homeSqFt|sqFtFinished|totalSqFt', $haystacks);
    }
    $lotSqFt = extractNumericField('lotSize|lotSqFt|sqftLot', $haystacks);

    $yearBuilt = extractNumericField('yearBuilt|year_built', $haystacks);
    // Sanity-bound: extractNumericField will happily match a stray 4-digit
    // number under a loosely-related key elsewhere in the page's JSON. A
    // real construction year won't be before 1600 or after next year —
    // outside that range, treat it as a bad match rather than showing
    // obviously-wrong data (e.g. picking up a $1,900 fee formatted oddly).
    if ($yearBuilt !== null && ($yearBuilt < 1600 || $yearBuilt > (float)date('Y') + 1)) {
        $yearBuilt = null;
    }

    $photoUrl = null;

    // 1. Check meta tags (og:image, twitter:image, image_src)
    if (preg_match('/<meta\s+(?:property|name)=["\'](?:og:image|twitter:image)["\']\s+content=["\']([^"\']+)["\']/i', $html, $m)) {
        $photoUrl = trim($m[1]);
    } elseif (preg_match('/<meta\s+content=["\']([^"\']+)["\']\s+(?:property|name)=["\'](?:og:image|twitter:image)["\']/i', $html, $m)) {
        $photoUrl = trim($m[1]);
    } elseif (preg_match('/<link\s+rel=["\']image_src["\']\s+href=["\']([^"\']+)["\']/i', $html, $m)) {
        $photoUrl = trim($m[1]);
    }

    // 2. Check embedded JSON state (primaryPhotoUrl, landscapeLargeUrl, fullScreenPhotoUrl, etc.)
    if (!$photoUrl || $photoUrl === 'https:' || $photoUrl === 'http:') {
        foreach ($haystacks as $haystack) {
            if (!$haystack) continue;
            if (preg_match('/\\\\?"(primaryPhotoUrl|landscapeLargeUrl|fullScreenPhotoUrl|imageUrl|mainPhoto|photoUrl|largeUrl|photo_url)\\\\?"\s*:\s*\\\\?"(https?:\\\\?\/\\\\?\/[^"\s]+?)(?:\\\\?"|,|\})/i', $haystack, $m)) {
                $candidate = stripslashes($m[2]);
                $candidate = rtrim($candidate, '\\"');
                if (strlen($candidate) > 10) {
                    $photoUrl = $candidate;
                    break;
                }
            }
        }
    }

    // 3. CDN image URL fallback pattern
    if (!$photoUrl || $photoUrl === 'https:' || $photoUrl === 'http:') {
        if (preg_match('/(https?:(?:\\\\?\/){2}(?:ssl\.cdn-redfin\.com|ap\.rdcpix\.com|cdn-redfin\.com|photos\.zillowstatic\.com)[^"\'<>\s\\\\]+\.(?:jpg|jpeg|webp|png))/i', $html, $m)) {
            $photoUrl = stripslashes($m[1]);
        }
    }

    $foundSomething = $price !== null || $hoaFee !== null || $beds !== null || $baths !== null
        || $sqft !== null || $lotSqFt !== null || $yearBuilt !== null || $photoUrl !== null;

    return [
        'address' => $address,
        'price' => $price,
        'propertyTaxRate' => $propertyTaxRate,
        'hoaFee' => $hoaFee,
        'beds' => $beds,
        'baths' => $baths,
        'sqft' => $sqft,
        'lotSqFt' => $lotSqFt,
        'yearBuilt' => $yearBuilt,
        'photoUrl' => $photoUrl,
        'foundSomething' => $foundSomething,
    ];
}

// SSRF / host allowlist — restrict fetches to redfin.com only, and reject
// DNS-rebinding to private/reserved IPs. Identical logic to what both
// proxies this file replaces already used in production.
function isSafeRedfinUrl($candidateUrl) {
    $parts = parse_url($candidateUrl);
    if (!$parts || empty($parts['scheme']) || empty($parts['host'])) return false;
    if (!in_array(strtolower($parts['scheme']), ['http', 'https'], true)) return false;

    $host = strtolower($parts['host']);
    if ($host !== 'redfin.com' && substr($host, -11) !== '.redfin.com') {
        return false;
    }

    $ips = @gethostbynamel($host);
    if ($ips === false || empty($ips)) return false;
    foreach ($ips as $ip) {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }
    }
    return true;
}
