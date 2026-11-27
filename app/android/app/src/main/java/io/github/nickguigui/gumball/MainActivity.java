package io.github.nickguigui.gumball;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

/**
 * App do Gumball: abre a galeria do site e, no link gumball://pacote/<id>, baixa o pacote
 * e pede para o WhatsApp adicionar (o mesmo fluxo dos apps de figurinhas).
 */
public class MainActivity extends BridgeActivity {
    private static final int ADD_PACK = 200;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handle(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handle(intent);
    }

    private void toast(String t) { ui.post(() -> Toast.makeText(this, t, Toast.LENGTH_LONG).show()); }

    private void handle(Intent intent) {
        Uri u = intent == null ? null : intent.getData();
        if (u == null || !"gumball".equals(u.getScheme()) || !"pacote".equals(u.getHost())) return;
        String id = u.getLastPathSegment();
        if (!StickerPacks.validId(id)) { toast("Link de pacote inválido."); return; }
        toast("Baixando o pacote…");
        new Thread(() -> {
            try {
                JSONObject pack = StickerPacks.install(this, id);
                ui.post(() -> addToWhatsApp(id, pack.optString("nome", "Gumball")));
            } catch (Exception e) {
                toast("Não consegui baixar o pacote: " + e.getMessage());
            }
        }).start();
    }

    private void addToWhatsApp(String id, String nome) {
        Intent i = new Intent("com.whatsapp.intent.action.ENABLE_STICKER_PACK");
        i.putExtra("sticker_pack_id", id);
        i.putExtra("sticker_pack_authority", StickerContentProvider.AUTHORITY);
        i.putExtra("sticker_pack_name", nome);
        // WhatsApp normal ou Business, o que estiver instalado
        for (String pkg : new String[]{ "com.whatsapp", "com.whatsapp.w4b" }) {
            try { i.setPackage(pkg); startActivityForResult(i, ADD_PACK); return; } catch (ActivityNotFoundException ignored) {}
        }
        toast("Não achei o WhatsApp neste celular.");
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != ADD_PACK) return;
        if (resultCode == RESULT_OK) { toast("Pacote adicionado ao WhatsApp! 🎉"); return; }
        String err = data == null ? null : data.getStringExtra("validation_error");
        if (err != null) toast("O WhatsApp recusou o pacote: " + err);
    }
}
