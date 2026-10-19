package org.mymdm.agent.kiosk

import java.net.URI

object WebNavigationPolicy {
    fun allows(url: String, initialUrl: String, type: String, origins: List<String>): Boolean = runCatching {
        val target = URI(url)
        if (target.scheme !in listOf("http", "https") || target.host.isNullOrBlank() || target.userInfo != null) return@runCatching false
        if (type == "web_single") {
            val initial = URI(initialUrl)
            return@runCatching OriginMatcher.isAllowed(url, listOf(initialUrl)) &&
                target.rawPath.orEmpty().ifEmpty { "/" } == initial.rawPath.orEmpty().ifEmpty { "/" } &&
                target.rawQuery == initial.rawQuery
        }
        if (type == "web_open" && origins.isEmpty()) return@runCatching true
        if (type !in listOf("web", "web_open")) return@runCatching false
        OriginMatcher.isAllowed(url, origins.ifEmpty { listOf(initialUrl) } + initialUrl)
    }.getOrDefault(false)
}
