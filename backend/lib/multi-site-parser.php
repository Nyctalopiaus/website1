<?php
/**
 * Multi-site property parsing and normalization module.
 * Extends backend/lib/property-parser.php with support for Zillow, Realtor.com,
 * Homes.com, and generic Schema.org microdata parsing.
 */

require_once __DIR__ . '/property-parser.php';

/**
 * Detects the real estate provider domain from a URL.
 */
function detectProviderDomain($url) {
    $host = strtolower(parse_url($url, PHP_URL_HOST) ?: '');
    if (strpos($host, 'redfin.com') !== false) return 'redfin';
    if (strpos($host, 'zillow.com') !== false || strpos($host, 'trulia.com') !== false) return 'zillow';
    if (strpos($host, 'realtor.com') !== false) return 'realtor';
    if (strpos($host, 'homes.com') !== false) return 'homes';
    return 'generic';
}

/**
 * Validates whether a candidate URL belongs to a supported real estate domain
 * and is safe against SSRF / reserved IP attacks.
 */
function isAllowedImportUrl($candidateUrl) {
    $parts = parse_url($candidateUrl);
    if (!$parts || empty($parts['scheme']) || empty($parts['host'])) return false;
    if (!in_array(strtolower($parts['scheme']), ['http', 'https'], true)) return false;

    $host = strtolower($parts['host']);
    $allowedDomains = ['redfin.com', 'zillow.com', 'trulia.com', 'realtor.com', 'homes.com'];
    
    $isDomainAllowed = false;
    foreach ($allowedDomains as $domain) {
        if ($host === $domain || substr($host, -strlen('.' . $domain)) === '.' . $domain) {
            $isDomainAllowed = true;
            break;
        }
    }
    if (!$isDomainAllowed) return false;

    $ips = @gethostbynamel($host);
    if ($ips === false || empty($ips)) return false;
    foreach ($ips as $ip) {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }
    }
    return true;
}

/**
 * Extracts Schema.org LD+JSON payloads from raw HTML.
 */
function extractLdJsonNodes($html) {
    $nodes = [];
    if (preg_match_all('/<script\s+[^>]*type=["\']application\/ld\+json["\'][^>]*>(.*?)<\/script>/is', $html, $matches)) {
        foreach ($matches[1] as $jsonStr) {
            $jsonStr = trim($jsonStr);
            if (empty($jsonStr)) continue;
            $data = @json_decode($jsonStr, true);
            if ($data) {
                if (isset($data['@graph']) && is_array($data['@graph'])) {
                    foreach ($data['@graph'] as $gNode) {
                        if (is_array($gNode)) $nodes[] = $gNode;
                    }
                } else {
                    $nodes[] = $data;
                }
            }
        }
    }
    return $nodes;
}

/**
 * Generic Schema.org LD+JSON property parser.
 */
function parseGenericLdJsonHtml($html, $url = '') {
    $nodes = extractLdJsonNodes($html);
    
    $address = null;
    $price = null;
    $rentalEstimate = null;
    $beds = null;
    $baths = null;
    $sqft = null;
    $lotSqFt = null;
    $yearBuilt = null;
    $photoUrl = null;
    $hoaFee = null;
    $propertyTaxRate = null;

    // Page title fallback for address
    if (preg_match('/<title>(.*?)<\/title>/i', $html, $titleMatches)) {
        $addrParts = explode('|', $titleMatches[1]);
        $address = trim($addrParts[0]);
        // Strip trailing brand names
        $address = preg_replace('/\s*-\s*(Zillow|Realtor\.com|Redfin|Homes\.com|Trulia)$/i', '', $address);
    }

    foreach ($nodes as $node) {
        // Price
        if ($price === null) {
            if (isset($node['offers']['price']) && is_numeric($node['offers']['price'])) {
                $price = floatval($node['offers']['price']);
            } elseif (isset($node['offers'][0]['price']) && is_numeric($node['offers'][0]['price'])) {
                $price = floatval($node['offers'][0]['price']);
            } elseif (isset($node['price']) && is_numeric($node['price'])) {
                $price = floatval($node['price']);
            }
        }

        // Address
        if (isset($node['address']) && is_array($node['address'])) {
            $addrObj = $node['address'];
            $street = isset($addrObj['streetAddress']) ? $addrObj['streetAddress'] : '';
            $city = isset($addrObj['addressLocality']) ? $addrObj['addressLocality'] : '';
            $state = isset($addrObj['addressRegion']) ? $addrObj['addressRegion'] : '';
            $zip = isset($addrObj['postalCode']) ? $addrObj['postalCode'] : '';
            
            $formatted = trim("$street, $city, $state $zip");
            $formatted = preg_replace('/\s+/', ' ', trim($formatted, ', '));
            if (!empty($formatted)) {
                $address = $formatted;
            }
        }

        // Beds / Baths / Sqft / Year
        if (isset($node['numberOfBedrooms']) && is_numeric($node['numberOfBedrooms'])) {
            $beds = floatval($node['numberOfBedrooms']);
        } elseif (isset($node['bedrooms']) && is_numeric($node['bedrooms'])) {
            $beds = floatval($node['bedrooms']);
        }

        if (isset($node['numberOfBathroomsTotal']) && is_numeric($node['numberOfBathroomsTotal'])) {
            $baths = floatval($node['numberOfBathroomsTotal']);
        } elseif (isset($node['numberOfFullBathrooms']) && is_numeric($node['numberOfFullBathrooms'])) {
            $baths = floatval($node['numberOfFullBathrooms']);
        } elseif (isset($node['bathrooms']) && is_numeric($node['bathrooms'])) {
            $baths = floatval($node['bathrooms']);
        }

        if (isset($node['floorSize']['value']) && is_numeric($node['floorSize']['value'])) {
            $sqft = floatval($node['floorSize']['value']);
        }

        if (isset($node['yearBuilt']) && is_numeric($node['yearBuilt'])) {
            $yearBuilt = floatval($node['yearBuilt']);
        }

        // Photo
        if (!$photoUrl) {
            if (isset($node['image']) && is_string($node['image'])) {
                $photoUrl = $node['image'];
            } elseif (isset($node['image'][0]) && is_string($node['image'][0])) {
                $photoUrl = $node['image'][0];
            } elseif (isset($node['photo']['contentUrl']) && is_string($node['photo']['contentUrl'])) {
                $photoUrl = $node['photo']['contentUrl'];
            }
        }
    }

    // Additional meta tag / OpenGraph fallbacks
    if (!$photoUrl) {
        if (preg_match('/<meta\s+(?:property|name)=["\'](?:og:image|twitter:image)["\']\s+content=["\']([^"\']+)["\']/i', $html, $m)) {
            $photoUrl = trim($m[1]);
        }
    }

    if ($price === null) {
        $price = extractNumericField('price|unformattedPrice|listingPrice|zestimate|priceValue', [$html]);
    }
    if ($hoaFee === null) {
        $hoaFee = extractNumericField('hoaFee|monthlyHoaFee|hoaFeeTotal|monthlyHoa|hoaDues|monthlyHoaDues|hoaFeeMonthly|hoaFeeAmount|monthlyFee', [$html]);
    }
    if ($propertyTaxRate === null) {
        $propertyTaxRate = extractNumericField('propertyTaxRate|taxRate', [$html]);
        if ($propertyTaxRate === null) {
            $taxAnnual = extractNumericField('taxAnnualAmount|annualTaxAmount|taxAnnual|propertyTaxAnnual|taxAmount', [$html]);
            if ($taxAnnual !== null && $price !== null && $price > 0) {
                $propertyTaxRate = round(($taxAnnual / $price) * 100, 6);
            }
        }
    }
    if ($beds === null) {
        $beds = extractNumericField('bedrooms|beds|numBeds', [$html]);
    }
    if ($baths === null) {
        $baths = extractNumericField('bathrooms|baths|numBaths', [$html]);
    }
    if ($sqft === null) {
        $sqft = extractNumericField('livingArea|livingAreaValue|livingSquareFeet|sqft|buildingAreaSqFt|totalSqFt', [$html]);
    }
    if ($lotSqFt === null) {
        $lotVal = extractNumericField('lotSize|lotAreaValue|lotArea|lotAreaSqFt|lotSqFt|sqftLot|lotSizeSqFt', [$html], true);
        if ($lotVal !== null && $lotVal > 0) {
            $isAcres = ($lotVal < 100) || (bool)preg_match('/\\\\?"lot(?:AreaUnit|AreaUnits|Unit|Units|SizeUnit|SizeUnits)\\\\?"\s*:\s*\\\\?"(Acres?|ac)\\\\?"/i', $html);
            $lotSqFt = $isAcres ? floatval($lotVal) * 43560 : floatval($lotVal);
        }
    }
    if ($yearBuilt === null) {
        $yearBuilt = extractNumericField('yearBuilt|year_built', [$html]);
    }

    if ($yearBuilt !== null && ($yearBuilt < 1600 || $yearBuilt > (float)date('Y') + 1)) {
        $yearBuilt = null;
    }

    $rentalEstimate = deriveRentalEstimate([$html], $sqft, $price);

    $foundSomething = $price !== null || $rentalEstimate !== null || $hoaFee !== null || $beds !== null || $baths !== null
        || $sqft !== null || $lotSqFt !== null || $yearBuilt !== null || $photoUrl !== null;

    return [
        'address' => $address,
        'price' => $price,
        'rentalEstimate' => $rentalEstimate,
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

/**
 * Zillow-specific parser with fallback to generic LD+JSON.
 */
function parseZillowHtml($html, $url = '') {
    $result = parseGenericLdJsonHtml($html, $url);
    
    // Collect all JSON script blocks from Zillow's HTML (gdpClientCache, __NEXT_DATA__, __APOLLO_STATE__, JSON-LD, etc.)
    $jsonHaystacks = [$html];
    if (preg_match_all('/<script\s+[^>]*type=["\']application\/(?:ld\+)?json["\'][^>]*>(.*?)<\/script>/is', $html, $m)) {
        foreach ($m[1] as $block) {
            $b = trim($block);
            if (!empty($b)) $jsonHaystacks[] = $b;
        }
    }
    if (preg_match_all('/<script\s+id=["\'](?:__NEXT_DATA__|gdpClientCache|__APOLLO_STATE__)[^"\']*["\'][^>]*>(.*?)<\/script>/is', $html, $m)) {
        foreach ($m[1] as $block) {
            $b = trim($block);
            if (!empty($b)) $jsonHaystacks[] = $b;
        }
    }

    // 1. PRICE
    if ($result['price'] === null) {
        $result['price'] = extractNumericField('price|zestimate|unformattedPrice|listingPrice|priceValue', $jsonHaystacks);
        if ($result['price'] === null) {
            if (preg_match('/\$([0-9]{3},[0-9]{3}|[0-9]{1,3},[0-9]{3},[0-9]{3})/i', $html, $m)) {
                $result['price'] = floatval(str_replace(',', '', $m[1]));
            }
        }
    }

    // 2. HOA FEE
    if ($result['hoaFee'] === null) {
        $result['hoaFee'] = extractNumericField('monthlyHoaFee|hoaFee|hoaFeeTotal|monthlyHoa|hoaDues|monthlyHoaDues|hoaFeeMonthly|hoaFeeAmount|monthlyFee|associationFee', $jsonHaystacks);
        if ($result['hoaFee'] === null) {
            if (preg_match('/(?:HOA\s*(?:Fee|Dues)?|Monthly\s*HOA|Association\s*Fee)\s*(?:<[^>]+>|[\s:=-])*\$?\s*([0-9,]+(?:\.[0-9]+)?)/i', $html, $m)) {
                $result['hoaFee'] = floatval(str_replace(',', '', $m[1]));
            }
        }
    }

    // 3. PROPERTY TAX RATE
    if ($result['propertyTaxRate'] === null) {
        $result['propertyTaxRate'] = extractNumericField('propertyTaxRate|taxRate|taxRatePercent', $jsonHaystacks);
        if ($result['propertyTaxRate'] === null) {
            $taxAnnual = extractNumericField('taxAnnualAmount|annualTaxAmount|taxAnnual|propertyTaxAnnual|taxAmount|annualPropertyTax|annualTaxes|propertyTaxes', $jsonHaystacks);
            if ($taxAnnual !== null && $result['price'] !== null && $result['price'] > 0) {
                $result['propertyTaxRate'] = round(($taxAnnual / $result['price']) * 100, 6);
            }
        }
        if ($result['propertyTaxRate'] === null) {
            if (preg_match('/(?:Property\s*Tax\s*Rate|Tax\s*Rate)\s*(?:<[^>]+>|[\s:=-])*([0-9.]+)\s*%/i', $html, $m)) {
                $result['propertyTaxRate'] = floatval($m[1]);
            } elseif (preg_match('/(?:Annual\s*Tax(?:es|es\s*amount|ation)?|Property\s*Tax(?:es|es\s*amount)?|Tax\s*Amount)\s*(?:<[^>]+>|[\s:=-])*\$?\s*([0-9,]+(?:\.[0-9]+)?)/i', $html, $m)) {
                $taxAnnual = floatval(str_replace(',', '', $m[1]));
                if ($taxAnnual > 0 && $result['price'] !== null && $result['price'] > 0) {
                    $result['propertyTaxRate'] = round(($taxAnnual / $result['price']) * 100, 6);
                }
            }
        }
    }

    // 4. BEDS
    if ($result['beds'] === null) {
        $result['beds'] = extractNumericField('bedrooms|beds|numBeds', $jsonHaystacks);
        if ($result['beds'] === null) {
            if (preg_match('/([0-9]+(?:\.[0-9]+)?)\s*(?:<[^>]+>|\s)*(?:bd|bed|bedrooms?)\b/i', $html, $m)) {
                $result['beds'] = floatval($m[1]);
            }
        }
    }

    // 5. BATHS
    if ($result['baths'] === null) {
        $result['baths'] = extractNumericField('bathrooms|baths|numBaths', $jsonHaystacks);
        if ($result['baths'] === null) {
            if (preg_match('/([0-9]+(?:\.[0-9]+)?)\s*(?:<[^>]+>|\s)*(?:ba|baths?|bathrooms?)\b/i', $html, $m)) {
                $result['baths'] = floatval($m[1]);
            }
        }
    }

    // 6. SQFT
    if ($result['sqft'] === null) {
        $result['sqft'] = extractNumericField('livingArea|livingAreaValue|livingSquareFeet|sqft|buildingAreaSqFt|totalSqFt', $jsonHaystacks);
        if ($result['sqft'] === null) {
            if (preg_match('/([0-9,]+)\s*(?:<[^>]+>|\s)*(?:sq\s*ft|sqft|square\s*feet)\b/i', $html, $m)) {
                $result['sqft'] = floatval(str_replace(',', '', $m[1]));
            }
        }
    }

    // 7. LOT SQFT
    if ($result['lotSqFt'] !== null && $result['lotSqFt'] <= 0) {
        $result['lotSqFt'] = null;
    }

    if ($result['lotSqFt'] === null) {
        // A. JSON factLabel / factValue arrays (order-agnostic)
        foreach ($jsonHaystacks as $hs) {
            if (preg_match_all('/(?:\\\\?"(?:factLabel|label|name)\\\\?"\s*:\s*\\\\?"Lot(?:[ \-_]?(?:size|area)|\s*\([^)]*\))?\\\\?"\s*,\s*\\\\?"(?:factValue|value)\\\\?"\s*:\s*\\\\?"([^"\\\\]+)\\\\?"|\\\\?"(?:factValue|value)\\\\?"\s*:\s*\\\\?"([^"\\\\]+)\\\\?"\s*,\s*\\\\?"(?:factLabel|label|name)\\\\?"\s*:\s*\\\\?"Lot(?:[ \-_]?(?:size|area)|\s*\([^)]*\))?\\\\?")/i', $hs, $matches, PREG_SET_ORDER)) {
                foreach ($matches as $match) {
                    $valStr = trim(stripslashes(!empty($match[1]) ? $match[1] : $match[2]));
                    if (preg_match('/([0-9,.]+)\s*(sq\.?\s*ft\.?|square\s*feet|sqft|acres?|ac)/i', $valStr, $vm)) {
                        $num = floatval(str_replace(',', '', $vm[1]));
                        $unit = strtolower($vm[2]);
                        if ($num > 0) {
                            $isAcres = (strpos($unit, 'ac') === 0 || $num < 100);
                            $result['lotSqFt'] = $isAcres ? round($num * 43560, 2) : $num;
                            break 2;
                        }
                    }
                }
            }
        }
    }

    if ($result['lotSqFt'] === null) {
        // B. JSON dimension string match (e.g. "lotDimensions": "45x100" or "45 x 100")
        foreach ($jsonHaystacks as $hs) {
            if (preg_match('/\\\\?"lot(?:Dimensions|Size|Area)\\\\?"\s*:\s*\\\\?"([0-9,.]+)\s*x\s*([0-9,.]+)\\\\?"/i', $hs, $dm)) {
                $w = floatval(str_replace(',', '', $dm[1]));
                $d = floatval(str_replace(',', '', $dm[2]));
                if ($w > 0 && $d > 0) {
                    $result['lotSqFt'] = $w * $d;
                    break;
                }
            }
        }
    }

    if ($result['lotSqFt'] === null) {
        // C. Standard JSON numeric fields (filtering out zero/negative values)
        $lotVal = extractNumericField('lotSize|lotAreaValue|lotArea|lotAreaSqFt|lotSqFt|sqftLot|lotSizeSqFt|lotSquareFeet|lotAcres|lotSizeAcres|lot_size|lotsize', $jsonHaystacks, true);
        if ($lotVal !== null && $lotVal > 0) {
            $isAcres = ($lotVal < 100);
            foreach ($jsonHaystacks as $hs) {
                if (preg_match('/\\\\?"lot(?:AreaUnit|AreaUnits|Unit|Units|SizeUnit|SizeUnits)\\\\?"\s*:\s*\\\\?"(Acres?|ac)\\\\?"/i', $hs)) {
                    $isAcres = true;
                    break;
                } elseif (preg_match('/\\\\?"lot(?:AreaUnit|AreaUnits|Unit|Units|SizeUnit|SizeUnits)\\\\?"\s*:\s*\\\\?"(sq\.?\s*ft\.?|square\s*feet|sqft)\\\\?"/i', $hs)) {
                    $isAcres = false;
                    break;
                }
            }
            $result['lotSqFt'] = $isAcres ? round(floatval($lotVal) * 43560, 2) : floatval($lotVal);
        }
    }

    if ($result['lotSqFt'] === null) {
        // D. String values in JSON (e.g. "lotSize": "0.22 Acres" or "7,840 sqft")
        foreach ($jsonHaystacks as $hs) {
            if (preg_match_all('/\\\\?"(?:lotSize|lotArea|lotDetails)\\\\?"\s*:\s*\\\\?"([0-9,.]+)\s*(sq\.?\s*ft\.?|square\s*feet|sqft|acres?|ac)\\\\?"/i', $hs, $m, PREG_SET_ORDER)) {
                foreach ($m as $match) {
                    $num = floatval(str_replace(',', '', $match[1]));
                    $unit = strtolower($match[2]);
                    if ($num > 0) {
                        $isAcres = (strpos($unit, 'ac') === 0 || $num < 100);
                        $result['lotSqFt'] = $isAcres ? round($num * 43560, 2) : $num;
                        break 2;
                    }
                }
            }
        }
    }

    if ($result['lotSqFt'] === null) {
        // E. HTML dimensions (e.g. "Lot size: 45 x 100" or "45' x 100'")
        if (preg_match('/(?:Lot\s*(?:Size|Area|Dimensions)?\s*(?:<[^>]+>|[\s:=-])*\b([0-9,.]+)\s*(?:ft|\')?\s*x\s*([0-9,.]+)\s*(?:ft|\')?)/i', $html, $m)) {
            $w = floatval(str_replace(',', '', $m[1]));
            $d = floatval(str_replace(',', '', $m[2]));
            if ($w > 0 && $d > 0) {
                $result['lotSqFt'] = $w * $d;
            }
        }
    }

    if ($result['lotSqFt'] === null) {
        // F. HTML elements with "lot" in class/id/data-attribute containing number and unit
        if (preg_match('/<(?:li|div|span|td|p)[^>]*(?:lot|parcel)[^>]*>(?:<[^>]+>|\s)*([0-9,.]+)\s*(sq\.?\s*ft\.?|square\s*feet|sqft|acres?|ac)/i', $html, $m)) {
            $val = floatval(str_replace(',', '', $m[1]));
            $unit = strtolower($m[2]);
            if ($val > 0) {
                $isAcres = (strpos($unit, 'ac') === 0 || $val < 100);
                $result['lotSqFt'] = $isAcres ? round($val * 43560, 2) : $val;
            }
        }
    }

    if ($result['lotSqFt'] === null) {
        // G. Tag-tolerant DOM text (stripping <script>, <style>, and <svg> blocks before tag replacement)
        $htmlNoNoise = preg_replace('/<(?:script|style|svg)\b[^>]*>(.*?)<\/(?:script|style|svg)>/is', '', $html);
        $cleanDomText = preg_replace('/\s+/', ' ', preg_replace('/<[^>]+>/', ' ', $htmlNoNoise));

        if (preg_match('/Lot(?:[ \-_]?size)?\b[^<]{0,150}?([0-9,.]+)\s*(sq\.?\s*ft\.?|square\s*feet|sqft|acres?|ac)/i', $cleanDomText, $m)) {
            $val = floatval(str_replace(',', '', $m[1]));
            $unit = strtolower($m[2]);
            if ($val > 0) {
                $isAcres = (strpos($unit, 'ac') === 0 || $val < 100);
                $result['lotSqFt'] = $isAcres ? round($val * 43560, 2) : $val;
            }
        } elseif (preg_match('/([0-9,.]+)\s*(sq\.?\s*ft\.?|square\s*feet|sqft|acres?|ac)\b[^<]{0,100}?\bLot\b/i', $cleanDomText, $m)) {
            $val = floatval(str_replace(',', '', $m[1]));
            $unit = strtolower($m[2]);
            if ($val > 0) {
                $isAcres = (strpos($unit, 'ac') === 0 || $val < 100);
                $result['lotSqFt'] = $isAcres ? round($val * 43560, 2) : $val;
            }
        }
    }

    // 8. YEAR BUILT
    if ($result['yearBuilt'] === null) {
        $result['yearBuilt'] = extractNumericField('yearBuilt|year_built', $jsonHaystacks);
        if ($result['yearBuilt'] === null) {
            if (preg_match('/(?:Built\s*in|Year\s*built)\s*(?:<[^>]+>|[\s:=-])*([12][0-9]{3})\b/i', $html, $m)) {
                $result['yearBuilt'] = floatval($m[1]);
            }
        }
        if ($result['yearBuilt'] !== null && ($result['yearBuilt'] < 1600 || $result['yearBuilt'] > (float)date('Y') + 1)) {
            $result['yearBuilt'] = null;
        }
    }

    // 9. PHOTO URL
    if (!$result['photoUrl']) {
        foreach ($jsonHaystacks as $hs) {
            if (preg_match('/(https?:(?:\\\\?\/){2}photos\.zillowstatic\.com[^"\'<>\s\\\\]+\.(?:jpg|jpeg|webp|png))/i', $hs, $pm)) {
                $candidate = stripslashes($pm[1]);
                if (strlen($candidate) > 10) {
                    $result['photoUrl'] = $candidate;
                    break;
                }
            }
        }
    }

    // 10. RENTAL ESTIMATE (Zillow's "Zestimate® Rent", when the listing shows one).
    // Re-derive against the richer Zillow JSON haystacks (gdpClientCache /
    // __NEXT_DATA__ / __APOLLO_STATE__) rather than trusting whatever the
    // generic LD+JSON pass above found from bare $html alone — those blocks
    // are far more likely to carry an actual site-provided rent estimate
    // instead of falling back to the sqft/price-based algorithmic guess.
    $result['rentalEstimate'] = deriveRentalEstimate($jsonHaystacks, $result['sqft'], $result['price']);

    $result['foundSomething'] = $result['price'] !== null || $result['rentalEstimate'] !== null || $result['hoaFee'] !== null || $result['beds'] !== null
        || $result['baths'] !== null || $result['sqft'] !== null || $result['photoUrl'] !== null
        || $result['propertyTaxRate'] !== null || $result['lotSqFt'] !== null || $result['yearBuilt'] !== null;

    return $result;
}

/**
 * Realtor.com-specific parser with fallback to generic LD+JSON.
 */
function parseRealtorHtml($html, $url = '') {
    return parseGenericLdJsonHtml($html, $url);
}

/**
 * High-level parser router: detects provider from URL and dispatches HTML parsing.
 */
function parsePropertyHtmlByUrl($html, $url, $fallbackAddress = null) {
    $provider = detectProviderDomain($url);

    switch ($provider) {
        case 'redfin':
            $parsed = parsePropertyHtml($html, $fallbackAddress);
            break;
        case 'zillow':
            $parsed = parseZillowHtml($html, $url);
            break;
        case 'realtor':
            $parsed = parseRealtorHtml($html, $url);
            break;
        default:
            $parsed = parseGenericLdJsonHtml($html, $url);
            break;
    }

    // Strict Sanitization Pass: strip HTML tags, validate URLs, and enforce length bounds
    if (!empty($parsed['address'])) {
        $parsed['address'] = strip_tags(trim($parsed['address']));
        $parsed['address'] = preg_replace('/\s+/', ' ', $parsed['address']);
        $parsed['address'] = function_exists('mb_substr') ? mb_substr($parsed['address'], 0, 300) : substr($parsed['address'], 0, 300);
    }
    if (!empty($parsed['photoUrl'])) {
        $photo = strip_tags(trim($parsed['photoUrl']));
        if (preg_match('/^https?:\/\/[^\s<>\'"]+$/i', $photo)) {
            $parsed['photoUrl'] = function_exists('mb_substr') ? mb_substr($photo, 0, 1000) : substr($photo, 0, 1000);
        } else {
            $parsed['photoUrl'] = null;
        }
    }

    // Sanity-bound every numeric field the same way yearBuilt already was —
    // a forged/garbage HTML submission (or a parser mis-match on unrelated
    // page data) can otherwise inject an implausible number that flows
    // straight into another site's mortgage math with no floor/ceiling
    // check. Bounds are deliberately generous (real-world outliers should
    // still pass) — this is a backstop against nonsense, not a strict
    // real-estate-market filter.
    $numericBounds = [
        'price'            => [1, 100000000],      // $1 - $100M
        'rentalEstimate'   => [1, 500000],          // $1 - $500k/mo
        'hoaFee'           => [0, 50000],           // $0 - $50k/mo
        'propertyTaxRate'  => [0, 20],              // 0% - 20%
        'beds'             => [0, 50],
        'baths'            => [0, 50],
        'sqft'             => [1, 200000],
        'lotSqFt'          => [1, 500000000],       // ~11,500 acres
    ];
    foreach ($numericBounds as $field => $bounds) {
        if (isset($parsed[$field]) && $parsed[$field] !== null) {
            $val = $parsed[$field];
            if (!is_numeric($val) || $val < $bounds[0] || $val > $bounds[1]) {
                $parsed[$field] = null;
            }
        }
    }

    // Recompute foundSomething now that out-of-bounds values may have been
    // dropped — a submission whose only "found" field was implausible
    // should not be cached as a successful import.
    $parsed['foundSomething'] = $parsed['price'] !== null || $parsed['hoaFee'] !== null
        || $parsed['beds'] !== null || $parsed['baths'] !== null || $parsed['sqft'] !== null
        || $parsed['lotSqFt'] !== null || $parsed['yearBuilt'] !== null || $parsed['photoUrl'] !== null
        || (isset($parsed['rentalEstimate']) && $parsed['rentalEstimate'] !== null);

    $parsed['provider'] = $provider;
    return $parsed;
}
