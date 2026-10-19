<?php

namespace Tests\Feature;

use Symfony\Component\Process\Process;
use Tests\TestCase;

class ApplicationKeyTest extends TestCase
{
    public function test_generated_key_is_reused_across_processes(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'mymdm-key-');
        try {
            $first = new Process([PHP_BINARY, base_path('docker/app-key.php'), $path]);
            $first->mustRun();
            $second = new Process([PHP_BINARY, base_path('docker/app-key.php'), $path]);
            $second->mustRun();
            $this->assertSame($first->getOutput(), $second->getOutput());
            $this->assertStringStartsWith('base64:', $first->getOutput());
            $this->assertSame(32, strlen(base64_decode(substr($first->getOutput(), 7))));
        } finally {
            unlink($path);
        }
    }

    public function test_invalid_saved_key_is_not_silently_replaced(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'mymdm-key-');
        try {
            file_put_contents($path, 'invalid-key');
            $process = new Process([PHP_BINARY, base_path('docker/app-key.php'), $path]);
            $process->run();
            $this->assertFalse($process->isSuccessful());
            $this->assertSame('invalid-key', file_get_contents($path));
        } finally {
            unlink($path);
        }
    }
}
