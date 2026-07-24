<?php

function getDbConnection() {
    try {
        $db = new PDO('sqlite:' . DB_PATH);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $db->setAttribute(PDO::ATTR_TIMEOUT, 10);

        // Reduce transient "database is locked" failures under concurrent reads/writes.
        $db->exec('PRAGMA busy_timeout = 10000');
        $db->exec('PRAGMA journal_mode = WAL');
        $db->exec('PRAGMA synchronous = NORMAL');
        $db->exec('PRAGMA foreign_keys = ON');
        return $db;
    } catch (PDOException $e) {
        error_log(sprintf('[%s] db-connection: %s in %s:%d', date('Y-m-d H:i:s'), $e->getMessage(), $e->getFile(), $e->getLine()));
        die('Database connection failed.');
    }
}
