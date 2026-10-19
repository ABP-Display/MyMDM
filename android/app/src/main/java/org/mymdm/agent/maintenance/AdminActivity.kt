package org.mymdm.agent.maintenance

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.mymdm.agent.BuildConfig
import org.mymdm.agent.admin.PolicyManager
import org.mymdm.agent.kiosk.KioskActivity
import org.mymdm.agent.kiosk.ManagedScreenCaptureService
import org.mymdm.agent.storage.SecureStorage
import org.mymdm.agent.sync.DeviceSyncManager
import kotlin.concurrent.thread

class AdminActivity : Activity() {
    private lateinit var storage: SecureStorage
    private lateinit var policyManager: PolicyManager
    private var maintenanceUnlocked = false
    private var activeSettingsRequest = REQUEST_NONE

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        storage = SecureStorage(this)
        policyManager = PolicyManager(this)
        renderPin()
    }

    override fun onResume() {
        super.onResume()
        if (maintenanceUnlocked && activeSettingsRequest != REQUEST_NONE) {
            val completedRequest = activeSettingsRequest
            activeSettingsRequest = REQUEST_NONE
            policyManager.restoreKioskPolicy(storage.policy())
            policyManager.enterLockTask(this)
            renderMaintenance()
            when (completedRequest) {
                REQUEST_ACCESSIBILITY -> if (!ManagedScreenCaptureService.isEnabled(this)) showRestrictedSettingsGuide()
                REQUEST_APP_DETAILS -> if (!ManagedScreenCaptureService.isEnabled(this)) showAccessibilityRetry()
            }
        }
    }

    private fun renderPin() {
        val pin = EditText(this).apply {
            hint = "Code de maintenance"
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        }
        val error = TextView(this)
        val submit = Button(this).apply {
            text = "Ouvrir la maintenance"
            setOnClickListener {
                val stored = storage.policy()?.adminPinHash
                val enteredPin = pin.text.toString()
                isEnabled = false
                thread {
                    val valid = stored.isNullOrBlank() || PinVerifier.verify(enteredPin, stored)
                    runOnUiThread {
                        if (!isFinishing && !isDestroyed) {
                            isEnabled = true
                            if (valid) {
                                maintenanceUnlocked = true
                                renderMaintenance()
                            } else {
                                error.text = "Code incorrect"
                            }
                        }
                    }
                }
            }
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(32), dp(32), dp(32), dp(32))
            addView(pin)
            addView(submit)
            addView(error)
        })
    }

    private fun renderMaintenance() {
        val policy = storage.policy()
        val runtimePermissions = managedRuntimePermissions()
        val allRuntimePermissionsGranted = runtimePermissions.all { isPermissionGranted(it.second) }
        val installSourceAllowed = packageManager.canRequestPackageInstalls()
        val backgroundCaptureAllowed = ManagedScreenCaptureService.isEnabled(this)

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(24), dp(24), dp(32))
            addSectionTitle("Informations et maintenance")
            addView(TextView(context).apply {
                text = """
                    Identifiant : ${storage.deviceId() ?: ""}
                    Serveur : ${storage.serverUrl() ?: ""}
                    Android : ${Build.VERSION.RELEASE} / SDK ${Build.VERSION.SDK_INT}
                    Agent : ${BuildConfig.VERSION_NAME} / build ${BuildConfig.VERSION_CODE}
                    Organisation : ${storage.policy()?.organizationName?.takeIf { it.isNotBlank() } ?: "Organisation non configurée"}
                    Device Owner : ${if (policyManager.isDeviceOwner()) "Oui" else "Non"}
                    Kiosque actif : ${if (policy?.kioskEnabled == true) "Oui" else "Non"}
                    Révision de la configuration : ${policy?.revision ?: 0}
                    Dernière synchronisation : ${storage.lastSync()}
                """.trimIndent()
                setLineSpacing(0f, 1.25f)
            })

            addSectionTitle("Autorisations de MyMDM")
            addPermissionStatus(
                "Administration de l’appareil",
                "Nécessaire à la gestion silencieuse de l’appareil.",
                policyManager.isDeviceOwner(),
            )
            runtimePermissions.forEach { (label, permission) ->
                addPermissionStatus(label, "Autorisation Android gérée par MyMDM.", isPermissionGranted(permission))
            }
            if (!allRuntimePermissionsGranted) {
                addButton("Réactiver les autorisations Android") {
                    policyManager.prepareAgentPermissions()
                    Toast.makeText(this@AdminActivity, "Autorisations Android vérifiées.", Toast.LENGTH_SHORT).show()
                    renderMaintenance()
                }
            }

            addPermissionStatus(
                "Installation d’applications gérées",
                "Autorise MyMDM à installer les APK de la bibliothèque et les mises à jour.",
                installSourceAllowed,
            )
            if (!installSourceAllowed) {
                addButton("Autoriser l’installation d’APK") { openInstallSourceSettings() }
            }

            addPermissionStatus(
                "Capture d’écran en arrière-plan",
                "Service d’accessibilité utilisé uniquement pour la capture synchronisée.",
                backgroundCaptureAllowed,
            )
            if (!backgroundCaptureAllowed) {
                addButton("1. Activer la capture en arrière-plan") { openAccessibilitySettings() }
                addView(TextView(context).apply {
                    text = "Si Android affiche « Paramètre restreint », ouvrez la fiche MyMDM, utilisez le menu ⋮ puis « Autoriser les paramètres restreints », et relancez l’activation."
                    setTextColor(Color.rgb(103, 117, 125))
                    textSize = 13f
                    setPadding(0, dp(4), 0, 0)
                })
                addButton("2. Autoriser les paramètres restreints") { openApplicationDetails() }
            }

            addSectionTitle("Actions")
            addButton("Synchroniser maintenant") {
                DeviceSyncManager(this@AdminActivity).syncOnce()
                Toast.makeText(this@AdminActivity, "Synchronisation lancée.", Toast.LENGTH_SHORT).show()
            }
            addButton("Recharger le kiosque") { startActivity(Intent(this@AdminActivity, KioskActivity::class.java)) }
            addButton("Quitter temporairement le kiosque") {
                startActivity(Intent(this@AdminActivity, KioskActivity::class.java).putExtra("request_exit", true))
                finish()
            }
            addButton("Retourner au kiosque") { startActivity(Intent(this@AdminActivity, KioskActivity::class.java)) }
        }

        setContentView(ScrollView(this).apply { addView(content) })
    }

    private fun managedRuntimePermissions(): List<Pair<String, String>> = buildList {
        add("Position approximative" to Manifest.permission.ACCESS_COARSE_LOCATION)
        add("Position précise" to Manifest.permission.ACCESS_FINE_LOCATION)
        add("État de l’appareil" to Manifest.permission.READ_PHONE_STATE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            add("Position en arrière-plan" to Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add("Appareils Wi-Fi à proximité" to Manifest.permission.NEARBY_WIFI_DEVICES)
            add("Notifications de service" to Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun isPermissionGranted(permission: String): Boolean =
        checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    private fun openInstallSourceSettings() {
        val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))
        val component = intent.resolveActivity(packageManager)
        if (component == null) {
            showUnavailable("Réglage d’installation d’applications indisponible")
            return
        }
        if (!policyManager.beginInstallSourceConfiguration(component.packageName)) {
            showUnavailable("MyMDM doit être Device Owner")
            return
        }
        openProtectedSettings(intent, REQUEST_INSTALL_SOURCE)
    }

    private fun openAccessibilitySettings() {
        if (!policyManager.permitManagedAccessibilityService()) {
            showUnavailable("MyMDM doit être autorisé par la politique d’accessibilité")
            return
        }
        openProtectedSettings(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS), REQUEST_ACCESSIBILITY)
    }

    private fun openApplicationDetails() {
        openProtectedSettings(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")),
            REQUEST_APP_DETAILS,
        )
    }

    private fun openProtectedSettings(intent: Intent, requestCode: Int) {
        val component = intent.resolveActivity(packageManager)
        if (component == null) {
            showUnavailable("Réglage Android indisponible sur cet appareil")
            return
        }
        if (!policyManager.allowTemporaryPackage(component.packageName)) {
            showUnavailable("MyMDM doit être Device Owner")
            return
        }
        policyManager.exitLockTask(this)
        activeSettingsRequest = requestCode
        try {
            startActivityForResult(intent, requestCode)
        } catch (error: Exception) {
            activeSettingsRequest = REQUEST_NONE
            policyManager.restoreKioskPolicy(storage.policy())
            policyManager.enterLockTask(this)
            showUnavailable("Ouverture du réglage impossible : ${error.message}")
        }
    }

    private fun showRestrictedSettingsGuide() {
        AlertDialog.Builder(this)
            .setTitle("Paramètre restreint par Android")
            .setMessage(
                "La tentative d’activation a préparé l’autorisation. Ouvrez maintenant la fiche MyMDM, " +
                    "touchez le menu ⋮ en haut à droite puis « Autoriser les paramètres restreints ».",
            )
            .setNegativeButton("Plus tard", null)
            .setPositiveButton("Ouvrir la fiche MyMDM") { _, _ -> openApplicationDetails() }
            .show()
    }

    private fun showAccessibilityRetry() {
        AlertDialog.Builder(this)
            .setTitle("Dernière étape")
            .setMessage("Retournez dans Accessibilité et activez « MyMDM — capture gérée ».")
            .setNegativeButton("Plus tard", null)
            .setPositiveButton("Retourner à Accessibilité") { _, _ -> openAccessibilitySettings() }
            .show()
    }

    private fun showUnavailable(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    private fun LinearLayout.addSectionTitle(label: String) {
        addView(TextView(context).apply {
            text = label
            textSize = 20f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.rgb(36, 107, 95))
            setPadding(0, dp(24), 0, dp(10))
        })
    }

    private fun LinearLayout.addPermissionStatus(label: String, description: String, granted: Boolean) {
        addView(LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            setBackgroundColor(if (granted) Color.rgb(232, 244, 241) else Color.rgb(253, 235, 222))
            addView(TextView(context).apply {
                text = "${if (granted) "✓" else "○"} $label"
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(if (granted) Color.rgb(20, 96, 82) else Color.rgb(162, 63, 50))
            })
            addView(TextView(context).apply {
                text = description
                textSize = 13f
                setPadding(0, dp(3), 0, 0)
            })
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(7)
        })
    }

    private fun LinearLayout.addButton(label: String, action: () -> Unit) {
        addView(Button(context).apply {
            text = label
            isAllCaps = false
            setOnClickListener { action() }
        })
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val REQUEST_NONE = 0
        private const val REQUEST_ACCESSIBILITY = 3001
        private const val REQUEST_APP_DETAILS = 3002
        private const val REQUEST_INSTALL_SOURCE = 3003
    }
}
