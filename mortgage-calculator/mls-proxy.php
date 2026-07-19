<?php
// 1. Get and sanitize the URL parameter
$url = isset($_GET['url']) ? trim($_GET['url']) : '';

// Auto-prepend https:// if the user passed a domain name or path without http(s)://
if (!empty($url) && !preg_match('/^https?:\/\//i', $url)) {
    $url = 'https://' . $url;
}

// 2. Validate that it is a real URL starting with https:// or http://
if (empty($url) || filter_var($url, FILTER_VALIDATE_URL) === false || !preg_match('/^https?:\/\//i', $url)) {
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid or missing URL parameter. Ensure it starts with https:// or http://']);
    exit;
}

// Optional: Paste your free Scrape.do token below to bypass Redfin WAF blocks.
// You can get a free token at https://scrape.do (includes 1,000 successful requests/month, no credit card required).
define('SCRAPE_DO_TOKEN', '337712a748d749be9b10e4f63e36e52a0609bb22cd1');

// Optional: Paste your free ScraperAPI key below.
// You can get a free key at https://www.scraperapi.com (includes 5,000 requests/month, credit card required).
define('SCRAPER_API_KEY', '');

$ch = curl_init();

if (defined('SCRAPE_DO_TOKEN') && !empty(SCRAPE_DO_TOKEN)) {
    // Route request through Scrape.do (HTTPS)
    $apiUrl = "https://api.scrape.do?token=" . SCRAPE_DO_TOKEN . "&url=" . urlencode($url);
    curl_setopt($ch, CURLOPT_URL, $apiUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15); // Wait up to 15 seconds to connect
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);        // Wait up to 60 seconds for full download
} elseif (defined('SCRAPER_API_KEY') && !empty(SCRAPER_API_KEY)) {
    // Route request through ScraperAPI (HTTPS)
    $apiUrl = "https://api.scraperapi.com?api_key=" . SCRAPER_API_KEY . "&url=" . urlencode($url);
    curl_setopt($ch, CURLOPT_URL, $apiUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15); // Wait up to 15 seconds to connect
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);        // Wait up to 60 seconds for full download
} else {
    // Standard direct cURL request (mimicking mobile browser)
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    // Mobile User-Agent to mimic iPhone/Safari to bypass WAF blocks
    curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1");
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);

    // Emulate basic mobile browser headers to prevent blocks
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language: en-US,en;q=0.9',
        'Referer: https://www.google.com/',
        'Upgrade-Insecure-Requests: 1',
        'DNT: 1'
    ]);
}

$html = curl_exec($ch);

if (curl_errno($ch)) {
    header('Content-Type: application/json');
    echo json_encode(['error' => 'cURL Error: ' . curl_error($ch)]);
} else {
    header('Content-Type: application/json');
    
    // Check the HTTP status code to identify blocks, challenges, or 404s
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($http_code === 403 || $http_code === 202 || $http_code === 405) {
        echo json_encode(['error' => 'Connection blocked or challenged by Redfin (HTTP ' . $http_code . '). Please enter the details manually.']);
        curl_close($ch);
        exit;
    } elseif ($http_code === 404) {
        echo json_encode(['error' => 'Property page not found (HTTP 404). Please verify the URL.']);
        curl_close($ch);
        exit;
    } elseif ($http_code !== 200) {
        echo json_encode(['error' => 'Failed to retrieve page. Server returned HTTP Status ' . $http_code]);
        curl_close($ch);
        exit;
    }
    
    // Parse Redfin properties (compatible with the new React Server Components layout)
    $address = "";
    $price = null;
    $hoa_fee = 0;
    $property_tax = null;

    // 1. Extract Address from <title> tag
    if (preg_match('/<title>(.*?)<\/title>/i', $html, $title_matches)) {
        $title = $title_matches[1];
        $parts = explode('|', $title);
        $address = trim($parts[0]);
    }

    // 2. Extract Listing Price
    if (preg_match('/\\\\?"listingPrice\\\\?"\s*:\s*([0-9.]+)/', $html, $price_matches)) {
        $price = floatval($price_matches[1]);
    } elseif (preg_match('/"price"\s*:\s*([0-9.]+)/', $html, $price_matches)) {
        $price = floatval($price_matches[1]);
    }

    // 3. Extract HOA Dues
    if (preg_match('/\\\\?"monthlyHoaDues\\\\?"\s*:\s*([0-9.]+)/', $html, $hoa_matches)) {
        $hoa_fee = floatval($hoa_matches[1]);
    }

    // 4. Extract Tax Rate
    if (preg_match('/\\\\?"propertyTaxRate\\\\?"\s*:\s*([0-9.]+)/', $html, $tax_matches)) {
        $property_tax = floatval($tax_matches[1]);
    }

    // If we successfully resolved at least a price, return our compiled JSON block
    if ($price !== null) {
        echo json_encode([
            'price' => $price,
            'address' => $address,
            'hoa_fee' => $hoa_fee,
            'property_tax' => $property_tax
        ]);
    } else {
        // Fallback: Legacy __NEXT_DATA__ block extraction
        if (preg_match('/id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s', $html, $matches)) {
            echo $matches[1]; 
        } else {
            echo json_encode(['error' => 'Could not find property data on the provided page.']);
        }
    }
}
curl_close($ch);
?>