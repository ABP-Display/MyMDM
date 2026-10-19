package org.mymdm.agent.kiosk

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WebNavigationPolicyTest {
    private val initial = "https://example.org/page?id=1"

    @Test fun singlePageRejectsDifferentPathQueryHostAndScheme() {
        assertTrue(WebNavigationPolicy.allows(initial, initial, "web_single", emptyList()))
        assertTrue(WebNavigationPolicy.allows("$initial#section", initial, "web_single", emptyList()))
        listOf("https://example.org/other?id=1", "https://example.org/page?id=2", "https://other.org/page?id=1", "http://example.org/page?id=1").forEach {
            assertFalse(WebNavigationPolicy.allows(it, initial, "web_single", emptyList()))
        }
    }

    @Test fun openWebAllowsOtherSitesButNeverExternalAppSchemes() {
        assertTrue(WebNavigationPolicy.allows("https://other.org/path", initial, "web_open", emptyList()))
        assertTrue(WebNavigationPolicy.allows("http://192.168.10.121:8081/", initial, "web_open", emptyList()))
        listOf("intent://other", "javascript:alert(1)", "file:///local", "https://user:password@example.org", "malformed url").forEach {
            assertFalse(WebNavigationPolicy.allows(it, initial, "web_open", emptyList()))
        }
    }

    @Test fun allowedOriginsRestrictNavigationAndKeepLegacyDefault() {
        assertFalse(WebNavigationPolicy.allows("https://other.org", initial, "web", emptyList()))
        assertTrue(WebNavigationPolicy.allows("https://example.org/other", initial, "web", emptyList()))
        assertTrue(WebNavigationPolicy.allows("https://allowed.org/path", initial, "web_open", listOf("https://allowed.org")))
        assertFalse(WebNavigationPolicy.allows("https://allowed.org.evil.test", initial, "web_open", listOf("https://allowed.org")))
    }
}
