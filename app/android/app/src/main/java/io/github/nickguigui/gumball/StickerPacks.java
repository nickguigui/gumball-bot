package io.github.nickguigui.gumball;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** Pacotes baixados da galeria do Gumball, guardados em files/packs/<id>/ (pack.json + figurinhas + tray.png). */
public final class StickerPacks {
    static final String RAW = "https://raw.githubusercontent.com/nickguigui/gumball-bot/galeria/p/";
    private StickerPacks() {}

    static File root(Context c) { File d = new File(c.getFilesDir(), "packs"); d.mkdirs(); return d; }
    static File dir(Context c, String id) { return new File(root(c), id); }

    static boolean validId(String id) { return id != null && id.matches("[a-z0-9]{6}"); }

    static byte[] get(String url) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(15000); h.setReadTimeout(30000);
        h.setRequestProperty("User-Agent", "GumballApp/1.0");
        if (h.getResponseCode() != 200) throw new Exception("HTTP " + h.getResponseCode());
        try (InputStream in = h.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] b = new byte[16384]; int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
            return out.toByteArray();
        } finally { h.disconnect(); }
    }

    /** Baixa o pacote da galeria (se ainda nao tiver) e devolve o pack.json. */
    static JSONObject install(Context c, String id) throws Exception {
        if (!validId(id)) throw new Exception("Código de pacote inválido.");
        File d = dir(c, id); File meta = new File(d, "pack.json");
        JSONObject pack = new JSONObject(new String(get(RAW + id + "/pack.json"), StandardCharsets.UTF_8));
        d.mkdirs();
        JSONArray figs = pack.getJSONArray("figurinhas");
        if (figs.length() < 3) throw new Exception("O pacote precisa ter pelo menos 3 figurinhas.");
        for (int i = 0; i < figs.length(); i++) {
            String f = figs.getJSONObject(i).getString("f");
            if (!f.matches("[a-z0-9]+\\.webp")) continue;
            File out = new File(d, f);
            if (!out.exists() || out.length() == 0) write(out, get(RAW + id + "/" + f));
        }
        String tray = pack.optString("tray", "tray.png");
        File t = new File(d, "tray.png");
        if (!t.exists()) write(t, get(RAW + id + "/" + tray));
        write(meta, pack.toString().getBytes(StandardCharsets.UTF_8));
        return pack;
    }

    static void write(File f, byte[] data) throws Exception { try (FileOutputStream o = new FileOutputStream(f)) { o.write(data); } }

    static JSONObject read(Context c, String id) {
        try { return new JSONObject(new String(Files.readAllBytes(new File(dir(c, id), "pack.json").toPath()), StandardCharsets.UTF_8)); }
        catch (Exception e) { return null; }
    }

    static String[] ids(Context c) {
        File[] l = root(c).listFiles(); if (l == null) return new String[0];
        java.util.ArrayList<String> out = new java.util.ArrayList<>();
        for (File f : l) if (new File(f, "pack.json").exists()) out.add(f.getName());
        return out.toArray(new String[0]);
    }
}
