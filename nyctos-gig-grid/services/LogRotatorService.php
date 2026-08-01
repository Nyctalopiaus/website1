<?php

class LogRotatorService {
    /**
     * Rotates active log file daily, caps size at 2MB, and purges logs older than $maxDays.
     * Checks logs/, cache/, and root directories for cron_sync.log.
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
            $baseDir . '/logs',
            $baseDir . '/cache',
            $baseDir
        ]);

        foreach ($targetDirs as $dir) {
            if (!is_dir($dir)) {
                continue;
            }

            $mainLogFile = rtrim($dir, '/\\') . '/cron_sync.log';

            // 1. Check active cron_sync.log for daily rotation or size cap
            if (file_exists($mainLogFile) && filesize($mainLogFile) > 0) {
                $fileSize = filesize($mainLogFile);
                $logDateStr = null;

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
                    $archivedName = sprintf('%s/cron_sync_%s.log', $dir, $archiveTag);

                    // Attempt archive copy
                    @copy($mainLogFile, $archivedName);

                    // Truncate active log file safely at OS level
                    $f = @fopen($mainLogFile, 'r+');
                    if ($f) {
                        @ftruncate($f, 0);
                        @fflush($f);
                        @fclose($f);
                    } else {
                        @file_put_contents($mainLogFile, '');
                    }

                    $reason = $shouldRotateDate ? "Daily ($logDateStr)" : "Size cap (>2MB)";
                    $messages[] = "[LOG ROTATOR] Rotated active log file [{$reason}] -> " . basename($archivedName);
                }
            }

            // 2. Purge expired log files older than $maxDays
            $files = glob(rtrim($dir, '/\\') . '/*.log*');
            if (is_array($files)) {
                foreach ($files as $filePath) {
                    if (basename($filePath) === 'cron_sync.log') {
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
