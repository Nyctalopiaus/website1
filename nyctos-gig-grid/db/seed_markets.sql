-- Multi-market venue seed for Southern California and Scotland
-- Safe to run multiple times (INSERT OR IGNORE by venue_key)

BEGIN TRANSACTION;

INSERT OR IGNORE INTO venues (venue_key, venue_name, market, address, city, latitude, longitude, capacity, maps_url) VALUES
('thewilternla', 'The Wiltern', 'socal', '3790 Wilshire Blvd, Los Angeles, CA 90010', 'Los Angeles', 34.0617, -118.3081, '2,300', 'https://www.google.com/maps/search/?api=1&query=The+Wiltern+Los+Angeles'),
('kiaforum', 'Kia Forum', 'socal', '3900 W Manchester Blvd, Inglewood, CA 90305', 'Inglewood', 33.9582, -118.3419, '17,500', 'https://www.google.com/maps/search/?api=1&query=Kia+Forum+Inglewood'),
('hollywoodpalladium', 'Hollywood Palladium', 'socal', '6215 Sunset Blvd, Los Angeles, CA 90028', 'Los Angeles', 34.0988, -118.3248, '4,000', 'https://www.google.com/maps/search/?api=1&query=Hollywood+Palladium+Los+Angeles'),
('belascola', 'The Belasco', 'socal', '1050 S Hill St, Los Angeles, CA 90015', 'Los Angeles', 34.0418, -118.2591, '1,500', 'https://www.google.com/maps/search/?api=1&query=The+Belasco+Los+Angeles'),
('observatoryoc', 'The Observatory', 'socal', '3503 S Harbor Blvd, Santa Ana, CA 92704', 'Santa Ana', 33.6995, -117.9206, '1,000', 'https://www.google.com/maps/search/?api=1&query=The+Observatory+Santa+Ana'),
('houseofbluesanaheim', 'House of Blues Anaheim', 'socal', '400 W Disney Way, Anaheim, CA 92802', 'Anaheim', 33.8076, -117.9176, '2,200', 'https://www.google.com/maps/search/?api=1&query=House+of+Blues+Anaheim'),
('soma', 'SOMA San Diego', 'socal', '3350 Sports Arena Blvd, San Diego, CA 92110', 'San Diego', 32.7520, -117.2130, '2,300', 'https://www.google.com/maps/search/?api=1&query=SOMA+San+Diego'),
('sodabar', 'Soda Bar', 'socal', '3615 El Cajon Blvd, San Diego, CA 92104', 'San Diego', 32.7557, -117.1247, '200', 'https://www.google.com/maps/search/?api=1&query=Soda+Bar+San+Diego'),
('observatorynorthpark', 'Observatory North Park', 'socal', '2891 University Ave, San Diego, CA 92104', 'San Diego', 32.7483, -117.1333, '1,100', 'https://www.google.com/maps/search/?api=1&query=Observatory+North+Park+San+Diego'),
('barrowland', 'Barrowland Ballroom', 'scotland', '244 Gallowgate, Glasgow G4 0TT, UK', 'Glasgow', 55.8553, -4.2325, '1,900', 'https://www.google.com/maps/search/?api=1&query=Barrowland+Ballroom+Glasgow'),
('swg3', 'SWG3', 'scotland', '100 Eastvale Pl, Glasgow G3 8QG, UK', 'Glasgow', 55.8652, -4.2892, '1,250', 'https://www.google.com/maps/search/?api=1&query=SWG3+Glasgow'),
('ovohydro', 'OVO Hydro', 'scotland', 'Exhibition Way, Glasgow G3 8YW, UK', 'Glasgow', 55.8607, -4.2862, '14,300', 'https://www.google.com/maps/search/?api=1&query=OVO+Hydro+Glasgow'),
('garageglasgow', 'The Garage', 'scotland', '490 Sauchiehall St, Glasgow G2 3LW, UK', 'Glasgow', 55.8663, -4.2710, '1,200', 'https://www.google.com/maps/search/?api=1&query=The+Garage+Glasgow'),
('kingtuts', 'King Tut''s Wah Wah Hut', 'scotland', '272A St Vincent St, Glasgow G2 5RL, UK', 'Glasgow', 55.8643, -4.2677, '300', 'https://www.google.com/maps/search/?api=1&query=King+Tuts+Wah+Wah+Hut+Glasgow'),
('bannermansbar', 'Bannerman''s Bar', 'scotland', '212 Cowgate, Edinburgh EH1 1NQ, UK', 'Edinburgh', 55.9481, -3.1886, '100', 'https://www.google.com/maps/search/?api=1&query=Bannermans+Bar+Edinburgh'),
('usherhall', 'Usher Hall', 'scotland', 'Lothian Rd, Edinburgh EH1 2EA, UK', 'Edinburgh', 55.9475, -3.2078, '2,200', 'https://www.google.com/maps/search/?api=1&query=Usher+Hall+Edinburgh'),
('liquidroom', 'The Liquid Room', 'scotland', '9C Victoria St, Edinburgh EH1 2HE, UK', 'Edinburgh', 55.9470, -3.1938, '750', 'https://www.google.com/maps/search/?api=1&query=The+Liquid+Room+Edinburgh'),
('glasgowroyalconcerthall', 'Glasgow Royal Concert Hall', 'scotland', '2 Sauchiehall St, Glasgow G2 3NY, UK', 'Glasgow', 55.8632, -4.2519, '2,475', 'https://www.google.com/maps/search/?api=1&query=Glasgow+Royal+Concert+Hall');

COMMIT;
