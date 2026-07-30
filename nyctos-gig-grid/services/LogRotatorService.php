<?php

class LogRotatorService {
    /**
     * Rotates active log file daily and purges log files older than $maxDays.
     *
     * @param string $logDir Target logs directory path
     * @param int $maxDays Maximum retention in days (default 14)
     * @return array Summary log messages
     */
    public static function rotateAndPurge(string $logDir, int $maxDays = 14): array {
        $messages = [];
        $realPath = realpath($logDir) ?: $logDir;

        if (!is_dir($realPath)) {
            @mkdir($realPath, 0755, true);
        }

        $todayStr = date('Y-m-d');
        $mainLogFile = $realPath . '/cron_sync.log';

        // 1. Daily rotation: Check if cron_sync.log contains logs from a previous date
        if (file_exists($mainLogFile) && filesize($mainLogFile) > 0) {
            $logDateStr = null;

            // Read first 20 lines to find date stamp of previous log entries
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

            // Fallback to filemtime if no date pattern found in contents
            if (!$logDateStr) {
                $lastModified = filemtime($mainLogFile);
                if ($lastModified !== false) {
                    $logDateStr = date('Y-m-d', $lastModified);
                }
            }

            // If log file date is prior to today, rotate via copy & truncate
            if ($logDateStr && $logDateStr !== $todayStr) {
                $archivedName = sprintf('%s/cron_sync_%s.log', $realPath, $logDateStr);
                
                // Copy contents to archived file & clear active log file
                if (@copy($mainLogFile, $archivedName)) {
                    @file_put_contents($mainLogFile, '');
                    $messages[] = "[LOG ROTATOR] Rotated active log file ($logDateStr) -> " . basename($archivedName);
                } elseif (!file_exists($archivedName) && @rename($mainLogFile, $archivedName)) {
                    $messages[] = "[LOG ROTATOR] Renamed active log file ($logDateStr) -> " . basename($archivedName);
                }
            }
        }

        // 2. 14-Day Purge: Remove any log files older than 14 days
        $cutoffTimestamp = time() - ($maxDays * 86400);
        $files = glob($realPath . '/*.log*');

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

        return $messages;
    }
}
