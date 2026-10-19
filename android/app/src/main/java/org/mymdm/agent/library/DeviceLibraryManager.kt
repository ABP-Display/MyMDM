package org.mymdm.agent.library

import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.content.pm.PermissionInfo
import android.os.Build
import android.util.Log
import org.mymdm.agent.admin.PolicyManager
import org.mymdm.agent.admin.MyMDMDeviceAdminReceiver
import org.mymdm.agent.api.MyMDMApi
import org.mymdm.agent.api.models.LibraryItem
import org.mymdm.agent.api.models.Policy
import org.mymdm.agent.kiosk.KioskActivity
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

class DeviceLibraryManager(private val context: Context) {
    private val directory = File(context.filesDir, "kiosk-library")
    private val preferences = context.getSharedPreferences("kiosk_library", Context.MODE_PRIVATE)

    fun reconcile(api: MyMDMApi, policy: Policy) {
        if (policy.kioskType != "launcher") {
            cleanup(emptySet())
            return
        }
        val managedItems = policy.libraryItems + listOfNotNull(policy.launcherBackground)
        val expectedFiles = managedItems.map { cachedFile(it).name }.toSet()
        cleanup(expectedFiles)
        var changed = false
        policy.launcherBackground?.let { background ->
            runCatching {
                if (ensureDownloaded(api, background)) changed = true
            }.onFailure { Log.e("MyMDM", "launcher background ${background.id} failed: ${it.message}") }
        }
        policy.libraryItems.forEach { item ->
            runCatching {
                when (item.type) {
                    "file" -> if (ensureDownloaded(api, item)) changed = true
                    "app", "android_app" -> {
                        if (needsInstall(item) && !isPending(item.sha256)) {
                            val apk = cachedFile(item)
                            ensureDownloaded(api, item)
                            verifyApkPackage(apk, item)
                            install(apk, item)
                            changed = true
                        } else {
                            item.packageName?.let { packageName ->
                                if (policy.launcherAutoGrantPermissions) {
                                    grantRuntimePermissions(packageName)
                                } else {
                                    releaseRuntimePermissions(packageName)
                                }
                            }
                        }
                    }
                }
            }.onFailure { Log.e("MyMDM", "library item ${item.id} failed: ${it.message}") }
        }
        if (changed) KioskActivity.refreshCurrent()
    }

    private fun ensureDownloaded(api: MyMDMApi, item: LibraryItem): Boolean {
        val target = cachedFile(item)
        if (target.isFile && sha256(target).equals(item.sha256, ignoreCase = true)) return false
        target.delete()
        val actual = api.downloadLibrary(item.sha256, target)
        if (!actual.equals(item.sha256, ignoreCase = true)) {
            target.delete()
            error("Empreinte SHA-256 incorrecte pour ${item.name}")
        }
        return true
    }

    private fun needsInstall(item: LibraryItem): Boolean {
        val packageName = item.packageName ?: return false
        val installed = runCatching { context.packageManager.getPackageInfo(packageName, 0) }.getOrNull() ?: return true
        val installedCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) installed.longVersionCode else {
            @Suppress("DEPRECATION")
            installed.versionCode.toLong()
        }
        return item.versionCode?.let { it > installedCode }
            ?: (preferences.getString("applied_${item.packageName}", null) != item.sha256)
    }

    private fun verifyApkPackage(apk: File, item: LibraryItem) {
        val archive = context.packageManager.getPackageArchiveInfo(apk.absolutePath, 0)
            ?: error("APK Android illisible")
        check(archive.packageName == item.packageName) {
            "Le paquet ${archive.packageName} ne correspond pas à ${item.packageName}"
        }
    }

    private fun install(apk: File, item: LibraryItem) {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        check(dpm.isDeviceOwnerApp(context.packageName)) { "MyMDM doit être Device Owner" }
        check(PolicyManager(context).beginAgentUpdate()) { "Installation interdite par la politique Android" }
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(item.packageName)
            setInstallReason(PackageManager.INSTALL_REASON_POLICY)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) setPackageSource(PackageInstaller.PACKAGE_SOURCE_DOWNLOADED_FILE)
        }
        val sessionId = installer.createSession(params)
        setPending(item.sha256, true)
        try {
            installer.openSession(sessionId).use { session ->
                session.openWrite(item.fileName, 0, apk.length()).use { output ->
                    FileInputStream(apk).use { it.copyTo(output) }
                    session.fsync(output)
                }
                val callback = Intent(context, LibraryInstallReceiver::class.java)
                    .putExtra("sha256", item.sha256)
                    .putExtra("package_name", item.packageName)
                    .putExtra("file_path", apk.absolutePath)
                    .addFlags(Intent.FLAG_RECEIVER_FOREGROUND)
                val pendingIntent = PendingIntent.getBroadcast(context, sessionId, callback, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
                session.commit(pendingIntent.intentSender)
            }
        } catch (error: Exception) {
            setPending(item.sha256, false)
            runCatching { installer.abandonSession(sessionId) }
            throw error
        }
    }

    private fun cleanup(keepNames: Set<String>) {
        directory.listFiles()?.filter { it.isFile && !it.name.endsWith(".part") && it.name !in keepNames && !isPending(it.name.substringBefore('.')) }?.forEach { it.delete() }
        directory.listFiles()?.filter { it.name.endsWith(".part") }?.forEach { it.delete() }
    }

    private fun isPending(sha256: String): Boolean = preferences.getStringSet("pending", emptySet())?.contains(sha256) == true

    private fun setPending(sha256: String, pending: Boolean) {
        val values = preferences.getStringSet("pending", emptySet()).orEmpty().toMutableSet()
        if (pending) values.add(sha256) else values.remove(sha256)
        check(preferences.edit().putStringSet("pending", values).commit())
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    companion object {
        fun cachedFile(context: Context, item: LibraryItem): File {
            val extension = item.fileName.substringAfterLast('.', "bin").lowercase().replace(Regex("[^a-z0-9]"), "").take(10).ifBlank { "bin" }
            return File(File(context.filesDir, "kiosk-library"), "${item.sha256}.$extension")
        }
    }

    private fun cachedFile(item: LibraryItem): File = cachedFile(context, item)

    internal fun clearPending(sha256: String) = setPending(sha256, false)

    internal fun markApplied(packageName: String, sha256: String) {
        check(preferences.edit().putString("applied_$packageName", sha256).commit())
    }

    internal fun grantRuntimePermissions(packageName: String): Int = setRuntimePermissionState(
        packageName,
        DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED,
    )

    internal fun releaseRuntimePermissions(packageName: String): Int = setRuntimePermissionState(
        packageName,
        DevicePolicyManager.PERMISSION_GRANT_STATE_DEFAULT,
    )

    private fun setRuntimePermissionState(packageName: String, grantState: Int): Int {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        if (!dpm.isDeviceOwnerApp(context.packageName)) return 0
        val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(packageName, PackageManager.GET_PERMISSIONS)
        }
        val admin = ComponentName(context, MyMDMDeviceAdminReceiver::class.java)
        return packageInfo.requestedPermissions.orEmpty().count { permission ->
            val info = runCatching { context.packageManager.getPermissionInfo(permission, 0) }.getOrNull()
            val dangerous = info != null &&
                (info.protectionLevel and PermissionInfo.PROTECTION_MASK_BASE) == PermissionInfo.PROTECTION_DANGEROUS
            dangerous && runCatching {
                dpm.setPermissionGrantState(
                    admin,
                    packageName,
                    permission,
                    grantState,
                )
            }.onFailure {
                Log.w("MyMDM", "permission policy failed for $packageName/$permission: ${it.message}")
            }.getOrDefault(false)
        }
    }
}
