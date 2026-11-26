package app.envoy.hybrid.core

/**
 * Restore, on the phone, after the cloud answers: tags become real values again, and {{RENT * 1.10}}
 * is computed here, so the cloud never sees the real amount (port of expr.ts and restore.ts).
 */
object Restore {
    const val CLOUD_EXPRESSION_INSTRUCTION =
        "When you need a number derived from a tagged amount, write it as {{TAG * factor}} (for example {{RENT * 1.10}}); never guess the real value."

    data class Span(val start: Int, val end: Int, val tag: String, val value: String, val computed: Boolean)
    data class Result(val text: String, val spans: List<Span>, val withheld: List<String>)

    /** A tiny safe evaluator: + - * / % and parentheses over numbers and TAG names. No eval. */
    fun evaluate(expr: String, values: Map<String, Double>): Double? {
        val tokens = mutableListOf<Any>()
        val re = Regex("\\s*(?:(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)|\\[?([A-Z][A-Z0-9_]*)\\]?|([+\\-*/×÷()%]))")
        var i = 0
        while (i < expr.length) {
            if (expr.substring(i).isBlank()) break
            val m = re.matchAt(expr, i) ?: return null
            when {
                m.groups[1] != null -> tokens += m.groupValues[1].replace(",", "").toDouble()
                m.groups[2] != null -> tokens += Name(m.groupValues[2])
                else -> tokens += Op(when (val o = m.groupValues[3]) { "×" -> "*"; "÷" -> "/"; else -> o })
            }
            i = m.range.last + 1
        }
        if (tokens.isEmpty()) return null
        var pos = 0
        fun isOp(o: String) = (tokens.getOrNull(pos) as? Op)?.op == o
        lateinit var sum: () -> Double
        lateinit var factor: () -> Double
        val primary: () -> Double = {
            when (val t = tokens.getOrNull(pos++) ?: throw IllegalStateException()) {
                is Double -> t
                is Name -> values[t.name] ?: throw IllegalStateException()
                is Op -> when (t.op) {
                    "-" -> -factor()
                    "(" -> sum().also { if (!isOp(")")) throw IllegalStateException(); pos++ }
                    else -> throw IllegalStateException()
                }
                else -> throw IllegalStateException()
            }
        }
        factor = {
            var v = primary()
            while (isOp("%")) { pos++; v /= 100 }
            v
        }
        val product: () -> Double = {
            var v = factor()
            while (isOp("*") || isOp("/")) {
                val op = (tokens[pos++] as Op).op
                val r = factor()
                if (op == "/" && r == 0.0) throw IllegalStateException()
                v = if (op == "*") v * r else v / r
            }
            v
        }
        sum = {
            var v = product()
            while (isOp("+") || isOp("-")) {
                val op = (tokens[pos++] as Op).op
                val r = product()
                v = if (op == "+") v + r else v - r
            }
            v
        }
        return try {
            val v = sum()
            if (pos != tokens.size || !v.isFinite()) null else Math.round(v * 100) / 100.0
        } catch (_: IllegalStateException) {
            null
        }
    }

    private data class Name(val name: String)
    private data class Op(val op: String)

    private val LINK = Regex("(?:https?://|ftp://|www\\.|mailto:)\\S+", RegexOption.IGNORE_CASE)

    fun restore(answer: String, tags: Tags.TagMap): Result {
        val links = LINK.findAll(answer).map { it.range }.toList()
        val withheld = mutableListOf<String>()
        val amounts = HashMap<String, Double>()
        val currencies = HashMap<String, String>()
        for ((tag, value, type) in tags.entries()) {
            if (type != EntityType.MONEY) continue
            val (cur, num) = Tags.canonical(value, EntityType.MONEY).split(":").let { it[0] to it.getOrNull(1) }
            val amount = num?.replace(",", "")?.toDoubleOrNull() ?: continue
            amounts[tag.trim('[', ']')] = amount
            currencies[tag.trim('[', ']')] = cur
        }
        val spans = mutableListOf<Span>()
        val sb = StringBuilder()
        var last = 0
        for (m in Regex("\\{\\{\\s*([^{}]*?)\\s*\\}\\}|\\[([A-Z][A-Z0-9_]*)\\]").findAll(answer)) {
            var replacement: String? = null
            var computed = false
            if (links.any { m.range.first in it }) {
                if (m.value !in withheld) withheld += m.value
            } else if (m.groups[2] != null) {
                replacement = tags.valueOf("[${m.groupValues[2]}]")
            } else {
                val expr = m.groupValues[1]
                val result = evaluate(expr, amounts)
                if (result != null) {
                    val cur = currencies.entries.firstOrNull { Regex("\\b${it.key}\\b").containsMatchIn(expr) }?.value
                    replacement = if (!cur.isNullOrEmpty()) "$cur ${Tags.fmtNumber(result)}" else Tags.fmtNumber(result)
                    computed = true
                }
            }
            sb.append(answer, last, m.range.first)
            if (replacement == null) sb.append(m.value) else {
                spans += Span(sb.length, sb.length + replacement.length, m.value, replacement, computed)
                sb.append(replacement)
            }
            last = m.range.last + 1
        }
        sb.append(answer.substring(last))
        return Result(sb.toString(), spans, withheld)
    }
}
