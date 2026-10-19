package org.mymdm.agent.update

import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import org.mymdm.agent.admin.MyMDMDeviceAdminReceiver
import org.mymdm.agent.admin.PolicyManager
import org.mymdm.agent.api.MyMDMApi
import org.mymdm.agent.storage.SecureStorage
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

class AgentUpdateManager(private val context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun checkAndInstall(api: MyMDMApi, force: Boolean = false, commandId: String? = null): Boolean {
        val update = api.agentUpdate(force, commandId)
        if (!update.optBoolean("available", false)) return false

        val url = update.optString("download_url")
        val expectedSha256 = update.optString("apk_sha256")
        if (url.isBlank() || expectedSha256.isBlank()) return false
        if (isPending(expectedSha256)) {
            if (commandId != null) check(SecureStorage(context).savePendingUpdateCommand(commandId))
            return true
        }

        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        val admin = ComponentName(context, MyMDMDeviceAdminReceiver::class.java)
        if (!dpm.isDeviceOwnerApp(admin.packageName)) {
            Log.w("MyMDM", "agent update skipped: app is not device owner")
            return false
        }

        val contents = api.download(url)
        val actualSha256 = sha256Hex(contents)
        if (!actualSha256.equals(expectedSha256, ignoreCase = true)) {
            error("APK checksum mismatch expected=$expectedSha256 actual=$actualSha256")
        }
        val apk = updateFile(expectedSha256)
        val temporary = File(apk.parentFile, "${apk.name}.tmp")
        temporary.writeBytes(contents)
        check(temporary.renameTo(apk) || runCatching {
            temporary.copyTo(apk, overwrite = true)
            temporary.delete()
            true
        }.getOrDefault(false)) { "Impossible de préparer le fichier de mise à jour" }

        if (commandId != null) check(SecureStorage(context).savePendingUpdateCommand(commandId))
        return try {
            commit(apk, expectedSha256, interactive = false)
            true
        } catch (error: Exception) {
            clearPending(deleteFile = true)
            if (commandId != null) SecureStorage(context).savePendingUpdateCommand(null)
            PolicyManager(context).restoreKioskPolicy(SecureStorage(context).policy())
            throw error
        }
    }

    internal fun retryInteractively(filePath: String, sha256: String): Boolean {
        val apk = File(filePath)
        check(apk.isFile && sha256Hex(apk).equals(sha256, ignoreCase = true)) {
            "Le fichier de mise à jour à confirmer est introuvable ou invalide"
        }
        commit(apk, sha256, interactive = true)
        return true
    }

    internal fun clearPending(deleteFile: Boolean) {
        val path = preferences.getString(PENDING_FILE, null)
        preferences.edit().clear().apply()
        if (deleteFile && path != null) File(path).delete()
    }

    private fun commit(apk: File, sha256: String, interactive: Boolean) {
        val policyManager = PolicyManager(context)
        check(policyManager.beginAgentUpdate()) { "MyMDM doit être Device Owner pour installer la mise à jour" }
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
            setInstallReason(PackageManager.INSTALL_REASON_POLICY)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                setRequireUserAction(
                    if (interactive) PackageInstaller.SessionParams.USER_ACTION_REQUIRED
                    else PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED,
                )
                setInstallScenario(PackageManager.INSTALL_SCENARIO_FAST)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                setPackageSource(PackageInstaller.PACKAGE_SOURCE_STORE)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                setRequestUpdateOwnership(true)
            }
        }
        val sessionId = installer.createSession(params)
        try {
            installer.openSession(sessionId).use { session ->
                session.openWrite("mymdm-agent.apk", 0, apk.length()).use { output ->
                    FileInputStream(apk).use { it.copyTo(output) }
                    session.fsync(output)
                }
                val intent = Intent(context, AgentUpdateReceiver::class.java)
                    .putExtra(EXTRA_SESSION_ID, sessionId)
                    .putExtra(EXTRA_FILE_PATH, apk.absolutePath)
                    .putExtra(EXTRA_SHA256, sha256)
                    .putExtra(EXTRA_INTERACTIVE, interactive)
                    .addFlags(Intent.FLAG_RECEIVER_FOREGROUND)
                val pending = PendingIntent.getBroadcast(
                    context,
                    sessionId,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                )
                check(preferences.edit()
                    .putString(PENDING_SHA256, sha256)
                    .putString(PENDING_FILE, apk.absolutePath)
                    .putLong(PENDING_STARTED_AT, System.currentTimeMillis())
                    .commit())
                session.commit(pending.intentSender)
            }
        } catch (error: Exception) {
            runCatching { installer.abandonSession(sessionId) }
            throw error
        }
        Log.i("MyMDM", "agent update session committed id=$sessionId interactive=$interactive")
    }

    private fun isPending(sha256: String): Boolean {
        val sameUpdate = preferences.getString(PENDING_SHA256, null).equals(sha256, ignoreCase = true)
        val recent = System.currentTimeMillis() - preferences.getLong(PENDING_STARTED_AT, 0) < PENDING_TIMEOUT_MS
        if (sameUpdate && recent) return true
        if (!recent) clearPending(deleteFile = true)
        return false
    }

    private fun updateFile(sha256: String): File {
        val directory = File(context.filesDir, "agent-updates").apply { check(mkdirs() || isDirectory) }
        return File(directory, "mymdm-agent-${sha256.take(16)}.apk")
    }

    private fun sha256Hex(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { "%02x".format(it) }

    private fun sha256Hex(file: File): String {
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
        internal const val EXTRA_SESSION_ID = "session_id"
        internal const val EXTRA_FILE_PATH = "file_path"
        internal const val EXTRA_SHA256 = "sha256"
        internal const val EXTRA_INTERACTIVE = "interactive"
        private const val PREFERENCES = "agent_update"
        private const val PENDING_SHA256 = "pending_sha256"
        private const val PENDING_FILE = "pending_file"
        private const val PENDING_STARTED_AT = "pending_started_at"
        private const val PENDING_TIMEOUT_MS = 60 * 60 * 1000L

        internal fun isVerificationFailure(message: String?): Boolean = message.orEmpty()
            .contains("VERIFICATION_FAILURE", ignoreCase = true)
    }
}
