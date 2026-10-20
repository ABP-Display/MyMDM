<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AgentReleaseController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ConfigurationController;
use App\Http\Controllers\DeviceApiController;
use App\Http\Controllers\DownloadController;
use App\Http\Controllers\EnrollmentController;
use App\Http\Controllers\KioskAssetController;
use App\Http\Controllers\OrganizationController;
use App\Http\Controllers\UserController;
use App\Http\Middleware\ConsoleAccess;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', fn () => Auth::check()
    ? Inertia::render('Dashboard')
    : Inertia::render('Login'));
Route::get('/login', fn () => Inertia::render('Login'))->name('login');

Route::get('/devices', fn () => Inertia::render('Devices'))->middleware('auth');
Route::get('/devices/{device}', fn () => Inertia::render('DeviceDetail'))->middleware('auth');
Route::get('/enrollments', fn () => Inertia::render('Enrollments'))->middleware('auth');
Route::get('/configurations', fn () => Inertia::render('Configurations'))->middleware('auth');
Route::get('/guides/{platform}', fn (string $platform) => in_array($platform, ['android', 'ios'], true)
    ? Inertia::render('PlatformGuide')
    : abort(404))->middleware('auth');
Route::get('/agent', fn () => Inertia::render('AgentReleases'))->middleware('auth');
Route::get('/library', fn () => Inertia::render('KioskLibrary'))->middleware('auth');
Route::get('/settings', fn () => Inertia::render('Settings'))->middleware('auth');

Route::prefix('api/v1')->group(function (): void {
    Route::get('/version', [AdminController::class, 'version']);
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    Route::middleware(['auth', ConsoleAccess::class])->group(function (): void {
        Route::get('/users', [UserController::class, 'index']);
        Route::post('/users', [UserController::class, 'store']);
        Route::patch('/users/{user}', [UserController::class, 'update']);
        Route::delete('/users/{user}', [UserController::class, 'destroy']);
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::get('/dashboard', [AdminController::class, 'dashboard']);
        Route::get('/organizations', [OrganizationController::class, 'index']);
        Route::post('/organizations', [OrganizationController::class, 'store']);
        Route::patch('/organizations/{organization}', [OrganizationController::class, 'update']);
        Route::delete('/organizations/{organization}', [OrganizationController::class, 'destroy']);
        Route::get('/devices', [AdminController::class, 'devices']);
        Route::get('/devices/{device}', [AdminController::class, 'device']);
        Route::get('/devices/{device}/screenshot', [AdminController::class, 'screenshot']);
        Route::patch('/devices/{device}', [AdminController::class, 'updateDevice']);
        Route::patch('/devices/{device}/identity', [AdminController::class, 'updateDeviceIdentity']);
        Route::post('/devices/{device}/configuration', [AdminController::class, 'assignConfiguration']);
        Route::delete('/devices/{device}/configuration', [AdminController::class, 'detachConfiguration']);
        Route::post('/devices/{device}/commands', [AdminController::class, 'command']);
        Route::delete('/devices/{device}', [AdminController::class, 'deleteDevice']);
        Route::delete('/devices/{device}/factory-reset', [AdminController::class, 'cancelReset']);
        Route::post('/devices/{device}/factory-reset', [AdminController::class, 'resetDevice']);
        Route::post('/devices/{device}/revoke', [AdminController::class, 'revokeDevice']);
        Route::get('/device-groups', [AdminController::class, 'groups']);
        Route::post('/device-groups', [AdminController::class, 'createGroup']);
        Route::patch('/device-groups/{group}', [AdminController::class, 'updateGroup']);
        Route::delete('/device-groups/{group}', [AdminController::class, 'deleteGroup']);
        Route::get('/enrollments', [EnrollmentController::class, 'index']);
        Route::post('/enrollments', [EnrollmentController::class, 'store']);
        Route::get('/configurations', [ConfigurationController::class, 'index']);
        Route::post('/configurations', [ConfigurationController::class, 'store']);
        Route::patch('/configurations/{configuration}', [ConfigurationController::class, 'update']);
        Route::delete('/configurations/{configuration}', [ConfigurationController::class, 'destroy']);
        Route::get('/configurations/{configuration}/qr', [EnrollmentController::class, 'configurationQr']);
        Route::post('/configurations/{configuration}/qr/regenerate', [ConfigurationController::class, 'regenerate']);
        Route::get('/agent/releases', [AgentReleaseController::class, 'index']);
        Route::get('/agent/source', [AgentReleaseController::class, 'source']);
        Route::post('/agent/use-default', [AgentReleaseController::class, 'useDefault']);
        Route::post('/agent/releases', [AgentReleaseController::class, 'store']);
        Route::post('/agent/releases/{release}/activate', [AgentReleaseController::class, 'activate']);
        Route::delete('/agent/releases/{release}', [AgentReleaseController::class, 'destroy']);
        Route::get('/agent/releases/{release}/download', [AgentReleaseController::class, 'download']);
        Route::get('/kiosk-assets', [KioskAssetController::class, 'index']);
        Route::post('/kiosk-assets', [KioskAssetController::class, 'store']);
        Route::delete('/kiosk-assets/{kioskAsset}', [KioskAssetController::class, 'destroy']);
    });

    Route::post('/device/enroll', [DeviceApiController::class, 'enroll']);
    Route::middleware('device.auth')->group(function (): void {
        Route::post('/device/reset/status', [DeviceApiController::class, 'resetStatus']);
        Route::post('/device/command/status', [DeviceApiController::class, 'commandStatus']);
        Route::post('/device/heartbeat', [DeviceApiController::class, 'heartbeat']);
        Route::post('/device/location', [DeviceApiController::class, 'location']);
        Route::post('/device/screenshot', [DeviceApiController::class, 'screenshot']);
        Route::get('/device/policy', [DeviceApiController::class, 'policy']);
        Route::post('/device/policy/status', [DeviceApiController::class, 'policyStatus']);
        Route::get('/device/agent/update', [DeviceApiController::class, 'agentUpdate']);
        Route::get('/device/library/{sha256}', [KioskAssetController::class, 'download'])->where('sha256', '[a-f0-9]{64}');
    });
});

Route::get('/downloads/mymdm-agent.apk', [DownloadController::class, 'apk']);
Route::get('/downloads/enrollment-apks/{sha256}.apk', [DownloadController::class, 'enrollmentApk'])->where('sha256', '[a-f0-9]{64}');

Route::any('/api/{any}', fn () => abort(404))->where('any', '.*');

Route::fallback(fn () => Auth::check()
    ? Inertia::render('Dashboard')
    : Inertia::render('Login'));
