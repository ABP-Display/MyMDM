package org.mymdm.agent.kiosk

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.util.Log
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityManager
import java.lang.ref.WeakReference
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class ManagedScreenCaptureService : AccessibilityService() {
    override fun onServiceConnected() {
        super.onServiceConnected()
        current = WeakReference(this)
        Log.i("MyMDM", "managed screen capture connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        if (current.get() === this) current.clear()
        super.onDestroy()
    }

    companion object {
        private const val CAPTURE_TIMEOUT_SECONDS = 10L
        private val captureExecutor = Executors.newSingleThreadExecutor()
        @Volatile private var current = WeakReference<ManagedScreenCaptureService>(null)

        fun isEnabled(context: Context): Boolean {
            val expected = ComponentName(context, ManagedScreenCaptureService::class.java)
            val manager = context.getSystemService(AccessibilityManager::class.java)
            return manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK).any { info ->
                val service = info.resolveInfo.serviceInfo
                ComponentName(service.packageName, service.name) == expected
            }
        }

        fun captureCurrent(): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false
            val service = current.get() ?: return false
            val completed = CountDownLatch(1)
            var captured = false
            return try {
                service.takeScreenshot(
                    Display.DEFAULT_DISPLAY,
                    captureExecutor,
                    object : TakeScreenshotCallback {
                        override fun onSuccess(result: ScreenshotResult) {
                            val buffer = result.hardwareBuffer
                            try {
                                val hardwareBitmap = Bitmap.wrapHardwareBuffer(buffer, result.colorSpace)
                                val softwareBitmap = hardwareBitmap?.copy(Bitmap.Config.RGB_565, false)
                                hardwareBitmap?.recycle()
                                if (softwareBitmap != null) {
                                    captured = KioskScreenSnapshot.saveBitmap(service.applicationContext, softwareBitmap)
                                    softwareBitmap.recycle()
                                }
                            } catch (error: Exception) {
                                Log.w("MyMDM", "managed screen capture failed: ${error.message}")
                            } finally {
                                buffer.close()
                                completed.countDown()
                            }
                        }

                        override fun onFailure(errorCode: Int) {
                            Log.w("MyMDM", "managed screen capture rejected with code $errorCode")
                            completed.countDown()
                        }
                    },
                )
                completed.await(CAPTURE_TIMEOUT_SECONDS, TimeUnit.SECONDS) && captured
            } catch (error: Exception) {
                Log.w("MyMDM", "managed screen capture unavailable: ${error.message}")
                false
            }
        }
    }
}
