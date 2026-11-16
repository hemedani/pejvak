package com.pejvak.app.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.automirrored.rounded.PlaylistAdd
import androidx.compose.material.icons.automirrored.rounded.PlaylistPlay
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.automirrored.rounded.Sort
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.AutoFixHigh
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Cloud
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.EditNote
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Explore
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Forward30
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.RecordVoiceOver
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Replay30
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material.icons.rounded.Speed
import androidx.compose.material.icons.rounded.Subtitles
import androidx.compose.material.icons.rounded.Summarize
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material.icons.rounded.Tag
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon as M3Icon
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * The single icon family (DESING.md §7). Screens ask for a semantic name; only this
 * file imports an icon set. Auto-mirrored directional glyphs stay correct under any
 * layout direction. The catalog is pinned by IconCatalogTest.
 */
val ICON_GLYPHS: Map<String, ImageVector> = mapOf(
    "play" to Icons.Rounded.PlayArrow,
    "pause" to Icons.Rounded.Pause,
    "next" to Icons.Rounded.SkipNext,
    "previous" to Icons.Rounded.SkipPrevious,
    "forward30" to Icons.Rounded.Forward30,
    "replay30" to Icons.Rounded.Replay30,
    "back" to Icons.AutoMirrored.Rounded.ArrowBack,
    "chevronLeft" to Icons.AutoMirrored.Rounded.KeyboardArrowLeft,
    "chevronRight" to Icons.AutoMirrored.Rounded.KeyboardArrowRight,
    "close" to Icons.Rounded.Close,
    "more" to Icons.Rounded.MoreVert,
    "search" to Icons.Rounded.Search,
    "settings" to Icons.Rounded.Settings,
    "add" to Icons.Rounded.Add,
    "edit" to Icons.Rounded.Edit,
    "delete" to Icons.Rounded.Delete,
    "trash" to Icons.Rounded.Delete,
    "check" to Icons.Rounded.Check,
    "share" to Icons.Rounded.Share,
    "refresh" to Icons.Rounded.Refresh,
    "sync" to Icons.Rounded.Sync,
    "download" to Icons.Rounded.Download,
    "history" to Icons.Rounded.History,
    "notes" to Icons.Rounded.EditNote,
    "note" to Icons.Rounded.EditNote,
    "tag" to Icons.Rounded.Tag,
    "time" to Icons.Rounded.Schedule,
    "timer" to Icons.Rounded.Timer,
    "sleep" to Icons.Rounded.Bedtime,
    "speed" to Icons.Rounded.Speed,
    "queue" to Icons.AutoMirrored.Rounded.QueueMusic,
    "playlist" to Icons.AutoMirrored.Rounded.PlaylistPlay,
    "addToPlaylist" to Icons.AutoMirrored.Rounded.PlaylistAdd,
    "sort" to Icons.AutoMirrored.Rounded.Sort,
    "enhancer" to Icons.Rounded.Tune,
    "volume" to Icons.AutoMirrored.Rounded.VolumeUp,
    "equalizer" to Icons.Rounded.GraphicEq,
    "ai" to Icons.Rounded.AutoAwesome,
    "sparkle" to Icons.Rounded.AutoAwesome,
    "transcribe" to Icons.Rounded.Subtitles,
    "summarize" to Icons.Rounded.Summarize,
    "audioSummary" to Icons.Rounded.RecordVoiceOver,
    "enhance" to Icons.Rounded.AutoFixHigh,
    "library" to Icons.Rounded.LibraryMusic,
    "music" to Icons.Rounded.MusicNote,
    "discover" to Icons.Rounded.Explore,
    "folder" to Icons.Rounded.Folder,
    "online" to Icons.Rounded.Cloud,
    "language" to Icons.Rounded.Language,
    "favorite" to Icons.Rounded.Favorite,
    "favoriteBorder" to Icons.Rounded.FavoriteBorder,
    "person" to Icons.Rounded.Person,
    "logout" to Icons.AutoMirrored.Rounded.Logout,
    "info" to Icons.Rounded.Info,
    "warning" to Icons.Rounded.WarningAmber,
    "error" to Icons.Rounded.ErrorOutline,
)

@Composable
fun PejvakIcon(
    name: String,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    tint: Color = LocalPejvakTokens.current.text,
    size: Dp = Dp.Unspecified,
) {
    val glyph = ICON_GLYPHS[name] ?: ICON_GLYPHS.getValue("info")
    M3Icon(
        imageVector = glyph,
        contentDescription = contentDescription,
        tint = tint,
        modifier = if (size != Dp.Unspecified) modifier.size(size) else modifier,
    )
}