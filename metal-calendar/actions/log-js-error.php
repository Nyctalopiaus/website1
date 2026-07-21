<?php

function handleLogJsError() {
    $err = trim($_POST['error'] ?? 'Unknown JS error');
    file_put_contents(__DIR__ . '/../cache/js_errors.log', '[' . date('Y-m-d H:i:s') . '] ' . $err . "\n", FILE_APPEND);
    jsonResponse(['status' => 'success']);
}
