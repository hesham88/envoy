plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// google-services.json is never committed (android/README.md). Without it the app still builds and
// runs every private step on the phone; it just has no cloud connection.
if (file("google-services.json").exists()) apply(plugin = "com.google.gms.google-services")

android {
    namespace = "app.envoy.hybrid"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.envoy.hybrid"
        minSdk = 26 // firebase-ai-ondevice
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true }
    testOptions { unitTests.isReturnDefaultValues = true }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

dependencies {
    // Firebase AI Logic: hybrid on-device + cloud (on-device is a public preview).
    implementation("com.google.firebase:firebase-ai:18.2.0")
    implementation("com.google.firebase:firebase-ai-ondevice:16.0.0-beta08")
    implementation("com.google.firebase:firebase-appcheck-playintegrity:20.1.0")
    debugImplementation("com.google.firebase:firebase-appcheck-debug:20.1.0")
    implementation("com.google.guava:guava:31.0.1-android")
    implementation("org.reactivestreams:reactive-streams:1.0.4")

    // Text in photos, read on the phone (bundled model).
    implementation("com.google.mlkit:text-recognition:16.0.1")

    implementation(platform("androidx.compose:compose-bom:2026.09.00"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.activity:activity-compose:1.12.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.2")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20260522")
}
