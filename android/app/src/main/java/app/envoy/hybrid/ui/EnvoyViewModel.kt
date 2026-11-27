package app.envoy.hybrid.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.envoy.hybrid.ai.DeviceUnavailable
import app.envoy.hybrid.ai.EnvoyAi
import app.envoy.hybrid.ai.PrivacyViolation
import app.envoy.hybrid.core.Entity
import app.envoy.hybrid.core.Guard
import app.envoy.hybrid.core.Names
import app.envoy.hybrid.core.Pipeline
import app.envoy.hybrid.core.Restore
import app.envoy.hybrid.core.Rules
import app.envoy.hybrid.core.Tags
import com.google.firebase.ai.ondevice.FirebaseAIOnDevice
import com.google.firebase.ai.ondevice.OnDeviceModelStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONArray

data class Sample(val key: String, val title: String, val text: String, val questions: List<String>)

/** One line of the flight recorder: what ran, where, and how long it took. */
data class Step(val name: String, val where: String, val ms: Long)

data class Review(
    val entities: List<Entity>,
    val tags: Tags.TagMap,
    val excerpt: String,
    val docChars: Int,
    val privateMode: Boolean,
)

data class Answer(val text: String, val spans: List<Restore.Span>, val withheld: List<String>)

data class UiState(
    val samples: List<Sample> = emptyList(),
    val docTitle: String = "",
    val doc: String = "",
    val question: String = "",
    val device: OnDeviceModelStatus? = null,
    val deviceChecked: Boolean = false,
    val cloudReady: Boolean = false,
    val busy: String? = null,
    val review: Review? = null,
    val answer: Answer? = null,
    val error: String? = null,
    val steps: List<Step> = emptyList(),
)

class EnvoyViewModel(app: Application) : AndroidViewModel(app) {
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state

    init {
        val samples = runCatching {
            val arr = JSONArray(app.assets.open("samples.json").bufferedReader().readText())
            (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                val qs = o.getJSONArray("questions")
                Sample(o.getString("key"), o.getString("title"), o.getString("text"), (0 until qs.length()).map { qs.getString(it) })
            }
        }.getOrDefault(emptyList())
        _state.update { it.copy(samples = samples, cloudReady = EnvoyAi.firebaseReady(app)) }
        refreshDevice()
    }

    fun refreshDevice() = viewModelScope.launch {
        val status = EnvoyAi.deviceStatus()
        _state.update { it.copy(device = status, deviceChecked = true) }
    }

    /** Model download needs a person's action; it's started only from a button. */
    fun downloadModel() = viewModelScope.launch {
        runCatching {
            FirebaseAIOnDevice.download().collect { _state.update { s -> s.copy(busy = "Downloading the on-device model…") } }
        }
        _state.update { it.copy(busy = null) }
        refreshDevice()
    }

    fun loadSample(s: Sample) = _state.update {
        it.copy(docTitle = s.title, doc = s.text, question = s.questions.first(), review = null, answer = null, error = null, steps = emptyList())
    }

    fun setDoc(title: String, text: String) = _state.update { it.copy(docTitle = title, doc = text, review = null, answer = null, error = null) }
    fun setQuestion(q: String) = _state.update { it.copy(question = q, answer = null) }
    fun showError(msg: String) = _state.update { it.copy(error = msg, busy = null) }

    private fun step(name: String, where: String, t0: Long) =
        _state.update { it.copy(steps = it.steps + Step(name, where, System.currentTimeMillis() - t0)) }

    /** Private steps, then the exact excerpt that would leave the phone. Nothing is sent yet. */
    fun checkWhatLeaves() = viewModelScope.launch {
        val s = _state.value
        if (s.doc.isBlank() || s.question.isBlank()) return@launch
        _state.update { it.copy(busy = "Finding private details on this phone…", review = null, answer = null, error = null, steps = emptyList()) }
        try {
            var t0 = System.currentTimeMillis()
            val rules = Rules.detect(s.doc)
            step("Rules found ${rules.size} details", "This phone, no model", t0)
            var entities = rules
            var privateMode = s.device == OnDeviceModelStatus.AVAILABLE
            val clauses = Pipeline.clauses(s.doc)
            var ids = clauses.map { it.id }.toSet()
            if (privateMode) {
                try {
                    t0 = System.currentTimeMillis()
                    val out = EnvoyAi.runPrivate(Pipeline.detectPrompt(s.doc))
                    val suggestions = Pipeline.acceptSuggestions(s.doc, out, rules)
                    entities = Pipeline.withRoles(rules, suggestions, s.doc, out)
                    step("Names and roles found (${suggestions.size} more)", "This phone, Gemini Nano", t0)
                    _state.update { it.copy(busy = "Choosing what the question needs…") }
                    t0 = System.currentTimeMillis()
                    val chosen = Pipeline.parseIds(EnvoyAi.runPrivate(Pipeline.selectPrompt(s.question, clauses)), clauses.size)
                    if (chosen.isNotEmpty()) ids = chosen
                    step("Kept ${ids.size} of ${clauses.size} parts", "This phone, Gemini Nano", t0)
                } catch (e: DeviceUnavailable) {
                    privateMode = false
                    step("On-device model unavailable: Basic protection", "This phone", t0)
                }
            }
            // Names and companies the rules can't know about, in both modes (as on the web).
            val names = Names.flag(s.doc, entities, s.question)
            if (names.isNotEmpty()) step("Names found by pattern: ${names.size}", "This phone, no model", System.currentTimeMillis())
            entities = (entities + names).sortedBy { it.start }
            val tags = Tags.assign(entities)
            val excerpt = Pipeline.outbound(s.doc, ids, entities, tags)
            val leaks = Guard.checkOutbound(excerpt, entities)
            if (leaks.isNotEmpty()) {
                showError("Blocked: the excerpt still held ${leaks.joinToString { it.type.name }}. Nothing was sent.")
                return@launch
            }
            step("Excerpt checked: no raw details", "This phone, guard", System.currentTimeMillis())
            _state.update { it.copy(busy = null, review = Review(entities, tags, excerpt, s.doc.length, privateMode)) }
        } catch (e: PrivacyViolation) {
            showError("${e.message} Nothing was sent.")
        } catch (e: Exception) {
            showError("Couldn't check this document: ${e.message}")
        }
    }

    /** You approved the excerpt: only it goes to the cloud; tags come back and are restored here. */
    fun approve() = viewModelScope.launch {
        val s = _state.value
        val review = s.review ?: return@launch
        if (!s.cloudReady) {
            showError("This build has no cloud connection set up, so nothing was sent. The masking above ran fully on this phone.")
            return@launch
        }
        _state.update { it.copy(busy = "Gemini is reasoning over tags…") }
        try {
            val t0 = System.currentTimeMillis()
            val raw = EnvoyAi.reason(Pipeline.cloudPrompt(s.question, review.excerpt))
            step("Reasoned over ${review.excerpt.length} characters of tags", "Cloud, ${EnvoyAi.CLOUD_MODEL}", t0)
            val t1 = System.currentTimeMillis()
            val restored = Restore.restore(raw, review.tags)
            step("Real values restored", "This phone", t1)
            _state.update { it.copy(busy = null, answer = Answer(restored.text, restored.spans, restored.withheld)) }
        } catch (e: Exception) {
            showError("The cloud didn't answer (${e.javaClass.simpleName}). Nothing else was sent.")
        }
    }
}
