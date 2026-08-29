<?php

class LogRotatorService {
    /**
     * Rotates all active cron_*_sync.log files daily, caps size at 2MB, and purges archived logs older than $maxDays.
     * Checks logs/cron_sync_log/, logs/, cache/, and root directories for cron_*_sync.log pattern.
     * (logs/cron_sync_log/ -- underscore -- must match the cPanel cron jobs' actual `>>`
     * redirect target; those jobs are not part of this codebase and won't change to match
     * a renamed folder here.)
     *
     * @param string $logDir Target logs directory path
     * @param int $maxDays Maximum retention in days (default 14)
     * @return array Summary log messages
     */
    public static function rotateAndPurge(string $logDir, int $maxDays = 14): array {
        $messages = [];
        $todayStr = date('Y-m-d');
        $cutoffTimestamp = time() - ($maxDays * 86400);

        // Target directories where cron_sync.log or archived logs might exist
        $baseDir = dirname(__DIR__);
        $targetDirs = array_unique([
            realpath($logDir) ?: $logDir,
            $baseDir . '/logs/cron_sync_log',
            $baseDir . '/logs',
            $baseDir . '/cache',
            $baseDir
        ]);

        foreach ($targetDirs as $dir) {
            if (!is_dir($dir)) {
                continue;
            }

            // Rotate all active cron_*_sync.log files (one per market)
            $activeLogFiles = glob(rtrim($dir, '/\\') . '/cron_*_sync.log') ?: [];
            // Also include legacy cron_sync.log if present
            $legacyLog = rtrim($dir, '/\\') . '/cron_sync.log';
            if (file_exists($legacyLog)) {
                $activeLogFiles[] = $legacyLog;
            }

            foreach ($activeLogFiles as $mainLogFile) {
                if (!file_exists($mainLogFile) || filesize($mainLogFile) === 0) {
                    continue;
                }

                $fileSize = filesize($mainLogFile);
                $logDateStr = null;
                $baseName = basename($mainLogFile, '.log');

                // Read first 20 lines to find earliest date stamp
                $handle = @fopen($mainLogFile, 'r');
                if ($handle) {
                    $lineCount = 0;
                    while (($line = fgets($handle)) !== false && $lineCount < 20) {
                        $lineCount++;
                        if (preg_match('/(\d{4}-\d{2}-\d{2})/', $line, $matches)) {
                            $logDateStr = $matches[1];
                            break;
                        }
                    }
                    fclose($handle);
                }

                if (!$logDateStr) {
                    $lastModified = filemtime($mainLogFile);
                    if ($lastModified !== false) {
                        $logDateStr = date('Y-m-d', $lastModified);
                    }
                }

                $shouldRotateDate = ($logDateStr && $logDateStr !== $todayStr);
                $shouldRotateSize = ($fileSize > 2 * 1024 * 1024); // Cap at 2MB

                if ($shouldRotateDate || $shouldRotateSize) {
                    $archiveTag = $logDateStr ?: date('Y-m-d_His');
                    $archivedName = sprintf('%s/%s_%s.log', $dir, $baseName, $archiveTag);

                    @copy($mainLogFile, $archivedName);

                    $f = @fopen($mainLogFile, 'r+');
                    if ($f) {
                        @ftruncate($f, 0);
                        @fflush($f);
                        @fclose($f);
                    } else {
                        @file_put_contents($mainLogFile, '');
                    }

                    $reason = $shouldRotateDate ? "Daily ($logDateStr)" : "Size cap (>2MB)";
                    $messages[] = "[LOG ROTATOR] Rotated {$baseName} [{$reason}] -> " . basename($archivedName);
                }
            }

            // 2. Purge expired log files older than $maxDays
            $files = glob(rtrim($dir, '/\\') . '/*.log*');
            if (is_array($files)) {
                foreach ($files as $filePath) {
                    // Skip all active (non-archived) cron log files
                    if (preg_match('/cron_[^.]+_sync\.log$/', $filePath) || basename($filePath) === 'cron_sync.log') {
                        continue;
                    }

                    $mtime = filemtime($filePath);
                    if ($mtime !== false && $mtime < $cutoffTimestamp) {
                        if (@unlink($filePath)) {
                            $messages[] = sprintf('[LOG PURGER] Purged expired log file %s (> %d days old)', basename($filePath), $maxDays);
                        }
                    }
                }
            }
        }

        return $messages;
    }
}
