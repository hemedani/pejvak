package com.pejvak.app.core

import android.content.Context
import android.os.Build
import com.pejvak.app.BuildConfig
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Keeps the last uncaught exception on disk so it can be sent on without a
 * computer, a cable or `adb`.
 *
 * A release build is sealed, so a crash on a phone otherwise leaves only a system
 * dialog that disappears; the owner's workflow was photographing that dialog. The
 * handler writes the same stack to `files/crashes/last-crash.txt`, the app
 * survives the report long enough to finish the write, and Settings → Diagnostics
 * shares the file.
 *
 * Deliberately tiny: it records, it never interprets, and it never swallows the
 * crash — the previous handler still runs, so the platform's own reporting is
 * unchanged.
 */
object CrashLog {

    private const val DIR = "crashes"
    private const val LATEST = "last-crash.txt"
    private const val KEEP = 5

    /** The file the share sheet hands out; null when nothing has crashed yet. */
    fun latest(context: Context): File? =
        File(dir(context), LATEST).takeIf { it.isFile && it.length() > 0 }

    /** Every crash still on disk, newest first. Excludes the [latest] copy. */
    fun history(context: Context): List<File> =
        dir(context).listFiles { file -> file.isFile && file.name.startsWith("crash-") }
            ?.sortedByDescending { it.lastModified() }
            .orEmpty()

    /** One line for a settings row: "18 Nov 09:12 · IllegalArgumentException". */
    fun summary(context: Context): String? {
        val file = latest(context) ?: return null
        val headline = runCatching { file.readLines().firstOrNull { it.startsWith("exception: ") } }
            .getOrNull()
            ?.removePrefix("exception: ")
            ?.substringBefore(':')
            ?.substringAfterLast('.')
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: return null
        val when_ = SimpleDateFormat("d MMM HH:mm", Locale.US).format(Date(file.lastModified()))
        return "$when_ · $headline"
    }

    fun clear(context: Context) {
        dir(context).listFiles()?.forEach { it.delete() }
    }

    /**
     * Installs the handler. Call once, from [com.pejvak.app.PejvakApp.onCreate] —
     * before anything else can throw.
     */
    fun install(context: Context) {
        val app = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            // Never let the reporter be the reason a crash goes unreported.
            runCatching { write(app, thread, error) }
            previous?.uncaughtException(thread, error)
        }
    }

    private fun write(context: Context, thread: Thread, error: Throwable) {
        val directory = dir(context)
        if (!directory.isDirectory && !directory.mkdirs()) return
        val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
        val body = buildString {
            appendLine("Pejvak crash report")
            appendLine("time: ${SimpleDateFormat("yyyy-MM-dd HH:mm:ss Z", Locale.US).format(Date())}")
            appendLine("version: ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}) ${if (BuildConfig.DEBUG) "debug" else "release"}")
            appendLine("device: ${Build.MANUFACTURER} ${Build.MODEL} / Android ${Build.VERSION.RELEASE} (sdk ${Build.VERSION.SDK_INT})")
            appendLine("thread: ${thread.name}")
            appendLine("exception: ${error.javaClass.name}: ${error.message}")
            appendLine()
            appendLine(error.stackTraceToString())
        }
        // Write beside the target and copy, so a half-written file is never the
        // one that gets read back.
        val temporary = File(directory, "$stamp.tmp")
        temporary.writeText(body)
        temporary.copyTo(File(directory, LATEST), overwrite = true)
        temporary.renameTo(File(directory, "crash-$stamp.txt"))
        history(context).drop(KEEP).forEach { it.delete() }
    }

    private fun dir(context: Context): File = File(context.filesDir, DIR)
}
