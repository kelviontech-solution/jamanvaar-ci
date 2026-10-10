package com.jamanvaar.apkupdater

import android.app.Activity
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

@InvokeArg
class DownloadAndInstallArgs {
    var url: String = ""
}

/**
 * Downloads an app update .apk through Android's own DownloadManager (so the download itself is
 * a real, visible system download, not a silent background mystery) and, the moment it finishes,
 * hands the file straight to the system's install prompt. One tap to confirm -- Android gives no
 * ordinary app silent-install permission, so this is the most automatic an update can be without
 * enrolling the device as Device Owner (a separate, bigger piece of work).
 */
@TauriPlugin
class ApkUpdaterPlugin(private val activity: Activity) : Plugin(activity) {
    private var downloadId: Long = -1
    private var receiver: BroadcastReceiver? = null
    private val fileName = "jamanvaar-update.apk"

    @Command
    fun downloadAndInstall(invoke: Invoke) {
        val args = invoke.parseArgs(DownloadAndInstallArgs::class.java)
        if (args.url.isBlank()) {
            invoke.reject("No download URL provided")
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

        downloadId = downloadManager.enqueue(request)
        registerCompletionReceiver(context, downloadManager)

        val result = JSObject()
        result.put("downloadId", downloadId)
        invoke.resolve(result)
    }

    private fun registerCompletionReceiver(context: Context, downloadManager: DownloadManager) {
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
                if (!succeeded) return

                val apk = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)
                if (!apk.exists()) return

                val uri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.jamanvaar.fileprovider",
                    apk
                )
                val installIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(installIntent)
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
}
