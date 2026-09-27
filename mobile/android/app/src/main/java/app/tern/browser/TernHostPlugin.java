package app.tern.browser;

import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.*;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Environment;
import android.os.Message;
import android.util.AtomicFile;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.*;
import android.widget.FrameLayout;
import androidx.appcompat.app.AlertDialog;
import androidx.coordinatorlayout.widget.CoordinatorLayout;
import androidx.core.content.ContextCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

@CapacitorPlugin(name = "TernHost")
public class TernHostPlugin extends Plugin {
    private final Map<String, WebView> pages = new LinkedHashMap<>();
    private final Map<String, String> errors = new HashMap<>();
    private final Set<String> loading = new HashSet<>();
    private final Map<Long, String> downloads = new HashMap<>();
    private FrameLayout layer;
    private String selected;
    private boolean visible;
    private int textZoom = 100;
    private BroadcastReceiver downloadReceiver;
    private AtomicFile stateFile;

    @Override public void load() {
        stateFile = new AtomicFile(new File(getContext().getFilesDir(), "application.json"));
        getActivity().runOnUiThread(() -> {
            layer = new FrameLayout(getContext());
            layer.setVisibility(View.GONE);
            ((ViewGroup) bridge.getWebView().getParent()).addView(layer, new CoordinatorLayout.LayoutParams(1, 1));
        });
        downloadReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (!downloads.containsKey(id)) return;
                DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
                try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
                    if (cursor != null && cursor.moveToFirst()) {
                        int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        sendEvent(new JSObject().put("type", "download").put("id", String.valueOf(id))
                            .put("name", downloads.get(id)).put("status", status == DownloadManager.STATUS_SUCCESSFUL ? "Complete" : "Failed"));
                    }
                }
            }
        };
        ContextCompat.registerReceiver(getContext(), downloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED);
    }
    public void sendEvent(JSObject event) { notifyListeners("browserEvent", event); }
    private void notice(String text) { sendEvent(new JSObject().put("type", "notice").put("message", text)); }
    private boolean webURL(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        return ("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
            && uri.getHost() != null && uri.getUserInfo() == null;
    }
    private void emit(String id) {
        WebView view = pages.get(id);
        if (view == null) return;
        sendEvent(new JSObject().put("type", "page").put("id", id)
            .put("url", view.getUrl() == null ? "" : view.getUrl()).put("title", view.getTitle() == null ? "" : view.getTitle())
            .put("live", true).put("loading", loading.contains(id)).put("error", errors.getOrDefault(id, ""))
            .put("canGoBack", view.canGoBack()).put("canGoForward", view.canGoForward()));
    }
    private void show() {
        if (layer == null) return;
        for (Map.Entry<String, WebView> entry : pages.entrySet())
            entry.getValue().setVisibility(entry.getKey().equals(selected) ? View.VISIBLE : View.GONE);
        layer.setVisibility(visible && selected != null && pages.containsKey(selected) ? View.VISIBLE : View.GONE);
    }
    private interface Operation { void run() throws Exception; }
    private void ui(PluginCall call, Operation operation) {
        getActivity().runOnUiThread(() -> {
            try { operation.run(); call.resolve(); }
            catch (Exception error) { call.reject(error.getMessage(), error); }
        });
    }
    @PluginMethod public void readState(PluginCall call) {
        synchronized (this) {
            try {
                if (!stateFile.getBaseFile().exists()) { call.resolve(new JSObject().put("value", org.json.JSONObject.NULL)); return; }
                byte[] bytes = stateFile.readFully();
                call.resolve(new JSObject().put("value", new String(bytes, StandardCharsets.UTF_8)));
            } catch (Exception error) { call.reject("Could not read saved tasks", error); }
        }
    }
    @PluginMethod public void writeState(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.length() > 20_000_000) { call.reject("Invalid saved data"); return; }
        synchronized (this) {
            FileOutputStream stream = null;
            try {
                stream = stateFile.startWrite();
                stream.write(value.getBytes(StandardCharsets.UTF_8));
                stateFile.finishWrite(stream);
                call.resolve();
            } catch (Exception error) { if (stream != null) stateFile.failWrite(stream); call.reject("Could not save tasks", error); }
        }
    }
    @SuppressLint("SetJavaScriptEnabled")
    private WebView makePage(String id) {
        // This is an ordinary WebView, never the Capacitor view. No native JS interface.
        WebView view = new WebView(getActivity());
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setTextZoom(textZoom);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(view, false);
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                if (webURL(request.getUrl().toString())) return false;
                notice("This link cannot be opened in Tern yet.");
                return true;
            }
            @Override public void onPageStarted(WebView v, String url, Bitmap icon) {
                if (!webURL(url)) { v.stopLoading(); return; }
                errors.remove(id); loading.add(id); emit(id);
            }
            @Override public void doUpdateVisitedHistory(WebView v, String url, boolean reload) { emit(id); }
            @Override public void onPageFinished(WebView v, String url) { loading.remove(id); CookieManager.getInstance().flush(); emit(id); }
            @Override public void onReceivedError(WebView v, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                errors.put(id, error.getDescription().toString()); loading.remove(id); emit(id);
            }
            @Override public void onReceivedSslError(WebView v, SslErrorHandler handler, SslError error) {
                handler.cancel(); errors.put(id, "The website's security certificate could not be verified."); loading.remove(id); emit(id);
            }
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                // Several tabs can share a renderer; Android invokes this for each affected view.
                pages.remove(id); loading.remove(id); layer.removeView(v); v.destroy(); show();
                sendEvent(new JSObject().put("type", "page").put("id", id).put("url", "").put("title", "")
                    .put("live", false).put("loading", false).put("error", "This page was closed by Android. Reopen it to continue.")
                    .put("canGoBack", false).put("canGoForward", false));
                return true;
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override public void onReceivedTitle(WebView v, String title) { emit(id); }
            @Override public void onPermissionRequest(PermissionRequest request) {
                request.deny(); notice("Camera and microphone access are not available in this build.");
            }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, false, false); notice("Location access is not available in this build.");
            }
            @Override public boolean onShowFileChooser(WebView v, android.webkit.ValueCallback<Uri[]> callback, FileChooserParams params) {
                return ((MainActivity) getActivity()).chooseFile(callback, params);
            }
            @Override public boolean onCreateWindow(WebView v, boolean dialog, boolean userGesture, Message message) {
                if (!userGesture) { notice("An automatic popup was blocked."); return false; }
                WebView popup = new WebView(getActivity());
                popup.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView p, WebResourceRequest request) {
                        if (webURL(request.getUrl().toString())) sendEvent(new JSObject().put("type", "popup").put("openerId", id).put("url", request.getUrl().toString()));
                        else notice("This popup cannot be opened in Tern.");
                        p.post(p::destroy); return true;
                    }
                });
                ((WebView.WebViewTransport) message.obj).setWebView(popup);
                message.sendToTarget();
                return true;
            }
        });
        view.setDownloadListener((url, userAgent, disposition, mime, length) -> {
            if (!webURL(url)) { notice("This download type is not supported yet."); return; }
            try {
                String name = URLUtil.guessFileName(url, disposition, mime).replaceAll("[/\\\\]", "_");
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setTitle(name).setMimeType(mime).setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.addRequestHeader("User-Agent", userAgent);
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) request.addRequestHeader("Cookie", cookie);
                if (Build.VERSION.SDK_INT >= 29) request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                else request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, name);
                DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
                long downloadId = manager.enqueue(request); downloads.put(downloadId, name);
                sendEvent(new JSObject().put("type", "download").put("id", String.valueOf(downloadId)).put("name", name).put("status", "Downloading"));
            } catch (Exception error) { notice("Could not start this download: " + error.getMessage()); }
        });
        view.setVisibility(View.GONE);
        layer.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return view;
    }
    @PluginMethod public void open(PluginCall call) {
        ui(call, () -> {
            String id = call.getString("id"), url = call.getString("url");
            if (id == null || id.length() > 100 || !webURL(url)) throw new IllegalArgumentException("Invalid page");
            if (pages.containsKey(id)) return;
            if (pages.size() >= 16) throw new IllegalStateException("Close a tab before opening another");
            WebView view = makePage(id); pages.put(id, view); view.loadUrl(url); show();
        });
    }
    @PluginMethod public void activate(PluginCall call) { ui(call, () -> { selected = call.getString("id"); show(); }); }
    @PluginMethod public void navigate(PluginCall call) {
        ui(call, () -> {
            WebView view = pages.get(call.getString("id")); String url = call.getString("url");
            if (view == null || !webURL(url)) throw new IllegalArgumentException("Invalid page address");
            errors.remove(call.getString("id")); view.loadUrl(url);
        });
    }
    @PluginMethod public void close(PluginCall call) {
        ui(call, () -> {
            String id = call.getString("id"); WebView view = pages.remove(id);
            errors.remove(id); loading.remove(id);
            if (view != null) { layer.removeView(view); view.stopLoading(); view.destroy(); }
            show();
        });
    }
    @PluginMethod public void layout(PluginCall call) {
        ui(call, () -> {
            float density = getContext().getResources().getDisplayMetrics().density;
            int width = Math.max(0, Math.round(call.getFloat("width", 0f) * density));
            int height = Math.max(0, Math.round(call.getFloat("height", 0f) * density));
            CoordinatorLayout.LayoutParams params = new CoordinatorLayout.LayoutParams(width, height);
            params.leftMargin = Math.max(0, Math.round(call.getFloat("x", 0f) * density));
            params.topMargin = Math.max(0, Math.round(call.getFloat("y", 0f) * density));
            layer.setLayoutParams(params);
            visible = call.getBoolean("visible", false) && width > 0 && height > 0;
            show();
        });
    }
    @PluginMethod public void action(PluginCall call) {
        ui(call, () -> {
            WebView view = pages.get(call.getString("id"));
            if (view == null) return;
            switch (call.getString("action", "")) {
                case "back": if (view.canGoBack()) view.goBack(); break;
                case "forward": if (view.canGoForward()) view.goForward(); break;
                case "reload": view.reload(); break;
                case "stop": view.stopLoading(); loading.remove(call.getString("id")); emit(call.getString("id")); break;
                case "find": view.findAllAsync(call.getString("text", "")); break;
                case "stopFind": view.clearMatches(); break;
                default: throw new IllegalArgumentException("Unsupported page action");
            }
        });
    }
    @PluginMethod public void setZoom(PluginCall call) {
        ui(call, () -> { textZoom = Math.max(75, Math.min(200, Math.round(call.getFloat("zoom", 1f) * 100))); for (WebView view : pages.values()) view.getSettings().setTextZoom(textZoom); });
    }
    @PluginMethod public void clearCache(PluginCall call) {
        ui(call, () -> {
            // WebView's resource cache is shared, including when no tabs are live.
            WebView view = new WebView(getActivity());
            view.clearCache(true); view.destroy();
        });
    }
    @PluginMethod public void clipboard(PluginCall call) {
        ui(call, () -> ((ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE))
            .setPrimaryClip(ClipData.newPlainText("Page address", call.getString("text", ""))));
    }
    @PluginMethod public void confirm(PluginCall call) {
        getActivity().runOnUiThread(() -> new AlertDialog.Builder(getActivity()).setMessage(call.getString("message", "Continue?"))
            .setNegativeButton("Cancel", (dialog, which) -> call.resolve(new JSObject().put("accepted", false)))
            .setPositiveButton("Continue", (dialog, which) -> call.resolve(new JSObject().put("accepted", true)))
            .setOnCancelListener(dialog -> call.resolve(new JSObject().put("accepted", false))).show());
    }
    @PluginMethod public void exit(PluginCall call) { ui(call, () -> getActivity().moveTaskToBack(true)); }
    @Override protected void handleOnPause() { CookieManager.getInstance().flush(); }
    @Override protected void handleOnDestroy() {
        if (downloadReceiver != null) getContext().unregisterReceiver(downloadReceiver);
        for (WebView view : pages.values()) { layer.removeView(view); view.destroy(); }
        pages.clear();
    }
}
