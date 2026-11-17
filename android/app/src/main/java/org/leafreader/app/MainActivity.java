package org.leafreader.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.content.Intent;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(LeafInboxPlugin.class);
        super.onCreate(state);
        LeafInboxPlugin.capture(this, getIntent());
        getOnBackPressedDispatcher().addCallback(this, new androidx.activity.OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                getBridge().getWebView().evaluateJavascript(
                    "window.leafHandleBack ? window.leafHandleBack() : false", handled -> {
                        if (!"true".equals(handled)) {
                            setEnabled(false);
                            getOnBackPressedDispatcher().onBackPressed();
                            setEnabled(true);
                        }
                    });
            }
        });
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        LeafInboxPlugin.capture(this, intent);
    }
}
