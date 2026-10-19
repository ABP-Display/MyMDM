package org.mymdm.agent.api.models

import org.junit.Assert.assertTrue
import org.junit.Assert.assertEquals
import org.junit.Test

class PolicyTest {
    @Test
    fun syncIntervalIsBounded() {
        assertEquals(5, Policy.normalizeSyncInterval(5))
        assertEquals(60, Policy.normalizeSyncInterval(60))
        assertEquals(1, Policy.normalizeSyncInterval(0))
        assertEquals(1440, Policy.normalizeSyncInterval(9999))
    }

    @Test
    fun launcherBackgroundColorIsNormalized() {
        assertEquals("#12ABEF", Policy.normalizedBackgroundColor("#12abef"))
        assertEquals("#7E7F7B", Policy.normalizedBackgroundColor("blue"))
    }

    @Test
    fun launcherPolicyAcceptsAFileOnlyLibraryAsItsTarget() {
        val policy = Policy(
            revision = 3,
            kioskEnabled = true,
            kioskType = "launcher",
            url = "",
            allowedOrigins = emptyList(),
            orientation = "auto",
            keepScreenOn = true,
            adminPinEnabled = true,
            adminPinHash = "hash",
            libraryItems = listOf(
                LibraryItem("id", "file", "Guide", null, null, null, "guide.pdf", "application/pdf", "a".repeat(64), 1024)
            )
        )

        assertTrue(policy.hasTarget)
    }
}
