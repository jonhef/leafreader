package org.leafreader.app;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LeafInbox")
public class LeafInboxPlugin extends Plugin {
    private static final ExecutorService imports = Executors.newSingleThreadExecutor();
    static void capture(MainActivity activity, Intent intent) {
        if (intent == null) return;
        Uri uri = Intent.ACTION_SEND.equals(intent.getAction())
            ? intent.getParcelableExtra(Intent.EXTRA_STREAM) : intent.getData();
        if (uri == null || !("content".equals(uri.getScheme()) || "file".equals(uri.getScheme()))) return;
        imports.execute(() -> {
            File dest = null;
            try {
                String name = uri.getLastPathSegment();
                if ("content".equals(uri.getScheme())) {
                    try (Cursor cursor = activity.getContentResolver().query(uri, null, null, null, null)) {
                        if (cursor != null && cursor.moveToFirst()) {
                            int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                            if (column >= 0) name = cursor.getString(column);
                        }
                    }
                }
                if (name == null || !name.toLowerCase(java.util.Locale.ROOT).matches(".*\\.(fb2|epub|pdf|djvu|djv)$")) return;
                name = new File(name).getName().replaceAll("[^\\p{L}\\p{N}._ -]", "_");
                File dir = new File(activity.getCacheDir(), "leaf-inbox"); dir.mkdirs();
                if (dir.listFiles() != null && dir.listFiles().length >= 8) throw new IOException("Слишком много ожидающих файлов.");
                dest = new File(dir, UUID.randomUUID() + "_" + name + ".part");
                try (InputStream input = activity.getContentResolver().openInputStream(uri);
                     OutputStream output = new FileOutputStream(dest)) {
                    if (input == null) throw new IOException("Файл недоступен.");
                    byte[] buffer = new byte[65536]; int n; long total = 0;
                    while ((n = input.read(buffer)) != -1) {
                        total += n;
                        if (total > 128L * 1024 * 1024) throw new IOException("Лимит файла — 128 МБ.");
                        output.write(buffer, 0, n);
                    }
                }
                File ready = new File(dir, dest.getName().replaceFirst("\\.part$", ""));
                if (!dest.renameTo(ready)) throw new IOException("Не удалось подготовить файл.");
                activity.runOnUiThread(() -> activity.getBridge().getWebView().evaluateJavascript(
                    "window.dispatchEvent(new Event('leaf-inbox'))", null));
            } catch (Exception error) {
                if (dest != null) dest.delete();
                activity.runOnUiThread(() -> android.widget.Toast.makeText(activity,
                    error.getMessage(), android.widget.Toast.LENGTH_LONG).show());
            }
        });
    }
    @PluginMethod public void take(PluginCall call) {
        File dir = new File(getContext().getCacheDir(), "leaf-inbox");
        File[] files = dir.listFiles((d, name) -> !name.endsWith(".part"));
        JSObject result = new JSObject();
        if (files != null && files.length > 0) {
            File file = files[0];
            result.put("id", file.getName());
            result.put("name", file.getName().substring(37));
            result.put("url", Uri.fromFile(file).toString());
        }
        call.resolve(result);
    }
    @PluginMethod public void ack(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.contains("/") || id.contains("\\") || id.contains("..")) { call.reject("Invalid inbox ID"); return; }
        File file = new File(new File(getContext().getCacheDir(), "leaf-inbox"), id);
        if (file.exists() && !file.delete()) { call.reject("Cannot remove inbox file"); return; }
        call.resolve();
    }
}
