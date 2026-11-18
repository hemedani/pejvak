package com.pejvak.app.ui.navigation

import android.net.Uri
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.EditNote
import androidx.compose.material.icons.rounded.Explore
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.pejvak.app.BuildConfig
import com.pejvak.app.R
import com.pejvak.app.ui.components.AmbientCanvas
import com.pejvak.app.ui.components.AppDock
import com.pejvak.app.ui.components.LocalSheetPresence
import com.pejvak.app.ui.components.SheetPresence
import com.pejvak.app.ui.components.wavePath
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.useMotionEnabled
import com.pejvak.app.ui.screens.GalleryScreen
import com.pejvak.app.domain.AiFeature
import com.pejvak.app.ui.screens.ai.AiCatalogSheet
import com.pejvak.app.ui.screens.ai.AiFeatureScreen
import com.pejvak.app.ui.screens.ai.AiFeatureSheet
import com.pejvak.app.ui.screens.ai.AiScreen
import com.pejvak.app.ui.screens.discover.DiscoverScreen
import com.pejvak.app.ui.screens.discover.LanguageScreen
import com.pejvak.app.ui.screens.discover.OnlineCollectionScreen
import com.pejvak.app.ui.screens.discover.SourceScreen
import com.pejvak.app.ui.screens.folder.FolderDetailScreen
import com.pejvak.app.ui.screens.history.HistoryScreen
import com.pejvak.app.ui.screens.importer.ImportScreen
import com.pejvak.app.ui.screens.library.LibraryScreen
import com.pejvak.app.ui.screens.missing.MissingScreen
import com.pejvak.app.ui.screens.notes.NotesScreen
import com.pejvak.app.ui.screens.player.NowPlayingSheet
import com.pejvak.app.ui.screens.player.PlayerViewModel
import com.pejvak.app.ui.screens.player.StandaloneMiniPlayer
import com.pejvak.app.ui.screens.playlist.PlaylistDetailScreen
import com.pejvak.app.ui.screens.settings.SettingsScreen
import com.pejvak.app.ui.screens.smart.SmartPlaylistScreen
import com.pejvak.app.ui.screens.track.TrackDetailScreen
import com.pejvak.app.domain.folderKeyToRouteSegment
import com.pejvak.app.domain.ContextType
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import kotlin.math.PI
import kotlin.math.sin

/**
 * App shell: the five dock destinations over the ambient canvas, with the glass
 * AppDock floating as a sibling of the content (DESING.md §9.5). Content owes the
 * dock `dockInset` so the last row never hides behind it.
 */
enum class Tab(val route: String, val labelRes: Int, val icon: ImageVector) {
    Library("library", R.string.tab_library, Icons.Rounded.LibraryMusic),
    History("history", R.string.tab_history, Icons.Rounded.History),
    Discover("discover", R.string.tab_discover, Icons.Rounded.Explore),
    Notes("notes", R.string.tab_notes, Icons.Rounded.EditNote),
    Ai("ai", R.string.tab_ai, Icons.Rounded.AutoAwesome),
}

@Composable
fun PejvakNavHost(modifier: Modifier = Modifier) {
    val navController = rememberNavController()
    val geo = LocalPejvakGeometry.current
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination
    val selectedRoute = Tab.entries.firstOrNull { tab ->
        currentDestination?.hierarchy?.any { it.route == tab.route } == true
    }?.route ?: Tab.Library.route
    val isTabRoute = currentDestination == null || currentDestination.route in Tab.entries.map { it.route }.toSet()
    val playerVm: PlayerViewModel = hiltViewModel()
    val mini by playerVm.mini.collectAsStateWithLifecycle()
    var playerOpen by remember { mutableStateOf(false) }
    // The AI catalogue is a sheet, not a destination: a row's AI button should open
    // the tools where the listener already is. The description sheet stacks on top
    // of it, so closing a description lands back on the list.
    var aiSheet by remember { mutableStateOf(false) }
    var aiFeature by remember { mutableStateOf<AiFeature?>(null) }
    val sheetPresence = remember { SheetPresence() }
    // Blur the shell behind the player or any open sheet so their translucent
    // surfaces read as real glass rather than a flat scrim. Sheets render in their
    // own window, so the content frosts behind them while the sheet stays crisp.
    // Modifier.blur is a no-op before API 31; NowPlayingSheet keeps its fallback.
    val backdropBlur by animateDpAsState(
        targetValue = if (playerOpen || sheetPresence.count > 0) 18.dp else 0.dp,
        animationSpec = tween(220),
        label = "playerBackdropBlur",
    )
    LaunchedEffect(playerVm) {
        playerVm.openPlayer.collect { playerOpen = true }
    }
    // The dock floats over the canvas; the content owes it exactly its measured
    // height plus the system navigation inset. Reserving the dock's tallest
    // (now-playing) height when nothing is playing leaves a dead green band.
    val navigationInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val dockHeight = geo.dock.navHeight + geo.dock.margin * 2 +
        if (mini != null) geo.dock.playerHeight else 0.dp
    val bottomInset = when {
        isTabRoute -> dockHeight + navigationInset
        mini != null -> geo.dock.playerHeight + geo.dock.margin * 2 + navigationInset
        else -> 0.dp
    }

    CompositionLocalProvider(LocalSheetPresence provides sheetPresence) {
    Box(modifier = modifier.fillMaxSize()) {
        // One swell per navigation. The route is the trigger, so pushing a detail
        // screen, popping back and switching tabs all get the same water passing
        // through instead of three different feels.
        var sweep by remember { mutableIntStateOf(0) }
        LaunchedEffect(currentDestination?.route) {
            if (currentDestination != null) sweep++
        }
        val motion = useMotionEnabled()
        Box(Modifier.fillMaxSize().blur(backdropBlur)) {
            AmbientCanvas()
            NavHost(
                navController = navController,
                startDestination = Tab.Library.route,
                enterTransition = { pageEnter(motion) },
                exitTransition = { pageExit(motion) },
                popEnterTransition = { pagePopEnter(motion) },
                popExitTransition = { pagePopExit(motion) },
                modifier = Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .padding(bottom = bottomInset),
            ) {
                composable(Tab.Library.route) {
                    LibraryScreen(
                        onOpenSettings = { navController.navigate("settings") },
                        onOpenMissing = { navController.navigate("missing") },
                        onImport = { navController.navigate("import") },
                        onOpenTrack = { id -> navController.navigate(trackRoute(id)) },
                        onOpenFolder = { key -> navController.navigate(folderRoute(key)) },
                        onOpenPlaylist = { id -> navController.navigate(playlistRoute(id)) },
                        onOpenSmart = { rule -> navController.navigate("smart/${Uri.encode(rule)}") },
                        onOpenAi = { aiSheet = true },
                        onOpenSource = { sourceId -> navController.navigate(sourceRoute(sourceId)) },
                    )
                }
                composable(Tab.Discover.route) {
                    DiscoverScreen(
                        onOpenCollection = { key, trackId, positionSec ->
                            navController.navigate(onlineCollectionRoute(key, trackId, positionSec))
                        },
                        onOpenSource = { sourceId -> navController.navigate(sourceRoute(sourceId)) },
                        onOpenLanguage = { code -> navController.navigate(languageRoute(code)) },
                    )
                }
                composable(Tab.History.route) {
                    HistoryScreen(
                        onOpenAi = { aiSheet = true },
                        onOpenCollection = { run ->
                            when (run.contextType) {
                                com.pejvak.app.domain.ContextType.Folder ->
                                    navController.navigate(folderRoute(run.contextKey))
                                com.pejvak.app.domain.ContextType.Playlist ->
                                    navController.navigate(playlistRoute(run.contextKey))
                                com.pejvak.app.domain.ContextType.Online -> navController.navigate(
                                    onlineCollectionRoute(run.contextKey, run.lastTrackId, run.lastPositionSec),
                                )
                            }
                        },
                    )
                }
                composable(Tab.Notes.route) {
                    NotesScreen(onOpenPlayer = { playerOpen = true })
                }
                composable(Tab.Ai.route) {
                    AiScreen(onOpenTool = { id -> navController.navigate("ai/tool/$id") })
                }
                composable("ai/tool/{feature}") { entry ->
                    AiFeatureScreen(
                        featureId = entry.arguments?.getString("feature"),
                        onBack = { navController.popBackStack() },
                    )
                }
                if (BuildConfig.DEBUG) {
                    composable("gallery") { GalleryScreen() }
                }
                composable("import") {
                    ImportScreen(onBack = { navController.popBackStack() })
                }
                composable("missing") {
                    MissingScreen(
                        onBack = { navController.popBackStack() },
                        onImport = { navController.navigate("import") },
                        onOpenTrack = { id -> navController.navigate(trackRoute(id)) },
                    )
                }
                composable("settings") {
                    SettingsScreen(
                        onBack = { navController.popBackStack() },
                        onOpenNotes = {
                            navController.navigate(Tab.Notes.route) {
                                popUpTo(navController.graph.startDestinationId) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        onOpenGallery = { navController.navigate("gallery") },
                    )
                }
                // Detail screens land with the rest of Phase 8.
                composable("track/{id}") {
                    TrackDetailScreen(onBack = { navController.popBackStack() })
                }
                composable("folder/{key}") {
                    FolderDetailScreen(
                        onBack = { navController.popBackStack() },
                        onOpenTrack = { id -> navController.navigate(trackRoute(id)) },
                        onOpenAi = { aiSheet = true },
                    )
                }
                composable("playlist/{id}") {
                    PlaylistDetailScreen(
                        onBack = { navController.popBackStack() },
                        onOpenTrack = { id -> navController.navigate(trackRoute(id)) },
                        onOpenAi = { aiSheet = true },
                    )
                }
                composable("online/source/{sourceId}") {
                    SourceScreen(
                        onBack = { navController.popBackStack() },
                        onOpenCollection = { key -> navController.navigate(onlineCollectionRoute(key, null, 0)) },
                    )
                }
                composable("online/language/{code}") {
                    LanguageScreen(
                        onBack = { navController.popBackStack() },
                        onOpenSource = { sourceId -> navController.navigate(sourceRoute(sourceId)) },
                    )
                }
                composable(
                    "online/{key}?trackId={trackId}&positionSec={positionSec}",
                    arguments = listOf(
                        androidx.navigation.navArgument("trackId") {
                            type = androidx.navigation.NavType.StringType
                            nullable = true
                            defaultValue = null
                        },
                        androidx.navigation.navArgument("positionSec") {
                            type = androidx.navigation.NavType.IntType
                            defaultValue = 0
                        },
                    ),
                ) {
                    OnlineCollectionScreen(
                        onBack = { navController.popBackStack() },
                        onOpenAi = { aiSheet = true },
                    )
                }
                composable("smart/{rule}") {
                    SmartPlaylistScreen(
                        onBack = { navController.popBackStack() },
                        onOpenTrack = { id -> navController.navigate(trackRoute(id)) },
                    )
                }
            }
            if (isTabRoute) {
                AppDock(
                    selectedRoute = selectedRoute,
                    onSelect = { tab -> navController.navigateTab(tab.route) },
                    nowPlaying = mini,
                    miniProgress = playerVm.miniProgress,
                    miniWaveform = playerVm.waveform,
                    onPlayPause = playerVm::toggle,
                    onNext = playerVm::next,
                    onExpand = { playerOpen = true },
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(horizontal = geo.dock.margin, vertical = geo.dock.margin)
                        .navigationBarsPadding(),
                )
            } else {
                StandaloneMiniPlayer(
                    nowPlaying = mini,
                    miniProgress = playerVm.miniProgress,
                    miniWaveform = playerVm.waveform,
                    onExpand = { playerOpen = true },
                    onPlayPause = playerVm::toggle,
                    onNext = playerVm::next,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(horizontal = geo.dock.margin, vertical = geo.dock.margin)
                        .navigationBarsPadding(),
                )
            }
        }

        WaveSweep(
            trigger = sweep,
            modifier = Modifier.fillMaxSize(),
        )

        NowPlayingSheet(
            vm = playerVm,
            visible = playerOpen,
            onDismiss = { playerOpen = false },
            onOpenAi = {
                aiSheet = true
            },
            onOpenContext = { context ->
                val route = when (context.type) {
                    ContextType.Folder -> folderRoute(context.key)
                    ContextType.Playlist -> playlistRoute(context.key)
                    ContextType.Online -> onlineCollectionRoute(context.key, null, 0)
                }
                navController.navigate(route)
            },
        )

        if (aiSheet) {
            AiCatalogSheet(
                onDismiss = {
                    aiSheet = false
                    aiFeature = null
                },
                onOpenFeature = { feature -> aiFeature = feature },
            )
        }
        val described = aiFeature
        if (described != null) {
            AiFeatureSheet(feature = described, onDismiss = { aiFeature = null })
        }
    }
    }
}

/**
 * Route builders. Every argument goes through [Uri.encode] — percent encoding, not
 * `URLEncoder`, which is a form encoder and turns a space into `+`. Navigation
 * decodes `%20` back to a space but leaves `+` alone, so a folder named
 * "Test Folder" arrived as the key "Test+Folder" and its detail screen found no
 * tracks at all. Encoding and decoding stay paired here, in one place.
 */
private fun folderRoute(key: String): String = "folder/${Uri.encode(folderKeyToRouteSegment(key))}"

private fun playlistRoute(id: String): String = "playlist/${Uri.encode(id)}"

private fun trackRoute(id: String): String = "track/${Uri.encode(id)}"

private fun sourceRoute(sourceId: String): String = "online/source/${Uri.encode(sourceId)}"

private fun languageRoute(code: String): String = "online/language/${Uri.encode(code)}"

private fun onlineCollectionRoute(key: String, trackId: String?, positionSec: Int): String {
    val track = trackId?.let { Uri.encode(it) }.orEmpty()
    return "online/${Uri.encode(key)}?trackId=$track&positionSec=$positionSec"
}

/**
 * Switch tab by route, keeping each tab's own scroll and selection: `saveState` /
 * `restoreState` on the start destination, `launchSingleTop` so re-tapping the
 * current tab does not stack a duplicate. One place, because the dock and the
 * swipe gesture must behave identically.
 */
private fun NavHostController.navigateTab(route: String) {
    navigate(route) {
        popUpTo(graph.startDestinationId) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

/**
 * Page transitions in the app's own vocabulary: the outgoing page sinks and thins
 * out while the incoming one rises into place, so navigating reads as water moving
 * rather than as two rectangles swapping. Forward and back are mirror images, and
 * the scale is deliberately small — enough to suggest depth, never enough to make
 * text swim while it settles.
 */
private fun AnimatedContentTransitionScope<NavBackStackEntry>.pageEnter(motion: Boolean): EnterTransition =
    if (!motion) {
        EnterTransition.None
    } else {
        fadeIn(tween(260)) +
            slideInVertically(tween(360, easing = FastOutSlowInEasing)) { it / 12 } +
            scaleIn(tween(360, easing = FastOutSlowInEasing), initialScale = 0.975f)
    }

private fun AnimatedContentTransitionScope<NavBackStackEntry>.pageExit(motion: Boolean): ExitTransition =
    if (!motion) {
        ExitTransition.None
    } else {
        fadeOut(tween(180)) +
            slideOutVertically(tween(300, easing = FastOutSlowInEasing)) { -it / 20 } +
            scaleOut(tween(300, easing = FastOutSlowInEasing), targetScale = 0.985f)
    }

private fun AnimatedContentTransitionScope<NavBackStackEntry>.pagePopEnter(motion: Boolean): EnterTransition =
    if (!motion) {
        EnterTransition.None
    } else {
        fadeIn(tween(240)) +
            slideInVertically(tween(320, easing = FastOutSlowInEasing)) { -it / 20 } +
            scaleIn(tween(320, easing = FastOutSlowInEasing), initialScale = 0.985f)
    }

private fun AnimatedContentTransitionScope<NavBackStackEntry>.pagePopExit(motion: Boolean): ExitTransition =
    if (!motion) {
        ExitTransition.None
    } else {
        fadeOut(tween(200)) +
            slideOutVertically(tween(300, easing = FastOutSlowInEasing)) { it / 12 } +
            scaleOut(tween(300, easing = FastOutSlowInEasing), targetScale = 0.985f)
    }

/**
 * The swell that crosses the screen once per navigation.
 *
 * Two crests — the second fainter and lagging — travel from the top edge to the
 * bottom while fading in and out at the ends, so the change of page happens *behind*
 * a ripple instead of being a hard cut. Purely decorative: it draws no input, and it
 * disappears completely (no composition work at all) when motion is off.
 */
@Composable
private fun WaveSweep(trigger: Int, modifier: Modifier = Modifier) {
    val tokens = LocalPejvakTokens.current
    val motion = useMotionEnabled()
    val sweep = remember { Animatable(0f) }
    LaunchedEffect(trigger) {
        if (trigger <= 0 || !motion) return@LaunchedEffect
        sweep.snapTo(0f)
        sweep.animateTo(1f, tween(640, easing = LinearEasing))
    }
    val eased = sweep.value
    if (!motion || eased <= 0f || eased >= 1f) return
    Canvas(modifier) {
        val y = size.height * eased
        val fade = sin(eased * PI).toFloat()
        val wavelength = 88.dp.toPx()
        listOf(
            Triple(0f, 7.dp.toPx(), 0.34f),
            Triple(-26.dp.toPx(), 4.dp.toPx(), 0.16f),
        ).forEach { (lag, amplitude, alpha) ->
            drawPath(
                path = wavePath(
                    from = 0f,
                    to = size.width,
                    cy = y + lag,
                    amplitude = amplitude,
                    wavelength = wavelength,
                    phase = eased * 3.4f,
                    taper = 28.dp.toPx(),
                    variation = 0.4f,
                ),
                color = tokens.accent.copy(alpha = alpha * fade),
                style = Stroke(width = 1.6.dp.toPx(), cap = StrokeCap.Round),
            )
        }
    }
}
