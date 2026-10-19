package org.mymdm.agent.maintenance

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PinVerifierTest {
    // Generated with PHP hash_pbkdf2, matching the server's encoding.
    private val encoded = "pbkdf2-sha256:600000:MDEyMzQ1Njc4OWFiY2RlZg==:/V4olk4XJPnStEnsMtkTKlqWuFbI9fA58YIKQGlFNKk="

    @Test fun verifiesServerPin() {
        assertTrue(PinVerifier.verify("123456", encoded))
        assertFalse(PinVerifier.verify("654321", encoded))
    }

    @Test fun rejectsMalformedOrUnsupportedHashes() {
        assertFalse(PinVerifier.verify("123456", "pbkdf2-sha256:600000:invalid:invalid"))
        assertFalse(PinVerifier.verify("123456", encoded.replace(":600000:", ":999999999:")))
        assertFalse(PinVerifier.verify("123456", "unsupported"))
    }
}
