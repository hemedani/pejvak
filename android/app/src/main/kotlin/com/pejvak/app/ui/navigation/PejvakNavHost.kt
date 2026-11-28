package com.pejvak.app.ui.navigation

import android.net.Uri
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
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
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
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
import com.pejvak.app.domain.AiFeature
import com.pejvak.app.domain.AccountButtonState
import com.pejvak.app.domain.ContextType
import com.pejvak.app.domain.accountButtonState
import com.pejvak.app.domain.folderKeyToRouteSegment
import com.pejvak.app.domain.glyphKey
import com.pejvak.app.domain.needsAttention
import com.pejvak.app.ui.components.AmbientCanvas
import com.pejvak.app.ui.components.AppDock
import com.pejvak.app.ui.components.BubbleButton
import com.pejvak.app.ui.components.ICON_GLYPHS
import com.pejvak.app.ui.components.LocalBackdrop
import com.pejvak.app.ui.components.LocalSheetPresence
import com.pejvak.app.ui.components.LocalShellInsets
import com.pejvak.app.ui.components.SheetPresence
import com.pejvak.app.ui.components.ShellInsets
import com.pejvak.app.ui.components.backdropSource
import com.pejvak.app.ui.components.drawWaveWake
import com.pejvak.app.ui.components.rememberBackdrop
import com.pejvak.app.ui.components.waveOffsetAt
import com.pejvak.app.ui.components.wavePath
import com.pejvak.app.ui.screens.GalleryScreen
import com.pejvak.app.ui.screens.ai.AiCatalogSheet
import com.pejvak.app.ui.screens.ai.AiFeatureScreen
import com.pejvak.app.ui.screens.ai.AiFeatureSheet
import com.pejvak.app.ui.screens.ai.AiScreen
import com.pejvak.app.ui.screens.auth.AccountSheet
import com.pejvak.app.ui.screens.auth.AuthSheet
import com.pejvak.app.ui.screens.auth.AuthViewModel
import com.pejvak.app.ui.screens.channels.ChannelDetailScreen
import com.pejvak.app.ui.screens.channels.ChannelEditorSheet
import com.pejvak.app.ui.screens.channels.ChannelCreatorViewModel
import com.pejvak.app.ui.screens.channels.ChannelManageScreen
import com.pejvak.app.ui.screens.channels.ChannelUploadScreen
import com.pejvak.app.ui.screens.channels.ChannelsScreen
import com.pejvak.app.ui.screens.channels.MyChannelsScreen
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
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens
import com.pejvak.app.ui.theme.RampCyan
import com.pejvak.app.ui.theme.useMotionEnabled
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
fun PejvakNavHost(
    modifier: Modifier = Modifier,
    authViewModel: AuthViewModel = hiltViewModel(),
    authState: AuthViewModel.UiState = AuthViewModel.UiState(),
) {
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
    // When the player's context chip opens a collection screen, the full player must
    // collapse to reveal it. Remember the entry we left so returning to it re-expands
    // the player instead of leaving the listener on the mini-player.
    var reopenPlayerBackStackId by remember { mutableStateOf<String?>(null) }
    // The AI catalogue is a sheet, not a destination: a row's AI button should open
    // the tools where the listener already is. The description sheet stacks on top
    // of it, so closing a description lands back on the list.
    var aiSheet by remember { mutableStateOf(false) }
    var aiFeature by remember { mutableStateOf<AiFeature?>(null) }
    // The home-screen auth button opens one of two sheets by session state: the register/login
    // modal when signed out, the account + sync sheet when signed in. It floats over the app.
    var accountSheet by remember { mutableStateOf(false) }
    // Channel creator: one shared, activity-scoped editor form (create from the hub, edit from
    // a channel) hosted as a shell sibling so it floats over the app like the AI / auth sheets.
    // A signed-out tap routes to AuthSheet instead (prompt D4) — never a hard gate.
    val creatorViewModel: ChannelCreatorViewModel = hiltViewModel()
    var channelEditor by remember { mutableStateOf(false) }
    val signedIn = authState.status == AuthViewModel.Status.Authenticated
    val accountState = accountButtonState(
        signedIn = authState.status == AuthViewModel.Status.Authenticated,
        pendingTotal = authState.pendingTotal,
    )
    // UX-C01: one create-channel action shared by every dock page's header. A signed-out
    // tap routes to AuthSheet instead of gating (prompt D4 of plan 07).
    val startCreateChannel: () -> Unit = {
        if (signedIn) {
            creatorViewModel.startCreate()
            channelEditor = true
        } else {
            accountSheet = true
        }
    }
    val sheetPresence = remember { SheetPresence() }
    var playerExpandProgress by remember { mutableFloatStateOf(0f) }
    var miniPlayerRect by remember { mutableStateOf<Rect?>(null) }
    // One recorded backdrop for the whole shell: each screen marks its scroll body as
    // the source, and the header/dock draw it back blurred. The chrome lives outside
    // the source node so it can never sample itself.
    val backdrop = rememberBackdrop()
    // Blur the shell behind the player or any open sheet so their translucent
    // surfaces read as real glass rather than a flat scrim. Synchronizing with
    // `playerExpandProgress` unblurs the shell smoothly as the player shrinks
    // back onto the mini-player.
    // Modifier.blur is a no-op before API 31; NowPlayingSheet keeps its fallback.
    val sheetBackdropBlur by animateDpAsState(
        targetValue = if (sheetPresence.count > 0) geo.frost.backdrop else 0.dp,
        animationSpec = tween(220),
        label = "sheetBackdropBlur",
    )
    val backdropBlur = maxOf(sheetBackdropBlur, geo.frost.backdrop * playerExpandProgress)
    LaunchedEffect(playerVm) {
        playerVm.openPlayer.collect { playerOpen = true }
    }
    // Returning to the entry we left when the context chip opened a collection
    // re-expands the full player (the collapse was only ever to reveal the collection).
    LaunchedEffect(backStackEntry?.id) {
        val id = backStackEntry?.id
        if (reopenPlayerBackStackId != null && id == reopenPlayerBackStackId) {
            playerOpen = true
            reopenPlayerBackStackId = null
        }
    }
    // The dock floats over the canvas; its clearance is measured, not assumed. The
    // seed value only covers the first frame before layout reports the real height.
    val navigationInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    var dockClearance by remember {
        mutableStateOf(geo.dock.dockInset + navigationInset)
    }
    val density = LocalDensity.current

    CompositionLocalProvider(
        LocalSheetPresence provides sheetPresence,
        LocalBackdrop provides backdrop,
        LocalShellInsets provides ShellInsets(bottom = dockClearance),
    ) {
        Box(modifier = modifier.fillMaxSize()) {
            // One directional swell per navigation: lateral drift across dock tabs, buoyant
            // rise when diving into a detail screen, and gentle descent when surfacing back.
            var previousBackStackId by remember { mutableStateOf<String?>(null) }
            var previousRoute by remember { mutableStateOf<String?>(null) }
            var sweep by remember { mutableIntStateOf(0) }
            var navKind by remember { mutableStateOf<NavWaveKind>(NavWaveKind.Push) }
            LaunchedEffect(backStackEntry?.id) {
                val entry = backStackEntry ?: return@LaunchedEffect
                val toRoute = entry.destination.route
                if (previousBackStackId == null) {
                    previousBackStackId = entry.id
                    previousRoute = toRoute
                    return@LaunchedEffect
                }
                if (entry.id != previousBackStackId) {
                    val fromRoute = previousRoute
                    val fromTab = tabOrderIndex(fromRoute)
                    val toTab = tabOrderIndex(toRoute)
                    navKind = when {
                        fromTab >= 0 && toTab >= 0 && fromTab != toTab ->
                            NavWaveKind.TabDrift(if (toTab > fromTab) 1 else -1)

                        fromTab >= 0 && toTab < 0 -> NavWaveKind.Push
                        fromTab < 0 && toTab >= 0 -> NavWaveKind.Pop
                        navController.previousBackStackEntry?.destination?.route == fromRoute -> NavWaveKind.Push
                        else -> NavWaveKind.Pop
                    }
                    previousBackStackId = entry.id
                    previousRoute = toRoute
                    sweep++
                }
            }
            val (canvasShiftX, canvasShiftY) = when (val k = navKind) {
                is NavWaveKind.TabDrift -> (if (k.dir >= 0) -1f else 1f) to -0.25f
                NavWaveKind.Push -> 0.25f to -1f
                NavWaveKind.Pop -> -0.25f to 1f
            }
            val motion = useMotionEnabled()
            val modalOpen = backdropBlur > 0.dp
            backdrop.paused = modalOpen
            Box(
                Modifier
                    .fillMaxSize()
                    .then(if (modalOpen) Modifier.blur(backdropBlur) else Modifier),
            ) {
                AmbientCanvas(
                    modifier = Modifier.backdropSource(backdrop, zIndex = 0f),
                    navTrigger = sweep,
                    navShiftX = canvasShiftX,
                    navShiftY = canvasShiftY,
                )
                NavHost(
                    navController = navController,
                    startDestination = Tab.Library.route,
                    enterTransition = {
                        oceanEnter(
                            motion,
                            initialState.destination.route,
                            targetState.destination.route
                        )
                    },
                    exitTransition = {
                        oceanExit(
                            motion,
                            initialState.destination.route,
                            targetState.destination.route
                        )
                    },
                    popEnterTransition = {
                        oceanPopEnter(
                            motion,
                            initialState.destination.route,
                            targetState.destination.route
                        )
                    },
                    popExitTransition = {
                        oceanPopExit(
                            motion,
                            initialState.destination.route,
                            targetState.destination.route
                        )
                    },
                    modifier = Modifier.fillMaxSize(),
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
                            onOpenAccount = { accountSheet = true },
                            onOpenChannel = { slug -> navController.navigate(channelRoute(slug)) },
                            onCreateChannel = startCreateChannel,
                            accountGlyph = accountState.glyphKey(),
                            accountAttention = accountState.needsAttention(),
                            accountLabelRes = when (accountState) {
                                AccountButtonState.NeedsSignIn -> R.string.home_account_needs_sign_in
                                AccountButtonState.Queued -> R.string.home_account_queued
                                AccountButtonState.UpToDate -> R.string.home_account_up_to_date
                            },
                            // UX-H06: once everything is on the server the account/sync bubble
                            // adds nothing; the create action stays.
                            showAccountButton = accountState != AccountButtonState.UpToDate,
                        )
                    }
                    composable(Tab.Discover.route) {
                        DiscoverScreen(
                            onOpenCollection = { key, trackId, positionSec ->
                                navController.navigate(onlineCollectionRoute(key, trackId, positionSec))
                            },
                            onOpenSource = { sourceId -> navController.navigate(sourceRoute(sourceId)) },
                            onOpenLanguage = { code -> navController.navigate(languageRoute(code)) },
                            onOpenChannels = { navController.navigate("channels") },
                            onOpenChannel = { slug -> navController.navigate(channelRoute(slug)) },
                            onCreateChannel = startCreateChannel,
                        )
                    }
                    composable(Tab.History.route) {
                        HistoryScreen(
                            onOpenAi = { aiSheet = true },
                            onCreateChannel = startCreateChannel,
                            onOpenAccount = { accountSheet = true },
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
                        NotesScreen(
                            onOpenPlayer = { playerOpen = true },
                            onCreateChannel = startCreateChannel,
                            onOpenAccount = { accountSheet = true },
                        )
                    }
                    composable(Tab.Ai.route) {
                        AiScreen(
                            onOpenTool = { id -> navController.navigate("ai/tool/$id") },
                            onCreateChannel = startCreateChannel,
                        )
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
                    composable("channels") {
                        ChannelsScreen(
                            onBack = { navController.popBackStack() },
                            onOpenChannel = { slug -> navController.navigate(channelRoute(slug)) },
                            onCreate = {
                                if (signedIn) {
                                    creatorViewModel.startCreate()
                                    channelEditor = true
                                } else {
                                    accountSheet = true
                                }
                            },
                            onMyChannels = { navController.navigate("mychannels") },
                        )
                    }
                    composable("mychannels") {
                        MyChannelsScreen(
                            onBack = { navController.popBackStack() },
                            onCreate = {
                                if (signedIn) {
                                    creatorViewModel.startCreate()
                                    channelEditor = true
                                } else {
                                    accountSheet = true
                                }
                            },
                            onOpenChannel = { slug -> navController.navigate(channelRoute(slug)) },
                        )
                    }
                    composable("channel/{slug}") {
                        ChannelDetailScreen(
                            onBack = { navController.popBackStack() },
                            onManage = { channelId -> navController.navigate("channelManage/${Uri.encode(channelId)}") },
                            onUpload = { channelId, playlistId ->
                                navController.navigate(uploadRoute(channelId, playlistId))
                            },
                            onEdit = { channel ->
                                creatorViewModel.startEdit(channel)
                                channelEditor = true
                            },
                        )
                    }
                    composable("channelManage/{channelId}") {
                        ChannelManageScreen(
                            onBack = { navController.popBackStack() },
                            onUpload = { channelId, playlistId ->
                                navController.navigate(uploadRoute(channelId, playlistId))
                            },
                        )
                    }
                    composable(
                        "channelUpload/{channelId}?playlistId={playlistId}",
                        arguments = listOf(
                            androidx.navigation.navArgument("channelId") {
                                type = androidx.navigation.NavType.StringType
                            },
                            androidx.navigation.navArgument("playlistId") {
                                type = androidx.navigation.NavType.StringType
                                nullable = true
                                defaultValue = null
                            },
                        ),
                    ) {
                        ChannelUploadScreen(onBack = { navController.popBackStack() })
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
                        onClose = playerVm::stop,
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(horizontal = geo.dock.margin, vertical = geo.dock.margin)
                            .navigationBarsPadding()
                            .onGloballyPositioned { coords ->
                                if (coords.isAttached && coords.size.height > 0) {
                                    dockClearance = with(density) { coords.size.height.toDp() }
                                    val b = coords.boundsInRoot()
                                    val rowH = with(density) { geo.dock.playerHeight.toPx() }
                                    miniPlayerRect = Rect(b.left, b.top, b.right, (b.top + rowH).coerceAtMost(b.bottom))
                                }
                            },
                    )
                } else {
                    StandaloneMiniPlayer(
                        nowPlaying = mini,
                        miniProgress = playerVm.miniProgress,
                        miniWaveform = playerVm.waveform,
                        onExpand = { playerOpen = true },
                        onPlayPause = playerVm::toggle,
                        onNext = playerVm::next,
                        onClose = playerVm::stop,
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(horizontal = geo.dock.margin, vertical = geo.dock.margin)
                            .navigationBarsPadding()
                            .onGloballyPositioned { coords ->
                                if (coords.isAttached && coords.size.height > 0) {
                                    dockClearance = with(density) { coords.size.height.toDp() }
                                    miniPlayerRect = coords.boundsInRoot()
                                }
                            },
                    )
                }

                WaveSweep(
                    trigger = sweep,
                    kind = navKind,
                    modifier = Modifier.fillMaxSize(),
                )
            }

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
                    // Remember where we were so the player re-expands when the
                    // listener backs out of the collection.
                    reopenPlayerBackStackId = backStackEntry?.id
                    navController.navigate(route)
                },
                targetRect = miniPlayerRect,
                isStandaloneMini = !isTabRoute,
                onExpandProgress = { playerExpandProgress = it },
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

            if (accountSheet) {
                if (accountState == AccountButtonState.NeedsSignIn) {
                    AuthSheet(
                        onDismiss = { accountSheet = false },
                        shared = authViewModel,
                    )
                } else {
                    AccountSheet(
                        onDismiss = { accountSheet = false },
                        shared = authViewModel,
                        onOpenSettings = { navController.navigate("settings") },
                    )
                }
            }

            if (channelEditor) {
                ChannelEditorSheet(
                    viewModel = creatorViewModel,
                    onDismiss = { channelEditor = false },
                )
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

private fun channelRoute(slug: String): String = "channel/${Uri.encode(slug)}"

private fun uploadRoute(channelId: String, playlistId: String?): String {
    val base = "channelUpload/${Uri.encode(channelId)}"
    return if (playlistId.isNullOrBlank()) base else "$base?playlistId=${Uri.encode(playlistId)}"
}

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

private sealed interface NavWaveKind {
    data class TabDrift(val dir: Int) : NavWaveKind
    data object Push : NavWaveKind
    data object Pop : NavWaveKind
}

private fun tabOrderIndex(route: String?): Int = Tab.entries.indexOfFirst { it.route == route }

/** Ocean-current easing: crisp gentle surge followed by a long silky glide to rest. */
private val OceanSwellEasing = CubicBezierEasing(0.22f, 1.0f, 0.36f, 1.0f)

/**
 * Page transitions in Pejvak's ocean vocabulary:
 * - Switching dock tabs glides laterally along the tab order with a subtle buoyant crest.
 * - Pushing a detail route surfaces buoyantly into clarity while the parent recedes deeper.
 * - Popping back mirrors the dive smoothly.
 * Scale stays intentionally subtle so typography never swims while settling.
 */
private fun AnimatedContentTransitionScope<NavBackStackEntry>.oceanEnter(
    motion: Boolean,
    fromRoute: String?,
    toRoute: String?,
): EnterTransition {
    if (!motion) return EnterTransition.None
    val fromTab = tabOrderIndex(fromRoute)
    val toTab = tabOrderIndex(toRoute)
    if (fromTab >= 0 && toTab >= 0 && fromTab != toTab) {
        val dir = if (toTab > fromTab) 1 else -1
        return fadeIn(tween(240, easing = OceanSwellEasing)) +
                slideInHorizontally(tween(380, easing = OceanSwellEasing)) { dir * it / 8 } +
                slideInVertically(tween(380, easing = OceanSwellEasing)) { it / 48 } +
                scaleIn(tween(380, easing = OceanSwellEasing), initialScale = 0.978f)
    }
    return fadeIn(tween(260, easing = OceanSwellEasing)) +
            slideInVertically(tween(420, easing = OceanSwellEasing)) { it / 10 } +
            scaleIn(tween(420, easing = OceanSwellEasing), initialScale = 0.945f)
}

private fun AnimatedContentTransitionScope<NavBackStackEntry>.oceanExit(
    motion: Boolean,
    fromRoute: String?,
    toRoute: String?,
): ExitTransition {
    if (!motion) return ExitTransition.None
    val fromTab = tabOrderIndex(fromRoute)
    val toTab = tabOrderIndex(toRoute)
    if (fromTab >= 0 && toTab >= 0 && fromTab != toTab) {
        val dir = if (toTab > fromTab) 1 else -1
        return fadeOut(tween(200)) +
                slideOutHorizontally(tween(320, easing = OceanSwellEasing)) { -dir * it / 10 } +
                scaleOut(tween(320, easing = OceanSwellEasing), targetScale = 0.975f)
    }
    return fadeOut(tween(210)) +
            slideOutVertically(tween(360, easing = OceanSwellEasing)) { -it / 22 } +
            scaleOut(tween(360, easing = OceanSwellEasing), targetScale = 0.96f)
}

private fun AnimatedContentTransitionScope<NavBackStackEntry>.oceanPopEnter(
    motion: Boolean,
    fromRoute: String?,
    toRoute: String?,
): EnterTransition {
    if (!motion) return EnterTransition.None
    val fromTab = tabOrderIndex(fromRoute)
    val toTab = tabOrderIndex(toRoute)
    if (fromTab >= 0 && toTab >= 0 && fromTab != toTab) {
        return oceanEnter(motion, fromRoute, toRoute)
    }
    return fadeIn(tween(260, easing = OceanSwellEasing)) +
            slideInVertically(tween(380, easing = OceanSwellEasing)) { -it / 22 } +
            scaleIn(tween(380, easing = OceanSwellEasing), initialScale = 0.96f)
}

private fun AnimatedContentTransitionScope<NavBackStackEntry>.oceanPopExit(
    motion: Boolean,
    fromRoute: String?,
    toRoute: String?,
): ExitTransition {
    if (!motion) return ExitTransition.None
    val fromTab = tabOrderIndex(fromRoute)
    val toTab = tabOrderIndex(toRoute)
    if (fromTab >= 0 && toTab >= 0 && fromTab != toTab) {
        return oceanExit(motion, fromRoute, toRoute)
    }
    return fadeOut(tween(210)) +
            slideOutVertically(tween(360, easing = OceanSwellEasing)) { it / 9 } +
            scaleOut(tween(360, easing = OceanSwellEasing), targetScale = 0.95f)
}

private val WaveSweepEasing = CubicBezierEasing(0.22f, 0.72f, 0.32f, 1f)

/**
 * The luminous ocean crest and gliding wake that crosses the screen on navigation.
 *
 * A sheer translucent aqua band, dual sine crests, and a single gliding pearl swimmer
 * trailing twin dotted wake strands (via [drawWaveWake]) sweep smoothly in the current's
 * direction and vanish completely when idle or under reduced motion.
 */
@Composable
private fun WaveSweep(
    trigger: Int,
    kind: NavWaveKind,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val motion = useMotionEnabled()
    val sweep = remember { Animatable(0f) }
    LaunchedEffect(trigger, motion) {
        if (trigger <= 0 || !motion) {
            sweep.snapTo(0f)
            return@LaunchedEffect
        }
        sweep.snapTo(0f)
        sweep.animateTo(1f, tween(660, easing = WaveSweepEasing))
    }
    val eased = sweep.value
    if (!motion || eased <= 0f || eased >= 1f) return
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        if (w <= 1f || h <= 1f) return@Canvas
        val fade = sin(eased * PI).toFloat()
        val wavelength = 88.dp.toPx()

        val cyBase: Float
        val headX: Float
        val swimDir: Float
        val amp: Float
        val phase: Float
        val echoLag: Float

        when (kind) {
            is NavWaveKind.TabDrift -> {
                swimDir = if (kind.dir >= 0) -1f else 1f
                headX = if (swimDir < 0f) w * (1f - eased) else w * eased
                cyBase = h * 0.48f - 18.dp.toPx() * fade
                amp = 8.dp.toPx()
                phase = eased * 4.2f * -swimDir
                echoLag = -22.dp.toPx()
            }

            NavWaveKind.Push -> {
                swimDir = 1f
                headX = w * (0.12f + 0.76f * eased)
                cyBase = h * (0.88f - 0.76f * eased)
                amp = 7.dp.toPx()
                phase = eased * 3.6f
                echoLag = 24.dp.toPx()
            }

            NavWaveKind.Pop -> {
                swimDir = -1f
                headX = w * (0.88f - 0.76f * eased)
                cyBase = h * (0.14f + 0.74f * eased)
                amp = 6.5.dp.toPx()
                phase = -eased * 3.4f
                echoLag = -24.dp.toPx()
            }
        }

        // Sheer translucent water wash riding behind the crest.
        val bandHalf = 58.dp.toPx()
        val bandTop = (cyBase - bandHalf).coerceIn(0f, (h - 2f).coerceAtLeast(0f))
        val bandBottom = (cyBase + bandHalf).coerceIn(bandTop + 1f, h.coerceAtLeast(bandTop + 1f))
        drawRect(
            brush = Brush.verticalGradient(
                colors = listOf(
                    Color.Transparent,
                    RampCyan.third.copy(alpha = 0.065f * fade),
                    tokens.accentTeal.copy(alpha = 0.045f * fade),
                    Color.Transparent,
                ),
                startY = bandTop,
                endY = bandBottom,
            ),
            topLeft = Offset(0f, bandTop),
            size = Size(w, bandBottom - bandTop),
        )

        // Primary and secondary wave crests.
        listOf(
            Triple(0f, amp, tokens.accent.copy(alpha = 0.28f * fade) to 1.6.dp.toPx()),
            Triple(echoLag, amp * 0.62f, RampCyan.third.copy(alpha = 0.22f * fade) to 1.1.dp.toPx()),
        ).forEach { (lag, crestAmp, strokeStyle) ->
            drawPath(
                path = wavePath(
                    from = 0f,
                    to = w,
                    cy = cyBase + lag,
                    amplitude = crestAmp,
                    wavelength = wavelength,
                    phase = phase,
                    taper = 28.dp.toPx(),
                    variation = 0.35f,
                ),
                color = strokeStyle.first,
                style = Stroke(width = strokeStyle.second, cap = StrokeCap.Round),
            )
        }

        // Gliding swimmer + twin flanking wake strands following the primary wave curve.
        val headY = cyBase + waveOffsetAt(headX, amp, wavelength, phase, 0.35f)
        drawWaveWake(
            headX = headX,
            cy = cyBase,
            spread = -8.5.dp.toPx(),
            phaseShift = 0.85f,
            amplitude = amp,
            phase = phase,
            color = RampCyan.third,
            scale = 1f,
            lengthDp = 128f,
            wavelength = wavelength,
            alphaBase = 0.34f * fade,
            amplitudeScale = 0.42f,
            direction = swimDir,
        )
        drawWaveWake(
            headX = headX,
            cy = cyBase,
            spread = 8.5.dp.toPx(),
            phaseShift = -0.85f,
            amplitude = amp,
            phase = phase,
            color = tokens.accent,
            scale = 1f,
            lengthDp = 112f,
            wavelength = wavelength,
            alphaBase = 0.28f * fade,
            amplitudeScale = 0.42f,
            direction = swimDir,
        )

        // Streamlined swimmer crest + soft bioluminescent halo.
        drawCircle(
            color = RampCyan.third.copy(alpha = 0.18f * fade),
            radius = 8.dp.toPx(),
            center = Offset(headX, headY),
        )
        val tailX = (headX - swimDir * 11.dp.toPx()).coerceIn(0f, w)
        val tailY = cyBase + waveOffsetAt(tailX, amp, wavelength, phase, 0.35f)
        drawLine(
            color = tokens.accent.copy(alpha = 0.55f * fade),
            start = Offset(tailX, tailY),
            end = Offset(headX, headY),
            strokeWidth = 2.4.dp.toPx(),
            cap = StrokeCap.Round,
        )
        drawCircle(
            color = tokens.accent.copy(alpha = 0.86f * fade),
            radius = 2.8.dp.toPx(),
            center = Offset(headX, headY),
        )
    }
}
