<?php
/**
 * Database facade - connection, schema initialization, and seed bootstrapping
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db/connection.php';
require_once __DIR__ . '/db/schema.php';
require_once __DIR__ . '/db/seed.php';

function initDatabase() {
    $db = getDbConnection();
    ensureDatabaseSchema($db);
    seedDatabaseDefaults($db);
}

initDatabase();
