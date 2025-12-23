// Supabase Edge Function: OCR Invoice Processing
// Uses Google Gemini API to extract invoice data from images/PDFs

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
// Використовуємо актуальну назву моделі Gemini 1.5 Flash (‑latest)
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { fileBase64, mimeType, fileName } = await req.json()

    if (!fileBase64) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('📄 Processing OCR request:', { fileName, mimeType, fileSize: fileBase64.length })

    // Prompt for Gemini API
    const prompt = `Analyze this invoice/receipt image or document and extract all items in a structured JSON format.

For each item in the invoice, extract:
- name (product/item name)
- quantity (number)
- unit (pcs, kg, m, etc.)
- price (unit price per item)
- sku (article number/SKU if available)

Also extract from the invoice header/footer:
- invoiceNumber (invoice/receipt number)
- purchaseDate (date in YYYY-MM-DD format, if not available use today's date)
- vendor (store/shop/supplier name)

Return ONLY a valid JSON object with this exact structure:
{
  "invoiceNumber": "string or empty if not found",
  "purchaseDate": "YYYY-MM-DD",
  "vendor": "string or empty if not found",
  "items": [
    {
      "name": "string",
      "quantity": 1,
      "unit": "pcs",
      "price": 0.00,
      "sku": "string or empty"
    }
  ]
}

Important:
- The "sku" field is VERY IMPORTANT: it must contain the exact article number from the line item (e.g. 6001473). Do NOT invent values. If the invoice has a column with article numbers or item IDs, always copy that value into "sku".
- If a field is not found, use empty string "" or 0 for numbers
- Ensure all prices are numbers (not strings)
- Ensure all quantities are numbers (not strings)
- Return valid JSON only, no markdown, no explanations`

    // Call Gemini API
    const response = await fetch(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: prompt
              },
              {
                inline_data: {
                  mime_type: mimeType || 'image/jpeg',
                  data: fileBase64
                }
              }
            ]
          }]
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Gemini API error:', errorText)
      throw new Error(`Gemini API error: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    
    console.log('📋 Gemini raw response:', text.substring(0, 500))

    // Parse JSON response
    let parsedData
    try {
      // Remove markdown code blocks if present
      const cleanText = text
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .replace(/^[^{]*/, '') // Remove any text before first {
        .replace(/[^}]*$/, '') // Remove any text after last }
        .trim()
      
      parsedData = JSON.parse(cleanText)
      
      // Validate structure
      if (!parsedData.items || !Array.isArray(parsedData.items)) {
        parsedData.items = []
      }
      
      // Ensure all items have required fields
      parsedData.items = parsedData.items.map((item: any) => ({
        name: item.name || '',
        quantity: Number(item.quantity) || 1,
        unit: item.unit || 'pcs',
        price: Number(item.price) || 0,
        sku: item.sku || ''
      }))
      
      // Ensure invoice metadata
      parsedData.invoiceNumber = parsedData.invoiceNumber || ''
      parsedData.purchaseDate = parsedData.purchaseDate || new Date().toISOString().split('T')[0]
      parsedData.vendor = parsedData.vendor || ''
      
      console.log('✅ Parsed OCR data:', {
        invoiceNumber: parsedData.invoiceNumber,
        purchaseDate: parsedData.purchaseDate,
        vendor: parsedData.vendor,
        itemsCount: parsedData.items.length
      })

    } catch (parseError) {
      console.error('❌ Failed to parse Gemini response:', parseError)
      console.error('Raw text:', text)
      throw new Error(`Failed to parse OCR response: ${parseError.message}`)
    }

    return new Response(
      JSON.stringify({ success: true, data: parsedData }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error) {
    console.error('❌ OCR processing error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json',
        } 
      }
    )
  }
})

