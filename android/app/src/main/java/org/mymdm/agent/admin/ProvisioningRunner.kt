package org.mymdm.agent.admin

import android.content.Context
import org.mymdm.agent.api.models.Policy
import org.mymdm.agent.enrollment.EnrollmentManager
import org.mymdm.agent.storage.SecureStorage
import org.mymdm.agent.sync.DeviceSyncService

object ProvisioningRunner {
    @Synchronized
    fun runIfNeeded(context: Context, activateKiosk: Boolean = true): Policy {
        val appContext = context.applicationContext
        val storage = SecureStorage(appContext)
        val policyManager = PolicyManager(appContext)
        if (!policyManager.isDeviceOwner()) error("MyMDM is not Device Owner")
        policyManager.prepareAgentPermissions()
        val policy = if (storage.hasEnrollment()) {
            storage.policy() ?: error("Device enrolled but local policy is missing")
        } else {
            val extras = ProvisioningExtrasStore.load(appContext) ?: error("Missing provisioning extras")
            EnrollmentManager(appContext).enroll(extras.serverUrl, extras.enrollmentToken)
        }
        policyManager.apply(policy, launchKiosk = activateKiosk)
        ProvisioningExtrasStore.clear(appContext)
        DeviceSyncService.start(appContext)
        return policy
    }
}
