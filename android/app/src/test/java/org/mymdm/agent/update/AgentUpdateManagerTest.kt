package org.mymdm.agent.update

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentUpdateManagerTest {
    @Test
    fun detectsPackageVerificationFailure() {
        assertTrue(AgentUpdateManager.isVerificationFailure(
            "INSTALL_FAILED_VERIFICATION_FAILURE: Install not allowed",
        ))
        assertFalse(AgentUpdateManager.isVerificationFailure("INSTALL_FAILED_UPDATE_INCOMPATIBLE"))
        assertFalse(AgentUpdateManager.isVerificationFailure(null))
    }
}
