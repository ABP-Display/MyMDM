<?php

$path = $argv[1] ?? '/app/storage/app/private/.app-key';
$handle = fopen($path, 'c+');
if ($handle === false || ! flock($handle, LOCK_EX)) {
    throw new RuntimeException('Unable to open the persistent application key');
}
try {
    $key = trim(stream_get_contents($handle));
    if ($key === '') {
        $key = 'base64:'.base64_encode(random_bytes(32));
        rewind($handle);
        if (fwrite($handle, $key."\n") !== strlen($key) + 1 || ! fflush($handle)) {
            throw new RuntimeException('Unable to persist the application key');
        }
        chmod($path, 0600);
    }
    if (! str_starts_with($key, 'base64:') || strlen(base64_decode(substr($key, 7), true) ?: '') !== 32) {
        throw new RuntimeException('Invalid persistent application key');
    }
    echo $key;
} finally {
    flock($handle, LOCK_UN);
    fclose($handle);
}
