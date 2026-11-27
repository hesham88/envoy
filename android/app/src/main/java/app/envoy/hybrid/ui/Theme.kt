package app.envoy.hybrid.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** Envoy's UV-night palette, the same as the web app: green is this phone, blue is the cloud. */
internal object Uv {
    val dark = Color(0xFF0B0A1C)
    val panel = Color(0xFF131230)
    val raised = Color(0xFF1A1940)
    val line = Color(0xFF2A2852)
    val text = Color(0xFFECE9FF)
    val muted = Color(0xFFA9A6CC)
    val green = Color(0xFF3DFFB0)
    val blue = Color(0xFF7D95FF)
    val amber = Color(0xFFFFB547)
    val violet = Color(0xFFC4A1FF)
    val danger = Color(0xFFFF5D7A)
}

/** One colour per kind of tag, so the excerpt reads at a glance: people, amounts, identifiers, the rest. */
internal fun tagColor(label: String): Color = when (label) {
    "PERSON", "ORG", "LANDLORD", "TENANT", "EMPLOYER" -> Uv.blue
    "AMOUNT", "MONEY", "RENT", "SALARY" -> Uv.green
    "NATIONAL_ID", "IBAN", "ACCOUNT", "CARD", "PLATE", "SECRET" -> Uv.amber
    else -> Uv.violet
}

@Composable
fun EnvoyTheme(content: @Composable () -> Unit) = MaterialTheme(
    colorScheme = darkColorScheme(
        background = Uv.dark, surface = Uv.panel, primary = Uv.green, onPrimary = Uv.dark,
        onBackground = Uv.text, onSurface = Uv.text, outline = Uv.line,
    ),
    content = content,
)
