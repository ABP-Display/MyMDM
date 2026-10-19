package org.mymdm.agent.library

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
import org.mymdm.agent.admin.PolicyManager
import org.mymdm.agent.kiosk.KioskActivity
import org.mymdm.agent.storage.SecureStorage

class LibraryInstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val sha256 = intent.getStringExtra("sha256") ?: return
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            val confirmation = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(Intent.EXTRA_INTENT)
            }
            if (confirmation != null) {
                PolicyManager(context).beginAgentUpdate(confirmation.component?.packageName)
                context.startActivity(confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return
            }
        }

        DeviceLibraryManager(context).clearPending(sha256)
        if (status == PackageInstaller.STATUS_SUCCESS) {
            intent.getStringExtra("package_name")?.let { packageName ->
                val manager = DeviceLibraryManager(context)
                manager.markApplied(packageName, sha256)
                if (SecureStorage(context).policy()?.launcherAutoGrantPermissions != false) {
                    runCatching { manager.grantRuntimePermissions(packageName) }
                        .onFailure { Log.w("MyMDM", "post-install permission grant failed: ${it.message}") }
                }
            }
            intent.getStringExtra("file_path")?.let { java.io.File(it).delete() }
            Log.i("MyMDM", "library APK installed sha256=$sha256")
        } else {
            Log.e("MyMDM", "library APK install failed: ${intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)}")
        }
        PolicyManager(context).restoreKioskPolicy(SecureStorage(context).policy())
        context.startActivity(Intent(context, KioskActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
    }
}
