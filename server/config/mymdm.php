<?php

return [
    'organization_name' => env('MYMDM_ORGANIZATION_NAME', 'Organisation principale'),
    'version' => '0.4.0',
    'base_url' => env('MYMDM_BASE_URL', env('APP_URL', 'https://mdm.example.org')),
    'apk_path' => env('MYMDM_APK_PATH', base_path('../android/app/build/outputs/apk/debug/app-debug.apk')),
    'android_apk_path' => env('MYMDM_ANDROID_APK_PATH', base_path('../android/app/build/outputs/apk/debug/app-debug.apk')),
    'agent_version' => env('MYMDM_AGENT_VERSION', '0.1.0-dev'),
    'agent_version_code' => (int) env('MYMDM_AGENT_VERSION_CODE', 1),
    'enrollment_ttl_hours' => (int) env('MYMDM_ENROLLMENT_TTL_HOURS', env('MYMDM_ENROLLMENT_TTL', 24)),
    'bootstrap_admin_email' => env('MYMDM_BOOTSTRAP_ADMIN_EMAIL'),
    'bootstrap_admin_password' => env('MYMDM_BOOTSTRAP_ADMIN_PASSWORD'),
];
