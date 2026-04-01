/**
 * OpenAI API Client
 * Handles communication with OpenAI (Chat GPT) API
 */

export async function getAIAnalysisOpenAI(apiKey, prompt, calculatorType) {
  try {
    console.log('🚀 Calling OpenAI API...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Используем более дешевую модель для интерпретаций
        messages: [
          {
            role: 'system',
            content: 'Ты опытный нумеролог с глубокими знаниями нумерологии, психологии и духовного развития. Отвечай на русском языке, структурированно, с использованием markdown форматирования. Будь профессиональным, вдохновляющим, но честным.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1500,
        top_p: 0.9
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('OpenAI API Error:', error);

      if (response.status === 401) {
        throw new Error('authentication_failed');
      }
      if (response.status === 429) {
        throw new Error('rate_limit_exceeded');
      }

      throw new Error(`OpenAI API Error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log('✅ OpenAI API Response received');

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from OpenAI');
    }

    const analysis = data.choices[0].message.content;

    return {
      text: analysis,
      timestamp: new Date().toISOString(),
      model: 'gpt-4o-mini',
      tokens: {
        prompt: data.usage?.prompt_tokens || 0,
        completion: data.usage?.completion_tokens || 0,
        total: data.usage?.total_tokens || 0
      }
    };

  } catch (error) {
    console.error('❌ Error calling OpenAI API:', error.message);
    throw error;
  }
}
