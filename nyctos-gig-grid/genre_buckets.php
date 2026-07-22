<?php

function getGenreBucketConfig() {
    return [
        'all' => [
            'label' => 'All Genres',
            'title' => 'Show every event currently loaded into Nycto\'s Gig Grid.',
            'tags' => []
        ],
        'metal' => [
            'label' => 'Rock & Metal',
            'title' => 'Covers heavy metal, hard rock, classic rock, alternative metal, stoner rock, metalcore, doom metal, thrash metal, screamo, sludge, and adjacent styles.',
            'tags' => ['acoustic rock', 'alternative metal', 'blues-rock', 'classic rock', 'hard rock', 'heavy metal', 'industrial metal', 'metal', 'nu metal', 'nu-metal', 'post grunge', 'progressive metal', 'progressive rock', 'rock', 'rock & roll', 'soft rock', 'southern rock', 'space rock', 'alternative hardcore', 'doom metal', 'hardcore', 'melodic death metal', 'metalcore', 'screamo', 'sludge metal', 'stoner metal']
        ],
        'indie' => [
            'label' => 'Indie & Alternative',
            'title' => 'Covers indie rock, alternative rock, alternative pop, and post-rock.',
            'tags' => ['alternative', 'alternative r&b', 'alternative rock', 'folk rock', 'garage rock', 'indie rock', 'math rock', 'pop', 'pop rock', 'post rock']
        ],
        'punk' => [
            'label' => 'Punk & Post-Punk',
            'title' => 'Covers punk, punk rock, pop punk, post-punk, post-hardcore, and skate punk.',
            'tags' => ['folk punk', 'horror punk', 'pop punk', 'post punk', 'punk', 'punk rock']
        ]
    ];
}
