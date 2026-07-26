<?php

function getDbConnection() {
    try {
        $db = new PDO('sqlite:' . DB_PATH);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $db->setAttribute(PDO::ATTR_TIMEOUT, 30);

        // Reduce transient "database is locked" failures under concurrent reads/writes.
        $db->exec('PRAGMA busy_timeout = 30000');
        $db->exec('PRAGMA journal_mode = WAL');
        $db->exec('PRAGMA synchronous = NORMAL');
        $db->exec('PRAGMA foreign_keys = ON');
        return $db;
    } catch (PDOException $e) {
        error_log(sprintf('[%s] db-connection: %s in %s:%d', date('Y-m-d H:i:s'), $e->getMessage(), $e->getFile(), $e->getLine()));
        die('Database connection failed.');
    }
}

/**
 * Executes a prepared statement with exponential backoff retries if SQLite encounters transient lock issues.
 */
function executeWithRetry(PDOStatement $stmt, array $params = [], $maxRetries = 5, $initialDelayUs = 100000) {
    $attempt = 0;
    while (true) {
        try {
            return $stmt->execute($params);
        } catch (PDOException $e) {
            $attempt++;
            $msg = strtolower($e->getMessage());
            $isLocked = (strpos($msg, 'locked') !== false || strpos($msg, 'busy') !== false);
            
            if ($isLocked && $attempt < $maxRetries) {
                @$stmt->closeCursor();
                usleep($initialDelayUs * $attempt); // Exponential delay: 100ms, 200ms, 300ms...
                continue;
            }
            @$stmt->closeCursor();
            throw $e;
        }
    }
}
