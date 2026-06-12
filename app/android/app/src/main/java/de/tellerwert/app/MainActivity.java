package de.tellerwert.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        routeShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        routeShare(intent);
    }

    /**
     * Teilen-Ziel (Rezept-Links und -Texte): Payload landet wie auf iOS auf
     * der /import-Seite des Web-Layers — reine WebView-Navigation, kein
     * JS-Bridge-Plugin nötig.
     */
    private void routeShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) return;
        String trimmed = text.trim();
        // Reine URL → Link-Import; alles andere (Captions, Zutatenlisten) als Text
        String param = trimmed.matches("^https?://\\S+$") ? "import" : "import_text";
        String target = getBridge().getLocalUrl() + "/import?" + param + "=" + Uri.encode(trimmed);
        // Intent entschärfen, damit Rotation/Resume den Import nicht wiederholt
        intent.setAction(Intent.ACTION_MAIN);
        intent.removeExtra(Intent.EXTRA_TEXT);
        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(target));
    }
}
