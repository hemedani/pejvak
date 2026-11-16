package com.pejvak.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import com.pejvak.app.core.LocalHapticsEnabled
import com.pejvak.app.data.repository.SettingsRepository
import com.pejvak.app.data.sync.SyncScheduler
import com.pejvak.app.ui.navigation.AuthGate
import com.pejvak.app.domain.MotionPreference as DomainMotion
import com.pejvak.app.domain.ThemePreference
import com.pejvak.app.ui.theme.LocalMotionPreference
import com.pejvak.app.ui.theme.MotionPreference
import com.pejvak.app.ui.theme.PejvakTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject

/** Single activity; Compose draws everything. Edge-to-edge so the ambient canvas
 *  runs under the status/navigation bars. */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var syncScheduler: SyncScheduler
    @Inject lateinit var settingsRepository: SettingsRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        val settingsReady = AtomicBoolean(false)
        splash.setKeepOnScreenCondition { !settingsReady.get() }
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // Hold the splash until the saved theme/motion/haptics are loaded, so the
        // first frame is already in the listener's theme (fonts are bundled).
        lifecycleScope.launch {
            runCatching { settingsRepository.load() }
            settingsReady.set(true)
        }
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
            CompositionLocalProvider(
                LocalMotionPreference provides motion,
                LocalHapticsEnabled provides preferences.hapticsEnabled,
            ) {
                PejvakTheme(darkTheme = dark) {
                    Surface(modifier = Modifier.fillMaxSize(), color = Color.Transparent) {
                        AuthGate()
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