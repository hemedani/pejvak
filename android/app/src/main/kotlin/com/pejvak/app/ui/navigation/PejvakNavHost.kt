package com.pejvak.app.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.EditNote
import androidx.compose.material.icons.rounded.Explore
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.pejvak.app.BuildConfig
import com.pejvak.app.R
import com.pejvak.app.ui.components.AmbientCanvas
import com.pejvak.app.ui.components.AppDock
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.screens.GalleryScreen
import com.pejvak.app.ui.screens.ai.AiFeatureScreen
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
import com.pejvak.app.ui.theme.LocalPejvakGeometry

/**
 * App shell: the five dock destinations over the ambient canvas, with the glass
 * AppDock floating as a sibling of the content (DESING.md §9.5). Content owes the
 * dock `dockInset` so the last row never hides behind it.
 */
enum class Tab(val route: String, val labelRes: Int, val icon: ImageVector) {
    Library("library", R.string.tab_library, Icons.Rounded.LibraryMusic),
    Discover("discover", R.string.tab_discover, Icons.Rounded.Explore),
    History("history", R.string.tab_history, Icons.Rounded.History),
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
    val bottomInset = when {
        isTabRoute -> geo.dock.dockInset
        mini != null -> geo.dock.playerHeight + geo.dock.margin * 2
        else -> 0.dp
    }

    Box(modifier = modifier.fillMaxSize()) {
        AmbientCanvas()
        NavHost(
            navController = navController,
            startDestination = Tab.Library.route,
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = bottomInset),
        ) {
            composable(Tab.Library.route) {
                LibraryScreen(
                    onOpenSettings = { navController.navigate("settings") },
                    onOpenMissing = { navController.navigate("missing") },
                    onImport = { navController.navigate("import") },
                    onOpenTrack = { id -> navController.navigate("track/$id") },
                    onOpenFolder = { key ->
                        navController.navigate(
                            "folder/${java.net.URLEncoder.encode(folderKeyToRouteSegment(key), "UTF-8")}",
                        )
                    },
                    onOpenPlaylist = { id -> navController.navigate("playlist/$id") },
                    onOpenSmart = { rule -> navController.navigate("smart/$rule") },
                    onOpenAi = { navController.navigate(Tab.Ai.route) },
                )
            }
            composable(Tab.Discover.route) {
                DiscoverScreen(
                    onOpenCollection = { key, trackId, positionSec ->
                        navController.navigate(onlineCollectionRoute(key, trackId, positionSec))
                    },
                    onOpenSource = { sourceId -> navController.navigate("online/source/$sourceId") },
                    onOpenLanguage = { code -> navController.navigate("online/language/$code") },
                )
            }
            composable(Tab.History.route) {
                HistoryScreen(
                    onOpenAi = { navController.navigate(Tab.Ai.route) },
                    onOpenCollection = { run ->
                        when (run.contextType) {
                            com.pejvak.app.domain.ContextType.Folder -> navController.navigate(
                                "folder/${java.net.URLEncoder.encode(
                                    folderKeyToRouteSegment(run.contextKey),
                                    "UTF-8",
                                )}",
                            )
                            com.pejvak.app.domain.ContextType.Playlist ->
                                navController.navigate("playlist/${run.contextKey}")
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
                    onOpenTrack = { id -> navController.navigate("track/$id") },
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
                    onOpenTrack = { id -> navController.navigate("track/$id") },
                    onOpenAi = { navController.navigate(Tab.Ai.route) },
                )
            }
            composable("playlist/{id}") {
                PlaylistDetailScreen(
                    onBack = { navController.popBackStack() },
                    onOpenTrack = { id -> navController.navigate("track/$id") },
                    onOpenAi = { navController.navigate(Tab.Ai.route) },
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
                    onOpenSource = { sourceId -> navController.navigate("online/source/$sourceId") },
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
                    onOpenAi = { navController.navigate(Tab.Ai.route) },
                )
            }
            composable("smart/{rule}") {
                SmartPlaylistScreen(
                    onBack = { navController.popBackStack() },
                    onOpenTrack = { id -> navController.navigate("track/$id") },
                )
            }
        }
        if (isTabRoute) {
            AppDock(
                selectedRoute = selectedRoute,
                onSelect = { tab ->
                    navController.navigate(tab.route) {
                        popUpTo(navController.graph.startDestinationId) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                nowPlaying = mini,
                onPlayPause = playerVm::toggle,
                onNext = playerVm::next,
                onExpand = { playerOpen = true },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(horizontal = geo.dock.margin, vertical = geo.dock.margin),
            )
        } else {
            StandaloneMiniPlayer(
                nowPlaying = mini,
                onExpand = { playerOpen = true },
                onPlayPause = playerVm::toggle,
                onNext = playerVm::next,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(horizontal = geo.dock.margin, vertical = geo.dock.margin),
            )
        }
        // Settings is a real destination (account, sync, sign out). The debug
        // entries below it are temporary entry points for screens whose own
        // headers/actions land with their phases (Library header, Phase 8).
        if (currentDestination?.route !in setOf("gallery", "import", "missing", "settings", Tab.Library.route)) {
            androidx.compose.foundation.layout.Column(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(geo.spacing.lg),
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(geo.spacing.sm),
                horizontalAlignment = Alignment.End,
            ) {
                BubbleButton(
                    icon = ICON_GLYPHS.getValue("settings"),
                    contentDescription = stringResource(R.string.settings_title),
                    onClick = { navController.navigate("settings") },
                )
                if (BuildConfig.DEBUG) {
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("equalizer"),
                        contentDescription = "Component gallery",
                        onClick = { navController.navigate("gallery") },
                    )
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("add"),
                        contentDescription = "Import audio",
                        onClick = { navController.navigate("import") },
                    )
                    BubbleButton(
                        icon = ICON_GLYPHS.getValue("warning"),
                        contentDescription = "Missing files",
                        onClick = { navController.navigate("missing") },
                    )
                }
            }
        }

        NowPlayingSheet(
            vm = playerVm,
            visible = playerOpen,
            onDismiss = { playerOpen = false },
            onOpenAi = {
                navController.navigate(Tab.Ai.route) {
                    popUpTo(navController.graph.startDestinationId) { saveState = true }
                    launchSingleTop = true
                    restoreState = true
                }
            },
            onOpenContext = {
                navController.navigate(Tab.Library.route) {
                    popUpTo(navController.graph.startDestinationId) { saveState = true }
                    launchSingleTop = true
                    restoreState = true
                }
            },
        )
    }
}

private fun onlineCollectionRoute(key: String, trackId: String?, positionSec: Int): String {
    val encoded = java.net.URLEncoder.encode(key, "UTF-8")
    val track = trackId?.let { java.net.URLEncoder.encode(it, "UTF-8") }
    return "online/$encoded?trackId=${track.orEmpty()}&positionSec=$positionSec"
}
