package org.mymdm.agent.admin

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Bundle
import android.os.Build

class GetProvisioningModeActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val extras = ProvisioningExtrasStore.persistableFromIntent(intent)
        ProvisioningExtrasStore.fromIntent(intent)?.let { ProvisioningExtrasStore.save(this, it) }
        val result = Intent()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            result.putExtra(
                DevicePolicyManager.EXTRA_PROVISIONING_MODE,
                DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
            )
            result.putExtra(DevicePolicyManager.EXTRA_PROVISIONING_SKIP_EDUCATION_SCREENS, true)
            extras?.let {
                result.putExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE, it)
            }
        }
        setResult(RESULT_OK, result)
        finish()
    }
}
