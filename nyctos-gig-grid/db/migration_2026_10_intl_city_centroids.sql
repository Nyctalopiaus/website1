-- Give the England/Scotland/Wales/Ireland market_cities their real search centroids.
--
-- 68 international cities carried the legacy placeholder point (54, -2) — a spot in the
-- Yorkshire Dales — from the old market='uk' migration. Ticketmaster is queried by
-- latlong+radius per distinct centroid, so:
--   * every Wales and Ireland city collapsed into that one point, and both markets pulled the
--     identical set of northern-England events every night (e.g. 489/489 on 2026-10-21);
--   * Ireland had no event added since 2026-06-01 (51 rows total);
--   * Scotland/England lost coverage of Dundee, Stirling, Sheffield, Nottingham, Brighton, etc.
--
-- Also fixes Ireland state_code: Republic cities were 'UK' (now 'IE'); Belfast/Derry are 'GB'.
--
-- Idempotent: each UPDATE only touches a row still sitting on the placeholder point (or, for
-- state_code, still 'UK'), so manual edits made since are never overwritten.

BEGIN IMMEDIATE TRANSACTION;

CREATE TEMP TABLE centroid_fix (market TEXT, city_name TEXT, latitude REAL, longitude REAL, state_code TEXT);

INSERT INTO centroid_fix (market, city_name, latitude, longitude, state_code) VALUES
-- England
('england', 'Southampton', 50.9097, -1.4044, 'GB'),
('england', 'Sheffield', 53.3811, -1.4701, 'GB'),
('england', 'Newcastle', 54.9783, -1.6178, 'GB'),
('england', 'Brighton', 50.8225, -0.1372, 'GB'),
('england', 'Nottingham', 52.9548, -1.1581, 'GB'),
('england', 'Oxford', 51.7520, -1.2577, 'GB'),
('england', 'Cambridge', 52.2053, 0.1218, 'GB'),
('england', 'Portsmouth', 50.8198, -1.0880, 'GB'),
('england', 'Exeter', 50.7184, -3.5339, 'GB'),
('england', 'Norwich', 52.6309, 1.2974, 'GB'),
('england', 'Hull', 53.7676, -0.3274, 'GB'),
('england', 'York', 53.9600, -1.0873, 'GB'),
-- Wales
('wales', 'Cardiff', 51.4816, -3.1791, 'GB'),
('wales', 'Swansea', 51.6214, -3.9436, 'GB'),
('wales', 'Newport', 51.5842, -2.9977, 'GB'),
('wales', 'Wrexham', 53.0466, -2.9925, 'GB'),
('wales', 'Abertillery', 51.7300, -3.1350, 'GB'),
('wales', 'Merthyr Tydfil', 51.7487, -3.3816, 'GB'),
('wales', 'Llandudno', 53.3241, -3.8276, 'GB'),
('wales', 'Bangor', 53.2274, -4.1293, 'GB'),
('wales', 'Rhyl', 53.3192, -3.4916, 'GB'),
('wales', 'Aberystwyth', 52.4153, -4.0829, 'GB'),
('wales', 'Bridgend', 51.5043, -3.5769, 'GB'),
('wales', 'Barry', 51.3990, -3.2838, 'GB'),
('wales', 'Neath', 51.6630, -3.8044, 'GB'),
('wales', 'Port Talbot', 51.5906, -3.7986, 'GB'),
('wales', 'Cwmbran', 51.6536, -3.0215, 'GB'),
('wales', 'Pontypridd', 51.6020, -3.3421, 'GB'),
('wales', 'Caerphilly', 51.5780, -3.2181, 'GB'),
('wales', 'Llanelli', 51.6840, -4.1630, 'GB'),
('wales', 'Colwyn Bay', 53.2948, -3.7270, 'GB'),
-- Ireland (Northern Ireland cities are GB, Republic cities are IE)
('ireland', 'Belfast', 54.5973, -5.9301, 'GB'),
('ireland', 'Belfast City Centre', 54.5973, -5.9301, 'GB'),
('ireland', 'Derry', 54.9966, -7.3086, 'GB'),
('ireland', 'Londonderry', 54.9966, -7.3086, 'GB'),
('ireland', 'Dublin', 53.3498, -6.2603, 'IE'),
('ireland', 'Cork', 51.8985, -8.4756, 'IE'),
('ireland', 'Galway', 53.2707, -9.0568, 'IE'),
('ireland', 'Limerick', 52.6638, -8.6267, 'IE'),
('ireland', 'Kilkenny', 52.6541, -7.2448, 'IE'),
('ireland', 'Waterford', 52.2593, -7.1101, 'IE'),
('ireland', 'Drogheda', 53.7179, -6.3561, 'IE'),
('ireland', 'Dundalk', 54.0090, -6.4049, 'IE'),
('ireland', 'Sligo', 54.2766, -8.4761, 'IE'),
('ireland', 'Wexford', 52.3369, -6.4633, 'IE'),
('ireland', 'Athlone', 53.4239, -7.9407, 'IE'),
('ireland', 'Letterkenny', 54.9558, -7.7342, 'IE'),
('ireland', 'Killarney', 52.0599, -9.5044, 'IE'),
('ireland', 'Tralee', 52.2713, -9.6999, 'IE'),
('ireland', 'Bray', 53.2028, -6.0983, 'IE'),
('ireland', 'Navan', 53.6528, -6.6814, 'IE'),
('ireland', 'Ennis', 52.8436, -8.9864, 'IE'),
('ireland', 'Carlow', 52.8408, -6.9261, 'IE'),
-- Scotland ("Highlands" uses Aviemore as a central Highlands point; "Orkney" uses Kirkwall)
('scotland', 'Dundee', 56.4620, -2.9707, 'GB'),
('scotland', 'Stirling', 56.1165, -3.9369, 'GB'),
('scotland', 'Perth', 56.3950, -3.4308, 'GB'),
('scotland', 'Falkirk', 56.0019, -3.7839, 'GB'),
('scotland', 'Paisley', 55.8456, -4.4239, 'GB'),
('scotland', 'Kinross', 56.2050, -3.4210, 'GB'),
('scotland', 'Dunfermline', 56.0717, -3.4522, 'GB'),
('scotland', 'Bathgate', 55.9024, -3.6430, 'GB'),
('scotland', 'Highlands', 57.1953, -3.8292, 'GB'),
('scotland', 'Orkney', 58.9810, -2.9605, 'GB'),
('scotland', 'Greenock', 55.9486, -4.7643, 'GB'),
('scotland', 'Ayr', 55.4586, -4.6292, 'GB'),
('scotland', 'Kilmarnock', 55.6117, -4.4958, 'GB'),
('scotland', 'Inverurie', 57.2836, -2.3746, 'GB'),
('scotland', 'Fort William', 56.8198, -5.1052, 'GB'),
('scotland', 'Elgin', 57.6498, -3.3168, 'GB'),
('scotland', 'Dumfries', 55.0700, -3.6050, 'GB'),
('scotland', 'Arbroath', 56.5590, -2.5830, 'GB'),
('scotland', 'St Andrews', 56.3398, -2.7967, 'GB'),
('scotland', 'Kirkcaldy', 56.1107, -3.1674, 'GB'),
('scotland', 'Motherwell', 55.7890, -3.9915, 'GB'),
('scotland', 'Hamilton', 55.7772, -4.0397, 'GB'),
('scotland', 'Livingston', 55.8865, -3.5157, 'GB'),
('scotland', 'Glenrothes', 56.1950, -3.1720, 'GB'),
('scotland', 'Cumbernauld', 55.9457, -3.9925, 'GB'),
('scotland', 'Irvine', 55.6116, -4.6696, 'GB');

UPDATE market_cities
SET latitude = (SELECT f.latitude FROM centroid_fix f WHERE f.market = LOWER(TRIM(market_cities.market)) AND f.city_name = market_cities.city_name),
    longitude = (SELECT f.longitude FROM centroid_fix f WHERE f.market = LOWER(TRIM(market_cities.market)) AND f.city_name = market_cities.city_name)
WHERE latitude = 54 AND longitude = -2
  AND EXISTS (SELECT 1 FROM centroid_fix f WHERE f.market = LOWER(TRIM(market_cities.market)) AND f.city_name = market_cities.city_name);

UPDATE market_cities
SET state_code = (SELECT f.state_code FROM centroid_fix f WHERE f.market = 'ireland' AND f.city_name = market_cities.city_name)
WHERE LOWER(TRIM(market)) = 'ireland' AND UPPER(TRIM(COALESCE(state_code, ''))) = 'UK'
  AND EXISTS (SELECT 1 FROM centroid_fix f WHERE f.market = 'ireland' AND f.city_name = market_cities.city_name);

DROP TABLE centroid_fix;

COMMIT;

-- Verify: should return no rows.
SELECT market, city_name FROM market_cities WHERE latitude = 54 AND longitude = -2;
