package com.pejvak.app.ui.screens.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pejvak.app.R
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.PrimaryButton
import com.pejvak.app.ui.components.field.PasswordField
import com.pejvak.app.ui.components.field.TextField
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * The register/login **modal** (AUTH-11). The same form the gate used to show full-screen, now
 * hosted in the shared `GlassSheet` shell so it floats over the app and never interrupts it. Uses
 * the [shared] [AuthViewModel] instance (never a fresh one) so establishing a session updates the
 * home-screen button and kicks the sync in lockstep.
 */
@Composable
fun AuthSheet(
    onDismiss: () -> Unit,
    shared: AuthViewModel,
    modifier: Modifier = Modifier,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    val state by shared.state.collectAsStateWithLifecycle()

    var registerMode by rememberSaveable { mutableStateOf(false) }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var username by rememberSaveable { mutableStateOf("") }
    var displayName by rememberSaveable { mutableStateOf("") }

    fun submit() {
        if (registerMode) shared.register(username, email, password, displayName)
        else shared.login(email, password)
    }

    GlassSheet(
        onDismiss = onDismiss,
        modifier = modifier,
        title = stringResource(if (registerMode) R.string.auth_register_title else R.string.auth_login_title),
        subtitle = stringResource(R.string.auth_modal_subtitle),
        icon = if (registerMode) "person_add" else "cloud_upload",
    ) {
        Text(
            text = stringResource(R.string.auth_modal_body),
            style = MaterialTheme.typography.bodyMedium,
            color = tokens.textSecondary,
            textAlign = TextAlign.Start,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(geo.spacing.md))

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

        TextButton(onClick = {
            registerMode = !registerMode
            shared.clearError()
        }) {
            Text(
                text = stringResource(if (registerMode) R.string.auth_have_account else R.string.auth_no_account),
                style = MaterialTheme.typography.bodyMedium,
                color = tokens.textSecondary,
            )
        }
        Spacer(Modifier.height(geo.spacing.md))
    }
}
