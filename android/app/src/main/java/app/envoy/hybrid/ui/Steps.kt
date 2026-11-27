package app.envoy.hybrid.ui

import java.text.NumberFormat
import java.util.Locale
import kotlin.math.roundToInt

/** The three steps of the app: your document, what leaves, the answer. */
enum class Stage { DOCUMENT, LEAVES, ANSWER }

/** Where the person is: the answer once it exists, what leaves once it's been checked. An error stays on its step. */
fun stageOf(s: UiState): Stage = when {
    s.answer != null -> Stage.ANSWER
    s.review != null -> Stage.LEAVES
    else -> Stage.DOCUMENT
}

/** "20 private details → tags · 2,437 of 2,564 characters (95%)". */
fun leavesSummary(r: Review): String {
    val n = NumberFormat.getIntegerInstance(Locale.US)
    val sent = r.excerpt.length
    val pct = if (r.docChars > 0) (sent * 100.0 / r.docChars).roundToInt() else 0
    val details = if (r.entities.size == 1) "1 private detail" else "${r.entities.size} private details"
    return "$details → tags · ${n.format(sent)} of ${n.format(r.docChars)} characters ($pct%)"
}

private val TAG = Regex("""\[([A-Z][A-Z0-9_]*)]""")

/** Every tag in [text], with its base label: [AMOUNT_2] is an AMOUNT, [PROJECT] a person's own label. */
fun tagRanges(text: String): List<Pair<IntRange, String>> =
    TAG.findAll(text).map { m -> m.range to m.groupValues[1].replace(Regex("_\\d+$"), "") }.toList()

/** Where "Report this answer" goes: the project's public developer contact (the commit author). */
const val REPORT_ADDRESS = "hesham1988@gmail.com"

/**
 * Google Play's AI-content policy: people can report an offensive answer to the developer. The
 * report carries the answer as the cloud wrote it, with tags, never the details restored on the
 * phone, so a report can't leak what Envoy kept private.
 */
fun reportEmail(a: Answer): Pair<String, String> {
    val tagged = a.tagged.ifBlank { "(not available)" }
    return "Envoy: report an AI answer" to
        "What was wrong with this answer? (optional)\n\n\n" +
        "The answer as the cloud wrote it (tags, not your details):\n$tagged\n\n" +
        "Sent from Envoy for Android. Your real details are not included."
}
