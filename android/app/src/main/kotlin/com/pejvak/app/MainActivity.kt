package com.pejvak.app

import android.graphics.Color as AndroidColor
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.runtime.SideEffect
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import com.pejvak.app.core.LocalHapticsEnabled
import com.pejvak.app.data.repository.SettingsRepository
import com.pejvak.app.data.sync.SyncScheduler
import com.pejvak.app.ui.navigation.AuthGate
import com.pejvak.app.ui.screens.splash.SplashIntro
import com.pejvak.app.domain.MotionPreference as DomainMotion
import com.pejvak.app.domain.ThemePreference
import com.pejvak.app.ui.theme.LocalMotionPreference
import com.pejvak.app.ui.theme.MotionPreference
import com.pejvak.app.ui.theme.OceanSwellEasing
import com.pejvak.app.ui.theme.PejvakTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Single activity; Compose draws everything. Edge-to-edge so the ambient canvas
 *  runs under the status/navigation bars. */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var syncScheduler: SyncScheduler
    @Inject lateinit var settingsRepository: SettingsRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        // Release the OS system splash immediately — do NOT hold it on settings load.
        // Holding it made it linger as a separate "first splash" (icon on a plain field)
        // before the branded intro. Released at once (with a transparent icon, see
        // themes.xml) it is a sub-frame handoff, so the SplashIntro is the one splash.
        installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // Settings still load in the background underneath the intro (the intro is the
        // only thing visible for its ~1.4 s, so a late theme read is hidden behind it).
        lifecycleScope.launch { runCatching { settingsRepository.load() } }
        setContent {
            val preferences by settingsRepository.settings.collectAsStateWithLifecycle()
            val dark = when (preferences.themePreference) {
                ThemePreference.Light -> false
                ThemePreference.Dark -> true
                ThemePreference.System -> isSystemInDarkTheme()
            }
            val motion = when (preferences.motionPreference) {
                DomainMotion.Full -> MotionPreference.Full
                DomainMotion.Reduced -> MotionPreference.Reduced
                DomainMotion.System -> MotionPreference.System
            }
            // Both canvases are dark (light theme = deep teal, dark theme = near
            // black), so the bars always want light icons and a transparent
            // scrim. Tying this to the app theme also avoids the opaque light
            // band a light system leaves behind the three-button navigation bar.
            SideEffect {
                enableEdgeToEdge(
                    statusBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT),
                    navigationBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT),
                )
                window.isNavigationBarContrastEnforced = false
                @Suppress("DEPRECATION")
                window.decorView.systemUiVisibility =
                    window.decorView.systemUiVisibility and
                    android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv() and
                    android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR.inv()
                androidx.core.view.WindowCompat.getInsetsController(window, window.decorView).apply {
                    isAppearanceLightStatusBars = false
                    isAppearanceLightNavigationBars = false
                }
            }
            CompositionLocalProvider(
                LocalMotionPreference provides motion,
                LocalHapticsEnabled provides preferences.hapticsEnabled,
            ) {
                PejvakTheme(darkTheme = dark) {
                    Surface(modifier = Modifier.fillMaxSize(), color = Color.Transparent) {
                        // The branded intro plays once over the live app, then ebbs away.
                        // AuthGate is composed underneath so it is already warm when the
                        // splash clears; the splash only fades + lifts off it.
                        var introDone by remember { mutableStateOf(false) }
                        val introExit = remember { Animatable(1f) }
                        val introScope = rememberCoroutineScope()
                        Box(Modifier.fillMaxSize()) {
                            AuthGate()
                            if (!introDone) {
                                SplashIntro(
                                    modifier = Modifier.graphicsLayer {
                                        alpha = introExit.value
                                        val s = 1f + (1f - introExit.value) * 0.06f
                                        scaleX = s
                                        scaleY = s
                                    },
                                    onFinish = {
                                        introScope.launch {
                                            introExit.animateTo(0f, tween(360, easing = OceanSwellEasing))
                                            introDone = true
                                        }
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    /** Returning to the foreground is a sync trigger (mirrors useSyncLifecycle). */
    override fun onStart() {
        super.onStart()
        syncScheduler.syncNow()
    }
}