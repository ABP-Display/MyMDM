package org.mymdm.agent.sync

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.mymdm.agent.R
import org.mymdm.agent.storage.SecureStorage

class DeviceSyncService : Service() {
    override fun onCreate() {
        super.onCreate()
        instance = this
        locationSessionCount = 0
        createNotificationChannel()
        updateForeground(locationActive = false)
    }

    override fun onDestroy() {
        DeviceLocationTracker.stopContinuousTracking()
        if (instance === this) instance = null
        super.onDestroy()
    }

    private fun updateForeground(locationActive: Boolean) {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_mymdm_logo)
            .setContentTitle(getString(R.string.sync_notification_title))
            .setContentText(getString(if (locationActive) R.string.location_notification_text else R.string.sync_notification_text))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setSilent(true)
            .build()
        var serviceType = 0
        if (locationActive && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            serviceType = serviceType or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            serviceType = serviceType or ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, serviceType)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!SecureStorage(this).hasEnrollment()) {
            stopSelf()
            return START_NOT_STICKY
        }
        runCatching { DeviceLocationTracker.startContinuousTracking(applicationContext) }
        val syncManager = DeviceSyncManager(applicationContext)
        if (intent?.action == DeviceSyncManager.ACTION_SCHEDULED_SYNC) syncManager.runScheduled() else syncManager.start()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(
            CHANNEL_ID,
            getString(R.string.sync_notification_channel),
            NotificationManager.IMPORTANCE_LOW,
        ))
    }

    companion object {
        private const val CHANNEL_ID = "mymdm_management"
        private const val NOTIFICATION_ID = 1001
        @Volatile private var instance: DeviceSyncService? = null
        private var locationSessionCount = 0

        @Synchronized
        fun beginLocationSession(): Boolean {
            val service = instance ?: return false
            return runCatching {
                locationSessionCount++
                service.updateForeground(locationActive = true)
                true
            }.getOrElse {
                locationSessionCount = (locationSessionCount - 1).coerceAtLeast(0)
                false
            }
        }

        @Synchronized
        fun endLocationSession() {
            locationSessionCount = (locationSessionCount - 1).coerceAtLeast(0)
            if (locationSessionCount == 0) {
                instance?.let { service -> runCatching { service.updateForeground(locationActive = false) } }
            }
        }

        fun start(context: Context) {
            if (!SecureStorage(context).hasEnrollment()) {
                return
            }
            ContextCompat.startForegroundService(context, Intent(context, DeviceSyncService::class.java))
        }
    }
}
