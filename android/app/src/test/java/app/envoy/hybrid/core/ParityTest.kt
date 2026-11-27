package app.envoy.hybrid.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Android engine must find what the web engine finds. parity.json is written by
 * scripts/export-android-fixtures.mjs from @envoy/core itself (the five sample documents and edge
 * cases), so a change on either side that breaks parity fails here.
 */
class ParityTest {
    private val fixtures = JSONObject(javaClass.classLoader!!.getResource("parity.json")!!.readText())

    @Test
    fun `rules find exactly what the TypeScript engine finds`() {
        val cases = fixtures.getJSONArray("rules")
        var total = 0
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val text = c.getString("text")
            val expected = c.getJSONArray("entities").let { a ->
                (0 until a.length()).map { a.getJSONObject(it).let { e -> "${e.getString("type")} ${e.getInt("start")}-${e.getInt("end")} ${e.getString("value")}" } }
            }
            val actual = Rules.detect(text).map { "${it.type} ${it.start}-${it.end} ${it.value}" }
            assertEquals("case $i: ${text.take(60)}", expected, actual)
            total += expected.size
        }
        assertTrue("expected a meaningful fixture, got $total entities", total > 60)
    }

    @Test
    fun `names and companies match the TypeScript engine`() {
        val cases = fixtures.getJSONArray("rules")
        var total = 0
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val text = c.getString("text")
            val expected = c.getJSONArray("names").let { a ->
                (0 until a.length()).map { a.getJSONObject(it).let { e -> "${e.getString("type")} ${e.getInt("start")}-${e.getInt("end")} ${e.getString("value")}" } }
            }
            val actual = Names.flag(text, Rules.detect(text)).map { "${it.type} ${it.start}-${it.end} ${it.value}" }
            assertEquals("case $i: ${text.take(60)}", expected, actual)
            total += expected.size
        }
        assertTrue("expected names in the samples, got $total", total > 10)
    }

    @Test
    fun `the outbound guard catches the same raw values`() {
        val guard = fixtures.getJSONObject("guard")
        val protected = Rules.detect(guard.getString("lease"))
        val cases = guard.getJSONArray("cases")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val expected = c.getJSONArray("leaks").let { a -> (0 until a.length()).map { a.getString(it) }.toSet() }
            val actual = Guard.checkOutbound(c.getString("outbound"), protected).map { it.type.name }.toSet()
            assertEquals(c.getString("outbound"), expected, actual)
        }
    }
}

class RestoreTest {
    @Test
    fun `tags come back and the maths is done on the phone`() {
        val text = "7. Rent. The monthly rent is EGP 8,500, paid to Karim Fathy."
        val rules = Rules.detect(text).map { if (it.type == EntityType.MONEY) it.copy(role = "rent") else it }
        val tags = Tags.assign(rules)
        val r = Restore.restore("Not by 20%. [RENT] can rise to at most {{RENT * 1.10}}.", tags)
        assertEquals("Not by 20%. EGP 8,500 can rise to at most EGP 9,350.", r.text)
        assertEquals(listOf(false, true), r.spans.map { it.computed })
    }

    @Test
    fun `a tag inside a link is never restored`() {
        val tags = Tags.assign(Rules.detect("Email mona.adel@example.com"))
        val r = Restore.restore("See https://evil.example/?id=[EMAIL] or write to [EMAIL].", tags)
        assertTrue(r.text.contains("?id=[EMAIL]"))
        assertTrue(r.text.endsWith("write to mona.adel@example.com."))
        assertEquals(listOf("[EMAIL]"), r.withheld)
    }

    @Test
    fun `the evaluator is safe and small`() {
        assertEquals(9350.0, Restore.evaluate("RENT * 1.10", mapOf("RENT" to 8500.0))!!, 0.001)
        assertEquals(null, Restore.evaluate("RENT * 1.10", emptyMap()))
        assertEquals(null, Restore.evaluate("1 / 0", emptyMap()))
        assertEquals(null, Restore.evaluate("System.exit(0)", emptyMap()))
    }
}

class PipelineTest {
    private val doc = "1. Parties. Karim Fathy leases to Mona Adel.\n\n7. Rent. The monthly rent is EGP 8,500.\n\n8. Pay to EG38 0019 0005 0000 0000 2631 8000 2."

    @Test
    fun `the code-gate keeps only what is written in the document`() {
        val rules = Rules.detect(doc)
        val out = "PERSON | Karim Fathy | landlord\nPERSON | Hesham Invented | tenant\nMONEY | EGP 8,500 | rent\nnonsense line"
        val accepted = Pipeline.acceptSuggestions(doc, out, rules)
        assertEquals(listOf("Karim Fathy"), accepted.map { it.value })
        val all = Pipeline.withRoles(rules, accepted, doc, out)
        assertEquals("rent", all.first { it.type == EntityType.MONEY }.role)
    }

    @Test
    fun `only the chosen parts leave, and every detail is a tag`() {
        val rules = Rules.detect(doc)
        val out = "PERSON | Karim Fathy | landlord\nMONEY | EGP 8,500 | rent"
        val entities = Pipeline.withRoles(rules, Pipeline.acceptSuggestions(doc, out, rules), doc, out)
        val tags = Tags.assign(entities)
        val excerpt = Pipeline.outbound(doc, setOf(1), entities, tags)
        assertEquals("7. Rent. The monthly rent is [RENT].", excerpt)
        assertEquals(emptyList<Guard.Leak>(), Guard.checkOutbound(excerpt, entities))
        assertEquals(setOf(0, 2), Pipeline.parseIds("0, 2, 9", 3))
    }

    @Test
    fun `Basic protection masks names too (found on the emulator, 27 Nov)`() {
        val fixtures = JSONObject(javaClass.classLoader!!.getResource("parity.json")!!.readText())
        val lease = fixtures.getJSONObject("guard").getString("lease")
        val rules = Rules.detect(lease)
        val entities = (rules + Names.flag(lease, rules, "Can my landlord raise the rent?")).sortedBy { it.start }
        val excerpt = Pipeline.outbound(lease, Pipeline.clauses(lease).map { it.id }.toSet(), entities, Tags.assign(entities))
        for (name in listOf("Karim Fathy", "Mona Adel")) assertTrue("$name leaked", !excerpt.contains(name))
        assertEquals(emptyList<Guard.Leak>(), Guard.checkOutbound(excerpt, entities))
    }
}
