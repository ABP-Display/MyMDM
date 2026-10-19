package org.mymdm.agent.admin

import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ActivityInfo
import android.media.AudioManager
import android.os.Build
import android.os.UserManager
import android.provider.Settings
import android.util.Log
import android.view.WindowManager
import org.mymdm.agent.api.models.Policy
import org.mymdm.agent.kiosk.KioskActivity
import org.mymdm.agent.sync.DeviceControlValues

class PolicyManager(private val context: Context) {
    private val dpm = context.getSystemService(DevicePolicyManager::class.java)
    private val admin = ComponentName(context, MyMDMDeviceAdminReceiver::class.java)

    fun isDeviceOwner(): Boolean = dpm.isDeviceOwnerApp(context.packageName)

    fun isPaused(): Boolean = context.getSharedPreferences("kiosk_session", Context.MODE_PRIVATE).getBoolean("paused", false)
    fun isAppClosed(packageName: String): Boolean = context.getSharedPreferences("kiosk_session", Context.MODE_PRIVATE).getStringSet("closed_apps", emptySet())!!.contains(packageName)

    fun resumeKiosk() = synchronized(sessionLock) {
        check(context.getSharedPreferences("kiosk_session", Context.MODE_PRIVATE).edit().putBoolean("paused", false).commit())
    }

    fun pauseKiosk(activity: Activity) = synchronized(sessionLock) {
        check(context.getSharedPreferences("kiosk_session", Context.MODE_PRIVATE).edit().putBoolean("paused", true).commit())
        activity.stopLockTask()
        dpm.setLockTaskPackages(admin, emptyArray())
        clearRestrictions()
        dpm.clearPackagePersistentPreferredActivities(admin, context.packageName)
        reopenClosedApps(emptyList())
    }

    fun setAppClosed(packageName: String, closed: Boolean) = synchronized(sessionLock) {
        check(packageName != context.packageName)
        if (!closed && !isAppClosed(packageName)) return@synchronized
        check(dpm.setPackagesSuspended(admin, arrayOf(packageName), closed).isEmpty()) { "Cette application ne peut pas être fermée par Android" }
        val prefs = context.getSharedPreferences("kiosk_session", Context.MODE_PRIVATE)
        val packages = prefs.getStringSet("closed_apps", emptySet())!!.toMutableSet()
        if (closed) packages.add(packageName) else packages.remove(packageName)
        prefs.edit().putStringSet("closed_apps", packages).commit()
    }

    private fun reopenClosedApps(keepClosed: List<String>) {
        val packages = context.getSharedPreferences("kiosk_session", Context.MODE_PRIVATE).getStringSet("closed_apps", emptySet())!!.toSet()
        packages.filter { it !in keepClosed }.forEach { setAppClosed(it, false) }
    }

    fun apply(policy: Policy, launchKiosk: Boolean = true) = synchronized(sessionLock) {
        if (!isDeviceOwner()) {
            Log.w("MyMDM", "policy not applied because app is not Device Owner")
            return@synchronized
        }
        runCatching {
            dpm.setOrganizationName(admin, policy.organizationName.takeIf { it.isNotBlank() })
        }.onFailure { Log.w("MyMDM", "organization name could not be applied: ${it.message}") }
        if (isPaused()) return@synchronized
        prepareAgentPermissions()
        applyDefaultControls(policy)
        val activeKiosk = policy.kioskEnabled && policy.hasTarget
        val appMode = policy.isAppMode && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
        reopenClosedApps(if (activeKiosk && appMode) policy.allowedApps else emptyList())
        Log.i("MyMDM", "applying policy revision=${policy.revision} kiosk=${policy.kioskEnabled} activeKiosk=$activeKiosk urlSet=${policy.url.isNotBlank()}")
        val packages = listOf(context.packageName) + if (appMode) policy.allowedApps else emptyList()
        dpm.setLockTaskPackages(admin, if (activeKiosk) packages.distinct().toTypedArray() else emptyArray())
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            var features = DevicePolicyManager.LOCK_TASK_FEATURE_HOME or DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS
            if (appMode && policy.kioskType == "launcher") features = features or DevicePolicyManager.LOCK_TASK_FEATURE_OVERVIEW
            dpm.setLockTaskFeatures(admin, features)
        }
        dpm.setPermissionPolicy(
            admin,
            if (policy.launcherAutoGrantPermissions) {
                DevicePolicyManager.PERMISSION_POLICY_AUTO_GRANT
            } else {
                DevicePolicyManager.PERMISSION_POLICY_PROMPT
            },
        )
        if (activeKiosk) {
            addRestrictions()
            setPersistentHome()
            if (launchKiosk) {
                context.startActivity(Intent(context, KioskActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
            }
        } else {
            clearRestrictions()
            dpm.clearPackagePersistentPreferredActivities(admin, context.packageName)
        }
    }

    fun prepareAgentPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.READ_PHONE_STATE,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.NEARBY_WIFI_DEVICES)
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            permissions.add(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        }
        permissions.forEach { permission ->
            runCatching {
                dpm.setPermissionGrantState(
                    admin,
                    context.packageName,
                    permission,
                    DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED,
                )
            }.onFailure { Log.w("MyMDM", "permission grant failed for $permission: ${it.message}") }
        }
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                dpm.setLocationEnabled(admin, true)
            } else {
                @Suppress("DEPRECATION")
                dpm.setSecureSetting(admin, Settings.Secure.LOCATION_MODE, Settings.Secure.LOCATION_MODE_HIGH_ACCURACY.toString())
            }
        }.onFailure { Log.w("MyMDM", "location enable failed: ${it.message}") }
    }

    fun permitManagedAccessibilityService(): Boolean = synchronized(sessionLock) {
        if (!isDeviceOwner()) return@synchronized false
        runCatching {
            val permitted = dpm.getPermittedAccessibilityServices(admin) ?: return@runCatching true
            if (context.packageName in permitted) return@runCatching true
            dpm.setPermittedAccessibilityServices(admin, (permitted + context.packageName).distinct())
        }.onFailure {
            Log.w("MyMDM", "accessibility service allowlist failed: ${it.message}")
        }.getOrDefault(false)
    }

    fun enterLockTask(activity: Activity) {
        if (isDeviceOwner() && !isPaused() && dpm.isLockTaskPermitted(context.packageName)) {
            if (context.getSystemService(ActivityManager::class.java).lockTaskModeState == ActivityManager.LOCK_TASK_MODE_LOCKED) return
            Log.i("MyMDM", "entering lock task")
            activity.startLockTask()
        } else {
            Log.w("MyMDM", "cannot enter lock task because app is not Device Owner")
        }
    }

    fun exitLockTask(activity: Activity) {
        try { activity.stopLockTask() } catch (_: IllegalArgumentException) {}
    }

    fun beginWifiConfiguration(settingsPackage: String): Boolean = synchronized(sessionLock) {
        if (!isDeviceOwner() || isPaused()) return@synchronized false
        dpm.clearUserRestriction(admin, UserManager.DISALLOW_CONFIG_WIFI)
        val packages = dpm.getLockTaskPackages(admin).toMutableSet()
        packages.add(settingsPackage)
        dpm.setLockTaskPackages(admin, packages.toTypedArray())
        true
    }

    fun beginLocationConfiguration(settingsPackage: String): Boolean = synchronized(sessionLock) {
        if (!isDeviceOwner() || isPaused()) return@synchronized false
        val packages = dpm.getLockTaskPackages(admin).toMutableSet()
        packages.add(settingsPackage)
        dpm.setLockTaskPackages(admin, packages.toTypedArray())
        true
    }

    fun restoreKioskPolicy(policy: Policy?) {
        if (policy != null) apply(policy, launchKiosk = false)
    }

    fun beginAgentUpdate(installerPackage: String? = null): Boolean = synchronized(sessionLock) {
        if (!isDeviceOwner()) return@synchronized false
        dpm.clearUserRestriction(admin, UserManager.DISALLOW_INSTALL_APPS)
        dpm.clearUserRestriction(admin, UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES)
        dpm.clearUserRestriction(admin, UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES_GLOBALLY)
        if (!installerPackage.isNullOrBlank()) {
            val packages = dpm.getLockTaskPackages(admin).toMutableSet()
            packages.add(installerPackage)
            dpm.setLockTaskPackages(admin, packages.toTypedArray())
        }
        true
    }

    fun beginInstallSourceConfiguration(settingsPackage: String): Boolean = synchronized(sessionLock) {
        if (!isDeviceOwner() || isPaused()) return@synchronized false
        dpm.clearUserRestriction(admin, UserManager.DISALLOW_INSTALL_APPS)
        dpm.clearUserRestriction(admin, UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES)
        dpm.clearUserRestriction(admin, UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES_GLOBALLY)
        val packages = dpm.getLockTaskPackages(admin).toMutableSet()
        packages.add(settingsPackage)
        dpm.setLockTaskPackages(admin, packages.toTypedArray())
        true
    }

    fun allowTemporaryPackage(packageName: String): Boolean = synchronized(sessionLock) {
        if (!isDeviceOwner() || isPaused()) return@synchronized false
        val packages = dpm.getLockTaskPackages(admin).toMutableSet()
        packages.add(packageName)
        dpm.setLockTaskPackages(admin, packages.toTypedArray())
        true
    }

    fun reboot() {
        check(isDeviceOwner()) { "MyMDM doit être Device Owner" }
        dpm.reboot(admin)
    }

    fun applyActivityPolicy(activity: Activity, policy: Policy) {
        if (policy.keepScreenOn) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        activity.requestedOrientation = when (policy.orientation) {
            "portrait" -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            "landscape" -> ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            else -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }

    private fun applyDefaultControls(policy: Policy) {
        policy.defaultVolume?.let { percent ->
            val audio = context.getSystemService(AudioManager::class.java)
            if (!audio.isVolumeFixed) {
                audio.setStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    DeviceControlValues.volumeIndex(percent, audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)),
                    0,
                )
            }
        }
        policy.defaultBrightness?.let { percent ->
            dpm.setSystemSetting(admin, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL.toString())
            dpm.setSystemSetting(admin, Settings.System.SCREEN_BRIGHTNESS, DeviceControlValues.brightness(percent).toString())
        }
    }

    private fun setPersistentHome() {
        val filter = IntentFilter(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addCategory(Intent.CATEGORY_DEFAULT)
        }
        dpm.addPersistentPreferredActivity(admin, filter, ComponentName(context, KioskActivity::class.java))
    }

    private fun addRestrictions() {
        val restrictions = listOf(
            UserManager.DISALLOW_FACTORY_RESET,
            UserManager.DISALLOW_SAFE_BOOT,
            UserManager.DISALLOW_ADD_USER,
            UserManager.DISALLOW_INSTALL_APPS,
            UserManager.DISALLOW_UNINSTALL_APPS,
            UserManager.DISALLOW_MODIFY_ACCOUNTS,
            UserManager.DISALLOW_CONFIG_WIFI,
            UserManager.DISALLOW_CONFIG_BLUETOOTH
        )
        restrictions.forEach { dpm.addUserRestriction(admin, it) }
    }

    private fun clearRestrictions() {
        listOf(
            UserManager.DISALLOW_FACTORY_RESET,
            UserManager.DISALLOW_SAFE_BOOT,
            UserManager.DISALLOW_ADD_USER,
            UserManager.DISALLOW_INSTALL_APPS,
            UserManager.DISALLOW_UNINSTALL_APPS,
            UserManager.DISALLOW_MODIFY_ACCOUNTS,
            UserManager.DISALLOW_CONFIG_WIFI,
            UserManager.DISALLOW_CONFIG_BLUETOOTH
        ).forEach { dpm.clearUserRestriction(admin, it) }
    }

    companion object {
        private val sessionLock = Any()
    }
}
