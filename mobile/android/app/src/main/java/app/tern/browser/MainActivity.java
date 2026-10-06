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
    private android.webkit.WebView fileOwner;
    private String fileOwnerUrl;
    private boolean fileRequestOutstanding;
    private final ActivityResultLauncher<Intent> picker = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(), result -> {
            fileRequestOutstanding = false;
            if (fileCallback != null) {
                Uri[] selected = WebChromeClient.FileChooserParams.parseResult(result.getResultCode(), result.getData());
                if (fileOwner == null || !fileOwner.isAttachedToWindow() ||
                    !java.util.Objects.equals(fileOwner.getUrl(), fileOwnerUrl)) selected = null;
                if (selected != null) for (Uri uri : selected) {
                    if (uri == null || !"content".equals(uri.getScheme()) || uri.getAuthority() == null ||
                        (getPackageName() + ".fileprovider").equals(uri.getAuthority())) { selected = null; break; }
                }
                fileCallback.onReceiveValue(selected);
                fileCallback = null; fileOwner = null; fileOwnerUrl = null;
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
    public boolean chooseFile(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params, android.webkit.WebView owner) {
        if (fileRequestOutstanding) { callback.onReceiveValue(null); return true; }
        fileCallback = callback; fileOwner = owner; fileOwnerUrl = owner.getUrl();
        fileRequestOutstanding = true;
        try { picker.launch(params.createIntent()); }
        catch (Exception error) { fileCallback.onReceiveValue(null); fileCallback = null; fileOwner = null; fileOwnerUrl = null; fileRequestOutstanding = false; return true; }
        return true;
    }
    public void cancelFileSelectionFor(android.webkit.WebView owner) {
        if (fileOwner == owner && fileCallback != null) {
            fileCallback.onReceiveValue(null); fileCallback = null; fileOwner = null; fileOwnerUrl = null;
        }
    }
    @Override public void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = null;
        super.onDestroy();
    }
}
