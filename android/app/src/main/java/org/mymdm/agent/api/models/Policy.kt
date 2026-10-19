package org.mymdm.agent.api.models

import org.json.JSONArray
import org.json.JSONObject

data class LibraryItem(
    val id: String,
    val type: String,
    val name: String,
    val packageName: String?,
    val versionName: String?,
    val versionCode: Long?,
    val fileName: String,
    val mimeType: String,
    val sha256: String,
    val sizeBytes: Long
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("type", type)
        .put("name", name)
        .put("package_name", packageName)
        .put("version_name", versionName)
        .put("version_code", versionCode)
        .put("file_name", fileName)
        .put("mime_type", mimeType)
        .put("sha256", sha256)
        .put("size_bytes", sizeBytes)

    companion object {
        fun fromJson(json: JSONObject): LibraryItem = LibraryItem(
            id = json.getString("id"),
            type = json.getString("type"),
            name = json.getString("name"),
            packageName = json.optString("package_name").takeIf { it.isNotBlank() && it != "null" },
            versionName = json.optString("version_name").takeIf { it.isNotBlank() && it != "null" },
            versionCode = if (json.has("version_code") && !json.isNull("version_code")) json.getLong("version_code") else null,
            fileName = json.optString("file_name", "contenu"),
            mimeType = json.optString("mime_type", "application/octet-stream"),
            sha256 = json.getString("sha256"),
            sizeBytes = json.optLong("size_bytes", 0L)
        )
    }
}

data class Policy(
    val revision: Int,
    val kioskEnabled: Boolean,
    val kioskType: String,
    val url: String,
    val allowedOrigins: List<String>,
    val orientation: String,
    val keepScreenOn: Boolean,
    val adminPinEnabled: Boolean,
    val adminPinHash: String?,
    val allowedApps: List<String> = emptyList(),
    val libraryItems: List<LibraryItem> = emptyList(),
    val syncIntervalMinutes: Int = 5,
    val launcherBackgroundColor: String = "#7E7F7B",
    val launcherBackground: LibraryItem? = null,
    val launcherAutoGrantPermissions: Boolean = true,
    val defaultVolume: Int? = null,
    val defaultBrightness: Int? = null,
    val organizationName: String = ""
) {
    val isAppMode: Boolean get() = kioskType == "app" || kioskType == "launcher"
    val hasTarget: Boolean get() = when (kioskType) {
        "app" -> allowedApps.size == 1
        "launcher" -> libraryItems.isNotEmpty() || allowedApps.isNotEmpty()
        "web", "web_single", "web_open" -> url.isNotBlank()
        else -> false
    }

    fun toJson(): JSONObject = JSONObject()
        .put("organization_name", organizationName)
        .put("revision", revision)
        .put("kiosk_enabled", kioskEnabled)
        .put("kiosk_type", kioskType)
        .put("url", url)
        .put("allowed_origins", JSONArray(allowedOrigins))
        .put("allowed_apps", JSONArray(allowedApps))
        .put("library_items", JSONArray(libraryItems.map { it.toJson() }))
        .put("orientation", orientation)
        .put("keep_screen_on", keepScreenOn)
        .put("sync_interval_minutes", syncIntervalMinutes)
        .put("launcher_background_color", launcherBackgroundColor)
        .put("launcher_background", launcherBackground?.toJson())
        .put("launcher_auto_grant_permissions", launcherAutoGrantPermissions)
        .put("default_volume", defaultVolume)
        .put("default_brightness", defaultBrightness)
        .put("admin_pin_enabled", adminPinEnabled)
        .put("admin_pin_hash", adminPinHash)

    companion object {
        fun fromJson(json: JSONObject): Policy {
            val origins = json.optJSONArray("allowed_origins") ?: JSONArray()
            val apps = json.optJSONArray("allowed_apps") ?: JSONArray()
            val library = json.optJSONArray("library_items") ?: JSONArray()
            return Policy(
                revision = json.getInt("revision"),
                kioskEnabled = json.optBoolean("kiosk_enabled", false),
                kioskType = json.optString("kiosk_type", "web"),
                url = json.optString("url", ""),
                allowedOrigins = (0 until origins.length()).map { origins.getString(it) },
                orientation = json.optString("orientation", "auto"),
                keepScreenOn = json.optBoolean("keep_screen_on", true),
                adminPinEnabled = json.optBoolean("admin_pin_enabled", false),
                adminPinHash = if (json.has("admin_pin_hash") && !json.isNull("admin_pin_hash")) json.getString("admin_pin_hash") else null,
                allowedApps = (0 until apps.length()).map { apps.getString(it) }.distinct(),
                libraryItems = (0 until library.length()).map { LibraryItem.fromJson(library.getJSONObject(it)) }.distinctBy { it.sha256 },
                syncIntervalMinutes = normalizeSyncInterval(json.optInt("sync_interval_minutes", 5)),
                launcherBackgroundColor = normalizedBackgroundColor(json.optString("launcher_background_color", "#7E7F7B")),
                launcherBackground = json.optJSONObject("launcher_background")?.let(LibraryItem::fromJson),
                launcherAutoGrantPermissions = json.optBoolean("launcher_auto_grant_permissions", true),
                defaultVolume = json.optNullablePercentage("default_volume"),
                defaultBrightness = json.optNullablePercentage("default_brightness"),
                organizationName = json.optString("organization_name", "").takeUnless { it == "null" }?.trim().orEmpty()
            )
        }

        private fun JSONObject.optNullablePercentage(key: String): Int? =
            if (has(key) && !isNull(key)) getInt(key).coerceIn(0, 100) else null

        fun normalizeSyncInterval(value: Int): Int = value.coerceIn(1, 1440)

        fun normalizedBackgroundColor(value: String): String = if (Regex("^#[0-9A-Fa-f]{6}$").matches(value)) {
            value.uppercase()
        } else {
            "#7E7F7B"
        }
    }
}
