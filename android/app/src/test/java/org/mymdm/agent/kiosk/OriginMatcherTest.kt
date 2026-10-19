package org.mymdm.agent.kiosk

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OriginMatcherTest {
    @Test fun exactOriginAllowed() {
        assertTrue(OriginMatcher.isAllowed("https://app.example.org/page", listOf("https://app.example.org")))
    }

    @Test fun attackerSuffixRejected() {
        assertFalse(OriginMatcher.isAllowed("https://app.example.org.attacker.com", listOf("https://app.example.org")))
    }

    @Test fun portCompared() {
        assertFalse(OriginMatcher.isAllowed("https://app.example.org:8443", listOf("https://app.example.org")))
        assertTrue(OriginMatcher.isAllowed("https://app.example.org:8443/x", listOf("https://app.example.org:8443")))
    }
}

