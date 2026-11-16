package com.pejvak.app.data.remote.online

import com.pejvak.app.domain.online.OnlineAdapter
import com.pejvak.app.domain.online.OnlineLanguage
import com.pejvak.app.domain.online.OnlineSource
import com.pejvak.app.domain.online.OnlineSourceKind
import com.pejvak.app.domain.online.OnlineSourceException
import com.pejvak.app.domain.online.OnlineErrorCode
import com.pejvak.app.domain.online.sourceLanguages
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The one place a source id becomes an adapter (mirrors mobile/src/lib/online/index.ts).
 * Sources are data, so the list is assembled here and every screen reads it.
 */
@Singleton
class OnlineRegistry @Inject constructor(
    private val transport: OnlineTransport,
) {
    private val adapters: Map<String, OnlineAdapter> = buildList {
        add(createManahejAdapter(transport))
        add(createAminikhaahAdapter(transport))
        add(createAminikhaahPodcastsAdapter(transport))
        add(createEsraAdapter(transport))
        add(createMesbahAdapter(transport))
        add(createShariatiAdapter(transport))
        add(createLibrivoxAdapter(transport))
        add(createRadioBrowserAdapter(transport))
        for (source in archiveSources()) add(createArchiveAdapter(source, transport))
    }.associateBy { it.source.id }

    val sources: List<OnlineSource> = adapters.values.map { it.source }.sortedWith(
        compareBy<OnlineSource> { sourceOrder(it.kind) }.thenBy { it.name },
    )

    fun source(sourceId: String): OnlineSource? = adapters[sourceId]?.source

    fun adapter(sourceId: String): OnlineAdapter? = adapters[sourceId]

    fun adapterFor(key: String): OnlineAdapter? {
        val sourceId = key.substringBefore(':', missingDelimiterValue = "")
        return adapter(sourceId)
    }

    fun requireAdapter(sourceId: String): OnlineAdapter =
        adapter(sourceId) ?: throw OnlineSourceException("Unknown source: $sourceId", OnlineErrorCode.NotFound)

    fun sourcesForLanguage(languageCode: String): List<OnlineSource> =
        sources.filter { languageCode in sourceLanguages(it) }

    fun languageFacets(): List<OnlineLanguage> = com.pejvak.app.domain.online.LANGUAGES

    private fun sourceOrder(kind: OnlineSourceKind): Int = when (kind) {
        OnlineSourceKind.Manahej -> 0
        OnlineSourceKind.Aminikhaah -> 1
        OnlineSourceKind.AminikhaahPodcasts -> 2
        OnlineSourceKind.Esra -> 3
        OnlineSourceKind.Mesbah -> 4
        OnlineSourceKind.Shariati -> 5
        OnlineSourceKind.Librivox -> 6
        OnlineSourceKind.RadioBrowser -> 7
        OnlineSourceKind.Archive -> 8
    }
}
