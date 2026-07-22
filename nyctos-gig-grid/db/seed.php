<?php

function seedDatabaseDefaults(PDO $db) {
    seedDefaultVenues($db);
    seedDefaultMetalArtists($db);
}

function seedDefaultVenues(PDO $db) {
    $defaultVenues = [
        ['venue_key' => 'bluebirdtheater', 'venue_name' => 'Bluebird Theater', 'address' => '3317 E Colfax Ave, Denver, CO 80206', 'city' => 'Denver', 'capacity' => '550', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Bluebird+Theater+Denver'],
        ['venue_key' => 'ogdentheatre', 'venue_name' => 'Ogden Theatre', 'address' => '935 E Colfax Ave, Denver, CO 80218', 'city' => 'Denver', 'capacity' => '1,600', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Ogden+Theatre+Denver'],
        ['venue_key' => 'gothictheatre', 'venue_name' => 'Gothic Theatre', 'address' => '3263 S Broadway, Englewood, CO 80113', 'city' => 'Englewood', 'capacity' => '1,100', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Gothic+Theatre+Englewood'],
        ['venue_key' => 'missionballroom', 'venue_name' => 'Mission Ballroom', 'address' => '4242 Wynkoop St, Denver, CO 80216', 'city' => 'Denver', 'capacity' => '3,950', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Mission+Ballroom+Denver'],
        ['venue_key' => 'fiddlersgreen', 'venue_name' => "Fiddler's Green Amphitheatre", 'address' => '6301 S Fiddlers Green Cir, Greenwood Village, CO 80111', 'city' => 'Greenwood Village', 'capacity' => '18,000', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Fiddlers+Green+Amphitheatre'],
        ['venue_key' => 'redrocks', 'venue_name' => 'Red Rocks Amphitheatre', 'address' => '18300 W Alameda Pkwy, Morrison, CO 80465', 'city' => 'Morrison', 'capacity' => '9,525', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Red+Rocks+Amphitheatre'],
        ['venue_key' => 'summit', 'venue_name' => 'Summit Music Hall', 'address' => '1902 Blake St, Denver, CO 80202', 'city' => 'Denver', 'capacity' => '1,100', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Summit+Music+Hall+Denver'],
        ['venue_key' => 'marquis', 'venue_name' => 'Marquis Theater', 'address' => '2009 Larimer St, Denver, CO 80205', 'city' => 'Denver', 'capacity' => '450', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Marquis+Theater+Denver'],
        ['venue_key' => 'fillmore', 'venue_name' => 'Fillmore Auditorium', 'address' => '1510 N Clarkson St, Denver, CO 80218', 'city' => 'Denver', 'capacity' => '3,900', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Fillmore+Auditorium+Denver'],
        ['venue_key' => 'blacksheep', 'venue_name' => 'The Black Sheep', 'address' => '2106 E Platte Ave, Colorado Springs, CO 80909', 'city' => 'Colorado Springs', 'capacity' => '450', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=The+Black+Sheep+Colorado+Springs'],
        ['venue_key' => 'aggie', 'venue_name' => 'Aggie Theatre', 'address' => '204 S College Ave, Fort Collins, CO 80524', 'city' => 'Fort Collins', 'capacity' => '650', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Aggie+Theatre+Fort+Collins'],
        ['venue_key' => 'mishawaka', 'venue_name' => 'Mishawaka Amphitheatre', 'address' => '13714 Rist Canyon Rd, Bellvue, CO 80512', 'city' => 'Bellvue', 'capacity' => '1,000', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Mishawaka+Amphitheatre'],
        ['venue_key' => 'sunshine', 'venue_name' => 'Sunshine Studios Live', 'address' => '3970 Clear View Loop, Colorado Springs, CO 80911', 'city' => 'Colorado Springs', 'capacity' => '1,000', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Sunshine+Studios+Live+Colorado+Springs'],
        ['venue_key' => 'cervantes', 'venue_name' => "Cervantes' Masterpiece Ballroom", 'address' => '2637 Welton St, Denver, CO 80205', 'city' => 'Denver', 'capacity' => '1,000', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Cervantes+Masterpiece+Ballroom'],
        ['venue_key' => 'bluearena', 'venue_name' => 'Blue Arena', 'address' => '5290 Arena Cir, Loveland, CO 80538', 'city' => 'Loveland', 'capacity' => '7,200', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Blue+Arena+Loveland'],
        ['venue_key' => 'surfside7', 'venue_name' => 'Surfside 7', 'address' => '150 N College Ave, Fort Collins, CO 80524', 'city' => 'Fort Collins', 'capacity' => '100', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Surfside+7+Fort+Collins'],
        ['venue_key' => 'moxitheater', 'venue_name' => 'Moxi Theater', 'address' => '802 9th St, Greeley, CO 80631', 'city' => 'Greeley', 'capacity' => '400', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Moxi+Theater+Greeley'],
        ['venue_key' => 'thejunkyard', 'venue_name' => 'The Junkyard', 'address' => '2323 W Mulberry Pl, Denver, CO 80204', 'city' => 'Denver', 'capacity' => '5,000', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=The+Junkyard+Denver']
    ];

    $socalVenues = [
        ['venue_key' => 'thewilternla', 'venue_name' => 'The Wiltern', 'market' => 'socal', 'address' => '3790 Wilshire Blvd, Los Angeles, CA 90010', 'city' => 'Los Angeles', 'latitude' => 34.0617, 'longitude' => -118.3081, 'capacity' => '2,300', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=The+Wiltern+Los+Angeles'],
        ['venue_key' => 'kiaforum', 'venue_name' => 'Kia Forum', 'market' => 'socal', 'address' => '3900 W Manchester Blvd, Inglewood, CA 90305', 'city' => 'Inglewood', 'latitude' => 33.9582, 'longitude' => -118.3419, 'capacity' => '17,500', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Kia+Forum+Inglewood'],
        ['venue_key' => 'hollywoodpalladium', 'venue_name' => 'Hollywood Palladium', 'market' => 'socal', 'address' => '6215 Sunset Blvd, Los Angeles, CA 90028', 'city' => 'Los Angeles', 'latitude' => 34.0988, 'longitude' => -118.3248, 'capacity' => '4,000', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Hollywood+Palladium+Los+Angeles'],
        ['venue_key' => 'belascola', 'venue_name' => 'The Belasco', 'market' => 'socal', 'address' => '1050 S Hill St, Los Angeles, CA 90015', 'city' => 'Los Angeles', 'latitude' => 34.0418, 'longitude' => -118.2591, 'capacity' => '1,500', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=The+Belasco+Los+Angeles'],
        ['venue_key' => 'observatoryoc', 'venue_name' => 'The Observatory', 'market' => 'socal', 'address' => '3503 S Harbor Blvd, Santa Ana, CA 92704', 'city' => 'Santa Ana', 'latitude' => 33.6995, 'longitude' => -117.9206, 'capacity' => '1,000', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=The+Observatory+Santa+Ana'],
        ['venue_key' => 'houseofbluesanaheim', 'venue_name' => 'House of Blues Anaheim', 'market' => 'socal', 'address' => '400 W Disney Way, Anaheim, CA 92802', 'city' => 'Anaheim', 'latitude' => 33.8076, 'longitude' => -117.9176, 'capacity' => '2,200', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=House+of+Blues+Anaheim'],
        ['venue_key' => 'soma', 'venue_name' => 'SOMA San Diego', 'market' => 'socal', 'address' => '3350 Sports Arena Blvd, San Diego, CA 92110', 'city' => 'San Diego', 'latitude' => 32.7520, 'longitude' => -117.2130, 'capacity' => '2,300', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=SOMA+San+Diego'],
        ['venue_key' => 'sodabar', 'venue_name' => 'Soda Bar', 'market' => 'socal', 'address' => '3615 El Cajon Blvd, San Diego, CA 92104', 'city' => 'San Diego', 'latitude' => 32.7557, 'longitude' => -117.1247, 'capacity' => '200', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Soda+Bar+San+Diego'],
        ['venue_key' => 'observatorynorthpark', 'venue_name' => 'Observatory North Park', 'market' => 'socal', 'address' => '2891 University Ave, San Diego, CA 92104', 'city' => 'San Diego', 'latitude' => 32.7483, 'longitude' => -117.1333, 'capacity' => '1,100', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Observatory+North+Park+San+Diego']
    ];

    $scotlandVenues = [
        ['venue_key' => 'barrowland', 'venue_name' => 'Barrowland Ballroom', 'market' => 'scotland', 'address' => '244 Gallowgate, Glasgow G4 0TT, UK', 'city' => 'Glasgow', 'latitude' => 55.8553, 'longitude' => -4.2325, 'capacity' => '1,900', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Barrowland+Ballroom+Glasgow'],
        ['venue_key' => 'swg3', 'venue_name' => 'SWG3', 'market' => 'scotland', 'address' => '100 Eastvale Pl, Glasgow G3 8QG, UK', 'city' => 'Glasgow', 'latitude' => 55.8652, 'longitude' => -4.2892, 'capacity' => '1,250', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=SWG3+Glasgow'],
        ['venue_key' => 'ovohydro', 'venue_name' => 'OVO Hydro', 'market' => 'scotland', 'address' => 'Exhibition Way, Glasgow G3 8YW, UK', 'city' => 'Glasgow', 'latitude' => 55.8607, 'longitude' => -4.2862, 'capacity' => '14,300', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=OVO+Hydro+Glasgow'],
        ['venue_key' => 'garageglasgow', 'venue_name' => 'The Garage', 'market' => 'scotland', 'address' => '490 Sauchiehall St, Glasgow G2 3LW, UK', 'city' => 'Glasgow', 'latitude' => 55.8663, 'longitude' => -4.2710, 'capacity' => '1,200', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=The+Garage+Glasgow'],
        ['venue_key' => 'kingtuts', 'venue_name' => 'King Tut\'s Wah Wah Hut', 'market' => 'scotland', 'address' => '272A St Vincent St, Glasgow G2 5RL, UK', 'city' => 'Glasgow', 'latitude' => 55.8643, 'longitude' => -4.2677, 'capacity' => '300', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=King+Tuts+Wah+Wah+Hut+Glasgow'],
        ['venue_key' => 'bannermansbar', 'venue_name' => 'Bannerman\'s Bar', 'market' => 'scotland', 'address' => '212 Cowgate, Edinburgh EH1 1NQ, UK', 'city' => 'Edinburgh', 'latitude' => 55.9481, 'longitude' => -3.1886, 'capacity' => '100', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Bannermans+Bar+Edinburgh'],
        ['venue_key' => 'usherhall', 'venue_name' => 'Usher Hall', 'market' => 'scotland', 'address' => 'Lothian Rd, Edinburgh EH1 2EA, UK', 'city' => 'Edinburgh', 'latitude' => 55.9475, 'longitude' => -3.2078, 'capacity' => '2,200', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Usher+Hall+Edinburgh'],
        ['venue_key' => 'liquidroom', 'venue_name' => 'The Liquid Room', 'market' => 'scotland', 'address' => '9C Victoria St, Edinburgh EH1 2HE, UK', 'city' => 'Edinburgh', 'latitude' => 55.9470, 'longitude' => -3.1938, 'capacity' => '750', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=The+Liquid+Room+Edinburgh'],
        ['venue_key' => 'cityhalls', 'venue_name' => 'Glasgow Royal Concert Hall', 'market' => 'scotland', 'address' => '2 Sauchiehall St, Glasgow G2 3NY, UK', 'city' => 'Glasgow', 'latitude' => 55.8632, 'longitude' => -4.2519, 'capacity' => '2,475', 'maps_url' => 'https://www.google.com/maps/search/?api=1&query=Glasgow+Royal+Concert+Hall']
    ];

    $defaultVenues = array_merge($defaultVenues, $socalVenues, $scotlandVenues);

    $stmtVenue = $db->prepare("INSERT OR IGNORE INTO venues (venue_key, venue_name, market, address, city, latitude, longitude, capacity, maps_url) VALUES (:key, :name, :market, :address, :city, :latitude, :longitude, :capacity, :maps_url)");
    $db->beginTransaction();
    foreach ($defaultVenues as $v) {
        $stmtVenue->execute([
            ':key' => $v['venue_key'],
            ':name' => $v['venue_name'],
            ':market' => $v['market'] ?? 'front-range',
            ':address' => $v['address'],
            ':city' => $v['city'],
            ':latitude' => $v['latitude'] ?? null,
            ':longitude' => $v['longitude'] ?? null,
            ':capacity' => $v['capacity'],
            ':maps_url' => $v['maps_url']
        ]);
    }
    $db->commit();
}

function seedDefaultMetalArtists(PDO $db) {
    $count = $db->query("SELECT COUNT(*) FROM metal_artists")->fetchColumn();
    if ($count != 0) {
        return;
    }

    $defaultBands = [
        'Metallica', 'Iron Maiden', 'Megadeth', 'Slayer', 'Anthrax', 'Pantera', 'Slipknot',
        'Avenged Sevenfold', 'Lamb of God', 'Mastodon', 'Gojira', 'Meshuggah', 'Trivium',
        'Opeth', 'In Flames', 'Amon Amarth', 'Cannibal Corpse', 'Death', 'Carcass',
        'Behemoth', 'Kreator', 'Sodom', 'Testament', 'Exodus', 'Overkill', 'Sepultura',
        'Machine Head', 'Killswitch Engage', 'As I Lay Dying', 'August Burns Red',
        'Parkway Drive', 'Architects', 'Spiritbox', 'Lorna Shore', 'Whitechapel',
        'Thy Art Is Murder', 'Between the Buried and Me', 'Animals as Leaders',
        'Dream Theater', 'Queensrÿche', 'Fates Warning', 'Symphony X', 'Nightwish',
        'Within Temptation', 'Epica', 'Sabaton', 'Powerwolf', 'Helloween',
        'Blind Guardian', 'DragonForce', 'HammerFall', 'Deftones', 'System of a Down',
        'Korn', 'Disturbed', 'Mudvayne', 'Static-X', 'Coal Chamber', 'Tool',
        'A Perfect Circle', 'Chevelle', 'Rammstein', 'Ghost', 'Sleep Token',
        'Electric Callboy', 'Babymetal', 'Hanabie', 'Jinjer', 'Lacuna Coil', 'Evanescence',
        'Municipal Waste', 'Power Trip', 'High on Fire', 'Corrosion of Conformity',
        'Clutch', 'Red Fang', 'Baroness', 'The Sword', 'Windhand', 'Elder',
        'Breaking Benjamin', 'In This Moment'
    ];

    $stmt = $db->prepare("INSERT OR IGNORE INTO metal_artists (artist_name) VALUES (:name)");
    $db->beginTransaction();
    foreach ($defaultBands as $band) {
        $stmt->execute([':name' => $band]);
    }
    $db->commit();
}
