-- One-time market_cities normalization for country-first international markets.
--
-- Scope:
-- 1) Migrate legacy market='uk' rows into country-first markets by region.
-- 2) Normalize GB-side state_code from UK -> GB for england/scotland/wales.
-- 3) Delete migrated market='uk' rows.
--
-- Region mapping used:
--   england  -> market='england'
--   scotland -> market='scotland'
--   wales    -> market='wales'
--   ireland  -> market='ireland'
--
-- Notes:
-- - Idempotent: safe to run multiple times.
-- - Does not touch events/venues tables.
-- - Keep this script for controlled manual execution after DB sync confirmation.

BEGIN IMMEDIATE TRANSACTION;

-- 1) Copy legacy UK rows into country-first markets when missing.
INSERT INTO market_cities (
    market,
    region,
    city_name,
    state_code,
    latitude,
    longitude,
    default_radius_miles,
    is_active
)
SELECT
    CASE LOWER(TRIM(src.region))
        WHEN 'england' THEN 'england'
        WHEN 'scotland' THEN 'scotland'
        WHEN 'wales' THEN 'wales'
        WHEN 'ireland' THEN 'ireland'
    END AS target_market,
    LOWER(TRIM(src.region)) AS target_region,
    src.city_name,
    CASE
        WHEN LOWER(TRIM(src.region)) IN ('england', 'scotland', 'wales')
             AND UPPER(TRIM(COALESCE(src.state_code, ''))) = 'UK' THEN 'GB'
        ELSE src.state_code
    END AS target_state_code,
    src.latitude,
    src.longitude,
    src.default_radius_miles,
    src.is_active
FROM market_cities src
WHERE LOWER(TRIM(src.market)) = 'uk'
  AND LOWER(TRIM(src.region)) IN ('england', 'scotland', 'wales', 'ireland')
  AND NOT EXISTS (
      SELECT 1
      FROM market_cities dst
      WHERE LOWER(TRIM(dst.market)) = LOWER(TRIM(
          CASE LOWER(TRIM(src.region))
              WHEN 'england' THEN 'england'
              WHEN 'scotland' THEN 'scotland'
              WHEN 'wales' THEN 'wales'
              WHEN 'ireland' THEN 'ireland'
          END
      ))
        AND LOWER(TRIM(dst.city_name)) = LOWER(TRIM(src.city_name))
  );

-- 2) Normalize GB country code labels for Great Britain rows.
UPDATE market_cities
SET state_code = 'GB'
WHERE LOWER(TRIM(market)) IN ('england', 'scotland', 'wales')
  AND UPPER(TRIM(COALESCE(state_code, ''))) = 'UK';

-- 3) Ensure region labels match country market keys.
UPDATE market_cities
SET region = LOWER(TRIM(market))
WHERE LOWER(TRIM(market)) IN ('england', 'scotland', 'wales', 'ireland')
  AND LOWER(TRIM(region)) <> LOWER(TRIM(market));

-- 4) Remove migrated legacy UK rows.
DELETE FROM market_cities
WHERE LOWER(TRIM(market)) = 'uk'
  AND LOWER(TRIM(region)) IN ('england', 'scotland', 'wales', 'ireland');

COMMIT;

-- Verification queries (run manually after COMMIT):
-- A) Should be zero rows:
--    SELECT COUNT(*) AS remaining_uk_rows
--    FROM market_cities
--    WHERE LOWER(TRIM(market))='uk';
--
-- B) Country-market distribution:
--    SELECT market, region, state_code, COUNT(*) AS rows_count
--    FROM market_cities
--    WHERE LOWER(TRIM(market)) IN ('england','scotland','wales','ireland','uk')
--    GROUP BY market, region, state_code
--    ORDER BY market, region, state_code;
--
-- C) Spot check major cities:
--    SELECT city_name, market, region, state_code
--    FROM market_cities
--    WHERE LOWER(TRIM(city_name)) IN ('london','glasgow','cardiff','dublin','belfast')
--    ORDER BY city_name, market;
