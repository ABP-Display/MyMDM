<?php

namespace App\Support;

class AdminPin
{
    public static function hash(string $pin): string
    {
        $salt = random_bytes(16);
        $iterations = 600000;
        $hash = hash_pbkdf2('sha256', $pin, $salt, $iterations, 32, true);

        return 'pbkdf2-sha256:'.$iterations.':'.base64_encode($salt).':'.base64_encode($hash);
    }
}
