# Pejvak R8 rules. Keep the app small but never strip what reflection/serialization needs.

# kotlinx-serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.pejvak.app.**$$serializer { *; }
-keepclassmembers class com.pejvak.app.** { *** Companion; }
-keepclasseswithmembers class com.pejvak.app.** { kotlinx.serialization.KSerializer serializer(...); }

# Ktor
-dontwarn io.ktor.**
-keep class io.ktor.** { *; }

# Media3 / ExoPlayer
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**

# Coil
-dontwarn coil3.**

# Room
-keep class * extends androidx.room.RoomDatabase
-dontwarn androidx.room.paging.**

# Hilt
-dontwarn dagger.hilt.**