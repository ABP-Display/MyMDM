package org.mymdm.agent.kiosk

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.util.Log
import android.os.Looper
import org.mymdm.agent.api.MyMDMApi
import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.lang.ref.WeakReference
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

object KioskScreenSnapshot {
    private const val FILE_NAME = "latest-kiosk-screen.jpg"
    private const val PREFS = "screen_snapshot"
    private const val MAX_WIDTH = 720
    @Volatile private var currentActivity = WeakReference<Activity>(null)

    fun attach(activity: Activity) {
        currentActivity = WeakReference(activity)
    }

    fun detach(activity: Activity) {
        if (currentActivity.get() === activity) currentActivity.clear()
    }

    fun captureCurrent(): Boolean {
        if (ManagedScreenCaptureService.captureCurrent()) return true
        val activity = currentActivity.get() ?: return false
        if (Looper.myLooper() == Looper.getMainLooper()) return capture(activity)
        val latch = CountDownLatch(1)
        var captured = false
        activity.runOnUiThread {
            captured = capture(activity)
            latch.countDown()
        }
        return latch.await(5, TimeUnit.SECONDS) && captured
    }

    fun capture(activity: Activity): Boolean {
        val view = activity.window.decorView.rootView
        if (view.width <= 0 || view.height <= 0 || !view.isShown) return false
        return runCatching {
            val scale = minOf(1f, MAX_WIDTH.toFloat() / view.width)
            val width = (view.width * scale).toInt().coerceAtLeast(1)
            val height = (view.height * scale).toInt().coerceAtLeast(1)
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
            val canvas = Canvas(bitmap)
            canvas.scale(scale, scale)
            view.draw(canvas)
            try {
                saveBitmap(activity, bitmap)
            } finally {
                bitmap.recycle()
            }
        }.onFailure { Log.w("MyMDM", "screen snapshot failed: ${it.message}") }.getOrDefault(false)
    }

    internal fun saveBitmap(context: Context, source: Bitmap): Boolean {
        if (source.width <= 0 || source.height <= 0) return false
        val scale = minOf(1f, MAX_WIDTH.toFloat() / source.width)
        val output = if (scale < 1f) {
            Bitmap.createScaledBitmap(
                source,
                (source.width * scale).toInt().coerceAtLeast(1),
                (source.height * scale).toInt().coerceAtLeast(1),
                true,
            )
        } else {
            source
        }
        return try {
            val target = File(context.filesDir, FILE_NAME)
            val temporary = File(context.filesDir, "$FILE_NAME.tmp")
            FileOutputStream(temporary).use { output.compress(Bitmap.CompressFormat.JPEG, 72, it) }
            Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
            true
        } finally {
            if (output !== source) output.recycle()
        }
    }

    fun uploadPending(context: Context, api: MyMDMApi) {
        val file = File(context.filesDir, FILE_NAME)
        if (!file.isFile) return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (file.lastModified() <= prefs.getLong("uploaded_at", 0)) return
        runCatching {
            api.uploadScreenshot(file.readBytes())
            prefs.edit().putLong("uploaded_at", file.lastModified()).apply()
        }.onFailure { Log.w("MyMDM", "screen snapshot upload failed: ${it.message}") }
    }
}
