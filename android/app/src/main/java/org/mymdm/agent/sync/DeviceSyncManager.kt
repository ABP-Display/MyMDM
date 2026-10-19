package org.mymdm.agent.sync

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import org.mymdm.agent.admin.PolicyManager
import org.mymdm.agent.api.MyMDMApi
import org.mymdm.agent.api.models.Policy
import org.mymdm.agent.storage.SecureStorage
import org.mymdm.agent.kiosk.KioskScreenSnapshot
import org.mymdm.agent.library.DeviceLibraryManager
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class DeviceSyncManager(private val context: Context) {
    data class Result(val attempted: Boolean, val changed: Boolean, val policy: Policy?, val error: String?)

    fun start() {
        synchronized(lock) {
            if (started) return
            started = true
            schedulerContext = context.applicationContext
            executor.execute { DeviceSyncManager(context.applicationContext).syncOnce() }
        }
    }

    fun runScheduled() {
        synchronized(lock) {
            started = true
            schedulerContext = context.applicationContext
            executor.execute { DeviceSyncManager(context.applicationContext).syncOnce() }
        }
    }

    fun syncOnce(): Result {
        val result = performSync()
        reschedule(result.policy)
        return result
    }

    private fun performSync(): Result = synchronized(syncExecutionLock) {
        val powerManager = context.getSystemService(PowerManager::class.java)
        val wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MyMDM:DeviceSync").apply {
            setReferenceCounted(false)
            acquire(WAKE_LOCK_TIMEOUT_MS)
        }
        try {
            performSyncWhileAwake()
        } finally {
            if (wakeLock.isHeld) wakeLock.release()
        }
    }

    private fun performSyncWhileAwake(): Result {
        val appContext = context.applicationContext
        val storage = SecureStorage(appContext)
        val server = storage.serverUrl() ?: return Result(attempted = false, changed = false, policy = storage.policy(), error = "missing server URL")
        val credential = storage.credential() ?: return Result(attempted = false, changed = false, policy = storage.policy(), error = "missing device credential")
        val current = storage.policy()
        return try {
            val api = MyMDMApi(server, credential)
            val location = runCatching { DeviceLocationTracker.requestNow(appContext) }
                .onFailure { Log.w("MyMDM", "location refresh during sync failed: ${it.message}") }
                .getOrElse { DeviceLocationTracker.currentMetrics(appContext) }
            if (location["location_latitude"] != null && location["location_longitude"] != null) {
                runCatching { api.updateLocation(location) }
                    .onFailure { Log.w("MyMDM", "location upload during sync failed: ${it.message}") }
            }
            if (!KioskScreenSnapshot.captureCurrent()) {
                Log.w("MyMDM", "screen capture skipped because managed screen capture is unavailable")
            }
            val telemetry = DeviceTelemetry.collect(appContext)
            val heartbeat = api.heartbeat(
                current?.revision ?: 0,
                current?.kioskEnabled == true && !PolicyManager(appContext).isPaused(),
                telemetry.batteryLevel,
                telemetry.batteryCharging,
                telemetry.volumeLevel,
                telemetry.brightnessLevel,
                telemetry.metrics,
            )
            storage.markSynced()
            val resetId = heartbeat.optString("factory_reset").takeIf { it.isNotBlank() && it != "null" }
            if (resetId != null) {
                val manager = appContext.getSystemService(DevicePolicyManager::class.java)
                if (!manager.isDeviceOwnerApp(appContext.packageName)) {
                    api.resetStatus(resetId, "failed", "MyMDM n'est pas Device Owner")
                    return Result(true, false, current, "Factory reset requires Device Owner")
                }
                // Claim before invoking Android. A lost acknowledgement must never trigger a wipe.
                api.resetStatus(resetId, "dispatched")
                try {
                    if (Build.VERSION.SDK_INT >= 34) manager.wipeDevice(0)
                    else {
                        @Suppress("DEPRECATION")
                        manager.wipeData(0)
                    }
                } catch (e: Exception) {
                    api.resetStatus(resetId, "failed", (e.message ?: e.javaClass.simpleName).take(2000))
                    throw e
                }
                return Result(true, false, current, null)
            }
            val organizationChanged = heartbeat.optString("organization_name", current?.organizationName.orEmpty()) != current?.organizationName.orEmpty()
            val changed = heartbeat.optBoolean("policy_changed", false) || organizationChanged
            val command = heartbeat.optJSONObject("command")
            KioskScreenSnapshot.uploadPending(appContext, api)
            if (command != null) DeviceCommandExecutor(appContext).execute(command, api)
            Log.i("MyMDM", "heartbeat ok changed=$changed currentRevision=${current?.revision ?: 0}")
            if (changed || current == null) {
                val policy = api.policy()
                storage.savePolicy(policy)
                DeviceLibraryManager(appContext).reconcile(api, policy)
                PolicyManager(appContext).apply(policy)
                api.postPolicyStatus(policy.revision, "applied", null)
                Log.i("MyMDM", "policy applied revision=${policy.revision} kiosk=${policy.kioskEnabled}")
                Result(attempted = true, changed = true, policy = policy, error = null)
            } else {
                current?.let { DeviceLibraryManager(appContext).reconcile(api, it) }
                Result(attempted = true, changed = false, policy = current, error = null)
            }
        } catch (e: Exception) {
            Log.e("MyMDM", "sync failed: ${e.message}")
            current?.let { PolicyManager(appContext).apply(it) }
            Result(attempted = true, changed = false, policy = current, error = e.message)
        }
    }

    companion object {
        private const val DEFAULT_SYNC_INTERVAL_MINUTES = 5L
        private const val MAX_SYNC_INTERVAL_MINUTES = 1440L
        private val lock = Any()
        private val syncExecutionLock = Any()
        private var started = false
        private val executor = Executors.newSingleThreadExecutor()
        private var schedulerContext: Context? = null

        private fun scheduleLocked(delayMinutes: Long) {
            val appContext = schedulerContext ?: return
            val alarmManager = appContext.getSystemService(AlarmManager::class.java)
            val operation = PendingIntent.getForegroundService(
                appContext,
                SYNC_ALARM_REQUEST_CODE,
                Intent(appContext, DeviceSyncService::class.java).setAction(ACTION_SCHEDULED_SYNC),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            alarmManager.cancel(operation)
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + TimeUnit.MINUTES.toMillis(delayMinutes.coerceAtLeast(1)),
                operation,
            )
        }

        private fun reschedule(policy: Policy?) = synchronized(lock) {
            started = true
            schedulerContext = schedulerContext ?: return@synchronized
            val delay = policy?.syncIntervalMinutes?.toLong()
                ?.coerceIn(1, MAX_SYNC_INTERVAL_MINUTES)
                ?: DEFAULT_SYNC_INTERVAL_MINUTES
            scheduleLocked(delay)
            Log.i("MyMDM", "next sync scheduled in $delay minute(s)")
        }

        internal const val ACTION_SCHEDULED_SYNC = "org.mymdm.agent.action.SCHEDULED_SYNC"
        private const val SYNC_ALARM_REQUEST_CODE = 4101
        private const val WAKE_LOCK_TIMEOUT_MS = 3 * 60 * 1000L
    }
}
