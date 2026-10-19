package org.mymdm.agent.admin

import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Bundle
import android.os.PersistableBundle

object ProvisioningDebug {
    fun describeIntent(label: String, intent: Intent): String {
        val lines = mutableListOf<String>()
        lines += "[$label]"
        lines += "action=${intent.action ?: ""}"
        lines += "extras=${intent.extras?.keySet()?.sorted()?.joinToString() ?: "<none>"}"

        val persistable = intent.getParcelableExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE) as? PersistableBundle
        if (persistable != null) {
            lines += "admin_extras_persistable=${describePersistable(persistable)}"
        }

        val bundle = intent.getBundleExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
        if (bundle != null) {
            lines += "admin_extras_bundle=${describeBundle(bundle)}"
        }

        intent.extras?.let { extras ->
            val nestedPersistable = extras.getParcelable(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE) as? PersistableBundle
            if (nestedPersistable != null) {
                lines += "nested_admin_extras_persistable=${describePersistable(nestedPersistable)}"
            }
            val nestedBundle = extras.getBundle(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
            if (nestedBundle != null) {
                lines += "nested_admin_extras_bundle=${describeBundle(nestedBundle)}"
            }
        }

        return lines.joinToString("\n")
    }

    private fun describeBundle(bundle: Bundle): String =
        bundle.keySet().sorted().joinToString(prefix = "{", postfix = "}") { key ->
            "$key=${safeValue(key, bundle.get(key))}"
        }

    private fun describePersistable(bundle: PersistableBundle): String =
        bundle.keySet().sorted().joinToString(prefix = "{", postfix = "}") { key ->
            "$key=${safeValue(key, bundle.get(key))}"
        }

    private fun safeValue(key: String, value: Any?): String {
        if (value == null) return "<null>"
        if (key.contains("token", ignoreCase = true) || key.contains("password", ignoreCase = true)) {
            return "<redacted:${value.toString().length}>"
        }
        return value.toString()
    }
}

