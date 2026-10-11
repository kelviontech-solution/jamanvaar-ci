package com.jamanvaar.apkupdater

import android.app.Activity
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.security.MessageDigest
import java.util.zip.ZipFile
import android.widget.Toast

@InvokeArg
class DownloadAndInstallArgs {
    var url: String = ""
    var sha256: String = ""
}

/**
 * Downloads an app update .apk through Android's own DownloadManager (so the download itself is
 * a visible system download). Completion verifies the APK and records READY_TO_INSTALL;
 * the foreground operator then explicitly calls installDownloaded after saving local data.
 * Android's system installer still requires confirmation. Downloads never interrupt billing.
 */
@TauriPlugin
class ApkUpdaterPlugin(private val activity: Activity) : Plugin(activity) {
    private var downloadId: Long = -1
    private var receiver: BroadcastReceiver? = null
    @Volatile private var verifying = false
    private val fileName = "jamanvaar-update.apk"
    private val preferences get() = activity.getSharedPreferences("jamanvaar_apk_update", Context.MODE_PRIVATE)
    private fun state(value: String) { preferences.edit().putString("phase", value).apply() }

    @Command
    fun getUpdateStatus(invoke: Invoke) {
        val context = activity.applicationContext
        var phase = preferences.getString("phase", "IDLE") ?: "IDLE"
        val id = preferences.getLong("downloadId", -1)
        if (id >= 0 && phase == "DOWNLOADING") {
            val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val status = manager.query(DownloadManager.Query().setFilterById(id)).use { cursor ->
                if (!cursor.moveToFirst()) DownloadManager.STATUS_FAILED else cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            }
            if (status == DownloadManager.STATUS_FAILED) { state("DOWNLOAD_FAILED"); phase = "DOWNLOAD_FAILED" }
            else if (receiver == null && !verifying) {
                downloadId = id
                registerCompletionReceiver(context, manager, preferences.getString("sha256", "") ?: "")
                // Recover completion after the WebView/process was closed during the download.
                if (status == DownloadManager.STATUS_SUCCESSFUL) receiver?.onReceive(context, Intent(DownloadManager.ACTION_DOWNLOAD_COMPLETE).putExtra(DownloadManager.EXTRA_DOWNLOAD_ID, id))
            }
        }
        if (phase == "INSTALLER_OPENED") {
            @Suppress("DEPRECATION")
            val installed = context.packageManager.getPackageInfo(context.packageName, 0)
            val version = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) installed.longVersionCode else installed.versionCode.toLong()
            phase = if (version >= preferences.getLong("targetVersionCode", Long.MAX_VALUE)) "VERIFIED" else "NOT_INSTALLED"
        }
        val result = JSObject()
        result.put("phase", phase)
        result.put("downloadId", id)
        invoke.resolve(result)
    }

    @Command
    fun installDownloaded(invoke: Invoke) {
        if (verifying || preferences.getString("phase", "") != "READY_TO_INSTALL") { invoke.reject("The APK is not ready to install"); return }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()) { invoke.reject("Allow updates from this app in Android settings, then retry"); return }
        val context = activity.applicationContext
        val apk = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)
        verifying = true
        Thread {
            try {
                val digest = MessageDigest.getInstance("SHA-256")
                apk.inputStream().use { input -> val buffer = ByteArray(8192); var length = input.read(buffer); while (length >= 0) { if (length > 0) digest.update(buffer, 0, length); length = input.read(buffer) } }
                val actual = digest.digest().joinToString("") { "%02x".format(it) }
                if (actual != preferences.getString("sha256", "") || !isTrustedUpdate(context, apk)) {
                    state("VERIFICATION_FAILED"); apk.delete(); invoke.reject("APK verification failed; download the signed release again"); return@Thread
                }
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.jamanvaar.fileprovider", apk)
                val intent = Intent(Intent.ACTION_VIEW).apply { setDataAndType(uri, "application/vnd.android.package-archive"); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
                activity.runOnUiThread {
                    try { context.startActivity(intent); state("INSTALLER_OPENED"); invoke.resolve(JSObject()) }
                    catch (_: Exception) { state("INSTALL_FAILED"); invoke.reject("Unable to open the Android installer") }
                }
            } catch (_: Exception) { state("VERIFICATION_FAILED"); invoke.reject("APK verification failed; please retry") }
            finally { verifying = false }
        }.start()
    }

    @Command
    fun downloadAndInstall(invoke: Invoke) {
        val args = invoke.parseArgs(DownloadAndInstallArgs::class.java)
        val source = Uri.parse(args.url)
        if (!Regex("^[a-fA-F0-9]{64}$").matches(args.sha256)) { invoke.reject("A verified release checksum is required"); return }
        if (source.scheme != "https" || source.host.isNullOrBlank() || !source.userInfo.isNullOrBlank()) {
            invoke.reject("App updates require an HTTPS download URL without embedded credentials")
            return
        }
        if (receiver != null || verifying) { invoke.reject("An update download is already running"); return }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()) {
            try {
                activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
                invoke.reject("Allow updates from this app in Android settings, return here, then tap Update app again.")
            } catch (_: Exception) { invoke.reject("Android blocks app installation. Ask the device administrator to allow updates from this app.") }
            return
        }

        val context = activity.applicationContext
        val downloadManager =
            context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

        // A stale half-downloaded file from a previous attempt would otherwise look "successful"
        // to a fresh DownloadManager.Query by coincidence of file presence alone.
        val existing = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)
        if (existing.exists()) existing.delete()

        val request = DownloadManager.Request(Uri.parse(args.url))
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName)
            .setTitle("JAMANVAAR update")
            .setDescription("Downloading the latest version")
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(true)

        try {
            downloadId = downloadManager.enqueue(request)
            preferences.edit().putLong("downloadId", downloadId).putString("sha256", args.sha256.lowercase()).putString("phase", "DOWNLOADING").apply()
            registerCompletionReceiver(context, downloadManager, args.sha256.lowercase())
        } catch (_: Exception) {
            if (downloadId >= 0) downloadManager.remove(downloadId)
            receiver = null
            invoke.reject("Android could not start the update download. Check storage and network, then retry.")
            return
        }

        val result = JSObject()
        result.put("downloadId", downloadId)
        invoke.resolve(result)
    }

    private fun registerCompletionReceiver(context: Context, downloadManager: DownloadManager, expectedSha256: String) {
        // Unregister any receiver left over from an update attempt the user never let finish.
        receiver?.let {
            try { context.unregisterReceiver(it) } catch (_: IllegalArgumentException) { /* already gone */ }
        }

        val thisDownloadId = downloadId
        receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                if (id != thisDownloadId) return
                try { ctx.unregisterReceiver(this) } catch (_: IllegalArgumentException) { }
                receiver = null

                val query = DownloadManager.Query().setFilterById(id)
                val succeeded = downloadManager.query(query).use { cursor ->
                    if (!cursor.moveToFirst()) return@use false
                    val statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                    statusIdx >= 0 && cursor.getInt(statusIdx) == DownloadManager.STATUS_SUCCESSFUL
                }
                if (!succeeded) { state("DOWNLOAD_FAILED"); Toast.makeText(context, "Update download failed. Please try again.", Toast.LENGTH_LONG).show(); return }

                val apk = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)
                if (!apk.exists()) { state("DOWNLOAD_FAILED"); return }
                // Hashing a full APK must not block Android's broadcast/UI thread.
                verifying = true
                Thread {
                try {
                val digest = MessageDigest.getInstance("SHA-256")
                apk.inputStream().use { input -> val buffer = ByteArray(8192); var length = input.read(buffer); while (length >= 0) { if (length > 0) digest.update(buffer, 0, length); length = input.read(buffer) } }
                val actualSha256 = digest.digest().joinToString("") { "%02x".format(it) }
                if (actualSha256 != expectedSha256 || !isTrustedUpdate(context, apk)) {
                    state("VERIFICATION_FAILED")
                    apk.delete()
                    activity.runOnUiThread { Toast.makeText(context, "Update rejected: package, version or signing certificate does not match this app.", Toast.LENGTH_LONG).show() }
                    return@Thread
                }

                // Frontend flushes local SQLite before explicit installer handoff.
                // A recovered background download must never interrupt a new customer order.
                state("READY_TO_INSTALL")
                } catch (_: Exception) {
                    state("VERIFICATION_FAILED")
                    apk.delete()
                    activity.runOnUiThread { Toast.makeText(context, "Update verification failed. Please try again.", Toast.LENGTH_LONG).show() }
                } finally { verifying = false }
                }.start()
            }
        }

        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(receiver, filter)
        }
    }

    @Suppress("DEPRECATION")
    private fun isTrustedUpdate(context: Context, apk: File): Boolean = try {
        val pm = context.packageManager
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val installed = pm.getPackageInfo(context.packageName, flags)
        val candidate = pm.getPackageArchiveInfo(apk.absolutePath, flags)
        if (candidate == null || candidate.packageName != context.packageName || ((candidate.applicationInfo?.flags ?: 0) and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) false
        else {
            val installedVersion = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) installed.longVersionCode else installed.versionCode.toLong()
            val candidateVersion = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) candidate.longVersionCode else candidate.versionCode.toLong()
            preferences.edit().putLong("targetVersionCode", candidateVersion).apply()
            fun certificates(info: android.content.pm.PackageInfo): Set<String> {
                val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.signingInfo?.apkContentsSigners else info.signatures
                return signatures?.map { signature -> MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it) } }?.toSet() ?: emptySet()
            }
            val trusted = certificates(installed)
            val compatibleAbi = ZipFile(apk).use { zip -> Build.SUPPORTED_ABIS.any { abi -> zip.entries().asSequence().any { entry -> entry.name.startsWith("lib/$abi/") && entry.name.endsWith(".so") } } }
            candidateVersion > installedVersion && compatibleAbi && trusted.isNotEmpty() && certificates(candidate) == trusted
        }
    } catch (_: Exception) { false }
}
