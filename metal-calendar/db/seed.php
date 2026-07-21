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

    $stmtVenue = $db->prepare("INSERT OR IGNORE INTO venues (venue_key, venue_name, address, city, capacity, maps_url) VALUES (:key, :name, :address, :city, :capacity, :maps_url)");
    $db->beginTransaction();
    foreach ($defaultVenues as $v) {
        $stmtVenue->execute([
            ':key' => $v['venue_key'],
            ':name' => $v['venue_name'],
            ':address' => $v['address'],
            ':city' => $v['city'],
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
