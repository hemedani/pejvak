package com.pejvak.app.data.media

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import com.pejvak.app.domain.DiscoveredFile
import com.pejvak.app.domain.deriveFolderKey
import com.pejvak.app.domain.deriveFolderKeyFromTreeUri
import com.pejvak.app.domain.folderNameFromKey
import com.pejvak.app.domain.isAudioFileName
import com.pejvak.app.domain.safDocumentName
import com.pejvak.app.domain.toEpochMillis
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Device discovery (mirrors DeviceScanService.ts). Two independent sources feed one
 * list of candidates: the Android media index ("every audio file on this phone")
 * and folders the user explicitly granted (the only source of real folder names).
 * Neither phase writes anything; enumeration is metadata only.
 */
@Singleton
class DeviceScanService @Inject constructor(
    @ApplicationContext private val context: Context,
    private val contentHashService: ContentHashService,
    private val fileIo: FileIo,
) {
    data class FolderGrant(val treeUri: String, val folderKey: String, val folderName: String)

    data class IdentifiedFile(
        val file: DiscoveredFile,
        val contentHash: String,
        val fileSizeBytes: Long,
        val tags: com.pejvak.app.domain.AudioTags,
        val picture: com.pejvak.app.domain.EmbeddedPicture?,
        val tagTruncated: Boolean,
    )

    data class IdentifyOutcome(
        val identified: List<IdentifiedFile>,
        val failed: List<Pair<DiscoveredFile, String>>,
    )

    // --- Permissions ---

    private fun audioPermission(): String =
        if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO
        else Manifest.permission.READ_EXTERNAL_STORAGE

    fun hasAudioPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, audioPermission()) == PackageManager.PERMISSION_GRANTED

    /** The permission the UI should request for a full device scan. */
    fun requiredAudioPermission(): String = audioPermission()

    // --- Media index ---

    /** Walks the whole media index. Metadata only; no file bytes are read here. */
    suspend fun enumerateDeviceAudio(onProgress: (found: Int, estimatedTotal: Int) -> Unit = { _, _ -> }): List<DiscoveredFile> =
        withContext(Dispatchers.IO) {
            val found = mutableListOf<DiscoveredFile>()
            val projection = arrayOf(
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.DATA,
                MediaStore.Audio.Media.SIZE,
                MediaStore.Audio.Media.DATE_MODIFIED,
                MediaStore.Audio.Media.DURATION,
            )
            val uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            val total = try {
                context.contentResolver.query(uri, arrayOf(MediaStore.Audio.Media._ID), null, null, null)?.use { it.count } ?: 0
            } catch (_: Exception) { 0 }

            try {
                context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
                    val idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                    val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
                    val dataCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA)
                    val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
                    val modifiedCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_MODIFIED)
                    val durationCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
                    while (cursor.moveToNext()) {
                        val id = cursor.getLong(idCol)
                        val name = cursor.getString(nameCol) ?: continue
                        val path = cursor.getString(dataCol)
                        val size = cursor.getLong(sizeCol).takeIf { it > 0 }
                        // MediaStore DATE_MODIFIED is seconds.
                        val modifiedAt = toEpochMillis(cursor.getLong(modifiedCol))
                        val durationSec = (cursor.getLong(durationCol) / 1000).toInt().coerceAtLeast(0)
                        val contentUri = Uri.withAppendedPath(uri, id.toString()).toString()
                        val folderKey = deriveFolderKey(path)
                        found.add(
                            DiscoveredFile(
                                sourceId = id.toString(),
                                uri = contentUri,
                                path = path,
                                fileName = name,
                                sizeBytes = size,
                                modifiedAt = modifiedAt,
                                durationSec = durationSec,
                                source = "mediastore",
                                folderKey = folderKey,
                                folderName = folderKey?.let { folderNameFromKey(it) },
                            ),
                        )
                        if (found.size % 50 == 0) onProgress(found.size, total)
                    }
                }
            } catch (_: Exception) {
                // A denied/empty index yields what we have; the UI explains refusal.
            }
            onProgress(found.size, total)
            found
        }

    // --- Granted folders (SAF) ---

    /** Builds a grant from a picked tree URI and persists read access across relaunch. */
    fun grantFromTreeUri(treeUri: Uri): FolderGrant? {
        return try {
            context.contentResolver.takePersistableUriPermission(treeUri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            val key = deriveFolderKeyFromTreeUri(treeUri.toString()) ?: ""
            FolderGrant(treeUri.toString(), key, folderNameFromKey(key))
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Recursively lists the audio files inside a granted folder. The root read is
     * allowed to throw (an unreadable root means "unknown", not "no audio"); a
     * subfolder failure costs only that branch.
     */
    suspend fun enumerateFolder(grant: FolderGrant, onFound: (found: Int) -> Unit = {}): List<DiscoveredFile> =
        withContext(Dispatchers.IO) {
            val found = mutableListOf<DiscoveredFile>()
            val rootUri = Uri.parse(grant.treeUri)
            val rootChildren = try {
                listChildren(rootUri)
            } catch (_: Exception) {
                throw IllegalStateException(
                    "This folder could not be read. Choose it again — Android grants access to the folder you pick, and a folder in a cloud provider has to be downloaded first.",
                )
            }
            walkChildren(rootUri, rootChildren, grant.folderKey, found, onFound)
            found
        }

    private data class SafChild(val documentUri: Uri, val documentId: String, val name: String, val isDir: Boolean, val size: Long?, val modifiedAt: Long?)

    private fun listChildren(treeUri: Uri): List<SafChild> {
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(
            treeUri, DocumentsContract.getTreeDocumentId(treeUri),
        )
        return queryChildren(childrenUri, treeUri)
    }

    private fun listSubdirectory(treeUri: Uri, documentId: String): List<SafChild>? {
        return try {
            val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, documentId)
            queryChildren(childrenUri, treeUri)
        } catch (_: Exception) {
            null
        }
    }

    private fun queryChildren(childrenUri: Uri, treeUri: Uri): List<SafChild> {
        val out = mutableListOf<SafChild>()
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
        )
        context.contentResolver.query(childrenUri, projection, null, null, null)?.use { cursor ->
            val idCol = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
            val nameCol = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
            val mimeCol = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE)
            val sizeCol = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_SIZE)
            val modifiedCol = cursor.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
            while (cursor.moveToNext()) {
                val documentId = cursor.getString(idCol) ?: continue
                val name = cursor.getString(nameCol) ?: continue
                val mime = cursor.getString(mimeCol)
                val size = if (cursor.isNull(sizeCol)) null else cursor.getLong(sizeCol).takeIf { it > 0 }
                val modifiedAt = if (cursor.isNull(modifiedCol)) null else toEpochMillis(cursor.getLong(modifiedCol))
                val documentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId)
                out.add(SafChild(documentUri, documentId, name, mime == DocumentsContract.Document.MIME_TYPE_DIR, size, modifiedAt))
            }
        }
        return out
    }

    private fun walkChildren(
        treeUri: Uri,
        children: List<SafChild>,
        folderKey: String,
        out: MutableList<DiscoveredFile>,
        onFound: (Int) -> Unit,
    ) {
        for (child in children) {
            if (child.isDir) {
                val grandChildren = listSubdirectory(treeUri, child.documentId) ?: continue
                val nextKey = if (folderKey.isNotEmpty()) "$folderKey/${child.name}" else child.name
                walkChildren(treeUri, grandChildren, nextKey, out, onFound)
                continue
            }
            if (!isAudioFileName(child.name)) continue
            out.add(
                DiscoveredFile(
                    sourceId = child.documentUri.toString(),
                    uri = child.documentUri.toString(),
                    path = null,
                    fileName = child.name,
                    sizeBytes = child.size,
                    modifiedAt = child.modifiedAt,
                    durationSec = 0,
                    source = "saf",
                    folderKey = folderKey,
                    folderName = folderNameFromKey(folderKey),
                ),
            )
            onFound(out.size)
        }
    }

    // --- Identification ---

    /**
     * Reads the files a plan marked as needing identification and returns their
     * content hashes and tags. Failures are collected per file — one unreadable
     * file must not abort a 300-file import. Three in flight keeps a large import
     * moving without starving the UI.
     */
    suspend fun identifyFiles(
        files: List<DiscoveredFile>,
        onProgress: (done: Int, total: Int) -> Unit = { _, _ -> },
        isCancelled: () -> Boolean = { false },
    ): IdentifyOutcome = withContext(Dispatchers.IO) {
        val identified = java.util.Collections.synchronizedList(mutableListOf<IdentifiedFile>())
        val failed = java.util.Collections.synchronizedList(mutableListOf<Pair<DiscoveredFile, String>>())
        val done = AtomicInteger(0)
        val semaphore = Semaphore(IDENTIFY_CONCURRENCY)

        coroutineScope {
            files.map { file ->
                async {
                    semaphore.withPermit {
                        if (isCancelled()) return@withPermit
                        try {
                            val size = file.sizeBytes ?: fileIo.fileSize(file.uri)
                            val result = contentHashService.computeFileContentHash(file.uri, size)
                            identified.add(
                                IdentifiedFile(
                                    file = file,
                                    contentHash = result.contentHash,
                                    fileSizeBytes = result.fileSizeBytes,
                                    tags = result.bundle.tags,
                                    picture = result.bundle.picture,
                                    tagTruncated = result.bundle.truncated,
                                ),
                            )
                        } catch (error: Exception) {
                            failed.add(file to (error.message ?: "unreadable"))
                        }
                        onProgress(done.incrementAndGet(), files.size)
                    }
                }
            }.awaitAll()
        }
        IdentifyOutcome(identified.toList(), failed.toList())
    }

    companion object {
        private const val IDENTIFY_CONCURRENCY = 3
    }
}