package org.mymdm.agent.admin

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class MyMDMDeviceAdminReceiver : DeviceAdminReceiver() {
    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        ProvisioningExtrasStore.fromIntent(intent)?.let { ProvisioningExtrasStore.save(context, it) }
        // Android 12+ delegates completion to ADMIN_POLICY_COMPLIANCE.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            context.startActivity(Intent(context, ProvisioningActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                putExtras(intent)
            })
        }
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
    }
}
