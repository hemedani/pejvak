package com.pejvak.app.domain

/**
 * The ID3v1 genre table (mirrors mobile/src/lib/id3Genres.ts). v2.3 taggers often
 * wrote TCON as a numeric reference — `(31)` or bare `31`. Entries past 79 came
 * from Winamp and were adopted by every tagger that followed. Pure.
 */

private val GENRES: List<String> = listOf(
    "Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk", "Grunge",
    "Hip-Hop", "Jazz", "Metal", "New Age", "Oldies", "Other", "Pop", "R&B",
    "Rap", "Reggae", "Rock", "Techno", "Industrial", "Alternative", "Ska",
    "Death Metal", "Pranks", "Soundtrack", "Euro-Techno", "Ambient",
    "Trip-Hop", "Vocal", "Jazz+Funk", "Fusion", "Trance", "Classical",
    "Instrumental", "Acid", "House", "Game", "Sound Clip", "Gospel", "Noise",
    "Alternative Rock", "Bass", "Soul", "Punk", "Space", "Meditative",
    "Instrumental Pop", "Instrumental Rock", "Ethnic", "Gothic", "Darkwave",
    "Techno-Industrial", "Electronic", "Pop-Folk", "Eurodance", "Dream",
    "Southern Rock", "Comedy", "Cult", "Gangsta", "Top 40", "Christian Rap",
    "Pop/Funk", "Jungle", "Native American", "Cabaret", "New Wave",
    "Psychedelic", "Rave", "Showtunes", "Trailer", "Lo-Fi", "Tribal",
    "Acid Punk", "Acid Jazz", "Polka", "Retro", "Musical", "Rock & Roll",
    "Hard Rock", "Folk", "Folk-Rock", "National Folk", "Swing", "Fast Fusion",
    "Bebob", "Latin", "Revival", "Celtic", "Bluegrass", "Avantgarde",
    "Gothic Rock", "Progressive Rock", "Psychedelic Rock", "Symphonic Rock",
    "Slow Rock", "Big Band", "Chorus", "Easy Listening", "Acoustic", "Humour",
    "Speech", "Chanson", "Opera", "Chamber Music", "Sonata", "Symphony",
    "Booty Bass", "Primus", "Porn Groove", "Satire", "Slow Jam", "Club",
    "Tango", "Samba", "Folklore", "Ballad", "Power Ballad", "Rhythmic Soul",
    "Freestyle", "Duet", "Punk Rock", "Drum Solo", "A cappella", "Euro-House",
    "Dance Hall", "Goa", "Drum & Bass", "Club-House", "Hardcore", "Terror",
    "Indie", "BritPop", "Negerpunk", "Polsk Punk", "Beat",
    "Christian Gangsta Rap", "Heavy Metal", "Black Metal", "Crossover",
    "Contemporary Christian", "Christian Rock", "Merengue", "Salsa",
    "Thrash Metal", "Anime", "Jpop", "Synthpop", "Abstract", "Art Rock",
    "Baroque", "Bhangra", "Big Beat", "Breakbeat", "Chillout", "Downtempo",
    "Dub", "EBM", "Eclectic", "Electro", "Electroclash", "Emo",
    "Experimental", "Garage", "Global", "IDM", "Illbient", "Industro-Goth",
    "Jam Band", "Krautrock", "Leftfield", "Lounge", "Math Rock", "New Romantic",
    "Nu-Breakz", "Post-Punk", "Post-Rock", "Psytrance", "Shoegaze",
    "Space Rock", "Trop Rock", "World Music", "Neoclassical", "Audiobook",
    "Audio Theatre", "Neue Deutsche Welle", "Podcast", "Indie Rock",
    "G-Funk", "Dubstep", "Garage Rock", "Psybient",
)

val ID3_GENRE_COUNT: Int = GENRES.size

/**
 * Turns a TCON value into something readable: a plain name, a numeric reference
 * (`31`, `(31)`), or a refinement (`(31)Goa Trance`, `(RX)`/`(CR)`). Anything
 * unresolvable is returned trimmed rather than dropped.
 */
fun resolveGenre(value: String): String? {
    val trimmed = value.trim()
    if (trimmed.isEmpty()) return null

    val parts = mutableListOf<String>()
    var rest = trimmed

    while (rest.startsWith("(")) {
        val close = rest.indexOf(')')
        if (close == -1) break
        val token = rest.substring(1, close).trim()
        genreName(token)?.let { parts.add(it) }
        rest = rest.substring(close + 1)
    }

    val tail = rest.trim()
    if (tail.isNotEmpty()) parts.add(tail)

    if (parts.isEmpty()) return genreName(trimmed)
    return parts.joinToString(" / ")
}

private fun genreName(token: String): String? {
    if (token.uppercase() == "RX") return "Remix"
    if (token.uppercase() == "CR") return "Cover"
    if (!Regex("^\\d{1,3}$").matches(token)) return token.ifEmpty { null }
    return GENRES.getOrNull(token.toInt())
}