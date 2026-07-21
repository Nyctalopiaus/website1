<?php

function jsonResponse(array $payload) {
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}
