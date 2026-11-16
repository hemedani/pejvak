package com.pejvak.app.ui.components.field

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.pejvak.app.ui.components.PejvakIcon
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import kotlinx.coroutines.delay

/**
 * The one field primitive (DESING.md §9.3): an inset track (one step below its card),
 * opaque enough to stay legible, with a visible label above, a 2 dp accent focus ring
 * and a danger ring when invalid. Screens never use a raw text input.
 */
@Composable
fun TextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String? = null,
    error: String? = null,
    leadingIcon: String? = null,
    trailing: @Composable (() -> Unit)? = null,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    autoFocus: Boolean = false,
    enabled: Boolean = true,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    onImeAction: () -> Unit = {},
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    var focused by remember { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(autoFocus) {
        if (autoFocus) {
            // The sheet is still animating in on first composition; requesting focus
            // immediately can be dropped before the field has a window.
            delay(120)
            runCatching { focusRequester.requestFocus() }
        }
    }
    val shape = RoundedCornerShape(geo.radius.md)
    val ringColor = when {
        error != null -> tokens.danger
        focused -> tokens.accent
        else -> tokens.glassBorder
    }
    val ringWidth = if (focused || error != null) 2.dp else 1.dp

    Column(modifier = modifier.fillMaxWidth()) {
        if (label != null) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = tokens.textSecondary,
                modifier = Modifier.padding(bottom = geo.spacing.xs),
            )
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            enabled = enabled,
            singleLine = singleLine,
            minLines = minLines,
            maxLines = maxLines,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = tokens.text),
            cursorBrush = SolidColor(tokens.accent),
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction),
            keyboardActions = KeyboardActions(onAny = { onImeAction() }),
            visualTransformation = visualTransformation,
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(focusRequester)
                .onFocusChanged { focused = it.isFocused },
            decorationBox = { inner ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(tokens.glassFill, shape)
                        .border(ringWidth, ringColor, shape)
                        .padding(horizontal = geo.spacing.md, vertical = geo.spacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (leadingIcon != null) {
                        PejvakIcon(
                            name = leadingIcon,
                            contentDescription = null,
                            tint = tokens.textTertiary,
                            size = geo.icons.md,
                        )
                        androidx.compose.foundation.layout.Spacer(
                            Modifier.padding(start = geo.spacing.sm),
                        )
                    }
                    Box(Modifier.weight(1f)) {
                        if (value.isEmpty() && placeholder != null) {
                            Text(
                                text = placeholder,
                                style = MaterialTheme.typography.bodyLarge,
                                color = tokens.textTertiary,
                            )
                        }
                        inner()
                    }
                    if (trailing != null) {
                        androidx.compose.foundation.layout.Spacer(Modifier.padding(start = geo.spacing.sm))
                        trailing()
                    }
                }
            },
        )
        if (error != null) {
            Text(
                text = error,
                style = MaterialTheme.typography.bodySmall,
                color = tokens.danger,
                modifier = Modifier.padding(top = geo.spacing.xs),
            )
        }
    }
}