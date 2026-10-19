package org.mymdm.agent.kiosk

import android.app.Activity
import android.app.AlertDialog
import android.app.ActivityOptions
import android.content.ComponentName
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.BatteryManager
import android.os.Bundle
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputType
import android.widget.EditText
import android.widget.FrameLayout
import android.view.Gravity
import android.view.View
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.TextView
import android.widget.Button
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ScrollView
import android.widget.Space
import android.widget.Toast
import androidx.core.content.FileProvider
import com.google.android.gms.common.api.ResolvableApiException
import org.mymdm.agent.BuildConfig
import org.mymdm.agent.R
import org.mymdm.agent.api.models.Policy
import org.mymdm.agent.api.models.LibraryItem
import org.mymdm.agent.admin.PolicyManager
import org.mymdm.agent.admin.ProvisioningExtrasStore
import org.mymdm.agent.admin.ProvisioningRunner
import org.mymdm.agent.maintenance.PinVerifier
import org.mymdm.agent.maintenance.AdminActivity
import org.mymdm.agent.library.DeviceLibraryManager
import org.mymdm.agent.storage.SecureStorage
import org.mymdm.agent.sync.DeviceSyncManager
import org.mymdm.agent.sync.DeviceSyncService
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.lang.ref.WeakReference
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

class KioskActivity : Activity() {
    private var exitDialog: AlertDialog? = null
    private var adminSetupDialog: AlertDialog? = null
    private var resumed = false
    private var exiting = false
    private var renderedPolicy: Policy? = null
    private var currentWebView: WebView? = null
    private var autoLaunchPending = true
    private lateinit var storage: SecureStorage
    private lateinit var policyManager: PolicyManager
    private lateinit var syncManager: DeviceSyncManager
    private var batteryLabel: TextView? = null
    private var clockLabel: TextView? = null
    private var syncButton: ImageButton? = null
    private var batteryReceiverRegistered = false
    private val clockHandler = Handler(Looper.getMainLooper())
    private val clockTicker = object : Runnable {
        override fun run() {
            updateClock()
            clockHandler.postDelayed(this, CLOCK_REFRESH_MS)
        }
    }
    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) = updateBatteryLabel(intent)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = KIOSK_HEADER_COLOR
        autoLaunchPending = savedInstanceState?.getBoolean("auto_launch_pending", true) ?: true
        storage = SecureStorage(this)
        policyManager = PolicyManager(this)
        policyManager.resumeKiosk()
        storage.policy()?.let { policyManager.apply(it, launchKiosk = false) }
        syncManager = DeviceSyncManager(this)
        if (!storage.hasEnrollment() && ProvisioningExtrasStore.load(this) != null) {
            renderStatus("MyMDM enrollment in progress...")
            thread {
                try {
                    ProvisioningRunner.runIfNeeded(this)
                    runOnUiThread {
                        render()
                        scheduleAdminPermissionSetup()
                    }
                } catch (e: Exception) {
                    runOnUiThread {
                        renderStatus(
                            "MyMDM enrollment failed: ${e.message}\n\n" +
                                "Device Owner: ${policyManager.isDeviceOwner()}\n" +
                                "Stored provisioning extras: ${ProvisioningExtrasStore.load(this) != null}"
                        )
                    }
                }
            }
            return
        }
        DeviceSyncService.start(this)
        render()
        scheduleAdminPermissionSetup()
    }

    override fun onStart() {
        super.onStart()
        clockHandler.removeCallbacks(clockTicker)
        clockHandler.post(clockTicker)
        if (!batteryReceiverRegistered) {
            registerReceiver(batteryReceiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            batteryReceiverRegistered = true
        }
    }

    override fun onStop() {
        clockHandler.removeCallbacks(clockTicker)
        if (batteryReceiverRegistered) {
            unregisterReceiver(batteryReceiver)
            batteryReceiverRegistered = false
        }
        super.onStop()
    }

    override fun onResume() {
        super.onResume()
        resumed = true
        currentActivity = WeakReference(this)
        KioskScreenSnapshot.attach(this)
        storage.policy()?.let { if (it.kioskEnabled && it.hasTarget) policyManager.enterLockTask(this) }
        render()
    }

    override fun onPause() {
        resumed = false
        if (currentActivity.get() === this) currentActivity.clear()
        KioskScreenSnapshot.detach(this)
        super.onPause()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val homeRequested = intent.hasCategory(Intent.CATEGORY_HOME)
        if (intent.hasCategory(Intent.CATEGORY_LAUNCHER) || homeRequested) autoLaunchPending = true
        policyManager.resumeKiosk()
        storage.policy()?.let { policyManager.apply(it, launchKiosk = false) }
        render()
        if (homeRequested) {
            val policy = storage.policy()
            if (policy != null && policy.kioskEnabled && !policy.isAppMode && policy.hasTarget) {
                currentWebView?.stopLoading()
                currentWebView?.loadUrl(policy.url)
            }
        }
        if (intent.getBooleanExtra("request_exit", false)) showExitDialog()
    }

    @Deprecated("Uses the legacy Back callback with predictive Back disabled in the manifest")
    override fun onBackPressed() {
        val webView = currentWebView ?: return
        val policy = storage.policy() ?: return
        val history = webView.copyBackForwardList()
        for (index in history.currentIndex - 1 downTo 0) {
            val url = history.getItemAtIndex(index).url
            if (WebNavigationPolicy.allows(url, policy.url, policy.kioskType, policy.allowedOrigins)) {
                webView.goBackOrForward(index - history.currentIndex)
                return
            }
        }
    }

    @Deprecated("Kept for the Android settings panel result callback")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_WIFI_SETTINGS) {
            policyManager.restoreKioskPolicy(storage.policy())
            render()
        }
        if (requestCode == REQUEST_LOCATION_SETTINGS) {
            policyManager.restoreKioskPolicy(storage.policy())
            val message = if (resultCode == RESULT_OK) {
                "Précision de localisation activée. Relancez la demande de position."
            } else {
                "La précision de localisation n’a pas été activée."
            }
            Toast.makeText(this, message, Toast.LENGTH_LONG).show()
        }
        if (requestCode == REQUEST_INSTALL_SOURCE_SETTINGS) {
            policyManager.restoreKioskPolicy(storage.policy())
            val message = if (packageManager.canRequestPackageInstalls()) {
                "Installation d’applications gérées autorisée."
            } else {
                "L’autorisation d’installation depuis MyMDM n’a pas été activée."
            }
            Toast.makeText(this, message, Toast.LENGTH_LONG).show()
            if (!ManagedScreenCaptureService.isEnabled(this)) scheduleAdminPermissionSetup()
        }
        if (requestCode == REQUEST_SCREEN_CAPTURE_SETTINGS) {
            policyManager.restoreKioskPolicy(storage.policy())
            val enabled = ManagedScreenCaptureService.isEnabled(this)
            if (enabled) {
                Toast.makeText(this, "Capture d’écran en arrière-plan activée.", Toast.LENGTH_LONG).show()
                if (!packageManager.canRequestPackageInstalls()) scheduleAdminPermissionSetup()
            } else {
                showRestrictedSettingsRecovery()
            }
        }
        if (requestCode == REQUEST_RESTRICTED_APP_DETAILS) {
            policyManager.restoreKioskPolicy(storage.policy())
            AlertDialog.Builder(this)
                .setTitle("Dernière étape")
                .setMessage("Retournez maintenant dans Accessibilité, sélectionnez « MyMDM — capture gérée » puis activez le service.")
                .setNegativeButton("Plus tard", null)
                .setPositiveButton("Retourner à Accessibilité") { _, _ -> openBackgroundScreenCaptureSettings() }
                .show()
        }
    }

    private fun showExitDialog() {
        if (exitDialog != null || exiting) return
        val stored = storage.policy()?.adminPinHash
        if (stored.isNullOrBlank()) {
            AlertDialog.Builder(this).setTitle("Code de sortie manquant")
                .setMessage("Configurez un code de maintenance depuis la fiche de cet appareil dans MyMDM.")
                .setPositiveButton("OK", null).show()
            return
        }
        val pin = EditText(this).apply {
            hint = "Code de maintenance"
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        }
        val dialog = AlertDialog.Builder(this).setTitle("Quitter le kiosque")
            .setMessage("Saisissez le code pour revenir à l’accueil de l’appareil.")
            .setView(pin).setNegativeButton("Annuler", null).setPositiveButton("Quitter", null).create()
        exitDialog = dialog
        dialog.setOnDismissListener { exitDialog = null }
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val entered = pin.text.toString()
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = false
                thread {
                    val valid = PinVerifier.verify(entered, stored)
                    runOnUiThread {
                        if (isFinishing || isDestroyed || exitDialog !== dialog) return@runOnUiThread
                        dialog.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = true
                        if (!valid || storage.policy()?.adminPinHash != stored) {
                            pin.error = "Code incorrect"
                            pin.text.clear()
                        } else {
                            try {
                                val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
                                val launcher = packageManager.queryIntentActivities(home, 0)
                                    .firstOrNull { it.activityInfo.packageName != packageName }
                                    ?: error("Aucun écran d’accueil disponible")
                                exiting = true
                                policyManager.pauseKiosk(this)
                                startActivity(home.setComponent(ComponentName(launcher.activityInfo.packageName, launcher.activityInfo.name))
                                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                                dialog.dismiss()
                                finishAndRemoveTask()
                            } catch (e: Exception) {
                                exiting = false
                                policyManager.resumeKiosk()
                                storage.policy()?.let { policyManager.apply(it, launchKiosk = false) }
                                policyManager.enterLockTask(this)
                                pin.error = "Sortie impossible : ${e.message}"
                            }
                        }
                    }
                }
            }
        }
        dialog.show()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // Keep the live page, including navigation history and form state, during rotation.
        currentWebView?.invalidate()
    }

    override fun onDestroy() {
        exitDialog?.dismiss()
        currentWebView?.destroy()
        KioskScreenSnapshot.detach(this)
        super.onDestroy()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putBoolean("auto_launch_pending", autoLaunchPending)
        super.onSaveInstanceState(outState)
    }

    private fun launchAllowedApp(packageName: String) {
        val latest = storage.policy() ?: return
        if (!latest.kioskEnabled || !latest.isAppMode || packageName !in latest.allowedApps || policyManager.isPaused()) return
        try {
            check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) { "Android 11 minimum pour le kiosque d’applications" }
            check(policyManager.isDeviceOwner()) { "MyMDM doit être Device Owner" }
            DeviceSyncService.start(this)
            policyManager.setAppClosed(packageName, false)
            val libraryManager = DeviceLibraryManager(this)
            if (latest.launcherAutoGrantPermissions) {
                libraryManager.grantRuntimePermissions(packageName)
            } else {
                libraryManager.releaseRuntimePermissions(packageName)
            }
            val launch = packageManager.getLaunchIntentForPackage(packageName) ?: error("Application non installée ou sans écran de lancement")
            val options = ActivityOptions.makeBasic().setLockTaskEnabled(true)
            startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), options.toBundle())
        } catch (e: Exception) {
            Toast.makeText(this, e.message, Toast.LENGTH_LONG).show()
        }
    }

    private fun openLibraryFile(item: LibraryItem) {
        val latest = storage.policy() ?: return
        if (!latest.kioskEnabled || latest.kioskType != "launcher" || latest.libraryItems.none { it.sha256 == item.sha256 } || policyManager.isPaused()) return
        try {
            val file = DeviceLibraryManager.cachedFile(this, item)
            check(file.isFile) { "Fichier en cours de téléchargement" }
            val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
            val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, item.mimeType)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            val component = intent.resolveActivity(packageManager) ?: error("Aucune application ne peut ouvrir ce type de fichier")
            check(policyManager.allowTemporaryPackage(component.packageName)) { "MyMDM doit être Device Owner" }
            val options = ActivityOptions.makeBasic().setLockTaskEnabled(true)
            startActivity(intent.setComponent(component), options.toBundle())
        } catch (error: Exception) {
            Toast.makeText(this, error.message, Toast.LENGTH_LONG).show()
        }
    }

    private fun renderApps(policy: Policy) {
        if (policy.kioskType == "launcher") {
            renderLauncher(policy)
            return
        }

        val list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
        }
        list.addView(TextView(this).apply {
            text = if (policy.kioskType == "app") "Application unique" else "Applications autorisées"
            textSize = 24f
        })
        list.addView(TextView(this).apply { text = if (policy.kioskType == "app") "Accueil : revenir à l’application unique. Retour : naviguer dans l’application.\nPour quitter le kiosque, utilisez le bouton ci-dessous et votre code." else "Accueil : revenir à ce menu. Retour : naviguer dans l’application. Applications récentes : passer entre les applications autorisées.\nPour quitter le kiosque, utilisez le bouton ci-dessous et votre code." })
        val libraryApps = policy.libraryItems.filter { it.type in listOf("app", "android_app") && !it.packageName.isNullOrBlank() }
        val appEntries = if (libraryApps.isNotEmpty()) {
            libraryApps.map { it.packageName!! to it.name }
        } else {
            policy.allowedApps.map { it to it }
        }
        for ((packageName, configuredName) in appEntries) {
            val info = runCatching { packageManager.getApplicationInfo(packageName, 0) }.getOrNull()
            val launchable = packageManager.getLaunchIntentForPackage(packageName) != null || (info != null && policyManager.isAppClosed(packageName))
            list.addView(Button(this).apply {
                text = configuredName.ifBlank { info?.let { packageManager.getApplicationLabel(it).toString() } ?: packageName }
                if (!launchable) text = "$text — non installée ou indisponible"
                isEnabled = launchable
                info?.let {
                    val icon = packageManager.getApplicationIcon(it)
                    val size = (40 * resources.displayMetrics.density).toInt()
                    icon.setBounds(0, 0, size, size)
                    setCompoundDrawables(icon, null, null, null)
                }
                setOnClickListener { launchAllowedApp(packageName) }
            })
            if (policy.kioskType == "launcher" && launchable) {
                list.addView(Button(this).apply {
                    text = "Fermer ${info?.let { packageManager.getApplicationLabel(it) } ?: packageName}"
                    setOnClickListener {
                        try {
                            check(storage.policy()?.allowedApps?.contains(packageName) == true && !policyManager.isPaused())
                            policyManager.setAppClosed(packageName, true)
                            Toast.makeText(this@KioskActivity, "Application fermée. Touchez son nom pour la rouvrir.", Toast.LENGTH_SHORT).show()
                        } catch (e: Exception) {
                            Toast.makeText(this@KioskActivity, e.message, Toast.LENGTH_LONG).show()
                        }
                    }
                })
            }
        }
        if (policy.kioskType == "launcher") {
            policy.libraryItems.filter { it.type == "file" }.forEach { item ->
                val downloaded = DeviceLibraryManager.cachedFile(this, item).isFile
                list.addView(Button(this).apply {
                    text = if (downloaded) item.name else "${item.name} — téléchargement en attente"
                    isEnabled = downloaded
                    setOnClickListener { openLibraryFile(item) }
                })
            }
        }
        setContentView(kioskShell(ScrollView(this).apply { addView(list) }))
    }

    private fun renderLauncher(policy: Policy) {
        val libraryApps = policy.libraryItems
            .filter { it.type in listOf("app", "android_app") && !it.packageName.isNullOrBlank() }
        val configuredApps = if (libraryApps.isNotEmpty()) {
            libraryApps.map { it.packageName!! to it.name }
        } else {
            policy.allowedApps.map { it to "" }
        }
        val entries = configuredApps.map { (packageName, configuredName) ->
            val info = runCatching { packageManager.getApplicationInfo(packageName, 0) }.getOrNull()
            val launchable = packageManager.getLaunchIntentForPackage(packageName) != null ||
                (info != null && policyManager.isAppClosed(packageName))
            LauncherEntry(
                label = configuredName.ifBlank {
                    info?.let { packageManager.getApplicationLabel(it).toString() } ?: packageName
                },
                detail = if (launchable) null else "Installation en attente",
                icon = info?.let { packageManager.getApplicationIcon(it) } ?: packageManager.defaultActivityIcon,
                enabled = launchable,
                action = { launchAllowedApp(packageName) },
            )
        }.toMutableList()

        policy.libraryItems.filter { it.type == "file" }.forEach { item ->
            val downloaded = DeviceLibraryManager.cachedFile(this, item).isFile
            entries += LauncherEntry(
                label = item.name,
                detail = if (downloaded) null else "Téléchargement en attente",
                icon = libraryFileIcon(item),
                enabled = downloaded,
                action = { openLibraryFile(item) },
            )
        }

        val columns = when {
            resources.configuration.screenWidthDp >= 1000 -> 6
            resources.configuration.screenWidthDp >= 720 -> 5
            else -> 4
        }
        val grid = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(18), dp(14), dp(28))
        }

        if (entries.isEmpty()) {
            grid.addView(TextView(this).apply {
                text = "Aucune application ou aucun fichier n’est disponible."
                textSize = 17f
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
                setPadding(dp(24), dp(80), dp(24), dp(24))
            })
        } else {
            entries.chunked(columns).forEach { rowEntries ->
                val row = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.TOP
                }
                rowEntries.forEach { entry ->
                    row.addView(launcherTile(entry), LinearLayout.LayoutParams(0, dp(142), 1f).apply {
                        setMargins(dp(4), dp(4), dp(4), dp(8))
                    })
                }
                repeat(columns - rowEntries.size) {
                    row.addView(Space(this), LinearLayout.LayoutParams(0, dp(142), 1f).apply {
                        setMargins(dp(4), dp(4), dp(4), dp(8))
                    })
                }
                grid.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
            }
        }

        val background = FrameLayout(this).apply {
            setBackgroundColor(runCatching { Color.parseColor(policy.launcherBackgroundColor) }.getOrDefault(KIOSK_HEADER_COLOR))
        }
        policy.launcherBackground?.let { item ->
            val file = DeviceLibraryManager.cachedFile(this, item)
            if (file.isFile) {
                decodeLauncherBackground(file)?.let { bitmap ->
                    background.addView(ImageView(this).apply {
                        setImageBitmap(bitmap)
                        scaleType = ImageView.ScaleType.FIT_CENTER
                        contentDescription = "Image d’arrière-plan"
                    }, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
                }
            }
        }
        background.addView(ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(Color.TRANSPARENT)
            addView(grid, android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
            ))
        }, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(kioskShell(background))
    }

    private fun decodeLauncherBackground(file: File): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val targetWidth = resources.displayMetrics.widthPixels.coerceAtLeast(1)
        val targetHeight = resources.displayMetrics.heightPixels.coerceAtLeast(1)
        var sampleSize = 1
        while (bounds.outWidth / (sampleSize * 2) >= targetWidth && bounds.outHeight / (sampleSize * 2) >= targetHeight) {
            sampleSize *= 2
        }
        return BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = sampleSize })
    }

    private fun launcherTile(entry: LauncherEntry): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
        setPadding(dp(7), dp(8), dp(7), dp(6))
        isEnabled = entry.enabled
        isClickable = entry.enabled
        isFocusable = entry.enabled
        alpha = if (entry.enabled) 1f else 0.55f
        if (entry.enabled) {
            setBackgroundResource(android.R.drawable.list_selector_background)
            setOnClickListener { entry.action() }
        }
        addView(ImageView(this@KioskActivity).apply {
            setImageDrawable(entry.icon)
            contentDescription = entry.label
            adjustViewBounds = true
            scaleType = ImageView.ScaleType.FIT_CENTER
        }, LinearLayout.LayoutParams(dp(76), dp(76)))
        addView(TextView(this@KioskActivity).apply {
            text = entry.label
            textSize = 14f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            maxLines = 2
            ellipsize = android.text.TextUtils.TruncateAt.END
            setShadowLayer(2f, 0f, 1f, Color.argb(150, 0, 0, 0))
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(7)
        })
        entry.detail?.let { status ->
            addView(TextView(this@KioskActivity).apply {
                text = status
                textSize = 10f
                setTextColor(Color.rgb(225, 236, 247))
                gravity = Gravity.CENTER
                maxLines = 1
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(2)
            })
        }
    }

    private fun maybeLaunchSingleApp(policy: Policy) {
        if (resumed && autoLaunchPending && policy.kioskType == "app" && policy.allowedApps.size == 1 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            autoLaunchPending = false
            launchAllowedApp(policy.allowedApps.single())
        }
    }

    private fun render() {
        if (isFinishing || isDestroyed || exiting || policyManager.isPaused()) return
        val policy = storage.policy()
        if (policy != null && renderedPolicy == policy) {
            if (policy.kioskEnabled && policy.isAppMode && policy.hasTarget && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) renderApps(policy)
            maybeLaunchSingleApp(policy)
            return
        }
        currentWebView?.destroy()
        currentWebView = null
        renderedPolicy = policy
        if (!storage.hasEnrollment()) {
            renderStatus("MyMDM is installed but not enrolled.")
            return
        }
        if (policy == null || !policy.kioskEnabled) {
            renderStatus(
                "MyMDM enrolled. Kiosk disabled.\n\n" +
                    "Device ID: ${storage.deviceId() ?: ""}\n" +
                    "Server: ${storage.serverUrl() ?: ""}\n" +
                    "Policy revision: ${policy?.revision ?: 0}\n" +
                    "Last sync: ${storage.lastSync()}"
            )
            return
        }
        if (!policy.hasTarget) {
            renderStatus(
                "MyMDM kiosk enabled, but target is missing or unsupported.\n\n" +
                    "Device ID: ${storage.deviceId() ?: ""}\n" +
                    "Policy revision: ${policy.revision}\n" +
                    "Device Owner: ${policyManager.isDeviceOwner()}"
            )
            return
        }
        policyManager.applyActivityPolicy(this, policy)
        if (resumed) policyManager.enterLockTask(this)
        if (policy.isAppMode) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                renderStatus("Le kiosque d’applications nécessite Android 11 ou supérieur.")
                return
            }
            renderApps(policy)
            maybeLaunchSingleApp(policy)
            return
        }
        val webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.setSupportMultipleWindows(false)
            settings.javaScriptCanOpenWindowsAutomatically = false
            webViewClient = KioskWebViewClient(policy)
            loadUrl(policy.url)
        }
        currentWebView = webView
        setContentView(kioskShell(webView))
    }

    private fun renderStatus(message: String) {
        setContentView(kioskShell(TextView(this).apply {
            text = message
            gravity = Gravity.CENTER
            setPadding(24, 24, 24, 24)
        }))
    }

    private fun kioskShell(content: View): View {
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(7), dp(8), dp(7))
            setBackgroundColor(KIOSK_HEADER_COLOR)
        }
        header.addView(ImageView(this).apply {
            setImageResource(R.drawable.ic_mymdm_logo)
            imageTintList = ColorStateList.valueOf(Color.WHITE)
            contentDescription = "Logo MyMDM"
            setPadding(0, dp(5), dp(12), dp(5))
        }, LinearLayout.LayoutParams(dp(42), LinearLayout.LayoutParams.MATCH_PARENT))
        val identity = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(TextView(this@KioskActivity).apply {
                text = "MyMDM"
                textSize = 18f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(Color.WHITE)
            })
            addView(TextView(this@KioskActivity).apply {
                text = "${BuildConfig.VERSION_NAME} · build ${BuildConfig.VERSION_CODE} · Organisation : ${storage.policy()?.organizationName?.takeIf { it.isNotBlank() } ?: "Organisation non configurée"}"
                textSize = 10f
                setTextColor(Color.rgb(238, 239, 237))
            })
        }
        header.addView(identity, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        clockLabel = TextView(this).apply {
            textSize = 14f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        }
        header.addView(clockLabel, LinearLayout.LayoutParams(dp(58), LinearLayout.LayoutParams.MATCH_PARENT))
        updateClock()
        header.addView(ImageButton(this).apply {
            setImageResource(R.drawable.ic_wifi)
            imageTintList = ColorStateList.valueOf(Color.WHITE)
            background = null
            contentDescription = "Configurer le Wi-Fi"
            setPadding(dp(11), dp(11), dp(11), dp(11))
            setOnClickListener { openWifiSettings() }
        }, LinearLayout.LayoutParams(dp(46), LinearLayout.LayoutParams.MATCH_PARENT))
        syncButton = ImageButton(this).apply {
            setImageResource(R.drawable.ic_sync)
            imageTintList = ColorStateList.valueOf(Color.WHITE)
            background = null
            contentDescription = "Synchroniser avec le serveur"
            setPadding(dp(11), dp(11), dp(11), dp(11))
            setOnClickListener { synchronizeNow() }
        }
        header.addView(syncButton, LinearLayout.LayoutParams(dp(46), LinearLayout.LayoutParams.MATCH_PARENT))
        header.addView(ImageView(this).apply {
            setImageResource(R.drawable.ic_battery)
            imageTintList = ColorStateList.valueOf(Color.WHITE)
            contentDescription = "Batterie"
            setPadding(dp(8), dp(14), dp(4), dp(14))
        }, LinearLayout.LayoutParams(dp(36), LinearLayout.LayoutParams.MATCH_PARENT))
        batteryLabel = TextView(this).apply {
            text = "—%"
            textSize = 13f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER_VERTICAL
        }
        header.addView(batteryLabel, LinearLayout.LayoutParams(dp(44), LinearLayout.LayoutParams.MATCH_PARENT))
        updateBatteryLabel(registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)))
        header.addView(ImageButton(this).apply {
            setImageResource(R.drawable.ic_settings)
            imageTintList = ColorStateList.valueOf(Color.WHITE)
            background = null
            contentDescription = "Paramètres MyMDM"
            setPadding(dp(14), 0, dp(14), 0)
            setOnClickListener(::showSettingsMenu)
        }, LinearLayout.LayoutParams(dp(56), LinearLayout.LayoutParams.MATCH_PARENT))

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(header, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(58)))
            addView(content, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        }
    }

    private fun updateBatteryLabel(intent: Intent?) {
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val percent = if (level >= 0 && scale > 0) (level * 100 / scale).coerceIn(0, 100) else null
        batteryLabel?.text = percent?.let { "$it%" } ?: "—%"
    }

    private fun libraryFileIcon(item: LibraryItem): Drawable {
        val (resource, color) = when {
            item.mimeType == "application/pdf" -> R.drawable.ic_file_pdf to Color.rgb(239, 83, 80)
            item.mimeType.startsWith("image/") -> R.drawable.ic_file_image to Color.rgb(66, 165, 245)
            item.mimeType.startsWith("video/") -> R.drawable.ic_file_video to Color.rgb(171, 71, 188)
            item.mimeType.startsWith("audio/") -> R.drawable.ic_file_audio to Color.rgb(102, 187, 106)
            item.mimeType in ARCHIVE_MIME_TYPES -> R.drawable.ic_file_archive to Color.rgb(255, 183, 77)
            else -> R.drawable.ic_file_document to Color.rgb(144, 202, 249)
        }
        return requireNotNull(getDrawable(resource)).mutate().apply { setTint(color) }
    }

    private fun updateClock() {
        clockLabel?.text = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
    }

    private fun synchronizeNow() {
        if (syncButton?.isEnabled == false) return
        syncButton?.isEnabled = false
        Toast.makeText(this, "Synchronisation MyMDM…", Toast.LENGTH_SHORT).show()
        thread {
            val result = syncManager.syncOnce()
            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                syncButton?.isEnabled = true
                if (result.error == null) {
                    if (result.changed) {
                        renderedPolicy = null
                        render()
                    }
                    Toast.makeText(this, if (result.changed) "Configuration appliquée" else "Appareil synchronisé", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this, "Synchronisation impossible : ${result.error}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun showSettingsMenu(anchor: View) {
        PopupMenu(this, anchor).apply {
            menu.add(0, MENU_MAINTENANCE, 0, "Informations et maintenance")
            menu.add(0, MENU_EXIT_KIOSK, 1, "Quitter le mode kiosque")
            setOnMenuItemClickListener { item ->
                when (item.itemId) {
                    MENU_MAINTENANCE -> startActivity(Intent(this@KioskActivity, AdminActivity::class.java))
                    MENU_EXIT_KIOSK -> showExitDialog()
                }
                true
            }
            show()
        }
    }

    private fun openWifiSettings() {
        val intent = Intent(if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) Settings.Panel.ACTION_WIFI else Settings.ACTION_WIFI_SETTINGS)
        val component = intent.resolveActivity(packageManager)
        if (component == null) {
            Toast.makeText(this, "Paramètres Wi-Fi indisponibles", Toast.LENGTH_LONG).show()
            return
        }
        if (!policyManager.beginWifiConfiguration(component.packageName)) {
            Toast.makeText(this, "MyMDM doit être Device Owner", Toast.LENGTH_LONG).show()
            return
        }
        try {
            startActivityForResult(intent.setComponent(component), REQUEST_WIFI_SETTINGS)
        } catch (error: Exception) {
            policyManager.restoreKioskPolicy(storage.policy())
            Toast.makeText(this, "Ouverture du Wi-Fi impossible : ${error.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun scheduleAdminPermissionSetup() {
        clockHandler.postDelayed({ showAdminPermissionSetup() }, ADMIN_SETUP_DELAY_MS)
    }

    private fun showAdminPermissionSetup() {
        if (!storage.hasEnrollment() || !policyManager.isDeviceOwner() || adminSetupDialog != null || isFinishing || isDestroyed) return
        val installSourceAllowed = packageManager.canRequestPackageInstalls()
        val backgroundCaptureAllowed = ManagedScreenCaptureService.isEnabled(this)
        val appPermissions = if (storage.policy()?.launcherAutoGrantPermissions != false) {
            "✓ Permissions standard des applications : accordées par MyMDM"
        } else {
            "○ Permissions des applications : l’utilisateur choisira dans chaque application"
        }
        val checklist = buildString {
            appendLine("✓ Menu d’alimentation : appui long sur le bouton Power autorisé")
            appendLine(appPermissions)
            appendLine(if (installSourceAllowed) "✓ Installation d’applications depuis MyMDM : autorisée" else "○ Installation d’applications depuis MyMDM : autorisation requise")
            append(if (backgroundCaptureAllowed) "✓ Capture de l’écran affiché en arrière-plan : autorisée" else "○ Capture de l’écran affiché en arrière-plan : autorisation requise")
        }
        if (installSourceAllowed && backgroundCaptureAllowed) {
            return
        }
        val dialog = AlertDialog.Builder(this)
            .setTitle("Configuration administrateur")
            .setMessage("Vérifiez ces accès avant de remettre l’appareil à l’utilisateur :\n\n$checklist")
            .setNegativeButton("Plus tard", null)
            .setPositiveButton(if (!backgroundCaptureAllowed) "Autoriser la capture" else "Autoriser l’installation") { _, _ ->
                if (!backgroundCaptureAllowed) openBackgroundScreenCaptureSettings() else openInstallSourceSettings()
            }
            .create()
        adminSetupDialog = dialog
        dialog.setOnDismissListener { adminSetupDialog = null }
        dialog.show()
    }

    private fun openInstallSourceSettings() {
        val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))
        val component = intent.resolveActivity(packageManager)
        if (component == null) {
            Toast.makeText(this, "Réglage d’installation d’applications indisponible", Toast.LENGTH_LONG).show()
            return
        }
        if (!policyManager.beginInstallSourceConfiguration(component.packageName)) {
            Toast.makeText(this, "MyMDM doit être Device Owner", Toast.LENGTH_LONG).show()
            return
        }
        policyManager.exitLockTask(this)
        try {
            startActivityForResult(intent, REQUEST_INSTALL_SOURCE_SETTINGS)
        } catch (error: Exception) {
            policyManager.restoreKioskPolicy(storage.policy())
            Toast.makeText(this, "Ouverture du réglage impossible : ${error.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun openBackgroundScreenCaptureSettings() {
        if (!policyManager.permitManagedAccessibilityService()) {
            Toast.makeText(this, "MyMDM doit être autorisé par la politique d’accessibilité.", Toast.LENGTH_LONG).show()
            return
        }
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        val component = intent.resolveActivity(packageManager)
        if (component == null) {
            Toast.makeText(this, "Réglage de capture d’écran indisponible", Toast.LENGTH_LONG).show()
            return
        }
        if (!policyManager.allowTemporaryPackage(component.packageName)) {
            Toast.makeText(this, "MyMDM doit être Device Owner", Toast.LENGTH_LONG).show()
            return
        }
        policyManager.exitLockTask(this)
        try {
            startActivityForResult(intent, REQUEST_SCREEN_CAPTURE_SETTINGS)
        } catch (error: Exception) {
            policyManager.restoreKioskPolicy(storage.policy())
            Toast.makeText(this, "Ouverture du réglage impossible : ${error.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun showRestrictedSettingsRecovery() {
        AlertDialog.Builder(this)
            .setTitle("Paramètre restreint par Android")
            .setMessage(
                "Android protège les services d’accessibilité installés hors d’un magasin. " +
                    "Ouvrez la fiche MyMDM, touchez le menu ⋮ en haut à droite, puis « Autoriser les paramètres restreints ». " +
                    "Revenez ensuite pour activer la capture.",
            )
            .setNegativeButton("Plus tard", null)
            .setPositiveButton("Ouvrir la fiche MyMDM") { _, _ -> openRestrictedApplicationDetails() }
            .show()
    }

    private fun openRestrictedApplicationDetails() {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
        val component = intent.resolveActivity(packageManager)
        if (component == null || !policyManager.allowTemporaryPackage(component.packageName)) {
            Toast.makeText(this, "Fiche MyMDM indisponible", Toast.LENGTH_LONG).show()
            return
        }
        policyManager.exitLockTask(this)
        try {
            startActivityForResult(intent, REQUEST_RESTRICTED_APP_DETAILS)
        } catch (error: Exception) {
            policyManager.restoreKioskPolicy(storage.policy())
            Toast.makeText(this, "Ouverture de la fiche impossible : ${error.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private val KIOSK_HEADER_COLOR = Color.rgb(126, 127, 123)
        private val ARCHIVE_MIME_TYPES = setOf("application/zip", "application/x-7z-compressed", "application/x-rar-compressed", "application/gzip")
        private const val CLOCK_REFRESH_MS = 30_000L
        private const val REQUEST_WIFI_SETTINGS = 2001
        private const val REQUEST_LOCATION_SETTINGS = 2002
        private const val REQUEST_INSTALL_SOURCE_SETTINGS = 2003
        private const val REQUEST_SCREEN_CAPTURE_SETTINGS = 2004
        private const val REQUEST_RESTRICTED_APP_DETAILS = 2005
        private const val ADMIN_SETUP_DELAY_MS = 1_200L
        private const val MENU_MAINTENANCE = 4
        private const val MENU_EXIT_KIOSK = 5
        @Volatile private var currentActivity = WeakReference<KioskActivity>(null)

        fun requestLocationSettingsResolution(resolution: ResolvableApiException): Boolean {
            val activity = currentActivity.get() ?: return false
            val completed = CountDownLatch(1)
            var started = false
            activity.runOnUiThread {
                started = runCatching {
                    check(activity.policyManager.beginLocationConfiguration("com.google.android.gms"))
                    resolution.startResolutionForResult(activity, REQUEST_LOCATION_SETTINGS)
                    true
                }.onFailure {
                    activity.policyManager.restoreKioskPolicy(activity.storage.policy())
                    Toast.makeText(activity, "Ouverture du réglage de localisation impossible : ${it.message}", Toast.LENGTH_LONG).show()
                }.getOrDefault(false)
                completed.countDown()
            }
            return completed.await(5, TimeUnit.SECONDS) && started
        }

        fun refreshCurrent() {
            currentActivity.get()?.runOnUiThread { currentActivity.get()?.render() }
        }
    }

    private data class LauncherEntry(
        val label: String,
        val detail: String?,
        val icon: Drawable,
        val enabled: Boolean,
        val action: () -> Unit,
    )
}
