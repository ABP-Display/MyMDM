package org.mymdm.agent.admin

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.TextView
import org.mymdm.agent.kiosk.KioskActivity
import kotlin.concurrent.thread

class ProvisioningActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val status = TextView(this).apply { text = "MyMDM provisioning..." }
        status.text = "MyMDM provisioning...\n\n" + ProvisioningDebug.describeIntent("PROVISIONING_SUCCESSFUL", intent)
        setContentView(status)
        ProvisioningExtrasStore.fromIntent(intent)?.let { ProvisioningExtrasStore.save(this, it) }
        thread {
            try {
                ProvisioningRunner.runIfNeeded(this)
                runOnUiThread {
                    if (!isFinishing && !isDestroyed) {
                        startActivity(Intent(this, KioskActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
                        finish()
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    status.text = "Provisioning failed: ${e.message}\n\n" +
                        ProvisioningDebug.describeIntent("PROVISIONING_SUCCESSFUL", intent) +
                        "\n\nstored_extras=${ProvisioningExtrasStore.load(this) != null}"
                }
            }
        }
    }
}
