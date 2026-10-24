<?php
/**
 * Ingest layer — the one place listing data enters Dibs in RESO Data Dictionary shape.
 *
 * Every listing source implements IngestSource and maps its records to RESO field names
 * (ListingId, StandardStatus, ListPrice, LivingArea, ...). Mapped rows land in reso_property.
 *
 *   Source #1 (today): the bookmarklet. handleSync() keeps writing the legacy `properties` table;
 *     SQLite triggers queue every insert/update/delete in reso_dirty, and resoDrainDirty() maps
 *     those rows through BookmarkletIngestSource into reso_property. No other write path needs
 *     to know this layer exists.
 *   Source #2 (future task): a licensed RESO Web API feed. It will implement IngestSource with
 *     records that are already RESO-named and call resoUpsert() directly.
 *
 * New features (matching, CMA, alerts) should read reso_property, not properties.raw_mls_json,
 * so swapping the bookmarklet for the licensed feed does not touch them.
 *
 * Rows are keyed on (OriginatingSystemName, ListingId): ListingId is the MLS number both sources
 * share (Dibs' mls_id). ListingKey is stored when a source provides it; the bookmarklet can't.
 */

interface IngestSource {
    /** Short source id stored on each row, e.g. 'bookmarklet', 'reso_web_api'. */
    public function name(): string;
    /** RESO OriginatingSystemName, e.g. 'REcolorado'. */
    public function originatingSystem(): string;
    /** Maps one source record to RESO field names. Must set ListingId. Omit unknown fields. */
    public function toReso(array $record): array;
}

final class BookmarkletIngestSource implements IngestSource {
    public function name(): string { return 'bookmarklet'; }
    public function originatingSystem(): string { return 'REcolorado'; }

    /** $record = a `properties` row; its raw_mls_json is merged in for scraped extras. */
    public function toReso(array $record): array {
        $raw = [];
        if (!empty($record['raw_mls_json'])) {
            $decoded = json_decode($record['raw_mls_json'], true);
            if (is_array($decoded)) $raw = $decoded;
        }

        $r = [
            'OriginatingSystemName' => $this->originatingSystem(),
            'ListingId' => (string)$record['mls_id'],
            'MlsStatus' => $record['status'] ?? null,
            'StandardStatus' => self::standardStatus($record['status'] ?? ''),
            'ListPrice' => self::num($record['price'] ?? null),
            'OriginalListPrice' => self::num($record['original_price'] ?? null),
            'UnparsedAddress' => $record['address'] ?? null,
            'City' => $record['city'] ?? null,
            'StateOrProvince' => $record['state'] ?? null,
            'PostalCode' => $record['zip'] ?? null,
            'Latitude' => self::num($record['latitude'] ?? null),
            'Longitude' => self::num($record['longitude'] ?? null),
            'BedroomsTotal' => self::int($record['beds'] ?? null),
            'LivingArea' => self::int($record['sqft_finished'] ?? null),
            'BuildingAreaTotal' => self::int($record['sqft_total'] ?? null),
            'LotSizeSquareFeet' => self::int($record['lot_sqft'] ?? null),
            'LotSizeAcres' => self::num($record['lot_acres'] ?? null),
            'YearBuilt' => self::int($record['year_built'] ?? null),
            'HighSchoolDistrict' => $record['school_district'] ?? null,
            'ParkingTotal' => self::int($record['parking_total'] ?? null),
            'GarageSpaces' => self::num($record['garage_spaces'] ?? null),
            'TaxAnnualAmount' => self::num($record['annual_tax'] ?? null),
            'TaxYear' => self::int($record['tax_year'] ?? null),
            'ListingContractDate' => $record['list_date'] ?? null,
            'PhotosCount' => self::int($record['photo_count'] ?? null),
            'PublicRemarks' => $raw['description'] ?? null,
        ];

        if (!empty($r['LivingArea']) || !empty($r['BuildingAreaTotal'])) {
            $r['LivingAreaUnits'] = 'Square Feet';
        }

        // Dibs stores baths as one decimal (2.5). RESO splits it; this is an approximation:
        // the whole part counts as full baths and any fraction as one half bath.
        $baths = self::num($record['baths'] ?? null);
        if ($baths !== null && $baths > 0) {
            $full = (int)floor($baths);
            $half = ($baths - $full) > 0 ? 1 : 0;
            $r['BathroomsFull'] = $full;
            $r['BathroomsHalf'] = $half;
            $r['BathroomsTotalInteger'] = $full + $half;
        }

        // hoa_fee is always monthly in Dibs (the bookmarklet converts annual figures /12).
        $hoa = self::num($record['hoa_fee'] ?? null);
        if ($hoa !== null) {
            $r['AssociationYN'] = $hoa > 0 || !empty($record['hoa_exists']);
            if ($hoa > 0) {
                $r['AssociationFee'] = $hoa;
                $r['AssociationFeeFrequency'] = 'Monthly';
            }
        }

        // property_type arrives as "Property Sub Type/Structure Type", e.g.
        // "Single Family Residence/House".
        if (!empty($record['property_type'])) {
            $parts = array_map('trim', explode('/', (string)$record['property_type'], 2));
            $r['PropertySubType'] = $parts[0];
            if (!empty($parts[1])) $r['StructureType'] = [$parts[1]];
        }
        if (!empty($record['levels'])) $r['Levels'] = [(string)$record['levels']];

        // Drop nulls so "unknown" never reads as a real value.
        return array_filter($r, fn($v) => $v !== null && $v !== '');
    }

    /** Matrix status text -> RESO StandardStatus. Unknown text returns null; MlsStatus keeps it. */
    public static function standardStatus(string $status): ?string {
        $s = strtolower(trim($status));
        if ($s === '') return null;
        $map = [
            'under contract' => 'ActiveUnderContract',
            'coming soon' => 'ComingSoon',
            'pending' => 'Pending',
            'closed' => 'Closed',
            'sold' => 'Closed',
            'withdrawn' => 'Withdrawn',
            'off market' => 'Withdrawn',
            'expired' => 'Expired',
            'cancel' => 'Canceled',
            'hold' => 'Hold',
            'active' => 'Active',
        ];
        // Order matters: "active under contract" must hit 'under contract' before 'active'.
        foreach ($map as $needle => $standard) {
            if (strpos($s, $needle) !== false) return $standard;
        }
        return null;
    }

    private static function num($v): ?float {
        if ($v === null || $v === '' || !is_numeric($v)) return null;
        return (float)$v;
    }

    private static function int($v): ?int {
        if ($v === null || $v === '' || !is_numeric($v)) return null;
        return (int)$v;
    }
}

/** Schema + triggers. Called from bootstrap.php on every request; all statements are idempotent. */
function resoIngestMigrate(PDO $pdo): void {
    runMigration($pdo, "CREATE TABLE IF NOT EXISTS reso_property (
        originating_system TEXT NOT NULL,
        listing_id TEXT NOT NULL,
        listing_key TEXT,
        standard_status TEXT,
        list_price REAL,
        modification_timestamp TEXT,
        ingest_source TEXT NOT NULL,
        reso_json TEXT NOT NULL,
        ingested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (originating_system, listing_id)
    )", 'reso_property');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_reso_property_status ON reso_property(standard_status)", 'idx_reso_property_status');

    runMigration($pdo, "CREATE TABLE IF NOT EXISTS reso_dirty (mls_id TEXT PRIMARY KEY)", 'reso_dirty');
    // Listings written since the last Perfect Match check (processed by fitAlertsProcess in brief.php).
    runMigration($pdo, "CREATE TABLE IF NOT EXISTS fit_alert_queue (listing_id TEXT PRIMARY KEY)", 'fit_alert_queue');
    runMigration($pdo, "CREATE TRIGGER IF NOT EXISTS trg_properties_reso_ins AFTER INSERT ON properties
        BEGIN INSERT OR IGNORE INTO reso_dirty(mls_id) VALUES (NEW.mls_id); END", 'trg_properties_reso_ins');
    runMigration($pdo, "CREATE TRIGGER IF NOT EXISTS trg_properties_reso_upd AFTER UPDATE ON properties
        BEGIN INSERT OR IGNORE INTO reso_dirty(mls_id) VALUES (NEW.mls_id); END", 'trg_properties_reso_upd');
    runMigration($pdo, "CREATE TRIGGER IF NOT EXISTS trg_properties_reso_del AFTER DELETE ON properties
        BEGIN INSERT OR IGNORE INTO reso_dirty(mls_id) VALUES (OLD.mls_id); END", 'trg_properties_reso_del');

    // First run: queue every existing listing so the backfill happens through the normal drain.
    $hasReso = $pdo->query("SELECT 1 FROM reso_property LIMIT 1")->fetchColumn();
    $hasQueue = $pdo->query("SELECT 1 FROM reso_dirty LIMIT 1")->fetchColumn();
    if (!$hasReso && !$hasQueue) {
        $pdo->exec("INSERT OR IGNORE INTO reso_dirty(mls_id) SELECT mls_id FROM properties");
    }
}

/** Writes one RESO-shaped record. Used by every source (the future RESO feed calls this directly). */
function resoUpsert(PDO $pdo, IngestSource $source, array $reso): void {
    if (empty($reso['ListingId'])) throw new InvalidArgumentException('RESO record has no ListingId');
    $stmt = $pdo->prepare("
        INSERT INTO reso_property (originating_system, listing_id, listing_key, standard_status, list_price,
            modification_timestamp, ingest_source, reso_json, ingested_at)
        VALUES (:sys, :id, :key, :status, :price, :mod, :src, :json, CURRENT_TIMESTAMP)
        ON CONFLICT(originating_system, listing_id) DO UPDATE SET
            listing_key = COALESCE(excluded.listing_key, reso_property.listing_key),
            standard_status = excluded.standard_status,
            list_price = excluded.list_price,
            modification_timestamp = excluded.modification_timestamp,
            ingest_source = excluded.ingest_source,
            reso_json = excluded.reso_json,
            ingested_at = CURRENT_TIMESTAMP
    ");
    $stmt->execute([
        ':sys' => $reso['OriginatingSystemName'] ?? $source->originatingSystem(),
        ':id' => (string)$reso['ListingId'],
        ':key' => $reso['ListingKey'] ?? null,
        ':status' => $reso['StandardStatus'] ?? null,
        ':price' => $reso['ListPrice'] ?? null,
        ':mod' => $reso['ModificationTimestamp'] ?? null,
        ':src' => $source->name(),
        ':json' => json_encode($reso, JSON_INVALID_UTF8_SUBSTITUTE),
    ]);
}

/**
 * Maps queued `properties` changes into reso_property. Capped per call so a large backfill
 * spreads over a few requests instead of slowing one. Never throws: a mapping problem is
 * logged and must not break the request that happened to trigger the drain.
 */
function resoDrainDirty(PDO $pdo, int $limit = 500): int {
    try {
        $ids = $pdo->query("SELECT mls_id FROM reso_dirty LIMIT " . (int)$limit)->fetchAll(PDO::FETCH_COLUMN);
        if (!$ids) return 0;

        $source = new BookmarkletIngestSource();
        $select = $pdo->prepare("SELECT * FROM properties WHERE mls_id = :id");
        $delete = $pdo->prepare("DELETE FROM reso_property WHERE originating_system = :sys AND listing_id = :id");
        $dequeue = $pdo->prepare("DELETE FROM reso_dirty WHERE mls_id = :id");
        $alertQueue = $pdo->prepare("INSERT OR IGNORE INTO fit_alert_queue (listing_id) VALUES (:id)");

        $pdo->beginTransaction();
        foreach ($ids as $id) {
            $select->execute([':id' => $id]);
            $row = $select->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                resoUpsert($pdo, $source, $source->toReso($row));
                $alertQueue->execute([':id' => $id]);
            } else {
                $delete->execute([':sys' => $source->originatingSystem(), ':id' => $id]);
            }
            $dequeue->execute([':id' => $id]);
        }
        $pdo->commit();
        return count($ids);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        logEvent($pdo, 'sync', 'warn', 'RESO ingest drain failed: ' . $e->getMessage());
        return 0;
    }
}
