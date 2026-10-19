package org.mymdm.agent.kiosk

import java.net.URI

object OriginMatcher {
    fun isAllowed(rawUrl: String, allowedOrigins: List<String>): Boolean {
        val target = URI(rawUrl)
        return allowedOrigins.any { origin ->
            val allowed = URI(origin)
            target.scheme == allowed.scheme &&
                target.host.equals(allowed.host, ignoreCase = true) &&
                effectivePort(target) == effectivePort(allowed)
        }
    }

    private fun effectivePort(uri: URI): Int {
        if (uri.port != -1) return uri.port
        return when (uri.scheme) {
            "https" -> 443
            "http" -> 80
            else -> -1
        }
    }
}
