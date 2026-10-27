<?php
/**
 * Head-to-Head compare: the buyer's global field weights (claude/head-to-head-spec.md §3, §5, §6).
 * Saved comparisons (h2h_comparisons): list / get / save / delete, private to the buyer.
 *
 * Weights are {field_key: 0..3}. Field keys come from js/h2hFields.js: curated keys like
 * "price" / "room_kitchen" / "tour_overall", plus generated "mls:<section>|<label>" keys for the
 * other MLS details, so keys are checked by pattern rather than a fixed list.
 */

const H2H_MAX_WEIGHTS = 600;

function h2hValidWeights($in): ?array {
    if (!is_array($in) || count($in) > H2H_MAX_WEIGHTS) return null;
    $out = [];
    foreach ($in as $k => $v) {
        $k = (string)$k;
        if (!preg_match('/^[a-z0-9_:|]{1,100}$/', $k)) return null;
        if (!is_int($v) && !(is_string($v) && ctype_digit($v))) return null;
        $v = (int)$v;
        if ($v < 0 || $v > 3) return null;
        $out[$k] = $v;
    }
    return $out;
}

function handleH2hGetWeights(PDO $pdo) {
    $me = (int)$_SESSION['user_id'];
    $stmt = $pdo->prepare("SELECT weights_json, updated_at FROM h2h_weights WHERE user_id = :u");
    $stmt->execute([':u' => $me]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $weights = $row ? (json_decode($row['weights_json'] ?? '{}', true) ?: []) : [];
    echo json_encode(['success' => true, 'weights' => (object)$weights, 'updated_at' => $row['updated_at'] ?? null]);
}

function handleH2hSaveWeights(PDO $pdo) {
    $me = (int)$_SESSION['user_id'];
    $data = json_decode(dibsRequestBody(), true) ?: [];
    $weights = h2hValidWeights($data['weights'] ?? null);
    if ($weights === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Weights must be 0 to 3 for known fields.']);
        return;
    }
    $pdo->prepare("INSERT INTO h2h_weights (user_id, weights_json, updated_at) VALUES (:u, :w, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET weights_json = excluded.weights_json, updated_at = CURRENT_TIMESTAMP")
        ->execute([':u' => $me, ':w' => json_encode((object)$weights)]);
    echo json_encode(['success' => true, 'count' => count($weights)]);
}

// ---------------------------------------------------------------------------------------------
// Saved comparisons (spec §5-§6). Private to the buyer who saved them.
// ---------------------------------------------------------------------------------------------

const H2H_MAX_SNAPSHOT_BYTES = 600000;

function h2hFail(string $msg, int $code = 400) {
    http_response_code($code);
    echo json_encode(['error' => $msg]);
}

function h2hStrLen(string $s): int {
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : preg_match_all('/./us', $s);
}

function h2hValidPicks($in): ?array {
    if (!is_array($in) || count($in) > H2H_MAX_WEIGHTS) return null;
    $out = [];
    foreach ($in as $k => $p) {
        $k = (string)$k;
        if (!preg_match('/^[a-z0-9_:|]{1,100}$/', $k) || !is_array($p)) return null;
        $pick = $p['pick'] ?? null;
        if (!in_array($pick, ['A', 'B', 'D', null], true)) return null;
        $by = ($p['by'] ?? 'auto') === 'user' ? 'user' : 'auto';
        $why = trim((string)($p['why'] ?? ''));
        if (h2hStrLen($why) > 200) return null;
        $out[$k] = ['pick' => $pick, 'by' => $by, 'why' => $why];
    }
    return $out;
}

/** Decoded JSON object/array within a byte cap, or null. */
function h2hJsonBlob($in, int $maxBytes): ?string {
    if (!is_array($in)) return null;
    $enc = json_encode($in, JSON_UNESCAPED_UNICODE);
    if ($enc === false || strlen($enc) > $maxBytes) return null;
    return $enc;
}

function h2hRowOut(array $r): array {
    return [
        'public_id' => $r['public_id'],
        'mls_a' => $r['mls_a'], 'mls_b' => $r['mls_b'],
        'title' => $r['title'],
        'snapshot' => json_decode($r['snapshot_json'] ?? '{}', true) ?: new stdClass(),
        'picks' => (object)(json_decode($r['picks_json'] ?? '{}', true) ?: []),
        'weights' => (object)(json_decode($r['weights_json'] ?? '{}', true) ?: []),
        'score' => json_decode($r['score_json'] ?? '{}', true) ?: new stdClass(),
        'verdict' => $r['verdict'] ?? '',
        'gemini_text' => $r['gemini_text'],
        'gemini_at' => $r['gemini_at'],
        'created_at' => $r['created_at'], 'updated_at' => $r['updated_at'],
    ];
}

function handleH2hList(PDO $pdo) {
    $me = (int)$_SESSION['user_id'];
    $stmt = $pdo->prepare("
        SELECT c.public_id, c.mls_a, c.mls_b, c.title, c.score_json, c.snapshot_json, c.updated_at, c.created_at,
               pa.address AS addr_a, pa.price AS price_a, pa.status AS status_a, pa.main_image_url AS img_a,
               pb.address AS addr_b, pb.price AS price_b, pb.status AS status_b, pb.main_image_url AS img_b
        FROM h2h_comparisons c
        LEFT JOIN properties pa ON pa.mls_id = c.mls_a
        LEFT JOIN properties pb ON pb.mls_id = c.mls_b
        WHERE c.user_id = :u ORDER BY c.updated_at DESC LIMIT 200");
    $stmt->execute([':u' => $me]);
    $out = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $snap = json_decode($r['snapshot_json'] ?? '{}', true) ?: [];
        $changed = [];
        foreach (['a', 'b'] as $side) {
            $then = $snap[$side] ?? [];
            if ($r["price_$side"] !== null && isset($then['price']) && (float)$then['price'] !== (float)$r["price_$side"]) $changed[] = strtoupper($side) . ' price';
            if ($r["status_$side"] !== null && isset($then['status']) && (string)$then['status'] !== (string)$r["status_$side"]) $changed[] = strtoupper($side) . ' status';
        }
        $out[] = [
            'public_id' => $r['public_id'], 'title' => $r['title'],
            'mls_a' => $r['mls_a'], 'mls_b' => $r['mls_b'],
            'addr_a' => $r['addr_a'] ?? ($snap['a']['address'] ?? ''), 'addr_b' => $r['addr_b'] ?? ($snap['b']['address'] ?? ''),
            'status_a' => $r['status_a'], 'status_b' => $r['status_b'],
            'img_a' => $r['img_a'], 'img_b' => $r['img_b'],
            'score' => json_decode($r['score_json'] ?? '{}', true) ?: new stdClass(),
            'changed' => $changed,
            'updated_at' => $r['updated_at'], 'created_at' => $r['created_at'],
        ];
    }
    echo json_encode(['success' => true, 'comparisons' => $out]);
}

function handleH2hGet(PDO $pdo) {
    $me = (int)$_SESSION['user_id'];
    $id = (string)($_GET['id'] ?? '');
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) return h2hFail('Comparison not found.', 404);
    $stmt = $pdo->prepare("SELECT * FROM h2h_comparisons WHERE public_id = :id AND user_id = :u");
    $stmt->execute([':id' => $id, ':u' => $me]);
    $r = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$r) return h2hFail('Comparison not found.', 404);
    echo json_encode(['success' => true, 'comparison' => h2hRowOut($r)]);
}

function handleH2hSave(PDO $pdo) {
    $me = (int)$_SESSION['user_id'];
    $data = json_decode(dibsRequestBody(), true) ?: [];
    $id = (string)($data['public_id'] ?? '');
    $mlsA = trim((string)($data['mls_a'] ?? ''));
    $mlsB = trim((string)($data['mls_b'] ?? ''));
    $title = trim((string)($data['title'] ?? ''));
    $verdict = trim((string)($data['verdict'] ?? ''));

    if ($id !== '' && !preg_match('/^[a-f0-9]{24}$/', $id)) return h2hFail('Comparison not found.', 404);
    if (!preg_match('/^[A-Za-z0-9_-]{1,40}$/', $mlsA) || !preg_match('/^[A-Za-z0-9_-]{1,40}$/', $mlsB) || $mlsA === $mlsB) {
        return h2hFail('Pick two different homes.');
    }
    $chk = $pdo->prepare("SELECT COUNT(*) FROM properties WHERE mls_id IN (:a, :b)");
    $chk->execute([':a' => $mlsA, ':b' => $mlsB]);
    if ((int)$chk->fetchColumn() !== 2) return h2hFail('One of these homes is no longer in Dibs.');
    if (h2hStrLen($title) > 120) return h2hFail('Title is limited to 120 characters.');
    if (h2hStrLen($verdict) > 4000) return h2hFail('Your verdict is limited to 4,000 characters.');

    $picks = h2hValidPicks($data['picks'] ?? []);
    if ($picks === null) return h2hFail('Picks must be A, B, Draw or undecided, with notes up to 200 characters.');
    $weights = h2hValidWeights($data['weights'] ?? []);
    if ($weights === null) return h2hFail('Weights must be 0 to 3 for known fields.');
    $snapshot = h2hJsonBlob($data['snapshot'] ?? null, H2H_MAX_SNAPSHOT_BYTES);
    if ($snapshot === null) return h2hFail('The comparison is too large to save.');
    $score = h2hJsonBlob($data['score'] ?? [], 20000);
    if ($score === null) return h2hFail('Invalid score.');

    $params = [':u' => $me, ':a' => $mlsA, ':b' => $mlsB, ':t' => $title, ':s' => $snapshot,
        ':p' => json_encode((object)$picks, JSON_UNESCAPED_UNICODE), ':w' => json_encode((object)$weights), ':sc' => $score, ':v' => $verdict];
    if ($id !== '') {
        $upd = $pdo->prepare("UPDATE h2h_comparisons SET mls_a = :a, mls_b = :b, title = :t, snapshot_json = :s, picks_json = :p,
            weights_json = :w, score_json = :sc, verdict = :v, updated_at = CURRENT_TIMESTAMP WHERE public_id = :id AND user_id = :u");
        $upd->execute($params + [':id' => $id]);
        if (!$upd->rowCount()) return h2hFail('Comparison not found.', 404);
    } else {
        $id = bin2hex(random_bytes(12));
        $pdo->prepare("INSERT INTO h2h_comparisons (public_id, user_id, mls_a, mls_b, title, snapshot_json, picks_json, weights_json, score_json, verdict)
            VALUES (:id, :u, :a, :b, :t, :s, :p, :w, :sc, :v)")->execute($params + [':id' => $id]);
    }
    $stmt = $pdo->prepare("SELECT * FROM h2h_comparisons WHERE public_id = :id AND user_id = :u");
    $stmt->execute([':id' => $id, ':u' => $me]);
    echo json_encode(['success' => true, 'comparison' => h2hRowOut($stmt->fetch(PDO::FETCH_ASSOC))]);
}

function handleH2hDelete(PDO $pdo) {
    $me = (int)$_SESSION['user_id'];
    $data = json_decode(dibsRequestBody(), true) ?: [];
    $id = (string)($data['public_id'] ?? '');
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) return h2hFail('Comparison not found.', 404);
    $del = $pdo->prepare("DELETE FROM h2h_comparisons WHERE public_id = :id AND user_id = :u");
    $del->execute([':id' => $id, ':u' => $me]);
    if (!$del->rowCount()) return h2hFail('Comparison not found.', 404);
    echo json_encode(['success' => true]);
}

/** Store the Gemini tie-breaker write-up on a saved comparison (spec §8). Replaces any earlier one. */
function handleH2hSaveGemini(PDO $pdo) {
    $me = (int)$_SESSION['user_id'];
    $data = json_decode(dibsRequestBody(), true) ?: [];
    $id = (string)($data['public_id'] ?? '');
    if (!preg_match('/^[a-f0-9]{24}$/', $id)) return h2hFail('Comparison not found.', 404);
    $blob = h2hJsonBlob($data['gemini'] ?? null, 60000);
    if ($blob === null) return h2hFail('The tie-breaker write-up is missing or too long.');
    $upd = $pdo->prepare("UPDATE h2h_comparisons SET gemini_text = :g, gemini_at = CURRENT_TIMESTAMP WHERE public_id = :id AND user_id = :u");
    $upd->execute([':g' => $blob, ':id' => $id, ':u' => $me]);
    if (!$upd->rowCount()) return h2hFail('Comparison not found.', 404);
    echo json_encode(['success' => true]);
}
