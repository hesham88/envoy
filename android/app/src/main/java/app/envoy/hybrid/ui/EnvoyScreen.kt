package app.envoy.hybrid.ui

import android.Manifest
import android.content.pm.PackageManager
import android.speech.SpeechRecognizer
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import app.envoy.hybrid.R
import app.envoy.hybrid.ocr.PhotoReader
import app.envoy.hybrid.voice.LocalDictation
import app.envoy.hybrid.voice.LocalSpeaker
import com.google.firebase.ai.ondevice.OnDeviceModelStatus
import kotlinx.coroutines.launch

// ---------- small pieces ----------

@Composable
private fun Pill(text: String, color: Color, modifier: Modifier = Modifier) = Row(
    modifier.border(1.dp, color.copy(alpha = 0.55f), RoundedCornerShape(50))
        .background(color.copy(alpha = 0.10f), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 5.dp),
    verticalAlignment = Alignment.CenterVertically,
) {
    Box(Modifier.size(7.dp).background(color, CircleShape))
    Spacer(Modifier.width(6.dp))
    Text(text, color = color, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
}

@Composable
private fun Panel(accent: Color = Uv.line, content: @Composable () -> Unit) = Column(
    Modifier.fillMaxWidth().border(1.dp, accent, RoundedCornerShape(18.dp))
        .background(Uv.panel, RoundedCornerShape(18.dp)).padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
) { content() }

@Composable
private fun Heading(text: String, sub: String? = null) = Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
    Text(text, color = Uv.text, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
    if (sub != null) Text(sub, color = Uv.muted, fontSize = 14.sp)
}

@Composable
private fun Label(text: String) = Text(text, color = Uv.muted, fontSize = 12.sp, fontFamily = FontFamily.Monospace, letterSpacing = 1.sp)

/** A sample or source to pick: filled when it's the one in use. */
@Composable
private fun Choice(text: String, selected: Boolean, onClick: () -> Unit) = OutlinedButton(
    onClick = onClick,
    colors = ButtonDefaults.outlinedButtonColors(
        containerColor = if (selected) Uv.green.copy(alpha = 0.14f) else Color.Transparent,
        contentColor = if (selected) Uv.green else Uv.text,
    ),
    border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) Uv.green.copy(alpha = 0.7f) else Uv.line),
    modifier = Modifier.heightIn(min = 48.dp),
) { Text(text, fontSize = 14.sp) }

/** The excerpt with every tag drawn as a coloured chip, so what leaves reads at a glance. */
private fun taggedText(text: String): AnnotatedString = buildAnnotatedString {
    var last = 0
    for ((range, label) in tagRanges(text)) {
        append(text.substring(last, range.first))
        val c = tagColor(label)
        withStyle(SpanStyle(color = c, background = c.copy(alpha = 0.16f), fontWeight = FontWeight.SemiBold)) {
            append(text.substring(range.first, range.last + 1))
        }
        last = range.last + 1
    }
    append(text.substring(last))
}

// ---------- the frame: top bar, steps, sticky actions ----------

@Composable
private fun TopBar(s: UiState) = Row(
    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
    verticalAlignment = Alignment.CenterVertically,
) {
    Image(painterResource(R.drawable.ic_envoy_mark), contentDescription = null, modifier = Modifier.size(30.dp))
    Spacer(Modifier.width(10.dp))
    Text("Envoy", color = Uv.text, fontSize = 24.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
    Spacer(Modifier.weight(1f))
    when {
        !s.deviceChecked -> Pill("Checking…", Uv.muted)
        s.device == OnDeviceModelStatus.AVAILABLE -> Pill("Private · Gemini Nano", Uv.green)
        s.device == OnDeviceModelStatus.DOWNLOADING -> Pill("Nano downloading", Uv.amber)
        else -> Pill("Basic protection", Uv.amber)
    }
}

@Composable
private fun StepIndicator(stage: Stage) = Row(
    Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 8.dp),
    horizontalArrangement = Arrangement.spacedBy(6.dp),
) {
    listOf(Stage.DOCUMENT to "Document", Stage.LEAVES to "What leaves", Stage.ANSWER to "Answer").forEachIndexed { i, (st, name) ->
        val done = st.ordinal < stage.ordinal
        val now = st == stage
        val c = when { now -> Uv.green; done -> Uv.green.copy(alpha = 0.6f); else -> Uv.line }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Box(Modifier.fillMaxWidth().height(4.dp).background(c, RoundedCornerShape(2.dp)))
            Text(
                "${if (done) "✓" else "${i + 1}"}  $name",
                color = if (now) Uv.text else Uv.muted, fontSize = 12.sp,
                fontWeight = if (now) FontWeight.SemiBold else FontWeight.Normal,
                modifier = Modifier.semantics { if (now) contentDescription = "Step ${i + 1} of 3, $name, current" },
            )
        }
    }
}

// ---------- the screen ----------

@Composable
fun EnvoyScreen(vm: EnvoyViewModel) {
    val s by vm.state.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var speakerReady by remember { mutableStateOf<Boolean?>(null) }
    val speaker = remember { LocalSpeaker(context) { speakerReady = it } }
    DisposableEffect(Unit) { onDispose { speaker.shutdown() } }
    var listening by remember { mutableStateOf<SpeechRecognizer?>(null) }
    val stage = stageOf(s)
    val scroll = rememberScrollState()
    LaunchedEffect(stage) { scroll.scrollTo(0) } // each step starts at its top

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
    BackHandler(enabled = stage != Stage.DOCUMENT) { vm.startOver(keepQuestion = stage == Stage.LEAVES) }

    Column(Modifier.fillMaxSize().background(Uv.dark).safeDrawingPadding()) {
        TopBar(s)
        StepIndicator(stage)
        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(scroll).padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            when (stage) {
                Stage.DOCUMENT -> DocumentStep(s, vm, listening != null,
                    onPhoto = { pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    onDictate = if (LocalDictation.available(context)) ({
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) dictate()
                        else askMic.launch(Manifest.permission.RECORD_AUDIO)
                    }) else null,
                )
                Stage.LEAVES -> LeavesStep(s)
                Stage.ANSWER -> AnswerStep(s, speakerReady, onRead = { s.answer?.let { speaker.speak(it.text) } })
            }
            Spacer(Modifier.height(8.dp))
        }

        // The sticky action bar: the one thing to do next is always on screen.
        Column(
            Modifier.fillMaxWidth().background(Uv.panel).padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            s.busy?.let {
                LinearProgressIndicator(Modifier.fillMaxWidth(), color = Uv.green, trackColor = Uv.line)
                Text(it, color = Uv.green, fontSize = 13.sp)
            }
            s.error?.let { Text(it, color = Uv.danger, fontSize = 14.sp) }
            val idle = s.busy == null
            when (stage) {
                Stage.DOCUMENT -> Button(
                    onClick = vm::checkWhatLeaves,
                    enabled = idle && s.doc.isNotBlank() && s.question.isNotBlank(),
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Uv.green, contentColor = Uv.dark),
                ) { Text("Check what leaves  →", fontSize = 16.sp, fontWeight = FontWeight.SemiBold) }
                Stage.LEAVES -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(
                        onClick = { vm.startOver(keepQuestion = true) }, enabled = idle,
                        modifier = Modifier.height(52.dp),
                    ) { Text("Back", color = Uv.text) }
                    Button(
                        onClick = vm::approve, enabled = idle && s.cloudReady,
                        modifier = Modifier.weight(1f).height(52.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Uv.blue, contentColor = Uv.dark),
                    ) { Text("Approve and send", fontSize = 16.sp, fontWeight = FontWeight.SemiBold) }
                }
                Stage.ANSWER -> Button(
                    onClick = { vm.startOver(keepQuestion = false) },
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Uv.raised, contentColor = Uv.text),
                ) { Text("Ask another question", fontSize = 16.sp) }
            }
        }
    }
}

// ---------- step 1: your document and question ----------

@Composable
private fun DocumentStep(s: UiState, vm: EnvoyViewModel, listening: Boolean, onPhoto: () -> Unit, onDictate: (() -> Unit)?) {
    Heading("Ask about a document", "Envoy finds the private details on this phone before anything leaves.")
    Label("YOUR DOCUMENT")
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        s.samples.forEach { sample -> Choice(sample.title, s.docTitle == sample.title) { vm.loadSample(sample) } }
        Choice("Photo", s.docTitle == "Photo", onPhoto)
    }
    OutlinedTextField(
        value = s.doc, onValueChange = { vm.setDoc(s.docTitle.ifBlank { "Pasted text" }, it) },
        label = { Text(s.docTitle.ifBlank { "Paste a document, or pick a sample" }) },
        modifier = Modifier.fillMaxWidth().height(190.dp),
        textStyle = androidx.compose.ui.text.TextStyle(fontSize = 14.sp, color = Uv.text),
    )
    Text("Samples and everyone in them are fictional.", color = Uv.muted, fontSize = 12.sp)
    Label("YOUR QUESTION")
    OutlinedTextField(
        value = s.question, onValueChange = vm::setQuestion, modifier = Modifier.fillMaxWidth(),
        label = { Text("Ask about the document") },
        textStyle = androidx.compose.ui.text.TextStyle(fontSize = 16.sp, color = Uv.text),
    )
    if (onDictate != null) OutlinedButton(onClick = onDictate, modifier = Modifier.heightIn(min = 48.dp)) {
        Text(if (listening) "Stop dictating" else "Dictate on this phone", color = Uv.text)
    }
    if (s.device == OnDeviceModelStatus.DOWNLOADABLE)
        OutlinedButton(onClick = vm::downloadModel, modifier = Modifier.heightIn(min = 48.dp)) { Text("Download Gemini Nano for Private mode") }
}

// ---------- step 2: exactly what leaves ----------

@Composable
private fun LeavesStep(s: UiState) {
    val r = s.review ?: return
    Heading("What leaves this phone", "Nothing is sent until you approve.")
    Panel(accent = Uv.blue.copy(alpha = 0.6f)) {
        Text(leavesSummary(r), color = Uv.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Text(
            if (r.privateMode) "Gemini Nano kept only the parts your question needs."
            else "Basic protection: no Gemini Nano on this phone, so every part is sent, masked. With Gemini Nano, only the parts your question needs.",
            color = if (r.privateMode) Uv.green else Uv.amber, fontSize = 13.sp,
        )
    }
    val found = r.tags.entries()
    if (found.isNotEmpty()) {
        Label("FOUND ON THIS PHONE")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            found.take(8).forEach { (tag, value, _) ->
                val c = tagColor(tag.trim('[', ']').replace(Regex("_\\d+$"), ""))
                Row(
                    Modifier.border(1.dp, Uv.line, RoundedCornerShape(10.dp)).background(Uv.raised, RoundedCornerShape(10.dp))
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(value.take(22), color = Uv.text, fontSize = 13.sp)
                    Text("  →  ", color = Uv.muted, fontSize = 13.sp)
                    Text(tag, color = c, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Monospace)
                }
            }
            if (found.size > 8) Text("+${found.size - 8} more", color = Uv.muted, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp))
        }
    }
    Label("THE CLOUD WILL SEE")
    Panel {
        Text(taggedText(r.excerpt), color = Uv.text, fontFamily = FontFamily.Monospace, fontSize = 13.sp, lineHeight = 20.sp)
    }
}

// ---------- step 3: the answer, restored on this phone ----------

@Composable
private fun AnswerStep(s: UiState, speakerReady: Boolean?, onRead: () -> Unit) {
    val a = s.answer ?: return
    Heading("Your answer", "Your real details were put back on this phone.")
    Panel(accent = Uv.green.copy(alpha = 0.7f)) {
        val text = buildAnnotatedString {
            var last = 0
            for (sp in a.spans) {
                append(a.text.substring(last, sp.start))
                withStyle(SpanStyle(color = Uv.green, fontWeight = FontWeight.SemiBold)) { append(a.text.substring(sp.start, sp.end)) }
                last = sp.end
            }
            append(a.text.substring(last))
        }
        Text(text, color = Uv.text, fontSize = 17.sp, lineHeight = 25.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Pill("Reasoned in the cloud over tags", Uv.blue)
            Pill("Restored on this phone", Uv.green)
        }
        when (speakerReady) {
            true -> OutlinedButton(onClick = onRead, modifier = Modifier.heightIn(min = 48.dp)) { Text("Read aloud on this phone", color = Uv.text) }
            false -> Text("No on-device voice, so Envoy won't read it aloud: an online voice would send your details.", color = Uv.muted, fontSize = 12.sp)
            null -> {}
        }
    }
    if (s.steps.isNotEmpty()) {
        Label("FLIGHT RECORDER")
        Panel {
            s.steps.forEachIndexed { i, st ->
                val cloud = st.where.startsWith("Cloud")
                val c = if (cloud) Uv.blue else Uv.green
                Row(verticalAlignment = Alignment.Top) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(18.dp)) {
                        Box(Modifier.padding(top = 5.dp).size(10.dp).background(c, CircleShape))
                        if (i < s.steps.lastIndex) Box(Modifier.width(2.dp).height(30.dp).background(Uv.line))
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(st.name, color = Uv.text, fontSize = 14.sp)
                        Text("${st.where} · ${st.ms} ms", color = c, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
