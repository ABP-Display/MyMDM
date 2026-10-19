package org.mymdm.agent.storage

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.mymdm.agent.api.models.Policy
import org.json.JSONObject

class SecureStorage(context: Context) {
    private val prefs = EncryptedSharedPreferences.create(
        context,
        "mymdm_secure",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun saveEnrollment(serverUrl: String, deviceId: String, credential: String, policy: Policy) {
        check(prefs.edit()
            .putString("server_url", serverUrl)
            .putString("device_id", deviceId)
            .putString("credential", credential)
            .putString("policy", policy.toJson().toString())
            .putLong("last_sync", System.currentTimeMillis())
            .commit()) { "Unable to persist enrollment" }
    }
    fun serverUrl(): String? = prefs.getString("server_url", null)
    fun deviceId(): String? = prefs.getString("device_id", null)
    fun credential(): String? = prefs.getString("credential", null)
    fun savePolicy(policy: Policy) = prefs.edit().putString("policy", policy.toJson().toString()).putLong("last_sync", System.currentTimeMillis()).apply()
    fun policy(): Policy? = prefs.getString("policy", null)?.let { Policy.fromJson(JSONObject(it)) }
    fun lastSync(): Long = prefs.getLong("last_sync", 0L)
    fun markSynced() = prefs.edit().putLong("last_sync", System.currentTimeMillis()).apply()
    fun hasEnrollment(): Boolean = serverUrl() != null && credential() != null
    fun savePendingUpdateCommand(id: String?) = prefs.edit().putString("pending_update_command", id).commit()
    fun pendingUpdateCommand(): String? = prefs.getString("pending_update_command", null)
}
