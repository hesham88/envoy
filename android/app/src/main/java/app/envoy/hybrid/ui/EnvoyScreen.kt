package app.envoy.hybrid.ui

import android.Manifest
import android.content.pm.PackageManager
import android.speech.SpeechRecognizer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import app.envoy.hybrid.ocr.PhotoReader
import app.envoy.hybrid.voice.LocalDictation
import app.envoy.hybrid.voice.LocalSpeaker
import com.google.firebase.ai.ondevice.OnDeviceModelStatus
import kotlinx.coroutines.launch

/** Envoy's UV-night palette, the same as the web app: green is this phone, blue is the cloud. */
private object Uv {
    val dark = Color(0xFF0B0A1C)
    val panel = Color(0xFF131230)
    val line = Color(0xFF2A2852)
    val text = Color(0xFFECE9FF)
    val muted = Color(0xFFA9A6CC)
    val green = Color(0xFF3DFFB0)
    val blue = Color(0xFF7D95FF)
    val amber = Color(0xFFFFB547)
    val danger = Color(0xFFFF5D7A)
}

@Composable
fun EnvoyTheme(content: @Composable () -> Unit) = MaterialTheme(
    colorScheme = darkColorScheme(
        background = Uv.dark, surface = Uv.panel, primary = Uv.green, onPrimary = Uv.dark,
        onBackground = Uv.text, onSurface = Uv.text, outline = Uv.line,
    ),
    content = content,
)

@Composable
private fun Card(title: String, accent: Color = Uv.line, content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxWidth().border(1.dp, accent, RoundedCornerShape(16.dp))
            .background(Uv.panel, RoundedCornerShape(16.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(title, color = Uv.muted, fontSize = 12.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.semantics { heading() })
        content()
    }
}

@Composable
private fun Chip(text: String, color: Color) = Text(
    text, color = color, fontSize = 12.sp,
    modifier = Modifier.border(1.dp, color.copy(alpha = 0.5f), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 4.dp),
)

@Composable
fun EnvoyScreen(vm: EnvoyViewModel) {
    val s by vm.state.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var speakerReady by remember { mutableStateOf<Boolean?>(null) }
    val speaker = remember { LocalSpeaker(context) { speakerReady = it } }
    DisposableEffect(Unit) { onDispose { speaker.shutdown() } }
    var listening by remember { mutableStateOf<SpeechRecognizer?>(null) }

    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            runCatching { PhotoReader.read(context, uri) }
                .onSuccess { if (it.isBlank()) vm.showError("No text found in this photo.") else vm.setDoc("Photo", it) }
                .onFailure { vm.showError("Couldn't read this photo on the phone: ${it.message}") }
        }
    }
    fun dictate() {
        listening?.let { it.stopListening(); listening = null; return }
        val base = s.question
        listening = LocalDictation.start(context, { t, _ -> vm.setQuestion(if (base.isBlank()) t else "$base $t") }) { listening = null }
    }
    val askMic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { if (it) dictate() }

    Column(
        Modifier.fillMaxSize().background(Uv.dark).safeDrawingPadding().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text("Envoy", color = Uv.text, fontSize = 30.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
        Text("Ask the cloud. Keep your secrets.", color = Uv.muted, fontSize = 16.sp)

        // Where private steps can run on this phone.
        val (label, color) = when {
            !s.deviceChecked -> "Checking for Gemini Nano…" to Uv.muted
            s.device == OnDeviceModelStatus.AVAILABLE -> "Private mode: Gemini Nano on this phone" to Uv.green
            s.device == OnDeviceModelStatus.DOWNLOADABLE -> "Gemini Nano can be downloaded" to Uv.amber
            s.device == OnDeviceModelStatus.DOWNLOADING -> "Gemini Nano is downloading" to Uv.amber
            else -> "Basic protection: local rules only (no Gemini Nano on this phone)" to Uv.amber
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip(label, color)
            if (!s.cloudReady) Chip("No cloud set up in this build", Uv.muted)
        }
        if (s.device == OnDeviceModelStatus.DOWNLOADABLE)
            OutlinedButton(onClick = vm::downloadModel) { Text("Download Gemini Nano") }

        Card("YOUR DOCUMENT") {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                s.samples.forEach { sample -> OutlinedButton(onClick = { vm.loadSample(sample) }) { Text(sample.title) } }
                OutlinedButton(onClick = { pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) { Text("Photo") }
            }
            OutlinedTextField(
                value = s.doc, onValueChange = { vm.setDoc(s.docTitle.ifBlank { "Pasted text" }, it) },
                label = { Text(s.docTitle.ifBlank { "Paste a document, or pick a sample" }) },
                modifier = Modifier.fillMaxWidth().height(160.dp),
            )
            Text("Samples and everyone in them are fictional.", color = Uv.muted, fontSize = 12.sp)
        }

        Card("YOUR QUESTION") {
            OutlinedTextField(value = s.question, onValueChange = vm::setQuestion, modifier = Modifier.fillMaxWidth(), label = { Text("Ask about the document") })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = vm::checkWhatLeaves, enabled = s.busy == null && s.doc.isNotBlank() && s.question.isNotBlank()) {
                    Text("Check what leaves")
                }
                if (LocalDictation.available(context)) OutlinedButton(onClick = {
                    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) dictate()
                    else askMic.launch(Manifest.permission.RECORD_AUDIO)
                }) { Text(if (listening != null) "Stop" else "Dictate on this phone") }
            }
        }

        s.busy?.let { Text(it, color = Uv.green) }
        s.error?.let { Text(it, color = Uv.danger) }

        s.review?.let { r ->
            val found = r.entities.size
            Card("WHAT THE CLOUD WILL SEE", accent = Uv.blue) {
                Text(
                    "${r.excerpt.length} of ${r.docChars} characters (${r.excerpt.length * 100 / maxOf(1, r.docChars)}%), $found private details as tags." +
                        if (r.privateMode) "" else " Basic protection sends every part, masked.",
                    color = Uv.muted, fontSize = 13.sp,
                )
                Text(r.excerpt, color = Uv.text, fontFamily = FontFamily.Monospace, fontSize = 13.sp)
                Button(onClick = vm::approve, enabled = s.busy == null, colors = ButtonDefaults.buttonColors(containerColor = Uv.blue)) {
                    Text("Approve and send")
                }
            }
        }

        s.answer?.let { a ->
            Card("ANSWER, RESTORED ON THIS PHONE", accent = Uv.green) {
                val text = buildAnnotatedString {
                    var last = 0
                    for (sp in a.spans) {
                        append(a.text.substring(last, sp.start))
                        withStyle(SpanStyle(color = Uv.green, fontWeight = FontWeight.SemiBold)) { append(a.text.substring(sp.start, sp.end)) }
                        last = sp.end
                    }
                    append(a.text.substring(last))
                }
                Text(text, color = Uv.text, fontSize = 16.sp)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Chip("Reasoned in the cloud over tags", Uv.blue)
                    Chip("Details restored on this phone", Uv.green)
                }
                when (speakerReady) {
                    true -> OutlinedButton(onClick = { speaker.speak(a.text) }) { Text("Read aloud on this phone") }
                    false -> Text("No on-device voice, so Envoy won't read it aloud: an online voice would send your details.", color = Uv.muted, fontSize = 12.sp)
                    null -> {}
                }
            }
        }

        if (s.steps.isNotEmpty()) Card("FLIGHT RECORDER") {
            s.steps.forEach { st ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(st.name, color = Uv.text, fontSize = 13.sp, modifier = Modifier.weight(1f))
                    Text("${st.where} · ${st.ms} ms", color = if (st.where.startsWith("Cloud")) Uv.blue else Uv.green, fontSize = 12.sp)
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}
