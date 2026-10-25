<?php
/**
 * Tour packet: everything the agent's printable tour guide needs (js/tourPacket.js builds the PDF).
 *
 *   get_tour_packet      realtor/admin: the client, the agent, the client's brief, and full details
 *                        for every home on the client's tour, in tour order
 *   tour_packet_photo    realtor/admin: one listing photo, fetched server-side so it can go into the
 *                        PDF. Only photos already stored for that listing, only from the MLS media
 *                        host: never an arbitrary URL.
 */

const PACKET_PHOTO_HOSTS = ['matrixmedia.recolorado.com'];
const PACKET_MAX_STOPS = 25;

/** The scraper stores some extras as Python-style reprs ({'a': 1, 'b': "x's"}). Pulls out the scalars. */
function packetParseRepr($v): array {
    if (is_array($v)) return $v;
    if (!is_string($v) || $v === '') return [];
    $json = json_decode($v, true);
    if (is_array($json)) return $json;
    $out = [];
    preg_match_all("/'(\\w+)':\\s*('(?:[^'\\\\]|\\\\.)*'|\"(?:[^\"\\\\]|\\\\.)*\"|-?[\\d.]+|None|True|False)/", $v, $m, PREG_SET_ORDER);
    foreach ($m as $p) {
        $val = $p[2];
        if ($val === 'None') $val = null;
        elseif ($val === 'True') $val = true;
        elseif ($val === 'False') $val = false;
        elseif ($val[0] === "'" || $val[0] === '"') $val = stripcslashes(substr($val, 1, -1));
        else $val = $val + 0;
        $out[$p[1]] = $val;
    }
    return $out;
}

function packetBuildDetails(array $p, array $raw, array $interior): array {
    $sections = [];
    $lf = is_array($raw['labeled_fields'] ?? null) ? $raw['labeled_fields'] : [];
    $get = fn(...$keys) => array_reduce($keys, fn($acc, $k) => $acc !== null && $acc !== '' ? $acc : ($lf[$k] ?? ($raw[$k] ?? null)), null);

    // 1. Interior & Systems
    $sec1 = [];
    if (!empty($interior['sqft_above_grade'])) $sec1['Above Grade Finished'] = number_format((float)$interior['sqft_above_grade']) . ' SqFt';
    if (!empty($interior['sqft_below_grade_total'])) $sec1['Below Grade Total'] = number_format((float)$interior['sqft_below_grade_total']) . ' SqFt';
    if (!empty($interior['sqft_below_grade_finished'])) $sec1['Below Grade Finished'] = number_format((float)$interior['sqft_below_grade_finished']) . ' SqFt';
    if (!empty($interior['sqft_below_grade_total']) && isset($interior['sqft_below_grade_finished'])) {
        $unfin = max(0, (float)$interior['sqft_below_grade_total'] - (float)$interior['sqft_below_grade_finished']);
        if ($unfin > 0) $sec1['Below Grade Unfinished'] = number_format($unfin) . ' SqFt';
    }
    if (!empty($interior['psf_finished'])) $sec1['PSF Finished'] = '$' . round((float)$interior['psf_finished']);
    if (!empty($interior['psf_above_grade'])) $sec1['PSF Above Grade'] = '$' . round((float)$interior['psf_above_grade']);
    if (!empty($interior['psf_total'])) $sec1['PSF Total'] = '$' . round((float)$interior['psf_total']);
    
    $bsmt = $interior['basement'] ?? $get('Basement', 'basement');
    if ($bsmt) $sec1['Basement'] = (string)$bsmt;
    $ht = $get('Heating', 'heating');
    if ($ht) $sec1['Heating'] = (string)$ht;
    $cl = $get('Cooling', 'cooling');
    if ($cl) $sec1['Cooling'] = (string)$cl;
    $hvac = $get('HVAC Description', 'hvac_description', 'hvac');
    if ($hvac) $sec1['HVAC Description'] = (string)$hvac;
    $fnd = $get('Foundation', 'foundation');
    if ($fnd) $sec1['Foundation'] = (string)$fnd;
    $fp = $interior['fireplaces'] ?? $get('Fireplaces', 'Fireplace', 'fireplaces');
    if ($fp) $sec1['Fireplaces'] = (string)$fp;
    $fl = $interior['flooring'] ?? $get('Flooring', 'flooring');
    if ($fl) $sec1['Flooring'] = (string)$fl;
    $intFeat = $get('Interior Features', 'interior_features');
    if ($intFeat) $sec1['Interior Features'] = (string)$intFeat;
    $secFeat = $get('Security Features', 'security_features');
    if ($secFeat) $sec1['Security Features'] = (string)$secFeat;
    $winFeat = $get('Window Features', 'window_features');
    if ($winFeat) $sec1['Window Features'] = (string)$winFeat;
    $appl = $interior['appliances'] ?? $get('Appliances', 'appliances');
    if ($appl) $sec1['Appliances'] = (string)$appl;
    $excl = $interior['exclusions'] ?? $get('Exclusions', 'exclusions');
    if ($excl && strtolower(trim((string)$excl)) !== 'none') $sec1['Exclusions'] = (string)$excl;
    $lnd = $get('Laundry', 'laundry');
    if ($lnd) $sec1['Laundry'] = (string)$lnd;
    if ($sec1) $sections['Interior & Systems'] = $sec1;

    // 2. Bed & Bath Summary
    $sec2 = [];
    if (!empty($p['beds'])) $sec2['Bedrooms Total'] = (string)$p['beds'];
    if (!empty($p['baths'])) $sec2['Bathrooms Total'] = (string)$p['baths'];
    if (isset($interior['baths_full'])) $sec2['Bathrooms Full'] = (string)$interior['baths_full'];
    if (isset($interior['baths_3_4'])) $sec2['Three Quarter Baths'] = (string)$interior['baths_3_4'];
    if (isset($interior['baths_1_2'])) $sec2['Half Baths'] = (string)$interior['baths_1_2'];
    foreach (['Upper Level Bedrooms', 'Main Level Bedrooms', 'Lower Level Bedrooms', 'Basement Level Bedrooms',
              'Upper Level Bathrooms', 'Main Level Bathrooms', 'Lower Level Bathrooms', 'Basement Level Bathrooms'] as $bf) {
        $v = $get($bf);
        if ($v !== null && $v !== '') $sec2[$bf] = (string)$v;
    }
    if ($sec2) $sections['Bed & Bath Summary'] = $sec2;

    // 3. Parking & Garage
    $sec3 = [];
    if (isset($p['garage_spaces'])) $sec3['Garage Spaces'] = (string)$p['garage_spaces'];
    if (isset($p['parking_total'])) $sec3['Parking Total'] = (string)$p['parking_total'];
    $pt = $get('Parking Type', 'parking_type');
    if ($pt) $sec3['Parking Type'] = (string)$pt;
    $pf = $get('Parking Features', 'parking_features');
    if ($pf) $sec3['Parking Features'] = (string)$pf;
    foreach (['Parking Length', 'Parking Width', 'Parking Description'] as $k) {
        $v = $get($k);
        if ($v) $sec3[$k] = (string)$v;
    }
    if ($sec3) $sections['Parking'] = $sec3;

    // 4. Building Information
    $sec4 = [];
    $style = $get('Architectural Style', 'architectural_style');
    if ($style) $sec4['Architectural Style'] = (string)$style;
    $propType = $get('Property Sub Type', 'property_sub_type') ?: ($p['property_type'] ?? null);
    if ($propType) $sec4['Property Sub Type'] = (string)$propType;
    $struct = $get('Structure Type', 'structure_type');
    if ($struct) $sec4['Structure Type'] = (string)$struct;
    if (!empty($p['year_built'])) $sec4['Year Built'] = (string)$p['year_built'];
    if (!empty($p['levels'])) $sec4['Levels'] = (string)$p['levels'];
    $facing = $get('Direction Faces', 'direction_faces');
    if ($facing) $sec4['Direction Faces'] = (string)$facing;
    $const = $get('Construction Materials', 'construction_materials');
    if ($const) $sec4['Construction Materials'] = (string)$const;
    $roof = $get('Roof', 'roof');
    if ($roof) $sec4['Roof'] = (string)$roof;
    $ext = $get('Exterior Features', 'exterior_features');
    if ($ext) $sec4['Exterior Features'] = (string)$ext;
    $patio = $get('Patio/Porch Feat', 'Patio And Porch Features', 'patio_porch');
    if ($patio) $sec4['Patio & Porch'] = (string)$patio;
    $builder = $get('Builder Name', 'builder_name');
    if ($builder) $sec4['Builder Name'] = (string)$builder;
    if ($sec4) $sections['Building Information'] = $sec4;

    // 5. Site & Location
    $sec5 = [];
    if (!empty($p['lot_acres']) || !empty($p['lot_sqft'])) {
        $sec5['Lot Size'] = trim(($p['lot_acres'] ? $p['lot_acres'] . ' Acres' : '') . ($p['lot_sqft'] ? ' / ' . number_format((float)$p['lot_sqft']) . ' SqFt' : ''), ' /');
    }
    $fencing = $get('Fencing', 'fencing');
    if ($fencing) $sec5['Fencing'] = (string)$fencing;
    $lotFeat = $get('Lot Features', 'lot_features');
    if ($lotFeat) $sec5['Lot Features'] = (string)$lotFeat;
    $sub = $get('Subdivision Name', 'subdivision_name');
    if ($sub) $sec5['Subdivision'] = (string)$sub;
    $elem = $get('Elementary School', 'elementary_school');
    if ($elem) $sec5['Elementary School'] = (string)$elem;
    $mid = $get('Middle/Junior Sch', 'Middle Or Junior School', 'middle_school');
    if ($mid) $sec5['Middle School'] = (string)$mid;
    $high = $get('High School', 'high_school');
    if ($high) $sec5['High School'] = (string)$high;
    if (!empty($p['school_district'])) $sec5['School District'] = (string)$p['school_district'];
    $zoning = $get('Zoning', 'zoning');
    if ($zoning) $sec5['Zoning'] = (string)$zoning;
    $walk = $get('Walk Score', 'walk_score');
    if ($walk) $sec5['Walk Score'] = (string)$walk;
    if ($sec5) $sections['Site & Location'] = $sec5;

    // 6. Association & Financial
    $sec6 = [];
    $hoaName = $get('Association Name', 'association_name');
    if ($hoaName) $sec6['Association Name'] = (string)$hoaName;
    $hoaType = $get('Association Type', 'association_type');
    if ($hoaType) $sec6['Association Type'] = (string)$hoaType;
    if (!empty($p['hoa_fee'])) {
        $sec6['Assoc Fee / Frequency'] = '$' . round((float)$p['hoa_fee']) . ' Monthly';
        $sec6['Assoc Fee Annual'] = '$' . round((float)$p['hoa_fee'] * 12);
    } else {
        $sec6['Association'] = 'None listed';
    }
    $hoaInd = $get('Assoc Fee Ind', 'association_includes');
    if ($hoaInd) $sec6['Assoc Fee Includes'] = (string)$hoaInd;
    $hoaAmen = $get('Assoc Amenities', 'association_amenities');
    if ($hoaAmen) $sec6['Assoc Amenities'] = (string)$hoaAmen;
    $pets = $get('Pets Allowed', 'pets_allowed');
    if ($pets) $sec6['Pets Allowed'] = (string)$pets;
    $cov = $get('Restriction Covenants YN', 'restriction_covenants');
    if ($cov) $sec6['Restriction Covenants'] = (string)$cov;
    $senior = $get('Senior Community', 'senior_community');
    if ($senior) $sec6['Senior Community'] = (string)$senior;
    if (!empty($p['annual_tax'])) {
        $sec6['Tax Annual Amount'] = '$' . number_format((float)$p['annual_tax']) . (!empty($p['tax_year']) ? " ({$p['tax_year']})" : '');
    }
    $parcel = $get('Parcel Number', 'parcel_number');
    if ($parcel) $sec6['Parcel Number'] = (string)$parcel;
    $legal = $get('Tax Legal Description', 'tax_legal_description');
    if ($legal) $sec6['Tax Legal Description'] = (string)$legal;
    $office = $get('List Office Name', 'list_office_name');
    if ($office) $sec6['List Office Name'] = (string)$office;
    $origPrice = $get('Original List Price', 'original_list_price');
    if ($origPrice && is_numeric($origPrice)) $sec6['Original List Price'] = '$' . number_format((float)$origPrice);
    if ($sec6) $sections['Association & Financial'] = $sec6;

    // 7. Water & Utilities
    $sec7 = [];
    $water = $get('Water Source', 'water_source');
    if ($water) $sec7['Water Source'] = (string)$water;
    $sewer = $get('Sewer', 'sewer');
    if ($sewer) $sec7['Sewer'] = (string)$sewer;
    $util = $get('Utilities', 'utilities');
    if ($util) $sec7['Utilities'] = (string)$util;
    $elec = $get('Electric', 'electric');
    if ($elec) $sec7['Electric'] = (string)$elec;
    if ($sec7) $sections['Water & Utilities'] = $sec7;

    return $sections;
}

/** Buyer copy: drop fields about the listing side or about getting in (contacts, lockbox, showing instructions). */
function packetDetailsForCopy(array $sections, bool $buyerCopy): array {
    if (!$buyerCopy) return $sections;
    $out = [];
    foreach ($sections as $sec => $fields) {
        if (!is_array($fields)) continue;
        $keep = array_filter($fields, fn($label) => !preg_match('/attribution|list(ing)? ?(agent|office)|co-?list|lockbox|key ?box|supra|showing|access|instructions/i', (string)$label), ARRAY_FILTER_USE_KEY);
        if ($keep) $out[$sec] = $keep;
    }
    return $out;
}

/** Listing photo URLs we hold for a listing, main photo first, duplicates dropped. */
function packetPhotoUrls(array $prop, array $raw): array {
    $urls = [];
    if (!empty($prop['main_image_url'])) $urls[] = (string)$prop['main_image_url'];
    foreach (['gallery_images'] as $k) {
        $src = $prop[$k] ?? ($raw[$k] ?? '');
        if (is_string($src) && ($list = json_decode($src, true)) && is_array($list)) $urls = array_merge($urls, array_filter($list, 'is_string'));
        elseif (is_string($src) && preg_match_all('#https?://[^\s\'",\]]+#', $src, $m)) $urls = array_merge($urls, $m[0]);
        elseif (is_array($src)) $urls = array_merge($urls, array_filter($src, 'is_string'));
    }
    // Same photo at different signatures: compare without the signature/size query noise.
    $seen = []; $out = [];
    foreach ($urls as $u) {
        $u = str_replace('\\/', '/', $u);
        // Photos the scraper saved on this site (media/123_0.jpg) are used as they are.
        if (preg_match('#^media/[A-Za-z0-9_.-]+\.(?:jpe?g|png|webp)$#i', $u)) {
            if (!isset($seen[$u])) { $seen[$u] = true; $out[] = $u; }
            continue;
        }
        $host = parse_url($u, PHP_URL_HOST);
        if (!in_array($host, PACKET_PHOTO_HOSTS, true)) continue;
        parse_str((string)parse_url($u, PHP_URL_QUERY), $q);
        $sig = ($q['Key'] ?? '') . '|' . ($q['Number'] ?? $u);
        if (isset($seen[$sig])) continue;
        $seen[$sig] = true;
        $out[] = $u;
    }
    return $out;
}

/** "Must have: List price $500,000-$750,000" style lines for the brief page. */
function packetDescribeCriterion(array $c): string {
    $def = BRIEF_CATALOG[$c['key']] ?? null;
    if (!$def) return '';
    $t = $c['target'] ?? null;
    $label = $c['key'] === 'custom' ? (($t['label'] ?? '') ?: $def['label']) : $def['label'];
    $fmt = fn($v) => briefFmt($c['key'], $v);
    switch ($def['kind']) {
        case 'min': return $t === null ? '' : "$label: at least " . $fmt($t);
        case 'max': return $t === null ? '' : "$label: at most " . $fmt($t);
        case 'range':
            if (!$t) return '';
            if (isset($t['min'], $t['max'])) return "$label: " . $fmt($t['min']) . ' to ' . $fmt($t['max']);
            if (isset($t['min'])) return "$label: at least " . $fmt($t['min']);
            if (isset($t['max'])) return "$label: at most " . $fmt($t['max']);
            return '';
        case 'in': return $t ? "$label: " . implode(', ', (array)$t) : '';
        case 'bool': return $label . ': ' . (($t ?? true) ? 'yes' : 'no');
        case 'payment': return empty($t['max']) ? '' : "Monthly payment: at most $" . number_format((float)$t['max']) . '/mo';
        case 'radius': return isset($t['miles']) ? "Within {$t['miles']} mi of " . ($t['label'] ?? 'a chosen spot') : '';
        case 'keyword': case 'custom':
            $w = $t['keywords'] ?? [];
            if (!$w) return '';
            return ($c['key'] === 'custom' ? "$label: " : '') . implode(', ', $w);
    }
    return '';
}

function packetTourAccess(PDO $pdo): array {
    requireRealtorOrAdmin();
    [$clientId, $me, $isRealtor] = resolveTourTargetClient($pdo);
    if ($clientId === $me) {
        http_response_code(400);
        echo json_encode(['error' => 'Pick a client in the Tour Planner first.']);
        exit;
    }
    return [$clientId, $me];
}

function handleGetTourPacket(PDO $pdo) {
    [$clientId, $me] = packetTourAccess($pdo);
    // Buyer copy: the client may keep it, so nothing about getting in (access notes, lockbox),
    // the listing side's contact details, or the agent's private notes ever leaves the server.
    $buyerCopy = ($_GET['copy'] ?? '') === 'buyer';
    $includePrivate = !$buyerCopy && !empty($_GET['private']);

    $u = $pdo->prepare("SELECT id, username, full_name, email, phone, pipeline_stage, target_min_price, target_max_price,
        target_cities, target_beds, target_timeline FROM users WHERE id = :id");
    $u->execute([':id' => $clientId]);
    $client = $u->fetch(PDO::FETCH_ASSOC) ?: [];
    $u->execute([':id' => $me]);
    $agentRow = $u->fetch(PDO::FETCH_ASSOC) ?: [];
    $b = $pdo->prepare("SELECT brokerage_name, COALESCE(avatar_url, '') AS avatar_url, COALESCE(logo_url, '') AS logo_url FROM users WHERE id = :id");
    $b->execute([':id' => $me]);
    $brand = $b->fetch(PDO::FETCH_ASSOC) ?: [];
    $brokerage = (string)($brand['brokerage_name'] ?? '');
    // Images the PDF can load: uploads on this site, or an https URL (used only if that host allows it).
    $brandImg = fn($u) => (is_string($u) && (preg_match('#^media/[A-Za-z0-9_./-]+\.(?:jpe?g|png)$#i', $u) || preg_match('#^https://#i', $u))) ? $u : '';

    // Brief: the agent's view (includes agent-only criteria), grouped for the prep page.
    $loaded = briefLoad($pdo, $clientId);
    $brief = $loaded['brief'];
    $groups = ['must' => [], 'prefer' => [], 'avoid' => []];
    foreach ($brief['criteria'] as $c) {
        if (empty($c['enabled']) || $c['key'] === 'status') continue;
        $line = packetDescribeCriterion($c);
        if ($line !== '' && isset($groups[$c['mode']])) $groups[$c['mode']][] = $line . (($c['visibility'] ?? '') === 'agent_only' ? ' (agent only)' : '');
    }
    $paymentTarget = null;
    foreach ($brief['criteria'] as $c) if ($c['key'] === 'monthly_payment' && !empty($c['enabled'])) $paymentTarget = $c['target'] ?? null;

    $rate = $pdo->query("SELECT rate, obs_date FROM mortgage_rates WHERE series_id = 'MORTGAGE30US' ORDER BY obs_date DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC) ?: null;
    $ratePct = isset($paymentTarget['rate_pct']) ? (float)$paymentTarget['rate_pct'] : ($rate ? (float)$rate['rate'] : null);
    $downPct = isset($paymentTarget['down_pct']) ? (float)$paymentTarget['down_pct'] : 20.0;

    $settings = $pdo->prepare("SELECT start_address, start_time, tour_date, stay_duration_mins, loop_back FROM tour_settings WHERE user_id = :id");
    $settings->execute([':id' => $clientId]);
    $settings = $settings->fetch(PDO::FETCH_ASSOC) ?: [];

    $stmt = $pdo->prepare("
        SELECT si.mls_id, si.status AS tour_status, si.showing_time, si.access_notes, si.planned_start, si.planned_end,
               COALESCE(si.duration_mins, 20) AS duration_mins, p.*,
               COALESCE(m.favorite, 0) AS m_favorite, COALESCE(m.rating, 0) AS m_rating,
               COALESCE(m.user_notes, '') AS m_user_notes, COALESCE(m.realtor_notes, '') AS m_question,
               COALESCE(m.realtor_private_notes, '') AS m_private, COALESCE(m.toured, 0) AS m_toured,
               c.estimate AS comp_estimate, c.range_low AS comp_low, c.range_high AS comp_high, c.fetched_at AS comp_at,
               r.reso_json
        FROM showing_itinerary si
        JOIN properties p ON p.mls_id = si.mls_id
        LEFT JOIN user_metadata m ON m.user_id = si.client_id AND m.mls_id = si.mls_id
        LEFT JOIN property_comps c ON c.mls_id = si.mls_id
        LEFT JOIN reso_property r ON r.listing_id = si.mls_id
        WHERE si.client_id = :cid AND si.status IN ('confirmed', 'pending')
        ORDER BY si.sort_order, si.updated_at
        LIMIT " . PACKET_MAX_STOPS);
    $stmt->execute([':cid' => $clientId]);

    $homes = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $p) {
        $raw = json_decode((string)($p['raw_mls_json'] ?? ''), true) ?: [];
        $interior = packetParseRepr($raw['interior'] ?? '');
        $reso = json_decode((string)($p['reso_json'] ?? ''), true) ?: [];
        $fit = $reso ? fitScore($brief, $reso, 'agent') : null;

        $price = $p['price'] !== null ? (float)$p['price'] : null;
        $orig = is_numeric($raw['original_list_price'] ?? null) ? (float)$raw['original_list_price'] : null;
        $monthly = null;
        if ($price && $ratePct) {
            $loan = $price * (1 - $downPct / 100);
            $r = $ratePct / 1200; $n = 360;
            $pi = $r > 0 ? $loan * $r / (1 - pow(1 + $r, -$n)) : $loan / $n;
            $monthly = ['pi' => round($pi), 'tax' => $p['annual_tax'] ? round($p['annual_tax'] / 12) : 0, 'hoa' => $p['hoa_fee'] ? round((float)$p['hoa_fee']) : 0];
            $monthly['total'] = $monthly['pi'] + $monthly['tax'] + $monthly['hoa'];
        }

        $listDate = null;
        if (!empty($p['list_date'])) {
            $d = DateTime::createFromFormat('m/d/y', (string)$p['list_date']) ?: DateTime::createFromFormat('Y-m-d', substr((string)$p['list_date'], 0, 10));
            if ($d) $listDate = $d->format('Y-m-d');
        }

        $photos = packetPhotoUrls($p, $raw);
        $homes[] = [
            'mls_id' => $p['mls_id'],
            'tour_status' => $p['tour_status'],
            'showing_time' => $p['showing_time'],
            'planned_start' => $p['planned_start'],
            'planned_end' => $p['planned_end'],
            'duration_mins' => (int)$p['duration_mins'],
            'access_notes' => $buyerCopy ? '' : (string)$p['access_notes'],
            'address' => $p['address'], 'city' => $p['city'], 'state' => $p['state'] ?: 'CO', 'zip' => $p['zip'],
            'lat' => $p['latitude'] !== null ? (float)$p['latitude'] : null,
            'lng' => $p['longitude'] !== null ? (float)$p['longitude'] : null,
            'price' => $price,
            'original_price' => $orig,
            'status' => $p['status'],
            'list_date' => $listDate,
            'beds' => $p['beds'], 'baths' => $p['baths'],
            'baths_full' => $interior['baths_full'] ?? null, 'baths_34' => $interior['baths_3_4'] ?? null, 'baths_half' => $interior['baths_1_2'] ?? null,
            'sqft_total' => $p['sqft_total'], 'sqft_finished' => $p['sqft_finished'],
            'sqft_above' => $interior['sqft_above_grade'] ?? null,
            'sqft_below' => $interior['sqft_below_grade_total'] ?? null,
            'sqft_below_finished' => $interior['sqft_below_grade_finished'] ?? null,
            'lot_acres' => $p['lot_acres'], 'lot_sqft' => $p['lot_sqft'],
            'year_built' => $p['year_built'], 'levels' => $p['levels'],
            'property_type' => $raw['property_sub_type'] ?? $p['property_type'],
            'structure_type' => $raw['structure_type'] ?? null,
            'style' => $raw['architectural_style'] ?? null,
            'subdivision' => $raw['subdivision_name'] ?? null,
            'school_district' => $p['school_district'],
            'schools' => [
                'elementary' => $raw['elementary_school'] ?? ($raw['labeled_fields']['Elementary School'] ?? null),
                'middle' => $raw['middle_school'] ?? ($raw['labeled_fields']['Middle/Junior Sch'] ?? ($raw['labeled_fields']['Middle Or Junior School'] ?? null)),
                'high' => $raw['high_school'] ?? ($raw['labeled_fields']['High School'] ?? null),
                'district' => $p['school_district']
            ],
            'parking_total' => $p['parking_total'], 'garage_spaces' => $p['garage_spaces'],
            'hoa_fee' => $p['hoa_fee'] !== null ? (float)$p['hoa_fee'] : null,
            'annual_tax' => $p['annual_tax'] !== null ? (float)$p['annual_tax'] : null, 'tax_year' => $p['tax_year'],
            'parcel' => $raw['parcel_number'] ?? null,
            'list_office' => $raw['list_office_name'] ?? null,
            'basement' => $interior['basement'] ?? null,
            'flooring' => $interior['flooring'] ?? null,
            'fireplaces' => $interior['fireplaces'] ?? null,
            'appliances' => $interior['appliances'] ?? null,
            'exclusions' => $interior['exclusions'] ?? null,
            'remarks' => (string)($raw['description'] ?? ''),
            'rooms' => is_array($raw['rooms'] ?? null) ? array_values($raw['rooms']) : [],
            // The deep scrape's own MLS sections when it captured them; otherwise a grouped summary
            // built from the fields an older capture has (packetBuildDetails).
            'details' => packetDetailsForCopy((is_array($raw['details'] ?? null) && $raw['details']) ? $raw['details'] : packetBuildDetails($p, $raw, $interior), $buyerCopy),
            // Up to 3 photos as URLs the browser can load: saved copies directly, MLS-hosted ones through
            // tour_packet_photo (same origin, so they can be drawn into the PDF).
            'photos' => array_map(fn($u, $i) => strncmp($u, 'media/', 6) === 0 ? $u
                : 'backend/api.php?action=tour_packet_photo&mls_id=' . rawurlencode($p['mls_id']) . '&n=' . $i,
                array_slice($photos, 0, 3), array_keys(array_slice($photos, 0, 3))),
            'fit' => $fit ? ['score' => $fit['score'], 'band' => $fit['band'], 'reasons' => $fit['reasons']] : null,
            'monthly' => $monthly,
            'value_estimate' => $p['comp_estimate'] !== null ? ['estimate' => (float)$p['comp_estimate'], 'low' => (float)$p['comp_low'], 'high' => (float)$p['comp_high'], 'as_of' => substr((string)$p['comp_at'], 0, 10)] : null,
            'client' => [
                'favorite' => (int)$p['m_favorite'] === 1,
                'rating' => (int)$p['m_rating'],
                'notes' => (string)$p['m_user_notes'],
                'question' => (string)$p['m_question'],
                'toured' => (int)$p['m_toured'] === 1,
            ],
            'private_notes' => $includePrivate ? (string)$p['m_private'] : '',
        ];
    }

    echo json_encode([
        'success' => true,
        'generated_at' => date('Y-m-d H:i'),
        'client' => [
            'client_id' => (int)$clientId,
            'name' => ($client['full_name'] ?? '') ?: ($client['username'] ?? 'Client'),
            'email' => $client['email'] ?? '', 'phone' => $client['phone'] ?? '',
            'stage' => $client['pipeline_stage'] ?? '',
            'timeline' => $client['target_timeline'] ?? '',
        ],
        'agent' => [
            'name' => ($agentRow['full_name'] ?? '') ?: ($agentRow['username'] ?? ''),
            'email' => $agentRow['email'] ?? '', 'phone' => $agentRow['phone'] ?? '', 'brokerage' => $brokerage,
            'headshot' => $brandImg($brand['avatar_url'] ?? ''), 'logo' => $brandImg($brand['logo_url'] ?? ''),
        ],
        'brief' => $groups,
        'payment_basis' => $ratePct ? ['rate_pct' => $ratePct, 'down_pct' => $downPct, 'rate_date' => $rate['obs_date'] ?? null, 'from_brief' => (bool)$paymentTarget] : null,
        'settings' => $settings,
        'homes' => $homes,
    ], JSON_INVALID_UTF8_SUBSTITUTE);
}

function handleTourPacketPhoto(PDO $pdo) {
    requireRealtorOrAdmin();
    $mlsId = tourValidMls($_GET['mls_id'] ?? '');
    $n = max(0, min(30, (int)($_GET['n'] ?? 0)));
    $stmt = $pdo->prepare("SELECT main_image_url, gallery_images, raw_mls_json FROM properties WHERE mls_id = :m");
    $stmt->execute([':m' => (string)$mlsId]);
    $prop = $stmt->fetch(PDO::FETCH_ASSOC);
    $urls = $prop ? packetPhotoUrls($prop, json_decode((string)$prop['raw_mls_json'], true) ?: []) : [];
    if (!isset($urls[$n]) || strncmp($urls[$n], 'http', 4) !== 0) { http_response_code(404); header('Content-Type: application/json'); echo json_encode(['error' => 'No such photo.']); return; }

    $ch = curl_init($urls[$n]);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => 12, CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP, CURLOPT_USERAGENT => 'Dibs tour packet',
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $type = is_string($body) && strncmp($body, "\xFF\xD8\xFF", 3) === 0 ? 'image/jpeg'
        : (is_string($body) && strncmp($body, "\x89PNG", 4) === 0 ? 'image/png' : null);
    if ($code !== 200 || !$type || strlen($body) > 8 * 1024 * 1024) {
        http_response_code(502); header('Content-Type: application/json'); echo json_encode(['error' => 'Photo unavailable.']); return;
    }
    header('Content-Type: ' . $type);
    header('Cache-Control: private, max-age=3600');
    header('X-Content-Type-Options: nosniff');
    echo $body;
}
