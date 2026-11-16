package com.pejvak.app.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/**
 * The primary action button: a solid accent pill (the dock's single accent rule —
 * a filled accent shape means "this is the current thing"). Shows a spinner in
 * place of the label while [loading].
 */
@Composable
fun PrimaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        shape = RoundedCornerShape(geo.radius.pill),
        colors = ButtonDefaults.buttonColors(
            containerColor = tokens.accent,
            contentColor = tokens.onAccent,
            disabledContainerColor = tokens.glassFill,
            disabledContentColor = tokens.textTertiary,
        ),
        modifier = modifier.fillMaxWidth().height(geo.controls.xl),
    ) {
        if (loading) {
            CircularProgressIndicator(
                color = tokens.onAccent,
                strokeWidth = 2.dp,
                modifier = Modifier.size(20.dp),
            )
        } else {
            Text(text = label, style = MaterialTheme.typography.labelLarge)
        }
    }
}