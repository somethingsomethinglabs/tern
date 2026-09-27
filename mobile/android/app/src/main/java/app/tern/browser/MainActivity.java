package app.tern.browser;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

public class MainActivity extends BridgeActivity {
    private ValueCallback<Uri[]> fileCallback;
    private final ActivityResultLauncher<Intent> picker = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(), result -> {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.getResultCode(), result.getData()));
                fileCallback = null;
            }
        });
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TernHostPlugin.class);
        super.onCreate(savedInstanceState);
        // adjustResize handles the IME. Padding for it again collapses the page
        // to zero height and makes the website lose keyboard focus.
        android.view.View root = (android.view.View) getBridge().getWebView().getParent();
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(root);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                TernHostPlugin plugin = (TernHostPlugin) getBridge().getPlugin("TernHost").getInstance();
                plugin.sendEvent(new JSObject().put("type", "shortcut").put("key", "back"));
            }
        });
    }
    public boolean chooseFile(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = callback;
        try { picker.launch(params.createIntent()); }
        catch (Exception error) { fileCallback.onReceiveValue(null); fileCallback = null; return false; }
        return true;
    }
    @Override public void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = null;
        super.onDestroy();
    }
}
