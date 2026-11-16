// Repository ordering matters on this network:
//  - dl.google.com / maven.google.com are unreachable (use the Aliyun google mirror).
//  - The Aliyun mirror returns HTTP 502 (not 404) for artifacts it does not have,
//    which aborts Gradle's fall-through. So mavenCentral() MUST come first: it
//    returns clean 404s for Google-only artifacts, letting Gradle fall through to
//    the Aliyun mirror, which has them. JetBrains/Kotlin/KSP/Hilt/Ktor resolve
//    from mavenCentral directly and never hit the mirror.
pluginManagement {
    repositories {
        mavenCentral()
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        google()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        google()
    }
}

rootProject.name = "Pejvak"
include(":app")