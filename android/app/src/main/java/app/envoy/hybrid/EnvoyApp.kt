package app.envoy.hybrid

import android.app.Application
import com.google.firebase.FirebaseApp

/**
 * Starts Firebase when this build has a google-services.json (it is never committed; see
 * android/README.md). Without one, Envoy still runs every private step on the phone and says that
 * the cloud isn't set up. App Check: the debug provider in debug builds, Play Integrity in release.
 */
class EnvoyApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (FirebaseApp.initializeApp(this) != null) installAppCheck()
    }
}
