package org.mymdm.agent.enrollment

import android.content.Context
import org.mymdm.agent.api.MyMDMApi
import org.mymdm.agent.api.models.Policy
import org.mymdm.agent.storage.SecureStorage

class EnrollmentManager(private val context: Context) {
    fun enroll(serverUrl: String, token: String): Policy {
        val (deviceId, credentialAndPolicy) = MyMDMApi(serverUrl).enroll(token)
        val (credential, policy) = credentialAndPolicy
        SecureStorage(context).saveEnrollment(serverUrl.trimEnd('/'), deviceId, credential, policy)
        return policy
    }
}
