package io.github.nickguigui.gumball;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.UriMatcher;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileNotFoundException;
import java.util.List;

/**
 * Provedor que o WhatsApp le para adicionar pacotes (formato do app oficial de exemplo do WhatsApp).
 * URIs: /metadata, /metadata/<id>, /stickers/<id>, /stickers_asset/<id>/<arquivo>
 */
public class StickerContentProvider extends ContentProvider {
    static final String AUTHORITY = "io.github.nickguigui.gumball.stickercontentprovider";
    private static final int METADATA = 1, METADATA_ONE = 2, STICKERS = 3, ASSET = 4;
    private final UriMatcher m = new UriMatcher(UriMatcher.NO_MATCH);

    @Override public boolean onCreate() {
        m.addURI(AUTHORITY, "metadata", METADATA);
        m.addURI(AUTHORITY, "metadata/*", METADATA_ONE);
        m.addURI(AUTHORITY, "stickers/*", STICKERS);
        m.addURI(AUTHORITY, "stickers_asset/*/*", ASSET);
        return true;
    }

    private static final String[] META_COLS = {
        "sticker_pack_identifier", "sticker_pack_name", "sticker_pack_publisher", "sticker_pack_icon",
        "android_play_store_link", "ios_app_download_link", "sticker_pack_publisher_email", "sticker_pack_publisher_website",
        "sticker_pack_privacy_policy_website", "sticker_pack_license_agreement_website", "image_data_version",
        "whatsapp_will_not_cache_stickers", "animated_sticker_pack"
    };

    private void addPack(MatrixCursor c, String id) {
        JSONObject p = StickerPacks.read(getContext(), id); if (p == null) return;
        String nome = p.optString("nome", "Gumball"); String autor = p.optString("autor", "");
        c.addRow(new Object[]{ id, nome.isEmpty() ? "Gumball" : nome, autor.isEmpty() ? "Gumball" : autor, "tray.png",
            "", "", "", "https://nickguigui.github.io/gumball-bot/#figurinhas/" + id, "https://nickguigui.github.io/gumball-bot/", "",
            "1", 0, p.optBoolean("animado") ? 1 : 0 });
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        switch (m.match(uri)) {
            case METADATA: { MatrixCursor c = new MatrixCursor(META_COLS); for (String id : StickerPacks.ids(getContext())) addPack(c, id); return c; }
            case METADATA_ONE: { MatrixCursor c = new MatrixCursor(META_COLS); addPack(c, uri.getLastPathSegment()); return c; }
            case STICKERS: {
                MatrixCursor c = new MatrixCursor(new String[]{ "sticker_file_name", "sticker_emoji", "sticker_accessibility_text" });
                JSONObject p = StickerPacks.read(getContext(), uri.getLastPathSegment()); if (p == null) return c;
                JSONArray figs = p.optJSONArray("figurinhas"); if (figs == null) return c;
                for (int i = 0; i < figs.length(); i++) {
                    JSONObject f = figs.optJSONObject(i); if (f == null) continue;
                    JSONArray em = f.optJSONArray("emojis"); StringBuilder e = new StringBuilder();
                    if (em != null) for (int j = 0; j < Math.min(3, em.length()); j++) { if (j > 0) e.append(','); e.append(em.optString(j)); }
                    c.addRow(new Object[]{ f.optString("f"), e.length() > 0 ? e.toString() : "🙂", "Figurinha " + (i + 1) });
                }
                return c;
            }
            default: return null;
        }
    }

    @Override public AssetFileDescriptor openAssetFile(Uri uri, String mode) throws FileNotFoundException {
        if (m.match(uri) != ASSET) throw new FileNotFoundException(uri.toString());
        List<String> seg = uri.getPathSegments(); // stickers_asset, id, arquivo
        String id = seg.get(1), name = seg.get(2);
        if (!StickerPacks.validId(id) || !name.matches("[a-z0-9]+\\.(webp|png)")) throw new FileNotFoundException(name);
        File f = new File(StickerPacks.dir(getContext(), id), name);
        if (!f.exists()) throw new FileNotFoundException(name);
        return new AssetFileDescriptor(ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY), 0, f.length());
    }

    @Override public String getType(Uri uri) {
        switch (m.match(uri)) {
            case METADATA: return "vnd.android.cursor.dir/vnd." + AUTHORITY + ".metadata";
            case METADATA_ONE: return "vnd.android.cursor.item/vnd." + AUTHORITY + ".metadata";
            case STICKERS: return "vnd.android.cursor.dir/vnd." + AUTHORITY + ".stickers";
            case ASSET: return uri.getLastPathSegment().endsWith(".png") ? "image/png" : "image/webp";
            default: return null;
        }
    }
    @Override public Uri insert(Uri uri, ContentValues v) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String s, String[] a) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { throw new UnsupportedOperationException(); }
}
