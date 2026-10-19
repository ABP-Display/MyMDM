package org.mymdm.agent.admin

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.PersistableBundle

data class ProvisioningExtras(val serverUrl: String, val enrollmentToken: String)

object ProvisioningExtrasStore {
    private const val PREFS = "mymdm_provisioning"
    private const val SERVER_URL = "server_url"
    private const val ENROLLMENT_TOKEN = "enrollment_token"

    fun fromIntent(intent: Intent): ProvisioningExtras? {
        val persistable = persistableFromIntent(intent)
        if (persistable != null) fromPersistableBundle(persistable)?.let { return it }

        val bundles = listOfNotNull(
            intent.getBundleExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE),
            intent.extras
        )
        for (bundle in bundles) {
            val direct = fromBundle(bundle)
            if (direct != null) return direct
            val directPersistable = bundle.getParcelable(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE) as? PersistableBundle
            if (directPersistable != null) fromPersistableBundle(directPersistable)?.let { return it }
            val nested = bundle.getBundle(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
            if (nested != null) fromBundle(nested)?.let { return it }
        }
        return null
    }

    @Suppress("DEPRECATION")
    fun persistableFromIntent(intent: Intent): PersistableBundle? =
        intent.getParcelableExtra<android.os.Parcelable>(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE) as? PersistableBundle

    fun save(context: Context, extras: ProvisioningExtras) {
        context.deviceProtected().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(SERVER_URL, extras.serverUrl)
            .putString(ENROLLMENT_TOKEN, extras.enrollmentToken)
            .apply()
    }

    fun load(context: Context): ProvisioningExtras? {
        val prefs = context.deviceProtected().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val serverUrl = prefs.getString(SERVER_URL, null)
        val token = prefs.getString(ENROLLMENT_TOKEN, null)
        return if (!serverUrl.isNullOrBlank() && !token.isNullOrBlank()) ProvisioningExtras(serverUrl, token) else null
    }

    fun clear(context: Context) {
        context.deviceProtected().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }

    private fun fromBundle(bundle: Bundle): ProvisioningExtras? {
        val serverUrl = bundle.getString(SERVER_URL)
        val token = bundle.getString(ENROLLMENT_TOKEN)
        return if (!serverUrl.isNullOrBlank() && !token.isNullOrBlank()) ProvisioningExtras(serverUrl, token) else null
    }

    private fun fromPersistableBundle(bundle: PersistableBundle): ProvisioningExtras? {
        val serverUrl = bundle.getString(SERVER_URL)
        val token = bundle.getString(ENROLLMENT_TOKEN)
        return if (!serverUrl.isNullOrBlank() && !token.isNullOrBlank()) ProvisioningExtras(serverUrl, token) else null
    }

    private fun Context.deviceProtected(): Context = createDeviceProtectedStorageContext()
}
