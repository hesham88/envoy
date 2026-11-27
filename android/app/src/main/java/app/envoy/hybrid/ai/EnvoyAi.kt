package app.envoy.hybrid.ai

import android.content.Context
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.ai
import com.google.firebase.ai.ondevice.FirebaseAIOnDevice
import com.google.firebase.ai.ondevice.OnDeviceModelStatus
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI

/** A private step could not run on this phone; Envoy uses its local rules instead. */
class DeviceUnavailable(message: String) : Exception(message)

/** A private step reported that it ran somewhere other than this phone; its answer is discarded. */
class PrivacyViolation(message: String) : Exception(message)

/**
 * Firebase AI Logic on Android, the same split as the web app: private steps (finding details,
 * choosing clauses) use ONLY_ON_DEVICE behind Envoy's device guard; only the reasoning step goes to
 * the cloud, and only with the excerpt you approved, every detail already a tag.
 *
 * The device guard on Android: (1) FirebaseAIOnDevice.checkStatus() must say AVAILABLE before any
 * private call, or the step doesn't run at all; (2) the response's inferenceSource must be ON_DEVICE,
 * or the answer is thrown away. The cloud model never receives the document itself.
 */
@OptIn(PublicPreviewAPI::class)
object EnvoyAi {
    /** Free-tier Gemini Developer API model, the web app's default too (Remote Config there). */
    const val CLOUD_MODEL = "gemini-3.5-flash-lite"

    fun firebaseReady(context: Context): Boolean = FirebaseApp.getApps(context).isNotEmpty()

    suspend fun deviceStatus(): OnDeviceModelStatus? =
        try {
            FirebaseAIOnDevice.checkStatus()
        } catch (_: Throwable) {
            null // no AICore here (emulator, or a phone without Gemini Nano)
        }

    private val ai by lazy { Firebase.ai(backend = GenerativeBackend.googleAI(), useLimitedUseAppCheckTokens = true) }

    private val privateModel by lazy {
        ai.generativeModel(modelName = CLOUD_MODEL, onDeviceConfig = OnDeviceConfig(mode = InferenceMode.ONLY_ON_DEVICE))
    }

    private val cloudModel by lazy {
        ai.generativeModel(modelName = CLOUD_MODEL, onDeviceConfig = OnDeviceConfig(mode = InferenceMode.ONLY_IN_CLOUD))
    }

    /** One private step, behind the device guard. */
    suspend fun runPrivate(prompt: String): String {
        val status = deviceStatus()
        if (status != OnDeviceModelStatus.AVAILABLE)
            throw DeviceUnavailable("On-device model: ${status ?: "not on this phone"}")
        val response = privateModel.generateContent(prompt)
        if (response.inferenceSource != InferenceSource.ON_DEVICE)
            throw PrivacyViolation("A private step reported ${response.inferenceSource}; its answer was discarded.")
        return response.text.orEmpty()
    }

    /** The reasoning step: the cloud model, over the approved excerpt only. */
    suspend fun reason(prompt: String): String {
        val response = cloudModel.generateContent(prompt)
        return response.text.orEmpty()
    }
}
