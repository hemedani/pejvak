package com.pejvak.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.EmptyState
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.GlassChip
import com.pejvak.app.ui.components.HighlightedText
import com.pejvak.app.ui.components.InlineNotice
import com.pejvak.app.ui.components.NoticeTone
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.SegmentedControl
import com.pejvak.app.ui.components.SkeletonRows
import com.pejvak.app.ui.components.UserText
import com.pejvak.app.ui.components.CardRow
import com.pejvak.app.ui.components.CardSection
import com.pejvak.app.ui.components.RowDivider
import com.pejvak.app.ui.components.field.ColorField
import com.pejvak.app.ui.components.field.PasswordField
import com.pejvak.app.ui.components.field.SearchField
import com.pejvak.app.ui.components.field.TagInput
import com.pejvak.app.ui.components.field.TextArea
import com.pejvak.app.ui.components.field.TextField
import com.pejvak.app.ui.components.row.ListGroup
import com.pejvak.app.ui.components.row.ListRow
import com.pejvak.app.ui.components.row.RecordRow
import com.pejvak.app.ui.components.row.RowActions
import com.pejvak.app.ui.components.row.StatusLine
import com.pejvak.app.ui.components.row.StatusSpec
import com.pejvak.app.ui.components.row.StatusTone
import com.pejvak.app.ui.theme.AuroraRamps
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.PejvakTheme

/**
 * Dev component gallery (DESING.md; RN parity: dev field gallery). Renders every core
 * component with an independent light/dark toggle so both themes can be checked on a
 * device. Reachable from Settings → Developer in Phase 13; a debug trigger in the shell
 * opens it meanwhile.
 */
@Composable
fun GalleryScreen() {
    var dark by remember { mutableStateOf(false) }
    PejvakTheme(darkTheme = dark) {
        val tokens = LocalPejvakTokens.current
        val geo = LocalPejvakGeometry.current
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(geo.spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.xl),
        ) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Component gallery", style = MaterialTheme.typography.headlineMedium, color = tokens.text)
                SegmentedControl(
                    options = listOf("Light", "Dark"),
                    selectedIndex = if (dark) 1 else 0,
                    onSelect = { dark = it == 1 },
                    modifier = Modifier.fillMaxWidth(0.4f),
                )
            }

            Section("Surfaces") {
                GlassCard { Text("GlassCard — content is glass now.", color = tokens.text) }
                CardSection(title = "Account", footer = "A grouped section with inset dividers.") {
                    CardRow(label = "Display name", icon = "person", value = "Syd")
                    RowDivider()
                    CardRow(label = "Email", icon = "person", value = "syd@example.com")
                }
            }

            Section("Controls") {
                Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.md)) {
                    BubbleButton(icon = com.pejvak.app.ui.components.ICON_GLYPHS.getValue("play"), contentDescription = "Play", onClick = {}, filled = true)
                    BubbleButton(icon = com.pejvak.app.ui.components.ICON_GLYPHS.getValue("next"), contentDescription = "Next", onClick = {})
                    BubbleButton(icon = com.pejvak.app.ui.components.ICON_GLYPHS.getValue("history"), contentDescription = "History", onClick = {})
                }
                Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                    GlassChip(label = "All", selected = true)
                    GlassChip(label = "Local", icon = "music")
                    GlassChip(label = "Online", count = 12)
                }
                var seg by remember { mutableIntStateOf(0) }
                SegmentedControl(options = listOf("Tracks", "Folders", "Playlists"), selectedIndex = seg, onSelect = { seg = it })
            }

            Section("Fields") {
                var text by remember { mutableStateOf("") }
                TextField(value = text, onValueChange = { text = it }, label = "Email", placeholder = "you@example.com")
                var pw by remember { mutableStateOf("") }
                PasswordField(value = pw, onValueChange = { pw = it })
                var q by remember { mutableStateOf("") }
                SearchField(value = q, onValueChange = { q = it })
                var note by remember { mutableStateOf("") }
                TextArea(value = note, onValueChange = { note = it }, label = "Note", placeholder = "Write a note…")
                var tags by remember { mutableStateOf(listOf("کتاب", "تفسیر")) }
                TagInput(tags = tags, onTagsChange = { tags = it })
                var color by remember { mutableStateOf(AuroraRamps.first().third) }
                ColorField(selected = color, onSelect = { color = it })
            }

            Section("Rows") {
                ListGroup(items = listOf("Track one", "Track two", "Track three")) { item, _ ->
                    ListRow(
                        title = item,
                        subtitle = "Artist name",
                        meta = "3 plays · 2 notes",
                        actions = listOf(RowActions.play {}, RowActions.add {}, RowActions.delete {}),
                    )
                }
                RecordRow(title = "Listening stretch", meta = "4 tracks · 42 min", timestamp = "2h ago",
                    status = StatusSpec("complete", "Completed", StatusTone.Positive))
                StatusLine(spec = StatusSpec("downloading", "Downloading", StatusTone.Neutral))
            }

            Section("States") {
                EmptyState(icon = "library", title = "Nothing here yet", body = "Import audio to begin.")
                InlineNotice(message = "You're offline. Changes will sync later.", tone = NoticeTone.Warning)
                InlineNotice(message = "Couldn't load this source.", tone = NoticeTone.Danger, retryLabel = "Retry", onRetry = {})
                SkeletonRows(count = 3)
            }

            Section("Text") {
                UserText(text = "سلام دنیا — این یک متن فارسی است.", style = MaterialTheme.typography.bodyLarge)
                HighlightedText(text = "The quick brown fox", query = "brown")
            }
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.md)) {
        Text(title.uppercase(), style = MaterialTheme.typography.labelSmall, color = tokens.textSecondary)
        content()
    }
}