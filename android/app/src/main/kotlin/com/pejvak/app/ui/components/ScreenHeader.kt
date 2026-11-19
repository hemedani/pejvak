package com.pejvak.app.ui.components

import androidx.activity.compose.BackHandler
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.core.HapticIntent
import com.pejvak.app.core.rememberHaptics
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.useMotionEnabled
import kotlinx.coroutines.delay

/** A search state owned by the screen's view model; the header only expands it. */
@Immutable
data class HeaderSearch(
    val value: String,
    val onValueChange: (String) -> Unit,
    val placeholder: String,
)

/**
 * The one screen header (plan 02 §4): a floating, heavy-frost capsule pinned at the
 * top, owning the status-bar inset. Anatomy:
 *
 * `[leading bubble] [overline + title] [weight] [ActionCluster]`
 *
 * Where a screen has search, the trailing search bubble morphs the whole capsule
 * into an inline field; the query and its results stay in the view model, so
 * collapsing keeps the results.
 */
@Composable
fun GlassHeader(
    title: String,
    modifier: Modifier = Modifier,
    overline: String? = null,
    subtitle: String? = null,
    userTitle: Boolean = false,
    leading: (@Composable () -> Unit)? = null,
    search: HeaderSearch? = null,
    actions: (@Composable RowScope.() -> Unit)? = null,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val motion = useMotionEnabled()
    val haptics = rememberHaptics()
    var expanded by rememberSaveable { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current

    fun openSearch() {
        haptics.trigger(HapticIntent.Select)
        expanded = true
    }

    fun closeSearch() {
        haptics.trigger(HapticIntent.Tap)
        expanded = false
    }

    LaunchedEffect(expanded) {
        if (expanded) {
            delay(80)
            runCatching { focus.requestFocus() }
            keyboard?.show()
        } else {
            focusManager.clearFocus()
            keyboard?.hide()
        }
    }
    BackHandler(enabled = expanded) { closeSearch() }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = geo.header.margin, vertical = geo.header.margin)
            .then(
                if (motion) {
                    Modifier.animateContentSize(
                        animationSpec = spring(
                            dampingRatio = Spring.DampingRatioNoBouncy,
                            stiffness = Spring.StiffnessMediumLow,
                        ),
                    )
                } else {
                    Modifier
                },
            ),
    ) {
        FrostedSurface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(geo.radius.xl),
        ) {
            val content: @Composable (Boolean) -> Unit = { isExpanded ->
                if (isExpanded && search != null) {
                    SearchCapsule(
                        search = search,
                        focus = focus,
                        onClose = { closeSearch() },
                    )
                } else {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = geo.header.minHeight)
                            .padding(horizontal = geo.header.contentPadding, vertical = geo.spacing.md),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
                    ) {
                        if (leading != null) {
                            leading()
                        }
                        Column(Modifier.weight(1f)) {
                            if (overline != null) {
                                Text(
                                    text = overline.uppercase(),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = tokens.textSecondary,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            if (userTitle) {
                                UserText(
                                    text = title,
                                    style = MaterialTheme.typography.titleLarge,
                                    color = tokens.text,
                                    maxLines = 1,
                                )
                            } else {
                                Text(
                                    text = title,
                                    style = MaterialTheme.typography.titleLarge,
                                    color = tokens.text,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            if (subtitle != null) {
                                Text(
                                    text = subtitle,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = tokens.textSecondary,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                        if (actions != null || search != null) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(geo.spacing.xs),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                actions?.invoke(this)
                                if (search != null) {
                                    BubbleButton(
                                        icon = ICON_GLYPHS.getValue("search"),
                                        contentDescription = stringResource(R.string.header_search),
                                        onClick = { openSearch() },
                                        size = geo.controls.md,
                                    )
                                }
                            }
                        }
                    }
                }
            }
            if (motion) {
                Crossfade(targetState = expanded, animationSpec = tween(220), label = "headerSearch") { isExpanded ->
                    content(isExpanded)
                }
            } else {
                content(expanded)
            }
        }
    }
}

@Composable
private fun SearchCapsule(
    search: HeaderSearch,
    focus: FocusRequester,
    onClose: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = geo.header.minHeight)
            .padding(start = geo.header.contentPadding, end = geo.spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(geo.spacing.sm),
    ) {
        PejvakIcon(
            name = "search",
            contentDescription = null,
            tint = tokens.textSecondary,
            size = geo.icons.md,
        )
        Box(Modifier.weight(1f)) {
            if (search.value.isEmpty()) {
                Text(
                    text = search.placeholder,
                    style = MaterialTheme.typography.bodyLarge,
                    color = tokens.textTertiary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            BasicTextField(
                value = search.value,
                onValueChange = search.onValueChange,
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = tokens.text),
                cursorBrush = SolidColor(tokens.accent),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Text,
                    imeAction = ImeAction.Search,
                ),
                keyboardActions = KeyboardActions(onSearch = { onClose() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus),
            )
        }
        if (search.value.isNotEmpty()) {
            BubbleButton(
                icon = ICON_GLYPHS.getValue("close"),
                contentDescription = stringResource(R.string.header_clear_search),
                onClick = { search.onValueChange("") },
                size = geo.controls.sm,
            )
        }
        BubbleButton(
            icon = ICON_GLYPHS.getValue("close"),
            contentDescription = stringResource(R.string.header_close_search),
            onClick = onClose,
            size = geo.controls.sm,
        )
    }
}
