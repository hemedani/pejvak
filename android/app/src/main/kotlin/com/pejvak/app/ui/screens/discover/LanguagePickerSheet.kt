package com.pejvak.app.ui.screens.discover

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.pejvak.app.R
import com.pejvak.app.core.foldText
import com.pejvak.app.domain.online.OnlineLanguage
import com.pejvak.app.ui.components.GlassSheet
import com.pejvak.app.ui.components.field.SearchField
import com.pejvak.app.ui.theme.LocalPejvakGeometry
import com.pejvak.app.ui.theme.LocalPejvakTokens

/** The one language picker (DESING.md §9.3 sheet), shared by Discover and Library. */
@Composable
fun LanguagePickerSheet(
    languages: List<OnlineLanguage>,
    selectedCode: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    var query by remember { mutableStateOf("") }
    val filtered = remember(query, languages) {
        val needle = foldText(query.trim())
        if (needle.isEmpty()) languages
        else languages.filter { language ->
            foldText(language.code).contains(needle) ||
                foldText(language.name).contains(needle) ||
                foldText(language.nativeName).contains(needle)
        }
    }
    GlassSheet(onDismiss = onDismiss, title = stringResource(R.string.discover_choose_language)) {
        SearchField(
            value = query,
            onValueChange = { query = it },
            placeholder = stringResource(R.string.discover_search_languages),
        )
        LazyColumn(
            modifier = Modifier.fillMaxWidth().heightIn(max = 480.dp).padding(top = geo.spacing.sm),
            verticalArrangement = Arrangement.spacedBy(geo.spacing.xs),
        ) {
            items(filtered, key = { it.code }) { language ->
                LanguageRow(
                    language = language,
                    selected = language.code == selectedCode,
                    onClick = { onSelect(language.code) },
                )
            }
        }
    }
}

@Composable
private fun LanguageRow(language: OnlineLanguage, selected: Boolean, onClick: () -> Unit) {
    val tokens = LocalPejvakTokens.current
    val geo = LocalPejvakGeometry.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = geo.spacing.sm, vertical = geo.spacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(geo.spacing.md),
    ) {
        Column(Modifier.weight(1f)) {
            Text(language.nativeName, style = MaterialTheme.typography.titleMedium, color = tokens.text)
            Text(
                text = "${language.name} · ${language.code}" + if (language.isRtl) " · RTL" else "",
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textSecondary,
            )
        }
        if (selected) {
            Text(stringResource(R.string.discover_selected), style = MaterialTheme.typography.labelSmall, color = tokens.accentTeal)
        }
    }
}
