package com.pejvak.app.ui.screens.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.ui.components.GlassCard
import com.pejvak.app.ui.components.KeyboardAwareColumn
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.field.PasswordField
import com.pejvak.app.ui.components.field.TextField
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * Login + register (AUTH-01/02). One screen, two modes; field chaining via IME
 * actions, an inline error line, and a link to switch. The gate decides when this
 * is shown vs. the tabs.
 */
@Composable
fun AuthScreen(
    modifier: Modifier = Modifier,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val state by viewModel.state.collectAsStateWithLifecycle()

    var registerMode by rememberSaveable { mutableStateOf(false) }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var username by rememberSaveable { mutableStateOf("") }
    var displayName by rememberSaveable { mutableStateOf("") }

    fun submit() {
        if (registerMode) viewModel.register(username, email, password, displayName)
        else viewModel.login(email, password)
    }

    KeyboardAwareColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = geo.spacing.xl),
        verticalArrangement = Arrangement.spacedBy(geo.spacing.lg, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(geo.spacing.xs)) {
            Text(
                text = stringResource(R.string.app_name).uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textSecondary,
            )
            Text(
                text = stringResource(if (registerMode) R.string.auth_register_title else R.string.auth_login_title),
                style = MaterialTheme.typography.headlineMedium,
                color = tokens.text,
                textAlign = TextAlign.Center,
            )
            Text(
                text = stringResource(R.string.auth_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = tokens.textSecondary,
                textAlign = TextAlign.Center,
            )
        }

        GlassCard(modifier = Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.md)) {
                if (registerMode) {
                    TextField(
                        value = username,
                        onValueChange = { username = it },
                        label = stringResource(R.string.auth_username),
                        imeAction = ImeAction.Next,
                    )
                    TextField(
                        value = displayName,
                        onValueChange = { displayName = it },
                        label = stringResource(R.string.auth_display_name),
                        imeAction = ImeAction.Next,
                    )
                }
                TextField(
                    value = email,
                    onValueChange = { email = it },
                    label = stringResource(R.string.auth_email),
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                )
                PasswordField(
                    value = password,
                    onValueChange = { password = it },
                    label = stringResource(R.string.auth_password),
                    imeAction = ImeAction.Done,
                    onImeAction = { submit() },
                )
                if (state.error != null) {
                    Text(
                        text = state.error!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = tokens.danger,
                    )
                }
                PrimaryButton(
                    label = stringResource(if (registerMode) R.string.auth_register_action else R.string.auth_login_action),
                    loading = state.isSubmitting,
                    onClick = { submit() },
                )
            }
        }

        TextButton(onClick = {
            registerMode = !registerMode
            viewModel.clearError()
        }) {
            Text(
                text = stringResource(if (registerMode) R.string.auth_have_account else R.string.auth_no_account),
                style = MaterialTheme.typography.bodyMedium,
                color = tokens.textSecondary,
            )
        }
    }
}