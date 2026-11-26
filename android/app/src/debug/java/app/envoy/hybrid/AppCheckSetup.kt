package app.envoy.hybrid

import com.google.firebase.Firebase
import com.google.firebase.appcheck.appCheck
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory

/** Debug builds (the emulator): App Check's debug provider. Its token is registered by hand and never committed. */
fun installAppCheck() = Firebase.appCheck.installAppCheckProviderFactory(DebugAppCheckProviderFactory.getInstance())
