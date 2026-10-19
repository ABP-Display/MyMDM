package org.mymdm.agent.admin

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.widget.TextView
import android.widget.Button
import android.widget.LinearLayout
import kotlin.concurrent.thread

class AdminPolicyComplianceActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val status = TextView(this).apply {
            text = "MyMDM enrollment...\n\n" + ProvisioningDebug.describeIntent("ADMIN_POLICY_COMPLIANCE", intent)
            gravity = Gravity.CENTER
            setPadding(24, 24, 24, 24)
        }
        val retry = Button(this).apply { text = "Réessayer"; isEnabled = false }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            addView(status)
            addView(retry)
        })

        ProvisioningExtrasStore.fromIntent(intent)?.let { ProvisioningExtrasStore.save(this, it) }
        fun enroll() {
            retry.isEnabled = false
            status.text = "Inscription de l’appareil au serveur MyMDM…"
            thread {
                try {
                    // Setup Wizard must regain control before the kiosk is launched.
                    ProvisioningRunner.runIfNeeded(applicationContext, activateKiosk = false)
                    runOnUiThread {
                        if (!isFinishing && !isDestroyed) {
                            setResult(RESULT_OK)
                            finish()
                        }
                    }
                } catch (e: Exception) {
                    runOnUiThread {
                        if (!isFinishing && !isDestroyed) {
                            status.text = "Échec de l’inscription : ${e.message}\n\n" +
                                "Vérifiez la connexion réseau et le serveur, puis réessayez."
                            retry.isEnabled = true
                        }
                    }
                }
            }
        }
        retry.setOnClickListener { enroll() }
        enroll()
    }
}
