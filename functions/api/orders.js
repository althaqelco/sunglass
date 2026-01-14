// Cloudflare Pages Function - /api/orders
// ========================================

// 1. دالة إنشاء Access Token
async function getGoogleAccessToken(env) {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    
    const claim = {
        iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    };

    const base64urlEncode = (obj) => {
        const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
        return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };

    const headerEncoded = base64urlEncode(header);
    const claimEncoded = base64urlEncode(claim);
    const signatureInput = `${headerEncoded}.${claimEncoded}`;

    const privateKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    const pemContents = privateKey
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s/g, '');
    
    const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    
    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8', binaryKey,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
    );

    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5', cryptoKey,
        new TextEncoder().encode(signatureInput)
    );

    const signatureEncoded = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const jwt = `${signatureInput}.${signatureEncoded}`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` 
    });

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
}

// 2. دالة إضافة صف للشيت
async function appendToGoogleSheet(env, rowData) {
    const accessToken = await getGoogleAccessToken(env);
    const sheetName = env.GOOGLE_SHEET_NAME || 'Sheet1';
    
    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SPREADSHEET_ID}/values/${sheetName}!A:Z:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values: [rowData] })
        }
    );
    return response.json();
}

// 3. معالجة الطلب
export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const body = await request.json();
        const { orderNumber, name, phone, whatsapp, governorate, address, plan, quantity, total } = body;
        
        // تجهيز التاريخ
        const orderDate = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });
        
        // تجهيز الصف
        const rowData = [
            orderDate,          // التاريخ
            orderNumber,        // رقم الطلب
            'جديد',             // الحالة
            name,               // الاسم
            phone,              // الهاتف
            whatsapp,           // واتساب
            governorate,        // المحافظة
            address,            // العنوان
            plan,               // العرض المختار
            quantity,           // الكمية
            total               // الإجمالي
        ];
        
        // إضافة الصف للشيت
        await appendToGoogleSheet(env, rowData);
        
        return new Response(JSON.stringify({ success: true }), {
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
        
    } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}

// للتعامل مع CORS preflight
export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}
