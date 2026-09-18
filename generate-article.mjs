import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.AI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
  console.error('HATA: GitHub Secrets eksik!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Bekleme fonksiyonu
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchGeminiWithRetry(promptText, maxRetries = 3) {
  const model = 'gemini-3.6-flash';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Gemini API'den felsefi makale isteniyor (Deneme ${attempt}/${maxRetries})...`);
      
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
        if (rawContent) return JSON.parse(rawContent);
      }

      // 503 veya 429 (yoğunluk/kota) durumunda bekle ve tekrar dene
      if (response.status === 503 || response.status === 429) {
        const waitTime = attempt * 4000; // 4sn, 8sn, 12sn bekle
        console.warn(`Sunucu yoğun (${response.status}). ${waitTime / 1000} saniye sonra tekrar deneniyor...`);
        await sleep(waitTime);
      } else {
        const errorText = await response.text();
        console.error(`Gemini API Hatası:`, response.status, errorText);
        break;
      }
    } catch (err) {
      console.error('İstek hatası:', err.message);
      await sleep(3000);
    }
  }

  throw new Error('Google Gemini API yoğunluk nedeniyle yanıt veremedi.');
}

async function generateDailyArticle() {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Bugünün makalesi kontrolü
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

    // 2. Gemini'den üret
    const articleData = await fetchGeminiWithRetry(promptText);

    // 3. Supabase'e kaydet
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
