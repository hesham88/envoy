package app.envoy.hybrid.core

/**
 * The parts of Envoy's pipeline that need no model, so they are the same with or without one and
 * fully unit-tested: clauses, the code-gate for what the on-device model suggests, the excerpt that
 * may leave the phone, and the cloud prompt.
 */
object Pipeline {
    data class Clause(val id: Int, val text: String, val start: Int)

    /** Paragraphs (blank-line separated), long ones split at numbered headings ("7. Rent."). */
    fun clauses(text: String): List<Clause> {
        val out = mutableListOf<Clause>()
        var id = 0
        Regex("(?:[^\\n]|\\n(?!\\s*\\n))+").findAll(text).forEach { para ->
            val t = para.value.trim()
            if (t.isNotEmpty()) out += Clause(id++, t, para.range.first + para.value.indexOf(t))
        }
        return out
    }

    /**
     * What the on-device model suggests is accepted only if it appears word for word in the
     * document and is short enough to be a detail (a model can invent or over-reach; code decides).
     * Lines look like "PERSON | Karim Fathy | landlord".
     */
    fun acceptSuggestions(text: String, modelOutput: String, known: List<Entity>): List<Entity> {
        val found = mutableListOf<Entity>()
        for (line in modelOutput.lines()) {
            val parts = line.split("|").map { it.trim() }
            if (parts.size < 2) continue
            val type = when (parts[0].uppercase()) {
                "PERSON", "NAME" -> EntityType.PERSON
                "ORG", "ORGANIZATION", "COMPANY" -> EntityType.ORG
                "ADDRESS" -> EntityType.ADDRESS
                "MONEY", "AMOUNT" -> EntityType.MONEY
                else -> null
            } ?: continue
            val value = parts[1].trim('"', '\'', '.', ',')
            if (value.length < 3 || value.length > 60 || value.count { it == ' ' } > 5) continue
            val role = parts.getOrNull(2)?.takeIf { Regex("^[A-Za-z][A-Za-z _]{1,23}$").matches(it) }
            var from = 0
            while (true) {
                val at = text.indexOf(value, from)
                if (at < 0) break
                val e = Entity(type, value, at, at + value.length, source = "on-device", role = role)
                // Rules win on overlap; a role the model gave is kept on the rules entity.
                if (known.none { it.start < e.end && e.start < it.end } && found.none { it.start < e.end && e.start < it.end }) found += e
                from = at + value.length
            }
        }
        return found
    }

    /** Roles the model gave to amounts that rules found (e.g. EGP 8,500 is the RENT). */
    fun withRoles(rules: List<Entity>, suggestions: List<Entity>, text: String, modelOutput: String): List<Entity> {
        val roleByValue = modelOutput.lines().mapNotNull { l ->
            val p = l.split("|").map { it.trim() }
            if (p.size >= 3 && p[2].isNotEmpty() && Regex("^[A-Za-z][A-Za-z _]{1,23}$").matches(p[2])) p[1] to p[2] else null
        }.toMap()
        return (rules.map { e -> roleByValue[e.value]?.let { e.copy(role = it) } ?: e } + suggestions).sortedBy { it.start }
    }

    /** The excerpt that may leave the phone: the chosen clauses, every detail a tag. */
    fun outbound(text: String, clauseIds: Set<Int>, entities: List<Entity>, tags: Tags.TagMap): String =
        clauses(text).filter { it.id in clauseIds }.joinToString("\n\n") { c ->
            val inside = entities.filter { it.start >= c.start && it.end <= c.start + c.text.length }
                .map { it.copy(start = it.start - c.start, end = it.end - c.start) }
            Tags.mask(c.text, inside, tags)
        }

    /** The tags the excerpt actually contains: the only ones the cloud may use. */
    fun tagsIn(excerpt: String): List<String> = Regex("\\[[A-Z][A-Z0-9_]*]").findAll(excerpt).map { it.value }.distinct().toList()

    fun cloudPrompt(question: String, excerpt: String): String = """
        You answer a question about a private document. You see only an excerpt, and every personal
        detail in it is a tag in square brackets. Use only these tags, exactly as written, and never
        invent a new one or a real name or number: ${tagsIn(excerpt).joinToString(" ").ifEmpty { "(none)" }}.
        To say who someone is, write the tag and their role in words ("[PERSON], the landlord").
        ${Restore.CLOUD_EXPRESSION_INSTRUCTION}
        Answer in plain English, in at most four sentences.

        Excerpt:
        $excerpt

        Question: $question
    """.trimIndent()

    /** Text the on-device model reads to find names and roles (short: the on-device limit is 4,000 tokens). */
    fun detectPrompt(text: String): String = """
        List the people, organisations, street addresses and money amounts in this document.
        One per line, as: TYPE | exact text | role. TYPE is PERSON, ORG, ADDRESS or MONEY. The role is
        one or two words (landlord, tenant, rent, deposit, salary). Copy the text exactly. No other words.

        Document:
        ${text.take(6000)}
    """.trimIndent()

    fun selectPrompt(question: String, clauses: List<Clause>): String = """
        Which numbered parts of this document are needed to answer the question? Reply with the
        numbers only, separated by commas.

        Question: $question

        ${clauses.joinToString("\n") { "${it.id}. ${it.text.take(400)}" }}
    """.trimIndent()

    fun parseIds(output: String, max: Int): Set<Int> =
        Regex("\\d+").findAll(output).mapNotNull { it.value.toIntOrNull() }.filter { it in 0 until max }.toSet()
}
