package org.mymdm.agent.update

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
import org.mymdm.agent.admin.PolicyManager
import org.mymdm.agent.api.MyMDMApi
import org.mymdm.agent.kiosk.KioskActivity
import org.mymdm.agent.storage.SecureStorage
import org.mymdm.agent.sync.DeviceSyncService
import kotlin.concurrent.thread

class AgentUpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        val storage = SecureStorage(context)
        val commandId = storage.pendingUpdateCommand()
        val filePath = intent.getStringExtra(AgentUpdateManager.EXTRA_FILE_PATH)
        val sha256 = intent.getStringExtra(AgentUpdateManager.EXTRA_SHA256)
        val interactive = intent.getBooleanExtra(AgentUpdateManager.EXTRA_INTERACTIVE, false)
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            val confirmation = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(Intent.EXTRA_INTENT)
            }
            if (confirmation != null) {
                try {
                    PolicyManager(context).beginAgentUpdate(confirmation.component?.packageName)
                    context.startActivity(confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (error: Exception) {
                    AgentUpdateManager(context).clearPending(deleteFile = true)
                    PolicyManager(context).restoreKioskPolicy(storage.policy())
                    report(context, storage, commandId, "failed", "Impossible d’ouvrir la confirmation Android : ${error.message}")
                }
            } else {
                AgentUpdateManager(context).clearPending(deleteFile = true)
                PolicyManager(context).restoreKioskPolicy(storage.policy())
                report(context, storage, commandId, "failed", "Android n’a pas fourni l’écran de confirmation")
            }
            return
        }

        if (status != PackageInstaller.STATUS_SUCCESS && !interactive && commandId != null && filePath != null && sha256 != null && AgentUpdateManager.isVerificationFailure(message)) {
            try {
                AgentUpdateManager(context).retryInteractively(filePath, sha256)
                Log.w("MyMDM", "silent agent update was blocked by verification; interactive confirmation requested")
            } catch (error: Exception) {
                AgentUpdateManager(context).clearPending(deleteFile = true)
                PolicyManager(context).restoreKioskPolicy(storage.policy())
                report(context, storage, commandId, "failed", error.message ?: message)
            }
            return
        }

        val success = status == PackageInstaller.STATUS_SUCCESS
        if (success) {
            Log.i("MyMDM", "agent update installed; restarting management")
        } else {
            Log.e("MyMDM", "agent update failed status=$status message=$message")
        }
        val policyManager = PolicyManager(context)
        AgentUpdateManager(context).clearPending(deleteFile = true)
        policyManager.resumeKiosk()
        policyManager.restoreKioskPolicy(storage.policy())
        DeviceSyncService.start(context)
        context.startActivity(Intent(context, KioskActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
        report(context, storage, commandId, if (success) "applied" else "failed", message)
    }

    private fun report(context: Context, storage: SecureStorage, commandId: String?, status: String, message: String?) {
        if (commandId == null) return
        val pendingResult = goAsync()
        thread {
            try {
                val api = MyMDMApi(storage.serverUrl() ?: return@thread, storage.credential())
                api.commandStatus(commandId, status, message)
                storage.savePendingUpdateCommand(null)
            } catch (e: Exception) {
                Log.e("MyMDM", "unable to report agent update: ${e.message}")
            } finally {
                pendingResult.finish()
            }
        }
    }
}
