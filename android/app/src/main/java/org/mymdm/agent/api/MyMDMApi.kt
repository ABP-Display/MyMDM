package org.mymdm.agent.api

import android.os.Build
import org.mymdm.agent.BuildConfig
import org.mymdm.agent.api.models.Policy
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest

class MyMDMApi(private val serverUrl: String, private val credential: String? = null) {
    fun enroll(token: String): Pair<String, Pair<String, Policy>> {
        val body = JSONObject()
            .put("enrollment_token", token)
            .put("manufacturer", Build.MANUFACTURER ?: "")
            .put("model", Build.MODEL ?: "")
            .put("android_version", Build.VERSION.RELEASE ?: "")
            .put("sdk_version", Build.VERSION.SDK_INT)
            .put("agent_version", BuildConfig.VERSION_NAME)
            .put("version_code", BuildConfig.VERSION_CODE)
            .put("serial_number", serialNumber() ?: JSONObject.NULL)
        val json = request("POST", "/api/v1/device/enroll", body, false)
        return json.getString("device_id") to (json.getString("device_token") to Policy.fromJson(json.getJSONObject("policy")))
    }

    fun heartbeat(
        policyRevision: Int,
        kioskActive: Boolean,
        batteryLevel: Int?,
        batteryCharging: Boolean?,
        volumeLevel: Int,
        brightnessLevel: Int,
        metrics: JSONObject
    ): JSONObject {
        val body = JSONObject()
            .put("agent_version", BuildConfig.VERSION_NAME)
            .put("version_code", BuildConfig.VERSION_CODE)
            .put("android_version", Build.VERSION.RELEASE ?: "")
            .put("sdk_version", Build.VERSION.SDK_INT)
            .put("kiosk_active", kioskActive)
            .put("policy_revision", policyRevision)
            .put("battery_level", batteryLevel ?: JSONObject.NULL)
            .put("battery_charging", batteryCharging ?: JSONObject.NULL)
            .put("volume_level", volumeLevel)
            .put("brightness_level", brightnessLevel)
            .put("metrics", metrics)
        return request("POST", "/api/v1/device/heartbeat", body, true)
    }

    fun uploadScreenshot(bytes: ByteArray) {
        val boundary = "MyMDM-${System.currentTimeMillis()}"
        val conn = URL(serverUrl.trimEnd('/') + "/api/v1/device/screenshot").openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.connectTimeout = 10000
        conn.readTimeout = 30000
        conn.doOutput = true
        conn.setRequestProperty("Accept", "application/json")
        conn.setRequestProperty("Authorization", "Bearer ${credential ?: error("missing credential")}")
        conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        conn.outputStream.use { output ->
            output.write("--$boundary\r\n".toByteArray())
            output.write("Content-Disposition: form-data; name=\"screen\"; filename=\"kiosk.jpg\"\r\n".toByteArray())
            output.write("Content-Type: image/jpeg\r\n\r\n".toByteArray())
            output.write(bytes)
            output.write("\r\n--$boundary--\r\n".toByteArray())
        }
        val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
        val text = stream.bufferedReader().use { it.readText() }
        if (conn.responseCode !in 200..299) error("MyMDM screenshot HTTP ${conn.responseCode}: $text")
    }

    fun updateLocation(location: Map<String, Any?>) {
        request("POST", "/api/v1/device/location", JSONObject()
            .put("latitude", location["location_latitude"])
            .put("longitude", location["location_longitude"])
            .put("accuracy_meters", location["location_accuracy_meters"] ?: JSONObject.NULL)
            .put("provider", location["location_provider"] ?: JSONObject.NULL)
            .put("timestamp", location["location_timestamp"]), true)
    }

    fun commandStatus(id: String, status: String, error: String? = null, metrics: Map<String, Any?>? = null) {
        val body = JSONObject()
            .put("command_id", id)
            .put("status", status)
            .put("error", error)
        if (metrics != null) {
            body.put("metrics", JSONObject().apply {
                metrics.forEach { (key, value) -> put(key, value ?: JSONObject.NULL) }
            })
        }
        request("POST", "/api/v1/device/command/status", body, true)
    }

    fun resetStatus(id: String, status: String, error: String? = null) {
        request("POST", "/api/v1/device/reset/status", JSONObject().put("reset_id", id).put("status", status).put("error", error), true)
    }

    fun policy(): Policy = Policy.fromJson(request("GET", "/api/v1/device/policy", null, true))

    fun postPolicyStatus(revision: Int, status: String, error: String?) {
        request("POST", "/api/v1/device/policy/status", JSONObject().put("revision", revision).put("status", status).put("error", error), true)
    }

    fun agentUpdate(force: Boolean = false, commandId: String? = null): JSONObject {
        val version = URLEncoder.encode(BuildConfig.VERSION_NAME, "UTF-8")
        val command = commandId?.let { "&command_id=${URLEncoder.encode(it, "UTF-8")}" }.orEmpty()
        val path = "/api/v1/device/agent/update?agent_version=$version" +
            "&version_code=${BuildConfig.VERSION_CODE}&force=${if (force) 1 else 0}$command"
        return request("GET", path, null, true)
    }

    fun download(url: String): ByteArray {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.connectTimeout = 10000
        conn.readTimeout = 60000
        conn.setRequestProperty("Accept", "application/vnd.android.package-archive")
        val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
        if (conn.responseCode !in 200..299) {
            val text = stream.bufferedReader().use { it.readText() }
            error("MyMDM download HTTP ${conn.responseCode}: $text")
        }
        val buffer = ByteArrayOutputStream()
        stream.use { input -> input.copyTo(buffer) }
        return buffer.toByteArray()
    }

    fun downloadLibrary(sha256: String, destination: File): String {
        val conn = URL(serverUrl.trimEnd('/') + "/api/v1/device/library/$sha256").openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.connectTimeout = 10000
        conn.readTimeout = 120000
        conn.setRequestProperty("Accept", "application/octet-stream")
        conn.setRequestProperty("Authorization", "Bearer ${credential ?: error("missing credential")}")
        val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
        if (conn.responseCode !in 200..299) {
            val text = stream.bufferedReader().use { it.readText() }
            error("MyMDM library HTTP ${conn.responseCode}: $text")
        }
        destination.parentFile?.mkdirs()
        val temporary = File(destination.parentFile, destination.name + ".part")
        val digest = MessageDigest.getInstance("SHA-256")
        try {
            stream.use { input ->
                FileOutputStream(temporary).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        digest.update(buffer, 0, read)
                    }
                    output.fd.sync()
                }
            }
            check(temporary.renameTo(destination)) { "Impossible de finaliser le téléchargement" }
            return digest.digest().joinToString("") { "%02x".format(it) }
        } catch (error: Exception) {
            temporary.delete()
            throw error
        }
    }

    private fun request(method: String, path: String, body: JSONObject?, auth: Boolean): JSONObject {
        val conn = URL(serverUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = 10000
        conn.readTimeout = 20000
        conn.setRequestProperty("Accept", "application/json")
        if (auth) conn.setRequestProperty("Authorization", "Bearer ${credential ?: error("missing credential")}")
        if (body != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        }
        val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
        val text = stream.bufferedReader().use { it.readText() }
        if (conn.responseCode !in 200..299) error("MyMDM HTTP ${conn.responseCode}: $text")
        return JSONObject(text)
    }

    private fun serialNumber(): String? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        runCatching { Build.getSerial() }.getOrNull()?.trim()?.takeUnless { it.isBlank() || it == Build.UNKNOWN }
    } else {
        null
    }
}
