package org.mymdm.agent.sync

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.media.AudioManager
import android.provider.Settings
import org.mymdm.agent.admin.MyMDMDeviceAdminReceiver
import org.mymdm.agent.api.MyMDMApi
import org.mymdm.agent.update.AgentUpdateManager
import org.mymdm.agent.kiosk.KioskScreenSnapshot
import org.json.JSONObject

class DeviceCommandExecutor(private val context: Context) {
    fun execute(command: JSONObject, api: MyMDMApi) {
        val id = command.getString("id")
        try {
            when (command.getString("type")) {
                "agent_update" -> {
                    api.commandStatus(id, "dispatched")
                    check(AgentUpdateManager(context).checkAndInstall(api, force = true, commandId = id)) { "Aucune mise à jour disponible" }
                }
                "set_volume" -> {
                    val audio = context.getSystemService(AudioManager::class.java)
                    check(!audio.isVolumeFixed) { "Le volume est fixe sur cet appareil" }
                    val percent = command.getJSONObject("payload").getInt("value").coerceIn(0, 100)
                    val target = DeviceControlValues.volumeIndex(percent, audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC))
                    audio.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
                    api.commandStatus(id, "applied")
                }
                "set_brightness" -> {
                    val dpm = context.getSystemService(DevicePolicyManager::class.java)
                    val admin = ComponentName(context, MyMDMDeviceAdminReceiver::class.java)
                    check(dpm.isDeviceOwnerApp(context.packageName)) { "MyMDM n'est pas Device Owner" }
                    val percent = command.getJSONObject("payload").getInt("value").coerceIn(0, 100)
                    val target = DeviceControlValues.brightness(percent)
                    dpm.setSystemSetting(admin, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL.toString())
                    dpm.setSystemSetting(admin, Settings.System.SCREEN_BRIGHTNESS, target.toString())
                    api.commandStatus(id, "applied")
                }
                "capture_screen" -> {
                    api.commandStatus(id, "dispatched")
                    check(KioskScreenSnapshot.captureCurrent()) { "MyMDM doit être visible pour capturer le kiosque" }
                    KioskScreenSnapshot.uploadPending(context, api)
                    api.commandStatus(id, "applied")
                }
                "request_location" -> {
                    api.commandStatus(id, "dispatched")
                    val location = DeviceLocationTracker.requestNow(context)
                    api.updateLocation(location)
                    api.commandStatus(id, "applied", metrics = location)
                }
                else -> error("Commande inconnue")
            }
        } catch (e: Exception) {
            val metrics = if (command.optString("type") == "request_location") DeviceLocationTracker.currentMetrics(context) else null
            runCatching { api.commandStatus(id, "failed", (e.message ?: e.javaClass.simpleName).take(2000), metrics) }
        }
    }
}
