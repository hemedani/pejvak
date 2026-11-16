package com.pejvak.app.domain.online

/** The world's languages, ordered by English name (mirrors online/languages.ts). Pure. */
private data class Seed(val code: String, val name: String, val native: String, val rtl: Boolean = false)

private val SEED = listOf(
    Seed("ar", "Arabic", "العربية", rtl = true),
    Seed("az", "Azerbaijani", "Azərbaycanca"),
    Seed("bn", "Bengali", "বাংলা"),
    Seed("my", "Burmese", "မြန်မာ"),
    Seed("zh", "Chinese", "中文"),
    Seed("cs", "Czech", "Čeština"),
    Seed("da", "Danish", "Dansk"),
    Seed("nl", "Dutch", "Nederlands"),
    Seed("en", "English", "English"),
    Seed("fi", "Finnish", "Suomi"),
    Seed("fr", "French", "Français"),
    Seed("de", "German", "Deutsch"),
    Seed("el", "Greek", "Ελληνικά"),
    Seed("he", "Hebrew", "עברית", rtl = true),
    Seed("hi", "Hindi", "हिन्दी"),
    Seed("hu", "Hungarian", "Magyar"),
    Seed("id", "Indonesian", "Bahasa Indonesia"),
    Seed("it", "Italian", "Italiano"),
    Seed("ja", "Japanese", "日本語"),
    Seed("kk", "Kazakh", "Қазақша"),
    Seed("ko", "Korean", "한국어"),
    Seed("ku", "Kurdish", "Kurdî"),
    Seed("ms", "Malay", "Bahasa Melayu"),
    Seed("ml", "Malayalam", "മലയാളം"),
    Seed("mr", "Marathi", "मराठी"),
    Seed("no", "Norwegian", "Norsk"),
    Seed("ps", "Pashto", "پښتو", rtl = true),
    Seed("fa", "Persian", "فارسی", rtl = true),
    Seed("pl", "Polish", "Polski"),
    Seed("pt", "Portuguese", "Português"),
    Seed("pa", "Punjabi", "ਪੰਜਾਬੀ"),
    Seed("ro", "Romanian", "Română"),
    Seed("ru", "Russian", "Русский"),
    Seed("sr", "Serbian", "Српски"),
    Seed("si", "Sinhala", "සිංහල"),
    Seed("es", "Spanish", "Español"),
    Seed("sv", "Swedish", "Svenska"),
    Seed("tl", "Tagalog", "Tagalog"),
    Seed("ta", "Tamil", "தமிழ்"),
    Seed("te", "Telugu", "తెలుగు"),
    Seed("th", "Thai", "ไทย"),
    Seed("tr", "Turkish", "Türkçe"),
    Seed("uk", "Ukrainian", "Українська"),
    Seed("ur", "Urdu", "اردو", rtl = true),
    Seed("uz", "Uzbek", "Oʻzbekcha"),
    Seed("vi", "Vietnamese", "Tiếng Việt"),
)

/** Archive serves every catalogue language; the non-archive providers add Persian. */
val ARCHIVE_LANGUAGE_CODES: Set<String> = SEED.mapTo(LinkedHashSet()) { it.code }

private val NON_ARCHIVE_CODES = setOf("fa")

val LANGUAGES: List<OnlineLanguage> = SEED.map {
    OnlineLanguage(it.code, it.name, it.native, it.rtl, it.code in ARCHIVE_LANGUAGE_CODES || it.code in NON_ARCHIVE_CODES)
}

val AVAILABLE_LANGUAGES: List<OnlineLanguage> = LANGUAGES.filter { it.available }

fun findLanguage(code: String): OnlineLanguage? = LANGUAGES.firstOrNull { it.code == code }
