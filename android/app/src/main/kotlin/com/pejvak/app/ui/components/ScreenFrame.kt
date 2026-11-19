package com.pejvak.app.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import dev.chrisbanes.haze.hazeSource
import androidx.compose.ui.unit.Dp
import com.pejvak.app.ui.theme.LocalPejvakGeometry

/**
 * Wraps a screen with the floating [GlassHeader] and tells the body exactly how much
 * top padding the header occupies. The header is a sibling of the body — so it is
 * crisp and can sample the body with Haze — and the body scrolls behind it.
 */
@Composable
fun ScreenFrame(
    modifier: Modifier = Modifier,
    header: @Composable (Modifier) -> Unit,
    content: @Composable (topInset: Dp) -> Unit,
) {
    val geo = LocalPejvakGeometry.current
    val density = LocalDensity.current
    val haze = LocalHazeState.current
    val statusTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    var headerHeight by remember {
        mutableStateOf(statusTop + geo.header.minHeight + geo.header.margin * 2)
    }
    Box(modifier.fillMaxSize()) {
        // The Haze source wraps the body; the shell's modal blur lives on an ancestor
        // of this node, never on the source node itself.
        Box(
            Modifier
                .fillMaxSize()
                .then(if (haze != null) Modifier.hazeSource(haze) else Modifier),
        ) {
            content(headerHeight)
        }
        header(
            Modifier
                .align(Alignment.TopCenter)
                .onGloballyPositioned { coords ->
                    if (coords.size.height > 0) {
                        headerHeight = with(density) { coords.size.height.toDp() }
                    }
                },
        )
    }
}
