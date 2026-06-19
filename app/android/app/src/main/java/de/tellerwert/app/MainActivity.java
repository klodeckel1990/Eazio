package de.tellerwert.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Health Connect zeigt diese Activity, wenn der Nutzer die Health-Berechti-
    // gungen prüft — wir leiten dann auf die Datenschutzerklärung. Pflicht für
    // den Permission-Flow und die Play-Freigabe.
    private static final String ACTION_HEALTH_RATIONALE = "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE";
    private static final String ACTION_VIEW_PERMISSION_USAGE = "android.intent.action.VIEW_PERMISSION_USAGE";
    private static final String PRIVACY_URL = "https://tellerwert.de/datenschutz";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Vor super.onCreate registrieren, damit Capacitor den JS-Proxy noch vor
        // dem Laden der WebView injiziert.
        registerPlugin(HealthPlugin.class);
        super.onCreate(savedInstanceState);
        if (routeHealthRationale(getIntent())) return;
        routeShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (routeHealthRationale(intent)) return;
        routeShare(intent);
    }

    /** Bei den Health-Connect-Rationale-Intents die Datenschutzseite öffnen. */
    private boolean routeHealthRationale(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        if (!ACTION_HEALTH_RATIONALE.equals(action) && !ACTION_VIEW_PERMISSION_USAGE.equals(action)) {
            return false;
        }
        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(PRIVACY_URL));
        return true;
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
