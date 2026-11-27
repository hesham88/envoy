package app.envoy.hybrid.voice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.Voice
import java.util.Locale

/**
 * Voice that stays on the phone.
 *
 * Read aloud: the restored answer holds your real details, so it is spoken only by a voice that
 * needs no network (Voice.isNetworkConnectionRequired == false). If the phone has none, Envoy
 * says so instead of using a network voice.
 *
 * Dictation: only Android's on-device recognizer (Android 12+, where the phone reports it). Where
 * that isn't available there is no microphone button: Envoy never sends audio to a server.
 */
class LocalSpeaker(context: Context, private val onReady: (Boolean) -> Unit) {
    private var voice: Voice? = null
    private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { status ->
        voice = if (status == TextToSpeech.SUCCESS) pickLocalVoice() else null
        voice?.let { tts.voice = it }
        onReady(voice != null)
    }

    private fun pickLocalVoice(): Voice? =
        tts.voices.orEmpty()
            .filter { !it.isNetworkConnectionRequired && it.locale.language == Locale.ENGLISH.language }
            .minByOrNull { it.quality * -1 }

    val hasLocalVoice get() = voice != null

    /** Speaks with the local voice; returns false (and says nothing) without one. */
    fun speak(text: String): Boolean {
        val v = voice ?: return false
        tts.voice = v
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), "envoy-answer")
        return true
    }

    fun stop() = tts.stop()
    fun shutdown() = tts.shutdown()
}

object LocalDictation {
    fun available(context: Context): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)

    /** Starts on-device recognition; returns null when the phone can't promise on-device. */
    fun start(context: Context, onText: (String, Boolean) -> Unit, onEnd: () -> Unit): SpeechRecognizer? {
        if (!available(context) || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
        val r = SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
        r.setRecognitionListener(object : RecognitionListener {
            override fun onResults(results: Bundle) {
                results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { onText(it, true) }
                onEnd()
            }
            override fun onPartialResults(partial: Bundle) {
                partial.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { onText(it, false) }
            }
            override fun onError(error: Int) = onEnd()
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        r.startListening(
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true),
        )
        return r
    }
}
