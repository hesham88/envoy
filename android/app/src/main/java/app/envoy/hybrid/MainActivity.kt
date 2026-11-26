package app.envoy.hybrid

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import app.envoy.hybrid.ui.EnvoyScreen
import app.envoy.hybrid.ui.EnvoyTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { EnvoyTheme { EnvoyScreen(viewModel()) } }
    }
}
