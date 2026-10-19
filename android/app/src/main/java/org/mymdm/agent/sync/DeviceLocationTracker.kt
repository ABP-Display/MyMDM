package org.mymdm.agent.sync

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.ResolvableApiException
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.LocationSettingsRequest
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.gms.tasks.Tasks
import org.mymdm.agent.admin.PolicyManager
import org.mymdm.agent.kiosk.KioskActivity
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

object DeviceLocationTracker : LocationListener {
    private const val PREFS = "device_location"
    private const val REFRESH_INTERVAL_MS = 60 * 60 * 1000L
    private const val FIRST_FIX_RETRY_INTERVAL_MS = 30 * 60 * 1000L
    private const val REQUEST_TIMEOUT_MS = 60 * 1000L
    private const val BACKGROUND_REQUEST_TIMEOUT_MS = 15 * 1000L
    private const val FUSED_MAX_AGE_MS = 5 * 60 * 1000L
    private const val LAST_KNOWN_MAX_AGE_MS = 24 * 60 * 60 * 1000L
    private var applicationContext: Context? = null
    private val trackingLock = Any()
    private var continuousCallback: LocationCallback? = null
    private var continuousSession = false

    fun startContinuousTracking(context: Context) = synchronized(trackingLock) {
        if (continuousCallback != null) return@synchronized
        val app = context.applicationContext
        applicationContext = app
        PolicyManager(app).prepareAgentPermissions()
        if (!hasPermission(app) || !app.getSystemService(LocationManager::class.java).isLocationEnabled) {
            return@synchronized
        }
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        continuousSession = DeviceSyncService.beginLocationSession()
        if (!continuousSession) return@synchronized

        val callback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                locationResult.lastLocation?.let(::save)
            }
        }
        continuousCallback = callback
        val request = LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, CONTINUOUS_INTERVAL_MS)
            .setMinUpdateIntervalMillis(CONTINUOUS_MIN_INTERVAL_MS)
            .setMaxUpdateDelayMillis(CONTINUOUS_MAX_DELAY_MS)
            .setMinUpdateDistanceMeters(CONTINUOUS_MIN_DISTANCE_METERS)
            .build()
        val client = LocationServices.getFusedLocationProviderClient(app)
        runCatching {
            client.lastLocation.addOnSuccessListener(app.mainExecutor) { location -> location?.let(::save) }
            client.requestLocationUpdates(request, callback, Looper.getMainLooper())
                .addOnFailureListener(app.mainExecutor) { error ->
                    prefs.edit().putString("last_error", error.message ?: error.javaClass.simpleName).apply()
                    stopContinuousTracking()
                }
        }.onFailure { error ->
            prefs.edit().putString("last_error", error.message ?: error.javaClass.simpleName).apply()
            stopContinuousTracking()
        }
        if (continuousCallback == null) return@synchronized
        prefs.edit().putBoolean("continuous_tracking", true).apply()
    }

    fun stopContinuousTracking() = synchronized(trackingLock) {
        val app = applicationContext
        val callback = continuousCallback
        if (app != null && callback != null) {
            LocationServices.getFusedLocationProviderClient(app).removeLocationUpdates(callback)
            app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("continuous_tracking", false).apply()
        }
        continuousCallback = null
        if (continuousSession) {
            continuousSession = false
            DeviceSyncService.endLocationSession()
        }
    }

    fun metrics(context: Context): Map<String, Any?> {
        val app = context.applicationContext
        applicationContext = app
        refreshIfDue(app)
        return storedMetrics(app)
    }

    fun currentMetrics(context: Context): Map<String, Any?> {
        val app = context.applicationContext
        applicationContext = app
        return storedMetrics(app)
    }

    fun requestNow(context: Context): Map<String, Any?> {
        check(Looper.myLooper() != Looper.getMainLooper()) { "La localisation ne peut pas être demandée depuis le thread principal" }
        val app = context.applicationContext
        applicationContext = app
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit()
            .putLong("last_request_at", System.currentTimeMillis())
            .apply()
        var foregroundSession = false
        try {
            PolicyManager(app).prepareAgentPermissions()
            check(hasPermission(app)) { "Autorisation de localisation absente" }
            val manager = app.getSystemService(LocationManager::class.java)
            check(manager.isLocationEnabled) { "La localisation Android est désactivée" }
            startContinuousTracking(app)
            foregroundSession = DeviceSyncService.beginLocationSession()
            val providers = enabledProviders(manager)
            val googleStatus = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(app)
            prefs.edit()
                .putString("providers", providers.joinToString(", "))
                .putInt("google_play_services_status", googleStatus)
                .putBoolean("foreground_session_started", foregroundSession)
                .apply()

            val recentLocation = bestLastKnown(manager)?.takeIf {
                System.currentTimeMillis() - it.time <= FUSED_MAX_AGE_MS
            }
            val result = AtomicReference(recentLocation)
            val fusedError = AtomicReference<String>()
            val completed = CountDownLatch(1)
            if (recentLocation != null) completed.countDown()
            val listener = object : LocationListener {
                override fun onLocationChanged(location: Location) {
                    if (result.compareAndSet(null, location)) completed.countDown()
                }
            }
            val cancellations = mutableListOf<CancellationSignal>()
            val fusedCancellation = CancellationTokenSource()
            val fusedClient = LocationServices.getFusedLocationProviderClient(app)
            val updates = LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, FUSED_UPDATE_INTERVAL_MS)
                .setMinUpdateIntervalMillis(FUSED_MIN_UPDATE_INTERVAL_MS)
                .setMaxUpdates(FUSED_MAX_UPDATES)
                .setDurationMillis(REQUEST_TIMEOUT_MS)
                .build()
            ensureLocationSettings(app, prefs, updates)
            val fusedCallback = object : LocationCallback() {
                override fun onLocationResult(locationResult: LocationResult) {
                    locationResult.lastLocation?.let { location ->
                        if (result.compareAndSet(null, location)) completed.countDown()
                    }
                }
            }
            runCatching {
                val request = CurrentLocationRequest.Builder()
                    .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                    .setMaxUpdateAgeMillis(FUSED_MAX_AGE_MS)
                    .setDurationMillis(REQUEST_TIMEOUT_MS)
                    .build()
                fusedClient.getCurrentLocation(request, fusedCancellation.token)
                    .addOnSuccessListener(app.mainExecutor) { location ->
                        if (location != null && result.compareAndSet(null, location)) completed.countDown()
                    }
                    .addOnFailureListener(app.mainExecutor) { error ->
                        fusedError.set(error.message ?: error.javaClass.simpleName)
                    }
                fusedClient.requestLocationUpdates(updates, fusedCallback, Looper.getMainLooper())
                    .addOnFailureListener(app.mainExecutor) { error ->
                        fusedError.set(error.message ?: error.javaClass.simpleName)
                    }
            }.onFailure { error ->
                fusedError.set(error.message ?: error.javaClass.simpleName)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                providers.forEach { provider ->
                    val cancellation = CancellationSignal()
                    cancellations.add(cancellation)
                    manager.getCurrentLocation(provider, cancellation, app.mainExecutor) { location ->
                        if (location != null && result.compareAndSet(null, location)) completed.countDown()
                    }
                }
            } else {
                @Suppress("DEPRECATION")
                providers.forEach { manager.requestSingleUpdate(it, listener, Looper.getMainLooper()) }
            }
            try {
                completed.await(REQUEST_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            } finally {
                fusedCancellation.cancel()
                fusedClient.removeLocationUpdates(fusedCallback)
                cancellations.forEach(CancellationSignal::cancel)
                manager.removeUpdates(listener)
            }

            val location = result.get() ?: bestLastKnown(manager)?.takeIf {
                System.currentTimeMillis() - it.time <= LAST_KNOWN_MAX_AGE_MS
            }
            check(location != null) {
                val detail = fusedError.get()?.take(180)
                val diagnostics = buildList {
                    if (!hasBackgroundPermission(app)) add("autorisation arrière-plan absente")
                    if (!foregroundSession) add("session de localisation au premier plan indisponible")
                    if (googleStatus != 0) add("services Google code $googleStatus")
                    if (providers.isEmpty()) add("aucun fournisseur Android activé")
                    if (!detail.isNullOrBlank()) add("service fusionné : $detail")
                }
                if (diagnostics.isEmpty())
                    "Aucune position reçue sous 60 secondes. Activez Localisation > Précision de la localisation Google sur l’appareil."
                else "Aucune position reçue sous 60 secondes (${diagnostics.joinToString(" ; ")})"
            }
            save(location)
            return storedMetrics(app)
        } catch (error: Exception) {
            prefs.edit().putString("last_error", error.message ?: error.javaClass.simpleName).apply()
            throw error
        } finally {
            if (foregroundSession) DeviceSyncService.endLocationSession()
        }
    }

    private fun storedMetrics(context: Context): Map<String, Any?> {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val manager = context.getSystemService(LocationManager::class.java)
        return buildMap {
            put("location_permission_granted", hasPermission(context))
            put("location_background_permission_granted", hasBackgroundPermission(context))
            put("location_enabled", manager.isLocationEnabled)
            put("location_last_request_timestamp", prefs.getLong("last_request_at", 0L))
            put("location_last_success_timestamp", prefs.getLong("last_success_at", 0L))
            put("location_last_error", prefs.getString("last_error", null))
            put("location_providers", prefs.getString("providers", null))
            put("location_strategy", "continuous_balanced_fused+on_sync_high_accuracy+android_fallback")
            put("location_google_play_services_status", prefs.getInt("google_play_services_status", -1))
            put("location_settings_status", prefs.getInt("settings_status", -1))
            put("location_foreground_session_started", prefs.getBoolean("foreground_session_started", false))
            put("location_continuous_tracking", prefs.getBoolean("continuous_tracking", false))
            if (prefs.contains("timestamp")) {
                put("location_latitude", prefs.getString("latitude", null)?.toDoubleOrNull())
                put("location_longitude", prefs.getString("longitude", null)?.toDoubleOrNull())
                put("location_accuracy_meters", prefs.getFloat("accuracy", 0f).toDouble())
                put("location_provider", prefs.getString("provider", null))
                put("location_timestamp", prefs.getLong("timestamp", 0L))
            }
        }
    }

    override fun onLocationChanged(location: Location) = save(location)
    override fun onProviderEnabled(provider: String) = Unit
    override fun onProviderDisabled(provider: String) = Unit
    @Deprecated("Kept for Android 9 compatibility")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit

    private fun save(location: Location) {
        val app = applicationContext ?: return
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("latitude", location.latitude.toString())
            .putString("longitude", location.longitude.toString())
            .putFloat("accuracy", location.accuracy)
            .putString("provider", location.provider)
            .putLong("timestamp", location.time)
            .putLong("last_success_at", System.currentTimeMillis())
            .remove("last_error")
            .apply()
    }

    private fun refreshIfDue(context: Context) {
        if (!hasPermission(context)) return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val interval = if (prefs.contains("timestamp")) REFRESH_INTERVAL_MS else FIRST_FIX_RETRY_INTERVAL_MS
        if (now - prefs.getLong("last_request_at", 0L) < interval) return
        val manager = context.getSystemService(LocationManager::class.java)
        runCatching {
            bestLastKnown(manager)?.let(::save)
            val providers = enabledProviders(manager)
            prefs.edit().putString("providers", providers.joinToString(", ")).apply()
            prefs.edit().putLong("last_request_at", now).apply()
            val fusedCancellation = CancellationTokenSource()
            val fusedRequest = CurrentLocationRequest.Builder()
                .setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                .setMaxUpdateAgeMillis(LAST_KNOWN_MAX_AGE_MS)
                .setDurationMillis(BACKGROUND_REQUEST_TIMEOUT_MS)
                .build()
            LocationServices.getFusedLocationProviderClient(context)
                .getCurrentLocation(fusedRequest, fusedCancellation.token)
                .addOnSuccessListener(context.mainExecutor) { location -> location?.let(::save) }
                .addOnFailureListener(context.mainExecutor) { error ->
                    Log.w("MyMDM", "fused location refresh failed: ${error.message}")
                }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val cancellations = providers.map { CancellationSignal() }
                Handler(Looper.getMainLooper()).postDelayed({
                    fusedCancellation.cancel()
                    cancellations.forEach(CancellationSignal::cancel)
                }, BACKGROUND_REQUEST_TIMEOUT_MS)
                providers.forEachIndexed { index, provider ->
                    manager.getCurrentLocation(provider, cancellations[index], context.mainExecutor) { location ->
                        if (location != null) {
                            save(location)
                            fusedCancellation.cancel()
                            cancellations.forEach(CancellationSignal::cancel)
                        }
                    }
                }
            } else {
                Handler(Looper.getMainLooper()).postDelayed({ fusedCancellation.cancel() }, BACKGROUND_REQUEST_TIMEOUT_MS)
                @Suppress("DEPRECATION")
                providers.forEach { manager.requestSingleUpdate(it, this, Looper.getMainLooper()) }
            }
        }.onFailure {
            prefs.edit().putString("last_error", it.message ?: it.javaClass.simpleName).apply()
            Log.w("MyMDM", "location refresh failed: ${it.message}")
        }
    }

    private fun bestLastKnown(manager: LocationManager): Location? = manager.getProviders(true)
        .mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }
        .maxWithOrNull(compareBy<Location> { it.time }.thenBy { -it.accuracy })

    private fun enabledProviders(manager: LocationManager): List<String> =
        listOf("fused", LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
            .filter { manager.allProviders.contains(it) && manager.isProviderEnabled(it) }

    private fun hasPermission(context: Context): Boolean =
        context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun hasBackgroundPermission(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun ensureLocationSettings(context: Context, prefs: android.content.SharedPreferences, request: LocationRequest) {
        val settingsRequest = LocationSettingsRequest.Builder().addLocationRequest(request).setAlwaysShow(true).build()
        try {
            Tasks.await(LocationServices.getSettingsClient(context).checkLocationSettings(settingsRequest), SETTINGS_CHECK_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            prefs.edit().putInt("settings_status", 0).apply()
        } catch (error: Exception) {
            val cause = if (error is ExecutionException) error.cause ?: error else error
            val status = (cause as? ApiException)?.statusCode ?: -1
            prefs.edit().putInt("settings_status", status).apply()
            if (cause is ResolvableApiException) {
                val displayed = KioskActivity.requestLocationSettingsResolution(cause)
                error(if (displayed) {
                    "Android demande d’activer la précision de localisation. Validez le dialogue sur l’appareil, puis relancez la demande."
                } else {
                    "Activez Localisation > Précision de la localisation Google dans les réglages de l’appareil."
                })
            }
            Log.w("MyMDM", "location settings check failed: ${cause.message}")
        }
    }

    private const val FUSED_UPDATE_INTERVAL_MS = 2_000L
    private const val FUSED_MIN_UPDATE_INTERVAL_MS = 1_000L
    private const val FUSED_MAX_UPDATES = 3
    private const val SETTINGS_CHECK_TIMEOUT_SECONDS = 5L
    private const val CONTINUOUS_INTERVAL_MS = 15 * 60 * 1000L
    private const val CONTINUOUS_MIN_INTERVAL_MS = 5 * 60 * 1000L
    private const val CONTINUOUS_MAX_DELAY_MS = 30 * 60 * 1000L
    private const val CONTINUOUS_MIN_DISTANCE_METERS = 25f
}
