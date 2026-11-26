package app.envoy.hybrid.core

/**
 * The last check before anything leaves the phone: the outbound text is searched for every raw
 * value, however it is written (spaced, dashed, run together, upper or lower case, "at" for "@").
 * Anything raw blocks the send. A smaller port of packages/core/src/guard.ts; ParityTest runs the
 * TypeScript engine's own guard cases.
 */
object Guard {
    data class Leak(val type: EntityType, val value: String)

    private fun compact(s: String) = s.filter { it.isLetterOrDigit() }.uppercase()

    fun checkOutbound(outbound: String, protected: List<Entity>): List<Leak> {
        val leaks = mutableListOf<Leak>()
        val out = Rules.normalizeDigits(outbound)
        val outCompact = compact(out)
        val outLower = out.lowercase()
        for (p in protected) {
            val hit = when (p.type) {
                EntityType.PHONE, EntityType.IBAN, EntityType.ACCOUNT, EntityType.NATIONAL_ID,
                EntityType.CARD, EntityType.SECRET, EntityType.PLATE -> {
                    val v = compact(p.value)
                    val local = if (p.type == EntityType.PHONE) Tags.canonical(p.value, EntityType.PHONE) else v
                    // Long enough to be the value, not a coincidence.
                    (v.length >= 6 && outCompact.contains(v)) ||
                        (p.type == EntityType.PHONE && local.length >= 8 && outCompact.contains(local.trimStart('0'))) ||
                        (p.type == EntityType.PHONE && v.length >= 8 && outCompact.contains(v.takeLast(9)))
                }
                EntityType.MONEY -> {
                    val num = Regex("(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?").find(p.value)?.value?.replace(",", "")
                    num != null && num.length >= 3 && Regex("(?<![\\d.,])" + Regex.escape(num).let { n ->
                        // 8500 also as 8,500
                        val withCommas = Tags.fmtNumber(num.toDouble())
                        "(?:$n|${Regex.escape(withCommas)})"
                    } + "(?![\\d,]\\d)").containsMatchIn(out)
                }
                EntityType.EMAIL -> {
                    val e = p.value.lowercase()
                    val defanged = e.replace("@", " at ").replace(".", " dot ")
                    outLower.contains(e) || outLower.replace(Regex("\\s+"), " ").contains(defanged.replace(Regex("\\s+"), " "))
                }
                else -> {
                    val words = p.value.lowercase().split(Regex("[^\\p{L}\\p{N}]+")).filter { it.length > 1 }
                    words.isNotEmpty() && Regex(
                        "(?<![\\p{L}\\p{N}])" + words.joinToString("[^\\p{L}\\p{N}]+") { Regex.escape(it) } + "(?![\\p{L}\\p{N}])",
                    ).containsMatchIn(outLower)
                }
            }
            if (hit) leaks += Leak(p.type, p.value)
        }
        return leaks
    }
}
