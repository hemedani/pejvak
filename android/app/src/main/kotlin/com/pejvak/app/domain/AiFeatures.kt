package com.pejvak.app.domain

/** One of the four AI tools the product promises, with its coming-soon copy. */
data class AiFeature(
    val id: AiFeatureId,
    val title: String,
    val blurb: String,
    val detail: String,
    val icon: String,
    val ramp: Int,
)

enum class AiFeatureId(val wire: String) {
    Transcribe("transcribe"),
    Summarize("summarize"),
    AudioSummary("audioSummary"),
    Enhance("enhance"),
    Unknown("unknown"),
}

val AI_FEATURES: List<AiFeature> = listOf(
    AiFeature(
        id = AiFeatureId.Transcribe,
        title = "Transcribe audio",
        blurb = "Words, with timecodes",
        detail = "Turns a recording into text you can read, search and copy — one timed line per phrase, so every word still points at the moment it was said.",
        icon = "transcribe",
        ramp = 0,
    ),
    AiFeature(
        id = AiFeatureId.Summarize,
        title = "Summarize text",
        blurb = "The argument, not the transcript",
        detail = "Reads a transcript or a note and gives back what it actually said: the points, in order, in a fraction of the words — enough to decide whether the whole thing is worth your evening.",
        icon = "summarize",
        ramp = 1,
    ),
    AiFeature(
        id = AiFeatureId.AudioSummary,
        title = "Generate audio summary",
        blurb = "A briefing you can listen to",
        detail = "Speaks the summary back in a natural voice, so you can hear what a book is about on the walk home and start it already knowing where it goes.",
        icon = "audioSummary",
        ramp = 3,
    ),
    AiFeature(
        id = AiFeatureId.Enhance,
        title = "Remove noise and enhance audio",
        blurb = "Cleaner speech, less hiss",
        detail = "Strips hiss, hum and room echo, then lifts the voice back out of it — for the lecture recorded on a phone at the back of the hall, and the cassette that has been copied twice.",
        icon = "enhance",
        ramp = 4,
    ),
)

const val AI_COMING_SOON_HEADLINE = "Coming soon."
const val AI_COMING_SOON_BODY =
    "Please help us purchase the server required for our AI features so we can enable these services soon."

val AI_FALLBACK_FEATURE = AiFeature(
    id = AiFeatureId.Unknown,
    title = "AI tools",
    blurb = "Four tools, one server away",
    detail = "Transcription, summaries, spoken summaries and audio cleanup. All four need the same thing — a server to run them on.",
    icon = "ai",
    ramp = 2,
)

fun aiFeatureFor(id: String?): AiFeature? =
    id?.let { wanted -> AI_FEATURES.firstOrNull { it.id.wire == wanted } }

/**
 * The glyph is a graphical object on the canvas, so it uses the ramp's lightest
 * stop in both schemes: the canvas is a deep tone in light and dark alike.
 */
fun aiGlyphRamp(feature: AiFeature, dark: Boolean): Int = feature.ramp

fun aiGlyphStop(dark: Boolean): Int = 2
