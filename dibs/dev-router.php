<?php
/**
 * Local dev only: lets PHP's built-in server handle brokerage URLs (/dibs/b/<slug>/...) the way
 * dibs/.htaccess does on the live server. Start the dev server from the vm_code folder with:
 *     php -S 127.0.0.1:8888 dibs/dev-router.php
 * Every other URL (the other apps in vm_code too) is served exactly as before.
 * On the live server this file does nothing.
 */
if (PHP_SAPI !== 'cli-server') { http_response_code(404); exit; }

$path = (string)(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
// Never serve the database folder, under any URL (the live server's data/.htaccess does this there).
if (preg_match('#^/dibs/(b/[^/]+/)?data(/|$)#', $path)) { http_response_code(403); echo 'Forbidden'; return true; }
if (!preg_match('#^/dibs/b/[a-z0-9][a-z0-9-]{1,39}(/.*)?$#', $path, $m)) return false;

$rest = $m[1] ?? '';
if ($rest === '') { header('Location: ' . $path . '/', true, 301); return true; }
if ($rest === '/') $rest = '/index.html';
if (basename($rest) === 'dev-router.php') { http_response_code(404); echo 'Not found'; return true; }

$dibs = realpath(__DIR__);
$file = realpath($dibs . $rest);
if (!$file || strpos($file, $dibs . DIRECTORY_SEPARATOR) !== 0 || !is_file($file)) { http_response_code(404); echo 'Not found'; return true; }

if (substr($file, -4) === '.php') {
    $_SERVER['SCRIPT_NAME'] = '/dibs' . str_replace('\\', '/', substr($file, strlen($dibs)));
    $_SERVER['SCRIPT_FILENAME'] = $file;
    chdir(dirname($file));
    require $file;
    return true;
}

$types = ['html' => 'text/html; charset=utf-8', 'js' => 'text/javascript; charset=utf-8', 'css' => 'text/css; charset=utf-8',
    'json' => 'application/json', 'svg' => 'image/svg+xml', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
    'webp' => 'image/webp', 'gif' => 'image/gif', 'ico' => 'image/x-icon', 'ttf' => 'font/ttf', 'woff2' => 'font/woff2', 'pdf' => 'application/pdf'];
$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
header('Cache-Control: no-cache');
readfile($file);
return true;
