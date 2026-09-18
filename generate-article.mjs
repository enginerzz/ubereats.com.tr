import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.AI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
  console.error('HATA: GitHub Secrets (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY veya AI_API_KEY) eksik!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function generateDailyArticle() {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Bugün için zaten makale var mı kontrol et
    const { data: existing, error: checkError } = await supabase
      .from('articles')
      .select('*')
      .eq('date', today)
      .maybeSingle();

    if (checkError) {
      console.error('Supabase kontrol hatası:', checkError.message);
      process.exit(1);
    }

    if (existing) {
      console.log('Bugün için zaten bir makale mevcut.');
      return;
    }

    console.log('Gemini API\'den felsefi makale isteniyor...');

    const promptText = 'Felsefi, derin, düşündürücü ve aydınlatıcı Platon veya Nietzsche tarzında kısa bir günlük felsefe makalesi yaz. Yanıtı SADECE geçerli bir JSON nesnesi olarak ver. Başka hiçbir açıklama yazma. Yapı şöyle olmalı: {"title": "Makale Başlığı", "content": "Makale içeriği burada yer alsın..."}';

    // Model adresini gemini-2.0-flash veya gemini-3.6-flash olarak çağırıyoruz
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: promptText }]
        }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Hatası:', response.status, errorText);
      process.exit(1);
    }

    const result = await response.json();
    const rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawContent) {
      console.error('Gemini beklenmeyen yanıt yapısı döndürdü:', JSON.stringify(result));
      process.exit(1);
    }

    const articleData = JSON.parse(rawContent);

    // 3. Supabase'e kaydet
    const { error: insertError } = await supabase.from('articles').insert([
      { date: today, title: articleData.title, content: articleData.content }
    ]);

    if (insertError) {
      console.error('Supabase kayıt hatası:', insertError.message);
      process.exit(1);
    }

    console.log('Günün makalesi Gemini ile başarıyla üretildi ve kaydedildi:', articleData.title);

  } catch (error) {
    console.error('Beklenmeyen bir hata oluştu:', error);
    process.exit(1);
  }
}

generateDailyArticle();
