package com.pejvak.app.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.ui.screens.auth.AuthScreen
import com.pejvak.app.ui.screens.auth.AuthViewModel
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * The auth gate (AUTH-05): unauthenticated → the auth flow; authenticated → the
 * tabs + detail screens. While restoring, a centered spinner holds the place so a
 * cached session never flashes the login screen.
 */
@Composable
fun AuthGate(
    modifier: Modifier = Modifier,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val tokens = LocalPejvakTokens.current
    when (state.status) {
        AuthViewModel.Status.Loading -> {
            Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = tokens.accent)
            }
        }
        AuthViewModel.Status.Unauthenticated -> AuthScreen(modifier = modifier)
        AuthViewModel.Status.Authenticated -> PejvakNavHost(modifier = modifier)
    }
}