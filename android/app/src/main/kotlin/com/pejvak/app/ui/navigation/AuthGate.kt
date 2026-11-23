package com.pejvak.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.ui.screens.auth.AuthViewModel

/**
 * The auth surface wrapper (AUTH-09). It is **non-blocking**: the app always renders, whether or not
 * there is a session. [AuthViewModel] restores any saved token in the background (a valid token
 * auto-signs-in and kicks a sync; an invalid one is cleared silently), and the shared instance feeds
 * the home-screen button + the register/login and account sheets hosted by [PejvakNavHost]. There is
 * deliberately no full-screen login takeover — an active listener is never interrupted.
 */
@Composable
fun AuthGate(
    modifier: Modifier = Modifier,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    PejvakNavHost(
        modifier = modifier,
        authViewModel = viewModel,
        authState = state,
    )
}
