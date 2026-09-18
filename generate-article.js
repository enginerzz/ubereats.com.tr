import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.AI_API_KEY; // Veya OpenAI kullanacaksan OpenAI anahtarı

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function generateDailyArticle() {
    const today = new Date().toISOString().split('T')[0];

    // Bugün için zaten makale var mı kontrol et
    const { data: existing } = await supabase.from('articles').select('*').eq('date', today).single();
    if (existing) {
        console.log('Bugün için zaten bir makale mevcut.');
        return;
    }

    console.log('Yapay zekadan felsefi makale isteniyor...');

    // Yapay Zekaya (Örn: OpenAI API) İstek Atma
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{
                role: 'user',
                content: 'Felsefi, derin, düşündürücü ve aydınlatıcı Platon veya Nietzsche tarzında kısa bir günlük felsefe makalesi yaz. Sadece JSON formatında şu yapıda ver: {"title": "Makale Başlığı", "content": "Makale içeriği burada yer alsın..."}'
            }],
            response_format: { type: "json_object" }
        })
    });

    const result = await response.json();
    const articleData = JSON.parse(result.choices[0].message.content);

    // Supabase'e kaydet
    const { error } = await supabase.from('articles').insert([
        { date: today, title: articleData.title, content: articleData.content }
    ]);

    if (error) {
        console.error('Supabase kayıt hatası:', error);
    } else {
        console.log('Günün makalesi başarıyla üretildi ve kaydedildi:', articleData.title);
    }
}

generateDailyArticle();
