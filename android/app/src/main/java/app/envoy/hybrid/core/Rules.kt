package app.envoy.hybrid.core

/**
 * Deterministic detectors for structured personal data: a Kotlin port of packages/core/src/rules.ts.
 * They run on every document, with or without the on-device model, so protection never drops on a
 * phone without AICore. ParityTest checks them against what the TypeScript engine finds.
 */
enum class EntityType { PERSON, ORG, ADDRESS, EMAIL, PHONE, NATIONAL_ID, IBAN, ACCOUNT, CARD, MONEY, DATE, SECRET, PLATE }

data class Entity(
    val type: EntityType,
    val value: String,
    val start: Int,
    val end: Int,
    val source: String = "rules",
    /** Role in the document (landlord, rent, …), used for meaning-preserving tags. */
    val role: String? = null,
)

private class Detector(
    val type: EntityType,
    val priority: Int,
    val pattern: Regex,
    val group: Int = 0,
    val accept: ((String) -> String?)? = null,
)

object Rules {
    private val IBAN_LENGTHS = mapOf(
        "EG" to 29, "GB" to 22, "DE" to 22, "FR" to 27, "AE" to 23, "SA" to 24, "NL" to 18, "ES" to 24, "IT" to 27,
    )

    fun isValidIban(raw: String): Boolean {
        val s = raw.replace(Regex("[\\s.-]+"), "").uppercase()
        if (!Regex("^[A-Z]{2}\\d{2}[A-Z0-9]{11,30}$").matches(s)) return false
        IBAN_LENGTHS[s.substring(0, 2)]?.let { if (s.length != it) return false }
        var remainder = 0
        for (ch in s.substring(4) + s.substring(0, 4)) {
            val v = if (ch in 'A'..'Z') (ch.code - 55).toString() else ch.toString()
            for (d in v) remainder = (remainder * 10 + (d - '0')) % 97
        }
        return remainder == 1
    }

    fun isLuhn(raw: String): Boolean {
        val digits = raw.replace(Regex("[\\s.-]"), "")
        if (!Regex("^\\d{13,19}$").matches(digits)) return false
        var sum = 0
        for (i in digits.indices) {
            var d = digits[digits.length - 1 - i] - '0'
            if (i % 2 == 1) {
                d *= 2
                if (d > 9) d -= 9
            }
            sum += d
        }
        return sum % 10 == 0
    }

    private val GOVERNORATES = setOf("01", "02", "03", "04", "88") + (11..35).map { it.toString() }

    /** Structure check (century, birth date, governorate), as in the TypeScript engine. */
    fun isEgyptianNationalId(raw: String): Boolean {
        val s = raw.replace(Regex("[\\s.-]+"), "")
        if (!Regex("^[23]\\d{13}$").matches(s)) return false
        val year = (if (s[0] == '2') 1900 else 2000) + s.substring(1, 3).toInt()
        val month = s.substring(3, 5).toInt()
        val day = s.substring(5, 7).toInt()
        if (month !in 1..12 || day < 1) return false
        val leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
        val days = intArrayOf(31, if (leap) 29 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
        if (day > days[month - 1]) return false
        return s.substring(7, 9) in GOVERNORATES
    }

    private const val DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE"

    /** Spanish DNI (8 digits + letter) or NIE (X/Y/Z + 7 digits + letter), with its check letter. */
    fun isSpanishId(raw: String): Boolean {
        val s = raw.replace(Regex("[\\s-]+"), "").uppercase()
        val m = Regex("^([XYZ]?)(\\d{7,8})([A-Z])$").find(s) ?: return false
        val (prefix, num, letter) = m.destructured
        val digits = if (prefix.isNotEmpty()) "${"XYZ".indexOf(prefix)}$num" else num
        if (digits.length != 8) return false
        return DNI_LETTERS[(digits.toLong() % 23).toInt()].toString() == letter
    }

    /** French social security number (NIR) with its key, 97 - n mod 97 (Corsica 2A/2B). */
    fun isFrenchNir(raw: String): Boolean {
        val s = raw.replace(Regex("\\s+"), "").uppercase()
        val m = Regex("^([12]\\d{4})(\\d{2}|2A|2B)(\\d{6})(\\d{2})$").find(s) ?: return false
        val (a, d, b, key) = m.destructured
        val dept = when (d) { "2A" -> "19"; "2B" -> "18"; else -> d }
        val n = java.math.BigInteger("$a$dept$b")
        return 97 - n.mod(java.math.BigInteger.valueOf(97)).toInt() == key.toInt()
    }

    private const val MONTHS =
        "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)"
    private const val NUMBER = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?"
    private const val CURRENCY_BEFORE = "(?:EGP|USD|EUR|GBP|LE|L\\.E\\.|US\\$|\\$|€|£)"
    private const val CURRENCY_AFTER = "(?:EGP|USD|EUR|GBP|LE|L\\.E\\.|pounds|dollars|euros|ج\\.م|جنيه)"

    private val DETECTORS = listOf(
        Detector(EntityType.SECRET, -1, Regex("-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----")),
        Detector(
            EntityType.SECRET, -1,
            Regex("\\b(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|xox[abprs]-[A-Za-z0-9-]{10,}|(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}|sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|glpat-[A-Za-z0-9_-]{20,})"),
        ),
        Detector(EntityType.SECRET, -1, Regex("\\beyJ[A-Za-z0-9_-]{8,}\\.eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}")),
        Detector(
            EntityType.SECRET, -1,
            Regex(
                "(?<![A-Za-z0-9])(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\\b[\"']?[ \\t]*[:=][ \\t]*[\"']?([^\\s\"',;]{6,})",
                RegexOption.IGNORE_CASE,
            ),
            group = 1,
        ),
        Detector(
            EntityType.ACCOUNT, 8,
            Regex(
                "(?<!\\p{L})(?:(?:bank\\s+)?account|acct|a/c|card|policy|member(?:ship)?|customer|client|reference|ref|invoice|passport|licen[cs]e|national\\s+id|id|ssn|social\\s+security|tax|routing|sort\\s+code|swift|bic|meter|contract|mrn|medical\\s+record|patient|claim|accession|specimen|employee|staff|payroll|badge)(?:\\s+(?:number|no\\.?|num|#|id|code))?\\s*(?:is\\s+|:\\s*|=\\s*|#\\s*)?((?:[A-Z]{1,4}[ -]?)?\\d[\\d -]{4,30}\\d)(?![\\p{L}\\p{N}])",
                setOf(RegexOption.IGNORE_CASE),
            ),
            group = 1,
            accept = { v -> if (v.count { it.isDigit() } >= 6) v.trim() else null },
        ),
        Detector(
            EntityType.IBAN, 0, Regex("\\b[A-Z]{2}\\d{2}(?:[ .-]?[A-Z0-9]{4}){2,7}(?:[ .-]?[A-Z0-9]{1,4})?\\b"),
            accept = { v ->
                if (isValidIban(v)) v else {
                    val shorter = v.replace(Regex("[ .-]?[A-Z0-9]{1,4}$"), "")
                    if (shorter != v && isValidIban(shorter)) shorter else null
                }
            },
        ),
        Detector(
            EntityType.NATIONAL_ID, 1, Regex("(?<!\\d)[23]\\d{3}[ .-]?\\d{4}[ .-]?\\d{4}[ .-]?\\d{2}(?!\\d)"),
            accept = { v -> if (isEgyptianNationalId(v)) v else null },
        ),
        Detector(EntityType.EMAIL, 2, Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}")),
        Detector(EntityType.PHONE, 3, Regex("\\+[1-9]\\d{0,2}(?:[ .\\-/()]{0,2}\\d){6,13}(?!\\d)")),
        Detector(EntityType.PHONE, 3, Regex("(?<!\\d)00[1-9]\\d{0,2}(?:[ .\\-/()]{0,2}\\d){6,13}(?!\\d)")),
        Detector(EntityType.PHONE, 3, Regex("(?<![\\d(])\\(?01[0125]\\)?(?:[ .\\-/]{0,2}\\d){8}(?!\\d)")),
        Detector(EntityType.PHONE, 3, Regex("(?<![\\d(])\\(?0[23]\\)?(?:[ .\\-/]{0,2}\\d){8}(?!\\d)")),
        Detector(EntityType.CARD, 4, Regex("(?<!\\d)(?:\\d[ .-]?){12,18}\\d(?!\\d)"), accept = { v -> if (isLuhn(v)) v else null }),
        Detector(EntityType.MONEY, 5, Regex("(?<![A-Za-z])$CURRENCY_BEFORE ?$NUMBER(?![\\d%])")),
        Detector(EntityType.MONEY, 5, Regex("(?<![\\d.,])$NUMBER ?$CURRENCY_AFTER(?![A-Za-z])")),
        Detector(EntityType.DATE, 6, Regex("\\b\\d{1,2} $MONTHS,? \\d{4}\\b")),
        Detector(EntityType.DATE, 6, Regex("\\b$MONTHS \\d{1,2}, \\d{4}\\b")),
        Detector(EntityType.DATE, 6, Regex("\\b\\d{1,2}/\\d{1,2}/\\d{4}\\b")),
        Detector(EntityType.DATE, 6, Regex("\\b\\d{4}-\\d{2}-\\d{2}\\b")),
        // ---------- Spanish, French and German formats ----------
        Detector(
            EntityType.NATIONAL_ID, 1, Regex("(?<![A-Za-z0-9])(?:[XYZ][ -]?\\d{7}|\\d{8})[ -]?[A-Z](?![A-Za-z0-9])"),
            accept = { v -> if (isSpanishId(v)) v else null },
        ),
        Detector(
            EntityType.NATIONAL_ID, 1, Regex("(?<!\\d)[12] ?\\d{2} ?\\d{2} ?(?:\\d{2}|2[AB]) ?\\d{3} ?\\d{3} ?\\d{2}(?!\\d)"),
            accept = { v -> if (isFrenchNir(v)) v else null },
        ),
        Detector(EntityType.PHONE, 3, Regex("(?<![\\d+])0[1-9](?:[ .-]\\d{2}){4}(?![\\d])")),
        Detector(
            EntityType.MONEY, 5,
            Regex("(?<![\\d.,])\\d{1,3}(?:[. \\u00a0\\u202f]\\d{3})*(?:,\\d{1,2})? ?(?:€|EUR|euros?)(?![A-Za-z])"),
        ),
        Detector(
            EntityType.DATE, 6,
            // (?iu): Unicode case folding, like the TypeScript engine's `iu` flags ("Décembre", "AOÛT").
            Regex(
                "(?iu)\\b\\d{1,2} de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre) de \\d{4}\\b",
            ),
        ),
        Detector(
            EntityType.DATE, 6,
            Regex(
                "(?iu)(?<![\\p{L}\\d])(?:1er|\\d{1,2}) (?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) \\d{4}\\b",
            ),
        ),
        Detector(
            EntityType.DATE, 6,
            Regex("(?<![\\p{L}\\d])\\d{1,2}\\. (?:Januar|Jänner|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember) \\d{4}\\b"),
        ),
        Detector(EntityType.DATE, 6, Regex("\\b\\d{1,2}\\.\\d{1,2}\\.\\d{4}\\b")),
        Detector(
            EntityType.PLATE, 7,
            Regex(
                "(?<!\\p{L})(?:(?:[Ll]icen[cs]e|[Nn]umber|[Vv]ehicle|[Cc]ar)\\s+)?(?:[Pp]late|[Rr]egistration|[Rr]eg\\.?|[Vv]ehicle|[Cc]ar)(?:\\s+(?:[Nn]umber|[Nn]o\\.?|[Nn]um|#|[Mm]ark|[Pp]late))?\\s*(?:is\\s+|:\\s*|#\\s*)?([A-Z0-9]{1,4}(?:[ -]?[A-Z0-9]{1,4}){1,3})(?![\\p{L}\\p{N}])",
            ),
            group = 1,
            accept = { v ->
                val alnum = v.replace(Regex("[^A-Z0-9]"), "")
                if (alnum.length in 4..9 && alnum.length == v.replace(Regex("[ -]"), "").length &&
                    alnum.any { it.isDigit() } && alnum.any { it in 'A'..'Z' }
                ) v.trim() else null
            },
        ),
        Detector(
            EntityType.PLATE, 7,
            Regex("(?<![A-Z0-9-])(?:[A-Z]{2}\\d{2} ?[A-Z]{3}|[A-Z]{2}-\\d{3}-[A-Z]{2}|[A-ZÄÖÜ]{1,3}-[A-Z]{1,2} \\d{1,4}[EH]?)(?![A-Z0-9-])"),
        ),
        Detector(
            EntityType.ADDRESS, 7,
            Regex("\\b\\d{1,4} (?:[A-Z][\\w-]* ){0,3}(?:St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard)\\b\\.?(?: \\d{1,4})?(?:, ?[A-Z0-9][\\w-]*(?: [A-Z0-9][\\w-]*)*)+"),
        ),
    )

    /** Arabic-Indic digits read as ASCII digits; one character for one, so offsets don't move. */
    fun normalizeDigits(text: String): String = buildString(text.length) {
        for (ch in text) append(
            when (ch) {
                in '\u0660'..'\u0669' -> '0' + (ch - '\u0660')
                in '\u06F0'..'\u06F9' -> '0' + (ch - '\u06F0')
                else -> ch
            },
        )
    }

    /** Runs every detector; on overlap the higher-priority (then longer) match wins. */
    fun detect(text: String): List<Entity> {
        val norm = normalizeDigits(text)
        data class Candidate(val e: Entity, val priority: Int)
        val candidates = mutableListOf<Candidate>()
        for (d in DETECTORS) for (m in d.pattern.findAll(norm)) {
            val g = m.groups[d.group] ?: continue
            if (g.value.isEmpty()) continue
            val accepted = d.accept?.invoke(g.value) ?: if (d.accept == null) g.value else null
            if (accepted == null) continue
            val start = g.range.first
            val end = start + accepted.length
            candidates += Candidate(Entity(d.type, text.substring(start, end), start, end), d.priority)
        }
        candidates.sortWith(compareBy<Candidate> { it.priority }.thenByDescending { it.e.end - it.e.start })
        val kept = mutableListOf<Entity>()
        for (c in candidates) if (kept.none { it.start < c.e.end && c.e.start < it.end }) kept += c.e
        return kept.sortedBy { it.start }
    }
}
