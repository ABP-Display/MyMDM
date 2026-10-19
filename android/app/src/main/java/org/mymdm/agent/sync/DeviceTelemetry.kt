package org.mymdm.agent.sync

import android.content.Context
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.os.SystemClock
import android.provider.Settings
import android.net.wifi.WifiManager
import org.json.JSONObject
import kotlin.math.roundToInt

object DeviceTelemetry {
    data class Snapshot(
        val batteryLevel: Int?,
        val batteryCharging: Boolean?,
        val volumeLevel: Int,
        val brightnessLevel: Int,
        val metrics: JSONObject,
    )

    fun collect(context: Context): Snapshot {
        val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val batteryLevel = if (level >= 0 && scale > 0) ((level * 100f) / scale).roundToInt().coerceIn(0, 100) else null
        val batteryStatus = battery?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val charging = if (batteryStatus >= 0) {
            batteryStatus == BatteryManager.BATTERY_STATUS_CHARGING || batteryStatus == BatteryManager.BATTERY_STATUS_FULL
        } else null
        val audio = context.getSystemService(AudioManager::class.java)
        val maxVolume = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        val volume = (audio.getStreamVolume(AudioManager.STREAM_MUSIC) * 100f / maxVolume).roundToInt().coerceIn(0, 100)
        val brightness = Settings.System.getInt(context.contentResolver, Settings.System.SCREEN_BRIGHTNESS, 128)

        val memory = ActivityManager.MemoryInfo().also { context.getSystemService(ActivityManager::class.java).getMemoryInfo(it) }
        val storage = StatFs(Environment.getDataDirectory().path)
        val display = context.resources.displayMetrics
        val wifi = runCatching { context.applicationContext.getSystemService(WifiManager::class.java).connectionInfo }.getOrNull()
        val serial = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) runCatching { Build.getSerial() }.getOrNull() else null
        val metrics = JSONObject()
            .put("serial", serial ?: JSONObject.NULL)
            .put("storage_total_bytes", storage.totalBytes)
            .put("storage_free_bytes", storage.availableBytes)
            .put("memory_total_bytes", memory.totalMem)
            .put("memory_free_bytes", memory.availMem)
            .put("uptime_seconds", SystemClock.elapsedRealtime() / 1000)
            .put("screen_width", display.widthPixels)
            .put("screen_height", display.heightPixels)
            .put("screen_density_dpi", display.densityDpi)
            .put("installed_app_count", runCatching { context.packageManager.getInstalledApplications(0).size }.getOrDefault(0))
            .put("wifi_ssid", wifi?.ssid?.takeUnless { it == WifiManager.UNKNOWN_SSID } ?: JSONObject.NULL)
            .put("wifi_rssi", wifi?.rssi ?: JSONObject.NULL)
            .put("wifi_link_mbps", wifi?.linkSpeed ?: JSONObject.NULL)
            .put("device_owner", context.getSystemService(DevicePolicyManager::class.java).isDeviceOwnerApp(context.packageName))
        DeviceLocationTracker.metrics(context).forEach { (key, value) -> metrics.put(key, value ?: JSONObject.NULL) }

        return Snapshot(batteryLevel, charging, volume, (brightness * 100f / 255).roundToInt().coerceIn(0, 100), metrics)
    }
}
