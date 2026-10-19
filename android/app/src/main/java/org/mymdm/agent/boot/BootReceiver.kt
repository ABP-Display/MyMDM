package org.mymdm.agent.boot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.mymdm.agent.admin.PolicyManager
import org.mymdm.agent.kiosk.KioskActivity
import org.mymdm.agent.storage.SecureStorage
import org.mymdm.agent.sync.DeviceSyncService

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            val manager = PolicyManager(context)
            manager.resumeKiosk()
            val policy = SecureStorage(context).policy()
            if (policy != null) {
                manager.apply(policy, launchKiosk = false)
            }
            if (SecureStorage(context).hasEnrollment()) context.startActivity(Intent(context, KioskActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            DeviceSyncService.start(context)
        }
    }
}
