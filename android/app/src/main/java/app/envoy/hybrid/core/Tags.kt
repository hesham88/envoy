package app.envoy.hybrid.core

/**
 * Meaning-preserving tags ([LANDLORD], [RENT], [PHONE_2]) and masking: a port of
 * packages/core/src/tags.ts. The tag map lives only in memory; it is never stored or sent.
 */
object Tags {
    private val CURRENCY_CODES = listOf(
        Regex("US\\$|USD|\\$|dollars?", RegexOption.IGNORE_CASE) to "USD",
        Regex("€|EUR|euros?", RegexOption.IGNORE_CASE) to "EUR",
        Regex("£|GBP", RegexOption.IGNORE_CASE) to "GBP",
        Regex("EGP|L\\.E\\.|\\bLE\\b|pounds?|ج\\.م|جنيه", RegexOption.IGNORE_CASE) to "EGP",
    )

    /** A comparison key: the same value written differently gets the same tag (and is caught by the guard). */
    fun canonical(value: String, type: EntityType): String = when (type) {
        EntityType.PHONE -> {
            var d = value.filter { it.isDigit() }
            if (d.startsWith("0020")) d = "0" + d.substring(4)
            else if (d.startsWith("20") && d.length == 12) d = "0" + d.substring(2)
            d
        }
        EntityType.MONEY -> {
            val currency = CURRENCY_CODES.firstOrNull { it.first.containsMatchIn(value) }?.second ?: ""
            val num = Regex("(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?").find(value)?.value ?: ""
            "$currency:${num.replace(",", "").toDoubleOrNull()?.let(::fmtNumber) ?: ""}"
        }
        EntityType.IBAN, EntityType.ACCOUNT, EntityType.NATIONAL_ID, EntityType.CARD, EntityType.SECRET, EntityType.PLATE ->
            value.filter { it.isLetterOrDigit() }.uppercase()
        EntityType.EMAIL -> value.trim().lowercase()
        else -> value.lowercase().replace(Regex("[^\\p{L}\\p{N}]+"), " ").trim()
    }

    private fun base(t: EntityType) = when (t) {
        EntityType.IBAN -> "ACCOUNT"
        EntityType.MONEY -> "AMOUNT"
        else -> t.name
    }

    class TagMap internal constructor(
        private val byKey: Map<String, String>,
        private val byTag: LinkedHashMap<String, Pair<String, EntityType>>,
    ) {
        fun tagOf(e: Entity): String = byKey["${e.type}:${canonical(e.value, e.type)}"] ?: "[${base(e.type)}]"
        fun valueOf(tag: String): String? = byTag[tag]?.first
        fun entries(): List<Triple<String, String, EntityType>> = byTag.map { (tag, v) -> Triple(tag, v.first, v.second) }
    }

    /** The same canonical value always gets the same tag; distinct values sharing a base get _2, _3, … */
    fun assign(entities: List<Entity>): TagMap {
        val byKey = HashMap<String, String>()
        val byTag = LinkedHashMap<String, Pair<String, EntityType>>()
        val counts = HashMap<String, Int>()
        for (e in entities.sortedBy { it.start }) {
            val k = "${e.type}:${canonical(e.value, e.type)}"
            if (k in byKey) continue
            val b = e.role?.uppercase()?.replace(Regex("[^A-Z0-9]+"), "_") ?: base(e.type)
            val n = (counts[b] ?: 0) + 1
            counts[b] = n
            val tag = if (e.type == EntityType.DATE && e.role == null) "[${b}_$n]" else if (n == 1) "[$b]" else "[${b}_$n]"
            byKey[k] = tag
            byTag[tag] = e.value to e.type
        }
        return TagMap(byKey, byTag)
    }

    /** Every entity span replaced by its tag. */
    fun mask(text: String, entities: List<Entity>, tags: TagMap): String {
        val sb = StringBuilder(text)
        for (e in entities.sortedByDescending { it.start }) {
            if (e.start < 0 || e.end > text.length) continue
            sb.replace(e.start, e.end, tags.tagOf(e))
        }
        return sb.toString()
    }

    fun fmtNumber(n: Double): String {
        val r = Math.round(n * 100) / 100.0
        return if (r == Math.floor(r)) "%,d".format(java.util.Locale.US, r.toLong()) else "%,.2f".format(java.util.Locale.US, r).trimEnd('0')
    }
}
