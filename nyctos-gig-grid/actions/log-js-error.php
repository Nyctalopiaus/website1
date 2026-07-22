<?php

function handleLogJsError() {
    $err = trim($_POST['error'] ?? 'Unknown JS error');
    $dir = __DIR__ . '/../cache';
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    file_put_contents($dir . '/js_errors.log', '[' . date('Y-m-d H:i:s') . '] ' . $err . "\n", FILE_APPEND);
    jsonResponse(['status' => 'success']);
}
