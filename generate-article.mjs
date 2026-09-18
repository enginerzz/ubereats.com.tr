import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.AI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
  console.error('HATA: GitHub Secrets eksik!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchGeminiWithFallback(promptText) {
  // Geçerli ve aktif modeller
  const models = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

  for (const model of models) {
    console.log(`--- ${model} modeli deneniyor ---`);
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`${model} isteği gönderiliyor (Deneme ${attempt}/2)...`);
        
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }],
              generationConfig: { responseMimeType: 'application/json' }
            })
          }
        );

        if (response.ok) {
          const result = await response.json();
          const rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawContent) {
            console.log(`Başarılı! Yanıt ${model} üzerinden alındı.`);
            return JSON.parse(rawContent);
          }
        }

        if (response.status === 503 || response.status === 429) {
          console.warn(`${model} yoğun (${response.status}). 3 saniye bekleniyor...`);
          await sleep(3000);
        } else {
          const errorText = await response.text();
          console.error(`${model} API Hatası:`, response.status, errorText);
          break; // Kalıcı hatada hemen bir sonraki modele geç
        }
      } catch (err) {
        console.error('Bağlantı hatası:', err.message);
        await sleep(2000);
      }
    }
    console.warn(`${model} yanıt vermedi, yedek modele geçiliyor...`);
  }

  throw new Error('Tüm Gemini modelleri yoğunluk veya hata nedeniyle başarısız oldu.');
}

async function generateDailyArticle() {
  try {
    const today = new Date().toISOString().split('T')[0];

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

    const promptText =
      'Felsefi, derin, düşündürücü ve aydınlatıcı Platon veya Nietzsche tarzında kısa bir günlük felsefe makalesi yaz. Yanıtı SADECE geçerli bir JSON nesnesi olarak ver. Başka hiçbir açıklama yazma. Yapı şöyle olmalı: {"title": "Makale Başlığı", "content": "Makale içeriği burada yer alsın..."}';

    const articleData = await fetchGeminiWithFallback(promptText);

    const { error: insertError } = await supabase.from('articles').insert([
      { date: today, title: articleData.title, content: articleData.content }
    ]);

    if (insertError) {
      console.error('Supabase kayıt hatası:', insertError.message);
      process.exit(1);
    }

    console.log('Günün makalesi başarıyla kaydedildi:', articleData.title);
  } catch (error) {
    console.error('İşlem başarısız:', error.message);
    process.exit(1);
  }
}

generateDailyArticle();
