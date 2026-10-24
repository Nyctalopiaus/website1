<?php
/**
 * Smart Brief + Fit Score (brief format v2: catalog-driven).
 *
 * A brief is a list of criteria the agent (or client) switches on from BRIEF_CATALOG, each with:
 *   mode       must    - a miss caps the Fit Score at 59
 *              prefer  - weighted, with partial credit inside the criterion's tolerance
 *              avoid   - a match caps the Fit Score at 40 (deal-breaker)
 *   weight     1-5, how much it counts
 *   visibility shared | agent_only (agent-only criteria are hidden from the client, can't be
 *              edited by them, and don't count in the score the client sees)
 *   target     shape depends on the criterion's kind (see briefSanitizeTarget)
 *
 * Templates (first-time buyer, move-up, downsizer, investor) are starting sets of criteria.
 * Custom criteria let an agent add anything the MLS fields don't cover (fence height, garage
 * width, driveway direction): matched against remarks today, confirmable from photos later.
 *
 * Score = 100 * earned / possible over criteria with known listing data, then caps.
 * Bands: 90+ perfect, 75+ strong, 60+ fair, else weak.
 *
 * Reads only reso_property (backend/ingest.php), so it survives the move to a licensed feed.
 */

const BRIEF_VERSION = 2;

// Perfect Match alerts (fitAlertsProcess): score needed, statuses that qualify, alerts per client per run.
const FIT_ALERT_MIN_SCORE = 90;
const FIT_ALERT_STATUSES = ['Active', 'ComingSoon'];
const FIT_ALERT_MAX_PER_RUN = 5;

/**
 * kind: min | max | range | in | bool | payment | radius | keyword | custom
 * tol:  relative tolerance for partial credit in prefer mode (0.10 = 10% past the target -> 0)
 * tol_abs: absolute tolerance instead (years, days, spaces)
 */
const BRIEF_CATALOG = [
    // Location
    'city'             => ['label' => 'City', 'group' => 'Location', 'kind' => 'in'],
    'zip'              => ['label' => 'ZIP code', 'group' => 'Location', 'kind' => 'in'],
    'school_district'  => ['label' => 'School district', 'group' => 'Location', 'kind' => 'in'],
    'radius'           => ['label' => 'Distance from a place', 'group' => 'Location', 'kind' => 'radius', 'tol' => 0.5],
    // Price & monthly cost
    'price'            => ['label' => 'List price', 'group' => 'Price & cost', 'kind' => 'range', 'unit' => '$', 'tol' => 0.10],
    'monthly_payment'  => ['label' => 'Monthly payment (P&I + tax + HOA)', 'group' => 'Price & cost', 'kind' => 'payment', 'unit' => '$/mo', 'tol' => 0.15],
    'hoa'              => ['label' => 'HOA dues', 'group' => 'Price & cost', 'kind' => 'max', 'unit' => '$/mo', 'tol' => 1.0],
    'tax'              => ['label' => 'Property tax', 'group' => 'Price & cost', 'kind' => 'max', 'unit' => '$/yr', 'tol' => 0.5],
    'price_per_sqft'   => ['label' => 'Price per finished sq ft', 'group' => 'Price & cost', 'kind' => 'max', 'unit' => '$', 'tol' => 0.15],
    // The home
    'property_subtype' => ['label' => 'Property type', 'group' => 'Home', 'kind' => 'in'],
    'structure_type'   => ['label' => 'Structure type', 'group' => 'Home', 'kind' => 'in'],
    'beds'             => ['label' => 'Bedrooms', 'group' => 'Home', 'kind' => 'min', 'tol_abs' => 1],
    'baths'            => ['label' => 'Bathrooms', 'group' => 'Home', 'kind' => 'min', 'tol_abs' => 1],
    'finished_sqft'    => ['label' => 'Finished sq ft', 'group' => 'Home', 'kind' => 'range', 'unit' => 'sq ft', 'tol' => 0.15],
    'levels'           => ['label' => 'Levels / stories', 'group' => 'Home', 'kind' => 'in'],
    'year_built'       => ['label' => 'Year built', 'group' => 'Home', 'kind' => 'range', 'tol_abs' => 10],
    'garage'           => ['label' => 'Garage spaces', 'group' => 'Home', 'kind' => 'min', 'tol_abs' => 1],
    'lot_size'         => ['label' => 'Lot size', 'group' => 'Home', 'kind' => 'range', 'unit' => 'acres', 'tol' => 0.25],
    'new_construction' => ['label' => 'New construction', 'group' => 'Home', 'kind' => 'bool'],
    // Market
    'status'           => ['label' => 'Listing status', 'group' => 'Market', 'kind' => 'in'],
    'days_on_market'   => ['label' => 'Days on market', 'group' => 'Market', 'kind' => 'range', 'unit' => 'days', 'tol_abs' => 30],
    // Features
    'keywords'         => ['label' => 'Listing mentions', 'group' => 'Features', 'kind' => 'keyword', 'multiple' => true],
    'custom'           => ['label' => 'Custom criterion', 'group' => 'Features', 'kind' => 'custom', 'multiple' => true],
];

const BRIEF_STATUSES = ['Active', 'ActiveUnderContract', 'ComingSoon', 'Pending', 'Closed', 'Withdrawn', 'Expired', 'Canceled', 'Hold'];

/** Starting criteria per template. Targets left out are filled in by the agent. */
function briefTemplates(): array {
    $c = fn($key, $mode, $weight, $target = null) => ['key' => $key, 'mode' => $mode, 'weight' => $weight] + ($target !== null ? ['target' => $target] : []);
    $active = $c('status', 'must', 3, ['Active', 'ComingSoon']);
    return [
        'first_time' => ['label' => 'First-time buyer', 'criteria' => [
            $c('monthly_payment', 'must', 5), $c('price', 'must', 4), $c('city', 'must', 4), $c('beds', 'must', 3),
            $c('baths', 'prefer', 2), $c('property_subtype', 'prefer', 2), $c('hoa', 'prefer', 2), $active]],
        'move_up' => ['label' => 'Move-up buyer', 'criteria' => [
            $c('price', 'must', 4), $c('beds', 'must', 3), $c('finished_sqft', 'prefer', 4), $c('school_district', 'prefer', 4),
            $c('garage', 'prefer', 3), $c('lot_size', 'prefer', 2), $c('year_built', 'prefer', 2), $active]],
        'downsizer' => ['label' => 'Downsizer', 'criteria' => [
            $c('price', 'must', 4), $c('levels', 'prefer', 5, ['One']), $c('finished_sqft', 'prefer', 3), $c('hoa', 'prefer', 3),
            $c('lot_size', 'prefer', 2), $c('year_built', 'prefer', 2), $active]],
        'investor' => ['label' => 'Investor', 'criteria' => [
            $c('price', 'must', 5), $c('price_per_sqft', 'prefer', 5), $c('days_on_market', 'prefer', 4), $c('tax', 'prefer', 3),
            $c('hoa', 'prefer', 3), $c('property_subtype', 'prefer', 2), $active]],
        'blank' => ['label' => 'Start from scratch', 'criteria' => [$active]],
    ];
}

function briefMigrate(PDO $pdo): void {
    runMigration($pdo, "CREATE TABLE IF NOT EXISTS client_brief (
        user_id INTEGER PRIMARY KEY,
        brief_json TEXT NOT NULL,
        updated_by INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )", 'client_brief');
}
briefMigrate($pdo);
fitAlertsMigrate($pdo);
// Listings queued by the ingest drain (bootstrap.php runs it before this file loads).
if ($pdo->query("SELECT 1 FROM fit_alert_queue LIMIT 1")->fetchColumn()) fitAlertsProcess($pdo);

// ---------------------------------------------------------------- access

function briefIsStaff(): bool {
    $role = $_SESSION['role'] ?? '';
    return !empty($_SESSION['is_admin']) || $role === 'admin' || $role === 'realtor';
}

/** Self, an admin, or the client's assigned realtor may read or edit a brief. */
function briefCanAccess(PDO $pdo, int $targetUserId): bool {
    $me = (int)($_SESSION['user_id'] ?? 0);
    if ($me <= 0) return false;
    if ($me === $targetUserId) return true;
    if (!empty($_SESSION['is_admin']) || ($_SESSION['role'] ?? '') === 'admin') return true;
    $stmt = $pdo->prepare("SELECT 1 FROM users WHERE id = :cid AND realtor_id = :rid");
    $stmt->execute([':cid' => $targetUserId, ':rid' => $me]);
    return (bool)$stmt->fetchColumn();
}

function briefTargetUserId(PDO $pdo, $raw): int {
    $id = (int)($raw ?: ($_SESSION['user_id'] ?? 0));
    if ($id <= 0 || !briefCanAccess($pdo, $id)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'You do not have access to this brief.']);
        exit;
    }
    return $id;
}

/** 'agent' for staff, 'client' for a client viewing their own brief. */
function briefViewer(): string {
    return briefIsStaff() ? 'agent' : 'client';
}

// ---------------------------------------------------------------- sanitizing

/**
 * Free text the user types (keywords, custom names and notes, place names): letters, digits,
 * spaces and ordinary punctuation only, whitespace collapsed, length capped. Everything is also
 * escaped on output, so this is defense in depth, not the only guard.
 */
function briefCleanText($v, int $max): string {
    $s = is_scalar($v) ? (string)$v : '';
    $s = preg_replace("/[^\p{L}\p{N} '\x{2019}\-\/&.,#()+%]/u", ' ', $s) ?? '';
    return mb_substr(trim(preg_replace('/\s+/u', ' ', $s)), 0, $max);
}

function briefList($v, int $max = 40): array {
    $items = is_array($v) ? $v : preg_split('/[,;\n]+/', (string)(is_scalar($v) ? $v : ''));
    $out = [];
    foreach ($items as $item) {
        $item = briefCleanText($item, 60);
        if ($item !== '' && !in_array(mb_strtolower($item), array_map('mb_strtolower', $out), true)) $out[] = $item;
    }
    return array_slice($out, 0, $max);
}

/** A number inside [$lo, $hi], or null. */
function briefNum($v, float $lo = 0, float $hi = 1e9): ?float {
    if ($v === null || $v === '' || !is_numeric($v)) return null;
    $f = (float)$v;
    return ($f >= $lo && $f <= $hi) ? $f : null;
}

/**
 * Allowed values for the checkbox criteria: the distinct Colorado values in reso_property,
 * with listing counts. City, ZIP, school district, property/structure type and levels can only
 * be saved as one of these (or a value already on the brief).
 */
const BRIEF_OPTION_FIELDS = [
    'city' => 'City', 'zip' => 'PostalCode', 'school_district' => 'HighSchoolDistrict',
    'property_subtype' => 'PropertySubType', 'structure_type' => 'StructureType', 'levels' => 'Levels',
];

function briefOptions(PDO $pdo): array {
    $out = array_fill_keys(array_keys(BRIEF_OPTION_FIELDS), []);
    foreach ($pdo->query("SELECT reso_json FROM reso_property") as $row) {
        $l = json_decode($row['reso_json'], true) ?: [];
        $state = strtoupper(trim((string)($l['StateOrProvince'] ?? 'CO')));
        if ($state !== 'CO' && $state !== 'COLORADO') continue;
        foreach (BRIEF_OPTION_FIELDS as $key => $field) {
            foreach ((array)($l[$field] ?? []) as $v) {
                $v = trim((string)$v);
                if ($v === '') continue;
                $lk = mb_strtolower($v);
                if (!isset($out[$key][$lk])) $out[$key][$lk] = ['value' => $v, 'count' => 0];
                $out[$key][$lk]['count']++;
            }
        }
    }
    foreach ($out as &$list) {
        $list = array_values($list);
        usort($list, fn($a, $b) => strnatcasecmp($a['value'], $b['value']));
    }
    return $out;
}

/**
 * Keeps only allowed values for each checkbox criterion, mapped to their canonical spelling.
 * $stored = the brief as saved before, so a value whose listings have since gone is not lost.
 */
function briefRestrictToOptions(array $brief, array $options, array $stored): array {
    $storedById = [];
    foreach ($stored['criteria'] ?? [] as $c) $storedById[$c['id']] = $c;
    foreach ($brief['criteria'] as &$c) {
        if (!isset(BRIEF_OPTION_FIELDS[$c['key']]) || !is_array($c['target'] ?? null)) continue;
        $allowed = [];
        foreach ($options[$c['key']] ?? [] as $o) $allowed[mb_strtolower($o['value'])] = $o['value'];
        foreach ((array)($storedById[$c['id']]['target'] ?? []) as $v) $allowed[mb_strtolower($v)] = $allowed[mb_strtolower($v)] ?? $v;
        $c['target'] = array_values(array_unique(array_filter(array_map(fn($v) => $allowed[mb_strtolower($v)] ?? null, $c['target']))));
    }
    return $brief;
}

function briefSanitizeTarget(string $kind, $t) {
    switch ($kind) {
        case 'min': case 'max':
            return briefNum(is_array($t) ? null : $t);
        case 'range':
            $t = is_array($t) ? $t : [];
            return array_filter(['min' => briefNum($t['min'] ?? null), 'max' => briefNum($t['max'] ?? null)], fn($v) => $v !== null);
        case 'in':
            return briefList($t);
        case 'bool':
            return filter_var($t, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? true;
        case 'payment':
            $t = is_array($t) ? $t : [];
            return array_filter([
                'max' => briefNum($t['max'] ?? null, 1, 100000),
                'rate_pct' => briefNum($t['rate_pct'] ?? null, 0, 25),
                'down_pct' => briefNum($t['down_pct'] ?? null, 0, 100),
                'term_years' => briefNum($t['term_years'] ?? 30, 1, 50),
            ], fn($v) => $v !== null);
        case 'radius':
            $t = is_array($t) ? $t : [];
            return array_filter([
                'lat' => briefNum($t['lat'] ?? null, -90, 90), 'lng' => briefNum($t['lng'] ?? null, -180, 180),
                'miles' => briefNum($t['miles'] ?? null, 0.1, 500), 'label' => briefCleanText($t['label'] ?? '', 80),
            ], fn($v) => $v !== null && $v !== '');
        case 'keyword':
            return ['keywords' => briefList(is_array($t) ? ($t['keywords'] ?? []) : $t, 30)];
        case 'custom':
            $t = is_array($t) ? $t : [];
            return [
                'label' => briefCleanText($t['label'] ?? '', 60),
                'keywords' => briefList($t['keywords'] ?? [], 20),
                'note' => briefCleanText($t['note'] ?? '', 300),
            ];
    }
    return null;
}

function briefSanitizeCriterion(array $c, int $index): ?array {
    $key = (string)($c['key'] ?? '');
    $def = BRIEF_CATALOG[$key] ?? null;
    if (!$def) return null;
    $kind = $def['kind'];
    $modes = in_array($kind, ['in', 'bool', 'keyword', 'custom'], true) ? ['must', 'prefer', 'avoid'] : ['must', 'prefer'];
    $mode = in_array($c['mode'] ?? '', $modes, true) ? $c['mode'] : 'prefer';
    $id = preg_replace('/[^a-z0-9_-]/i', '', (string)($c['id'] ?? '')) ?: (!empty($def['multiple']) ? "$key-$index" : $key);
    $out = [
        'id' => mb_substr($id, 0, 40),
        'key' => $key,
        'enabled' => !isset($c['enabled']) || filter_var($c['enabled'], FILTER_VALIDATE_BOOLEAN),
        'mode' => $mode,
        'weight' => max(1, min(5, (int)($c['weight'] ?? 3))),
        'visibility' => ($c['visibility'] ?? '') === 'agent_only' ? 'agent_only' : 'shared',
    ];
    if (array_key_exists('target', $c)) $out['target'] = briefSanitizeTarget($kind, $c['target']);
    if ($key === 'status' && isset($out['target'])) {
        $out['target'] = array_values(array_intersect($out['target'], BRIEF_STATUSES));
    }
    return $out;
}

function briefSanitize(array $in): array {
    $criteria = [];
    $seen = [];
    foreach (array_slice(is_array($in['criteria'] ?? null) ? $in['criteria'] : [], 0, 60) as $i => $c) {
        if (!is_array($c) || !($s = briefSanitizeCriterion($c, $i))) continue;
        $single = empty(BRIEF_CATALOG[$s['key']]['multiple']);
        if (isset($seen[$s['id']]) || ($single && isset($seen['key:' . $s['key']]))) continue;
        $seen[$s['id']] = true;
        $seen['key:' . $s['key']] = true;
        $criteria[] = $s;
    }
    $template = (string)($in['template'] ?? 'blank');
    return ['version' => BRIEF_VERSION, 'template' => isset(briefTemplates()[$template]) ? $template : 'blank', 'criteria' => $criteria];
}

/** Removes agent-only criteria for a client viewer. */
function briefForViewer(array $brief, string $viewer): array {
    if ($viewer === 'agent') return $brief;
    $brief['criteria'] = array_values(array_filter($brief['criteria'], fn($c) => $c['visibility'] !== 'agent_only'));
    return $brief;
}

// ---------------------------------------------------------------- loading

function briefLoad(PDO $pdo, int $userId): array {
    $stmt = $pdo->prepare("SELECT brief_json, updated_at FROM client_brief WHERE user_id = :id");
    $stmt->execute([':id' => $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $saved = $row ? json_decode($row['brief_json'], true) : null;
    if (is_array($saved) && ($saved['version'] ?? 0) === BRIEF_VERSION) {
        return ['brief' => briefSanitize($saved), 'source' => 'saved', 'updated_at' => $row['updated_at']];
    }
    // No v2 brief yet: seed from the client's existing target_* / must_haves / deal_breakers.
    $u = $pdo->prepare("SELECT target_min_price, target_max_price, target_beds, target_cities, must_haves, deal_breakers FROM users WHERE id = :id");
    $u->execute([':id' => $userId]);
    $user = $u->fetch(PDO::FETCH_ASSOC) ?: [];
    $criteria = [['key' => 'status', 'mode' => 'must', 'weight' => 3, 'target' => ['Active', 'ComingSoon']]];
    if (!empty($user['target_min_price']) || !empty($user['target_max_price'])) {
        $criteria[] = ['key' => 'price', 'mode' => 'must', 'weight' => 4, 'target' => ['min' => $user['target_min_price'], 'max' => $user['target_max_price']]];
    }
    if (!empty($user['target_beds'])) $criteria[] = ['key' => 'beds', 'mode' => 'must', 'weight' => 3, 'target' => $user['target_beds']];
    if (!empty($user['target_cities'])) $criteria[] = ['key' => 'city', 'mode' => 'must', 'weight' => 4, 'target' => $user['target_cities']];
    if (!empty($user['must_haves'])) $criteria[] = ['id' => 'keywords-must', 'key' => 'keywords', 'mode' => 'must', 'weight' => 3, 'target' => $user['must_haves']];
    if (!empty($user['deal_breakers'])) $criteria[] = ['id' => 'keywords-avoid', 'key' => 'keywords', 'mode' => 'avoid', 'weight' => 3, 'target' => $user['deal_breakers']];
    return ['brief' => briefSanitize(['template' => 'blank', 'criteria' => $criteria]), 'source' => 'seeded', 'updated_at' => null];
}

// ---------------------------------------------------------------- scoring

/** The listing's value for a catalog key, or null when the listing data doesn't have it. */
function briefListingValue(string $key, array $l) {
    switch ($key) {
        case 'city': return $l['City'] ?? null;
        case 'zip': return $l['PostalCode'] ?? null;
        case 'school_district': return $l['HighSchoolDistrict'] ?? null;
        case 'price': return $l['ListPrice'] ?? null;
        case 'hoa': return ($l['AssociationYN'] ?? null) === false ? 0.0 : ($l['AssociationFee'] ?? null);
        case 'tax': return $l['TaxAnnualAmount'] ?? null;
        case 'price_per_sqft':
            return (!empty($l['ListPrice']) && !empty($l['LivingArea'])) ? round($l['ListPrice'] / $l['LivingArea']) : null;
        case 'property_subtype': return $l['PropertySubType'] ?? null;
        case 'structure_type': return $l['StructureType'] ?? null;
        case 'beds': return $l['BedroomsTotal'] ?? null;
        case 'baths': return isset($l['BathroomsFull']) ? $l['BathroomsFull'] + 0.5 * ($l['BathroomsHalf'] ?? 0) : null;
        case 'finished_sqft': return $l['LivingArea'] ?? null;
        case 'levels': return $l['Levels'] ?? null;
        case 'year_built': return $l['YearBuilt'] ?? null;
        case 'garage': return $l['GarageSpaces'] ?? null;
        case 'lot_size':
            if (isset($l['LotSizeAcres'])) return $l['LotSizeAcres'];
            return isset($l['LotSizeSquareFeet']) ? round($l['LotSizeSquareFeet'] / 43560, 2) : null;
        case 'new_construction': return $l['NewConstructionYN'] ?? null;
        case 'status': return $l['StandardStatus'] ?? null;
        case 'days_on_market':
            if (isset($l['DaysOnMarket'])) return $l['DaysOnMarket'];
            $d = isset($l['ListingContractDate']) ? strtotime($l['ListingContractDate']) : false;
            return $d ? max(0, (int)floor((time() - $d) / 86400)) : null;
    }
    return null;
}

/** 0..1 credit for a numeric value against a bound, using the criterion's tolerance. */
function briefCredit(float $miss, float $target, array $def): float {
    if ($miss <= 0) return 1.0;
    $span = isset($def['tol_abs']) ? (float)$def['tol_abs'] : abs($target) * (float)($def['tol'] ?? 0.10);
    return $span > 0 ? max(0.0, 1 - $miss / $span) : 0.0;
}

function briefFmt(string $key, $v): string {
    $unit = BRIEF_CATALOG[$key]['unit'] ?? '';
    if ($unit === '$' || $unit === '$/mo' || $unit === '$/yr') return '$' . number_format((float)$v) . substr($unit, 1);
    if ($unit === 'acres') return rtrim(rtrim(number_format((float)$v, 2), '0'), '.') . ' acres';
    if ($unit === 'sq ft') return number_format((float)$v) . ' sq ft';
    if ($unit === 'days') return (int)$v . ' days';
    return is_float($v) && floor($v) == $v ? (string)(int)$v : (string)$v;
}

/**
 * Normalizes listing text for keyword matching: lowercase, measurements unified
 * (6', 6 ft, 6-foot, six foot -> "6 ft"), punctuation dropped.
 */
function briefNormText(string $s): string {
    $s = mb_strtolower($s);
    $s = str_replace(["\u{2019}", "\u{2018}", "\u{2032}", "\u{2033}", "\u{201C}", "\u{201D}"], ["'", "'", "'", '"', '"', '"'], $s);
    $words = ['one' => 1, 'two' => 2, 'three' => 3, 'four' => 4, 'five' => 5, 'six' => 6, 'seven' => 7, 'eight' => 8, 'nine' => 9, 'ten' => 10, 'twelve' => 12];
    $s = preg_replace_callback('/\b(' . implode('|', array_keys($words)) . ')[\s-]*(?=(foot|feet|ft)\b)/', fn($m) => $words[$m[1]] . ' ', $s);
    $s = preg_replace("/(\d+)\s*-?\s*(?:'|foot|feet|ft\.?)(?![a-z])/", '$1 ft ', $s);
    return trim(preg_replace('/[^a-z0-9]+/', ' ', $s));
}

function briefTokens(string $s): array {
    $n = briefNormText($s);
    return $n === '' ? [] : explode(' ', $n);
}

/** Crude stem so "fence", "fenced", "fencing", "fences" compare equal. */
function briefStem(string $w): string {
    if (ctype_digit($w) || strlen($w) <= 4) return $w;
    foreach (['ing', 'ed', 'es', 's', 'e'] as $suffix) {
        if (strlen($w) - strlen($suffix) >= 4 && substr($w, -strlen($suffix)) === $suffix) return substr($w, 0, -strlen($suffix));
    }
    return $w;
}

/**
 * True when the keyword's words appear in order with at most one other word between each pair.
 * Words compare by stem ("fence" finds "fenced", "fencing"); numbers must match exactly.
 * So "6' fence" finds "6 ft privacy fence" and "six-foot fencing", while "small kitchen"
 * does not fire on "small but efficient kitchen".
 */
function briefPhraseFound(array $remarkTokens, string $keyword): bool {
    $kt = array_map('briefStem', briefTokens($keyword));
    $m = count($kt);
    if ($m === 0) return false;
    $rt = array_map('briefStem', $remarkTokens);
    $match = fn($a, $b) => ctype_digit($b) ? $a === $b : strncmp($a, $b, strlen($b)) === 0;
    $n = count($rt);
    for ($i = 0; $i < $n; $i++) {
        if (!$match($rt[$i], $kt[0])) continue;
        $j = 1; $last = $i;
        for ($p = $i + 1; $p < $n && $j < $m && $p <= $last + 2; $p++) {
            if ($match($rt[$p], $kt[$j])) { $j++; $last = $p; }
        }
        if ($j === $m) return true;
    }
    return false;
}

/** Evaluates one criterion. Returns [status, credit 0..1, detail]; status pass|partial|miss|unknown|match. */
function briefEvaluate(array $c, array $l): array {
    $key = $c['key'];
    $def = BRIEF_CATALOG[$key];
    $t = $c['target'] ?? null;

    switch ($def['kind']) {
        case 'min': case 'max':
            if ($t === null) return ['unset', 0, 'No target set'];
            $v = briefListingValue($key, $l);
            if ($v === null) return ['unknown', 0, 'Not in listing data'];
            $miss = $def['kind'] === 'min' ? $t - $v : $v - $t;
            $credit = briefCredit($miss, $t, $def);
            $word = $def['kind'] === 'min' ? 'min' : 'max';
            return [$miss <= 0 ? 'pass' : ($credit > 0 ? 'partial' : 'miss'), $credit, briefFmt($key, $v) . " vs. $word " . briefFmt($key, $t)];

        case 'range':
            if (!$t) return ['unset', 0, 'No target set'];
            $v = briefListingValue($key, $l);
            if ($v === null) return ['unknown', 0, 'Not in listing data'];
            $credit = 1.0; $bounds = [];
            if (isset($t['min'])) { $credit = min($credit, briefCredit($t['min'] - $v, $t['min'], $def)); $bounds[] = 'min ' . briefFmt($key, $t['min']); }
            if (isset($t['max'])) { $credit = min($credit, briefCredit($v - $t['max'], $t['max'], $def)); $bounds[] = 'max ' . briefFmt($key, $t['max']); }
            $inside = (!isset($t['min']) || $v >= $t['min']) && (!isset($t['max']) || $v <= $t['max']);
            return [$inside ? 'pass' : ($credit > 0 ? 'partial' : 'miss'), $credit, briefFmt($key, $v) . ' vs. ' . implode(', ', $bounds)];

        case 'in':
            if (!$t) return ['unset', 0, 'No target set'];
            $v = briefListingValue($key, $l);
            if ($v === null) return ['unknown', 0, 'Not in listing data'];
            $values = array_map('mb_strtolower', (array)$v);
            $hit = (bool)array_intersect($values, array_map('mb_strtolower', $t));
            return [$hit ? 'match' : 'nomatch', $hit ? 1 : 0, implode(', ', (array)$v)];

        case 'bool':
            $v = briefListingValue($key, $l);
            if ($v === null) return ['unknown', 0, 'Not in listing data'];
            $hit = (bool)$v === (bool)($t ?? true);
            return [$hit ? 'match' : 'nomatch', $hit ? 1 : 0, $v ? 'Yes' : 'No'];

        case 'payment':
            if (empty($t['max']) || empty($t['rate_pct'])) return ['unset', 0, 'Needs a max payment and a rate'];
            $price = $l['ListPrice'] ?? null;
            if ($price === null) return ['unknown', 0, 'Not in listing data'];
            $loan = $price * (1 - ($t['down_pct'] ?? 20) / 100);
            $r = $t['rate_pct'] / 1200; $n = ($t['term_years'] ?? 30) * 12;
            $pi = $r > 0 ? $loan * $r / (1 - pow(1 + $r, -$n)) : $loan / $n;
            $monthly = round($pi + ($l['TaxAnnualAmount'] ?? 0) / 12 + (briefListingValue('hoa', $l) ?? 0));
            $credit = briefCredit($monthly - $t['max'], $t['max'], $def);
            $detail = '$' . number_format($monthly) . '/mo vs. max $' . number_format($t['max']) . '/mo (excludes insurance)';
            return [$monthly <= $t['max'] ? 'pass' : ($credit > 0 ? 'partial' : 'miss'), $credit, $detail];

        case 'radius':
            if (!isset($t['lat'], $t['lng'], $t['miles'])) return ['unset', 0, 'No place set'];
            if (!isset($l['Latitude'], $l['Longitude'])) return ['unknown', 0, 'Listing has no map location'];
            $dLat = deg2rad($l['Latitude'] - $t['lat']); $dLng = deg2rad($l['Longitude'] - $t['lng']);
            $a = sin($dLat / 2) ** 2 + cos(deg2rad($t['lat'])) * cos(deg2rad($l['Latitude'])) * sin($dLng / 2) ** 2;
            $miles = round(3958.8 * 2 * atan2(sqrt($a), sqrt(1 - $a)), 1);
            $credit = briefCredit($miles - $t['miles'], $t['miles'], $def);
            $place = $t['label'] ?? 'the chosen spot';
            return [$miles <= $t['miles'] ? 'pass' : ($credit > 0 ? 'partial' : 'miss'), $credit, "$miles mi from $place (max {$t['miles']})"];

        case 'keyword': case 'custom':
            $words = $t['keywords'] ?? [];
            if (!$words) return ['unset', 0, 'No keywords set'];
            if (trim($l['PublicRemarks'] ?? '') === '') return ['unknown', 0, 'No listing remarks captured'];
            $tokens = briefTokens($l['PublicRemarks']);
            $hits = array_values(array_filter($words, fn($w) => briefPhraseFound($tokens, $w)));
            if ($hits) return ['match', 1, 'Remarks mention "' . implode('", "', $hits) . '"'];
            return ['nomatch', 0, 'Not mentioned: "' . implode('", "', $words) . '"'];
    }
    return ['unset', 0, ''];
}

/**
 * Scores one listing. $viewer 'client' leaves agent-only criteria out of both the score and the
 * reasons, so a client never sees a number they can't explain.
 */
function fitScore(array $brief, array $l, string $viewer = 'agent'): array {
    $earned = 0.0; $possible = 0.0; $cap = 100; $reasons = [];
    foreach ($brief['criteria'] as $c) {
        if (!$c['enabled'] || ($viewer === 'client' && $c['visibility'] === 'agent_only')) continue;
        $def = BRIEF_CATALOG[$c['key']];
        [$status, $credit, $detail] = briefEvaluate($c, $l);
        if ($status === 'unset') continue;
        $label = $c['key'] === 'custom' ? (($c['target']['label'] ?? '') ?: $def['label']) : $def['label'];
        $w = $c['weight'];
        $result = 'unknown';

        if ($status === 'unknown') {
            $result = 'unknown';
        } elseif ($c['mode'] === 'avoid') {
            // Deal-breaker: a match caps the score; no match counts as satisfied.
            if ($status === 'match') { $result = 'dealbreaker'; $cap = min($cap, 40); }
            else { $result = 'pass'; $possible += $w; $earned += $w; $detail = $def['kind'] === 'keyword' || $def['kind'] === 'custom' ? 'Not mentioned' : $detail; }
        } elseif (in_array($def['kind'], ['keyword', 'custom'], true) && $status === 'nomatch') {
            // Remarks rarely state fences, garage width, etc.: unconfirmed, not a miss.
            $result = 'unconfirmed';
            $detail .= " \u{2014} check photos";
        } else {
            $hit = in_array($status, ['pass', 'match'], true);
            $partial = $status === 'partial';
            $result = $hit ? 'pass' : ($partial && $c['mode'] === 'prefer' ? 'partial' : 'miss');
            $possible += $w;
            $earned += $w * ($c['mode'] === 'must' ? ($hit ? 1 : 0) : $credit);
            if ($c['mode'] === 'must' && !$hit) $cap = min($cap, 59);
        }

        $reasons[] = ['id' => $c['id'], 'criterion' => $label, 'mode' => $c['mode'], 'weight' => $w, 'result' => $result,
            'detail' => $detail, 'agent_only' => $c['visibility'] === 'agent_only'];
    }

    if ($possible <= 0) return ['score' => null, 'band' => null, 'reasons' => $reasons];
    $score = (int)min($cap, round(100 * $earned / $possible));
    $band = $score >= 90 ? 'perfect' : ($score >= 75 ? 'strong' : ($score >= 60 ? 'fair' : 'weak'));
    return ['score' => $score, 'band' => $band, 'reasons' => $reasons];
}

// ---------------------------------------------------------------- Perfect Match alerts


/**
 * fit_alerts records every (client, listing) pair already handled, so each Perfect Match is sent
 * once. When the table is first created, today's 90+ pairs are recorded as 'silent' so turning
 * the feature on doesn't flood anyone with alerts for listings they've already seen.
 */
function fitAlertsMigrate(PDO $pdo): void {
    $exists = $pdo->query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'fit_alerts'")->fetchColumn();
    if ($exists) return;
    runMigration($pdo, "CREATE TABLE IF NOT EXISTS fit_alerts (
        user_id INTEGER NOT NULL,
        listing_id TEXT NOT NULL,
        score INTEGER,
        delivery TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, listing_id)
    )", 'fit_alerts');
    try {
        $pdo->exec("DELETE FROM fit_alert_queue");
        fitAlertsRun($pdo, $pdo->query("SELECT listing_id FROM reso_property")->fetchAll(PDO::FETCH_COLUMN), true);
    } catch (Throwable $e) {
        logEvent($pdo, 'brief', 'warn', 'Perfect Match baseline failed: ' . $e->getMessage());
    }
}

/** A brief needs two real criteria besides status, or "Active" alone would score 100 everywhere. */
function briefIsAlertable(array $brief): bool {
    $n = 0;
    foreach ($brief['criteria'] as $c) {
        if (!$c['enabled'] || $c['key'] === 'status' || $c['mode'] === 'avoid') continue;
        $t = $c['target'] ?? null;
        if ($t === null || $t === [] || $t === '' || (is_array($t) && !array_filter($t, fn($v) => $v !== null && $v !== '' && $v !== []))) continue;
        $n++;
    }
    return $n >= 2;
}

/** Processes queued listings. Never throws: a failure is logged and the queue kept for next time. */
function fitAlertsProcess(PDO $pdo, int $limit = 300): void {
    try {
        $ids = $pdo->query("SELECT listing_id FROM fit_alert_queue LIMIT " . (int)$limit)->fetchAll(PDO::FETCH_COLUMN);
        if (!$ids) return;
        fitAlertsRun($pdo, $ids, false);
        $del = $pdo->prepare("DELETE FROM fit_alert_queue WHERE listing_id = :id");
        foreach ($ids as $id) $del->execute([':id' => $id]);
    } catch (Throwable $e) {
        logEvent($pdo, 'brief', 'warn', 'Perfect Match check failed: ' . $e->getMessage());
    }
}

/** Scores $listingIds for every client with a usable brief; records (and unless $silent, notifies) new 90+ matches. */
function fitAlertsRun(PDO $pdo, array $listingIds, bool $silent): void {
    if (!$listingIds) return;
    $listings = [];
    $get = $pdo->prepare("SELECT reso_json FROM reso_property WHERE listing_id = :id");
    foreach ($listingIds as $id) {
        $get->execute([':id' => $id]);
        $json = $get->fetchColumn();
        $l = $json ? json_decode($json, true) : null;
        if (is_array($l) && in_array($l['StandardStatus'] ?? '', FIT_ALERT_STATUSES, true)) $listings[(string)$id] = $l;
    }
    if (!$listings) return;

    $clients = $pdo->query("SELECT id, username, full_name, realtor_id FROM users
        WHERE role = 'client' OR id IN (SELECT user_id FROM client_brief)")->fetchAll(PDO::FETCH_ASSOC);
    $seen = $pdo->prepare("SELECT 1 FROM fit_alerts WHERE user_id = :u AND listing_id = :l");
    $record = $pdo->prepare("INSERT OR IGNORE INTO fit_alerts (user_id, listing_id, score, delivery) VALUES (:u, :l, :s, :d)");

    foreach ($clients as $client) {
        $brief = briefLoad($pdo, (int)$client['id'])['brief'];
        if (!briefIsAlertable($brief)) continue;
        $matches = [];
        foreach ($listings as $id => $l) {
            $seen->execute([':u' => $client['id'], ':l' => $id]);
            if ($seen->fetchColumn()) continue;
            $fit = fitScore($brief, $l, 'agent');
            if (($fit['score'] ?? 0) >= FIT_ALERT_MIN_SCORE) $matches[$id] = $fit['score'];
        }
        if (!$matches) continue;
        arsort($matches);

        $sent = 0;
        foreach ($matches as $id => $score) {
            $deliver = !$silent && $sent < FIT_ALERT_MAX_PER_RUN;
            $record->execute([':u' => $client['id'], ':l' => $id, ':s' => $score, ':d' => $deliver ? 'notified' : ($silent ? 'silent' : 'summarized')]);
            if (!$deliver) continue;
            $sent++;
            $l = $listings[$id];
            $where = trim(($l['UnparsedAddress'] ?? "MLS #$id") . (isset($l['City']) ? ', ' . $l['City'] : ''));
            $price = isset($l['ListPrice']) ? ' at $' . number_format($l['ListPrice']) : '';
            createNotification($pdo, (int)$client['id'], 'perfect_match', "Perfect Match: $score Fit",
                "$where$price matches your brief.", "#detail-$id");
            if (!empty($client['realtor_id']) && (int)$client['realtor_id'] !== (int)$client['id']) {
                $name = $client['full_name'] ?: $client['username'];
                createNotification($pdo, (int)$client['realtor_id'], 'perfect_match', "Perfect Match for $name",
                    "$where$price scores $score against $name's brief.", "#detail-$id");
            }
        }
        $extra = count($matches) - $sent;
        if (!$silent && $extra > 0) {
            createNotification($pdo, (int)$client['id'], 'perfect_match', 'More Perfect Matches',
                "$extra more new listing" . ($extra === 1 ? '' : 's') . " scored 90+ against your brief.", '');
        }
        if (!$silent) logEvent($pdo, 'brief', 'info', "Perfect Match: {$sent} alert(s) sent", null,
            ['client_id' => (int)$client['id'], 'matches' => count($matches)], null);
    }
}

// ---------------------------------------------------------------- handlers

function handleBriefCatalog(PDO $pdo) {
    $catalog = [];
    foreach (BRIEF_CATALOG as $key => $def) {
        $catalog[] = ['key' => $key, 'label' => $def['label'], 'group' => $def['group'], 'kind' => $def['kind'],
            'unit' => $def['unit'] ?? null, 'multiple' => !empty($def['multiple']),
            'modes' => in_array($def['kind'], ['in', 'bool', 'keyword', 'custom'], true) ? ['must', 'prefer', 'avoid'] : ['must', 'prefer']];
    }
    echo json_encode(['success' => true, 'catalog' => $catalog, 'templates' => briefTemplates(), 'statuses' => BRIEF_STATUSES,
        'options' => briefOptions($pdo)], JSON_INVALID_UTF8_SUBSTITUTE);
}

function handleGetBrief(PDO $pdo) {
    $userId = briefTargetUserId($pdo, $_GET['client_id'] ?? null);
    $loaded = briefLoad($pdo, $userId);
    $loaded['brief'] = briefForViewer($loaded['brief'], briefViewer());
    echo json_encode(['success' => true, 'client_id' => $userId, 'viewer' => briefViewer()] + $loaded);
}

function handleSaveBrief(PDO $pdo) {
    $data = json_decode(dibsRequestBody(), true) ?: $_POST;
    $userId = briefTargetUserId($pdo, $data['client_id'] ?? null);
    $brief = briefSanitize(is_array($data['brief'] ?? null) ? $data['brief'] : []);
    $stored = briefLoad($pdo, $userId)['brief'];
    $brief = briefRestrictToOptions($brief, briefOptions($pdo), $stored);

    if (briefViewer() === 'client') {
        // Clients can't see or change agent-only criteria: drop any they send, keep the stored ones.
        $brief['criteria'] = array_values(array_filter($brief['criteria'], fn($c) => $c['visibility'] !== 'agent_only'));
        foreach ($stored['criteria'] as $c) {
            if ($c['visibility'] === 'agent_only') $brief['criteria'][] = $c;
        }
    }

    $stmt = $pdo->prepare("
        INSERT INTO client_brief (user_id, brief_json, updated_by, updated_at)
        VALUES (:id, :json, :by, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET brief_json = excluded.brief_json,
            updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
    ");
    $stmt->execute([':id' => $userId, ':json' => json_encode($brief), ':by' => (int)$_SESSION['user_id']]);
    logEvent($pdo, 'brief', 'info', 'Brief saved', null, ['client_id' => $userId, 'criteria' => count($brief['criteria'])], $_SESSION['username'] ?? null);
    echo json_encode(['success' => true, 'client_id' => $userId, 'brief' => briefForViewer($brief, briefViewer())]);
}

/** ?client_id= (optional), ?mls_id= (optional, one listing). Scores every reso_property row. */
function handleFitScores(PDO $pdo) {
    $userId = briefTargetUserId($pdo, $_GET['client_id'] ?? null);
    $viewer = briefViewer();
    $loaded = briefLoad($pdo, $userId);
    $sql = "SELECT listing_id, reso_json FROM reso_property";
    $params = [];
    if (!empty($_GET['mls_id'])) { $sql .= " WHERE listing_id = :id"; $params[':id'] = (string)$_GET['mls_id']; }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $scores = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $scores[$row['listing_id']] = fitScore($loaded['brief'], json_decode($row['reso_json'], true) ?: [], $viewer);
    }
    echo json_encode(['success' => true, 'client_id' => $userId, 'viewer' => $viewer,
        'brief' => briefForViewer($loaded['brief'], $viewer), 'brief_source' => $loaded['source'],
        'scores' => $scores], JSON_INVALID_UTF8_SUBSTITUTE);
}
