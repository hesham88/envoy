package app.envoy.hybrid.core

/**
 * Person-like names and companies the rules can't know about: a port of packages/core/src/names.ts.
 * Used in Basic protection (no on-device model) and alongside it in Private mode, so a name is
 * masked even when Gemini Nano is not on the phone. ParityTest checks it against the TypeScript engine.
 */
object Names {
    private val STOPWORDS = (
        "the this that these those either each any both all residential lease agreement landlord tenant premises arab republic egypt cairo maadi road street clause clauses rent deposit utilities maintenance payment entry termination notices governing signed building flat use parties term contract notice page january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday patient record member billing contractor client company employee employer section schedule annex appendix subject terms conditions invoice account statement policy dear hello hi thanks thank regards best kind please our your my we you they he she it its can could would should will may might also reach about from with google chrome envoy firebase gemini nano gmail chatgpt claude project salary base bonus fee fees balance principal interest loan amount total due price tax cause without with physician referring diagnosis treatment medication results report summary notes milestone milestones scope services delivery warranty liability confidentiality insurance benefits compensation position title offer letter leave probation duties hours start end effective date law laws general provisions definitions overview purpose responsibilities obligations confidential period currency opening closing transaction transactions description debit credit withdrawal withdrawals deposits reference number details type usd eur egp gbp aed sar inc ltd llc corp co gmbh plc llp sae test result accession specimen laboratory laboratories lab labs collected panel metabolic fasting glucose vitamin refund refunds national phone email address mrn"
        ).split(" ").toSet()

    private val PATTERNS = listOf(
        Regex("\\b(?:Mr|Mrs|Ms|Miss|Dr|Prof|Eng)\\.?[ \\t]+[A-Z][a-z]+(?:[ \\t]+[A-Z][a-z]+)*"),
        Regex("\\b[A-Z][a-z]{2,}(?:-[A-Z][a-z]+)*(?:[ \\t]+(?:El|Al|Abdel|Abd|Abu|Bin|Ibn|de|van|von))?(?:[ \\t]+[A-Z][a-z]+(?:-[A-Z][a-z]+)*)+"),
        Regex("\\b[A-Z]{3,}(?:[ \\t]+[A-Z]{3,})+\\b"),
    )
    private val COMPANY =
        Regex("\\b[A-Z][A-Za-z&'-]+(?:[ \\t]+[A-Z][A-Za-z&'-]+)*[ \\t]+(?:Inc|Ltd|LLC|Corp|GmbH|PLC|LLP|S\\.?A\\.?E)\\b\\.?")

    private fun overlaps(a: Entity, b: Entity) = a.start < b.end && b.start < a.end

    fun flag(text: String, taken: List<Entity>, context: String = ""): List<Entity> {
        val out = mutableListOf<Entity>()
        for (m in COMPANY.findAll(text)) {
            val e = Entity(EntityType.ORG, m.value, m.range.first, m.range.last + 1)
            if ((taken + out).none { overlaps(it, e) }) out += e
        }
        val haystack = "$text\n$context".replace(Regex("\\S+@\\S+|(?:https?://|www\\.)\\S+"), " ")
        fun lowerElsewhere(value: String): Boolean {
            val words = value.split(Regex("[^A-Za-z]+")).filter { it.isNotEmpty() }
            if (words.isEmpty() || value == value.lowercase()) return false
            return Regex("(?<![A-Za-z])" + words.joinToString("[ \\t-]+") { it.lowercase() } + "(?![A-Za-z])")
                .containsMatchIn(haystack)
        }
        for ((i, re) in PATTERNS.withIndex()) {
            for (m in re.findAll(text)) {
                val spans = mutableListOf<IntRange>()
                if (i == 0) spans += m.range.first..m.range.last + 1
                else {
                    var runStart = -1
                    var runEnd = -1
                    var n = 0
                    fun flush() {
                        if (n >= 2) spans += runStart..runEnd
                        runStart = -1; runEnd = -1; n = 0
                    }
                    for (w in Regex("\\S+").findAll(m.value)) {
                        val start = m.range.first + w.range.first
                        if (w.value.split("-").any { it.lowercase() in STOPWORDS }) flush()
                        else if (n == 0) { runStart = start; runEnd = start + w.value.length; n = 1 }
                        else { runEnd = start + w.value.length; n++ }
                    }
                    flush()
                }
                for (r in spans) {
                    val e = Entity(EntityType.PERSON, text.substring(r.first, r.last), r.first, r.last)
                    if (i != 0 && lowerElsewhere(e.value)) continue
                    if ((taken + out).none { overlaps(it, e) }) out += e
                }
            }
        }
        return out.sortedBy { it.start }
    }
}
