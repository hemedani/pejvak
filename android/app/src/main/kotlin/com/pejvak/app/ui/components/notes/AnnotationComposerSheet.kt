package com.pejvak.app.ui.components.notes

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.domain.ANNOTATION_COLORS
import com.pejvak.app.domain.ANNOTATION_COLOR_NAMES
import com.pejvak.app.domain.Annotation
import com.pejvak.app.domain.formatClock
import com.pejvak.app.domain.pickAnnotationColor
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.field.TagInput
import com.pejvak.app.ui.components.field.TextArea
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import kotlinx.coroutines.launch

/**
 * The note editor: text, tags, colour, and the actions that finish it. The sheet
 * owns the draft; the caller decides what "save" means (create or edit) and closes
 * it on success. A failed save stays open with the draft intact.
 */
@Composable
fun AnnotationComposerSheet(
    positionSec: Int,
    annotation: Annotation?,
    onCancel: () -> Unit,
    onSave: suspend (text: String, tags: List<String>, color: String) -> Boolean,
    initialColor: String = pickAnnotationColor(0),
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val scope = rememberCoroutineScope()
    var text by remember(annotation?.id) { mutableStateOf(annotation?.text ?: "") }
    var tags by remember(annotation?.id) { mutableStateOf(annotation?.tags ?: emptyList()) }
    var color by remember(annotation?.id) { mutableStateOf(annotation?.color ?: initialColor) }
    var saving by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    val canSave = text.trim().isNotEmpty() && !saving

    fun submit() {
        if (!canSave) return
        saving = true
        failed = false
        scope.launch {
            val saved = onSave(text.trim(), tags, color)
            saving = false
            if (!saved) failed = true
        }
    }

    GlassSheet(onDismiss = onCancel) {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(bottom = geo.spacing.xxl),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.lg),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(
                        if (annotation == null) R.string.note_composer_new else R.string.note_composer_edit,
                        formatClock(positionSec),
                    ),
                    style = MaterialTheme.typography.headlineMedium,
                    color = tokens.text,
                    modifier = Modifier.weight(1f),
                )
                BubbleButton(
                    icon = ICON_GLYPHS.getValue("close"),
                    contentDescription = stringResource(R.string.note_composer_close),
                    onClick = onCancel,
                )
            }

            TextArea(
                value = text,
                onValueChange = { text = it; failed = false },
                placeholder = stringResource(R.string.note_composer_placeholder),
                autoFocus = true,
            )

            TagInput(
                tags = tags,
                onTagsChange = { tags = it },
                label = stringResource(R.string.note_composer_tags),
            )

            Column {
                Text(
                    text = stringResource(R.string.note_composer_color),
                    style = MaterialTheme.typography.labelLarge,
                    color = tokens.textSecondary,
                    modifier = Modifier.padding(bottom = geo.spacing.xs),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
                    ANNOTATION_COLORS.forEach { hex ->
                        val swatch = colorFromHex(hex)
                        val selected = color.equals(hex, ignoreCase = true)
                        val colorName = ANNOTATION_COLOR_NAMES[hex]
                        Box(
                            modifier = Modifier
                                .size(geo.tiles.sm)
                                .clip(CircleShape)
                                .background(swatch)
                                .then(
                                    if (selected) Modifier.border(2.dp, tokens.text, CircleShape)
                                    else Modifier.border(1.dp, tokens.glassBorder, CircleShape),
                                )
                                .clickable { color = hex },
                            contentAlignment = Alignment.Center,
                        ) {
                            if (selected) {
                                PejvakIcon(
                                    name = "check",
                                    contentDescription = if (colorName != null) {
                                        stringResource(R.string.note_composer_color_option, colorName)
                                    } else {
                                        null
                                    },
                                    tint = Color.White,
                                    size = geo.icons.sm,
                                )
                            }
                        }
                    }
                }
            }

            if (failed) {
                Text(
                    text = stringResource(R.string.note_composer_failed),
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.danger,
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.lg),
            ) {
                TextButton(onClick = onCancel) {
                    Text(stringResource(R.string.note_composer_cancel), color = tokens.text)
                }
                PrimaryButton(
                    label = stringResource(
                        if (annotation == null) R.string.note_composer_save else R.string.note_composer_save_changes,
                    ),
                    onClick = ::submit,
                    enabled = canSave,
                    loading = saving,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** The fixed annotation palette as a Compose colour. */
fun colorFromHex(hex: String): Color = runCatching {
    Color(android.graphics.Color.parseColor(hex))
}.getOrDefault(Color(0xFF208AEF))
