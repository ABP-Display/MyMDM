package org.mymdm.agent.maintenance

import java.security.MessageDigest
import java.util.Base64
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

object PinVerifier {
    fun verify(pin: String, encoded: String): Boolean = runCatching {
        if (encoded.startsWith("sha256:")) {
            val digest = MessageDigest.getInstance("SHA-256").digest(pin.toByteArray())
                .joinToString("") { "%02x".format(it) }
            return@runCatching MessageDigest.isEqual(digest.toByteArray(), encoded.removePrefix("sha256:").toByteArray())
        }
        val parts = encoded.split(':')
        if (parts.size != 4 || parts[0] != "pbkdf2-sha256") return@runCatching false
        val iterations = parts[1].toIntOrNull() ?: return@runCatching false
        if (iterations !in 100000..1000000) return@runCatching false
        val salt = Base64.getDecoder().decode(parts[2])
        val expected = Base64.getDecoder().decode(parts[3])
        if (salt.size != 16 || expected.size != 32) return@runCatching false
        val key = PBEKeySpec(pin.toCharArray(), salt, iterations, 256)
        try {
            val actual = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(key).encoded
            MessageDigest.isEqual(actual, expected)
        } finally {
            key.clearPassword()
        }
    }.getOrDefault(false)
}
