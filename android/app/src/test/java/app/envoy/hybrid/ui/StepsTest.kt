package app.envoy.hybrid.ui

import app.envoy.hybrid.core.Entity
import app.envoy.hybrid.core.EntityType
import app.envoy.hybrid.core.Restore
import app.envoy.hybrid.core.Tags
import org.junit.Assert.assertEquals
import org.junit.Test

class StepsTest {
    private val entities = List(20) { Entity(EntityType.EMAIL, "p$it@example.com", it * 20, it * 20 + 15) }
    private val review = Review(
        entities = entities,
        tags = Tags.assign(entities),
        excerpt = "x".repeat(2437),
        docChars = 2564,
        privateMode = false,
    )

    @Test
    fun `the stage follows the state, and an error keeps you where you are`() {
        assertEquals(Stage.DOCUMENT, stageOf(UiState()))
        assertEquals(Stage.LEAVES, stageOf(UiState(review = review)))
        assertEquals(Stage.LEAVES, stageOf(UiState(review = review, error = "App Check didn't accept this copy")))
        assertEquals(Stage.ANSWER, stageOf(UiState(review = review, answer = Answer("ok", emptyList<Restore.Span>(), emptyList()))))
    }

    @Test
    fun `the what-leaves line counts details, characters and the share sent`() {
        assertEquals("20 private details → tags · 2,437 of 2,564 characters (95%)", leavesSummary(review))
    }

    @Test
    fun `tags with an index and the user's own labels are all found`() {
        val text = "[PERSON] pays [AMOUNT_2] to [PROJECT]."
        val found = tagRanges(text)
        assertEquals(listOf("PERSON", "AMOUNT", "PROJECT"), found.map { it.second })
        assertEquals("[AMOUNT_2]", text.substring(found[1].first))
    }
}

class ReportTest {
    @Test
    fun `a report carries the answer as the cloud wrote it, never the restored details`() {
        val a = Answer(
            text = "No, Karim Fathy cannot raise the rent of EGP 8,500 by 20%.",
            spans = emptyList(), withheld = emptyList(),
            tagged = "No, [PERSON] cannot raise the rent of [AMOUNT] by 20%.",
        )
        val (subject, body) = reportEmail(a)
        assertEquals("Envoy: report an AI answer", subject)
        org.junit.Assert.assertTrue(body.contains("No, [PERSON] cannot raise the rent of [AMOUNT] by 20%."))
        org.junit.Assert.assertFalse(body.contains("Karim Fathy"))
        org.junit.Assert.assertFalse(body.contains("8,500"))
    }

    @Test
    fun `without the cloud's text, the report says so instead of sending the restored answer`() {
        val (_, body) = reportEmail(Answer("Karim Fathy", emptyList(), emptyList()))
        org.junit.Assert.assertFalse(body.contains("Karim Fathy"))
        org.junit.Assert.assertTrue(body.contains("(not available)"))
    }
}
