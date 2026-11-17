package com.pejvak.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.pejvak.app.R
import com.pejvak.app.domain.ContextPlay
import com.pejvak.app.domain.describeRecentWhen
import com.pejvak.app.domain.describeRunOutcome
import com.pejvak.app.domain.shape
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

@Composable
fun ContextHistorySheet(
    runs: List<ContextPlay>,
    onDismiss: () -> Unit,
    onResume: () -> Unit,
    onDelete: (ContextPlay) -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    GlassSheet(onDismiss = onDismiss, title = stringResource(R.string.context_history_title), icon = "history") {
        if (runs.isEmpty()) {
            Text(
                text = stringResource(R.string.context_history_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = tokens.textSecondary,
                modifier = Modifier.padding(geo.spacing.lg),
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(geo.spacing.sm)) {
            runs.forEach { run ->
                GlassCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            onResume()
                            onDismiss()
                        },
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                text = describeRecentWhen(run.startedAt),
                                style = MaterialTheme.typography.titleSmall,
                                color = tokens.text,
                            )
                            Text(
                                text = describeRunOutcome(run.shape()).label,
                                style = MaterialTheme.typography.bodySmall,
                                color = tokens.textSecondary,
                            )
                        }
                        BubbleButton(
                            icon = ICON_GLYPHS.getValue("delete"),
                            contentDescription = stringResource(R.string.action_delete),
                            onClick = { onDelete(run) },
                        )
                    }
                }
            }
        }
    }
}
