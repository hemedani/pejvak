package com.pejvak.app.ui.components.field

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import com.pejvak.app.R
import com.pejvak.app.domain.TagRejectReason
import com.pejvak.app.domain.addTag
import com.pejvak.app.domain.removeTag
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.theme.AuroraRamps
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * Tag input: removable chips + an add field. Tags are Persian-folded before
 * de-duplication (كتاب and کتاب are one tag) — DESING.md §13.
 */
@Composable
fun TagInput(
    tags: List<String>,
    onTagsChange: (List<String>) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = "Tags",
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    var draft by remember { mutableStateOf("") }
    var rejectReason by remember { mutableStateOf<TagRejectReason?>(null) }

    fun submitTag() {
        val result = addTag(tags, draft)
        if (result.added) {
            onTagsChange(result.tags)
            draft = ""
            rejectReason = null
        } else {
            rejectReason = result.reason
        }
    }

    val errorText = when (rejectReason) {
        TagRejectReason.Empty -> stringResource(R.string.tag_error_empty)
        TagRejectReason.TooLong -> stringResource(R.string.tag_error_too_long)
        TagRejectReason.Duplicate -> stringResource(R.string.tag_error_duplicate)
        TagRejectReason.Limit -> stringResource(R.string.tag_error_limit)
        null -> null
    }

    androidx.compose.foundation.layout.Column(modifier = modifier) {
        if (label != null) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = tokens.textSecondary,
                modifier = Modifier.padding(bottom = geo.spacing.xs),
            )
        }
        if (tags.isNotEmpty()) {
            androidx.compose.foundation.layout.FlowRow(
                horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                verticalArrangement = Arrangement.spacedBy(geo.spacing.sm),
                modifier = Modifier.padding(bottom = geo.spacing.sm),
            ) {
                tags.forEachIndexed { index, tag ->
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(geo.radius.pill))
                            .background(tokens.glassFill)
                            .border(1.dp, tokens.glassBorder, RoundedCornerShape(geo.radius.pill))
                            .padding(horizontal = geo.spacing.md, vertical = geo.spacing.xs),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(text = tag, style = MaterialTheme.typography.bodyMedium, color = tokens.text)
                        androidx.compose.foundation.layout.Spacer(Modifier.size(geo.spacing.xs))
                        Box(
                            modifier = Modifier
                                .size(geo.icons.md)
                                .clip(CircleShape)
                                .clickable { onTagsChange(removeTag(tags, index)); rejectReason = null },
                            contentAlignment = Alignment.Center,
                        ) {
                            PejvakIcon(name = "close", contentDescription = "Remove $tag", tint = tokens.textSecondary, size = geo.icons.xs)
                        }
                    }
                }
            }
        }
        TextField(
            value = draft,
            onValueChange = { draft = it; rejectReason = null },
            placeholder = "Add a tag",
            error = errorText,
            imeAction = ImeAction.Done,
            onImeAction = { submitTag() },
            trailing = {
                Box(
                    modifier = Modifier
                        .size(geo.controls.sm)
                        .clip(CircleShape)
                        .clickable { submitTag() },
                    contentAlignment = Alignment.Center,
                ) {
                    PejvakIcon(name = "add", contentDescription = "Add tag", tint = tokens.text, size = geo.icons.md)
                }
            },
        )
    }
}

/** Annotation color picker: the aurora light stops as selectable swatches. */
@Composable
fun ColorField(
    selected: Color,
    onSelect: (Color) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = "Color",
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val swatches = AuroraRamps.map { it.third }
    androidx.compose.foundation.layout.Column(modifier = modifier) {
        if (label != null) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = tokens.textSecondary,
                modifier = Modifier.padding(bottom = geo.spacing.xs),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
            swatches.forEach { color ->
                val isSelected = color == selected
                Box(
                    modifier = Modifier
                        .size(geo.tiles.sm)
                        .clip(CircleShape)
                        .background(color)
                        .then(
                            if (isSelected) Modifier.border(2.dp, tokens.text, CircleShape)
                            else Modifier.border(1.dp, tokens.glassBorder, CircleShape),
                        )
                        .clickable { onSelect(color) },
                )
            }
        }
    }
}