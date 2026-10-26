<?php
/**
 * Client transfer between brokerages on Dibs (brokerage spec, section 4 "Release to agent").
 *
 * A client the old brokerage released (client_releases.status = 'accepted', within 90 days)
 * joins the new brokerage through a normal invite link. On join.html they can also enter their
 * old Dibs address and sign-in; the server checks those against the OLD brokerage's database,
 * then copies the client's own data into their new account:
 *   - per-home decisions, ratings, their notes, notes their agent shared with them, toured state,
 *     tour notes and scores, Top Picks rank, facing (user_metadata)
 *   - tour results (tour_debriefs), My Home, their brief (agent-only criteria removed),
 *     saved searches, display preferences
 * Never copied: the old brokerage's private notes (realtor_private_notes, agent_tour_notes),
 * showings, messages, MLS portal sync state, or any listing data. Listings belong to the
 * brokerage that captured them, so per-home data for a listing the new brokerage doesn't have yet
 * waits in client_import_pending and attaches when that listing is synced there.
 * Afterwards the old account is closed and the release is marked transferred (one time only).
 */

const TRANSFER_WINDOW_DAYS = 90;
const TRANSFER_META_COLUMNS = ['favorite', 'hidden', 'rating', 'user_notes', 'realtor_notes', 'toured', 'tour_notes', 'toured_at',
    'tags_json', 'shared_with_realtor', 'possibility', 'ai_analysis', 'facing', 'pick_rank', 'ranked_at', 'tour_scores_json'];

function transferMigrate(PDO $pdo): void {
    runMigration($pdo, "CREATE TABLE IF NOT EXISTS client_import_pending (
        user_id INTEGER NOT NULL,
        mls_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        address TEXT DEFAULT '',
        from_brokerage TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, mls_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )", 'client_import_pending');
    runMigration($pdo, "ALTER TABLE client_releases ADD COLUMN transferred_at DATETIME DEFAULT NULL", 'client_releases.transferred_at');
    runMigration($pdo, "ALTER TABLE client_releases ADD COLUMN transferred_to TEXT DEFAULT NULL", 'client_releases.transferred_to');
}

/** Columns a table has, for copying only what both databases know about. */
function transferColumns(PDO $db, string $table): array {
    return array_column($db->query("PRAGMA table_info($table)")->fetchAll(PDO::FETCH_ASSOC), 'name');
}

/**
 * Checks the old brokerage sign-in a joining client gave. Returns [oldPdo, oldUserId, slug, name]
 * or a string error. Nothing is changed here.
 */
function transferVerifySource(array $in) {
    $slug = strtolower(trim((string)($in['slug'] ?? '')));
    // Accept a pasted address too: ".../dibs/b/<slug>/" or ".../dibs/" (the original install).
    if (preg_match('#/b/(' . DIBS_SLUG_PATTERN . ')/?#', $slug, $m)) $slug = $m[1];
    elseif (preg_match('#/dibs/?$#', rtrim($slug, '/') . '/') || $slug === '' ) $slug = 'main';
    if (!preg_match('/^' . DIBS_SLUG_PATTERN . '$/', $slug)) return 'Enter your old Dibs address.';
    if ($slug === DIBS_BROKERAGE_SLUG) return "That's this brokerage. Enter the address of the brokerage you're leaving.";
    $username = trim((string)($in['username'] ?? ''));
    $password = (string)($in['password'] ?? '');
    $fail = 'Your old Dibs address, username or password is wrong, or that brokerage hasn\'t released you to move.';
    if ($username === '' || $password === '') return $fail;

    $p = dibsPlatformDb(__DIR__ . '/../data');
    $st = $p->prepare("SELECT id, slug, name, db_file, status FROM brokerages WHERE slug = :s");
    $st->execute([':s' => $slug]);
    $b = $st->fetch();
    if (!$b || !preg_match('#^(brokerages/)?[a-z0-9][a-z0-9_-]*\.db$#', (string)$b['db_file'])) return $fail;
    $path = __DIR__ . '/../data/' . $b['db_file'];
    if (!is_file($path)) return $fail;
    $old = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $old->exec('PRAGMA foreign_keys = ON');
    $u = $old->prepare("SELECT id, password_hash, role FROM users WHERE username = :u");
    $u->execute([':u' => $username]);
    $user = $u->fetch();
    if (!$user || $user['role'] !== 'client' || !password_verify($password, $user['password_hash'])) return $fail;
    try {
        $r = $old->prepare("SELECT id FROM client_releases WHERE client_id = :c AND status = 'accepted'
            AND decided_at >= datetime('now', :win) AND COALESCE(transferred_at, '') = '' ORDER BY id DESC LIMIT 1");
        $r->execute([':c' => (int)$user['id'], ':win' => '-' . TRANSFER_WINDOW_DAYS . ' days']);
        $releaseId = (int)($r->fetchColumn() ?: 0);
    } catch (Throwable $e) { $releaseId = 0; }   // that brokerage has never released anyone
    if (!$releaseId) return $fail;
    return [$old, (int)$user['id'], (string)$b['slug'], (string)$b['name'], $releaseId];
}

/** Copies the client's own data from the old brokerage into their new account. Returns counts. */
function transferImport(PDO $new, int $newUserId, array $source): array {
    [$old, $oldUserId, $slug, , $releaseId] = $source;
    $counts = ['homes' => 0, 'homes_waiting' => 0, 'tours' => 0, 'my_home' => 0, 'brief' => 0, 'searches' => 0];
    $metaCols = array_values(array_intersect(TRANSFER_META_COLUMNS, transferColumns($old, 'user_metadata'), transferColumns($new, 'user_metadata')));

    $new->beginTransaction();
    try {
        // Per-home data: attach now where this brokerage has the listing, otherwise keep it waiting.
        $rows = $old->prepare("SELECT m.mls_id, p.address, " . implode(', ', array_map(fn($c) => "m.$c", $metaCols)) . "
            FROM user_metadata m LEFT JOIN properties p ON p.mls_id = m.mls_id WHERE m.user_id = :u");
        $rows->execute([':u' => $oldUserId]);
        $have = $new->prepare("SELECT 1 FROM properties WHERE mls_id = :m");
        $ins = $new->prepare("INSERT OR REPLACE INTO user_metadata (user_id, mls_id, " . implode(', ', $metaCols) . ", updated_at)
            VALUES (:user_id, :mls_id, " . implode(', ', array_map(fn($c) => ":$c", $metaCols)) . ", CURRENT_TIMESTAMP)");
        $wait = $new->prepare("INSERT OR REPLACE INTO client_import_pending (user_id, mls_id, data_json, address, from_brokerage) VALUES (:u, :m, :d, :a, :b)");
        foreach ($rows->fetchAll() as $r) {
            $data = [];
            foreach ($metaCols as $c) $data[$c] = $r[$c];
            $have->execute([':m' => $r['mls_id']]);
            if ($have->fetchColumn()) {
                $params = [':user_id' => $newUserId, ':mls_id' => $r['mls_id']];
                foreach ($metaCols as $c) $params[":$c"] = $data[$c];
                $ins->execute($params);
                $counts['homes']++;
            } else {
                $wait->execute([':u' => $newUserId, ':m' => $r['mls_id'], ':d' => json_encode($data), ':a' => (string)($r['address'] ?? ''), ':b' => $slug]);
                $counts['homes_waiting']++;
            }
        }

        // Tour results (the client's own write-ups).
        if (in_array('tour_debriefs', $new->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN), true)) {
            $t = $old->prepare("SELECT tour_date, impressions, followups_json, top3_json, COALESCE(stops_json, '[]') AS stops_json, updated_at FROM tour_debriefs WHERE client_id = :u");
            $t->execute([':u' => $oldUserId]);
            $ti = $new->prepare("INSERT OR REPLACE INTO tour_debriefs (client_id, tour_date, impressions, followups_json, top3_json, stops_json, updated_by_user_id, updated_at)
                VALUES (:c, :d, :i, :f, :t, :s, :c, :at)");
            foreach ($t->fetchAll() as $r) {
                $ti->execute([':c' => $newUserId, ':d' => $r['tour_date'], ':i' => $r['impressions'], ':f' => $r['followups_json'], ':t' => $r['top3_json'], ':s' => $r['stops_json'], ':at' => $r['updated_at']]);
                $counts['tours']++;
            }
        }

        // My Home.
        $h = $old->prepare("SELECT * FROM my_homes WHERE user_id = :u");
        $h->execute([':u' => $oldUserId]);
        if ($home = $h->fetch()) {
            $cols = array_values(array_diff(array_intersect(array_keys($home), transferColumns($new, 'my_homes')), ['user_id']));
            $new->prepare("INSERT OR REPLACE INTO my_homes (user_id, " . implode(', ', $cols) . ") VALUES (:user_id, " . implode(', ', array_map(fn($c) => ":$c", $cols)) . ")")
                ->execute(array_merge([':user_id' => $newUserId], array_combine(array_map(fn($c) => ":$c", $cols), array_map(fn($c) => $home[$c], $cols))));
            $counts['my_home'] = 1;
        }

        // Brief, without the old agent's private (agent-only) criteria.
        try {
            $b = $old->prepare("SELECT brief_json FROM client_brief WHERE user_id = :u");
            $b->execute([':u' => $oldUserId]);
            if ($json = $b->fetchColumn()) {
                $brief = json_decode($json, true);
                if (is_array($brief)) {
                    if (isset($brief['criteria']) && is_array($brief['criteria'])) {
                        $brief['criteria'] = array_values(array_filter($brief['criteria'], fn($c) => ($c['visibility'] ?? '') !== 'agent_only'));
                    }
                    $new->prepare("INSERT OR REPLACE INTO client_brief (user_id, brief_json, updated_by, updated_at) VALUES (:u, :j, :u, CURRENT_TIMESTAMP)")
                        ->execute([':u' => $newUserId, ':j' => json_encode($brief)]);
                    $counts['brief'] = 1;
                }
            }
        } catch (Throwable $e) { /* no brief there */ }

        // Saved searches they own, and display preferences.
        $s = $old->prepare("SELECT name, filter_json FROM saved_filters WHERE user_id = :u");
        $s->execute([':u' => $oldUserId]);
        $si = $new->prepare("INSERT INTO saved_filters (user_id, created_by_user_id, name, filter_json) VALUES (:u, :u, :n, :f)");
        foreach ($s->fetchAll() as $r) { $si->execute([':u' => $newUserId, ':n' => $r['name'], ':f' => $r['filter_json']]); $counts['searches']++; }
        $pr = $old->prepare("SELECT * FROM user_preferences WHERE user_id = :u");
        $pr->execute([':u' => $oldUserId]);
        if ($pref = $pr->fetch()) {
            $cols = array_values(array_diff(array_intersect(array_keys($pref), transferColumns($new, 'user_preferences')), ['user_id']));
            $new->prepare("INSERT OR REPLACE INTO user_preferences (user_id, " . implode(', ', $cols) . ") VALUES (:user_id, " . implode(', ', array_map(fn($c) => ":$c", $cols)) . ")")
                ->execute(array_merge([':user_id' => $newUserId], array_combine(array_map(fn($c) => ":$c", $cols), array_map(fn($c) => $pref[$c], $cols))));
        }
        $new->commit();
    } catch (Throwable $e) {
        if ($new->inTransaction()) $new->rollBack();
        throw $e;
    }

    // The old account is done: closed, and the release can't be used again.
    try { $old->exec("ALTER TABLE client_releases ADD COLUMN transferred_at DATETIME DEFAULT NULL"); } catch (Throwable $e) {}
    try { $old->exec("ALTER TABLE client_releases ADD COLUMN transferred_to TEXT DEFAULT NULL"); } catch (Throwable $e) {}
    $old->prepare("UPDATE client_releases SET transferred_at = CURRENT_TIMESTAMP, transferred_to = :to WHERE id = :id")
        ->execute([':to' => DIBS_BROKERAGE_SLUG, ':id' => $releaseId]);
    $old->prepare("UPDATE users SET status = 'closed', deactivated_at = COALESCE(deactivated_at, CURRENT_TIMESTAMP) WHERE id = :id")->execute([':id' => $oldUserId]);
    return $counts;
}

/** A listing just arrived in this brokerage: attach any transferred client's waiting data for it. */
function transferApplyPending(PDO $pdo, string $mlsId): void {
    try {
        $st = $pdo->prepare("SELECT user_id, data_json FROM client_import_pending WHERE mls_id = :m");
        $st->execute([':m' => $mlsId]);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        if (!$rows) return;
        $cols = array_values(array_intersect(TRANSFER_META_COLUMNS, transferColumns($pdo, 'user_metadata')));
        $ins = $pdo->prepare("INSERT OR IGNORE INTO user_metadata (user_id, mls_id, " . implode(', ', $cols) . ", updated_at)
            VALUES (:user_id, :mls_id, " . implode(', ', array_map(fn($c) => ":$c", $cols)) . ", CURRENT_TIMESTAMP)");
        $del = $pdo->prepare("DELETE FROM client_import_pending WHERE user_id = :u AND mls_id = :m");
        foreach ($rows as $r) {
            $data = json_decode($r['data_json'], true) ?: [];
            $params = [':user_id' => (int)$r['user_id'], ':mls_id' => $mlsId];
            foreach ($cols as $c) $params[":$c"] = $data[$c] ?? null;
            $ins->execute($params);
            $del->execute([':u' => (int)$r['user_id'], ':m' => $mlsId]);
        }
    } catch (Throwable $e) {
        logEvent($pdo, 'sync', 'warn', 'Applying a transferred client\'s data failed: ' . $e->getMessage(), $mlsId);
    }
}

transferMigrate($pdo);
